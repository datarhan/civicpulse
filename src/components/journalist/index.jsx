// Journalist agent — editorial-longform UI primitives.
//
// Layout (responsive, CSS-grid; mobile fallback collapses to one column):
//
//   HERO BAND (full-width)
//   ─────────────────────────────────────────────────────────────
//   STICKY TOC (200px) │ MAIN CONTENT (1fr) │ STICKY FACTS (260px)
//   ─────────────────────────────────────────────────────────────
//   SOURCE LEDGER (full-width)
//
// All section components receive a section payload + a `sourceMap`
// (Map<sourceId, { src, num }>) so they can resolve citation pills
// without re-walking the sources array. The page-level <AgenteReporte/>
// hosts the layout grid and decides which sections feed into the main
// column vs. the sidebar.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead } from '../Primitives'
import { Sparkline } from '../Charts'
import {
  CITATION_KIND_LABEL,
  CITATION_TRUST_TONE,
  LEGAL_SENSITIVITY_LABEL,
  LEGAL_SENSITIVITY_TONE,
} from '../../hooks/useJournalistReports'

// ─── Source-index helper ─────────────────────────────────────────────────

const SOURCE_INDEX = (sources) => {
  const m = new Map()
  sources.forEach((s, i) => m.set(s.id, { src: s, num: i + 1 }))
  return m
}
export { SOURCE_INDEX }

// ─── Citation pill with hover popover ────────────────────────────────────

export function CitationPills({ ids, sourceMap }) {
  if (!ids || ids.length === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6, verticalAlign: 'baseline' }}>
      {ids.map((id) => {
        const hit = sourceMap.get(id)
        if (!hit) return null
        return <CitationPopover key={id} num={hit.num} src={hit.src} />
      })}
    </span>
  )
}

