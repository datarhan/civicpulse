import { useState } from 'react'
import { Pill } from '../../components/Primitives'
import { callCurator } from './shared'

/**
 * «Encaje declarado» review row — the human gate for the one surface in this
 * repo whose rows attach a judgement to a NAMED living person.
 *
 * The curator sees everything the model saw: the raw declared items it was
 * given, which of them it cited, and its stated criterion. That is deliberate —
 * approving a verdict you cannot audit is not review. The reason text is
 * published alongside the row, so a curator rejecting one is also rejecting the
 * sentence a reader would have seen.
 */

const TONE = {
  relacionada: 'ok',
  'sin-relacion-declarada': 'neutral',
  'no-consta': 'ghost',
}
const LABEL = {
  relacionada: 'relacionada',
  'sin-relacion-declarada': 'sin relación declarada',
  'no-consta': 'no consta',
}

function Assessment({ title, a }) {
  if (!a) return null
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--ink50)',
            minWidth: 96,
          }}
        >
          {title}
        </span>
        <Pill tone={TONE[a.value]}>{LABEL[a.value] ?? a.value}</Pill>
      </div>
      {a.evidence?.length > 0 && (
        <ul
          style={{
            margin: '4px 0 0 104px',
            padding: 0,
            listStyle: 'none',
            fontSize: 'var(--fs-aux)',
            lineHeight: 1.5,
            color: 'var(--ink70)',
          }}
        >
          {a.evidence.map((ev) => (
            <li key={ev.label}>
              ↳ {ev.label}{' '}
              <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                [{ev.sourceIds.join(', ')}]
              </span>
            </li>
          ))}
        </ul>
      )}
      {a.reason && (
        <div
          style={{
            margin: '4px 0 0 104px',
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            lineHeight: 1.45,
          }}
        >
          « {a.reason} »
        </div>
      )}
    </div>
  )
}

export function AreaFitRow({ row, official, published, onDone }) {
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState('')
  const [curator, setCurator] = useState('')

  const run = async (action) => {
    setErr(null)
    if (action !== 'reject' && !curator.trim()) {
      setErr('Firma obligatoria: esta fila nombra a una persona.')
      return
    }
    setBusy(action)
    const r = await callCurator('promote-area-fit', {
      official: row.officialSlug,
      area: row.portfolio,
      action,
      ...(action === 'reject' ? {} : { curator: curator.trim() }),
      ...(note.trim() && action === 'publish' ? { note: note.trim() } : {}),
    })
    setBusy(null)
    if (!r.ok || r.exitCode !== 0) {
      setErr(r.error || r.stderr?.slice(0, 300) || `salió con código ${r.exitCode}`)
      return
    }
    onDone?.()
  }

  return (
    <div
      style={{
        padding: '12px 14px',
        border: `1px solid ${published ? 'var(--ok-soft)' : 'var(--border2)'}`,
        borderRadius: 'var(--r-input)',
        marginBottom: 10,
        background: 'var(--paper)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 'var(--fs-aux)' }}>{official?.name ?? row.officialSlug}</strong>
        <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          {row.portfolio}
        </span>
        {published && (
          <Pill tone="ok" size="xs">
            publicada
          </Pill>
        )}
      </div>

      <Assessment title="Formación" a={row.formacion} />
      <Assessment title="Experiencia" a={row.experiencia} />

      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px dashed var(--border2)',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          value={curator}
          onChange={(e) => setCurator(e.target.value)}
          placeholder="Tu firma"
          aria-label="Nombre del curador que firma esta fila"
          style={{
            padding: '5px 8px',
            fontSize: 'var(--fs-meta)',
            borderRadius: 'var(--r-input)',
            border: '1px solid var(--border2)',
            background: 'var(--paper)',
            color: 'var(--ink)',
            width: 130,
          }}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota pública (opcional) — describe el criterio, nunca a la persona"
          aria-label="Nota del curador, se publica junto a la fila"
          style={{
            padding: '5px 8px',
            fontSize: 'var(--fs-meta)',
            borderRadius: 'var(--r-input)',
            border: '1px solid var(--border2)',
            background: 'var(--paper)',
            color: 'var(--ink)',
            flex: 1,
            minWidth: 200,
          }}
        />
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run('publish')}
          style={btn('var(--ok-ink)')}
        >
          {busy === 'publish' ? '…' : 'Publicar'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run('reject')}
          style={btn('var(--ink50)')}
        >
          {busy === 'reject' ? '…' : 'Rechazar'}
        </button>
        {published && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run('retract')}
            style={btn('var(--crit-ink)')}
          >
            {busy === 'retract' ? '…' : 'Retirar'}
          </button>
        )}
      </div>
      {err && (
        <div
          style={{ marginTop: 6, fontSize: 'var(--fs-meta)', color: 'var(--crit-ink)' }}
          role="alert"
        >
          {err}
        </div>
      )}
    </div>
  )
}

function btn(color) {
  return {
    padding: '5px 12px',
    fontSize: 'var(--fs-meta)',
    fontWeight: 600,
    borderRadius: 'var(--r-input)',
    border: '1px solid var(--border2)',
    background: 'var(--paper)',
    color,
    cursor: 'pointer',
  }
}
