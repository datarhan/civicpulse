import { useState } from 'react'
import { Pill } from '../../components/Primitives'
import { ROTULO_CITA_RETENIDA } from '../../lib/cita-retenida'

/**
 * «¿Dice el sumario, con otras palabras, lo que la cita retenida no puede
 * decir?» — la fila de una ficha publicada con al menos una cita cuyo literal
 * retiene la puerta editorial.
 *
 * Desde el 27-08-2026 la ficha pinta esa cita como el hueco «Literal
 * retenido», la haya promovido quien la haya promovido. Lo que la puerta no
 * alcanza es el sumario: prosa del sitio, al lado del hueco. `check:summary-gate`
 * y la criba de 40 caracteres cazan la copia; la paráfrasis es de una persona,
 * y esta fila le pone delante lo que necesita para verla. Arriba, el sumario
 * publicado, que es lo que se juzga; debajo, cada cita con el veredicto de la
 * puerta y el del verificador, y las retenidas marcadas. Aquí se lee el literal
 * retenido, que la página no imprime: sin leerlo no se puede cotejar.
 *
 * Hasta el 30-09-2026 la fila preguntaba «¿merece este hallazgo la
 * excepción?», una pregunta que la puerta ya había dejado sin efecto, y
 * rotulaba las citas «Literales publicados» cuando las retenidas no lo están.
 *
 * Y no elige. Ninguna fila llega marcada, el orden es cronológico y no hay
 * puntuación. Las cuatro respuestas llegan compuestas —mantener, corregir el
 * sumario, reclasificar una cita, retirar la ficha— para que las firme una
 * persona en su terminal; ninguna se ejecuta desde aquí.
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
        border-radius: var(--r-input);
        margin-bottom: 6px;
        background: var(--paper);
      }
      .feq-quote[data-retenida='true'] {
        border-left: 3px solid var(--warn-ink);
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
        fontSize: 'var(--fs-micro)',
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
        fontSize: 'var(--fs-aux)',
        lineHeight: 1.5,
        padding: '6px 8px',
        background: 'var(--soft)',
        borderRadius: 'var(--r-input)',
        color: 'var(--ink70)',
        wordBreak: 'break-word',
      }}
    >
      {cmd}
    </code>
  )
}

/** Una respuesta: qué significa elegirla, y la orden que la aplica. */
function Respuesta({ titulo, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Label>{titulo}</Label>
      {children}
    </div>
  )
}

function QuoteRow({ q }) {
  return (
    <div className="feq-quote" data-retenida={q.retenida ? 'true' : 'false'}>
      <div>
        <div
          style={{
            fontSize: 'var(--fs-aux)',
            lineHeight: 1.5,
            color: 'var(--ink70)',
          }}
        >
          «{q.text}»
        </div>
        <div
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 4 }}
        >
          [{q.index}] {q.speakerGroup || 'sin grupo atribuido'} · {q.claimId || 'sin claim'}
        </div>
        {/* Lo que el lector ve en su lugar: el literal sólo se lee aquí. */}
        {q.retenida && (
          <div
            className="mono"
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--warn-ink)', marginTop: 2 }}
          >
            en la página: el hueco «{ROTULO_CITA_RETENIDA}»
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Pill tone={GATE_TONE[q.gate] || 'neutral'} size="xs">
          {GATE_LABEL[q.gate] || `puerta: ${q.gate ?? 'sin veredicto'}`}
        </Pill>
        <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          verificador: {q.verdict ?? '—'}
        </span>
        <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          {q.claimType ?? '—'}
          {q.accusationSubtype ? ` · ${q.accusationSubtype}` : ''}
        </span>
        {/* El otro eje de la misma cita: si además procede de una
            transcripción superada, el curador lo tiene que saber aquí y no en
            otra pantalla. */}
        {q.transcriptStatus && q.transcriptStatus !== 'en-vigente' && (
          <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--warn-ink)' }}>
            transcripción: {q.transcriptStatus}
          </span>
        )}
      </div>
    </div>
  )
}

export function FindingExceptionRow({ row }) {
  const [open, setOpen] = useState(false)
  const reclasificables = row.quotes.filter((q) => q.reclasificar)
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          {row.plenoDate} · {row.plenoId}
        </span>
        <Pill tone="neutral" size="xs">
          {row.severity}
        </Pill>
        {/* Quién la firmó: casi todas `auto-curation-v1`, que redactó también
            el sumario que se juzga. */}
        <Pill tone={row.curatorName.startsWith('auto') ? 'warn' : 'ghost'} size="xs">
          {row.curatorName}
        </Pill>
        {row.todasRetenidas && (
          <Pill tone="crit" size="xs">
            todas sus citas retenidas
          </Pill>
        )}
        {row.conReplica && (
          <Pill tone="intel" size="xs">
            con réplica
          </Pill>
        )}
        <span
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginLeft: 'auto' }}
        >
          {row.citasRetenidas} de {row.quotes.length} retenidas
        </span>
      </div>
      <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 600, lineHeight: 1.35, marginTop: 6 }}>
        {row.title}
      </div>
      <div style={{ marginTop: 8 }}>
        <Label>Sumario publicado — es lo que se juzga</Label>
        <div style={{ fontSize: 'var(--fs-aux)', lineHeight: 1.55, color: 'var(--ink70)' }}>
          {row.summary}
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Label>
          Citas de la ficha · veredicto de la puerta y del verificador ({row.quotes.length}) — la
          página no imprime las retenidas; aquí se leen para cotejarlas
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
          fontSize: 'var(--fs-micro)',
          padding: '4px 10px',
          border: '1px solid var(--border2)',
          background: 'var(--paper)',
          borderRadius: 'var(--r-input)',
          color: 'var(--civic)',
          cursor: 'pointer',
        }}
      >
        {open ? 'ocultar las respuestas' : 'ver las respuestas'}
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Respuesta titulo="Mantener — el sumario no lo dice. Se ata a este sumario: si cambia, la ficha vuelve">
            <Command cmd={row.commands.mantener} />
          </Respuesta>
          <Respuesta titulo="Corregir el sumario — con --redact: el sumario viejo no queda legible en la bitácora pública">
            <Command cmd={row.commands.corregirSumario} />
          </Respuesta>
          {reclasificables.length > 0 && (
            <Respuesta titulo="Reclasificar una cita retenida — si no era una acusación; la puerta deja de retenerla">
              {reclasificables.map((q) => (
                <Command key={q.index} cmd={q.reclasificar} />
              ))}
            </Respuesta>
          )}
          <Respuesta titulo="Retirar la ficha — la ficha es su acusación. Sin vuelta atrás">
            <Command cmd={row.commands.retirarHallazgo} />
          </Respuesta>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              lineHeight: 1.5,
            }}
          >
            Órdenes compuestas, no ejecutadas: rellena los huecos y fírmalas tú en tu terminal. Los
            huecos son cortos a propósito: sin rellenar, cada CLI rechaza la orden antes de escribir
            nada. El motivo de corregir y el de retirar se publican con la ficha —en su bitácora o
            en su lápida—: di el criterio, nunca el material. Esas dos aceptan{' '}
            <code>--dry-run</code> para leer la orden antes de firmarla.
          </p>
        </div>
      )}
    </div>
  )
}
