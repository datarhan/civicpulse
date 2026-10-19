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
 *
 * Hasta el 04-10-2026, además, CADA fila rotulaba «vigente» lo que puso, también
 * cuando otra posterior había vuelto a cambiar el mismo campo: una ficha con
 * siete filas de `summary` imprimía siete «Texto vigente» con siete sumarios
 * distintos, huellas «sumario · sha256:…» incluidas, y sólo el último es el que
 * la ficha publica. Era la contradicción del 16-09-2026 con el rótulo afirmándola: medido
 * ese día sobre la copia servida, 50 filas en 26 fichas de /hallazgos, 9 en
 * /eficiencia y 1 en /laboratorio/agentes. Ahora la fila que otra sustituyó lo
 * dice delante, con el día de la que la sustituyó (`sustitutas`, abajo); la
 * última de cada campo sigue siendo la vigente. /eficiencia y la bitácora del
 * informe del agente pintan su propio marcado, pero con estas mismas piezas: la
 * regla vive aquí una vez.
 */

import { MARCA_GRUPO_RETENIDO } from '../lib/grupo-retenido'
import { esRetirada, seguirPosicion } from '../lib/posicion-en-bitacora'
import { CATALOGUE, useT } from '../i18n'
import { partePorHueco, rellena } from '../lib/formatters'

/**
 * Las palabras de la bitácora salen del catálogo (`bitacora.*`) desde el
 * 12-10-2026, en el idioma de la interfaz. Los rótulos se siguen exportando en
 * castellano, leídos de él: /eficiencia y el informe del agente pintan su propio
 * marcado con ellos, y las pruebas los buscan.
 */
const enCastellano = (clave) => CATALOGUE.es[clave] ?? clave

export const ROTULO_TEXTO_RETIRADO = enCastellano('bitacora.textoRetirado')
export const ROTULO_TEXTO_VIGENTE = enCastellano('bitacora.textoVigente')
/**
 * Lo que puso una fila cuando una posterior volvió a cambiar el mismo campo: ni
 * lo retiró ella ni es lo que la ficha publica hoy. Es lo que el catálogo dice
 * antes de «, sustituido el {fecha}».
 */
export const ROTULO_TEXTO_SUSTITUIDO = partePorHueco(
  enCastellano('bitacora.textoSustituido'),
  ', sustituido el {fecha}',
)[0]
export const ROTULO_MOTIVO_ENMENDADO = enCastellano('bitacora.motivoEnmendado')

const fecha = (iso) => String(iso ?? '').slice(0, 10)

/**
 * ¿Nombra el campo un elemento por su POSICIÓN en una lista? `quote.1.text`,
 * `crossChecked.0`, `warnings[1]`, `portrait.portfolios[6]`.
 */
const conPosicion = (campo) =>
  String(campo)
    .split(/[.[\]]/)
    .some((s) => /^\d+$/.test(s))

/**
 * Para cada fila, la fila POSTERIOR que volvió a cambiar su mismo campo, o
 * `null` si ninguna lo hizo y lo que puso es lo que la ficha publica.
 *
 * Los campos con nombre fijo —`title`, `summary`, `titulo`, `cuerpo`,
 * `medicion`, la cita de una promesa, el cuerpo de una sección del informe— se
 * comparan por el nombre. Los de una cita o un documento cotejado nombrados por
 * su posición —`quote.1.text`— NO: retirar la cita 0 renumera las siguientes, y
 * dos filas con el mismo nombre pueden hablar de citas distintas. Esos se siguen
 * por las retiradas del registro (`seguirPosicion`,
 * src/lib/posicion-en-bitacora.js), y su posterior puede ser también la
 * retirada de la cita entera. Hasta el 14-10-2026 quedaban fuera y rotulaban
 * «vigente» lo que pusieron; ese día una cita re-anclada el 10-08 se acortó, y
 * `tests/components/bitacora-version-sustituida.test.jsx`, que lo vigilaba, se
 * puso roja como estaba escrito. Los demás campos con posición —`warnings[1]`,
 * `portrait.portfolios[6]`— siguen fuera.
 */
