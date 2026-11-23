// @ts-check
import { useMemo } from 'react'
import { useQuejas } from './useQuejas'
import { useGeo } from './useGeo'
import { nombreDeBarrio } from '../lib/formatters'
import { etiquetaDeContrato } from '../scraper/etiqueta-de-contrato'
import { usePlenos } from './usePlenos'
import { usePress } from './usePress'
import { useTenders, formatDate } from './useTenders'
import { useBdns } from './useBdns'
import { useParticipa } from './useParticipa'
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
 *   { kind, date, title, url, …los campos de su clase }
 *
 * La prensa trae `subtitle` y `shareText`, que son datos (el medio y el
 * titular). Las demás clases traen los CÓDIGOS (categoría, estado, clase de
 * sesión o de participación) y no sus rótulos: la página arma el subtítulo y
 * el texto para compartir en el idioma de la interfaz (`lib/cambios-rotulos.js`).
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
        // Los códigos, no sus rótulos: la página los rotula en el idioma de la
        // interfaz (`lib/cambios-rotulos.js`).
        id: q.service_request_id,
        categoria: q.service_code ?? null,
        barrio: q.address_string ? nombreDeBarrio(q.address_string, geo?.neighborhoods) : null,
        estado: q.status ?? null,
        descripcion: q.description ?? '',
        url: `/quejas/${q.service_request_id.toLowerCase()}`,
      })
    }

    // Plenos — new sessions.
    for (const p of plenos?.items || []) {
      if (!inWindow(p.date, cut)) continue
      out.push({
        kind: 'pleno',
        date: p.date,
        title: p.title,
        tipoSesion: p.kind ?? null,
        url: p.link,
        external: true,
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
      })
    }

    // BDNS — new subsidies.
    for (const b of bdns?.items || []) {
      if (!inWindow(b.date?.slice(0, 10), cut)) continue
      out.push({
        kind: 'subvencion',
        date: b.date.slice(0, 10),
        title: b.description,
        organo: b.organ ?? null,
        // Quién convoca (`bdns.ts`): sólo las propias son un acto del Ayuntamiento.
        direction: b.direction,
        url: b.sourceUrl,
        external: true,
      })
    }

    // Participa — new posts.
    for (const pi of participa?.items || []) {
      if (!inWindow(pi.date?.slice(0, 10), cut)) continue
      out.push({
        kind: 'participa',
        date: pi.date.slice(0, 10),
        title: pi.title,
        tipo: pi.kind ?? null,
        url: pi.link,
        external: true,
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
