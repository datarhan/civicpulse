// @ts-check
import { useMemo } from 'react'
import { useQuejas, CATEGORY_LABEL, STATE_LABEL } from './useQuejas'
import { useGeo } from './useGeo'
import { entero, nombreDeBarrio } from '../lib/formatters'
import { etiquetaDeContrato } from '../scraper/etiqueta-de-contrato'
import { usePlenos } from './usePlenos'
import { usePress } from './usePress'
import { useTenders, formatDate } from './useTenders'
import { useBdns } from './useBdns'
import { useParticipa, KIND_LABEL } from './useParticipa'
import { isCommittedContract, importeAdjudicado } from '../lib/contract-status.js'
import { diaDeLaSede } from '../scraper/queja-router'
import { sinAnunciosClasificados } from '../scraper/press-clasificado'
import { agruparPorNoticia } from '../scraper/prensa-por-noticia'

/**
 * Hook that aggregates "what changed" across every real-data corpus into a
 * single sorted list of events.
 *
 * NOT a network fetch — the roadmap originally proposed a nightly
 * compute-cambios.ts, but every item already carries a date field, so the
 * simplest correct implementation is just filtering each corpus's items by
 * a rolling window and merging the result. Zero extra infrastructure, zero
 * stale-snapshot risk.
 *
 * Events shape:
 *   { kind, date, title, subtitle, url, canonicalPath, shareText }
 *
 * Returns:
 *   { loading, changes, byKind, prensaPorNoticia, fuentes, totalCount, windowDays }
 *
 * `prensaPorNoticia` is the press card's rows, `{ principal, piezas }` events
 * (`agruparPorNoticia`); `changes` and `byKind.prensa` hold one event per
 * story, its row's headline.
 */

const DEFAULT_WINDOW_DAYS = 7

function inWindow(iso, cutoffIso) {
  if (!iso) return false
  return iso >= cutoffIso
}

