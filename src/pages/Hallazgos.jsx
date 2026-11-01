import { useMemo, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import {
  Card,
  Pill,
  ExtLink,
  Quote,
  EvidenceBand,
  PartyTag,
  Marcado,
} from '../components/Primitives'
import ClaimReviewJsonLd from '../components/ClaimReviewJsonLd'
import DataAsOf from '../components/DataAsOf'
// One RefList, not two. It was duplicated verbatim here and in PlenoFindings,
// so a heading fixed on one surface silently left the other one lying.
//
// Y la misma lección otra vez, el 2026-08-29: el componente estaba compartido
// pero la LLAMADA no, así que sacar el vídeo del pleno de los documentos
// cotejados en FindingCard dejó esta página —la que el lector abre— enseñándolo
// igual. Ahora se comparte la banda entera, `ListaDeCotejos`.
import { ListaDeCotejos, CitasDeLaFicha, codigoDeFicha } from '../components/PlenoFindings'
import { usePlenoFindings, SEVERITY_TONE } from '../hooks/usePlenoFindings'
import { useFindingQuoteProvenance, provenanceFor } from '../hooks/useFindingQuoteProvenance'
import { authorshipBreakdown } from '../scraper/finding-authorship'
import { PARTY_TONE } from '../hooks/usePromises'
import { usePlenoClaims } from '../hooks/usePlenoClaims'
import { findingMatchesArea } from '../lib/finding-area'
import { contarHallazgos, pasaFiltros } from '../lib/hallazgos-filtros'
import { DEPARTMENT_LABEL } from '../scraper/departments'
import { rotuloDe, useLocale, useT } from '../i18n'
import { partePorHueco, rellena } from '../lib/formatters'
import { BitacoraCorrecciones } from '../components/BitacoraCorrecciones'
import { EFICIENCIA_ENABLED } from '../flags'

function MiniStat({ label, value, tone }) {
  const color =
    tone === 'warn' ? 'var(--warn-ink)' : tone === 'crit' ? 'var(--crit-ink)' : 'var(--ink)'
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
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
        style={{ fontSize: 'var(--fs-head)', fontWeight: 600, color, marginTop: 2 }}
      >
        {value}
      </div>
    </div>
  )
}

/**
 * Exportada sólo para que una prueba pueda renderizar la ficha REAL de
 * /hallazgos, no una imitación. Es la superficie con más citas del sitio y la
 * que un lector abre desde un permalink; que la marca de procedencia salga
 * aquí no puede quedar cubierto por el hecho de que salga en FindingCard.
 */
