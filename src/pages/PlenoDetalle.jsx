import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, Pill, SectionHead, ExtLink } from '../components/Primitives'
import Compartir from '../components/Compartir'
import { AgendaRow } from '../components/plenos/AgendaRow'
import { VoteTallyBar, DirectionLegend } from '../components/plenos/VoteTallyBar'
import { VoteBreakdownRetracted } from '../components/plenos/VoteBreakdownRetracted'
import { VoteBreakdownCorrected } from '../components/plenos/VoteBreakdownCorrected'
import { VoteProvenance } from '../components/plenos/VoteProvenance'
import { ResumenSesion } from '../components/plenos/ResumenSesion'
import DivisorLecturas from '../components/DivisorLecturas'
import { FindingCard } from '../components/PlenoFindings'
import { ClaimLedger } from '../components/ClaimLedger'
import { usePlenos, PLENO_TONE } from '../hooks/usePlenos'
import { usePlenoChunk, chunkExtraido } from '../hooks/usePlenoClaims'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { usePlenoVotes, OUTCOME_TONE } from '../hooks/usePlenoVotes'
import { usePlenoVideos, usePlenoVideosRegmeet, indexVideosByPleno } from '../hooks/usePlenoVideos'
import { usePlenoFindings } from '../hooks/usePlenoFindings'
import { fmtDateLong, fmtDateShort, rellena } from '../lib/formatters'
import { conHuecos } from '../lib/huecos'
import { breakdownNeedsCaveat, latestCorrection, VOTE_SOURCE_KINDS } from '../scraper/pleno-votes'
import { hallazgosPorTema } from '../scraper/hallazgos-por-tema'
import { rotuloDe, useLocale, useT } from '../i18n'
import { transcriptKind } from '../lib/transcript-kind.js'
import { cuentaCotejadas, desgloseCotejadas, entreParentesis } from '../lib/cotejo'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

function EmptyNote({ children }) {
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--soft)',
        borderRadius: 'var(--r-input)',
        fontSize: 'var(--fs-aux)',
        color: 'var(--ink50)',
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  )
}

/** At-a-glance tile in the summary strip. */
function Tile({ label, value, sub, tone }) {
  const color =
    tone === 'warn' ? 'var(--warn-ink)' : tone === 'crit' ? 'var(--crit-ink)' : 'var(--ink)'
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-card)',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-card)', fontWeight: 600, color, marginTop: 2 }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 1 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

/** Lazy transcript panel — fetches only when its tab is mounted. */
function TranscriptPanel({ plenoId }) {
  const t = useT()
  const [state, setState] = useState({ loading: true, text: null, missing: false })
  useEffect(() => {
    let alive = true
    fetch(`/data/pleno-transcripts/${plenoId}.txt`, { cache: 'no-cache' })
      .then(async (r) => {
        // A missing .txt falls through to the SPA index.html (HTTP 200, text/html)
        // on the dev server — don't render the page DOM as a "transcript".
        const ct = r.headers.get('content-type') || ''
        if (!r.ok || ct.includes('text/html')) throw new Error('missing')
        const text = await r.text()
        if (/^\s*<(!doctype|html)\b/i.test(text)) throw new Error('missing') // body guard
        return text
      })
      .then((text) => alive && setState({ loading: false, text, missing: false }))
      .catch(() => alive && setState({ loading: false, text: null, missing: true }))
    return () => {
      alive = false
    }
  }, [plenoId])
  if (state.loading) return <EmptyNote>{t('plenoDetail.transcriptLoading')}</EmptyNote>
  if (state.missing) return <EmptyNote>{t('plenoDetail.transcriptMissing')}</EmptyNote>
  const kind = transcriptKind(state.text)
  return (
    <>
      {/* 23 of 42 files here are acta text, not audio. Identical extension,
          identical line shape, identical tab — and a "verbatim" taken from an
          acta quotes the secretary's already-condensed minutes, not what a
          councillor said. Say which one the reader is looking at. */}
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          marginBottom: 8,
          lineHeight: 1.5,
        }}
      >
        {kind === 'acta'
          ? t('plenoDetail.transcriptActa')
          : kind === 'audio'
            ? t('plenoDetail.transcriptAudio')
            : null}
      </div>
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          fontSize: 'var(--fs-aux)',
          lineHeight: 1.6,
          color: 'var(--ink70)',
          background: 'var(--soft)',
          padding: 14,
          borderRadius: 'var(--r-card)',
          maxHeight: '64vh',
          overflow: 'auto',
          margin: 0,
        }}
      >
        {state.text}
      </pre>
    </>
  )
}

