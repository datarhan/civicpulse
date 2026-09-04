import { useMemo, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { Card, Pill, ExtLink, Quote, EvidenceBand, PartyTag } from '../components/Primitives'
import ClaimReviewJsonLd from '../components/ClaimReviewJsonLd'
import DataAsOf from '../components/DataAsOf'
// One RefList, not two. It was duplicated verbatim here and in PlenoFindings,
// so a heading fixed on one surface silently left the other one lying.
//
// Y la misma lección otra vez, el 2026-08-29: el componente estaba compartido
// pero la LLAMADA no, así que sacar el vídeo del pleno de los documentos
// cotejados en FindingCard dejó esta página —la que el lector abre— enseñándolo
// igual. Ahora se comparte la banda entera, `ListaDeCotejos`.
import {
  ListaDeCotejos,
  QuoteProvenanceMark,
  QuoteProvenanceNote,
  citaRetenida,
  CitaRetenida,
} from '../components/PlenoFindings'
import { usePlenoFindings, SEVERITY_LABEL, SEVERITY_TONE } from '../hooks/usePlenoFindings'
import { useFindingQuoteProvenance, provenanceFor } from '../hooks/useFindingQuoteProvenance'
import { authorshipBreakdown } from '../scraper/finding-authorship'
import { PARTY_TONE } from '../hooks/usePromises'
import { usePlenoClaims } from '../hooks/usePlenoClaims'
import { findingMatchesArea } from '../lib/finding-area'
import { contarHallazgos, pasaFiltros } from '../lib/hallazgos-filtros'
import { DEPARTMENT_LABEL } from '../scraper/departments'
import { useT } from '../i18n'
import { blocLabel } from '../lib/party-label.js'
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
export function FindingDetailCard({ f, permalink }) {
  // Which transcript each of this finding's verbatims actually comes from. One
  // fetch per session for the whole page — the snapshot store single-flights it
  // — and the marker itself lives in PlenoFindings so /plenos/:id renders the
  // same thing. The RefList duplication taught this lesson already: a fix on one
  // of two copies leaves the other one lying.
  const { data: provenance } = useFindingQuoteProvenance()
  const prov = provenanceFor(provenance, f.id)
  return (
    <Card id={f.id} style={{ scrollMarginTop: 24 }}>
      <ClaimReviewJsonLd finding={f} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <Pill tone={SEVERITY_TONE[f.severity] || 'neutral'} size="xs">
          {SEVERITY_LABEL[f.severity] || f.severity}
        </Pill>
        <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          {f.plenoDate} · pleno {f.plenoId} · editado por {f.curatorName}
        </span>
        <a
          href={permalink}
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--fs-micro)',
            color: 'var(--civic)',
            textDecoration: 'none',
          }}
          title="Enlace permanente a este hallazgo"
        >
          #{f.id.slice(-12)}
        </a>
      </div>
      <div style={{ fontSize: 'var(--fs-head)', fontWeight: 600, lineHeight: 1.35 }}>{f.title}</div>
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
          title="Atribución individual confirmada por curaduría editorial"
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
      <EvidenceBand n={1} title="Lo que se dijo">
        {f.quotes?.length > 0 ? (
          <>
            {f.quotes.map((q, i) =>
              // La puerta editorial manda en las dos superficies: si retiene el
              // literal en /declaraciones, aquí tampoco se publica. Lo que se
              // retiene es la CITA, no la ficha.
              citaRetenida(prov[i]) ? (
                <CitaRetenida
                  key={i}
                  attribution={q.speakerGroup ? blocLabel(q.speakerGroup) : null}
                  tone={PARTY_TONE[q.speakerGroup]}
                />
              ) : (
                // Sin speakerGroup la cita no se queda muda, dice «sin atribuir».
                // Antes se omitía la línea y una cita sin dueño se leía igual que
                // una atribuida.
                <Quote
                  key={i}
                  text={q.text}
                  attribution={q.speakerGroup ? blocLabel(q.speakerGroup) : null}
                  tone={PARTY_TONE[q.speakerGroup]}
                  marks={<QuoteProvenanceMark entry={prov[i]} />}
                />
              ),
            )}
            <QuoteProvenanceNote entries={prov} curatorName={f.curatorName} />
          </>
        ) : (
          <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
            Esta ficha no publica ningún literal.
          </div>
        )}
      </EvidenceBand>

      <EvidenceBand n={2} title="Contra qué se cotejó">
        {f.crossChecked?.length || f.contradiction?.length ? (
          <>
            <ListaDeCotejos
              crossChecked={f.crossChecked}
              contradiction={f.contradiction}
              plenoDate={f.plenoDate}
            />
          </>
        ) : (
          // Describe el REGISTRO, no el mundo. `pleno-findings.json` no separa
          // «se cotejó y no salió nada» de «no se cotejó», así que decir «sin
          // rastro» aquí sería fabricar un veredicto con un dato que no existe.
          <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
            Esta ficha no publica ningún documento cotejado. Eso no dice que no exista: dice que
            aquí no consta.
          </div>
        )}
      </EvidenceBand>

      <EvidenceBand n={3} title="Derecho de réplica">
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
              Réplica de {f.response.from} · {f.response.respondedAt}
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
                  Fuente →
                </ExtLink>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
            Abierto desde {f.publishedAt} · sin respuesta. ¿Eres el grupo afectado? Contacta con la
            redacción para ejercerlo · ver{' '}
            <a href="/aviso-legal" style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
              /aviso-legal
            </a>
          </div>
        )}
      </EvidenceBand>
      {f.corrections?.length > 0 && (
        <details
          style={{
            marginTop: 10,
            paddingLeft: 10,
            borderLeft: '2px solid var(--border)',
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink70)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            Bitácora de correcciones · {f.corrections.length}
          </summary>
          <ol
            style={{
              margin: '6px 0 0',
              paddingLeft: 18,
              display: 'grid',
              gap: 8,
              fontSize: 'var(--fs-aux)',
            }}
          >
            {f.corrections.map((c, idx) => (
              <li key={idx}>
                <div
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-micro)',
                    color: 'var(--ink50)',
                    marginBottom: 2,
                  }}
                >
                  {c.field} · {c.correctedAt.slice(0, 10)} · {c.editor}
                </div>
                <div
                  style={{
                    textDecoration: 'line-through',
                    color: 'var(--ink50)',
                  }}
                >
                  {c.original}
                </div>
                <div style={{ color: 'var(--ink)', marginTop: 1 }}>{c.corrected}</div>
                <div
                  style={{
                    marginTop: 2,
                    color: 'var(--ink70)',
                  }}
                >
                  Motivo: {c.reason}
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
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
  if (!retractions?.length) return null
  const ordered = [...retractions].sort((a, b) => b.retractedAt.localeCompare(a.retractedAt))
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
        Hallazgos retirados · {ordered.length}
      </div>
      <p style={{ margin: '0 0 10px' }}>
        Publicados y después retirados. No se reproduce lo que decían: se retiraron porque ninguna
        de sus citas superaba la puerta editorial, así que republicar el texto aquí devolvería a la
        web exactamente aquello que la retirada quita. Queda la huella —{' '}
        <span className="mono">sha256</span> del original, por si alguien conserva una copia y
        quiere comprobar que coincide.
      </p>
      <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
        {ordered.map((r) => (
          <li key={r.findingId}>
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 2 }}
            >
              {r.findingId} · pleno {r.plenoDate} · retirado {r.retractedAt.slice(0, 10)} ·{' '}
              {r.editor}
            </div>
            <div>
              {r.quoteCount} cita(s) y {r.crossCheckedCount} documento(s) cotejado(s) ·{' '}
              <span className="mono" style={{ color: 'var(--ink50)' }}>
                {r.digest}
              </span>
            </div>
            <div style={{ marginTop: 2, fontSize: 'var(--fs-micro)' }}>Motivo: {r.reason}</div>
          </li>
        ))}
      </ol>
    </section>
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

export default function Hallazgos() {
  const t = useT()
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
  const { data: claimsForArea } = usePlenoClaims()
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

  const filtered = useMemo(() => {
    return items.filter(
      (f) =>
        pasaFiltros(f, {
          severidad: severityFilter,
          grupo: speakerFilter,
          pleno: plenoFilter,
        }) &&
        // El de área se queda fuera del módulo puro: necesita el corpus de
        // declaraciones, que es E/S.
        findingMatchesArea(f, areaFilter, claimsForArea),
    )
  }, [items, severityFilter, speakerFilter, plenoFilter, areaFilter, claimsForArea])

  // Group by pleno date
  const groups = useMemo(() => {
    const g = new Map()
    for (const f of filtered) {
      if (!g.has(f.plenoDate)) g.set(f.plenoDate, [])
      g.get(f.plenoDate).push(f)
    }
    return [...g.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

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
              {DEPARTMENT_LABEL[areaFilter].es}
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
            ? `Redacción automática · ${authorship.machine} de ${authorship.total}`
            : 'Verificación editorial'}
        </div>
        <div
          style={{
            fontSize: 'var(--fs-page)',
            fontWeight: 700,
            letterSpacing: '-.015em',
            marginTop: 2,
          }}
        >
          Hallazgos sobre declaraciones en pleno
        </div>
        <p
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            marginTop: 6,
            maxWidth: 720,
            lineHeight: 1.55,
          }}
        >
          Cada hallazgo toma una o más afirmaciones literales de un pleno y las sitúa en su contexto
          documental (contratos, subvenciones, presupuesto, promesas). Los redacta un proceso
          automático bajo reglas fijas, salvo los que llevan la firma de una persona; el pie de cada
          ficha dice quién la editó, y un nombre como «auto-curation-v1» significa que el texto lo
          escribió una máquina. Cada ficha lista los documentos con los que se ha cotejado —lo
          corroboren o no— y da derecho de réplica literal al grupo afectado.
          {/* Sin cuantificador, y sin repetir aquí la cifra. Decía «la mayoría»
              con 40 de 41 escritos por una máquina, y eso deja al lector
              concluyendo que una parte apreciable llevó criterio humano. Pero
              la cifra exacta ya la declara, derivada, el recuadro «Cómo se
              escribe un hallazgo» de más abajo: ponerla también aquí sería
              decir dos veces el mismo número en la misma página. Este párrafo
              dice cuál es la regla y cuál la excepción; el recuadro, cuántas. */}
        </p>
        <div style={{ marginTop: 10 }}>
          <DataAsOf iso={data?.generatedAt} label="Hallazgos" />
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
            Esta página verifica <strong>declaraciones en pleno</strong>. Los hallazgos sobre{' '}
            <strong>cuánto cuesta cada servicio</strong> —que no citan a nadie porque no los dijo
            nadie: salen de las cifras que el ayuntamiento remite al ministerio— se publican junto a
            los datos de los que salen, en{' '}
            {/* Subrayado, no sólo color: un enlace dentro de un bloque de
                texto que sólo se distingue por el tono falla WCAG 1.4.1, y axe
                lo caza en cuanto se despliega. */}
            <Link
              to="/eficiencia#hallazgos"
              style={{ color: 'var(--civic)', textDecoration: 'underline' }}
            >
              eficiencia
            </Link>
            .
          </div>
        </Card>
      )}

      {/* Summary stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 18,
        }}
      >
        <MiniStat label="Total hallazgos" value={items.length} />
        <MiniStat
          label="Críticos"
          value={counts.bySeverity.critical ?? 0}
          tone={(counts.bySeverity.critical ?? 0) > 0 ? 'crit' : undefined}
        />
        <MiniStat
          label="Relevantes"
          value={counts.bySeverity.notable ?? 0}
          tone={(counts.bySeverity.notable ?? 0) > 0 ? 'warn' : undefined}
        />
        <MiniStat label="Informativos" value={counts.bySeverity.informational ?? 0} />
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
              Severidad
            </span>
            <Chip
              active={severityFilter === null}
              label="todas"
              onClick={() => setSeverityFilter(null)}
            />
            {['critical', 'notable', 'informational'].map((s) => (
              <Chip
                key={s}
                active={severityFilter === s}
                label={SEVERITY_LABEL[s] ?? s}
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
                Grupo
              </span>
              <Chip
                active={speakerFilter === null}
                label="todos"
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
                Pleno
              </span>
              <Chip
                active={plenoFilter === null}
                label="todos"
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

      {/* Grouped findings */}
      {groups.length === 0 ? (
        <div
          style={{
            padding: 16,
            background: 'var(--soft)',
            borderRadius: 'var(--r-input)',
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            lineHeight: 1.5,
          }}
        >
          {items.length === 0
            ? 'Todavía no hay hallazgos editoriales publicados. El flujo de curación es: extraer declaraciones → verificar contra datos → promover a hallazgo.'
            : 'Ninguno coincide con los filtros actuales.'}
        </div>
      ) : (
        groups.map(([date, list]) => (
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
              Pleno · {date}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {list.map((f) => (
                <FindingDetailCard key={f.id} f={f} permalink={`${location.pathname}#${f.id}`} />
              ))}
            </div>
          </section>
        ))
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
        <strong style={{ color: 'var(--ink)' }}>Cómo se escribe un hallazgo.</strong> Un proceso
        automático agrupa las afirmaciones extraídas de las transcripciones del pleno, las coteja
        con la base documental municipal y redacta el título y el resumen bajo reglas fijas
        {authorship ? (
          <>
            : de los {authorship.total} publicados,{' '}
            <strong style={{ color: 'var(--ink)' }}>
              {authorship.machine} los firma una máquina
            </strong>
          </>
        ) : null}
        . El pie de cada ficha dice quién la editó, y un nombre como «auto-curation-v1» significa
        que el texto lo escribió una máquina, no una persona. Los grupos afectados pueden responder
        con cita literal a través del enlace «Responder como grupo afectado».{' '}
        <a
          href="/metodologia#verificacion-declaraciones"
          style={{ color: 'var(--civic)', textDecoration: 'underline' }}
        >
          Leer metodología →
        </a>
        {/* Counted from the derived snapshot, never typed here: a figure written
            into a page goes false on its own the next time a session is
            re-transcribed, and nobody edits a page to notice. */}
        {provStats && provStats.soloEnSustituida + provStats.sinDeterminar > 0 && (
          <div style={{ marginTop: 8 }}>
            <strong style={{ color: 'var(--ink)' }}>Citas y transcripciones.</strong> Varias
            sesiones se transcribieron una segunda vez con un motor mejor. De los {provStats.quotes}{' '}
            literales publicados aquí,{' '}
            <strong style={{ color: 'var(--ink)' }}>{provStats.enVigente}</strong> aparecen en la
            transcripción vigente de su sesión;{' '}
            <strong style={{ color: 'var(--ink)' }}>{provStats.soloEnSustituida}</strong> sólo en la
            que se sustituyó, y {provStats.sinDeterminar} no se pueden situar en ninguna de las dos.
            Los que no constan en el texto vigente llevan su marca al lado. No reescribimos ninguna
            cita por nuestra cuenta.{' '}
            <a
              href="/metodologia#citas-transcripcion"
              style={{ color: 'var(--civic)', textDecoration: 'underline' }}
            >
              Qué significa cada marca →
            </a>
          </div>
        )}
        {/* Same rule as above: counted from the derived snapshot at render
            time. This one moves every time the verdict engine re-judges a
            claim, which is a background job — a number typed here would go
            false on its own, on a page that names political groups. */}
        {gateStats && gateStats.porContraste && (
          <div style={{ marginTop: 8 }}>
            <strong style={{ color: 'var(--ink)' }}>Citas y datos municipales.</strong> Las
            afirmaciones que sostienen estas citas se cotejan automáticamente con los datos del
            ayuntamiento. De las {gateStats.citasConClaim} de aquí, el cotejo encontró algún dato
            sobre <strong style={{ color: 'var(--ink)' }}>{gateStats.porContraste.shown}</strong>;
            para <strong style={{ color: 'var(--ink)' }}>{gateStats.porContraste.toggle}</strong> no
            encontró nada que las confirme ni que las desmienta, y otras{' '}
            <strong style={{ color: 'var(--ink)' }}>{gateStats.porContraste.hidden}</strong> son
            acusaciones públicas sin ese contraste, que en{' '}
            {/* Underlined, not just tinted: a link inside a paragraph that is
                distinguished by colour alone is a serious axe violation
                (link-in-text-block), and the axe gate caught this one. */}
            <Link to="/plenos" style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
              el registro de declaraciones
            </Link>{' '}
            no se publican. Llevan su marca al lado. No hemos retirado ninguna, y no decimos que
            ninguna sea falsa.{' '}
            <a
              href="/metodologia#citas-contraste"
              style={{ color: 'var(--civic)', textDecoration: 'underline' }}
            >
              Por qué se publican aquí →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
