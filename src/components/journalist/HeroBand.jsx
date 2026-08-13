// Journalist UI — full-width hero band (portrait, party, quick facts, actions).
import { ExtLink, Pill } from '../Primitives'
import { ageFromDate, formatEventDate } from './Sections'

const fmtEur = (n) => `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`

// «Lo esencial» — at-a-glance facts computed strictly from the report's
// structured payloads (no new claims); each chip deep-links to the section
// that carries the citation.
function KeyFactsStrip({ report, tone }) {
  const fin = report.sections.find((s) => s.kind === 'financial')?.payload?.items ?? []
  const salary = fin
    .filter((i) => i.metric === 'salary' && i.amountEuros != null)
    .sort((a, b) => b.year - a.year)[0]
  const assets = fin.find((i) => i.metric === 'declared-assets' && i.amountEuros != null)
  const business = fin.find((i) => i.metric === 'business' && /^sin\b/i.test(i.description || ''))
  const career = report.sections.find((s) => s.kind === 'career-political')?.payload?.items ?? []
  const startYears = career.map((c) => c.startYear).filter(Boolean)
  const firstYear = startYears.length ? Math.min(...startYears) : null
  const identity = report.sections.find((s) => s.kind === 'identity')?.payload
  const age = identity?.dateOfBirth ? ageFromDate(identity.dateOfBirth) : null

  const facts = []
  if (age != null) facts.push({ k: 'Edad', v: `${age} años`, href: '#sec-identity' })
  if (firstYear)
    facts.push({ k: 'En el cargo', v: `desde ${firstYear}`, href: '#sec-career-political' })
  if (salary)
    facts.push({ k: 'Retribución', v: `${fmtEur(salary.amountEuros)}/año`, href: '#sec-financial' })
  if (assets)
    facts.push({
      k: 'Patrimonio declarado',
      v: `${fmtEur(assets.amountEuros)} activo`,
      href: '#sec-financial',
    })
  if (business)
    facts.push({ k: 'Actividad empresarial', v: 'ninguna declarada', href: '#sec-financial' })
  if (facts.length === 0) return null

  return (
    <div
      style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}
    >
      {facts.map((f) => (
        <a
          key={f.k}
          href={f.href}
          style={{
            textDecoration: 'none',
            padding: '8px 14px',
            borderRadius: 'var(--r-input)',
            border: '1px solid var(--border)',
            background: 'var(--paper)',
            minWidth: 120,
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--ink50)',
            }}
          >
            {f.k}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 'var(--fs-body)',
              fontWeight: 650,
              color: `var(--${tone}, var(--ink))`,
            }}
          >
            {f.v}
          </div>
        </a>
      ))}
    </div>
  )
}

// ─── Hero band ───────────────────────────────────────────────────────────

export function HeroBand({ subjectName, portraitPayload, report, party, soulDownloadUrl }) {
  const tone = portraitPayload?.partyTone || 'civic'
  const identity = report.sections.find((s) => s.kind === 'identity')?.payload
  const careerItems =
    report.sections.find((s) => s.kind === 'career-political')?.payload?.items ?? []
  // Prefer the CURRENT (open-ended) mandate over the first row — the 2019
  // row's long role string made the subtitle unreadable (2026-07-31 review).
  const lastCareer = careerItems.find((c) => c.endYear == null) ?? careerItems[0]
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
              borderRadius: 'var(--r-input)',
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
                color: 'var(--ink50)',
              }}
            >
              {lastCareer.role} en {lastCareer.org}
              {lastCareer.startYear && ` · desde ${lastCareer.startYear}`}
            </p>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {party && <Pill tone={tone}>{party}</Pill>}
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
                fontSize: 'var(--fs-meta)',
                color: 'var(--ink50)',
              }}
            >
              {identity.dateOfBirth && (
                <span>
                  <span aria-hidden="true">🎂</span> {formatEventDate(identity.dateOfBirth)}
                  {ageFromDate(identity.dateOfBirth) != null &&
                    ` (${ageFromDate(identity.dateOfBirth)} años)`}
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
              <ExtLink href={portraitPayload.cvUrl} style={heroActionStyle}>
                CV oficial ↗
              </ExtLink>
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
          <KeyFactsStrip report={report} tone={tone} />
        </div>
      </div>
    </section>
  )
}

const heroActionStyle = {
  fontSize: 'var(--fs-meta)',
  padding: '8px 14px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--border)',
  background: 'var(--paper)',
  color: 'var(--ink70)',
  textDecoration: 'none',
}
