// @ts-check
/**
 * El CSV del catálogo de /datos: una fila por elemento de la lista que la tabla
 * llama «fila» (`tabla` en `src/lib/catalogo-datos.js`). Lo escribe el build,
 * a partir de la copia SERVIDA del JSON y después de la guarda de publicación
 * (`escribirCsvEnDist`, publication-denylist.js); aquí sólo las piezas puras.
 *
 * El formato, para que una hoja de cálculo o un script lo lean igual:
 *
 *   · Marca UTF-8 al principio (BOM): sin ella, una hoja de cálculo en español
 *     abre «Túria» como «TÃºria».
 *   · Separador coma, filas en CRLF, y comillas sólo donde hacen falta, dobladas
 *     dentro (RFC 4180).
 *   · Cabecera: todas las claves de todas las filas, en el orden en que aparecen.
 *     Una fila sin una clave deja esa celda vacía, como un `null`.
 *   · Una lista o un objeto anidados van como JSON en su celda: no se aplanan,
 *     porque aplanar inventa columnas que el fichero no tiene.
 *   · Un TEXTO que empieza por = + - @ (o por un tabulador o un retorno) lleva un
 *     apóstrofo delante. Una hoja de cálculo lo tomaría por una fórmula, y el
 *     texto de una queja lo escribe cualquiera. Un número negativo no lo lleva:
 *     es un número, no un texto.
 *   · Y lo mismo dentro del texto, tras un punto y coma, un tabulador o un salto
 *     de línea: una hoja de cálculo en español suele separar por punto y coma,
 *     y «x;=HYPERLINK(…)» le daría una segunda celda que empieza por «=». Por
 *     eso una celda con punto y coma va además entre comillas. Lo vio la
 *     revisión de seguridad del commit, el 22-11-2026.
 *   · Una lista vacía da un fichero vacío, sin cabecera: no hay claves que dar.
 */

const BOM = String.fromCharCode(0xfeff) // la marca UTF-8, escrita para que se vea
const FORMULA = /^[=+\-@\t\r]/
/** Un disparador de fórmula al principio de lo que otra hoja leería como celda. */
const FORMULA_DENTRO = /([;\t\r\n])(?=[=+\-@])/g

/** El valor de una celda, como texto. */
function texto(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'string') {
    const dentro = v.replace(FORMULA_DENTRO, "$1'")
    return FORMULA.test(dentro) ? `'${dentro}` : dentro
  }
  return String(v)
}

/** La celda, entre comillas si lleva coma, punto y coma, comilla o salto de línea. */
function celda(v) {
  const t = texto(v)
  return /[",;\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

/**
 * @param {ReadonlyArray<Record<string, unknown>>} filas
 * @returns {string}
 */
export function aCsv(filas) {
  if (filas.length === 0) return ''
  const columnas = []
  const vistas = new Set()
  for (const f of filas)
    for (const k of Object.keys(f))
      if (!vistas.has(k)) {
        vistas.add(k)
        columnas.push(k)
      }
  const lineas = [columnas.map(celda).join(',')]
  for (const f of filas) lineas.push(columnas.map((k) => celda(f[k])).join(','))
  return `${BOM}${lineas.join('\r\n')}\r\n`
}

/**
 * La lista de `json` en `ruta` («items», «series.total»), o `null` si lo que
 * hay ahí no es una lista.
 *
 * @param {unknown} json
 * @param {string} ruta
 * @returns {Array<Record<string, unknown>> | null}
 */
export function filasDe(json, ruta) {
  let v = /** @type {any} */ (json)
  for (const parte of ruta.split('.')) {
    if (v === null || typeof v !== 'object') return null
    v = v[parte]
  }
  return Array.isArray(v) ? v : null
}

/**
 * Lee un CSV de `aCsv` y devuelve sus filas como objetos de texto. Para las
 * pruebas, que comprueban lo servido leyéndolo como lo leería cualquiera.
 *
 * @param {string} csv
 * @returns {Array<Record<string, string>>}
 */
export function leerCsv(csv) {
  const s = csv.startsWith(BOM) ? csv.slice(1) : csv
  if (s === '') return []
  /** @type {string[][]} */
  const registros = []
  let campo = ''
  let registro = []
  let entre = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (entre) {
      if (c === '"' && s[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') entre = false
      else campo += c
    } else if (c === '"') entre = true
    else if (c === ',') {
      registro.push(campo)
      campo = ''
    } else if (c === '\r' && s[i + 1] === '\n') {
      registro.push(campo)
      registros.push(registro)
      registro = []
      campo = ''
      i++
    } else campo += c
  }
  if (campo !== '' || registro.length > 0) {
    registro.push(campo)
    registros.push(registro)
  }
  const [cabecera, ...resto] = registros
  return resto.map((r) => Object.fromEntries(cabecera.map((k, i) => [k, r[i] ?? ''])))
}
