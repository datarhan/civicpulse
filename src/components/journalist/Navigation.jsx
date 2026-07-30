// Journalist UI — page framing: sticky scroll-spy TOC, facts sidebar, legal badge.
import { useEffect, useState } from 'react'
import { Card, Pill } from '../Primitives'
import { ageFromDate, formatEventDate } from './Sections'
import { LEGAL_SENSITIVITY_LABEL, LEGAL_SENSITIVITY_TONE } from '../../hooks/useJournalistReports'

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
    const age = ageFromDate(identity.dateOfBirth)
    rows.push({
      label: 'Nacimiento',
      value: (
        <>
          {formatEventDate(identity.dateOfBirth)}
          {age != null && <span style={{ color: 'var(--ink50)' }}> · {age} años</span>}
        </>
      ),
    })
  }
  if (identity?.birthplace) {
    rows.push({ label: 'Lugar', value: identity.birthplace })
  }
  {
    // Current (open-ended) mandate wins over the first historical row.
    const c = careerPol.find((i) => i.endYear == null) ?? careerPol[0]
    if (c) {
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
      label: 'Promesas (partido)',
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
    value: `${report.sources.length} citadas`,
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
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, fontSize: 11.5, fontStyle: 'italic', color: 'var(--ink60)' }}>
            Límites de verificación que el proceso editorial señala en lugar de omitir:
          </p>
          <ul style={{ margin: '6px 0 0 0', padding: 0, listStyle: 'none', fontSize: 11.5 }}>
            {warnings.map((w, i) => (
              <li key={i} style={{ padding: '2px 0', color: 'var(--ink60)' }}>
                · {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
