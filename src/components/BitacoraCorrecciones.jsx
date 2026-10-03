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
 *
 * Desde el 29-09-2026 el MOTIVO de una fila también puede no ser el que se
 * publicó con ella (`reasonAmendments`, bloque ENMIENDA DEL MOTIVO en
 * pleno-finding.ts). La fila conserva la firma y la fecha de la corrección, así
 * que pintar el motivo nuevo con el rótulo de siempre atribuiría a quien corrigió
 * una explicación que escribió otra persona semanas después. Por eso el motivo
 * enmendado lo dice delante, en texto, y cada enmienda lleva su fecha, su firma,
 * su porqué y la huella del motivo que sustituyó —el texto anterior no se
 * reproduce: si se enmendó fue porque no debía seguir diciéndose—.
 *
 * Y desde el 30-09-2026 la copia servida de /hallazgos no trae la versión de una
 * fila que nombraba a un grupo de un solo escaño (`grupoRetenido`,
 * src/scraper/grupos-retenidos.ts): la bitácora enseñaba «Compromís» tachado
 * junto a «sin identificar» después de que una persona firmara que no se sabe
 * quién habló. La fila dice en texto qué versión falta y por qué; no tacha la
 * marca como si fuera lo retirado, y no rotula «vigente» una versión que no
 * enseña, porque eso diría que la ficha nombra hoy a ese grupo.
 */

import { ROTULO_CITA_RETENIDA } from '../lib/cita-retenida'
import { MARCA_GRUPO_RETENIDO, ROTULO_GRUPO_RETENIDO } from '../lib/grupo-retenido'

export const ROTULO_TEXTO_RETIRADO = 'Texto retirado'
export const ROTULO_TEXTO_VIGENTE = 'Texto vigente'
export const ROTULO_MOTIVO_ENMENDADO = 'Motivo enmendado'

const fecha = (iso) => String(iso ?? '').slice(0, 10)
/**
 * `motivo · sha256:1a2b…` → `sha256:1a2b…`: qué es ya lo dice el rótulo, y el
 * algoritmo se queda, que es lo que necesita quien quiera rehacerla. Igual que
 * la huella de una fila de cita retenida, más abajo.
 */
const huellaSinEtiqueta = (huella) => String(huella).split(' · ')[1] ?? String(huella)

const rotulo = {
  fontSize: 'var(--fs-micro)',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  color: 'var(--ink50)',
}

function TextoRetirado({ texto }) {
  return (
    <div style={{ color: 'var(--ink50)' }}>
      <span className="mono" style={rotulo}>
        {ROTULO_TEXTO_RETIRADO}:{' '}
      </span>
      <del>{texto}</del>
    </div>
  )
}

function TextoVigente({ texto }) {
  return (
    <div style={{ color: 'var(--ink)', marginTop: 1 }}>
      <span className="mono" style={rotulo}>
        {ROTULO_TEXTO_VIGENTE}:{' '}
      </span>
      {texto}
    </div>
  )
}

/**
 * Una fila con una versión que la copia servida no reproduce porque nombraba a
 * un grupo de un solo escaño. Enseña, con su rótulo de siempre, el lado que sí
 * se sirve.
 */
function FilaGrupoRetenido({ c }) {
  const sinOriginal = c.original === MARCA_GRUPO_RETENIDO
  const sinCorregido = c.corrected === MARCA_GRUPO_RETENIDO
  const cual =
    sinOriginal && sinCorregido
      ? 'ninguna de sus dos versiones'
      : sinOriginal
        ? 'la versión que retiró'
        : 'la versión que puso'
  return (
    <>
      <div style={{ color: 'var(--ink70)' }}>
        <span className="mono" style={rotulo}>
          {ROTULO_GRUPO_RETENIDO}:{' '}
        </span>
        esta corrección cambió un texto que nombraba a un grupo con un solo concejal, y nombrar ese
        grupo es nombrar a esa persona, así que la bitácora no reproduce {cual}.
      </div>
      {!sinOriginal && <TextoRetirado texto={c.original} />}
      {!sinCorregido && <TextoVigente texto={c.corrected} />}
    </>
  )
}