/**
 * La salvedad de un reparto por grupos, encima de su barra. Estaba al final de
 * la fila «Desglose» de las fuentes, en letra pequeña y detrás del enlace,
 * debajo de la barra que matiza: es lo que hace honesto el reparto y va con él
 * (auditoría de las dos lecturas, §10). La pregunta es la de `VoteProvenance`
 * (`breakdownNeedsCaveat`) y la nota, la de su clase de fuente: un reparto
 * del acta, o cotejado, no la lleva.
 */
function SalvedadDelReparto({ fuente }) {
  const t = useT()
  if (!breakdownNeedsCaveat(fuente)) return null
  const nota = rotuloDe(
    t,
    `pleno.fuenteVoto.${fuente.kind}.sinCotejar`,
    VOTE_SOURCE_KINDS[fuente.kind]?.unverifiedNote ?? '',
  )
  return (
    <p
      data-salvedad-reparto=""
      style={{
        margin: '0 0 6px',
        fontSize: 'var(--fs-aux)',
        color: 'var(--ink70)',
        lineHeight: 1.45,
      }}
    >
      {rellena(t('plenoDetail.voto.salvedadReparto'), { nota })}
    </p>
  )
}

/**
 * Una pieza de la línea del resumen: la clave del catálogo en singular o en plural
 * según `n`, con la cifra en negrita. Las dos claves se escriben enteras en cada uso,
 * que es como `tests/i18n-catalogue.test.ts` encuentra quién rellena sus huecos.
 */
function PiezaResumen({ n, uno, varios, huecos = {}, color = 'var(--ink)' }) {
  const t = useT()
  return conHuecos(t(n === 1 ? uno : varios), {
    '{n}': <strong style={{ color }}>{n}</strong>,
    ...huecos,
  })
}

/** Uppercase mono section label used inside the Resumen tab. */
function OLabel({ children }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: 'var(--fs-micro)',
        color: 'var(--ink50)',
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Los hallazgos de la sesión por tema (`hallazgosPorTema`): un rótulo por grupo
 * y debajo los hallazgos, pintados por quien llama. Sin ningún tema —el
 * fragmento de declaraciones aún no ha llegado, o ninguna de las que citan está
 * publicada—, la lista va seguida y sin rótulos: un único grupo «sin tema» no
 * ordenaría nada.
 *
 * `Rotulo` es el elemento del rótulo: un `h2` en la pestaña de hallazgos, donde
 * los grupos son lo que se lee; un `div` en el resumen, que ya tiene sus títulos.
 */
function GruposDeHallazgos({ grupos, Rotulo, gap, pinta }) {
  const t = useT()
  const lista = (hallazgos) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>{hallazgos.map(pinta)}</div>
  )
  if (!grupos.some((g) => g.tema !== null)) return lista(grupos.flatMap((g) => g.hallazgos))
  return (
    <div data-hallazgos-por-tema="" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 'var(--fs-aux)', color: 'var(--ink70)', lineHeight: 1.5 }}>
        {t('plenoDetail.hallazgos.porTema')}
      </p>
      {grupos.map((g) => (
        <div key={g.tema ?? '—'}>
          <Rotulo
            className="mono"
            style={{
              margin: '0 0 8px',
              fontSize: 'var(--fs-micro)',
              fontWeight: 700,
              color: 'var(--ink70)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            {g.tema === null
              ? t('plenoDetail.hallazgos.sinTema')
              : rotuloDe(t, `declaraciones.tema.${g.tema}`, g.tema)}{' '}
            · {g.hallazgos.length}
          </Rotulo>
          {lista(g.hallazgos)}
        </div>
      ))}
    </div>
  )
}

