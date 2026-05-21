/**
 * /laboratorio — press fact-check laboratory.
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
 * Touches NO other surface — landing, live ticker, /cambios stay
 * visually identical. The page reads its own JSONs and renders
 * server-static-style: no LLM at runtime, no animations.
 */

import { useMemo, useState } from 'react'
import { Card, Pill, SectionHead } from '../components/Primitives'
import { usePressLab } from '../hooks/usePressLab'
import ClaimReviewJsonLd from '../components/ClaimReviewJsonLd'

const VERDICT_LABEL = {
  verificado: 'Verificado',
  parcial: 'Parcial',
  contradicho: 'Discrepa',
  'sin-datos': 'Sin registro',
  'promesa-repetida': 'Promesa repetida',
}
const VERDICT_TONE = {
  verificado: 'ok',
  parcial: 'warn',
  contradicho: 'crit',
  'sin-datos': 'neutral',
  'promesa-repetida': 'civic',
}

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}

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
        borderRadius: 8,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 9.5,
          color: 'var(--ink80)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {label}
      </div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, color: 'var(--ink60)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function VerdictMix({ counts }) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0)
  if (entries.length === 0) {
    return (
      <span className="mono" style={{ fontSize: 11, color: 'var(--ink60)' }}>
        sin claims auditados
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {entries.map(([v, n]) => (
        <Pill key={v} tone={VERDICT_TONE[v] || 'neutral'} size="xs">
          {n} {VERDICT_LABEL[v] || v}
        </Pill>
      ))}
    </span>
  )
}

const TRUST_LABEL = {
  localCoverage: 'Cobertura local',
  datedArticle: 'Fecha verificable',
  municipalSourceMatch: 'Coincide con datos municipales',
  corroboratedAcrossOutlets: 'Cobertura cruzada',
  factualClaimsPresent: 'Afirmaciones contrastables',
}

