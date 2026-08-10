import { useState } from 'react'
import { Pill } from '../../components/Primitives'

/**
 * «¿Merece este hallazgo la excepción?» — la fila de un hallazgo publicado que
 * no cita ni un solo literal que la puerta editorial mostraría.
 *
 * `claim-public-gate.ts` retiene una declaración cuando es una acusación
 * pública que el verificador no pudo respaldar. Su cabecera dice cuál es la
 * única vía para saltarla: promoverla a hallazgo, «precisely because a person
 * is standing in it». En 39 de los 52 hallazgos no había nadie: los firma
 * `auto-curation-v1`.
 *
 * La pantalla pone el veredicto de la puerta y el del verificador EN LA MISMA
 * FILA que la cita, porque son la pregunta entera: una acusación sin ningún
 * dato detrás y una afirmación ordinaria sin datos no son lo mismo, y leídas
 * por separado se confunden. Arriba va el sumario publicado, que es lo que de
 * verdad se está juzgando — las citas son su evidencia, no su enunciado.
 *
 * Y no elige. No hay botón de «retirar», ninguna fila llega marcada, el orden
 * es cronológico y no hay puntuación de gravedad. Decidido algo, la pantalla
 * compone el comando de `correct-pleno-finding` para que lo ejecute una persona
 * en su terminal, donde queda en la bitácora pública de la ficha.
 */

/**
 * Las dos columnas son el instrumento, así que su regla responsive tiene que
 * vivir en CSS real: un `style` inline no admite media queries y gana a
 * cualquier clase.
 */
export function FindingExceptionStyles() {
  return (
    <style>{`
      .feq-quote {
        display: grid;
        grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);
        gap: 12px;
        align-items: start;
        padding: 8px 10px;
        border: 1px solid var(--border2);
        border-radius: 6px;
        margin-bottom: 6px;
        background: var(--card);
      }
      @media (max-width: 900px) {
        .feq-quote { grid-template-columns: minmax(0, 1fr); }
      }
    `}</style>
  )
}

/** Lo que haría la puerta, con su nombre propio. Sin puntuación ni ranking. */
const GATE_LABEL = {
  shown: 'la publicaría',
  toggle: 'sin contraste',
  hidden: 'la retiene · acusación',
}
const GATE_TONE = { shown: 'ok', toggle: 'ghost', hidden: 'warn' }

function Label({ children }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: 10,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        color: 'var(--ink50)',
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  )
}

function Command({ cmd }) {
  return (
    <code
      style={{
        display: 'block',
        fontSize: 10.5,
        lineHeight: 1.5,
        padding: '6px 8px',
        background: 'var(--soft)',
        borderRadius: 4,
        color: 'var(--ink70)',
        wordBreak: 'break-word',
      }}
    >
      {cmd}
    </code>
  )
}

function QuoteRow({ q }) {
  return (
    <div className="feq-quote">
      <div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink80)', fontStyle: 'italic' }}>
          «{q.text}»
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginTop: 4 }}>
          [{q.index}] {q.speakerGroup || 'sin grupo atribuido'} · {q.claimId || 'sin claim'}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Pill tone={GATE_TONE[q.gate] || 'neutral'} size="xs">
          {GATE_LABEL[q.gate] || `puerta: ${q.gate ?? 'sin veredicto'}`}
        </Pill>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink60)' }}>
          verificador: {q.verdict ?? '—'}
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
          {q.claimType ?? '—'}
          {q.accusationSubtype ? ` · ${q.accusationSubtype}` : ''}
        </span>
        {/* El otro eje de la misma cita: si además procede de una
            transcripción superada, el curador lo tiene que saber aquí y no en
            otra pantalla. */}
        {q.transcriptStatus && q.transcriptStatus !== 'en-vigente' && (
          <span className="mono" style={{ fontSize: 10, color: 'var(--warn-ink)' }}>
            transcripción: {q.transcriptStatus}
          </span>
        )}
      </div>
    </div>
  )
}

export function FindingExceptionRow({ row }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border2)',
        borderRadius: 8,
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink60)' }}>
          {row.plenoDate} · {row.plenoId}
        </span>
        <Pill tone="neutral" size="xs">
          {row.severity}
        </Pill>
        {/* El nombre del firmante no es metadato aquí: `auto-curation-v1` ES el
            motivo por el que la ficha está en esta cola. */}
        <Pill tone={row.curatorName.startsWith('auto') ? 'warn' : 'ghost'} size="xs">
          {row.curatorName}
        </Pill>
        {row.ningunaCitaContrastada && (
          <Pill tone="crit" size="xs">
            ninguna cita contrastada
          </Pill>
        )}
        {row.conReplica && (
          <Pill tone="intel" size="xs">
            con réplica
          </Pill>
        )}
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginLeft: 'auto' }}>
          {row.citasMostrables}/{row.quotes.length} mostrables
        </span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, marginTop: 6 }}>
        {row.title}
      </div>
      <div style={{ marginTop: 8 }}>
        <Label>Sumario publicado — es lo que se está juzgando</Label>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--ink80)' }}>{row.summary}</div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Label>
          Literales publicados · veredicto de la puerta y del verificador ({row.quotes.length})
        </Label>
        {row.quotes.map((q) => (
          <QuoteRow key={q.index} q={q} />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mono"
        style={{
          marginTop: 4,
          fontSize: 11,
          padding: '4px 10px',
          border: '1px solid var(--border2)',
          background: 'var(--paper)',
          borderRadius: 6,
          color: 'var(--civic)',
          cursor: 'pointer',
        }}
      >
        {open ? 'ocultar comandos' : 'ver comandos de corrección'}
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Label>Matizar el sumario</Label>
          <Command cmd={row.commands.corregirSumario} />
          <Label>Retirar un literal — el índice más alto primero, la CLI renumera</Label>
          {row.quotes.map((q) => (
            <Command key={q.index} cmd={q.removeCommand} />
          ))}
        </div>
      )}
    </div>
  )
}
