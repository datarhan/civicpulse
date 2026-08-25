import { useState } from 'react'
import { Pill } from '../../components/Primitives'
import { QuoteMarks } from './shared'

/**
 * «¿Lo sostiene o sólo se le parece?» — la fila de revisión de un hallazgo
 * publicado en /hallazgos.
 *
 * El sumario y el extracto citado se muestran EN PARALELO, en dos columnas a la
 * misma altura. No es decoración: los tres defectos que motivaron esta pantalla
 * (el contrato de Microsoft 365 sobre un debate de correos sin contestar, los
 * «dos perros» de la Unidad Canina sobre atención a mujeres vulnerables, el
 * Plan de Igualdad sobre Tesorería) pasaron precisamente porque quien los leyó
 * los leyó EN SECUENCIA. Puestos uno al lado del otro, la colisión léxica salta
 * a la vista; leídos con veinte líneas de por medio, no.
 *
 * La fila no puntúa, no ordena por fuerza y no recomienda nada — el cribado
 * léxico que lo intentó quedó medido sin poder discriminante (8989c3b). Sólo
 * enseña el texto y deja elegir. Y no escribe: elegido un veredicto, la
 * pantalla compone el comando de `correct-pleno-finding` para que lo ejecute
 * una persona en su terminal.
 */

/**
 * Las dos columnas son el instrumento, así que su regla responsive tiene que
 * vivir en CSS real: un `style` inline no admite media queries y gana a
 * cualquier clase. Por debajo de 900 px se apilan — en una columna estrecha,
 * dos columnas ilegibles son peores que la lectura en secuencia.
 */
export function FindingSupportStyles() {
  return (
    <style>{`
      .fsq-split {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 14px;
        align-items: start;
        margin-top: 8px;
      }
      @media (max-width: 900px) {
        .fsq-split { grid-template-columns: minmax(0, 1fr); }
      }
    `}</style>
  )
}

const SHAPE_LABEL = {
  'afirmativa-documental': 'afirma vínculo documental',
  'documental-matizada': 'vínculo documental matizado',
  'sin-afirmacion-documental': 'sin afirmación documental',
}
const SHAPE_TONE = {
  'afirmativa-documental': 'intel',
  'documental-matizada': 'neutral',
  'sin-afirmacion-documental': 'ghost',
}

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

