/**
 * /laboratorio/prensa — press fact-check laboratory.
 *
 * Fue `/laboratorio` hasta el 29-10-2026. El índice de la sección era este
 * experimento, así que quien entraba al «Laboratorio» no veía qué había dentro;
 * ahora `/laboratorio` es el índice (Laboratorio.jsx) y esto vive en su ruta,
 * tal cual (auditoría de las dos lecturas, §23).
 *
 * Three regions, single route:
 *
 *   1. Header + KPI strip (5 mono cells, 30-day rolling)
 *   2. News-card grid (filterable: outlet · verdict · date)
 *   3. Dashboard rail (outlet scoreboard + coverage gaps + recent
 *      findings + methodology footer)
 *
 * Loads 7 JSON snapshots via `usePressLab`. Renders honest empty-states
 * when any file is missing (e.g., first run with no LLM extraction yet).
 *
 * Touches NO other surface — landing, /cambios stay
 * visually identical. The page reads its own JSONs and renders
 * server-static-style: no LLM at runtime, no animations.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, MarcadoConHuecos, Pill, SectionHead, ExtLink } from '../components/Primitives'
import { usePressLab } from '../hooks/usePressLab'
import ClaimReviewJsonLd from '../components/ClaimReviewJsonLd'
import { BitacoraCorrecciones } from '../components/BitacoraCorrecciones'
import DataAsOf from '../components/DataAsOf'
import { fmtDateShort, rellena } from '../lib/formatters'
import { snippetDeEvidencia } from '../lib/crosschecked-status.js'
import { rotuloDe, useLocale, useT } from '../i18n'
import { conHuecos } from '../lib/huecos'
import { esFuenteOficial } from '../scraper/press-fuente-oficial'
import { esAnuncioClasificado } from '../scraper/press-clasificado'
import {
  pressLabSummary,
  fraseVeredictos,
  avisoSinVeredicto,
  VERDICT_LABEL,
  ESTADO_LABEL,
  estadoDeAfirmacion,
  textoLibroVacio,
  recuentoDeExtraccion,
  desenlaceVigente,
  resumenHallazgos,
  fraseFactcheck,
  puenteTablaMedios,
} from '../lib/press-lab'

const VERDICT_TONE = {
  verificado: 'ok',
  parcial: 'warn',
  contradicho: 'crit',
  'sin-datos': 'neutral',
  'no-cotejada': 'neutral',
  'promesa-repetida': 'civic',
}

function fmtDate(iso, idioma) {
  return fmtDateShort(iso, idioma) || '—'
}

/**
 * La pastilla de un veredicto en el idioma de la página. ESTADO_LABEL (press-lab.js)
 * guarda el castellano del catálogo; un veredicto sin clave se pinta crudo, como antes.
 */
const rotuloEstado = (t, v) => rotuloDe(t, `laboratorio.prensa.estado.${v}`, ESTADO_LABEL[v] || v)

