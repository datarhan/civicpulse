import { Card, Pill, SectionHead } from './Primitives'
import {
  usePlenoClaims,
  CLAIM_TYPE_LABEL,
  CLAIM_TYPE_TONE,
  VERDICT_LABEL,
  VERDICT_TONE,
} from '../hooks/usePlenoClaims'

function formatEuros(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return ''
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' M €'
  if (n >= 1000) return (n / 1000).toFixed(0) + ' K €'
  return n.toFixed(0) + ' €'
}

function EvidenceRow({ e }) {
  const kindLabel =
    {
      tender: 'Contrato',
      bdns: 'Subvención BDNS',
      budget: 'Presupuesto',
      promise: 'Promesa documentada',
      'prior-claim': 'Pleno anterior',
    }[e.kind] || e.kind
  const body = (
    <>
      <span
        className="mono"
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '.1em',
          color: 'var(--ink50)',
          marginRight: 6,
        }}
      >
        {kindLabel.toUpperCase()}
      </span>
      <span style={{ fontSize: 12, color: 'var(--ink)' }}>{e.snippet}</span>
      {typeof e.similarity === 'number' && (
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginLeft: 6 }}>
          sim {e.similarity.toFixed(2)}
        </span>
      )}
    </>
  )
  if (e.ref && /^https?:\/\//.test(e.ref)) {
    return (
      <a
        href={e.ref}
        target="_blank"
        rel="noreferrer"
        style={{ display: 'block', padding: '4px 0', textDecoration: 'none', color: 'inherit' }}
      >
        {body}
      </a>
    )
  }
  return <div style={{ padding: '4px 0' }}>{body}</div>
}

function ClaimCard({ item }) {
  const { claim, verification } = item
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <Pill tone={CLAIM_TYPE_TONE[claim.type] || 'neutral'} size="xs">
              {CLAIM_TYPE_LABEL[claim.type] || claim.type}
            </Pill>
            {claim.speakerGroup && (
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  color: 'var(--ink60)',
                  textTransform: 'uppercase',
                }}
              >
                {claim.speakerGroup}
              </span>
            )}
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
              {claim.plenoDate}
            </span>
            {claim.entities.amountEuros && (
              <span
                className="mono"
                style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink)' }}
              >
                {formatEuros(claim.entities.amountEuros)}
              </span>
            )}
            {claim.entities.count && claim.entities.countUnit && (
              <span
                className="mono"
                style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink)' }}
              >
                {claim.entities.count} {claim.entities.countUnit}
              </span>
            )}
          </div>
          <blockquote
            style={{
              margin: '4px 0 0',
              padding: '6px 10px',
              borderLeft: '3px solid var(--border)',
              fontSize: 13,
              color: 'var(--ink80)',
              lineHeight: 1.45,
              fontStyle: 'italic',
            }}
          >
            «{claim.verbatim}»
          </blockquote>
        </div>
        <Pill tone={VERDICT_TONE[verification.verdict] || 'neutral'} size="xs">
          {VERDICT_LABEL[verification.verdict] || verification.verdict}
        </Pill>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 8, lineHeight: 1.5 }}>
        {verification.summary}
      </div>
      {verification.evidence.length > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px dashed var(--border2)',
          }}
        >
          {verification.evidence.map((e, i) => (
            <EvidenceRow key={i} e={e} />
          ))}
        </div>
      )}
      <div
        className="mono"
        style={{
          marginTop: 8,
          fontSize: 9.5,
          color: 'var(--ink50)',
          letterSpacing: '.06em',
        }}
      >
        Fuentes comprobadas: {verification.checkedAgainst.join(' · ') || 'ninguna'}
      </div>
    </Card>
  )
}

/**
 * The claim ledger block. Accepts an optional filter function to narrow to
 * a specific pleno or topic; without a filter shows the whole snapshot.
 *
 * Renders an honest empty state when pleno-claims-verified.json doesn't
 * exist yet — the pipeline hasn't been run, not that the government is
 * clean. Copy explains the distinction.
 */
export function ClaimLedger({ filter, limit = 20, emptyHint }) {
  const { loading, data } = usePlenoClaims()
  if (loading) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: 'var(--ink50)' }}>
        Cargando verificaciones…
      </div>
    )
  }
  const items = (data?.items ?? []).filter(filter ?? (() => true))
  if (items.length === 0) {
    return (
      <div
        style={{
          padding: 14,
          background: 'var(--soft)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--ink60)',
          lineHeight: 1.5,
        }}
      >
        {emptyHint ||
          'Sin declaraciones verificadas todavía. Ejecuta `npm run extract:pleno-claims -- <plenoId>` y luego `npm run verify:pleno-claims` para poblar este registro.'}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.slice(0, limit).map((it) => (
        <ClaimCard key={it.claim.id} item={it} />
      ))}
      {items.length > limit && (
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink50)' }}>
          + {items.length - limit} declaraciones más (ver fichero raw pleno-claims-verified.json)
        </div>
      )}
    </div>
  )
}

export function ClaimLedgerSection({ filter, limit, title, eyebrow, hint }) {
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHead
        eyebrow={eyebrow || 'Verificación automática de declaraciones'}
        title={title || 'Declaraciones hechas en el pleno · contraste con los datos'}
      />
      {hint && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink60)',
            marginTop: 4,
            marginBottom: 10,
            lineHeight: 1.5,
            maxWidth: 720,
          }}
        >
          {hint}
        </p>
      )}
      <ClaimLedger filter={filter} limit={limit} />
    </section>
  )
}