export function FindingDetailCard({ f, permalink, nivelTitulo: Titulo = 'div' }) {
  // Which transcript each of this finding's verbatims actually comes from. One
  // fetch per session for the whole page — the snapshot store single-flights it
  // — and the marker itself lives in PlenoFindings so /plenos/:id renders the
  // same thing. The RefList duplication taught this lesson already: a fix on one
  // of two copies leaves the other one lying.
  const t = useT()
  const { data: provenance } = useFindingQuoteProvenance()
  const prov = provenanceFor(provenance, f.id)
  // El nombre de la ficha: lo imprime el enlace permanente y lo repiten la nota
  // de las citas, el pie de cada hueco, la banda de cotejos y cada fila de cita
  // de la bitácora, porque los números de cita son por ficha y la de al lado
  // tiene los mismos (`codigoDeFicha`, en PlenoFindings.jsx).
  const ficha = codigoDeFicha(f.id)
  return (
    <Card id={f.id} style={{ scrollMarginTop: 24 }}>
      <ClaimReviewJsonLd finding={f} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <Pill tone={SEVERITY_TONE[f.severity] || 'neutral'} size="xs">
          {rotuloDe(t, `pleno.gravedad.${f.severity}`, f.severity)}
        </Pill>
        <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          {rellena(t('findings.detalle.cabecera'), {
            fecha: f.plenoDate,
            pleno: f.plenoId,
            editor: f.curatorName,
          })}
        </span>
        <a
          href={permalink}
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--fs-micro)',
            color: 'var(--civic)',
            textDecoration: 'none',
          }}
          title={t('findings.detalle.enlace.title')}
        >
          {/* Decía «#{f.id.slice(-12)}» —«#1-acu-a870a4», con el último dígito
              del día delante—. Ahora es el nombre con que la nota y la banda de
              cotejos hablan de esta ficha, junto a «pleno 10yl550». */}
          {rellena(t('findings.detalle.enlace'), { ficha })}
        </a>
      </div>
      {/* `h1` en /hallazgos/:id, donde la ficha ES la página; en la lista sigue
          siendo un bloque, y el `h1` de la página es el de la lista. */}
      <Titulo style={{ fontSize: 'var(--fs-head)', fontWeight: 600, lineHeight: 1.35, margin: 0 }}>
        {f.title}
      </Titulo>
      {f.individualSpeaker && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 6,
            padding: '3px 8px',
            background: 'var(--soft)',
            borderRadius: 'var(--r-card)',
            fontSize: 'var(--fs-micro)',
          }}
          title={t('findings.detalle.individual.title')}
        >
          <PartyTag
            tone={PARTY_TONE[f.individualSpeaker.party]}
            style={{
              fontSize: 'var(--fs-micro)',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
            }}
          >
            {f.individualSpeaker.party}
          </PartyTag>
          <span>{f.individualSpeaker.name}</span>
        </div>
      )}
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70)',
          marginTop: 8,
          lineHeight: 1.55,
        }}
      >
        {f.summary}
      </p>
      {/* §08: tres bandas, numeradas, siempre en este orden. El material ya
          estaba en la ficha y en esta secuencia; lo que faltaba era que se
          distinguiera lo que alguien DIJO de lo que está COMPROBADO. */}
      <EvidenceBand n={1} title={t('findings.detalle.banda.dicho')}>
        {f.quotes?.length > 0 ? (
          // Numeradas, con la nota que dice de qué números habla: el reparto
          // entre cita impresa y hueco vive en `CitasDeLaFicha`, compartido con
          // /plenos/:id.
          <CitasDeLaFicha
            quotes={f.quotes}
            prov={prov}
            curatorName={f.curatorName}
            colorDeGrupo
            ficha={ficha}
          />
        ) : (
          <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
            {t('findings.detalle.sinLiterales')}
          </div>
        )}
      </EvidenceBand>

      <EvidenceBand n={2} title={t('findings.detalle.banda.cotejo')}>
        {f.crossChecked?.length || f.contradiction?.length ? (
          <>
            <ListaDeCotejos
              crossChecked={f.crossChecked}
              contradiction={f.contradiction}
              plenoDate={f.plenoDate}
              ficha={ficha}
            />
          </>
        ) : (
          // Describe el REGISTRO, no el mundo. `pleno-findings.json` no separa
          // «se cotejó y no salió nada» de «no se cotejó», así que decir «sin
          // rastro» aquí sería fabricar un veredicto con un dato que no existe.
          <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
            {t('findings.detalle.sinCotejos')}
          </div>
        )}
      </EvidenceBand>

      <EvidenceBand n={3} title={t('findings.detalle.banda.replica')}>
        {f.response ? (
          <div
            style={{
              padding: '8px 10px',
              background: 'var(--soft)',
              borderRadius: 'var(--r-card)',
              fontSize: 'var(--fs-aux)',
              lineHeight: 1.5,
              color: 'var(--ink)',
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'var(--ink50)',
                marginBottom: 4,
                fontWeight: 700,
              }}
            >
              {rellena(t('findings.card.replica'), {
                grupo: f.response.from,
                fecha: f.response.respondedAt,
              })}
            </div>
            <Quote text={f.response.quote} attribution={f.response.from} />
            {f.response.sourceUrl && (
              <div style={{ marginTop: 4 }}>
                <ExtLink
                  href={f.response.sourceUrl}
                  style={{
                    fontSize: 'var(--fs-micro)',
                    color: 'var(--civic)',
                    textDecoration: 'none',
                  }}
                >
                  {t('findings.detalle.replica.fuente')}
                </ExtLink>
              </div>
            )}
          </div>
        ) : (
          <ReplicaAbierta publishedAt={f.publishedAt} />
        )}
      </EvidenceBand>
      <BitacoraCorrecciones correcciones={f.corrections} ficha={ficha} />
    </Card>
  )
}

