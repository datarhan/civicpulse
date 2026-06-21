// Journalist UI — full-width hero band (portrait, party, quick facts, actions).
import { ExtLink, Pill } from '../Primitives'

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
