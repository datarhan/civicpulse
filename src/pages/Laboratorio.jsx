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
import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead, ExtLink } from '../components/Primitives'
import { usePressLab } from '../hooks/usePressLab'
import ClaimReviewJsonLd from '../components/ClaimReviewJsonLd'
import DataAsOf from '../components/DataAsOf'
import { fmtDateShort } from '../lib/formatters'
import { pressLabSummary } from '../lib/press-lab'

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
  return fmtDateShort(iso) || '—'
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
  const entries = Object.entries(counts).filter(([, n]) => n > 0)
  if (entries.length === 0) {
    return (
      <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
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
        fontSize: 'var(--fs-micro)',
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
              borderRadius: 'var(--r-card)',
              background: on ? 'var(--ok-soft)' : 'var(--soft)',
              // Inactive chips keep the muted --ink50 ink but DROP the extra
              // 0.7 opacity, which compounded the translucency down to a
              // 2.7:1 contrast against --soft. Full --ink50 is 5.2:1 (light) /
              // 8.2:1 (dark) — WCAG AA, still visibly muted vs the active state.
              color: on ? 'var(--ok-ink)' : 'var(--ink50)',
            }}
          >
            <span style={{ fontSize: 'var(--fs-micro)' }}>{on ? '●' : '○'}</span>
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
      // Quién no las encontró, y que eso no prueba que no las haya.
      //
      // Decía «Sin afirmaciones contrastables identificadas en el titular», que
      // es una afirmación sobre EL TITULAR. Y el titular que lo destapó dice
      // «Riba-roja adjudica el contrato para el suministro de agua potable por
      // 55,6 millones para 17 años»: cifra, plazo y objeto, justo lo que esta
      // página contrasta contra los contratos de PLACSP. Lo que pasó es que el
      // extractor no sacó nada, que es un hecho sobre el extractor.
      <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
        El extractor no sacó ninguna afirmación de este titular. No es lo mismo que no las tenga.
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
                ↳ <span className="mono">[{evidence.kind}]</span> {evidence.snippet}
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
            title="Este artículo ya no aparece en el feed del medio; la ficha se reconstruye a partir de las declaraciones que le auditamos"
          >
            FUERA DEL FEED
          </span>
        )}
        {article.official && (
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
            title="Nota de prensa del propio Ayuntamiento, no cobertura periodística independiente"
          >
            OFICIAL
          </span>
        )}
        <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink70)' }}>
          {fmtDate(article.date)}
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
            Síntesis automática · sin revisión humana
          </div>
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
        <ClaimLedger claims={claimRows} />
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
            linkRot?.status === 'dead'
              ? 'Esta URL devolvió 4xx/5xx en la última auditoría — usa el snapshot de Wayback al lado'
              : undefined
          }
        >
          {linkRot?.status === 'dead' ? 'Ver original ⚠︎' : 'Ver original ↗'}
        </ExtLink>
        {linkRot?.archivedUrl && (
          <ExtLink
            href={linkRot.archivedUrl}
            style={{ color: 'var(--ink70)', textDecoration: 'underline' }}
            title={
              linkRot.archivedAt
                ? `Snapshot del Internet Archive · ${linkRot.archivedAt.slice(0, 10)}`
                : 'Snapshot del Internet Archive'
            }
          >
            🔗 Wayback ↗
          </ExtLink>
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
      <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
        Sin medios con suficiente cobertura para una tabla de fiabilidad.
      </div>
    )
  }
  return (
    <table
      style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-meta)' }}
      aria-label="Tabla de fiabilidad por medio"
    >
      <thead>
        <tr style={{ textAlign: 'left', color: 'var(--ink70)' }}>
          <th style={{ padding: '4px 0', fontWeight: 600 }}>Medio</th>
          <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>Artículos</th>
          <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>Verificado</th>
          <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>Discrepa</th>
        </tr>
      </thead>
      <tbody>
        {outlets.slice(0, 10).map((o) => (
          <tr key={o.outlet} style={{ borderTop: '1px solid var(--border2)' }}>
            <td style={{ padding: '4px 0' }}>
              {o.outlet}
              {/* The largest "medio" in this table is the audited institution
                  itself. Ranking its own PR for reliability alongside
                  newsrooms, unlabelled, is the wrong comparison to invite. */}
              {isOfficialOutlet(o.outlet) && (
                <span
                  className="mono"
                  style={{ marginLeft: 6, fontSize: 'var(--fs-micro)', color: 'var(--warn-ink)' }}
                  title="Fuente institucional: notas de prensa del propio Ayuntamiento"
                >
                  OFICIAL
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

/** Is this "outlet" the town hall's own newsroom rather than a newspaper? */
function isOfficialOutlet(name) {
  return /ajuntament|ayuntamiento/i.test(name || '')
}

function FactCheckRail({ factcheck }) {
  const items = factcheck?.items ?? []
  if (items.length === 0) {
    return (
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          marginTop: 8,
          lineHeight: 1.55,
        }}
      >
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
          <li key={row.id} style={{ fontSize: 'var(--fs-aux)', lineHeight: 1.45 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Pill tone={tone} size="xs">
                {row.verdict || VERDICT_LABEL[row.normalizedVerdict] || row.normalizedVerdict}
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
              <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
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
          +{items.length - 6} verificaciones más
        </li>
      )}
    </ul>
  )
}

function CoverageGaps({ items, stats }) {
  if (!items || items.length === 0) {
    // "No gaps" and "nothing to compare" look identical from the item list
    // alone, and the second was being published as the first: with the newest
    // pleno and the newest promise both older than the 14-day window, every
    // candidate was skipped and the card still congratulated the local press.
    const examined = stats?.candidatesExamined
    return (
      <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
        {examined === 0
          ? 'No hubo plenos ni promesas nuevas en los últimos 14 días, así que no hay nada que comparar con la cobertura.'
          : 'Sin lagunas detectadas en los últimos 14 días.'}
      </div>
    )
  }
  return (
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
            {it.kind === 'pleno-item' ? 'Pleno' : 'Promesa'}
          </span>
          <span style={{ color: 'var(--ink70)' }}>{it.label}</span>
        </li>
      ))}
      {items.length > 8 && (
        <li className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
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
    for (const p of lab.press) set.add(p.source)
    return Array.from(set).sort()
  }, [lab.press])

  /**
   * Articles we hold claims for but that have scrolled out of press.json.
   *
   * press.json is a snapshot of what the FEEDS currently carry — the infoturia
   * feed holds only 10 items — while claims are keyed on articleId and kept.
   * The page iterates `lab.press`, so a claim whose article has aged out is
   * fetched, deployed and rendered nowhere. Today that hides the largest euro
   * figure in the lab: «El Consell inverteix 23,6 milions per a ampliar la
   * depuradora a Riba-roja» (Periòdic, 2026-07-10).
   *
   * Every claim carries the article's url, source and date, so the card can be
   * rebuilt from the claim itself — no need to re-fetch a feed that no longer
   * lists it.
   */
  const orphanArticles = useMemo(() => {
    const known = new Set(lab.press.map((p) => p.id))
    const out = new Map()
    for (const row of lab.verified ?? []) {
      const c = row.claim
      if (!c?.articleId || known.has(c.articleId) || out.has(c.articleId)) continue
      out.set(c.articleId, {
        id: c.articleId,
        title: c.articleTitle ?? c.verbatim.slice(0, 120),
        link: c.articleUrl,
        source: c.articleSource,
        sourceHost: c.articleSourceHost ?? null,
        date: c.articleDate,
        fingerprint: c.articleFingerprint,
        orphan: true,
      })
    }
    return Array.from(out.values())
  }, [lab.press, lab.verified])

  const visible = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    return [...lab.press, ...orphanArticles]
      .filter((p) => p.date >= cutoff)
      .filter((p) => outletFilter === 'all' || p.source === outletFilter)
      .filter((p) => {
        if (verdictFilter === 'all') return true
        const claims = byArticleClaims.get(p.id) || []
        return claims.some((c) => c.verification.verdict === verdictFilter)
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [lab.press, orphanArticles, outletFilter, verdictFilter, byArticleClaims])

  const summary = useMemo(
    () => pressLabSummary({ press: lab.press, verified: lab.verified }),
    [lab.press, lab.verified],
  )

  if (lab.loading) {
    return (
      <div className="cp-page" style={{ padding: 24, color: 'var(--ink50)' }}>
        Cargando laboratorio…
      </div>
    )
  }

  const triangulated3Plus = lab.triangulation?.stats?.triangulated3Plus ?? 0

  return (
    <div
      className="cp-page"
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
          Observatorio de medios · Riba-roja de Túria
        </div>
        <h1
          style={{
            fontSize: 'var(--fs-page)',
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
            fontSize: 'var(--fs-aux)',
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
        <div style={{ marginTop: 10 }}>
          <DataAsOf iso={lab.generatedAt} label="Laboratorio" />
        </div>
        {/* El laboratorio tiene más de un experimento dentro. Sin este puntero
            la frontera sólo se alcanza por la barra lateral, y un experimento
            que se encuentra por casualidad se lee peor que uno presentado. */}
        <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
          Otros experimentos del laboratorio:{' '}
          <Link
            to="/laboratorio/frontera"
            style={{ color: 'var(--civic)', textDecoration: 'underline' }}
          >
            la frontera del gasto
          </Link>{' '}
          — qué dice, y qué no puede decir, comparar el coste de los servicios con el de los
          municipios de tamaño parecido — y{' '}
          <Link
            to="/laboratorio/coste-esperado"
            style={{ color: 'var(--civic)', textDecoration: 'underline' }}
          >
            el coste esperado
          </Link>
          : cuánto gasto cabría esperar en cada servicio para un municipio de esta población, y
          cuánto se aparta el declarado.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <KPI
          label="Titulares monitorizados"
          value={fmtNumber(summary.monitoredCount)}
          hint="últimos 30 días"
        />
        <KPI
          label="Artículos auditados"
          value={fmtNumber(summary.auditedCount)}
          hint="con ≥1 afirmación analizada"
        />
        <KPI
          label="Tasa de verificación"
          value={fmtPct(summary.verificadoRatio)}
          hint={`${summary.verificadoClaims} de ${summary.totalClaims} claims`}
        />
        <KPI
          label="Tasa de discrepancia"
          value={fmtPct(summary.contradichoRatio)}
          hint={`${summary.contradichoClaims} de ${summary.totalClaims} claims`}
        />
        <KPI
          label="Triangulación"
          value={fmtNumber(triangulated3Plus)}
          hint="historias en ≥3 medios"
        />
        <KPI label="Hallazgos editoriales" value={fmtNumber(lab.findings.length)} hint="curados" />
      </div>

      {!summary.hasEditorialContent && lab.press.length > 0 && (
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
          <strong style={{ color: 'var(--warn-ink)' }}>Extracción pendiente.</strong> Se están
          monitorizando {fmtNumber(summary.monitoredCount)} titulares, pero ninguna de sus
          afirmaciones ha llegado todavía a un veredicto: la tasa de discrepancia aparece como «—»
          porque no se ha examinado nada, y la de verificación marca el 0 % que le corresponde. La
          cadena <code>extract → verify → summarize → analytics</code> puebla estos veredictos
          (nocturna o ejecución manual).
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
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Medio:{' '}
          <select
            aria-label="Filtrar por medio"
            value={outletFilter}
            onChange={(e) => setOutletFilter(e.target.value)}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--border2)',
              borderRadius: 'var(--r-input)',
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
              borderRadius: 'var(--r-input)',
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
        <span
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginLeft: 'auto' }}
        >
          {visible.length} de {summary.monitoredCount} · ventana 30 días
        </span>
      </div>

      <div
        // El suelo de 280 px de la segunda columna no cabe en 375, y un estilo
        // inline no puede llevar una media query: la rejilla no colapsaba nunca.
        // Misma solución que .cp-kpi-grid, y por el mismo motivo.
        className="cp-lab-grid"
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
              <p style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)', marginTop: 6 }}>
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
              triangulation={byArticleTriangulation.get(article.id)}
              linkRot={lab.linkRot?.get(article.link) ?? null}
            />
          ))}
        </div>

        <aside style={{ display: 'grid', gap: 14, position: 'sticky', top: 24 }}>
          <Card>
            <SectionHead
              eyebrow="Tabla de fiabilidad"
              title="Medios monitorizados (últimos 30 días)"
            />
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
              <CoverageGaps items={lab.gaps?.items ?? []} stats={lab.gaps?.stats} />
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
                    {f.corrections?.length > 0 && (
                      <details
                        style={{
                          marginTop: 6,
                          paddingLeft: 8,
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
                                  fontSize: 'var(--fs-micro)',
                                }}
                              >
                                Motivo: {c.reason}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </li>
                ))}
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
