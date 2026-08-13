import { useState } from 'react'
import { Pill } from '../../components/Primitives'
import { QuoteMarks } from './shared'

/**
 * «¿Cuál de estos pasajes es la cita?» — la fila de reanclaje de un literal
 * publicado en /hallazgos.
 *
 * 95 de los 177 literales del sitio constan en la transcripción que su sesión
 * tenía ANTES de re-transcribirse, y no en la vigente. En casi todas esas
 * sesiones el texto nuevo es más extenso, así que la ausencia no es falta de
 * cobertura: el primer motor oía mal. El caso de manual es `10yl550`, donde
 * «Está tombada» se publicó como «Es un satombat».
 *
 * La pantalla pone el literal publicado y los pasajes del texto nuevo a la
 * MISMA ALTURA, por lo mismo que la cola de «¿lo sostiene?»: leídos en
 * secuencia, dos frases parecidas se confunden; puestas al lado, la diferencia
 * salta. Debajo de cada candidato van las palabras de la cita que NO están en
 * él, que es lo que separa «lo mismo dicho mejor» de «otro momento del debate».
 *
 * Y no elige. No hay botón de «usar éste», ninguna fila llega preseleccionada y
 * el orden es solapamiento de palabras, no un veredicto — la cabecera de la
 * sección lo dice con todas las letras. Elegido un pasaje, la pantalla compone
 * el comando de `correct-pleno-finding --field quote.<i>.text` para que lo
 * ejecute una persona en su terminal.
 */

/**
 * Las dos columnas son el instrumento, así que su regla responsive tiene que
 * vivir en CSS real: un `style` inline no admite media queries y gana a
 * cualquier clase.
 */
export function QuoteReanchorStyles() {
  return (
    <style>{`
      .qrq-split {
        display: grid;
        grid-template-columns: minmax(0, 4fr) minmax(0, 6fr);
        gap: 14px;
        align-items: start;
        margin-top: 8px;
      }
      @media (max-width: 900px) {
        .qrq-split { grid-template-columns: minmax(0, 1fr); }
      }
    `}</style>
  )
}

const STATUS_LABEL = {
  'solo-en-sustituida': 'sólo en la transcripción sustituida',
  'sin-determinar': 'no se puede situar',
}
const STATUS_TONE = {
  'solo-en-sustituida': 'warn',
  'sin-determinar': 'ghost',
}

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

function CandidateCard({ c }) {
  return (
    <div
      style={{
        padding: '8px 10px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
        marginBottom: 6,
        background: 'var(--card)',
      }}
    >
      <div
        style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}
      >
        <Pill tone="ghost" size="xs">
          #{c.rank}
        </Pill>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink70)' }}>
          {c.timecode}
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
          {c.speakers?.length > 0 ? c.speakers.join(' · ') : 'sin hablante etiquetado'}
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
          solapamiento léxico {Math.round((c.contentOverlap ?? 0) * 100)}%
        </span>
        {c.matchesSupersededTimecode && (
          <Pill tone="intel" size="xs">
            misma marca de tiempo
          </Pill>
        )}
      </div>
      {/* Verbatim de la transcripción vigente: ni recortado ni re-envuelto. Es
          el texto que el curador copiaría al comando de corrección. */}
      <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink70)' }}>{c.text}</div>
      {c.missingWords?.length > 0 && (
        <div style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 4, lineHeight: 1.45 }}>
          <span className="mono" style={{ color: 'var(--ink50)' }}>
            no aparecen aquí:
          </span>{' '}
          {c.missingWords.join(', ')}
        </div>
      )}
    </div>
  )
}

export function QuoteReanchorRow({ row }) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  const copy = () => {
    navigator.clipboard?.writeText(row.correctionCommand).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      },
      () => setCopied(false),
    )
  }

  return (
    <div
      style={{
        padding: '12px 14px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
        marginBottom: 10,
        background: 'var(--paper)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
          {row.plenoDate} · {row.findingId} · cita {row.quoteIndex}
        </span>
        <Pill tone={STATUS_TONE[row.status] ?? 'neutral'} size="xs">
          {STATUS_LABEL[row.status] ?? row.status}
        </Pill>
        {row.reason && (
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
            {row.reason}
          </span>
        )}
        {row.speakerGroup && (
          <Pill tone="neutral" size="xs">
            {row.speakerGroup}
          </Pill>
        )}
      </div>

      <div style={{ fontSize: 13.5, fontWeight: 600, margin: '6px 0 2px', lineHeight: 1.35 }}>
        {row.title}
      </div>

      <div className="qrq-split">
        <div>
          <Label>Literal publicado</Label>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.55,
              padding: '8px 10px',
              border: '1px solid var(--border2)',
              borderRadius: 'var(--r-input)',
              background: 'var(--card)',
              fontStyle: 'italic',
            }}
          >
            «{row.publishedQuote}»
            {/* Las dos marcas que el lector ya tiene delante en /hallazgos. La
                píldora de arriba dice por qué la fila está en esta cola; ésta
                añade el otro eje —qué haría la puerta editorial con la
                afirmación—, que la cola no enseñaba en ninguna parte. */}
            <QuoteMarks findingId={row.findingId} index={row.quoteIndex} />
          </div>
          {row.supersededAt && (
            <div style={{ marginTop: 8 }}>
              <Label>Dónde constaba · {row.supersededAt.timecode} (texto sustituido)</Label>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mono"
                style={{
                  padding: '3px 8px',
                  fontSize: 10.5,
                  borderRadius: 'var(--r-input)',
                  border: '1px solid var(--border2)',
                  background: 'var(--card)',
                  color: 'var(--ink70)',
                  cursor: 'pointer',
                }}
              >
                {open ? 'Ocultar el contexto viejo' : 'Ver el contexto viejo'}
              </button>
              {open && (
                <div
                  style={{
                    fontSize: 11.5,
                    lineHeight: 1.5,
                    color: 'var(--ink50)',
                    marginTop: 6,
                    padding: '8px 10px',
                    background: 'var(--soft)',
                    borderRadius: 'var(--r-input)',
                  }}
                >
                  {row.supersededAt.text}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <Label>
            Pasajes de la transcripción vigente ({row.candidates?.length ?? 0}) · ninguno
            seleccionado
          </Label>
          {(row.candidates ?? []).map((c) => (
            <CandidateCard key={`${c.rank}-${c.startSeconds}`} c={c} />
          ))}
          {(row.candidates ?? []).length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink50)' }}>
              Ningún pasaje del texto nuevo comparte vocabulario con esta cita. Puede que el tramo
              no esté cubierto: no la reanclas, la retiras o la dejas marcada.
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border2)' }}>
        <Label>Si decides reanclarla, ejecuta esto tú, en tu terminal</Label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <code
            style={{
              flex: 1,
              fontSize: 11,
              lineHeight: 1.5,
              padding: '8px 10px',
              background: 'var(--soft)',
              borderRadius: 'var(--r-input)',
              wordBreak: 'break-all',
            }}
          >
            {row.correctionCommand}
          </code>
          <button
            type="button"
            onClick={copy}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 'var(--r-input)',
              border: '1px solid var(--border2)',
              background: 'var(--card)',
              color: 'var(--ink70)',
              cursor: 'pointer',
            }}
          >
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink50)', marginTop: 4, lineHeight: 1.45 }}>
          Esta pantalla no escribe en <code>public/data/pleno-findings.json</code>. El único
          escritor es la CLI, que exige un motivo de ≥20 caracteres y deja el texto anterior tachado
          en la bitácora pública de la ficha.
        </div>
      </div>
    </div>
  )
}