export function sustitutas(correcciones) {
  return correcciones.map((c, i) => {
    const seguida = seguirPosicion(correcciones, i)
    if (seguida) return seguida.posterior
    return conPosicion(c.field)
      ? null
      : (correcciones.slice(i + 1).find((d) => d.field === c.field) ?? null)
  })
}

/**
 * Qué cita de la ficha es hoy la de una fila `quote.<i>…`, con el número que la
 * ficha le pone («Cita 2» para `quote.1`), o que se retiró después. `null` si el
 * campo no es de una cita.
 *
 * Con `ficha`, la cita numerada dice además de cuál («cita 2 de la ficha
 * a870a4»), con la misma clave que las notas de las citas
 * (`findings.citas.deLaFicha`, `nombrarCitas` en PlenoFindings.jsx). Los
 * números son por ficha, y la revisión lectora abre la bitácora y lee la página
 * aplanada: el 18-10-2026 tomó cuatro filas por las de la tarjeta de al lado
 * (tests/components/fichas-contiguas.test.jsx). Opcional porque /promesas y
 * /laboratorio montan esta bitácora para cosas que no son fichas de pleno.
 */
function citaDeLaFila(correcciones, i, t, ficha) {
  const seguida = seguirPosicion(correcciones, i)
  if (!seguida || seguida.coleccion !== 'quote') return null
  if (esRetirada(correcciones[i])) return t('bitacora.campo.citaQueRetira')
  if (seguida.hoy === null) return t('bitacora.campo.citaRetirada')
  const cita = rellena(t('bitacora.campo.cita'), { n: seguida.hoy + 1 })
  return ficha ? rellena(t('findings.citas.deLaFicha'), { citas: cita, ficha }) : cita
}

/**
 * El rótulo de lo que puso una fila: «Texto vigente», o, si `posterior` lo
 * volvió a cambiar, «Texto que puso esta corrección, sustituido el 2026-09-30»
 * con el día de esa fila, que es la que el lector tiene que ir a buscar; si
 * `posterior` retiró la cita entera, lo dice así. En el idioma de `t`; sin él,
 * en castellano.
 *
 * @param {{ correctedAt?: string } | null} posterior
 * @param {(clave: string) => string} [t]
 */
export const rotuloTextoPuesto = (posterior, t = enCastellano) =>
  posterior
    ? rellena(
        t(esRetirada(posterior) ? 'bitacora.textoRetiradoDespues' : 'bitacora.textoSustituido'),
        { fecha: fecha(posterior.correctedAt) },
      )
    : t('bitacora.textoVigente')

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
  const t = useT()
  return (
    <div style={{ color: 'var(--ink50)' }}>
      <span className="mono" style={rotulo}>
        {t('bitacora.textoRetirado')}:{' '}
      </span>
      <del>{texto}</del>
    </div>
  )
}

/**
 * Lo que puso la fila. Si otra posterior lo volvió a cambiar, el rótulo lo dice
 * y el texto baja al tono del motivo, para que no se lea como el de hoy; el
 * rótulo es lo que cuenta, el tono sólo acompaña.
 */