function ExcerptCard({ ref_, kind, excerpt }) {
  return (
    <div
      style={{
        padding: '8px 10px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
        marginBottom: 6,
        background: 'var(--paper)',
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        <Pill tone="ghost" size="xs">
          {kind}
        </Pill>
        <a
          href={ref_}
          target="_blank"
          rel="noreferrer noopener"
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--civic)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {ref_}
        </a>
      </div>
      {/* Verbatim del snapshot: ni recortado ni re-envuelto. Lo que el curador
          juzga tiene que ser byte a byte lo que el lector tiene delante. */}
      <div style={{ fontSize: 'var(--fs-aux)', lineHeight: 1.5, color: 'var(--ink70)' }}>
        {excerpt}
      </div>
    </div>
  )
}

export function FindingSupportRow({ row, verdictOptions }) {
  const [verdict, setVerdict] = useState(row.verdict ?? 'pendiente')
  const [copied, setCopied] = useState(false)
  const chosen = verdictOptions.find((v) => v.id === verdict)
  const isFailure = !!chosen?.isFailure

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
      className="fsq-row"
      style={{
        padding: '12px 14px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
        marginBottom: 10,
        background: 'var(--paper)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          {row.plenoDate} · {row.id}
        </span>
        <Pill tone={SHAPE_TONE[row.claimShape] ?? 'neutral'} size="xs">
          {SHAPE_LABEL[row.claimShape] ?? row.claimShape}
        </Pill>
        {row.severity !== 'informational' && (
          <Pill tone="warn" size="xs">
            {row.severity}
          </Pill>
        )}
        {row.priorReview && (
          <Pill tone={row.priorReview.outcome === 'upheld' ? 'ok' : 'crit'} size="xs">
            {row.priorReview.outcome === 'upheld' ? 'revisado · se sostiene' : 'ya corregido'}
          </Pill>
        )}
        {row.corrections?.length > 0 && (
          <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            {row.corrections.length} corrección(es) en la bitácora
          </span>
        )}
      </div>

      <div
        style={{
          fontSize: 'var(--fs-aux)',
          fontWeight: 600,
          margin: '6px 0 2px',
          lineHeight: 1.35,
        }}
      >
        {row.title}
      </div>

      {row.priorReview && (
        <div
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            lineHeight: 1.45,
            marginBottom: 6,
          }}
        >
          {row.priorReview.note}{' '}
          <span className="mono" style={{ fontStyle: 'normal' }}>
            [{row.priorReview.sourceCommit}]
          </span>
        </div>
      )}

      {/* EL PUNTO DE LA PANTALLA: sumario y extractos a la misma altura.
          La media query vive en el <style> de la sección, no aquí — un estilo
          inline no puede llevarla. */}
      <div className="fsq-split">
        <div>
          <Label>Sumario publicado</Label>
          <div
            style={{
              fontSize: 'var(--fs-aux)',
              lineHeight: 1.55,
              padding: '8px 10px',
              border: '1px solid var(--border2)',
              borderRadius: 'var(--r-input)',
              background: 'var(--paper)',
            }}
          >
            {row.summary}
          </div>
          {row.documentaryConnectors?.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <Label>Lo clasifica esta frase</Label>
              {row.documentaryConnectors.map((c, i) => (
                <div
                  key={`${c.name}-${i}`}
                  style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', lineHeight: 1.45 }}
                >
                  <span
                    className="mono"
                    style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                  >
                    [{c.name}]
                  </span>{' '}
                  {c.sentence}
                </div>
              ))}
            </div>
          )}
          {row.hedges?.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              <Label>Matices detectados</Label>
              {row.hedges.map((h) => `${h.name}: «${h.match}»`).join(' · ')}
            </div>
          )}
          {row.quotes?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Label>Citas del hallazgo</Label>
              {row.quotes.map((q, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 'var(--fs-aux)',
                    color: 'var(--ink70)',
                    lineHeight: 1.5,
                    marginBottom: 6,
                  }}
                >
                  «{q.text}»{' '}
                  <span
                    className="mono"
                    style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                  >
                    {q.speakerGroup ?? 'grupo no identificado'}
                  </span>
                  {/* Lo que el lector ya ve junto a esta cita en /hallazgos.
                      Sin esto, quien juzga si el hallazgo sigue publicado veía
                      MENOS que un visitante: ni de qué transcripción salen las
                      palabras ni qué haría con ellas la puerta editorial. */}
                  <QuoteMarks findingId={row.id} index={i} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label>Documentos cotejados ({row.crossChecked?.length ?? 0})</Label>
          {(row.crossChecked ?? []).map((c, i) => (
            <ExcerptCard key={`${c.ref}-${i}`} ref_={c.ref} kind={c.kind} excerpt={c.excerpt} />
          ))}
          {(row.crossChecked ?? []).length === 0 && (
            <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
              Ningún documento cotejado. El sumario no puede apoyarse en uno.
            </div>
          )}
        </div>
      </div>

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
        <label
          className="mono"
          htmlFor={`verdict-${row.id}`}
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
        >
          ¿Lo sostiene?
        </label>
        <select
          id={`verdict-${row.id}`}
          value={verdict}
          onChange={(e) => setVerdict(e.target.value)}
          style={{
            padding: '5px 8px',
            fontSize: 'var(--fs-meta)',
            borderRadius: 'var(--r-input)',
            border: '1px solid var(--border2)',
            background: 'var(--paper)',
            color: 'var(--ink)',
          }}
        >
          {verdictOptions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        {chosen && (
          <span
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', flex: 1, minWidth: 220 }}
          >
            {chosen.question}
          </span>
        )}
      </div>

      {isFailure && (
        <div style={{ marginTop: 8 }}>
          <Label>Ejecuta esto tú, en tu terminal</Label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <code
              style={{
                flex: 1,
                fontSize: 'var(--fs-aux)',
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
                fontSize: 'var(--fs-meta)',
                fontWeight: 600,
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--border2)',
                background: 'var(--paper)',
                color: 'var(--ink70)',
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <div
            style={{
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink50)',
              marginTop: 4,
              lineHeight: 1.45,
            }}
          >
            Esta pantalla no escribe en <code>public/data/pleno-findings.json</code>. El único
            escritor es la CLI, que exige un motivo de ≥20 caracteres y deja fila pública en la
            bitácora.
          </div>
        </div>
      )}
    </div>
  )
}