/** La banda de réplica de una ficha que nadie ha contestado: el enlace, en su sitio. */
function ReplicaAbierta({ publishedAt }) {
  const t = useT()
  const [antes, despues] = partePorHueco(
    rellena(t('findings.detalle.replica.abierta'), { fecha: publishedAt }),
    '{enlace}',
  )
  return (
    <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
      {antes}
      <a
        href="/aviso-legal#rectificacion"
        style={{ color: 'var(--civic)', textDecoration: 'underline' }}
      >
        /aviso-legal
      </a>
      {despues}
    </div>
  )
}

/**
 * Findings withdrawn from publication.
 *
 * A retraction that leaves no trace is indistinguishable from a page that was
 * never published, which is how a site quietly edits its own record. So the
 * gap is stated: how many, from which session, on what date, signed, and why.
 *
 * What it deliberately does NOT show is the withdrawn text. These are
 * retracted because the editorial gate withheld every quote in them — an
 * accusation about a named political group that no record supports — so
 * reprinting it here would restore exactly the publication the retraction
 * removed. The snapshot holds a digest for that reason (see
 * `finding-retraction.ts`); there is nothing here to render even if the page
 * wanted to.
 */
function RetractionLedger({ retractions }) {
  const t = useT()
  if (!retractions?.length) return null
  const ordered = [...retractions].sort((a, b) => b.retractedAt.localeCompare(a.retractedAt))
  const [huellaAntes, huellaDespues] = partePorHueco(
    t('hallazgos.lista.retirados.texto'),
    '{sha256}',
  )
  return (
    <section
      style={{
        marginTop: 30,
        padding: 14,
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-input)',
        fontSize: 'var(--fs-aux)',
        color: 'var(--ink70)',
        lineHeight: 1.55,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {rellena(t('hallazgos.lista.retirados.titulo'), { n: ordered.length })}
      </div>
      {/* Decía «se retiraron porque ninguna de sus citas superaba la puerta editorial»: la causa
          de las once del 2026-08-11, y no la de 66709b (10-10) ni la de 543cc1 y 3fd230 (11-10),
          que tenían citas visibles. Cada retirada dice la suya en su motivo. */}
      <p style={{ margin: '0 0 10px' }}>
        {huellaAntes}
        <span className="mono">sha256</span>
        {huellaDespues}
      </p>
      <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
        {ordered.map((r) => (
          <li key={r.findingId}>
            <RetiradaDatos r={r} />
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * Una retirada tal como se publica: identificador, sesión, fecha, firma,
 * recuentos, huella y motivo. Nunca el texto retirado (ver arriba).
 *
 * La usan dos superficies —este registro y la página propia de un hallazgo
 * retirado, `/hallazgos/:id`— y por eso vive en un sitio: un enlace compartido
 * antes de la retirada lleva a esta huella, y las dos tienen que decir lo mismo.
 */
export function RetiradaDatos({ r }) {
  const t = useT()
  return (
    <>
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 2 }}
      >
        {rellena(t('findings.retirada.cabecera'), {
          id: r.findingId,
          fecha: r.plenoDate,
          retirado: r.retractedAt.slice(0, 10),
          editor: r.editor,
        })}
      </div>
      <div>
        {rellena(t('findings.retirada.recuento'), {
          citas: r.quoteCount,
          documentos: r.crossCheckedCount,
        })}{' '}
        <span className="mono" style={{ color: 'var(--ink50)' }}>
          {r.digest}
        </span>
      </div>
      <div style={{ marginTop: 2, fontSize: 'var(--fs-micro)' }}>
        {rellena(t('findings.retirada.motivo'), { motivo: r.reason })}
      </div>
    </>
  )
}

function Chip({ active, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mono"
      style={{
        padding: '4px 10px',
        borderRadius: 'var(--r-card)',
        fontSize: 'var(--fs-micro)',
        fontWeight: 600,
        letterSpacing: '.02em',
        border: '1px solid ' + (active ? 'var(--civic)' : 'var(--border2)'),
        background: active ? 'var(--civic-soft)' : 'var(--paper)',
        color: active ? 'var(--civic)' : 'var(--ink50)',
        cursor: 'pointer',
      }}
    >
      {label}
      {typeof count === 'number' && (
        <span
          style={{
            marginLeft: 6,
            fontSize: 'var(--fs-micro)',
            color: active ? 'var(--civic)' : 'var(--ink50)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

/** La caja en la que la lista dice por qué no pinta ninguna ficha. */
const AVISO_DE_LISTA = {
  padding: 16,
  background: 'var(--soft)',
  borderRadius: 'var(--r-input)',
  fontSize: 'var(--fs-aux)',
  color: 'var(--ink50)',
  lineHeight: 1.5,
}

/**
 * Los hallazgos agrupados por pleno, del más reciente al más antiguo, en el
 * orden en que la lista los pinta. Exportada para que una prueba sepa qué
 * fichas quedan contiguas en la página sin recitar el orden
 * (tests/components/fichas-contiguas.test.jsx).
 *
 * @template {{ plenoDate: string }} F
 * @param {F[]} hallazgos
 * @returns {[string, F[]][]}
 */
export function agruparPorPleno(hallazgos) {
  const g = new Map()
  for (const f of hallazgos) {
    if (!g.has(f.plenoDate)) g.set(f.plenoDate, [])
    g.get(f.plenoDate).push(f)
  }
  return [...g.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}

/**
 * Los hallazgos que pasan los filtros, agrupados por pleno del más reciente al
 * más antiguo. `hayPublicados` separa «ninguno coincide» de «no hay ninguno»:
 * con la lista filtrada vacía, sólo el total publicado sabe cuál de las dos es.
 */
function ListaDeHallazgos({ hallazgos, hayPublicados }) {
  const t = useT()
  const groups = useMemo(() => agruparPorPleno(hallazgos), [hallazgos])

  if (groups.length === 0) {
    return (
      <div style={AVISO_DE_LISTA}>
        {t(hayPublicados ? 'hallazgos.lista.ninguno' : 'hallazgos.lista.vacia')}
      </div>
    )
  }
  return groups.map(([date, list]) => (
    <section key={date} style={{ marginBottom: 24 }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {rellena(t('hallazgos.lista.pleno'), { fecha: date })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((f) => (
          <FindingDetailCard key={f.id} f={f} permalink={`/hallazgos/${f.id}`} />
        ))}
      </div>
    </section>
  ))
}

/**
 * La lista con `?area=`. Un hallazgo no lleva área: se la dan los temas de las
 * declaraciones que cita, así que filtrar por área necesita el corpus entero
 * (índice y todos sus fragmentos, unos 7 MB medidos el 29-09-2026). El hook
 * vive aquí porque un hook no se puede saltar: mientras la página lo llamaba,
 * /hallazgos sin área descargaba el corpus para no leerlo.
 * tests/components/hallazgos-corpus.test.jsx cuenta lo que pide cada caso.
 */
function ListaDelArea({ area, hallazgos, hayPublicados }) {
  const t = useT()
  const { loading, error, data: claims } = usePlenoClaims()
  const delArea = useMemo(
    () => hallazgos.filter((f) => findingMatchesArea(f, area, claims)),
    [hallazgos, area, claims],
  )
  // Sin el corpus no se sabe qué hallazgos son del área, y la lista vacía diría
  // «Ninguno coincide con los filtros actuales.», que es falso: mientras llega,
  // dice que carga; si no llega, qué falló, como hace la página con sus datos.
  if (loading) return <div style={AVISO_DE_LISTA}>{t('common.loading')}</div>
  if (error) {
    return <div style={{ ...AVISO_DE_LISTA, color: 'var(--crit-ink)' }}>{error.message}</div>
  }
  return <ListaDeHallazgos hallazgos={delArea} hayPublicados={hayPublicados} />
}

/** Las negritas de los párrafos atenuados de la lista, en tinta plena. */
const TINTA = { color: 'var(--ink)' }

export default function Hallazgos() {
  const { locale, t } = useLocale()
  const location = useLocation()
  const { loading, error, data } = usePlenoFindings()
  const [severityFilter, setSeverityFilter] = useState(null)
  const [speakerFilter, setSpeakerFilter] = useState(null)
  const [plenoFilter, setPlenoFilter] = useState(null)
  // Área arrives in the URL so a councillor's page can deep-link here. The
  // findings themselves carry no department: the link runs
  // finding → sourceClaimIds → claim.topic → department, reusing the same
  // mapping /departamentos uses, so both surfaces agree on what an área means.
  const areaFilter = new URLSearchParams(location.search).get('area')
  // Read for the page-level figure only; each card fetches its own rows from
  // the same session-cached snapshot.
  const { data: provenanceSnapshot } = useFindingQuoteProvenance()
  const provStats = provenanceSnapshot?.stats ?? null
  // The gate axis of the same snapshot. Null until it loads, and the paragraph
  // below simply does not render — a figure from a half-loaded snapshot about
  // how many published accusations are uncontrasted would be worse than none.
  const gateStats = provenanceSnapshot?.contraste?.stats ?? null

  const items = useMemo(() => data?.items ?? [], [data])

  // Who actually wrote these, counted from the snapshot at render time rather
  // than typed into the prose below. `/metodologia` reads its figure the same
  // way for the same reason: a number written into a page goes false on its own
  // the next time the auto-curator runs, and nobody edits a page to notice.
  // Null while the snapshot is empty or still loading — the fallback prose says
  // «la mayoría», which is true either way, and a figure from a half-loaded
  // snapshot would be worse than no figure.
  const authorship = useMemo(() => (items.length > 0 ? authorshipBreakdown(items) : null), [items])

  // Contar y filtrar salen del MISMO módulo (`lib/hallazgos-filtros.js`), que
  // es lo que impide que se les vuelva a ir la unidad: vivían en dos `useMemo`
  // separados y el chip de GRUPO acabó contando CITAS mientras su propio filtro
  // seleccionaba HALLAZGOS. Ver la cabecera de ese fichero.
  const counts = useMemo(() => contarHallazgos(items), [items])

  // El de área no va aquí: lo aplica `ListaDelArea`, que es la única que pide
  // el corpus de declaraciones.
  const filtered = useMemo(
    () =>
      items.filter((f) =>
        pasaFiltros(f, {
          severidad: severityFilter,
          grupo: speakerFilter,
          pleno: plenoFilter,
        }),
      ),
    [items, severityFilter, speakerFilter, plenoFilter],
  )

  if (loading) {
    return (
      <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>
        {t('common.loading')}
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ padding: 32, color: 'var(--crit-ink)', fontSize: 'var(--fs-aux)' }}>
        {error.message}
      </div>
    )
  }

  // Las frases del catálogo que envuelven un enlace se parten por su hueco
  // (`partePorHueco`): cada idioma pone el enlace donde su gramática lo pide.
  const [eficienciaAntes, eficienciaDespues] = partePorHueco(
    t('hallazgos.lista.eficiencia'),
    '{enlace}',
  )
  const [comoAntes, comoDespues] = partePorHueco(
    rellena(t('hallazgos.lista.como.texto'), {
      cuantas: authorship
        ? rellena(t('hallazgos.lista.como.cuantas'), {
            total: authorship.total,
            maquina: authorship.machine,
          })
        : '',
    }),
    '{enlace}',
  )
  const [transcripcionesAntes, transcripcionesDespues] = provStats
    ? partePorHueco(
        rellena(t('hallazgos.lista.transcripciones'), {
          quotes: provStats.quotes,
          enVigente: provStats.enVigente,
          soloEnSustituida: provStats.soloEnSustituida,
          sinDeterminar: provStats.sinDeterminar,
        }),
        '{enlace}',
      )
    : ['', '']
  const [contrasteAntes, contrasteDespues] = gateStats?.porContraste
    ? partePorHueco(
        rellena(t('hallazgos.lista.contraste'), {
          citasConClaim: gateStats.citasConClaim,
          shown: gateStats.porContraste.shown,
          toggle: gateStats.porContraste.toggle,
          hidden: gateStats.porContraste.hidden,
        }),
        '{enlace}',
      )
    : ['', '']

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Deep-linked from a councillor's page. Says plainly that the filter is
          an ÁREA, not a person — findings name political groups, never
          individuals, and arriving here from someone's profile must not blur
          that. */}
      {areaFilter && DEPARTMENT_LABEL[areaFilter] && (
        <Card style={{ marginBottom: 16, background: 'var(--soft)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span
              className="mono"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', letterSpacing: '.06em' }}
            >
              {t('hallazgos.area.filtered')}
            </span>
            <strong style={{ fontSize: 'var(--fs-body)' }}>
              {DEPARTMENT_LABEL[areaFilter][locale] ?? DEPARTMENT_LABEL[areaFilter].es}
            </strong>
            <Link to="/hallazgos" style={{ fontSize: 'var(--fs-meta)', color: 'var(--civic)' }}>
              {t('hallazgos.area.clear')}
            </Link>
          </div>
          <div
            style={{
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink50)',
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            {t('hallazgos.area.note')}
          </div>
        </Card>
      )}
      <div style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {/* §00, principio 2: «lo que redacta un proceso automático lo dice en
              la cabecera, ANTES de que el lector llegue al titular». Aquí ponía
              «Verificación editorial», que promete justo lo contrario —revisión
              humana— sobre una página en la que 40 de las 41 fichas las escribe
              auto-curation-v1. La divulgación existía, pero 250 líneas más
              abajo, en el pie legal: para cuando el lector la encuentra ya ha
              leído los hallazgos.

              La cifra se DERIVA del snapshot, igual que la del pie: una escrita
              a mano se vuelve falsa sola la próxima vez que corra el
              auto-curador. Mientras carga se queda la etiqueta neutra, que no
              afirma ni lo uno ni lo otro. Lo cazó `review:surfaces`. */}
          {authorship && authorship.machine > 0
            ? rellena(t('hallazgos.lista.cabecera.automatica'), {
                maquina: authorship.machine,
                total: authorship.total,
              })
            : t('hallazgo.cabecera.editorial')}
        </div>
        <h1
          style={{
            fontSize: 'var(--fs-page)',
            fontWeight: 700,
            letterSpacing: '-.015em',
            margin: '2px 0 0',
          }}
        >
          {t('hallazgos.lista.titulo')}
        </h1>
        <p
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            marginTop: 6,
            maxWidth: 720,
            lineHeight: 1.55,
          }}
        >
          {t('hallazgos.lista.intro')}
          {/* Sin cuantificador, y sin repetir aquí la cifra. Decía «la mayoría»
              con 40 de 41 escritos por una máquina, y eso deja al lector
              concluyendo que una parte apreciable llevó criterio humano. Pero
              la cifra exacta ya la declara, derivada, el recuadro «Cómo se
              escribe un hallazgo» de más abajo: ponerla también aquí sería
              decir dos veces el mismo número en la misma página. Este párrafo
              dice cuál es la regla y cuál la excepción; el recuadro, cuántas. */}
        </p>
        <div style={{ marginTop: 10 }}>
          <DataAsOf iso={data?.generatedAt} label={t('nav.hallazgos')} />
        </div>
      </div>

      {/* Los hallazgos de eficiencia NO se mezclan aquí, y el puntero existe
          para que eso no los esconda.

          Esta página es sobre lo que dijo alguien: filtra por grupo y por
          pleno, y emite ClaimReview —marcado de verificación de la afirmación
          de una persona—. Una ficha de eficiencia no tiene quien la dijera:
          habla de lo que costó un servicio. Meterla en este flujo obligaría a
          rellenar la mitad del esquema con atribuciones inventadas y a emitir
          un ClaimReview sobre la declaración de nadie. Vive donde está su
          evidencia, y desde aquí se llega en un clic. */}
      {EFICIENCIA_ENABLED && (
        <Card style={{ marginBottom: 18, background: 'var(--soft)' }}>
          <div style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', lineHeight: 1.55 }}>
            <Marcado texto={eficienciaAntes} />
            {/* Subrayado, no sólo color: un enlace dentro de un bloque de
                texto que sólo se distingue por el tono falla WCAG 1.4.1, y axe
                lo caza en cuanto se despliega. */}
            <Link
              to="/eficiencia#hallazgos"
              style={{ color: 'var(--civic)', textDecoration: 'underline' }}
            >
              {t('hallazgos.lista.eficiencia.enlace')}
            </Link>
            <Marcado texto={eficienciaDespues} />
          </div>
        </Card>
      )}

      {/* Summary stats. La rejilla vive en `.cp-cifras` (index.css): elige dos
          o cuatro columnas por el ancho de la TIRA, y eso es una consulta de
          contenedor, que el `style` no admite. */}
      <div className="cp-cifras-marco" style={{ marginBottom: 18 }}>
        <div className="cp-cifras">
          <MiniStat label={t('hallazgos.lista.cifra.total')} value={items.length} />
          <MiniStat
            label={t('hallazgos.lista.cifra.critical')}
            value={counts.bySeverity.critical ?? 0}
            tone={(counts.bySeverity.critical ?? 0) > 0 ? 'crit' : undefined}
          />
          <MiniStat
            label={t('hallazgos.lista.cifra.notable')}
            value={counts.bySeverity.notable ?? 0}
            tone={(counts.bySeverity.notable ?? 0) > 0 ? 'warn' : undefined}
          />
          <MiniStat
            label={t('hallazgos.lista.cifra.informational')}
            value={counts.bySeverity.informational ?? 0}
          />
        </div>
      </div>

      {/* Filters */}
      {items.length > 0 && (
        <div
          // Un filtro no se puede accionar sobre un papel, y ocupaba un tercio
          // de la primera página impresa.
          data-print-hide
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            border: '1px solid var(--border2)',
            borderRadius: 'var(--r-input)',
            marginBottom: 18,
          }}
        >
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                textTransform: 'uppercase',
                letterSpacing: '.1em',
                marginRight: 6,
              }}
            >
              {t('hallazgos.lista.filtro.severidad')}
            </span>
            <Chip
              active={severityFilter === null}
              label={t('hallazgos.lista.filtro.todas')}
              onClick={() => setSeverityFilter(null)}
            />
            {['critical', 'notable', 'informational'].map((s) => (
              <Chip
                key={s}
                active={severityFilter === s}
                label={rotuloDe(t, `pleno.gravedad.${s}`, s)}
                count={counts.bySeverity[s] ?? 0}
                onClick={() => setSeverityFilter(severityFilter === s ? null : s)}
              />
            ))}
          </div>
          {Object.keys(counts.bySpeaker).length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  textTransform: 'uppercase',
                  letterSpacing: '.1em',
                  marginRight: 6,
                }}
              >
                {t('hallazgos.lista.filtro.grupo')}
              </span>
              <Chip
                active={speakerFilter === null}
                label={t('hallazgos.lista.filtro.todos')}
                onClick={() => setSpeakerFilter(null)}
              />
              {Object.entries(counts.bySpeaker)
                .sort((a, b) => b[1] - a[1])
                .map(([g, n]) => (
                  <Chip
                    key={g}
                    active={speakerFilter === g}
                    label={g}
                    count={n}
                    onClick={() => setSpeakerFilter(speakerFilter === g ? null : g)}
                  />
                ))}
            </div>
          )}
          {Object.keys(counts.byPleno).length > 1 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  textTransform: 'uppercase',
                  letterSpacing: '.1em',
                  marginRight: 6,
                }}
              >
                {t('hallazgos.lista.filtro.pleno')}
              </span>
              <Chip
                active={plenoFilter === null}
                label={t('hallazgos.lista.filtro.todos')}
                onClick={() => setPlenoFilter(null)}
              />
              {Object.entries(counts.byPleno)
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([d, n]) => (
                  <Chip
                    key={d}
                    active={plenoFilter === d}
                    label={d}
                    count={n}
                    onClick={() => setPlenoFilter(plenoFilter === d ? null : d)}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      {areaFilter ? (
        <ListaDelArea area={areaFilter} hallazgos={filtered} hayPublicados={items.length > 0} />
      ) : (
        <ListaDeHallazgos hallazgos={filtered} hayPublicados={items.length > 0} />
      )}

      <RetractionLedger retractions={data?.retractions ?? []} />

      <div
        style={{
          marginTop: 30,
          padding: 14,
          background: 'var(--soft)',
          borderRadius: 'var(--r-input)',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          lineHeight: 1.55,
        }}
      >
        <strong style={TINTA}>{t('hallazgos.lista.como.titulo')}</strong>{' '}
        <Marcado texto={comoAntes} estilo={TINTA} />
        <a
          href="/aviso-legal#rectificacion"
          style={{ color: 'var(--civic)', textDecoration: 'underline' }}
        >
          {t('hallazgos.lista.como.enlace')}
        </a>
        {comoDespues}{' '}
        <a
          href="/metodologia#verificacion-declaraciones"
          style={{ color: 'var(--civic)', textDecoration: 'underline' }}
        >
          {t('hallazgos.lista.como.metodologia')}
        </a>
        {/* Counted from the derived snapshot, never typed here: a figure written
            into a page goes false on its own the next time a session is
            re-transcribed, and nobody edits a page to notice. */}
        {provStats && provStats.soloEnSustituida + provStats.sinDeterminar > 0 && (
          <div style={{ marginTop: 8 }}>
            <Marcado texto={transcripcionesAntes} estilo={TINTA} />
            <a
              href="/metodologia#citas-transcripcion"
              style={{ color: 'var(--civic)', textDecoration: 'underline' }}
            >
              {t('hallazgos.lista.transcripciones.enlace')}
            </a>
            <Marcado texto={transcripcionesDespues} estilo={TINTA} />
          </div>
        )}
        {/* Same rule as above: counted from the derived snapshot at render
            time. This one moves every time the verdict engine re-judges a
            claim, which is a background job — a number typed here would go
            false on its own, on a page that names political groups. */}
        {gateStats && gateStats.porContraste && (
          <div style={{ marginTop: 8 }}>
            <Marcado texto={contrasteAntes} estilo={TINTA} />
            {/* Underlined, not just tinted: a link inside a paragraph that is
                distinguished by colour alone is a serious axe violation
                (link-in-text-block), and the axe gate caught this one. */}
            <Link to="/plenos" style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
              {t('hallazgos.lista.contraste.registro')}
            </Link>
            <Marcado texto={contrasteDespues} estilo={TINTA} />{' '}
            {/* Decía «No hemos retirado ninguna», y era falso desde el 11 de
                agosto: la página imprime el ledger de retiradas SETENTA Y CINCO
                líneas más arriba, con su propio encabezado contando cuántas.
                Y son de esta misma familia —se retiraron precisamente porque
                ninguna de sus citas superó la puerta editorial—, así que no era
                una ambigüedad de antecedente sino la frase contradicha por el
                bloque de al lado.
                Se DERIVA del dato en vez de afirmarse: un número escrito aquí
                se volvería falso solo la próxima vez que alguien retire una
                ficha, que es exactamente como se rompió. */}
            {(data?.retractions?.length ?? 0) > 0 ? (
              <>
                <Marcado
                  texto={rellena(t('hallazgos.lista.contraste.retiradas'), {
                    n: data.retractions.length,
                  })}
                  estilo={TINTA}
                />{' '}
              </>
            ) : null}
            <a
              href="/metodologia#citas-contraste"
              style={{ color: 'var(--civic)', textDecoration: 'underline' }}
            >
              {t('hallazgos.lista.contraste.enlace')}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