/** Las claves de cada gravedad, singular y plural, literales para el guard del catálogo. */
const GRAVEDADES = [
  ['critical', 'plenoDetail.hallazgos.critical.uno', 'plenoDetail.hallazgos.critical'],
  ['notable', 'plenoDetail.hallazgos.notable.uno', 'plenoDetail.hallazgos.notable'],
  [
    'informational',
    'plenoDetail.hallazgos.informational.uno',
    'plenoDetail.hallazgos.informational',
  ],
]

/**
 * Cuántos hallazgos hay de cada gravedad, en una frase: «Por su gravedad: 9
 * informativos.» La lista los llevaba todos con su píldora, y «Informativo»
 * delante de cada título se leía como un género y no como un grado; ahora la
 * píldora sólo marca los que no son informativos, y la cuenta de todos va aquí.
 */
function GravedadDeLosHallazgos({ hallazgos }) {
  const { t, locale } = useLocale()
  const partes = GRAVEDADES.map(([clave, uno, varios]) => {
    const n = hallazgos.filter((h) => h.severity === clave).length
    return n > 0 ? rellena(t(n === 1 ? uno : varios), { n }) : null
  }).filter(Boolean)
  if (partes.length === 0) return null
  return (
    <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
      {rellena(t('plenoDetail.hallazgos.gravedad'), {
        lista: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(partes),
      })}
    </p>
  )
}

/**
 * Cotejadas frente a sin contraste, en las declaraciones de la sesión. Sin
 * verde: «cotejadas» incluye las contradichas, y en verde se leía como respaldo.
 * La leyenda estaba escrita en castellano en el JSX y salía igual en valencià.
 */
function DeclMixBar({ items }) {
  const t = useT()
  const g = cuentaCotejadas(items).total
  const s = items.filter((it) => it.verification?.verdict === 'sin-datos').length
  if (g + s === 0) return null
  return (
    <div>
      <div
        style={{
          display: 'flex',
          height: 10,
          borderRadius: 'var(--r-pill)',
          overflow: 'hidden',
          background: 'var(--soft)',
        }}
      >
        {g > 0 && <div style={{ flex: g, background: 'var(--civic)' }} />}
        {s > 0 && <div style={{ flex: s, background: 'var(--ink50)' }} />}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 'var(--fs-micro)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 'var(--r-input)',
              background: 'var(--civic)',
            }}
          />
          <span style={{ color: 'var(--ink70)' }}>{t('plenoDetail.mix.cotejadas')}</span>
          <strong className="mono" style={{ color: 'var(--ink)' }}>
            {g}
          </strong>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 'var(--r-input)',
              background: 'var(--ink50)',
            }}
          />
          <span style={{ color: 'var(--ink70)' }}>{t('plenoDetail.mix.sinContraste')}</span>
          <strong className="mono" style={{ color: 'var(--ink)' }}>
            {s}
          </strong>
        </span>
      </div>
    </div>
  )
}

/** Las claves de las pestañas, en su orden: las que un ancla puede abrir. */
const PESTANAS = ['resumen', 'agenda', 'votos', 'declaraciones', 'hallazgos', 'transcripcion']