function TrustIndicators({ indicators }) {
  if (!indicators) return null
  const entries = Object.entries(TRUST_LABEL)
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 8,
        fontSize: 10.5,
      }}
    >
      {entries.map(([k, label]) => {
        const on = !!indicators[k]
        return (
          <span
            key={k}
            title={`Indicador del Trust Project · ${label}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 7px',
              borderRadius: 11,
              background: on ? 'var(--ok-soft)' : 'var(--soft)',
              color: on ? 'var(--ok-ink)' : 'var(--ink60)',
              opacity: on ? 1 : 0.7,
            }}
          >
            <span style={{ fontSize: 9 }}>{on ? '●' : '○'}</span>
            {label}
          </span>
        )
      })}
    </div>
  )
}

function ClaimLedger({ claims }) {
  if (!claims || claims.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--ink60)', fontStyle: 'italic' }}>
        Sin afirmaciones contrastables identificadas en el titular.
      </div>
    )
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
      {claims.slice(0, 4).map((row) => {
        const v = row.verification
        const c = row.claim
        const evidence = (v.evidence || [])[0]
        return (
          <li key={c.id}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <Pill tone={VERDICT_TONE[v.verdict] || 'neutral'} size="xs">
                {VERDICT_LABEL[v.verdict] || v.verdict}
              </Pill>
              <span style={{ fontSize: 13, lineHeight: 1.4 }}>«{c.verbatim}»</span>
            </div>
            {evidence && (
              <div
                style={{
                  marginTop: 4,
                  paddingLeft: 12,
                  fontSize: 12,
                  color: 'var(--ink70)',
                }}
              >
                ↳ <span className="mono">[{evidence.kind}]</span> {evidence.snippet}
              </div>
            )}
          </li>
        )
      })}
      {claims.length > 4 && (
        <li className="mono" style={{ fontSize: 11, color: 'var(--ink60)', paddingLeft: 4 }}>
          +{claims.length - 4} afirmaciones más en este artículo
        </li>
      )}
    </ul>
  )
}

function LabPressCard({ article, summary, claims, trust, triangulation, linkRot }) {
  const claimRows = claims || []
  const counts = claimRows.reduce((acc, r) => {
    acc[r.verification.verdict] = (acc[r.verification.verdict] || 0) + 1
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
            fontSize: 10.5,
            color: 'var(--civic)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            fontWeight: 700,
          }}
        >
          {article.source}
        </span>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink80)' }}>
          {fmtDate(article.date)}
        </span>
        <span style={{ flex: 1 }} />
        <VerdictMix counts={counts} />
      </div>
      <a
        href={article.link}
        target="_blank"
        rel="noreferrer"
        style={{
          fontSize: 15.5,
          fontWeight: 600,
          lineHeight: 1.35,
          color: 'inherit',
          textDecoration: 'none',
          display: 'block',
        }}
      >
        {article.title}
      </a>
      {summary && (
        <>
          <div
            className="mono"
            style={{
              fontSize: 9.5,
              color: 'var(--ink70)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              marginTop: 12,
            }}
          >
            Síntesis automática · revisada por curaduría
          </div>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 13,
              color: 'var(--ink80)',
              lineHeight: 1.55,
            }}
          >
            {summary.summary}
          </p>
        </>
      )}
      <div style={{ marginTop: 12 }}>
        <ClaimLedger claims={claimRows} />
      </div>
      {trust && <TrustIndicators indicators={trust.indicators} />}
      {triangulation && triangulation.outlets.length >= 2 && (
        <div
          style={{
            marginTop: 10,
            padding: '6px 10px',
            background: 'var(--soft)',
            borderRadius: 6,
            fontSize: 11.5,
            color: 'var(--ink80)',
          }}
        >
          Cobertura comparada · {triangulation.outlets.length} medios:{' '}
          <strong>{triangulation.outlets.join(' · ')}</strong>
          {triangulation.amountDrift && (
            <span>
              {' '}
              · cifras divergen €{fmtNumber(triangulation.amountDrift.spread)} (
              {fmtPct(triangulation.amountDrift.spreadPct)})
            </span>
          )}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginTop: 10,
          fontSize: 11.5,
        }}
      >
        <a
          href={article.link}
          target="_blank"
          rel="noreferrer"
          style={{
            color: linkRot?.status === 'dead' ? 'var(--crit)' : 'var(--civic)',
            textDecoration: 'underline',
          }}
          title={
            linkRot?.status === 'dead'
              ? 'Esta URL devolvió 4xx/5xx en la última auditoría — usa el snapshot de Wayback al lado'
              : undefined
          }
        >
          {linkRot?.status === 'dead' ? 'Ver original ⚠︎' : 'Ver original ↗'}
        </a>
        {linkRot?.archivedUrl && (
          <a
            href={linkRot.archivedUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--ink70)', textDecoration: 'underline' }}
            title={
              linkRot.archivedAt
                ? `Snapshot del Internet Archive · ${linkRot.archivedAt.slice(0, 10)}`
                : 'Snapshot del Internet Archive'
            }
          >
            🔗 Wayback ↗
          </a>
        )}
        <a
          href="https://github.com/datarhan/civicpulse/issues/new?template=press-finding-response.yml"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--civic)', textDecoration: 'underline' }}
        >
          Solicitar derecho de réplica ⤳
        </a>
      </div>
    </Card>
  )
}

function OutletScoreboard({ outlets }) {
  if (!outlets || outlets.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--ink60)' }}>
        Sin medios con suficiente cobertura para una tabla de fiabilidad.
      </div>
    )
  }
  return (
    <table
      style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
      role="table"
      aria-label="Tabla de fiabilidad por medio"
    >
      <thead>
        <tr style={{ textAlign: 'left', color: 'var(--ink80)' }}>
          <th style={{ padding: '4px 0', fontWeight: 600 }}>Medio</th>
          <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>Artículos</th>
          <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>Verificado</th>
          <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>Discrepa</th>
        </tr>
      </thead>
      <tbody>
        {outlets.slice(0, 10).map((o) => (
          <tr key={o.outlet} style={{ borderTop: '1px solid var(--border2)' }}>
            <td style={{ padding: '4px 0' }}>{o.outlet}</td>
            <td style={{ padding: '4px 0', textAlign: 'right' }} className="mono">
              {o.articleCount}
            </td>
            <td
              style={{ padding: '4px 0', textAlign: 'right', color: 'var(--ok-ink)' }}
              className="mono"
            >
              {fmtPct(o.verifiedRatio)}
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
  )
}

function FactCheckRail({ factcheck }) {
  const items = factcheck?.items ?? []
  if (items.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 8, lineHeight: 1.55 }}>
        Sin verificaciones de terceros indexadas para Riba-roja en este periodo. Fuente: Google Fact
        Check Tools API (Newtral, Maldita, EFE Verifica, AFP Factual). Configurar{' '}
        <code>GOOGLE_FACT_CHECK_API_KEY</code> en .env para activar.
      </div>
    )
  }
  return (
    <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
      {items.slice(0, 6).map((row) => {
        const tone = VERDICT_TONE[row.normalizedVerdict] || 'neutral'
        return (
          <li key={row.id} style={{ fontSize: 12, lineHeight: 1.45 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Pill tone={tone} size="xs">
                {row.verdict || VERDICT_LABEL[row.normalizedVerdict] || row.normalizedVerdict}
              </Pill>
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  color: 'var(--civic)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: '.06em',
                }}
              >
                {row.reviewerName}
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink60)' }}>
                {row.reviewDate.slice(0, 10)}
              </span>
            </div>
            <a
              href={row.reviewUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {row.reviewTitle}
            </a>
          </li>
        )
      })}
      {items.length > 6 && (
        <li className="mono" style={{ fontSize: 11, color: 'var(--ink60)' }}>
          +{items.length - 6} verificaciones más
        </li>
      )}
    </ul>
  )
}

function CoverageGaps({ items }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--ink60)' }}>
        Sin lagunas detectadas en los últimos 14 días.
      </div>
    )
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
      {items.slice(0, 8).map((it) => (
        <li key={it.refId} style={{ fontSize: 12 }}>
          <span
            className="mono"
            style={{
              fontSize: 9.5,
              color: 'var(--ink80)',
              textTransform: 'uppercase',
              marginRight: 6,
            }}
          >
            {it.kind === 'pleno-item' ? 'Pleno' : 'Promesa'}
          </span>
          <span style={{ color: 'var(--ink70)' }}>{it.label}</span>
        </li>
      ))}
      {items.length > 8 && (
        <li className="mono" style={{ fontSize: 11, color: 'var(--ink60)' }}>
          +{items.length - 8} más
        </li>
      )}
    </ul>
  )
}

export default function Laboratorio() {
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

  const byFingerprintTriangulation = useMemo(() => {
    const m = new Map()
    for (const c of lab.triangulation?.clusters ?? []) m.set(c.fingerprint, c)
    return m
  }, [lab.triangulation])

  const outletsForFilter = useMemo(() => {
    const set = new Set()
    for (const p of lab.press) set.add(p.source)
    return Array.from(set).sort()
  }, [lab.press])

  const visible = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    return lab.press
      .filter((p) => p.date >= cutoff)
      .filter((p) => outletFilter === 'all' || p.source === outletFilter)
      .filter((p) => {
        if (verdictFilter === 'all') return true
        const claims = byArticleClaims.get(p.id) || []
        return claims.some((c) => c.verification.verdict === verdictFilter)
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [lab.press, outletFilter, verdictFilter, byArticleClaims])

  if (lab.loading) {
    return (
      <div className="cp-page" style={{ padding: 24, color: 'var(--ink60)' }}>
        Cargando laboratorio…
      </div>
    )
  }

  const totalAudited = lab.trust?.articles?.length ?? 0
  const totalClaims = lab.verified.length
  const verificadoClaims = lab.verified.filter(
    (r) => r.verification.verdict === 'verificado',
  ).length
  const contradichoClaims = lab.verified.filter(
    (r) => r.verification.verdict === 'contradicho',
  ).length
  const triangulated3Plus = lab.triangulation?.stats?.triangulated3Plus ?? 0
  const verificadoRatio = totalClaims === 0 ? 0 : verificadoClaims / totalClaims
  const contradichoRatio = totalClaims === 0 ? 0 : contradichoClaims / totalClaims

  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}
    >
      <div style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink80)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Observatorio de medios · Riba-roja de Túria
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-.015em',
            margin: '2px 0 6px',
          }}
        >
          Laboratorio de verificación de prensa
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            color: 'var(--ink70)',
            lineHeight: 1.55,
            maxWidth: 820,
          }}
        >
          Cada titular sobre Riba-roja se extrae, sintetiza y contrasta contra los datos municipales
          públicos (presupuesto, contratos PLACSP, subvenciones BDNS, padrón INE, paro SEPE,
          plenos). Indicadores de fiabilidad inspirados en el{' '}
          <a
            href="https://thetrustproject.org/"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--civic)', textDecoration: 'underline' }}
          >
            Trust Project
          </a>{' '}
          y triangulación al estilo{' '}
          <a
            href="https://www.bellingcat.com/category/resources/how-tos/"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--civic)', textDecoration: 'underline' }}
          >
            Bellingcat
          </a>
          .
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <KPI label="Artículos auditados" value={fmtNumber(totalAudited)} hint="últimos 30 días" />
        <KPI
          label="Tasa de verificación"
          value={fmtPct(verificadoRatio)}
          hint={`${verificadoClaims} claims verificados`}
        />
        <KPI
          label="Tasa de discrepancia"
          value={fmtPct(contradichoRatio)}
          hint={`${contradichoClaims} claims contradichos`}
        />
        <KPI
          label="Triangulación"
          value={fmtNumber(triangulated3Plus)}
          hint="historias cubiertas por ≥3 medios"
        />
        <KPI label="Hallazgos editoriales" value={fmtNumber(lab.findings.length)} hint="curados" />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 14,
          fontSize: 12.5,
        }}
      >
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Medio:{' '}
          <select
            aria-label="Filtrar por medio"
            value={outletFilter}
            onChange={(e) => setOutletFilter(e.target.value)}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--border2)',
              borderRadius: 5,
              background: 'var(--paper)',
              color: 'var(--ink)',
            }}
          >
            <option value="all">Todos</option>
            {outletsForFilter.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Veredicto:{' '}
          <select
            aria-label="Filtrar por veredicto"
            value={verdictFilter}
            onChange={(e) => setVerdictFilter(e.target.value)}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--border2)',
              borderRadius: 5,
              background: 'var(--paper)',
              color: 'var(--ink)',
            }}
          >
            <option value="all">Todos</option>
            <option value="verificado">Verificado</option>
            <option value="parcial">Parcial</option>
            <option value="contradicho">Discrepa</option>
            <option value="sin-datos">Sin registro</option>
          </select>
        </label>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink60)', marginLeft: 'auto' }}>
          {visible.length} de {lab.press.length} artículos
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)',
          gap: 18,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          {visible.length === 0 && (
            <Card>
              <SectionHead
                eyebrow="Sin resultados"
                title="No hay artículos que coincidan con el filtro"
              />
              <p style={{ fontSize: 13, color: 'var(--ink70)', marginTop: 6 }}>
                Si acabas de instalar el laboratorio, ejecuta{' '}
                <code>npm run extract:press-claims</code> + <code>npm run verify:press-claims</code>{' '}
                + <code>npm run summarize:press</code> +{' '}
                <code>npm run compute:press-analytics</code> para poblar los snapshots. La cadena
                completa también corre cada noche.
              </p>
            </Card>
          )}
          {visible.map((article) => (
            <LabPressCard
              key={article.id}
              article={article}
              summary={byArticleSummary.get(article.id)}
              claims={byArticleClaims.get(article.id)}
              trust={byArticleTrust.get(article.id)}
              triangulation={byFingerprintTriangulation.get(article.fingerprint)}
              linkRot={lab.linkRot?.get(article.link) ?? null}
            />
          ))}
        </div>

        <aside style={{ display: 'grid', gap: 14, position: 'sticky', top: 24 }}>
          <Card>
            <SectionHead eyebrow="Tabla de fiabilidad" title="Medios auditados (últimos 30 días)" />
            <div style={{ marginTop: 8 }}>
              <OutletScoreboard outlets={lab.trust?.outlets ?? []} />
            </div>
          </Card>

          <Card>
            <SectionHead
              eyebrow="Lagunas de cobertura"
              title="Lo que la prensa local no está siguiendo"
            />
            <div style={{ marginTop: 8 }}>
              <CoverageGaps items={lab.gaps?.items ?? []} />
            </div>
          </Card>

          <Card>
            <SectionHead
              eyebrow="Verificaciones externas"
              title="Fact-checkers terceros (Google FCT)"
            />
            <FactCheckRail factcheck={lab.factcheck} />
          </Card>

          {lab.findings.length > 0 && (
            <Card>
              <SectionHead
                eyebrow="Hallazgos editoriales"
                title={`${lab.findings.length} verificación(es)`}
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
                {lab.findings.slice(0, 5).map((f) => (
                  <li key={f.id} style={{ fontSize: 12 }}>
                    <ClaimReviewJsonLd finding={f} />
                    <span
                      className="mono"
                      style={{
                        fontSize: 9.5,
                        color: 'var(--ink80)',
                        marginRight: 6,
                      }}
                    >
                      {f.publishedAt}
                    </span>
                    {f.title}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div
            style={{
              padding: 12,
              background: 'var(--soft)',
              borderRadius: 8,
              fontSize: 11.5,
              color: 'var(--ink70)',
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: 'var(--ink)' }}>Política editorial.</strong> Los veredictos
            verificado/discrepa contrastan datos municipales públicos contra las afirmaciones del
            medio citado. Nunca atribuimos opinión a periodistas individuales; sólo a la línea
            institucional del medio.{' '}
            <a href="/metodologia" style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
              Leer metodología →
            </a>
          </div>
        </aside>
      </div>
    </div>
  )
}