export function CitationPopover({ num, src }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <a
        href={`#src-${num}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          fontSize: 10,
          color: 'var(--ink60)',
          textDecoration: 'none',
          padding: '1px 6px',
          borderRadius: 999,
          background: 'var(--soft)',
          fontVariantNumeric: 'tabular-nums',
        }}
        title={src.title}
      >
        [{num}]
      </a>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 50,
            bottom: 'calc(100% + 6px)',
            left: 0,
            minWidth: 260,
            maxWidth: 360,
            padding: 10,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--paper)',
            color: 'var(--ink80)',
            fontSize: 11.5,
            lineHeight: 1.5,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{src.title}</div>
          {src.publisher && (
            <div style={{ marginTop: 2, color: 'var(--ink60)' }}>{src.publisher}</div>
          )}
          {src.excerpt && (
            <div
              style={{
                marginTop: 6,
                paddingTop: 6,
                borderTop: '1px solid var(--border)',
                color: 'var(--ink60)',
                fontStyle: 'italic',
              }}
            >
              «{src.excerpt.slice(0, 220)}»
            </div>
          )}
        </span>
      )}
    </span>
  )
}

// ─── Hero band ───────────────────────────────────────────────────────────

export function HeroBand({ subjectName, portraitPayload, report, soulDownloadUrl }) {
  const tone = portraitPayload?.partyTone || 'civic'
  const identity = report.sections.find((s) => s.kind === 'identity')?.payload
  const lastCareer = report.sections.find((s) => s.kind === 'career-political')?.payload?.items?.[0]
  return (
    <section
      style={{
        padding: '32px 24px',
        borderBottom: '1px solid var(--border)',
        background: `linear-gradient(180deg, var(--${tone}-soft, var(--soft)) 0%, var(--paper) 100%)`,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: 28,
          alignItems: 'center',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        {portraitPayload?.photoPath && (
          <img
            src={portraitPayload.photoPath}
            alt={subjectName}
            width={200}
            height={264}
            style={{
              borderRadius: 8,
              objectFit: 'cover',
              background: 'var(--soft)',
              border: `4px solid var(--${tone})`,
              flexShrink: 0,
            }}
            loading="eager"
          />
        )}
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 'var(--type-display)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              color: 'var(--ink)',
            }}
          >
            {subjectName}
          </h1>
          {lastCareer && (
            <p
              style={{
                margin: '8px 0 0 0',
                fontSize: 'var(--type-lede)',
                color: 'var(--ink60)',
              }}
            >
              {lastCareer.role} en {lastCareer.org}
              {lastCareer.startYear && ` · desde ${lastCareer.startYear}`}
            </p>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(portraitPayload?.portfolios || []).map((p) => (
              <Pill key={p} tone={tone}>
                {p}
              </Pill>
            ))}
          </div>
          {identity && (
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                gap: 18,
                flexWrap: 'wrap',
                fontSize: 12.5,
                color: 'var(--ink60)',
              }}
            >
              {identity.dateOfBirth && (
                <span>
                  <span aria-hidden="true">🎂</span>{' '}
                  <span className="mono">{identity.dateOfBirth}</span>
                </span>
              )}
              {identity.birthplace && (
                <span>
                  <span aria-hidden="true">📍</span> {identity.birthplace}
                </span>
              )}
              {identity.residence && identity.residence !== identity.birthplace && (
                <span>
                  <span aria-hidden="true">🏠</span> {identity.residence}
                </span>
              )}
            </div>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {portraitPayload?.cvUrl && (
              <a
                href={portraitPayload.cvUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={heroActionStyle}
              >
                CV oficial ↗
              </a>
            )}
            {soulDownloadUrl && (
              <a href={soulDownloadUrl} download style={heroActionStyle}>
                Descargar soul.md ↓
              </a>
            )}
            <a
              href={`https://github.com/datarhan/civicpulse/issues/new?labels=derecho-replica&template=journalist-report-response.yml&title=${encodeURIComponent('Réplica al informe ' + report.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={heroActionStyle}
            >
              Derecho de réplica ↗
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

const heroActionStyle = {
  fontSize: 12,
  padding: '8px 14px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--paper)',
  color: 'var(--ink80)',
  textDecoration: 'none',
}

// ─── Sticky TOC with scroll-spy ──────────────────────────────────────────

export function StickyToc({ items }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '')
  useEffect(() => {
    if (typeof window === 'undefined' || items.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top,
          )
        if (visible[0]) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    )
    for (const it of items) {
      const el = document.getElementById(it.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items])
  return (
    <nav aria-label="Índice del informe" className="cp-toc">
      <div
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: 'var(--ink50)',
          marginBottom: 10,
        }}
      >
        Secciones
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              style={{
                display: 'block',
                fontSize: 12.5,
                padding: '4px 8px',
                borderRadius: 4,
                color: activeId === it.id ? 'var(--ink)' : 'var(--ink60)',
                background: activeId === it.id ? 'var(--soft)' : 'transparent',
                borderLeft: `2px solid ${activeId === it.id ? 'var(--civic)' : 'transparent'}`,
                textDecoration: 'none',
                fontWeight: activeId === it.id ? 600 : 400,
              }}
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

// ─── Sticky facts sidebar ────────────────────────────────────────────────

export function FactsSidebar({ report, subjectName, assignment }) {
  const portrait = report.sections.find((s) => s.kind === 'portrait')?.payload
  const identity = report.sections.find((s) => s.kind === 'identity')?.payload
  const careerPol = report.sections.find((s) => s.kind === 'career-political')?.payload?.items ?? []
  const education = report.sections.find((s) => s.kind === 'education')?.payload?.items ?? []
  const promiseBoard =
    report.sections.find((s) => s.kind === 'promise-board')?.payload?.promiseIds ?? []
  const press = report.sections.find((s) => s.kind === 'press-sparkline')?.payload
  const dossierKinds = [
    'identity',
    'education',
    'career-political',
    'career-professional',
    'legal-record',
    'financial',
    'online-presence',
    'awards',
    'publications',
  ]
  const dossierPresent = report.sections.filter((s) => dossierKinds.includes(s.kind)).length

  const rows = []
  if (portrait?.portfolios?.length) {
    rows.push({
      label: 'Cargo',
      value: (
        <>
          {portrait.portfolios[0]}
          {portrait.portfolios.length > 1 && (
            <span style={{ color: 'var(--ink50)' }}> +{portrait.portfolios.length - 1}</span>
          )}
        </>
      ),
    })
  }
  if (identity?.dateOfBirth) {
    rows.push({ label: 'Nacimiento', value: <span className="mono">{identity.dateOfBirth}</span> })
  }
  if (identity?.birthplace) {
    rows.push({ label: 'Lugar', value: identity.birthplace })
  }
  if (careerPol[0]) {
    const c = careerPol[0]
    rows.push({
      label: 'Cargo actual',
      value: (
        <>
          {c.role}
          <br />
          <span style={{ color: 'var(--ink50)', fontSize: 11 }}>
            {c.org} · desde {c.startYear}
          </span>
        </>
      ),
    })
  }
  if (education[0]) {
    rows.push({
      label: 'Formación',
      value: (
        <>
          {education[0].degree}
          {education[0].institution && (
            <>
              <br />
              <span style={{ color: 'var(--ink50)', fontSize: 11 }}>
                {education[0].institution}
              </span>
            </>
          )}
          {education.length > 1 && (
            <span style={{ color: 'var(--ink50)' }}> · +{education.length - 1} más</span>
          )}
        </>
      ),
    })
  }
  if (promiseBoard.length > 0) {
    rows.push({
      label: 'Promesas',
      value: `${promiseBoard.length} documentadas`,
    })
  }
  if (press?.headlines?.length > 0) {
    const years = press.points?.map((p) => p.date.slice(0, 4)).filter(Boolean)
    const span = years && years.length > 0 ? `${years[0]}–${years[years.length - 1]}` : ''
    rows.push({
      label: 'Cobertura',
      value: `${press.headlines.length} menciones${span ? ` (${span})` : ''}`,
    })
  }
  if (assignment?.lastRunAt) {
    rows.push({
      label: 'Actualizado',
      value: <span className="mono">{assignment.lastRunAt.slice(0, 10)}</span>,
    })
  }
  rows.push({
    label: 'Fuentes',
    value: `${report.sources.length} consultadas`,
  })
  rows.push({
    label: 'Secciones',
    value: `${dossierPresent}/9 del dossier`,
  })

  return (
    <aside className="cp-facts" aria-label={`Ficha rápida de ${subjectName}`}>
      <div
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: 'var(--ink50)',
          marginBottom: 12,
        }}
      >
        Ficha
      </div>
      <dl style={{ margin: 0, padding: 0, display: 'grid', gap: 12 }}>
        {rows.map((r, i) => (
          <div key={i}>
            <dt
              className="mono"
              style={{
                fontSize: 10,
                color: 'var(--ink50)',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                margin: 0,
              }}
            >
              {r.label}
            </dt>
            <dd style={{ margin: '2px 0 0 0', color: 'var(--ink80)', fontSize: 13 }}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}

// ─── Section: portrait (now slim — most info is in HeroBand) ─────────────

export function PortraitHeader() {
  // HeroBand already renders the portrait. The dispatcher returns null
  // for this kind so the data-driven loop doesn't render a duplicate.
  return null
}

// ─── Section: narrative ───────────────────────────────────────────────────

export function NarrativeBlock({ payload, sourceMap }) {
  return (
    <Card>
      <h3 style={{ margin: 0, fontSize: 'var(--type-h3)', color: 'var(--ink)' }}>
        {payload.heading}
      </h3>
      <div
        style={{
          marginTop: 10,
          fontSize: 'var(--type-lede)',
          lineHeight: 1.65,
          color: 'var(--ink80)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {payload.bodyMarkdown}
        <CitationPills ids={payload.sourceIds} sourceMap={sourceMap} />
      </div>
    </Card>
  )
}

// ─── Section: identity card ──────────────────────────────────────────────

export function IdentityCard({ payload, sourceMap }) {
  const cellStyle = { fontSize: 13, color: 'var(--ink80)', padding: '6px 0' }
  const labelStyle = {
    fontSize: 10.5,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: 'var(--ink50)',
  }
  return (
    <Card>
      <SectionHead title="Identidad" />
      <dl
        style={{
          margin: 0,
          padding: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, max-content) 1fr',
          rowGap: 6,
          columnGap: 16,
        }}
      >
        {payload.dateOfBirth && (
          <>
            <dt style={labelStyle}>Nacimiento</dt>
            <dd style={cellStyle}>
              <span className="mono">{payload.dateOfBirth}</span>
              <CitationPills ids={payload.sourceIds} sourceMap={sourceMap} />
            </dd>
          </>
        )}
        {payload.birthplace && (
          <>
            <dt style={labelStyle}>Lugar de nacimiento</dt>
            <dd style={cellStyle}>
              {payload.birthplace}
              <CitationPills ids={payload.sourceIds} sourceMap={sourceMap} />
            </dd>
          </>
        )}
        {payload.residence && (
          <>
            <dt style={labelStyle}>Residencia</dt>
            <dd style={cellStyle}>{payload.residence}</dd>
          </>
        )}
        {payload.nationality && (
          <>
            <dt style={labelStyle}>Nacionalidad</dt>
            <dd style={cellStyle}>{payload.nationality}</dd>
          </>
        )}
        {payload.family && payload.family.length > 0 && (
          <>
            <dt style={labelStyle}>Familia</dt>
            <dd style={cellStyle}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {payload.family.map((f, i) => (
                  <li key={i}>
                    <span style={{ color: 'var(--ink60)' }}>{f.relation}</span>
                    {f.name && <span>: {f.name}</span>}
                    <CitationPills ids={f.sourceIds} sourceMap={sourceMap} />
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>
    </Card>
  )
}

// ─── Section: education ──────────────────────────────────────────────────

export function EducationList({ payload, sourceMap }) {
  if (!payload.items?.length) return null
  return (
    <Card>
      <SectionHead title="Formación" />
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
        {payload.items.map((e, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink50)', minWidth: 70 }}>
              {formatYearSpan(e.startYear, e.endYear) || '—'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--ink80)', fontSize: 13.5 }}>{e.degree}</div>
              {e.institution && (
                <div style={{ color: 'var(--ink60)', fontSize: 12 }}>{e.institution}</div>
              )}
            </div>
            <CitationPills ids={e.sourceIds} sourceMap={sourceMap} />
          </li>
        ))}
      </ol>
    </Card>
  )
}

// ─── Section: career ladder (political + professional) ───────────────────

export function CareerLadder({ payload, sourceMap, label, openLabel = 'presente' }) {
  if (!payload.items?.length) return null
  const sorted = [...payload.items].sort((a, b) => (b.startYear ?? 0) - (a.startYear ?? 0))
  return (
    <Card>
      <SectionHead title={label} />
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {sorted.map((c, i) => {
          const span = formatYearSpan(c.startYear, c.endYear ?? undefined, openLabel)
          return (
            <li
              key={i}
              style={{
                position: 'relative',
                paddingLeft: 24,
                paddingBottom: i < sorted.length - 1 ? 16 : 0,
                borderLeft: i < sorted.length - 1 ? '2px solid var(--border)' : 'none',
                marginLeft: 8,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: -7,
                  top: 4,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: 'var(--civic)',
                  border: '2px solid var(--paper)',
                }}
              />
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink60)' }}>
                {span || '—'}
              </div>
              <div style={{ marginTop: 2, fontSize: 14, color: 'var(--ink)' }}>{c.role}</div>
              <div style={{ color: 'var(--ink60)', fontSize: 12.5 }}>
                {c.org}
                <CitationPills ids={c.sourceIds} sourceMap={sourceMap} />
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

// ─── Section: legal-record ───────────────────────────────────────────────

export function LegalRecord({ payload, sourceMap }) {
  if (!payload.items?.length) return null
  return (
    <Card style={{ borderLeft: '4px solid var(--crit)' }}>
      <SectionHead title="Procesos judiciales" />
      <p style={{ margin: 0, fontSize: 12, color: 'var(--ink60)', fontStyle: 'italic' }}>
        ⚠ Esta sección activa la sensibilidad legal alta. Las afirmaciones se citan verbatim del
        registro público y aceptan derecho de réplica abierto.
      </p>
      <ul style={{ margin: '12px 0 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
        {payload.items.map((l, i) => (
          <li
            key={i}
            style={{ paddingTop: 10, borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span
                className="mono"
                style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}
              >
                {l.caseRef}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink60)' }}>{l.court}</span>
              {l.date && (
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink50)' }}>
                  · {l.date}
                </span>
              )}
              <CitationPills ids={l.sourceIds} sourceMap={sourceMap} />
            </div>
            {l.outcome && (
              <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--ink80)' }}>
                <strong>Resultado:</strong> {l.outcome}
              </div>
            )}
            <blockquote
              style={{
                margin: '6px 0 0 0',
                padding: '4px 12px',
                borderLeft: '3px solid var(--crit-soft)',
                color: 'var(--ink60)',
                fontStyle: 'italic',
                fontSize: 12.5,
              }}
            >
              «{l.verbatimRef}»
            </blockquote>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ─── Section: financial ──────────────────────────────────────────────────

export function FinancialPanel({ payload, sourceMap }) {
  if (!payload.items?.length) return null
  return (
    <Card>
      <SectionHead title="Declaraciones financieras" />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr
            style={{
              textAlign: 'left',
              color: 'var(--ink50)',
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            <th style={{ padding: '6px 8px 6px 0' }}>Año</th>
            <th style={{ padding: '6px 8px' }}>Concepto</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Importe (€)</th>
            <th style={{ padding: '6px 0 6px 8px' }}>Fuente</th>
          </tr>
        </thead>
        <tbody>
          {payload.items.map((f, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td className="mono" style={{ padding: '8px 8px 8px 0', color: 'var(--ink60)' }}>
                {f.year}
              </td>
              <td style={{ padding: '8px', color: 'var(--ink80)' }}>
                <div style={{ fontWeight: 500 }}>
                  {f.metric === 'salary'
                    ? 'Salario público'
                    : f.metric === 'declared-assets'
                      ? 'Bienes declarados'
                      : 'Actividad empresarial'}
                </div>
                <div style={{ color: 'var(--ink60)', fontSize: 11.5 }}>{f.description}</div>
              </td>
              <td
                className="mono"
                style={{
                  padding: '8px',
                  textAlign: 'right',
                  color: 'var(--ink)',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.amountEuros !== undefined ? f.amountEuros.toLocaleString('es-ES') : '—'}
              </td>
              <td style={{ padding: '8px 0 8px 8px' }}>
                <CitationPills ids={f.sourceIds} sourceMap={sourceMap} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

// ─── Section: online-presence ────────────────────────────────────────────

export function OnlinePresenceRow({ payload, sourceMap }) {
  if (!payload.accounts?.length) return null
  return (
    <Card>
      <SectionHead title="Presencia online" />
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {payload.accounts.map((a, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <Pill tone="intel" size="sm">
              {a.platform}
            </Pill>
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--ink80)' }}
            >
              {a.handle}
            </a>
            {a.verifiedAt && (
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
                verificado {a.verifiedAt}
              </span>
            )}
            <CitationPills ids={a.sourceIds} sourceMap={sourceMap} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ─── Section: awards ─────────────────────────────────────────────────────

export function AwardsList({ payload, sourceMap }) {
  if (!payload.items?.length) return null
  return (
    <Card>
      <SectionHead title="Reconocimientos" />
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {payload.items.map((a, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 13 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink50)', minWidth: 48 }}>
              {a.year ?? '—'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--ink80)' }}>{a.name}</div>
              <div style={{ color: 'var(--ink60)', fontSize: 11.5 }}>{a.awardedBy}</div>
            </div>
            <CitationPills ids={a.sourceIds} sourceMap={sourceMap} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ─── Section: publications ───────────────────────────────────────────────

export function PublicationsList({ payload, sourceMap }) {
  if (!payload.items?.length) return null
  return (
    <Card>
      <SectionHead title="Publicaciones" />
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
        {payload.items.map((p, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 13 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink50)', minWidth: 48 }}>
              {p.year ?? '—'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--ink80)' }}>
                «{p.title}»
                <CitationPills ids={p.sourceIds} sourceMap={sourceMap} />
              </div>
              <div style={{ color: 'var(--ink60)', fontSize: 11.5 }}>
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--ink60)' }}
                  >
                    {p.venue} ↗
                  </a>
                ) : (
                  p.venue
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ─── Section: gaps-detected ──────────────────────────────────────────────

export function GapsDetected({ payload }) {
  if (!payload.missing?.length) return null
  return (
    <Card style={{ borderLeft: '4px solid var(--warn)' }}>
      <SectionHead title="Lagunas detectadas" />
      <p style={{ margin: 0, fontSize: 12, color: 'var(--ink60)', fontStyle: 'italic' }}>
        Lo que el agente buscó y no pudo verificar en fuentes accesibles. Honestidad por defecto.
      </p>
      <ul style={{ margin: '10px 0 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
        {payload.missing.map((g, i) => (
          <li key={i} style={{ fontSize: 12.5 }}>
            <span style={{ fontWeight: 500, color: 'var(--ink80)' }}>{g.field}:</span>{' '}
            <span style={{ color: 'var(--ink60)' }}>{g.reason}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ─── Section: career timeline ────────────────────────────────────────────

export function CareerTimeline({ payload, sourceMap }) {
  const events = [...(payload.events || [])].sort((a, b) => a.date.localeCompare(b.date))
  if (events.length === 0) return null
  return (
    <Card>
      <SectionHead title="Cronología" />
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {events.map((e, i) => (
          <li
            key={`${e.date}-${i}`}
            style={{
              padding: '8px 0',
              borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none',
              display: 'flex',
              gap: 12,
              alignItems: 'baseline',
            }}
          >
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink50)', minWidth: 88 }}>
              {e.date}
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink80)' }}>
              {e.label}
              <CitationPills ids={e.sourceIds} sourceMap={sourceMap} />
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

// ─── Section: relationship graph (modal-zoomable) ────────────────────────

export function RelationshipGraph({ payload, sourceMap }) {
  const nodes = payload.nodes || []
  const edges = payload.edges || []
  const [zoomOpen, setZoomOpen] = useState(false)
  if (nodes.length === 0) return null
  const renderSvg = (size) => {
    const radius = size * 0.36
    const center = size / 2
    const subject = nodes[0]
    const others = nodes.slice(1)
    const positions = new Map()
    positions.set(subject.id, { x: center, y: center })
    others.forEach((n, i) => {
      const angle = (i / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2
      positions.set(n.id, {
        x: center + Math.cos(angle) * radius,
        y: center + Math.sin(angle) * radius,
      })
    })
    return (
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxHeight: size }}>
        {edges.map((e, i) => {
          const a = positions.get(e.from)
          const b = positions.get(e.to)
          if (!a || !b) return null
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--border)"
              strokeWidth={1.2}
            />
          )
        })}
        {nodes.map((n) => {
          const pos = positions.get(n.id) || { x: center, y: center }
          const tone = n.tone || 'neutral'
          const r = n.id === subject.id ? Math.max(20, size * 0.06) : Math.max(12, size * 0.035)
          return (
            <g key={n.id}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill={`var(--${tone}-soft, var(--soft))`}
                stroke={`var(--${tone})`}
                strokeWidth={1.5}
              />
              <text
                x={pos.x}
                y={pos.y + r + 14}
                textAnchor="middle"
                fontSize={Math.max(10, size * 0.022)}
                fill="var(--ink80)"
              >
                {n.label}
              </text>
            </g>
          )
        })}
      </svg>
    )
  }
  return (
    <Card>
      <SectionHead
        title="Relaciones"
        right={
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--ink60)',
              cursor: 'pointer',
            }}
          >
            Ampliar ↗
          </button>
        }
      />
      {renderSvg(520)}
      {edges.length > 0 && (
        <ul style={{ margin: '12px 0 0 0', padding: 0, listStyle: 'none', fontSize: 12 }}>
          {edges.slice(0, 12).map((e, i) => {
            const fromLabel = nodes.find((n) => n.id === e.from)?.label ?? e.from
            const toLabel = nodes.find((n) => n.id === e.to)?.label ?? e.to
            return (
              <li key={i} style={{ color: 'var(--ink60)', padding: '3px 0' }}>
                <span style={{ color: 'var(--ink80)' }}>{fromLabel}</span> · {e.relation} ·{' '}
                <span style={{ color: 'var(--ink80)' }}>{toLabel}</span>
                <CitationPills ids={e.sourceIds} sourceMap={sourceMap} />
              </li>
            )
          })}
        </ul>
      )}
      {zoomOpen && (
        <div
          role="dialog"
          aria-label="Relaciones (ampliado)"
          onClick={() => setZoomOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 200,
            display: 'grid',
            placeItems: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--paper)',
              borderRadius: 10,
              padding: 20,
              maxWidth: 880,
              width: '95vw',
              maxHeight: '92vh',
              overflow: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <strong style={{ fontSize: 16 }}>Relaciones</strong>
              <button
                type="button"
                onClick={() => setZoomOpen(false)}
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--ink60)',
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>
            {renderSvg(800)}
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Section: press sparkline ────────────────────────────────────────────

export function PressSparklineBlock({ payload }) {
  const points = payload.points || []
  const headlines = payload.headlines || []
  const values = points.map((p) => p.count)
  const xLabels =
    points.length > 0
      ? [points[0].date.slice(0, 4), points[points.length - 1].date.slice(0, 4)]
      : []
  const total = values.reduce((a, b) => a + b, 0)
  return (
    <Card>
      <SectionHead title="Cobertura de prensa" />
      {values.length > 0 ? (
        <>
          <div style={{ padding: '6px 0' }}>
            <Sparkline data={values} />
          </div>
          <div
            className="mono"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10.5,
              color: 'var(--ink50)',
            }}
          >
            <span>{xLabels[0]}</span>
            <span>
              {total} mención{total === 1 ? '' : 'es'}
            </span>
            <span>{xLabels[1]}</span>
          </div>
        </>
      ) : (
        <div style={{ color: 'var(--ink50)', fontSize: 12, padding: '8px 0' }}>
          Sin datos suficientes para una sparkline.
        </div>
      )}
      <ul style={{ margin: '10px 0 0 0', padding: 0, listStyle: 'none' }}>
        {headlines.slice(0, 8).map((h, i) => (
          <li
            key={i}
            style={{
              padding: '6px 0',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              display: 'flex',
              gap: 10,
              alignItems: 'baseline',
              fontSize: 12.5,
            }}
          >
            <span className="mono" style={{ color: 'var(--ink50)', minWidth: 78 }}>
              {h.date}
            </span>
            <a
              href={h.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--ink80)', flex: 1 }}
            >
              {h.title}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ─── Section: promise board ──────────────────────────────────────────────

export function PromiseMiniBoard({ payload }) {
  const ids = payload.promiseIds || []
  if (ids.length === 0) return null
  return (
    <Card>
      <SectionHead title="Promesas referenciadas" />
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {ids.map((id) => (
          <li key={id} style={{ padding: '4px 0', fontSize: 12.5 }}>
            <Link to={`/promesas#${id}`} style={{ color: 'var(--ink80)' }}>
              {id} →
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ─── Section: quote card ─────────────────────────────────────────────────

export function QuoteCard({ payload, sourceMap }) {
  return (
    <Card>
      <blockquote
        style={{
          margin: 0,
          padding: '8px 16px',
          borderLeft: '3px solid var(--civic)',
          color: 'var(--ink)',
          fontStyle: 'italic',
          fontSize: 16,
          lineHeight: 1.55,
        }}
      >
        “{payload.verbatim}”
      </blockquote>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink60)' }}>
        — <strong>{payload.attributedTo}</strong>
        {payload.date && <span className="mono"> · {payload.date}</span>}
        <CitationPills ids={[payload.sourceId]} sourceMap={sourceMap} />
      </div>
    </Card>
  )
}

// ─── Source ledger (sortable, full-width) ────────────────────────────────

export function SourceLedger({ sources }) {
  const [sort, setSort] = useState({ col: 'num', dir: 'asc' })
  const numByid = useMemo(() => {
    const m = new Map()
    sources.forEach((s, i) => m.set(s.id, i + 1))
    return m
  }, [sources])
  const sorted = useMemo(() => {
    const rows = sources.map((s) => ({ s, num: numByid.get(s.id) ?? 0 }))
    const dir = sort.dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      switch (sort.col) {
        case 'title':
          return dir * (a.s.title || '').localeCompare(b.s.title || '')
        case 'publisher':
          return dir * (a.s.publisher || '').localeCompare(b.s.publisher || '')
        case 'date':
          return dir * (a.s.publishedAt || '').localeCompare(b.s.publishedAt || '')
        case 'retrieved':
          return dir * (a.s.retrievedAt || '').localeCompare(b.s.retrievedAt || '')
        case 'trust':
          return dir * (a.s.trust || '').localeCompare(b.s.trust || '')
        default:
          return dir * (a.num - b.num)
      }
    })
    return rows
  }, [sources, sort, numByid])
  const onHeaderClick = (col) =>
    setSort((prev) =>
      prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' },
    )
  const header = (label, col) => (
    <th
      onClick={() => onHeaderClick(col)}
      style={{
        textAlign: 'left',
        padding: '8px 10px',
        cursor: 'pointer',
        userSelect: 'none',
        color: 'var(--ink50)',
        fontSize: 10.5,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        borderBottom: '1px solid var(--border)',
        background: 'var(--soft)',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {sort.col === col && <span style={{ marginLeft: 4 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
  return (
    <Card>
      <SectionHead title="Fuentes consultadas" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
          <thead>
            <tr>
              {header('#', 'num')}
              {header('Título', 'title')}
              {header('Editor', 'publisher')}
              {header('Publicado', 'date')}
              {header('Recuperado', 'retrieved')}
              {header('Confianza', 'trust')}
              <th
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  color: 'var(--ink50)',
                  fontSize: 10.5,
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--soft)',
                }}
              >
                Archivo
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ s, num }) => (
              <SourceRow key={s.id} src={s} num={num} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function SourceRow({ src, num }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr
        id={`src-${num}`}
        onClick={() => setOpen((v) => !v)}
        style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
      >
        <td
          className="mono"
          style={{ padding: '8px 10px', color: 'var(--ink60)', verticalAlign: 'top' }}
        >
          [{num}]
        </td>
        <td style={{ padding: '8px 10px', color: 'var(--ink80)', verticalAlign: 'top' }}>
          {src.url ? (
            <a
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: 'var(--ink80)' }}
            >
              {src.title}
            </a>
          ) : (
            src.title
          )}
        </td>
        <td style={{ padding: '8px 10px', color: 'var(--ink60)', verticalAlign: 'top' }}>
          {src.publisher ?? '—'}
        </td>
        <td
          className="mono"
          style={{ padding: '8px 10px', color: 'var(--ink60)', verticalAlign: 'top' }}
        >
          {src.publishedAt ?? '—'}
        </td>
        <td
          className="mono"
          style={{ padding: '8px 10px', color: 'var(--ink60)', verticalAlign: 'top' }}
        >
          {src.retrievedAt?.slice(0, 10) ?? '—'}
        </td>
        <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
          <Pill tone={CITATION_TRUST_TONE[src.trust] || 'ghost'} size="sm">
            {CITATION_KIND_LABEL[src.kind] || src.kind}
          </Pill>
        </td>
        <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
          {src.archiveUrl ? (
            <a
              href={src.archiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: 'var(--ink60)', fontSize: 11.5 }}
            >
              Wayback ↗
            </a>
          ) : src.localPath ? (
            <span className="mono" style={{ color: 'var(--ink50)', fontSize: 10.5 }}>
              local
            </span>
          ) : (
            <span style={{ color: 'var(--ink50)' }}>—</span>
          )}
        </td>
      </tr>
      {open && src.excerpt && (
        <tr>
          <td colSpan={7} style={{ padding: '4px 16px 12px 38px', background: 'var(--soft)' }}>
            <span style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--ink60)' }}>
              «{src.excerpt}»
            </span>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Legal sensitivity badge ─────────────────────────────────────────────

export function LegalSensitivityBadge({ level, warnings }) {
  const [open, setOpen] = useState(false)
  if (!level || level === 'low') return null
  const tone = LEGAL_SENSITIVITY_TONE[level] || 'ghost'
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Pill tone={tone}>{LEGAL_SENSITIVITY_LABEL[level] || level}</Pill>
        <span style={{ fontSize: 12, color: 'var(--ink60)' }}>
          Este informe trata sobre figuras vivas o asuntos legalmente sensibles. Las afirmaciones se
          publican con derecho de réplica abierto.
        </span>
        {warnings && warnings.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--ink60)',
              cursor: 'pointer',
            }}
          >
            {open ? 'Ocultar' : `Ver advertencias (${warnings.length})`}
          </button>
        )}
      </div>
      {open && warnings && (
        <ul style={{ margin: '10px 0 0 0', padding: 0, listStyle: 'none', fontSize: 11.5 }}>
          {warnings.map((w, i) => (
            <li key={i} style={{ padding: '2px 0', color: 'var(--ink60)' }}>
              · {w}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ─── Section dispatcher ──────────────────────────────────────────────────

export function ReportSectionRenderer({ section, sourceMap }) {
  switch (section.kind) {
    case 'portrait':
      return <PortraitHeader />
    case 'identity':
      return <IdentityCard payload={section.payload} sourceMap={sourceMap} />
    case 'education':
      return <EducationList payload={section.payload} sourceMap={sourceMap} />
    case 'career-political':
      return (
        <CareerLadder
          payload={section.payload}
          sourceMap={sourceMap}
          label="Trayectoria política"
          openLabel="presente"
        />
      )
    case 'career-professional':
      return (
        <CareerLadder
          payload={section.payload}
          sourceMap={sourceMap}
          label="Trayectoria profesional"
          openLabel=""
        />
      )
    case 'legal-record':
      return <LegalRecord payload={section.payload} sourceMap={sourceMap} />
    case 'financial':
      return <FinancialPanel payload={section.payload} sourceMap={sourceMap} />
    case 'online-presence':
      return <OnlinePresenceRow payload={section.payload} sourceMap={sourceMap} />
    case 'awards':
      return <AwardsList payload={section.payload} sourceMap={sourceMap} />
    case 'publications':
      return <PublicationsList payload={section.payload} sourceMap={sourceMap} />
    case 'gaps-detected':
      return <GapsDetected payload={section.payload} />
    case 'narrative':
      return <NarrativeBlock payload={section.payload} sourceMap={sourceMap} />
    case 'timeline':
      return <CareerTimeline payload={section.payload} sourceMap={sourceMap} />
    case 'relationships':
      return <RelationshipGraph payload={section.payload} sourceMap={sourceMap} />
    case 'press-sparkline':
      return <PressSparklineBlock payload={section.payload} />
    case 'promise-board':
      return <PromiseMiniBoard payload={section.payload} />
    case 'quote-card':
      return <QuoteCard payload={section.payload} sourceMap={sourceMap} />
    default:
      return null
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatYearSpan(start, end, openLabel = '') {
  if (start === undefined && end === undefined) return ''
  if (start !== undefined && end === undefined)
    return openLabel ? `${start}–${openLabel}` : `${start}`
  if (start === undefined && end !== undefined) return `?–${end}`
  return `${start}–${end}`
}