export function BitacoraCorrecciones({ correcciones }) {
  if (!correcciones?.length) return null
  const enmendadas = correcciones.filter((c) => c.reasonAmendments?.length > 0).length
  const conGrupoRetenido = correcciones.some((c) => c.grupoRetenido)
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
        {enmendadas > 0 &&
          ` · ${enmendadas} ${enmendadas === 1 ? 'motivo enmendado' : 'motivos enmendados'}`}
      </summary>
      {/* `overflowWrap: 'anywhere'` porque una corrección puede retirar una URL
          entera, y una URL no tiene dónde partirse: la pista de esta rejilla
          crece hasta el ancho mínimo de su contenido, y la de una fuente de
          Google News medía 2.502 px. Con la bitácora abierta, /promesas medía
          2.578 px de ancho en un teléfono y 3.317 en un escritorio. `anywhere`
          —y no `break-word`— es el que rebaja ese mínimo; un texto con espacios
          sigue partiendo por los espacios. */}
      <ol
        style={{
          margin: '6px 0 0',
          paddingLeft: 18,
          display: 'grid',
          gap: 8,
          fontSize: 'var(--fs-aux)',
          overflowWrap: 'anywhere',
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
            {c.literalRetenido ? (
              // La copia servida sustituye las dos versiones del literal de una
              // cita retenida por su huella (src/scraper/literales-retenidos.ts).
              // Rotularla «texto vigente» diría que la ficha publica un código.
              <div style={{ color: 'var(--ink70)' }}>
                <span className="mono" style={rotulo}>
                  {ROTULO_CITA_RETENIDA}:{' '}
                </span>
                esta corrección cambió el texto de una cita que la puerta editorial retiene, así que
                la bitácora no reproduce ninguna de sus dos versiones; deja su huella, que
                cualquiera con el texto puede rehacer:{' '}
                <span className="mono">
                  {String(c.original).split(' · ')[1] ?? c.original} →{' '}
                  {String(c.corrected).split(' · ')[1] ?? c.corrected}
                </span>
                .
              </div>
            ) : c.grupoRetenido ? (
              <FilaGrupoRetenido c={c} />
            ) : (
              <>
                <TextoRetirado texto={c.original} />
                <TextoVigente texto={c.corrected} />
              </>
            )}
            <div
              style={{
                marginTop: 2,
                color: 'var(--ink70)',
              }}
            >
              {c.reasonAmendments?.length > 0
                ? `Motivo (enmendado el ${fecha(c.reasonAmendments.at(-1).amendedAt)}): `
                : 'Motivo: '}
              {c.reason}
            </div>
            {(c.reasonAmendments ?? []).map((a, j) => (
              <div key={j} style={{ marginTop: 2, color: 'var(--ink50)' }}>
                <span className="mono" style={rotulo}>
                  {ROTULO_MOTIVO_ENMENDADO}:{' '}
                </span>
                <span className="mono" style={{ fontSize: 'var(--fs-micro)' }}>
                  {fecha(a.amendedAt)} · {a.editor}
                </span>
                . {a.reason} El motivo anterior no se reproduce; queda su huella, que cualquiera con
                una copia anterior puede rehacer:{' '}
                <span className="mono">{huellaSinEtiqueta(a.previous)}</span>.
              </div>
            ))}
          </li>
        ))}
      </ol>
      {conGrupoRetenido && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          Las versiones que nombraban a un grupo de un solo escaño siguen en el repositorio público
          del proyecto: esta página deja de enseñarlas, no las retira.{' '}
          <a href="/metodologia#bitacora-escano-unico" style={{ color: 'var(--civic)' }}>
            Por qué, en la metodología
          </a>
          .
        </p>
      )}
    </details>
  )
}
