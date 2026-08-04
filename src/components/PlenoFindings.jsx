import { Card, Pill, SectionHead, ExtLink } from './Primitives'
import { usePlenoFindings, SEVERITY_LABEL, SEVERITY_TONE } from '../hooks/usePlenoFindings'
import { blocLabel } from '../lib/party-label.js'

/**
 * The documents a finding was cross-checked against.
 *
 * The heading used to read «Corrobora», which asserted a verdict the slot does
 * not carry. `corroboration[]` is not a filtered list of documents that agree:
 * `auto-curate.ts` fills it with EVERY verifier evidence ref for the cited
 * quotes — agreeing or not — plus the pleno video itself. Six published
 * findings therefore stamped «CORROBORA» over documents their own prose calls
 * insufficient: `f-2026-07-03-cit-1e90e0` says «sin corroboración documental»
 * above three tenders (the register holds no FCC contract at all), and
 * `f-2025-10-06-acu-b00839` says the cited contract «no documenta el sistema
 * COMETA». Being checked is not agreeing.
 *
 * The heading now names the list; whether those documents corroborate is what
 * each finding's own summary is for. The green `--ok-ink` went with it — a
 * colour asserts a verdict just as loudly as a word.
 *
 * Shared with `/hallazgos`, which imports this: the same component was
 * duplicated verbatim in `pages/Hallazgos.jsx`, so the first fix reached only
 * one of the two surfaces that render it.
 */
export function RefList({ refs, kind }) {
  if (!refs || refs.length === 0) return null
  const isCorroboration = kind === 'corroboration'
  const label = isCorroboration ? 'Documentos cotejados' : 'Documentos que contradicen'
  const tone = isCorroboration ? 'var(--ink60)' : 'var(--crit-ink)'
  return (
    <div style={{ marginTop: 6 }}>
      <div
        className="mono"
        style={{
          fontSize: 9,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: tone,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {refs.map((r, i) => {
        const isUrl = /^https?:\/\//.test(r.ref)
        const body = (
          <>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink50)', marginRight: 6 }}>
              {r.kind.toUpperCase()}
            </span>
            <span style={{ fontSize: 12 }}>{r.snippet}</span>
          </>
        )
        return isUrl ? (
          <ExtLink
            key={i}
            href={r.ref}
            style={{ display: 'block', padding: '2px 0', textDecoration: 'none', color: 'inherit' }}
          >
            {body}
          </ExtLink>
        ) : (
          <div key={i} style={{ padding: '2px 0' }}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

export function FindingCard({ f }) {
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
            <Pill tone={SEVERITY_TONE[f.severity] || 'neutral'} size="xs">
              {SEVERITY_LABEL[f.severity] || f.severity}
            </Pill>
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
              {f.plenoDate} · editado por {f.curatorName}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{f.title}</div>
        </div>
      </div>
      <p
        style={{
          fontSize: 12.5,
          color: 'var(--ink80)',
          marginTop: 8,
          lineHeight: 1.55,
        }}
      >
        {f.summary}
      </p>
      {f.quotes?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {f.quotes.slice(0, 3).map((q, i) => (
            <blockquote
              key={i}
              style={{
                margin: '6px 0 0',
                padding: '6px 10px',
                borderLeft: '3px solid var(--border)',
                fontSize: 12,
                color: 'var(--ink70)',
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}
            >
              «{q.text}»{' '}
              {q.speakerGroup && (
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    fontStyle: 'normal',
                    color: 'var(--ink50)',
                    marginLeft: 6,
                  }}
                >
                  {blocLabel(q.speakerGroup)}
                </span>
              )}
            </blockquote>
          ))}
        </div>
      )}
      <RefList refs={f.corroboration} kind="corroboration" />
      <RefList refs={f.contradiction} kind="contradiction" />
      {f.response && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            background: 'var(--soft)',
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--ink)',
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 9,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'var(--ink50)',
              marginBottom: 2,
            }}
          >
            Réplica de {f.response.from} · {f.response.respondedAt}
          </div>
          «{f.response.quote}»
        </div>
      )}
    </Card>
  )
}

export function PlenoFindingsSection() {
  const { loading, data } = usePlenoFindings()
  if (loading) return null
  const items = data?.items ?? []
  if (items.length === 0) return null
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHead
        eyebrow="Hallazgos editoriales verificados"
        title="Contrastes curados sobre declaraciones en el pleno"
      />
      <p
        style={{
          fontSize: 12,
          color: 'var(--ink60)',
          marginTop: 4,
          marginBottom: 10,
          maxWidth: 720,
          lineHeight: 1.5,
        }}
      >
        Un hallazgo toma una o más declaraciones extraídas automáticamente del pleno y las sitúa en
        su contexto documental (contratos, subvenciones, presupuesto, promesas). La mayoría los
        redacta un proceso automático bajo reglas fijas; el pie de cada ficha dice quién la editó, y
        un nombre como «auto-curation-v1» significa que el texto lo escribió una máquina. Cada
        hallazgo cita literales verbatim, lista los documentos con los que se ha cotejado —lo
        corroboren o no— y permite réplica literal de los grupos afectados.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((f) => (
          <FindingCard key={f.id} f={f} />
        ))}
      </div>
    </section>
  )
}
