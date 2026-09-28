/**
 * Lo que el texto de una queja no guarda: los datos personales que se reconocen
 * por su forma —teléfonos españoles, correos, DNI y NIE con su letra de control,
 * IBAN con sus dígitos de control, matrículas—, sustituidos por una marca.
 * `createQueja` (db/queries.ts) lo aplica al título y al detalle antes de
 * guardarlos, así que no llegan a la base, ni a la tarjeta de quien modera, ni a
 * nada que se publique. Hasta el 2026-09-28 se guardaban tal cual.
 *
 * Sólo lo que se reconoce por su forma. Un nombre, una dirección o un dato de
 * salud no la tienen, y para eso sigue la revisión de una persona antes de
 * publicar. Por eso retira sin dudar donde la forma es segura —un DNI con su
 * letra, un IBAN con su control— y se contiene donde no lo es: nueve cifras
 * junto a «€» son un importe y se quedan, porque quitarlas corrompería la queja
 * tanto como dejar un teléfono la expone. Los casos, en tests/fixtures/pii-casos.json.
 *
 * Devuelve cuántos de cada clase, nunca cuáles: lo retirado no se guarda en
 * ninguna parte, tampoco en un registro.
 */
export const CLASES_PII = ['telefono', 'correo', 'dni', 'nie', 'iban', 'matricula'] as const
export type ClasePii = (typeof CLASES_PII)[number]

/** Lo que queda en el texto donde había un dato personal. */
export const MARCA_RETIRADO = '[dato personal retirado]'

export type Retirados = Partial<Record<ClasePii, number>>

export interface Limpieza {
  texto: string
  /** Cuántos de cada clase se retiraron; sólo las que tienen alguno. */
  retirados: Retirados
}

/** Cómo se nombra cada clase en lo que lee quien escribió la queja: uno, y varios. */
export const NOMBRES_PII: Record<ClasePii, readonly [uno: string, varios: string]> = {
  telefono: ['un teléfono', 'teléfonos'],
  correo: ['un correo', 'correos'],
  dni: ['un DNI', 'DNI'],
  nie: ['un NIE', 'NIE'],
  iban: ['un IBAN', 'IBAN'],
  matricula: ['una matrícula', 'matrículas'],
}

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'
const letraDni = (n: number) => LETRAS_DNI[n % 23]