export default function PlenoDetalle() {
  const { locale, t } = useLocale()
  const { id } = useParams()
  const { data: plenosData, loading: plenosLoading } = usePlenos()
  const { data: chunk } = usePlenoChunk(id)
  const { data: agendasData } = usePlenoAgendas()
  const { data: votesData } = usePlenoVotes()
  const { data: findingsData } = usePlenoFindings()
  const { data: videosData } = usePlenoVideos()
  const { data: videosRegmeetData, loading: videosRegmeetLoading } = usePlenoVideosRegmeet()
  const [tab, setTab] = useState('resumen')
  // Una pestaña se abre también por su ancla, `#pestana-<clave>`: así enlazan las
  // tarjetas del resumen a la pestaña que lo demuestra, y un enlace de fuera
  // puede abrir una. Al pulsar una pestaña, un ancla de pestaña que ya no dice
  // lo abierto se quita sin navegar (replaceState no dispara hashchange): con
  // ella puesta, volver a pulsar el mismo enlace no cambiaría el ancla y no
  // abriría nada. No se escribe la de la pestaña pulsada: el ancla quedaría en
  // la dirección de la página para la siguiente vez que se monte.
  useEffect(() => {
    const lee = () => {
      const clave = /^#pestana-(\w+)$/.exec(window.location.hash)?.[1]
      if (clave && PESTANAS.includes(clave)) setTab(clave)
    }
    lee()
    window.addEventListener('hashchange', lee)
    return () => window.removeEventListener('hashchange', lee)
  }, [])
  const abrePestana = (clave) => {
    setTab(clave)
    if (/^#pestana-/.test(window.location.hash)) {
      const { pathname, search } = window.location
      window.history.replaceState(window.history.state, '', pathname + search)
    }
  }

  const pleno = useMemo(() => (plenosData?.items ?? []).find((p) => p.id === id), [plenosData, id])
  // «Pleno · Sesión de fecha …», como el HTML que escribe prerender-meta y el
  // botón de compartir.
  useDocumentTitle(pleno?.title ? `Pleno · ${pleno.title}` : null)
  const agenda = useMemo(
    () => (agendasData?.plenos ?? []).find((a) => a.id === id),
    [agendasData, id],
  )
  const votes = useMemo(
    () => (votesData?.items ?? []).filter((v) => v.plenoId === id),
    [votesData, id],
  )
  const findings = useMemo(
    () => (findingsData?.items ?? []).filter((f) => f.plenoId === id),
    [findingsData, id],
  )
  // Hasta que la instantánea de regmeet llega —o falta—, no se elige vídeo: «aún
  // no ha llegado» no es «regmeet no dice nada», y una sesión en la que las dos
  // fuentes discrepan pintaría mientras tanto la del canal.
  const video = useMemo(
    () =>
      videosRegmeetLoading
        ? undefined
        : indexVideosByPleno(videosData, plenosData, videosRegmeetData).get(id),
    [videosData, plenosData, videosRegmeetData, videosRegmeetLoading, id],
  )

  const agendaItems = agenda?.agenda ?? []
  // No record in plenos-agendas.json means the orden del día was never
  // ingested — regmeet blocks CI and goes down for stretches, so a session
  // can sit unfetched for weeks. That is NOT the same as a session that met
  // and resolved nothing, and rendering it as "0 puntos" asserted exactly
  // that about a real council meeting.
  const agendaKnown = agenda !== undefined
  const claimItems = useMemo(() => chunk?.items ?? [], [chunk])
  // Una sesión sin declaraciones extraídas no tiene fichero, y el hook resuelve ese
  // 404 a un fragmento vacío: `chunk` existe igual. «Extraída y sin nada» y «sin
  // extraer» sólo se distinguen por de dónde vino.
  const extraida = chunkExtraido(chunk)
  const cotejadas = useMemo(() => cuentaCotejadas(claimItems), [claimItems])
  const gruposDeHallazgos = useMemo(
    () => hallazgosPorTema(findings, claimItems),
    [findings, claimItems],
  )
  const groundedCount = cotejadas.total
  const aprobados = votes.filter((v) => v.outcome === 'aprobado').length

  if (plenosLoading) {
    return <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>…</div>
  }
  if (!pleno) {
    return (
      <div
        className="cp-page"
        data-no-resuelta
        style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}
      >
        <SectionHead as="h1" eyebrow="Plenos" title={t('plenoDetail.notFound')} />
        <Link to="/plenos" style={{ color: 'var(--civic)', fontSize: 'var(--fs-aux)' }}>
          {t('plenoDetail.back')}
        </Link>
      </div>
    )
  }

  const TABS = [
    { key: 'resumen', label: t('plenoDetail.summary'), count: null },
    {
      key: 'agenda',
      label: t('plenoDetail.agenda'),
      count: agendaKnown ? agendaItems.length : null,
    },
    // Una cifra en la pestaña afirma que se midió: sin votaciones transcritas, o sin
    // declaraciones extraídas y ningún hallazgo, no hay cero que dar. Es la regla del
    // orden del día de al lado, de las fichas del resumen y del índice de /plenos.
    {
      key: 'votos',
      label: t('plenoDetail.votes'),
      count: votes.length > 0 ? votes.length : null,
    },
    { key: 'declaraciones', label: t('plenoDetail.declarations'), count: groundedCount || null },
    {
      key: 'hallazgos',
      label: t('plenoDetail.findings'),
      count: findings.length > 0 ? findings.length : extraida ? 0 : null,
    },
    // Sin `data-pestana` (ver el botón): la revisión lectora pulsa las demás
    // para leerlas, y ésta no. Es el acta hablada, no prosa nuestra, y pesa lo
    // que la sesión entera.
    { key: 'transcripcion', label: t('plenoDetail.transcript'), count: null, lectora: false },
  ]

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 980, margin: '0 auto' }}>
      <Link
        to="/plenos"
        style={{ color: 'var(--civic)', fontSize: 'var(--fs-meta)', textDecoration: 'none' }}
      >
        {t('plenoDetail.back')}
      </Link>

      {/* Hero band */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginTop: 8,
          flexWrap: 'wrap',
        }}
      >
        <h1
          style={{
            fontSize: 'var(--fs-page)',
            fontWeight: 700,
            letterSpacing: '-.015em',
            margin: 0,
          }}
        >
          {fmtDateLong(pleno.date, locale)}
        </h1>
        <Pill tone={PLENO_TONE[pleno.kind] || 'ghost'} size="xs">
          {rotuloDe(t, `pleno.tipo.${pleno.kind}`, pleno.kind)}
        </Pill>
        {video && (
          <ExtLink
            href={video.url}
            title={video.title}
            className="mono"
            style={{ fontSize: 'var(--fs-meta)', color: 'var(--civic)' }}
          >
            {t('plenoDetail.video')} ↗
          </ExtLink>
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <Compartir titulo={`Pleno · ${pleno.title}`} />
      </div>

      {/* Sticky tab bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          display: 'flex',
          gap: 4,
          marginTop: 20,
          marginBottom: 18,
          borderBottom: '1px solid var(--border2)',
          overflowX: 'auto',
          background: 'var(--paper)',
        }}
      >
        {TABS.map((tb) => {
          const active = tab === tb.key
          return (
            <button
              key={tb.key}
              type="button"
              id={`pestana-${tb.key}`}
              onClick={() => abrePestana(tb.key)}
              // Las pestañas se montan al pulsarlas, así que una carga sólo ve
              // el resumen. `review:surfaces` las abre por este atributo, que no
              // cambia con el idioma (estado `pestanas`, reader-review.ts).
              data-pestana={tb.lectora === false ? undefined : tb.key}
              className="mono"
              style={{
                appearance: 'none',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? 'var(--civic)' : 'transparent'}`,
                color: active ? 'var(--ink)' : 'var(--ink50)',
                fontSize: 'var(--fs-meta)',
                fontWeight: active ? 700 : 500,
                padding: '10px 12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {tb.label}
              {tb.count != null && (
                <span
                  style={{
                    fontSize: 'var(--fs-micro)',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 'var(--r-pill)',
                    background: active ? 'var(--civic-soft)' : 'var(--soft)',
                    color: active ? 'var(--civic-ink)' : 'var(--ink50)',
                  }}
                >
                  {tb.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'resumen' && (
        <>
          {/* La lectura vecinal: la sesión en palabras llanas. Espera a las dos
              instantáneas (ver `ResumenSesion`). Lo que había antes en esta
              pestaña —la tira, la línea de cifras, las declaraciones y los
              hallazgos— sigue debajo del divisor. La barra de resultados y la
              lista de títulos literales se han ido: las votaciones van en su
              tarjeta, y los títulos, en su pestaña. */}
          {agendasData && votesData && <ResumenSesion agenda={agenda} votos={votes} />}
          <DivisorLecturas />
          <div
            id="pleno-cifras"
            style={{ display: 'flex', flexDirection: 'column', gap: 22, scrollMarginTop: 56 }}
          >
            {/* Tira de resumen. La rejilla vive en `.cp-pleno-fichas` (src/index.css)
               porque pasa de cuatro columnas a dos y a una según el ancho de la tira,
               y un `style` inline no admite esa consulta. */}
            <div className="cp-pleno-resumen">
              <div className="cp-pleno-fichas">
                <Tile
                  label={t('plenoDetail.agenda')}
                  value={agendaKnown ? agendaItems.length : '—'}
                  sub={agendaKnown ? undefined : t('plenoDetail.agendaPending')}
                />
                {/* «—» y no 0 para lo que nadie ha medido. Las votaciones se transcriben a
                   mano desde el acta y una sesión puede no tener ninguna transcrita: «0»
                   afirmaba que un pleno ordinario no votó nada, y seguro que votó. Las
                   declaraciones y los hallazgos, igual: de una sesión sin extraer no hay
                   cero que dar. La ficha del orden del día ya lo distinguía.
                   Con alguna transcrita, la nota dice «transcritas» y no las aprobadas:
                   «1» con «1 aprob.» es el mismo número que la revisión lectora del
                   04-10-2026 leyó en la línea del resumen como las votaciones de la sesión,
                   y se lee igual. Las aprobadas van en esa línea. */}
                <Tile
                  label={t('plenoDetail.votes')}
                  value={votes.length > 0 ? votes.length : '—'}
                  sub={t(
                    votes.length === 0
                      ? 'plenoDetail.votesPending'
                      : votes.length === 1
                        ? 'plenoDetail.votesTranscribed.uno'
                        : 'plenoDetail.votesTranscribed.varios',
                  )}
                />
                <Tile
                  label={t('plenoDetail.declarations')}
                  value={extraida ? groundedCount : '—'}
                  sub={
                    extraida
                      ? desgloseCotejadas(t, cotejadas) || undefined
                      : t('plenoDetail.extractionPending')
                  }
                />
                <Tile
                  label={t('plenoDetail.findings')}
                  value={findings.length > 0 || extraida ? findings.length : '—'}
                  sub={
                    findings.length > 0 || extraida ? undefined : t('plenoDetail.extractionPending')
                  }
                  tone={findings.length ? 'crit' : undefined}
                />
              </div>
            </div>

            {/* Cada cifra dice qué cuenta, con las palabras del índice de /plenos. «15
               puntos en el orden del día · 1 votaciones» se leía como que la sesión votó
               una sola cosa (revisión lectora del 04-10-2026, en 10yl550): son las que
               hemos transcrito, y ningún dato registra que estén todas, así que el aviso
               del índice va siempre detrás. Sin declaraciones extraídas no hay cero que
               dar: «sin extraer», como su ficha. */}
            <p
              style={{
                margin: 0,
                fontSize: 'var(--fs-aux)',
                color: 'var(--ink70)',
                lineHeight: 1.55,
              }}
            >
              {agendaKnown ? (
                <PiezaResumen
                  n={agendaItems.length}
                  uno="plenoDetail.line.agenda.uno"
                  varios="plenoDetail.line.agenda.varios"
                />
              ) : (
                <span>{t('plenoDetail.agendaPendingLong')}</span>
              )}
              {votes.length > 0 && (
                <>
                  {' · '}
                  <PiezaResumen
                    n={votes.length}
                    uno="plenoDetail.line.votes.uno"
                    varios="plenoDetail.line.votes.varios"
                    huecos={{
                      '{aprobadas}': rellena(
                        t(
                          aprobados === 1
                            ? 'plenoDetail.line.approved.uno'
                            : 'plenoDetail.line.approved.varios',
                        ),
                        { n: aprobados },
                      ),
                    }}
                  />
                </>
              )}
              {' · '}
              {extraida ? (
                <>
                  <PiezaResumen
                    n={groundedCount}
                    uno="plenoDetail.line.declarations.uno"
                    varios="plenoDetail.line.declarations.varios"
                  />
                  {/* «2 declaraciones contrastadas» se leía comprobadas siendo las dos
                    parciales: va detrás cuántas son de cada veredicto. */}
                  {entreParentesis(t, cotejadas)}
                </>
              ) : (
                t('plenoDetail.line.declarationsPending')
              )}
              {findings.length > 0 && (
                <>
                  {' · '}
                  <PiezaResumen
                    n={findings.length}
                    uno="plenoDetail.line.findings.uno"
                    varios="plenoDetail.line.findings.varios"
                    color="var(--crit-ink)"
                  />
                </>
              )}
              {'. '}
              {t('plenos.indice.lede.aviso')}
            </p>

            {claimItems.length > 0 && (
              <div>
                <OLabel>{t('plenoDetail.declarations')}</OLabel>
                <DeclMixBar items={claimItems} />
              </div>
            )}

            {findings.length > 0 && (
              <div>
                <OLabel>{t('plenoDetail.findings')}</OLabel>
                <GravedadDeLosHallazgos hallazgos={findings} />
                <GruposDeHallazgos
                  grupos={gruposDeHallazgos}
                  Rotulo="div"
                  gap={6}
                  pinta={(f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => abrePestana('hallazgos')}
                      style={{
                        textAlign: 'left',
                        appearance: 'none',
                        background: 'var(--soft)',
                        border: '1px solid var(--border2)',
                        borderRadius: 'var(--r-input)',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        gap: 8,
                        alignItems: 'baseline',
                      }}
                    >
                      {f.severity !== 'informational' && (
                        <Pill tone={f.severity === 'critical' ? 'crit' : 'warn'} size="xs">
                          {rotuloDe(t, `pleno.gravedad.${f.severity}`, f.severity)}
                        </Pill>
                      )}
                      <span
                        style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink)', fontWeight: 600 }}
                      >
                        {f.title}
                      </span>
                    </button>
                  )}
                />
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'agenda' &&
        (agendaItems.length > 0 ? (
          <Card>
            {agendaItems.map((it, i) => (
              <AgendaRow key={i} item={it} />
            ))}
          </Card>
        ) : (
          <EmptyNote>
            {agendaKnown ? t('plenoDetail.empty.agenda') : t('plenoDetail.empty.agendaPending')}
          </EmptyNote>
        ))}

      {tab === 'votos' &&
        (votes.length > 0 ? (
          <>
            <DirectionLegend />
            <Card>
              {votes.map((rec) => (
                <div
                  key={rec.id}
                  style={{ padding: '10px 0', borderTop: '1px dashed var(--border2)' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'baseline',
                      flexWrap: 'wrap',
                      marginBottom: 6,
                    }}
                  >
                    <span
                      className="mono"
                      style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                    >
                      {fmtDateShort(rec.plenoDate, locale)}
                    </span>
                    <Pill tone={OUTCOME_TONE[rec.outcome]} size="xs">
                      {rotuloDe(t, `pleno.desenlace.${rec.outcome}`, rec.outcome)}
                    </Pill>
                  </div>
                  <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, marginBottom: 8 }}>
                    {rec.itemNumber}. {rec.title}
                  </div>
                  {rec.votesRetracted ? (
                    <VoteBreakdownRetracted retraction={rec.votesRetracted} />
                  ) : (
                    <>
                      <SalvedadDelReparto fuente={rec.provenance?.breakdown} />
                      <VoteTallyBar tally={rec.votes} />
                      <VoteBreakdownCorrected
                        correction={votesData ? latestCorrection(votesData, rec.id) : null}
                      />
                    </>
                  )}
                  {/* This tab showed a tally with no citation at all — the
                      reader could not tell the outcome and the breakdown come
                      from two different sources, let alone which. */}
                  <VoteProvenance provenance={rec.provenance} salvedadArriba />
                </div>
              ))}
            </Card>
          </>
        ) : (
          <EmptyNote>{t('plenoDetail.empty.votes')}</EmptyNote>
        ))}

      {tab === 'declaraciones' && (
        <ClaimLedger
          items={claimItems}
          showSummary
          emptyHint={t('plenoDetail.empty.declarations')}
        />
      )}

      {tab === 'hallazgos' &&
        (findings.length > 0 ? (
          <GruposDeHallazgos
            grupos={gruposDeHallazgos}
            Rotulo="h2"
            gap={10}
            pinta={(f) => <FindingCard key={f.id} f={f} />}
          />
        ) : (
          <EmptyNote>{t('plenoDetail.empty.findings')}</EmptyNote>
        ))}

      {tab === 'transcripcion' && <TranscriptPanel plenoId={id} />}
    </div>
  )
}
