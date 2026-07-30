// Journalist UI — the per-section renderers (one component per ReportSection
// kind) plus the formatYearSpan helper. Dispatched by ReportSectionRenderer
// in ./index.jsx.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, ExtLink, Pill, SectionHead } from '../Primitives'
import { Sparkline } from '../Charts'
import { CitationPills } from './Citations'
import { usePromises, STATUS_LABEL, STATUS_TONE } from '../../hooks/usePromises'

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
            <ExtLink href={a.url} style={{ color: 'var(--ink80)' }}>
              {a.handle}
            </ExtLink>
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
                  <ExtLink href={p.url} style={{ color: 'var(--ink60)' }}>
                    {p.venue} ↗
                  </ExtLink>
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
      <p style={{ margin: '0 0 6px 0', fontSize: 12, color: 'var(--ink60)', fontStyle: 'italic' }}>
        Hitos documentados de la biografía y del cargo, cada uno con su fuente.
      </p>
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
              {formatEventDate(e.date)}
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
            <ExtLink href={h.url} style={{ color: 'var(--ink80)', flex: 1 }}>
              {h.title}
            </ExtLink>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ─── Section: promise board ──────────────────────────────────────────────

export function PromiseMiniBoard({ payload }) {
  const ids = payload.promiseIds || []
  const promises = usePromises()
  if (ids.length === 0) return null
  // Resolve ids against the curated tracker so readers see the promise,
  // not a slug (operator review 2026-07-30: raw ids read as "not enough
  // data"). Unresolved ids fall back to the slug — honest, still linked.
  const byId = new Map((promises.data?.items ?? []).map((p) => [p.id, p]))
  return (
    <Card>
      <SectionHead title="Promesas referenciadas" />
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {ids.map((id) => {
          const p = byId.get(id)
          return (
            <li
              key={id}
              style={{ padding: '8px 0', borderBottom: '1px solid var(--border2)', fontSize: 12.5 }}
            >
              <Link
                to={`/promesas#${id}`}
                style={{ color: 'var(--ink)', textDecoration: 'none', display: 'block' }}
              >
                {p ? (
                  <>
                    <span style={{ display: 'block', lineHeight: 1.45 }}>
                      «{p.quote.length > 140 ? p.quote.slice(0, 140) + '…' : p.quote}»
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        gap: 6,
                        marginTop: 4,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <Pill tone={STATUS_TONE[p.status] || 'ghost'}>
                        {STATUS_LABEL[p.status] || p.status}
                      </Pill>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
                        {p.party} · {(p.madeAt || '').slice(0, 10)}
                      </span>
                    </span>
                  </>
                ) : (
                  <span style={{ color: 'var(--ink60)' }}>{id} →</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ─── Section: quote card ─────────────────────────────────────────────────

export function QuoteCard({ payload, sourceMap, withHead = false }) {
  const src = sourceMap?.get?.(payload.sourceId)
  return (
    <Card>
      {withHead && (
        <>
          <SectionHead title="Citas literales" />
          <p
            style={{
              margin: '0 0 10px 0',
              fontSize: 12,
              color: 'var(--ink60)',
              fontStyle: 'italic',
            }}
          >
            Fragmentos textuales de los documentos y entrevistas citados, reproducidos sin editar.
          </p>
        </>
      )}
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
        {payload.date && <span className="mono"> · {formatEventDate(payload.date)}</span>}
        <CitationPills ids={[payload.sourceId]} sourceMap={sourceMap} />
      </div>
      {src && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--ink50)' }}>
          Fuente: {src.title}
          {src.url && (
            <>
              {' '}
              <a
                href={src.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--civic)', textDecoration: 'none' }}
              >
                ver original ↗
              </a>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────

// ISO date → «9 abr 1966». Noon anchor avoids TZ day-shift; falls back to
// the raw string on anything unparseable.
function formatEventDate(iso) {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatYearSpan(start, end, openLabel = '') {
  if (start === undefined && end === undefined) return ''
  if (start !== undefined && end === undefined)
    return openLabel ? `${start}–${openLabel}` : `${start}`
  if (start === undefined && end !== undefined) return `?–${end}`
  return `${start}–${end}`
}