/** El control de un IBAN: los cuatro primeros al final, las letras en números, módulo 97. */
function ibanValido(iban: string): boolean {
  const s = iban.replace(/[\s-]+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false
  let resto = 0
  for (const c of s.slice(4) + s.slice(0, 4)) {
    const v = c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c
    for (const d of v) resto = (resto * 10 + Number(d)) % 97
  }
  return resto === 1
}

const CORREO = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi
// El español: ES, dos dígitos de control y veinte cifras, en grupos de cuatro o
// seguido. Sólo cifras, para que la palabra de después no pase por un grupo más.
const IBAN_ES = /\b[Ee][Ss]\d{2}(?:[ \u00a0-]{0,2}\d{4}){5}\b/g
// Los demás: dos letras, dos dígitos y el resto, en mayúscula (así una palabra en
// minúscula no se cuela como grupo).
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g
// Ocho cifras, con los millares separados por punto, espacio o nada, o siete
// seguidas; y la letra. Separada de las cifras, sólo en mayúscula: «12345678 y»
// es un número y una conjunción. Siete cifras con millares separados, no: unas
// cifras sueltas delante de una mayúscula acertarían la letra una vez de cada 23.
const DNI = /(?<![\w.])(\d{2}[. \u00a0]?\d{3}[. \u00a0]?\d{3}|\d{7})([ -]?)([A-Za-z])(?!\w)/g
const NIE = /(?<!\w)([XYZ])[ -]?(\d{7})[ -]?([A-Z])(?!\w)/gi
// Nueve cifras que empiezan por 6, 7, 8 o 9, con prefijo o sin él, separadas por
// espacios (también el duro, U+00A0, que deja una agenda al copiar; un salto de
// línea no), puntos, guiones, barras o paréntesis —«(96) 123 45 67»—. No si van
// detrás de más cifras («1.612…») o siguen más cifras, decimales o una moneda: eso
// es un importe. Un «tlf.612…» sí.
const TELEFONO =
  /(?<![\w€]|\d[.,])(?:(?:\+|00)34[ \t\u00a0./()-]{0,2})?\(?[6789](?:[ \t\u00a0./()-]{0,2}\d){8}(?!\w|[.,]\d|[ \t\u00a0]*(?:€|euros?\b|eur\b))/gi
/**
 * Lo que la forma de un teléfono no basta para decidir. Se agrupa como se agrupa
 * un número al escribirlo —«612 345 678», «96 123 45 67»—: con separadores, cada
 * grupo tiene al menos dos cifras («portales 7 9 11 13 15» no es un número), y
 * con barras ninguno tiene cuatro («Factura 9/2026/0001» es una referencia).
 *
 * Una fecha seguida de una hora u otra fecha hace nueve cifras, y la primera regla
 * ya la descarta: sólo empieza por 6, 7, 8 o 9 un día de una cifra. Una guarda de
 * fechas aparte dejaba escapar un teléfono como «600-00-00-13», con la forma de
 * una fecha en la cola (revisión de #144).
 */
function pareceTelefono(m: string): boolean {
  const grupos = m
    .replace(/^\(?(?:\+|00)34/, '')
    .split(/\D+/)
    .filter(Boolean)
  if (grupos.length > 1 && grupos.some((g) => g.length < 2)) return false
  if (m.includes('/') && grupos.some((g) => g.length >= 4)) return false
  return true
}
// La actual: cuatro cifras y tres consonantes, en mayúscula o no, y con « - » o
// sin nada entre medias. Nunca dentro de un id de queja («Q-…»), ni si las tres
// letras son una unidad: «1500 mts», «1200 kwh», «1000 kgs» son una medida.
const UNIDADES =
  'mts|kms|cms|mms|kgs|grs|tns|lts|mls|cls|dls|hrs|mns|sgs|kwh|mwh|gwh|rpm|ppm|pts|cts|mph'
const MATRICULA = new RegExp(
  `(?<!Q-)\\b\\d{4}(?:[ \\u00a0]?-[ \\u00a0]?|[ \\u00a0])?(?!(?:${UNIDADES})\\b)[BCDFGHJKLMNPRSTVWXYZ]{3}\\b`,
  'gi',
)
// La provincial de antes: el código de la provincia, cuatro cifras y una o dos
// letras, con guiones o todo junto. Con espacios no: en un texto en mayúsculas,
// «DE 2020 A 2024 EL…» tiene esa forma (la A es un código de provincia), y una
// matrícula así tiene ya más de veinticinco años.
const PROVINCIAS =
  'A|AB|AL|AV|B|BA|BI|BU|C|CA|CC|CE|CO|CR|CS|CU|GC|GE|GI|GR|GU|H|HU|IB|J|L|LE|LO|LU|M|MA|ML|MU|NA|O|OR|OU|P|PM|PO|S|SA|SE|SG|SO|SS|T|TE|TF|TO|V|VA|VI|Z|ZA'
const MATRICULA_PROVINCIAL = new RegExp(`(?<!Q-)\\b(?:${PROVINCIAS})-?\\d{4}-?[A-Z]{1,2}\\b`, 'g')

export function limpiarDatosPersonales(texto: string): Limpieza {
  const retirados: Retirados = {}
  const retirar = (clase: ClasePii) => {
    retirados[clase] = (retirados[clase] ?? 0) + 1
    return MARCA_RETIRADO
  }
  // El orden importa: lo que lleva cifras de otra forma sale antes que el teléfono.
  const limpio = texto
    .replace(CORREO, () => retirar('correo'))
    .replace(IBAN_ES, (m) => (ibanValido(m) ? retirar('iban') : m))
    .replace(IBAN, (m) => (ibanValido(m) ? retirar('iban') : m))
    .replace(DNI, (m, cifras: string, separador: string, letra: string) =>
      (separador && letra !== letra.toUpperCase()) ||
      letraDni(Number(cifras.replace(/[.\s]/g, ''))) !== letra.toUpperCase()
        ? m
        : retirar('dni'),
    )
    .replace(NIE, (m, inicial: string, cifras: string, letra: string) =>
      letraDni(Number(`${'XYZ'.indexOf(inicial.toUpperCase())}${cifras}`)) === letra.toUpperCase()
        ? retirar('nie')
        : m,
    )
    .replace(TELEFONO, (m) => (pareceTelefono(m) ? retirar('telefono') : m))
    .replace(MATRICULA, () => retirar('matricula'))
    .replace(MATRICULA_PROVINCIAL, () => retirar('matricula'))
  return { texto: limpio, retirados }
}

/**
 * Corta un texto ya limpio a `max` caracteres sin dejar media marca al final. Se
 * corta DESPUÉS de limpiar: cortado antes, un DNI a caballo del límite perdía la
 * letra y sus cifras ya no se reconocían (revisión de #144).
 */
export function cortarLimpio(texto: string, max: number): string {
  if (texto.length <= max) return texto
  const corto = texto.slice(0, max)
  const abre = corto.lastIndexOf('[')
  const partida =
    abre >= 0 && !corto.includes(']', abre) && MARCA_RETIRADO.startsWith(corto.slice(abre))
  return partida ? corto.slice(0, abre).trimEnd() : corto
}

/** Suma lo retirado de dos textos: el título y el detalle de una queja. */
export function sumarRetirados(a: Retirados, b: Retirados): Retirados {
  const total: Retirados = { ...a }
  for (const c of CLASES_PII) if (b[c]) total[c] = (total[c] ?? 0) + b[c]!
  return total
}

/** «un teléfono y un correo», «2 teléfonos», o null si no se retiró nada. */
export function describirRetirados(r: Retirados): string | null {
  const partes = CLASES_PII.filter((c) => r[c]).map((c) =>
    r[c] === 1 ? NOMBRES_PII[c][0] : `${r[c]} ${NOMBRES_PII[c][1]}`,
  )
  if (partes.length === 0) return null
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`
}
