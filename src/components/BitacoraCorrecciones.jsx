/**
 * La bitácora de una ficha corregida, en texto que se sostiene solo.
 *
 * Una corrección ordinaria publica su `original` entero: el lector es dueño de
 * la frase que se retiró, o el registro no acredita nada. Hasta el 16-09-2026 la
 * versión retirada se distinguía de la vigente ÚNICAMENTE por un
 * `text-decoration: line-through`, y un estilo no viaja en `textContent`: el
 * rastreador, el lector de pantalla, el copia-pega y la revisión lectora leían
 * las dos frases seguidas sin nada que dijera cuál rige. La revisión del
 * 16-09-2026 señaló como contradicción de /hallazgos un sumario que llevaba un
 * mes superado, leído dentro de esta misma bitácora.
 *
 * `pleno-finding.ts` ya lo había escrito para el camino de la redacción
 * —«line-through is a style, not a redaction, and the crawler, the screen reader
 * and the copy-paste all still get the words»—; esto es esa regla aplicada a la
 * bitácora de todos los días. Cada versión lleva su rótulo escrito, y el texto
 * retirado va en `<del>`, que es el elemento que HTML tiene para esto y trae el
 * tachado de serie sin que ningún CSS tenga que significarlo.
 *
 * Vive aquí y no en cada página porque /hallazgos y /laboratorio llevaban el
 * mismo bloque copiado letra por letra: dos sitios donde arreglar un defecto es
 * un sitio donde se olvida.
 */

export const ROTULO_TEXTO_RETIRADO = 'Texto retirado'
export const ROTULO_TEXTO_VIGENTE = 'Texto vigente'

const rotulo = {
  fontSize: 'var(--fs-micro)',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  color: 'var(--ink50)',
}

export function BitacoraCorrecciones({ correcciones }) {
  if (!correcciones?.length) return null
  return (
    <details
      style={{
        marginTop: 10,
        paddingLeft: 10,
        borderLeft: '2px solid var(--border)',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink70)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        Bitácora de correcciones · {correcciones.length}
      </summary>
      <ol
        style={{
          margin: '6px 0 0',
          paddingLeft: 18,
          display: 'grid',
          gap: 8,
          fontSize: 'var(--fs-aux)',
        }}
      >
        {correcciones.map((c, idx) => (
          <li key={idx}>
            <div
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                marginBottom: 2,
              }}
            >
              {c.field} · {String(c.correctedAt ?? '').slice(0, 10)} · {c.editor}
            </div>
            <div style={{ color: 'var(--ink50)' }}>
              <span className="mono" style={rotulo}>
                {ROTULO_TEXTO_RETIRADO}:{' '}
              </span>
              <del>{c.original}</del>
            </div>
            <div style={{ color: 'var(--ink)', marginTop: 1 }}>
              <span className="mono" style={rotulo}>
                {ROTULO_TEXTO_VIGENTE}:{' '}
              </span>
              {c.corrected}
            </div>
            <div
              style={{
                marginTop: 2,
                color: 'var(--ink70)',
              }}
            >
              Motivo: {c.reason}
            </div>
          </li>
        ))}
      </ol>
    </details>
  )
}