function fmtNumber(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('es-ES').format(n)
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${Math.round(n * 100)}%`
}

function KPI({ label, value, hint }) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 140,
        padding: '12px 14px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink70)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {label}
      </div>
      <div className="mono" style={{ fontSize: 'var(--fs-card)', fontWeight: 600, marginTop: 4 }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

function VerdictMix({ counts }) {
  const t = useT()
  const entries = Object.entries(counts).filter(([, n]) => n > 0)
  if (entries.length === 0) {
    return (
      <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
        {t('laboratorio.prensa.sinCotejadas')}
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {entries.map(([v, n]) => (
        <Pill key={v} tone={VERDICT_TONE[v] || 'neutral'} size="xs">
          {n} {rotuloEstado(t, v)}
        </Pill>
      ))}
    </span>
  )
}

// Los indicadores, en su orden; su rótulo es `laboratorio.prensa.trust.<indicador>`.
const TRUST_INDICATORS = [
  'localCoverage',
  'datedArticle',
  'municipalSourceMatch',
  'corroboratedAcrossOutlets',
  'factualClaimsPresent',
]

// Qué quiere decir «sin comprobar» en cada indicador que puede no comprobarse
// (`laboratorio.prensa.trust.sinComprobar.<indicador>`). Una frase para todos decía,
// en «Cobertura cruzada», que no se habían cotejado datos municipales: el motivo de
// otro indicador.
const SIN_COMPROBAR = new Set([
  'municipalSourceMatch',
  'corroboratedAcrossOutlets',
  'factualClaimsPresent',
])

export function TrustIndicators({ indicators }) {
  const t = useT()
  if (!indicators) return null
  const entries = TRUST_INDICATORS.map((k) => [k, t(`laboratorio.prensa.trust.${k}`)])
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 8,
        fontSize: 'var(--fs-micro)',
      }}
    >
      {entries.map(([k, label]) => {
        // TRES estados, no dos. `null` es «no se llegó a comprobar», y se
        // pintaba con el mismo círculo vacío que «se comprobó y no cuadra» —
        // así el titular del agua (55,6 M€ / 17 años), del que el extractor no
        // sacó ninguna afirmación, salía marcado como si no coincidiera con
        // unos datos municipales donde ese contrato SÍ está.
        //
        // Y `null` cubre dos casos: que no se extrajera ninguna afirmación, o que
        // ninguna de las extraídas se cotejara contra un corpus
        // (`coincidenciaMunicipal`, en press-analytics.ts). El título decía sólo
        // lo primero, y en el segundo caso las afirmaciones están listadas justo
        // encima; dice lo que es cierto en los dos.
        const raw = indicators[k]
        const sinComprobar = raw === null || raw === undefined
        const on = !!raw
        const glifo = sinComprobar ? '–' : on ? '●' : '○'
        const titulo = sinComprobar
          ? rellena(t('laboratorio.prensa.trust.titulo.sinComprobar'), {
              indicador: label,
              motivo: t(
                SIN_COMPROBAR.has(k)
                  ? `laboratorio.prensa.trust.sinComprobar.${k}`
                  : 'laboratorio.prensa.trust.sinComprobar.otro',
              ),
            })
          : rellena(t('laboratorio.prensa.trust.titulo'), { indicador: label })
        return (
          <span
            key={k}
            title={titulo}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 7px',
              borderRadius: 'var(--r-card)',
              background: on ? 'var(--ok-soft)' : 'var(--soft)',
              // Inactive chips keep the muted --ink50 ink but DROP the extra
              // 0.7 opacity, which compounded the translucency down to a
              // 2.7:1 contrast against --soft. Full --ink50 is 5.2:1 (light) /
              // 8.2:1 (dark) — WCAG AA, still visibly muted vs the active state.
              color: on ? 'var(--ok-ink)' : 'var(--ink50)',
              // El estado sin comprobar se distingue del comprobado-en-negativo
              // por algo más que el glifo: en un chip de 11px un «–» y un «○» se
              // confunden de un vistazo.
              fontStyle: sinComprobar ? 'italic' : 'normal',
              // Con « · sin comprobar» el chip más largo («Afirmaciones
              // contrastables») pasa de los 272 px de la tarjeta a 320 px de
              // ancho: el chip tiene que poder partir su propio texto, no sólo
              // la fila partir entre chips (tests/e2e/mobile.spec.ts, rejillas).
              maxWidth: '100%',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 'var(--fs-micro)' }} aria-hidden="true">
              {glifo}
            </span>
            {label}
            {sinComprobar ? (
              <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                {t('laboratorio.prensa.trust.sinComprobar')}
              </span>
            ) : null}
          </span>
        )
      })}
    </div>
  )
}

// La frase de antes (`laboratorio.prensa.sinRegistroExtraccion`), para un
// press-claims-verified.json anterior a `extraccion`: sin el desenlace de cada artículo
// no se puede distinguir lo mirado de lo no mirado, y la página no lo adivina.
function ClaimLedger({ claims, textoVacio }) {
  const t = useT()
  if (!claims || claims.length === 0) {
    return (
      // Quién no las encontró, y que eso no prueba que no las haya.
      //
      // Decía «Sin afirmaciones contrastables identificadas en el titular», que
      // es una afirmación sobre EL TITULAR. Y el titular que lo destapó dice
      // «Riba-roja adjudica el contrato para el suministro de agua potable por
      // 55,6 millones para 17 años»: cifra, plazo y objeto, justo lo que esta
      // página contrasta contra los contratos de PLACSP. Lo que pasó es que el
      // extractor no sacó nada, que es un hecho sobre el extractor.
      //
      // Y sólo donde el extractor miró: la frase salía en toda tarjeta sin
      // afirmaciones, y la pasada de octubre de 2026 sólo había visto los titulares
      // del 7 al 9. Cada tarjeta dice ahora su desenlace (`textoLibroVacio`).
      <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
        {textoVacio ?? t('laboratorio.prensa.sinRegistroExtraccion')}
      </div>
    )
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
      {claims.slice(0, 4).map((row) => {
        const v = row.verification
        const c = row.claim
        const evidence = (v.evidence || [])[0]
        // «No cotejada» y «Sin registro» son dos cosas: una no se buscó en ningún
        // dato, la otra se buscó y no se encontró (`estadoDeAfirmacion`).
        const estado = estadoDeAfirmacion(row)
        return (
          <li key={c.id}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <Pill tone={VERDICT_TONE[estado] || 'neutral'} size="xs">
                {rotuloEstado(t, estado)}
              </Pill>
              {/* La cita es la del medio: literal, en su idioma. */}
              <span style={{ fontSize: 'var(--fs-aux)', lineHeight: 1.4 }}>«{c.verbatim}»</span>
            </div>
            {evidence && (
              <div
                style={{
                  marginTop: 4,
                  paddingLeft: 12,
                  fontSize: 'var(--fs-meta)',
                  color: 'var(--ink70)',
                }}
              >
                {/* El mismo snippet que las tarjetas de declaración: sin la cola
                    «estado:» y con la categoría del contrato por su rótulo, no
                    «· construction ·». Los dos rótulos, en el idioma de la página. */}
                ↳{' '}
                <span className="mono">
                  [{rotuloDe(t, `ledger.evidencia.${evidence.kind}`, evidence.kind)}]
                </span>{' '}
                {snippetDeEvidencia(evidence, t)}
              </div>
            )}
          </li>
        )
      })}
      {claims.length > 4 && (
        <li
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', paddingLeft: 4 }}
        >
          {rellena(t('laboratorio.prensa.masAfirmaciones'), { n: claims.length - 4 })}
        </li>
      )}
    </ul>
  )
}

function LabPressCard({ article, summary, claims, textoVacio, trust, triangulation, linkRot }) {
  const { t, locale } = useLocale()
  const claimRows = claims || []
  const counts = claimRows.reduce((acc, r) => {
    const estado = estadoDeAfirmacion(r)
    acc[estado] = (acc[estado] || 0) + 1
    return acc
  }, {})
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 6,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--civic)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            fontWeight: 700,
          }}
        >
          {article.source}
        </span>
        {/* 32 of the 67 cards on this page are the Ayuntamiento's own press
            releases. The landing feed badges them; this page did not, so the
            audited institution's PR was indistinguishable from Levante-EMV in
            the observatory that audits it. */}
        {article.orphan && (
          <span
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              padding: '1px 5px',
              borderRadius: 'var(--r-input)',
              background: 'var(--soft)',
              color: 'var(--ink50)',
              letterSpacing: '.06em',
            }}
            title={t('laboratorio.prensa.fueraDelFeed.title')}
          >
            {t('laboratorio.prensa.fueraDelFeed')}
          </span>
        )}
        {/* La misma regla que la tabla por medio y que el recuento de cobertura
            cruzada (press-fuente-oficial.ts). La bandera `official` de press.ts
            sólo la lleva el feed del Ayuntamiento de Riba-roja, y la nota del de
            Cheste salía sin marca. */}
        {esFuenteOficial(article) && (
          <span
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              padding: '1px 5px',
              borderRadius: 'var(--r-input)',
              background: 'var(--warn-soft)',
              color: 'var(--warn-ink)',
              letterSpacing: '.06em',
            }}
            title={t('laboratorio.prensa.oficial.title')}
          >
            {t('laboratorio.prensa.oficial')}
          </span>
        )}
        <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink70)' }}>
          {fmtDate(article.date, locale)}
        </span>
        <span style={{ flex: 1 }} />
        <VerdictMix counts={counts} />
      </div>
      <ExtLink
        href={article.link}
        style={{
          fontSize: 'var(--fs-head)',
          fontWeight: 600,
          lineHeight: 1.35,
          color: 'inherit',
          textDecoration: 'none',
          display: 'block',
        }}
      >
        {article.title}
      </ExtLink>
      {summary && (
        <>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink70)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              marginTop: 12,
            }}
          >
            {/* No curator reads these before publication — the pipeline writes
                and commits them unattended, so claiming review was false. */}
            {t('laboratorio.prensa.sintesis')}
          </div>
          {/* La síntesis la escribió el resumidor automático: se pinta como llegó. */}
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70)',
              lineHeight: 1.55,
            }}
          >
            {summary.summary}
          </p>
        </>
      )}
      <div style={{ marginTop: 12 }}>
        <ClaimLedger claims={claimRows} textoVacio={textoVacio} />
      </div>
      {trust && <TrustIndicators indicators={trust.indicators} />}
      {triangulation && triangulation.outlets.length >= 2 && (
        <div
          style={{
            marginTop: 10,
            padding: '6px 10px',
            background: 'var(--soft)',
            borderRadius: 'var(--r-input)',
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink70)',
          }}
        >
          {/* Decía también «· cifras divergen €45.000 (33 %)», y las dos cifras eran
              de una sola nota: el total y la parte del PSTD. El agrupado ya no
              compara cifras (press-analytics.ts, TriangulationCluster). */}
          {/* Sólo medios independientes: la nota de una administración que el
              periódico reproduce no es un segundo testigo, es la fuente. Se nombra
              aparte para que se vea de dónde salió la historia. */}
          {conHuecos(
            rellena(t('laboratorio.prensa.comparada'), { n: triangulation.outlets.length }),
            { '{medios}': <strong>{triangulation.outlets.join(' · ')}</strong> },
          )}
          {triangulation.fuentesOficiales?.length > 0 &&
            rellena(t('laboratorio.prensa.comparada.oficial'), {
              fuentes: triangulation.fuentesOficiales.join(' · '),
            })}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginTop: 10,
          fontSize: 'var(--fs-micro)',
        }}
      >
        <ExtLink
          href={article.link}
          style={{
            // `--crit` es RELLENO y esto es TEXTO: en oscuro daba 3,65:1 a 11 px
            // sobre el papel, por debajo del 4,5 de AA. Es la misma regla que
            // `Cobertura.jsx` ya escribe para `--ok`/`--warn`, y estuvo latente
            // mientras sólo hubo 4 enlaces muertos: la auditoría nocturna subió a
            // 19 y la puerta de contraste lo cazó a la primera.
            color: linkRot?.status === 'dead' ? 'var(--crit-ink)' : 'var(--civic)',
            textDecoration: 'underline',
          }}
          title={
            linkRot?.status === 'dead' ? t('laboratorio.prensa.original.muerto.title') : undefined
          }
        >
          {linkRot?.status === 'dead'
            ? t('laboratorio.prensa.original.muerto')
            : t('laboratorio.prensa.original')}
        </ExtLink>
        {linkRot?.archivedUrl && (
          <ExtLink
            href={linkRot.archivedUrl}
            style={{ color: 'var(--ink70)', textDecoration: 'underline' }}
            title={
              linkRot.archivedAt
                ? rellena(t('laboratorio.prensa.archivo.title'), {
                    fecha: linkRot.archivedAt.slice(0, 10),
                  })
                : t('laboratorio.prensa.archivo.title.sinFecha')
            }
          >
            🔗 Wayback ↗
          </ExtLink>
        )}
        {/* La plantilla `press-finding-response.yml` a la que apuntaba este enlace no ha
            existido nunca: el enlace llevaba a un formulario vacío de GitHub. La vía que
            sí existe, con correo y sin cuenta, es la del aviso legal. */}
        <a
          href="/aviso-legal#rectificacion"
          style={{ color: 'var(--civic)', textDecoration: 'underline' }}
        >
          {t('laboratorio.prensa.replica')}
        </a>
      </div>
    </Card>
  )
}

/**
 * Una fila por medio. «Verificado» es una COBERTURA —cuántas de sus
 * afirmaciones encontraron registro municipal que las confirmara— y el
 * divisor son sus afirmaciones, no sus artículos: el 22-09-2026 la fila del
 * Ayuntamiento decía «18 · 0 %» y el 0 % salía de 39 afirmaciones extraídas de
 * 5 de esos 18 artículos, las 39 «sin-datos». Un lector dividía entre la
 * columna de al lado. La tarjeta de KPI de arriba ya pone su divisor en el
 * pie; aquí va en la celda, y «fiabilidad» deja de nombrar una cobertura.
 *
 * Y el divisor son las COTEJADAS (`checkedClaims`), no todas: el 19-10-2026 la
 * fila del Ayuntamiento decía «0 de 26 afirm.» y 21 de esas 26 no se habían
 * buscado en ningún dato. Las que nadie cotejó van aparte, «21 sin cotejar».
 */
// Cuántas filas enseña la tabla antes de plegar el resto. Con `slice(0, 10)` y nada
// más, el 19-10-2026 escondía 5 de 15 medios sin decirlo.
const FILAS_DE_MEDIOS = 10

export function OutletScoreboard({ outlets, puente }) {
  const t = useT()
  const [todos, setTodos] = useState(false)
  const afirmaciones = (o) =>
    Object.values(o.verdictCounts ?? {}).reduce((acc, n) => acc + (Number(n) || 0), 0)
  const cotejadas = (o) => Number(o.checkedClaims) || 0
  if (!outlets || outlets.length === 0) {
    return (
      <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
        {t('laboratorio.prensa.medios.vacio')}
      </div>
    )
  }
  const visibles = todos ? outlets : outlets.slice(0, FILAS_DE_MEDIOS)
  const resto = outlets.slice(FILAS_DE_MEDIOS)
  const articulosDelResto = resto.reduce((s, o) => s + (Number(o.articleCount) || 0), 0)
  return (
    <>
      <table
        // `.cp-tabla-medios` (index.css) deja partir un nombre de medio en el
        // móvil: sin relleno lateral en las celdas, a 320 px la tabla no cabía.
        // Ni a la izquierda de las cifras: 8 px en tres columnas son 24 px de
        // suelo, y con ellos la tarjeta se salía en la CI a 320 px y con la barra
        // lateral hacia 855 px (#396), aunque aquí cupiera por un par de píxeles.
        className="cp-tabla-medios"
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-meta)' }}
        aria-label={t('laboratorio.prensa.medios.aria')}
      >
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--ink70)' }}>
            <th style={{ padding: '4px 0', fontWeight: 600 }}>
              {t('laboratorio.prensa.medios.col.medio')}
            </th>
            <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>
              {t('laboratorio.prensa.medios.col.articulos')}
            </th>
            <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>
              {t('laboratorio.prensa.medios.col.verificado')}
            </th>
            <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>
              {t('laboratorio.prensa.medios.col.discrepa')}
            </th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((o) => (
            <tr key={o.outlet} style={{ borderTop: '1px solid var(--border2)' }}>
              <td style={{ padding: '4px 0' }}>
                {o.outlet}
                {/* The largest "medio" in this table is the audited institution
                  itself. Ranking its own PR for reliability alongside
                  newsrooms, unlabelled, is the wrong comparison to invite. */}
                {esFuenteOficial({ source: o.outlet, sourceHost: o.outletHost }) && (
                  <span
                    className="mono"
                    style={{ marginLeft: 6, fontSize: 'var(--fs-micro)', color: 'var(--warn-ink)' }}
                    title={t('laboratorio.prensa.medios.oficial.title')}
                  >
                    {t('laboratorio.prensa.oficial')}
                  </span>
                )}
              </td>
              <td style={{ padding: '4px 0', textAlign: 'right' }} className="mono">
                {o.articleCount}
              </td>
              <td
                style={{ padding: '4px 0', textAlign: 'right', color: 'var(--ok-ink)' }}
                className="mono"
              >
                {fmtPct(o.verifiedRatio)}
                {/* El divisor, en la celda: entre qué se divide el porcentaje. */}
                {cotejadas(o) > 0 && (
                  <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                    {rellena(
                      t(
                        cotejadas(o) === 1
                          ? 'laboratorio.prensa.medios.cotejadas.una'
                          : 'laboratorio.prensa.medios.cotejadas',
                      ),
                      { v: o.verdictCounts?.verificado ?? 0, n: cotejadas(o) },
                    )}
                  </div>
                )}
                {/* Y lo que no divide: afirmaciones que nadie buscó en ningún dato. */}
                {afirmaciones(o) > cotejadas(o) && (
                  <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                    {rellena(t('laboratorio.prensa.medios.sinCotejar'), {
                      n: afirmaciones(o) - cotejadas(o),
                    })}
                  </div>
                )}
              </td>
              <td
                style={{ padding: '4px 0', textAlign: 'right', color: 'var(--crit-ink)' }}
                className="mono"
              >
                {fmtPct(o.contradictedRatio)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Fuera de la tabla a propósito: sus celdas no llevan relleno lateral
          (`.cp-tabla-medios`, #396), y una fila de pie con texto largo la ensancharía. */}
      {resto.length > 0 && (
        <div
          className="mono"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'baseline',
            marginTop: 6,
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
          }}
        >
          {!todos && (
            <span>
              {rellena(t('laboratorio.prensa.medios.resto'), {
                medios: rellena(
                  t(
                    resto.length === 1
                      ? 'laboratorio.prensa.medios.resto.medio.uno'
                      : 'laboratorio.prensa.medios.resto.medio',
                  ),
                  { n: resto.length },
                ),
                articulos: rellena(
                  t(
                    articulosDelResto === 1
                      ? 'laboratorio.prensa.n.articulo.uno'
                      : 'laboratorio.prensa.n.articulo',
                  ),
                  { n: articulosDelResto },
                ),
              })}
            </span>
          )}
          <button
            type="button"
            onClick={() => setTodos((v) => !v)}
            style={{
              padding: 0,
              border: 0,
              background: 'none',
              color: 'var(--civic)',
              textDecoration: 'underline',
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            {todos
              ? rellena(t('laboratorio.prensa.medios.verPrimeros'), { n: FILAS_DE_MEDIOS })
              : rellena(t('laboratorio.prensa.medios.verTodos'), { n: outlets.length })}
          </button>
        </div>
      )}
      {puente && (
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            lineHeight: 1.5,
          }}
        >
          {puente}
        </p>
      )}
    </>
  )
}

function FactCheckRail({ factcheck }) {
  const { t, locale } = useLocale()
  const items = factcheck?.items ?? []
  // Qué se consultó y qué salió, leído de factcheck.json (`fraseFactcheck`). Decía
  // siempre «Configurar GOOGLE_FACT_CHECK_API_KEY en .env para activar» con las tres
  // fuentes consultadas y 61 revisiones examinadas.
  const frase = (
    <div
      style={{
        fontSize: 'var(--fs-aux)',
        color: 'var(--ink50)',
        marginTop: 8,
        lineHeight: 1.55,
      }}
    >
      {fraseFactcheck(factcheck, t)}
      {factcheck?.generatedAt
        ? rellena(t('laboratorio.prensa.factcheck.ultima'), {
            fecha: fmtDate(factcheck.generatedAt, locale),
          })
        : null}
    </div>
  )
  if (items.length === 0) return frase
  return (
    <>
      {frase}
      <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {items.slice(0, 6).map((row) => {
          const tone = VERDICT_TONE[row.normalizedVerdict] || 'neutral'
          return (
            <li key={row.id} style={{ fontSize: 'var(--fs-aux)', lineHeight: 1.45 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                {/* El veredicto que escribió el verificador externo es suyo: dato. Sólo
                    cuando no trae ninguno se pinta el rótulo del nuestro. */}
                <Pill tone={tone} size="xs">
                  {row.verdict ||
                    rotuloDe(
                      t,
                      `laboratorio.prensa.estado.${row.normalizedVerdict}`,
                      VERDICT_LABEL[row.normalizedVerdict] || row.normalizedVerdict,
                    )}
                </Pill>
                <span
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-micro)',
                    color: 'var(--civic)',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    letterSpacing: '.06em',
                  }}
                >
                  {row.reviewerName}
                </span>
                <span
                  className="mono"
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                >
                  {row.reviewDate.slice(0, 10)}
                </span>
              </div>
              <ExtLink href={row.reviewUrl} style={{ color: 'inherit', textDecoration: 'none' }}>
                {row.reviewTitle}
              </ExtLink>
            </li>
          )
        })}
        {items.length > 6 && (
          <li className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            {rellena(t('laboratorio.prensa.factcheck.mas'), { n: items.length - 6 })}
          </li>
        )}
      </ul>
    </>
  )
}

/**
 * Cómo se decide que la prensa «sigue» algo, dicho en la tarjeta. La regla está en
 * `computeCoverageGaps` (press-analytics.ts): hasta el 19-10-2026 bastaba una palabra
 * suelta en la bolsa de todos los titulares, y cuatro de los cinco puntos «seguidos»
 * del pleno del 5-10-2026, y su única promesa, lo eran por casualidad. Las cifras
 * salen del informe.
 */
function MetodoLagunas({ stats, dias }) {
  const t = useT()
  if (!stats) return null
  const tramites = stats.tramitesExcluidos ?? 0
  const titulares = stats.titularesConsiderados
  const asuntos = stats.candidatesExamined
  const partes = [t('laboratorio.prensa.lagunas.regla')]
  if (typeof titulares === 'number' && typeof asuntos === 'number')
    partes.push(
      // Dice de qué universo salen: no son los «Titulares monitorizados» de arriba
      // (30 días, todos los medios), sino los de medios independientes de la ventana
      // de las lagunas, sin anuncios ni notas de una administración.
      rellena(t('laboratorio.prensa.lagunas.cruzados'), {
        titulares: rellena(
          t(titulares === 1 ? 'laboratorio.prensa.n.titular.uno' : 'laboratorio.prensa.n.titular'),
          { n: titulares },
        ),
        dias: dias ?? 14,
        asuntos: rellena(
          t(asuntos === 1 ? 'laboratorio.prensa.n.asunto.uno' : 'laboratorio.prensa.n.asunto'),
          { n: asuntos },
        ),
      }),
    )
  if (tramites > 0)
    partes.push(
      rellena(
        t(
          tramites === 1
            ? 'laboratorio.prensa.lagunas.tramites.uno'
            : 'laboratorio.prensa.lagunas.tramites',
        ),
        { n: tramites },
      ),
    )
  partes.push(t('laboratorio.prensa.lagunas.otrasPalabras'))
  return (
    <p
      style={{
        margin: '10px 0 0',
        fontSize: 'var(--fs-micro)',
        color: 'var(--ink50)',
        lineHeight: 1.5,
      }}
    >
      {partes.join(' ')}
    </p>
  )
}

function CoverageGaps({ items, stats, dias }) {
  const t = useT()
  if (!items || items.length === 0) {
    // "No gaps" and "nothing to compare" look identical from the item list
    // alone, and the second was being published as the first: with the newest
    // pleno and the newest promise both older than the 14-day window, every
    // candidate was skipped and the card still congratulated the local press.
    const examined = stats?.candidatesExamined
    return (
      <>
        <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
          {examined === 0
            ? t('laboratorio.prensa.lagunas.sinCandidatos')
            : t('laboratorio.prensa.lagunas.sinLagunas')}
        </div>
        {examined > 0 && <MetodoLagunas stats={stats} dias={dias} />}
      </>
    )
  }
  return (
    <>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
        {items.slice(0, 8).map((it) => (
          <li key={it.refId} style={{ fontSize: 'var(--fs-meta)' }}>
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink70)',
                textTransform: 'uppercase',
                marginRight: 6,
              }}
            >
              {it.kind === 'pleno-item'
                ? t('laboratorio.prensa.lagunas.pleno')
                : t('laboratorio.prensa.lagunas.promesa')}
            </span>
            {/* El punto del pleno o la promesa, con su texto: dato. */}
            <span style={{ color: 'var(--ink70)' }}>{it.label}</span>
          </li>
        ))}
        {items.length > 8 && (
          <li className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            {rellena(t('laboratorio.prensa.lagunas.mas'), { n: items.length - 8 })}
          </li>
        )}
      </ul>
      <MetodoLagunas stats={stats} dias={dias} />
    </>
  )
}

export default function LaboratorioPrensa() {
  const t = useT()
  const lab = usePressLab()
  const [outletFilter, setOutletFilter] = useState('all')
  const [verdictFilter, setVerdictFilter] = useState('all')

  const byArticleClaims = useMemo(() => {
    const m = new Map()
    for (const row of lab.verified) {
      const arr = m.get(row.claim.articleId)
      if (arr) arr.push(row)
      else m.set(row.claim.articleId, [row])
    }
    return m
  }, [lab.verified])

  // La fila del extractor de cada artículo —desenlace y huella con que se procesó—, o
  // `null` si el snapshot es anterior a que se guardara: entonces ni la frase por
  // tarjeta ni el recuento de la lista pueden decir qué se miró. La huella hace falta:
  // una fila de otro titular no vale para éste (`desenlaceVigente`).
  const filaPorArticulo = useMemo(
    () => (lab.extraccion ? new Map(lab.extraccion.map((a) => [a.articleId, a])) : null),
    [lab.extraccion],
  )

  const byArticleSummary = useMemo(() => {
    const m = new Map()
    for (const s of lab.summaries) m.set(s.articleId, s)
    return m
  }, [lab.summaries])

  const byArticleTrust = useMemo(() => {
    const m = new Map()
    for (const a of lab.trust?.articles ?? []) m.set(a.articleId, a)
    return m
  }, [lab.trust])

  // A triangulation cluster spans several articles (the same story across
  // outlets), each with its OWN fingerprint — so map every member articleId to
  // the cluster and look it up by the article's id, not its fingerprint.
  const byArticleTriangulation = useMemo(() => {
    const m = new Map()
    for (const c of lab.triangulation?.clusters ?? [])
      for (const id of c.articleIds ?? []) m.set(id, c)
    return m
  }, [lab.triangulation])

  const outletsForFilter = useMemo(() => {
    const set = new Set()
    for (const p of lab.press) if (!esAnuncioClasificado(p)) set.add(p.source)
    return Array.from(set).sort()
  }, [lab.press])

  const summary = useMemo(
    () => pressLabSummary({ press: lab.press, verified: lab.verified }),
    [lab.press, lab.verified],
  )
  const aviso = avisoSinVeredicto(summary, t)
  const hallazgos = useMemo(() => resumenHallazgos(lab.findings), [lab.findings])

  // Se filtra la MISMA lista que cuenta `summary.monitoredCount` —la del feed más
  // las tarjetas FUERA DEL FEED, con una sola ventana—, así que el contador de
  // abajo no puede poner más tarjetas que su total. Con dos listas decía «46 de 45»
  // (ver `articulosDeLaVentana` en src/lib/press-lab.js).
  const visible = useMemo(
    () =>
      summary.articulos
        .filter((p) => outletFilter === 'all' || p.source === outletFilter)
        .filter((p) => {
          if (verdictFilter === 'all') return true
          const claims = byArticleClaims.get(p.id) || []
          return claims.some((c) => estadoDeAfirmacion(c) === verdictFilter)
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    [summary, outletFilter, verdictFilter, byArticleClaims],
  )

  const recuento = useMemo(
    () =>
      filaPorArticulo ? recuentoDeExtraccion(visible, byArticleClaims, filaPorArticulo) : null,
    [visible, byArticleClaims, filaPorArticulo],
  )

  if (lab.loading) {
    return (
      <div className="cp-page" style={{ padding: 24, color: 'var(--ink50)' }}>
        {t('laboratorio.prensa.cargando')}
      </div>
    )
  }

  // `null`, no 0, si el fichero no llega: `fmtNumber` lo pinta «—». Un cero aquí
  // diría que se miró y no hay ninguna.
  const triangulated3Plus = lab.triangulation?.stats?.triangulated3Plus ?? null

  return (
    <div
      // `cp-lab-marco`: la página es la caja cuyo ancho decide si la rejilla de
      // abajo va a dos columnas o a una (src/index.css, `.cp-lab-grid`).
      className="cp-page cp-lab-marco"
      style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}
    >
      <div style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink70)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {t('laboratorio.prensa.eyebrow')}
        </div>
        <h1
          style={{
            fontSize: 'var(--fs-page)',
            fontWeight: 700,
            letterSpacing: '-.015em',
            margin: '2px 0 6px',
          }}
        >
          {t('laboratorio.prensa.titulo')}
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            lineHeight: 1.55,
            maxWidth: 820,
          }}
        >
          {/* Decía «Cada titular … se contrasta», que describe el PROCESO pero
              se lee como el RESULTADO, justo encima de una tasa de
              verificación del 3 %. Se intenta con todos, y cuántas llegan a un
              veredicto lo dice una frase que sale del mismo recuento que las
              tasas: escrita a mano, decía «la mayoría» encima de «0 de 64»
              (revisión lectora, 15-09-2026).
              Decía también «plenos» en la lista: el verificador de prensa nunca los consultó. */}
          {conHuecos(t('laboratorio.prensa.intro'), {
            '{veredictos}': fraseVeredictos(summary, t),
            '{trust}': (
              <a
                href="https://thetrustproject.org/"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--civic)', textDecoration: 'underline' }}
              >
                Trust Project
              </a>
            ),
            '{bellingcat}': (
              <a
                href="https://www.bellingcat.com/category/resources/how-tos/"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--civic)', textDecoration: 'underline' }}
              >
                Bellingcat
              </a>
            ),
          })}
        </p>
        <div style={{ marginTop: 10 }}>
          <DataAsOf
            iso={lab.generatedAt}
            label={t('laboratorio.prensa.datos')}
            file="press-claims-verified.json"
          />
        </div>
        {/* Los demás experimentos los presenta el índice del laboratorio; aquí
            basta con decir que éste es uno de ellos y cómo volver. */}
        <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
          {conHuecos(t('laboratorio.prensa.experimento'), {
            '{laboratorio}': (
              <Link
                to="/laboratorio"
                style={{ color: 'var(--civic)', textDecoration: 'underline' }}
              >
                {t('laboratorio.prensa.experimento.enlace')}
              </Link>
            ),
          })}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {/* Cuenta las tarjetas de la lista, también las FUERA DEL FEED, y lo dice
            cuando hay alguna: es el mismo total que el contador de la lista. Con
            espacios que no parten, porque en una caja de 158 px se leía «1 fuera
            del / feed». */}
        <KPI
          label={t('laboratorio.prensa.kpi.monitorizados')}
          value={fmtNumber(summary.monitoredCount)}
          hint={
            summary.fueraDelFeedCount > 0
              ? rellena(t('laboratorio.prensa.kpi.ventana.fuera'), {
                  n: fmtNumber(summary.fueraDelFeedCount),
                })
              : t('laboratorio.prensa.kpi.ventana')
          }
        />
        <KPI
          label={t('laboratorio.prensa.kpi.auditados')}
          value={fmtNumber(summary.auditedCount)}
          hint={t('laboratorio.prensa.kpi.auditados.pie')}
        />
        <KPI
          label={t('laboratorio.prensa.kpi.verificacion')}
          value={fmtPct(summary.verificadoRatio)}
          hint={rellena(t('laboratorio.prensa.kpi.verificacion.pie'), {
            v: summary.verificadoClaims,
            n: summary.totalClaims,
          })}
        />
        {/* El pie dice ENTRE QUÉ se divide. Decía «de 36 claims» cuando el
            divisor real era 1 —las 36 son el corpus, no lo examinado—, y así
            «0 %» se leía «hemos mirado 36 y ninguna falla». */}
        <KPI
          label={t('laboratorio.prensa.kpi.discrepancia')}
          value={fmtPct(summary.contradichoRatio)}
          hint={rellena(t('laboratorio.prensa.kpi.discrepancia.pie'), {
            c: summary.contradichoClaims,
            n: summary.resueltasClaims,
          })}
        />
        {/* Decía sólo «historias en ≥3 medios», y su 0 se leía «ninguna noticia ha
            salido en tres medios». El 21-10-2026 la Ofrena al Túria salió en Periòdic
            (en valencià), Valenciabonita y Levante-EMV, y el agrupado por título
            (`clusterArticlesByStory`) no la vio: la cifra cuenta lo que ese agrupado
            reconoce. Cada fila ya lo decía en «Cobertura cruzada»; la cifra, no. */}
        <KPI
          label={t('laboratorio.prensa.kpi.triangulacion')}
          value={fmtNumber(triangulated3Plus)}
          hint={t('laboratorio.prensa.kpi.triangulacion.pie')}
        />
        {/* Decía «Hallazgos editoriales 17 · curados»: las 17 filas eran del curador
            automático, de 5 lotes repetidos (`resumenHallazgos`). Cuenta lotes, y
            dice quién los firmó. */}
        {hallazgos.humanos > 0 ? (
          <KPI
            label={t('laboratorio.prensa.kpi.editoriales')}
            value={fmtNumber(hallazgos.humanos)}
            hint={
              hallazgos.automaticos > 0
                ? rellena(t('laboratorio.prensa.kpi.editoriales.pie.auto'), {
                    n: fmtNumber(hallazgos.automaticos),
                  })
                : t('laboratorio.prensa.kpi.editoriales.pie')
            }
          />
        ) : (
          <KPI
            label={t('laboratorio.prensa.kpi.automaticos')}
            value={fmtNumber(hallazgos.automaticos)}
            hint={rellena(t('laboratorio.prensa.kpi.automaticos.pie'), {
              n: fmtNumber(hallazgos.publicaciones),
            })}
          />
        )}
      </div>

      {aviso && lab.press.length > 0 && (
        <div
          role="status"
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            border: '1px solid var(--border2)',
            background: 'var(--warn-soft)',
            borderRadius: 'var(--r-input)',
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: 'var(--warn-ink)' }}>{aviso.titulo}</strong> {aviso.texto}{' '}
          {t('laboratorio.prensa.cadencia')}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 14,
          fontSize: 'var(--fs-meta)',
        }}
      >
        {/* Un <select> mide lo que su opción más larga, y los medios llegan cada
            noche: desde el 04-11-2026 está «Federación de Ajedrez de la Comunidad
            Valenciana – FACV», y el filtro empujaba la página a 419 px en un móvil
            de 375. Se encoge con la fila; la opción entera sigue en la lista. */}
        <label
          style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0, maxWidth: '100%' }}
        >
          {t('laboratorio.prensa.filtro.medio')}{' '}
          <select
            aria-label={t('laboratorio.prensa.filtro.medio.aria')}
            value={outletFilter}
            onChange={(e) => setOutletFilter(e.target.value)}
            style={{
              minWidth: 0,
              maxWidth: '100%',
              padding: '4px 8px',
              border: '1px solid var(--border2)',
              borderRadius: 'var(--r-input)',
              background: 'var(--paper)',
              color: 'var(--ink)',
            }}
          >
            <option value="all">{t('laboratorio.prensa.filtro.todos')}</option>
            {/* Los nombres de los medios, como los escribe cada medio: dato. */}
            {outletsForFilter.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {t('laboratorio.prensa.filtro.veredicto')}{' '}
          <select
            aria-label={t('laboratorio.prensa.filtro.veredicto.aria')}
            value={verdictFilter}
            onChange={(e) => setVerdictFilter(e.target.value)}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--border2)',
              borderRadius: 'var(--r-input)',
              background: 'var(--paper)',
              color: 'var(--ink)',
            }}
          >
            <option value="all">{t('laboratorio.prensa.filtro.todos')}</option>
            {['verificado', 'parcial', 'contradicho', 'sin-datos', 'no-cotejada'].map((v) => (
              <option key={v} value={v}>
                {rotuloEstado(t, v)}
              </option>
            ))}
          </select>
        </label>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            {rellena(t('laboratorio.prensa.contador'), {
              v: visible.length,
              n: summary.monitoredCount,
            })}
          </span>
          {/* Qué hizo el extractor con las tarjetas que se ven: las tres casillas suman
              el numerador de arriba (`recuentoDeExtraccion`). Sin el desenlace de cada
              artículo —un snapshot anterior— no se pinta: no hay con qué contarlo. */}
          {recuento && (
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
            >
              {rellena(t('laboratorio.prensa.recuento'), {
                con: recuento.con,
                descartados: recuento.descartados,
                pendientes: recuento.pendientes,
              })}
            </div>
          )}
        </div>
      </div>

      <div
        // La rejilla entera vive en src/index.css y no en un `style`: un estilo
        // inline no admite consultas de contenedor, y dos columnas o una lo
        // decide el ancho de la página, no el de la ventana.
        className="cp-lab-grid"
      >
        <div style={{ display: 'grid', gap: 12 }}>
          {visible.length === 0 && (
            <Card>
              {/* Respondía con cuatro órdenes «si acabas de instalar el laboratorio»,
                  y le echaba la culpa al filtro también cuando no había ninguno
                  puesto y la ventana se había quedado sin titulares. */}
              <SectionHead
                eyebrow={t('laboratorio.prensa.vacio.eyebrow')}
                title={
                  outletFilter !== 'all' || verdictFilter !== 'all'
                    ? t('laboratorio.prensa.vacio.filtro')
                    : rellena(t('laboratorio.prensa.vacio.ventana'), { n: summary.windowDays })
                }
              />
              <p style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)', marginTop: 6 }}>
                {outletFilter !== 'all' || verdictFilter !== 'all'
                  ? t('laboratorio.prensa.vacio.prueba')
                  : ''}
                {t('laboratorio.prensa.cadencia')}
              </p>
            </Card>
          )}
          {visible.map((article) => (
            <LabPressCard
              key={article.id}
              article={article}
              summary={byArticleSummary.get(article.id)}
              claims={byArticleClaims.get(article.id)}
              textoVacio={
                filaPorArticulo
                  ? textoLibroVacio(desenlaceVigente(article, filaPorArticulo.get(article.id)), t)
                  : null
              }
              trust={byArticleTrust.get(article.id)}
              triangulation={byArticleTriangulation.get(article.id)}
              linkRot={lab.linkRot?.get(article.link) ?? null}
            />
          ))}
        </div>

        <aside style={{ display: 'grid', gap: 14, position: 'sticky', top: 24 }}>
          <Card>
            <SectionHead
              eyebrow={t('laboratorio.prensa.medios.eyebrow')}
              title={t('laboratorio.prensa.medios.titulo')}
            />
            <div style={{ marginTop: 8 }}>
              <OutletScoreboard
                outlets={lab.trust?.outlets ?? []}
                puente={
                  lab.trust?.outlets?.length
                    ? puenteTablaMedios(lab.trust.outlets, summary, t)
                    : null
                }
              />
            </div>
          </Card>

          <Card>
            <SectionHead
              eyebrow={t('laboratorio.prensa.lagunas.eyebrow')}
              title={t('laboratorio.prensa.lagunas.titulo')}
            />
            <div style={{ marginTop: 8 }}>
              <CoverageGaps
                items={lab.gaps?.items ?? []}
                stats={lab.gaps?.stats}
                dias={lab.gaps?.windowDays}
              />
            </div>
          </Card>

          <Card>
            <SectionHead
              eyebrow={t('laboratorio.prensa.factcheck.eyebrow')}
              title={t('laboratorio.prensa.factcheck.titulo')}
            />
            <FactCheckRail factcheck={lab.factcheck} />
          </Card>

          {hallazgos.lotes.length > 0 && (
            <Card>
              {/* Un lote por fila, el más reciente: el curador automático volvía a
                  publicar el mismo lote cada vez que corría, y la columna enseñaba el
                  de Nerco cuatro veces en cinco filas (`resumenHallazgos`). */}
              <SectionHead
                eyebrow={
                  hallazgos.humanos > 0
                    ? t('laboratorio.prensa.kpi.editoriales')
                    : t('laboratorio.prensa.kpi.automaticos')
                }
                title={
                  hallazgos.humanos > 0
                    ? `${rellena(
                        t(
                          hallazgos.humanos === 1
                            ? 'laboratorio.prensa.hallazgos.firmados.uno'
                            : 'laboratorio.prensa.hallazgos.firmados',
                        ),
                        { n: hallazgos.humanos },
                      )} · ${rellena(
                        t(
                          hallazgos.automaticos === 1
                            ? 'laboratorio.prensa.hallazgos.automaticos.uno'
                            : 'laboratorio.prensa.hallazgos.automaticos',
                        ),
                        { n: hallazgos.automaticos },
                      )}`
                    : rellena(
                        t(
                          hallazgos.lotes.length === 1
                            ? 'laboratorio.prensa.hallazgos.lotes.uno'
                            : 'laboratorio.prensa.hallazgos.lotes',
                        ),
                        { n: hallazgos.lotes.length },
                      )
                }
              />
              <ul
                style={{
                  margin: '8px 0 0',
                  padding: 0,
                  listStyle: 'none',
                  display: 'grid',
                  gap: 8,
                }}
              >
                {hallazgos.lotes
                  .slice(0, 5)
                  .map(({ finding: f, automatico, veces, primera, correcciones }) => (
                    <li key={f.id} style={{ fontSize: 'var(--fs-meta)' }}>
                      <ClaimReviewJsonLd finding={f} />
                      <span
                        className="mono"
                        style={{
                          fontSize: 'var(--fs-micro)',
                          color: 'var(--ink70)',
                          marginRight: 6,
                        }}
                      >
                        {f.publishedAt}
                      </span>
                      {f.title}
                      <div
                        className="mono"
                        style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
                      >
                        {automatico
                          ? t('laboratorio.prensa.hallazgos.automatico')
                          : t('laboratorio.prensa.hallazgos.firmado')}
                        {veces > 1
                          ? rellena(t('laboratorio.prensa.hallazgos.veces'), {
                              n: veces,
                              fecha: primera,
                            })
                          : ''}
                      </div>
                      <BitacoraCorrecciones correcciones={correcciones} />
                    </li>
                  ))}
                {hallazgos.lotes.length > 5 && (
                  <li
                    className="mono"
                    style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                  >
                    {rellena(t('laboratorio.prensa.hallazgos.mas'), {
                      n: hallazgos.lotes.length - 5,
                    })}
                  </li>
                )}
              </ul>
            </Card>
          )}

          <div
            style={{
              padding: 12,
              background: 'var(--soft)',
              borderRadius: 'var(--r-input)',
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70)',
              lineHeight: 1.55,
            }}
          >
            <MarcadoConHuecos
              texto={t('laboratorio.prensa.politica')}
              estilo={{ color: 'var(--ink)' }}
              huecos={{
                '{enlace}': (
                  <a
                    href="/metodologia#laboratorio-prensa"
                    style={{ color: 'var(--civic)', textDecoration: 'underline' }}
                  >
                    {t('laboratorio.prensa.politica.enlace')}
                  </a>
                ),
              }}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