function TextoPuesto({ texto, posterior }) {
  const t = useT()
  return (
    <div style={{ color: posterior ? 'var(--ink70)' : 'var(--ink)', marginTop: 1 }}>
      <span className="mono" style={rotulo}>
        {rotuloTextoPuesto(posterior, t)}:{' '}
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
function FilaGrupoRetenido({ c, posterior }) {
  const t = useT()
  const sinOriginal = c.original === MARCA_GRUPO_RETENIDO
  const sinCorregido = c.corrected === MARCA_GRUPO_RETENIDO
  const cual = t(
    sinOriginal && sinCorregido
      ? 'bitacora.grupoRetenido.ninguna'
      : sinOriginal
        ? 'bitacora.grupoRetenido.retirada'
        : 'bitacora.grupoRetenido.puesta',
  )
  return (
    <>
      <div style={{ color: 'var(--ink70)' }}>
        <span className="mono" style={rotulo}>
          {t('bitacora.grupoRetenido.rotulo')}:{' '}
        </span>
        {rellena(t('bitacora.grupoRetenido.texto'), { cual })}
      </div>
      {!sinOriginal && <TextoRetirado texto={c.original} />}
      {!sinCorregido && <TextoPuesto texto={c.corrected} posterior={posterior} />}
    </>
  )
}

/**
 * @param {{ correcciones: any[], ficha?: string }} props  `ficha`: el código de
 *   la ficha de pleno (`codigoDeFicha`), para que cada fila de cita la nombre.
 */
export function BitacoraCorrecciones({ correcciones, ficha }) {
  const t = useT()
  if (!correcciones?.length) return null
  const despues = sustitutas(correcciones)
  const citas = correcciones.map((_, i) => citaDeLaFila(correcciones, i, t, ficha))
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
        {rellena(t('bitacora.resumen'), { n: correcciones.length })}
        {enmendadas > 0 &&
          ` · ${rellena(t(enmendadas === 1 ? 'bitacora.enmendados.uno' : 'bitacora.enmendados.varios'), { n: enmendadas })}`}
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
              {`${c.field}${citas[idx] ? ` (${citas[idx]})` : ''} · ${fecha(c.correctedAt)} · ${c.editor}`}
            </div>
            {c.literalRetenido ? (
              // La copia servida sustituye las dos versiones del literal de una
              // cita retenida por su huella (src/scraper/literales-retenidos.ts).
              // Rotularla «texto vigente» diría que la ficha publica un código.
              <div style={{ color: 'var(--ink70)' }}>
                <span className="mono" style={rotulo}>
                  {t('findings.citas.retenida.rotulo')}:{' '}
                </span>
                {t('bitacora.literalRetenido')}{' '}
                <span className="mono">
                  {String(c.original).split(' · ')[1] ?? c.original} →{' '}
                  {String(c.corrected).split(' · ')[1] ?? c.corrected}
                </span>
                .
              </div>
            ) : c.grupoRetenido ? (
              <FilaGrupoRetenido c={c} posterior={despues[idx]} />
            ) : (
              <>
                <TextoRetirado texto={c.original} />
                <TextoPuesto texto={c.corrected} posterior={despues[idx]} />
              </>
            )}
            <div
              style={{
                marginTop: 2,
                color: 'var(--ink70)',
              }}
            >
              {c.reasonAmendments?.length > 0
                ? rellena(t('bitacora.motivoEnmendadoEl'), {
                    fecha: fecha(c.reasonAmendments.at(-1).amendedAt),
                  })
                : t('bitacora.motivo')}{' '}
              {c.reason}
            </div>
            {(c.reasonAmendments ?? []).map((a, j) => (
              <div key={j} style={{ marginTop: 2, color: 'var(--ink50)' }}>
                <span className="mono" style={rotulo}>
                  {t('bitacora.motivoEnmendado')}:{' '}
                </span>
                <span className="mono" style={{ fontSize: 'var(--fs-micro)' }}>
                  {fecha(a.amendedAt)} · {a.editor}
                </span>
                . {a.reason} {t('bitacora.enmienda.anterior')}{' '}
                <span className="mono">{huellaSinEtiqueta(a.previous)}</span>.
              </div>
            ))}
          </li>
        ))}
      </ol>
      {conGrupoRetenido && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          {t('bitacora.escanoUnico.nota')}{' '}
          <a href="/metodologia#bitacora-escano-unico" style={{ color: 'var(--civic)' }}>
            {t('bitacora.escanoUnico.enlace')}
          </a>
          .
        </p>
      )}
    </details>
  )
}