function cutoff(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Una pieza de press.json como evento de /cambios. */
function eventoDePrensa(it) {
  return {
    kind: 'prensa',
    id: it.id,
    date: it.date.slice(0, 10),
    title: it.title,
    subtitle: it.source || it.sourceHost,
    // El anfitrión, para que «En una frase» cuente aparte la web municipal.
    origen: it.sourceHost ?? null,
    url: it.link,
    external: true,
    shareText: `"${it.title}" — ${it.source || ''} (${it.date.slice(0, 10)})`,
  }
}

export function useCambios(days = DEFAULT_WINDOW_DAYS) {
  const { data: quejas, loading: qL, error: qE } = useQuejas()
  const { data: plenos, loading: pL, error: pE } = usePlenos()
  const { data: press, loading: prL, error: prE } = usePress()
  const { data: tenders, loading: tL, error: tE } = useTenders()
  const { data: bdns, loading: bL, error: bE } = useBdns()
  const { data: participa, loading: paL, error: paE } = useParticipa()
  // Sólo para escribir el barrio de una queja con su nombre de OSM. No entra en
  // `loading`: sin geo.json el barrio cae en el slug capitalizado, no se calla.
  const { data: geo } = useGeo()

  const loading = qL || pL || prL || tL || bL || paL

  // La prensa de la ventana, sin los anuncios de un portal inmobiliario: un piso
  // en venta de Fotocasa no es una noticia, y la frase lo contaba como una. Es el
  // mismo filtro que aplica /laboratorio (`sinAnunciosClasificados`).
  const prensaEnVentana = useMemo(() => {
    const cut = cutoff(days)
    const items = /** @type {any[]} */ (press?.items || [])
    return sinAnunciosClasificados(items).filter((it) => inWindow(it.date?.slice(0, 10), cut))
  }, [press, days])

  // La prensa, una noticia por fila: la misma en dos medios, o en castellano y
  // en valenciano, contaba y salía dos veces (`agruparPorNoticia`). La noticia es
  // la unidad de toda la página —la frase, la cabecera de la tarjeta, «Y N más»
  // y el total—, y la fila dice «En 2 sitios» cuando junta piezas. Contando
  // piezas, la frase decía «Hay 13 noticias» junto a una tarjeta de once.
  const prensaPorNoticia = useMemo(
    () =>
      agruparPorNoticia(prensaEnVentana).map((g) => ({
        principal: eventoDePrensa(g.principal),
        piezas: g.piezas.map(eventoDePrensa),
      })),
    [prensaEnVentana],
  )

  const changes = useMemo(() => {
    const cut = cutoff(days)
    const out = []

    // Quejas — only non-deleted, recent. Exporter already filters deleted rows
    // (bot/src/db/queries.ts softDelete guard), so snapshot never has them.
    for (const q of quejas?.items || []) {
      // El día de la sede. `slice(0, 10)` daba el de UTC: lo enviado entre la
      // medianoche y las 02:00 de Riba-roja caía el día anterior, y en el borde,
      // fuera de la ventana.
      const dia = diaDeLaSede(q.requested_datetime)
      if (!inWindow(dia, cut)) continue
      out.push({
        kind: 'queja',
        date: dia,
        title: (q.description || '').split('\n')[0].slice(0, 120),
        subtitle: [
          CATEGORY_LABEL[q.service_code] || q.service_code,
          q.address_string ? nombreDeBarrio(q.address_string, geo?.neighborhoods) : null,
          STATE_LABEL[q.status] || q.status,
        ]
          .filter(Boolean)
          .join(' · '),
        url: `/quejas/${q.service_request_id.toLowerCase()}`,
        shareText: `Queja ${q.service_request_id} · ${CATEGORY_LABEL[q.service_code] || q.service_code}\n${(q.description || '').slice(0, 160)}`,
      })
    }

    // Plenos — new sessions.
    for (const p of plenos?.items || []) {
      if (!inWindow(p.date, cut)) continue
      out.push({
        kind: 'pleno',
        date: p.date,
        title: p.title,
        subtitle: p.kind ? `Sesión ${p.kind}` : 'Sesión municipal',
        url: p.link,
        external: true,
        shareText: `${p.title} — ${p.date}`,
      })
    }

    // Press — Google News aggregation: una noticia, con el titular de su fila.
    for (const g of prensaPorNoticia) out.push(g.principal)

    // Tenders — new adjudications (awardDate fresh).
    for (const c of tenders?.contracts || []) {
      if (!inWindow(c.awardDate, cut)) continue
      // A void/abandoned/revoked award is not news of an adjudication. Latent
      // today (none of the 32 contracts in the last 90 days is cancelled) but
      // the feed would have announced one as if it stood. Same predicate the
      // money totals use, so "adjudicado" means one thing across the site.
      if (!isCommittedContract(c)) continue
      // Lo adjudicado sin IVA (PLACSP), o null si la fila no lo publica: nunca un
      // cero (`importeAdjudicado`). La tarjeta lo escribe como el resto del
      // sitio, «14.984 € sin IVA», y no «€14.984,46».
      const importe = importeAdjudicado(c)
      // Qué es, en una línea; el título oficial va debajo si la etiqueta dice
      // menos (`etiquetaDeContrato`). El órgano no se pinta: en los 814
      // contratos publicados es el propio Ayuntamiento.
      const { etiqueta, recortada } = etiquetaDeContrato(c.title)
      out.push({
        kind: 'licitacion',
        date: c.awardDate,
        title: etiqueta || c.title,
        tituloOficial: recortada ? c.title : null,
        importe,
        adjudicataria: c.assignee ?? null,
        url: c.permalink,
        external: true,
        shareText: `Contrato adjudicado · ${etiqueta || c.title}${
          importe != null ? ` · ${entero(Math.round(importe))} € sin IVA` : ''
        }`,
      })
    }

    // BDNS — new subsidies.
    for (const b of bdns?.items || []) {
      if (!inWindow(b.date?.slice(0, 10), cut)) continue
      out.push({
        kind: 'subvencion',
        date: b.date.slice(0, 10),
        title: b.description,
        subtitle: b.organ,
        // Quién convoca (`bdns.ts`): sólo las propias son un acto del Ayuntamiento.
        direction: b.direction,
        url: b.sourceUrl,
        external: true,
        shareText: `Subvención · ${b.description}`,
      })
    }

    // Participa — new posts.
    for (const pi of participa?.items || []) {
      if (!inWindow(pi.date?.slice(0, 10), cut)) continue
      out.push({
        kind: 'participa',
        date: pi.date.slice(0, 10),
        title: pi.title,
        subtitle: KIND_LABEL[pi.kind] || pi.kind,
        url: pi.link,
        external: true,
        shareText: `${KIND_LABEL[pi.kind] || 'Participación'} · ${pi.title}`,
      })
    }

    out.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return out
  }, [quejas, plenos, prensaPorNoticia, tenders, bdns, participa, geo, days])

  const byKind = useMemo(() => {
    const m = {}
    for (const c of changes) {
      if (!m[c.kind]) m[c.kind] = []
      m[c.kind].push(c)
    }
    return m
  }, [changes])

  // De qué copia sale cada clase, y si se pudo leer: «En una frase» no dice
  // «no consta» de una fuente atrasada o caída (`fraseDeLaSemana`).
  const fuentes = useMemo(() => {
    const f = (fichero, data, error) => ({
      fichero,
      generatedAt: data?.generatedAt ?? null,
      leida: !error && data != null,
    })
    return {
      queja: f('quejas.json', quejas, qE),
      pleno: f('plenos.json', plenos, pE),
      prensa: f('press.json', press, prE),
      licitacion: f('tenders.json', tenders, tE),
      subvencion: f('bdns.json', bdns, bE),
      participa: f('participa.json', participa, paE),
    }
  }, [quejas, plenos, press, tenders, bdns, participa, qE, pE, prE, tE, bE, paE])

  return {
    loading,
    changes,
    byKind,
    prensaPorNoticia,
    fuentes,
    totalCount: changes.length,
    windowDays: days,
    formatDate,
  }
}

export const KIND_LABEL_ES = {
  queja: 'Queja ciudadana',
  pleno: 'Pleno municipal',
  prensa: 'Prensa',
  licitacion: 'Contrato adjudicado',
  subvencion: 'Subvención',
  participa: 'Participación ciudadana',
}

export const KIND_TONE = {
  queja: 'warn',
  pleno: 'civic',
  prensa: 'neutral',
  licitacion: 'intel',
  subvencion: 'ok',
  participa: 'ok',
}
