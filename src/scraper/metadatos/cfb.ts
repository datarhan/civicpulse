/**
 * Un fichero compuesto OLE ([MS-CFB]: .xls, .doc, .ppt) leído sin perder de
 * vista DÓNDE está cada byte de cada flujo dentro del fichero.
 *
 * Hace falta por la limpieza: los metadatos de autoría se vacían EN SU SITIO,
 * sin volver a guardar el fichero, para que una fixture siga siendo la descarga
 * real byte a byte fuera de esos campos. Así se hizo con
 * `conprel_CV_2024.xls` el 28-09-2026, y lo que aquel día fue un script suelto
 * es esto.
 *
 * No escribe ni reorganiza nada. Un fichero que no cuadra —una cadena de
 * sectores rota o que da vueltas, una lectura fuera del fichero— LANZA, y quien
 * llama lo cuenta como ilegible: nunca como limpio.
 *
 * Y lee también:
 *   · los conjuntos de propiedades ([MS-OLEPS]) de SummaryInformation y
 *     DocumentSummaryInformation, con su sección de propiedades de usuario;
 *   · el registro WRITEACCESS del libro BIFF ([MS-XLS] 2.4.349), que guarda el
 *     nombre de quien lo guardó con Excel y que `Props` de SheetJS NO enseña;
 *   · el flujo «Current User» de PowerPoint ([MS-PPT] 2.3.2).
 */
import { TextDecoder } from 'node:util'
import type { Tramo } from './tipos.ts'

const FIN_DE_CADENA = 0xfffffffe
const LIBRE = 0xffffffff

export interface EntradaCfb {
  nombre: string
  /** Ruta del almacén que la contiene, sin la raíz: '' en el primer nivel. */
  almacen: string
  tipo: number
  inicio: number
  tam: number
}

export interface Cfb {
  entradas: EntradaCfb[]
  contenido(e: EntradaCfb): Uint8Array
  /** Los bytes [desde, hasta) del flujo, como tramos del FICHERO con su reemplazo. */
  tramos(e: EntradaCfb, desde: number, hasta: number, reemplazo: Uint8Array): Tramo[]
}

export function leerCfb(b: Uint8Array): Cfb {
  if (b.length < 512) throw new Error('más corto que la cabecera de un fichero compuesto')
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const u16 = (o: number) => {
    if (o < 0 || o + 2 > b.length) throw new Error(`lectura fuera del fichero (${o})`)
    return dv.getUint16(o, true)
  }
  const u32 = (o: number) => {
    if (o < 0 || o + 4 > b.length) throw new Error(`lectura fuera del fichero (${o})`)
    return dv.getUint32(o, true)
  }

  const version = u16(0x1a)
  const ss = 2 ** u16(0x1e)
  const mss = 2 ** u16(0x20)
  if (ss !== 512 && ss !== 4096) throw new Error(`tamaño de sector imposible: ${ss}`)
  if (mss !== 64) throw new Error(`tamaño de minisector imposible: ${mss}`)
  const nFat = u32(0x2c)
  const primerDirectorio = u32(0x30)
  const corte = u32(0x38)
  const primerMiniFat = u32(0x3c)
  const nMiniFat = u32(0x40)
  const primerDifat = u32(0x44)
  const nDifat = u32(0x48)
  const sector = (s: number) => (s + 1) * ss

  const sectoresFat: number[] = []
  for (let i = 0; i < 109 && sectoresFat.length < nFat; i++) {
    const v = u32(0x4c + 4 * i)
    if (v !== LIBRE) sectoresFat.push(v)
  }
  const vistosDifat = new Set<number>()
  for (let k = 0, d = primerDifat; k < nDifat && d !== FIN_DE_CADENA && d !== LIBRE; k++) {
    if (vistosDifat.has(d)) throw new Error('la DIFAT da vueltas')
    vistosDifat.add(d)
    for (let i = 0; i < ss / 4 - 1 && sectoresFat.length < nFat; i++) {
      const v = u32(sector(d) + 4 * i)
      if (v !== LIBRE) sectoresFat.push(v)
    }
    d = u32(sector(d) + ss - 4)
  }
  if (sectoresFat.length !== nFat) {
    throw new Error(`la cabecera anuncia ${nFat} sectores de FAT y hay ${sectoresFat.length}`)
  }
  const fat: number[] = []
  for (const s of sectoresFat) for (let i = 0; i < ss / 4; i++) fat.push(u32(sector(s) + 4 * i))

  const cadena = (inicio: number, tabla: number[], que: string): number[] => {
    const fuera: number[] = []
    const vistos = new Set<number>()
    for (let s = inicio; s !== FIN_DE_CADENA; s = tabla[s]) {
      if (s === LIBRE || s >= tabla.length) throw new Error(`${que}: cadena rota en ${s}`)
      if (vistos.has(s)) throw new Error(`${que}: la cadena da vueltas`)
      vistos.add(s)
      fuera.push(s)
    }
    return fuera
  }

  const utf16 = new TextDecoder('utf-16le')
  const crudas: Array<EntradaCfb & { izq: number; der: number; hijo: number }> = []
  for (const s of cadena(primerDirectorio, fat, 'directorio')) {
    for (let i = 0; i < ss / 128; i++) {
      const o = sector(s) + 128 * i
      const largo = u16(o + 64)
      if (largo > 64) throw new Error('nombre de entrada imposible')
      crudas.push({
        nombre: utf16.decode(b.subarray(o, o + Math.max(0, largo - 2))),
        almacen: '',
        tipo: b[o + 66],
        izq: u32(o + 68),
        der: u32(o + 72),
        hijo: u32(o + 76),
        inicio: u32(o + 116),
        tam: version === 3 ? u32(o + 120) : Number(dv.getBigUint64(o + 120, true)),
      })
    }
  }
  if (crudas.length === 0 || crudas[0].tipo !== 5) throw new Error('no hay entrada raíz')

  // Cada almacén guarda a sus hijos en un árbol rojo-negro: se recorre para
  // saber de quién es cada flujo (un objeto incrustado trae su propio
  // SummaryInformation, con su propio autor).
  const visitadas = new Set<number>()
  const recorrer = (i: number, almacen: string) => {
    if (i === LIBRE || i >= crudas.length) return
    if (visitadas.has(i)) throw new Error('el directorio da vueltas')
    visitadas.add(i)
    const e = crudas[i]
    e.almacen = almacen
    recorrer(e.izq, almacen)
    recorrer(e.der, almacen)
    if (e.tipo === 1) recorrer(e.hijo, almacen ? `${almacen}/${e.nombre}` : e.nombre)
  }
  recorrer(crudas[0].hijo, '')
  const entradas = crudas.filter((_, i) => visitadas.has(i)).map(({ izq, der, hijo, ...e }) => e)

  const raiz = crudas[0]
  const miniFat: number[] = []
  if (nMiniFat > 0) {
    for (const s of cadena(primerMiniFat, fat, 'minifat')) {
      for (let i = 0; i < ss / 4; i++) miniFat.push(u32(sector(s) + 4 * i))
    }
  }
  const miniFlujo = raiz.tam === 0 ? [] : cadena(raiz.inicio, fat, 'miniflujo')

  const segmentos = (e: EntradaCfb): Array<[number, number]> => {
    const fuera: Array<[number, number]> = []
    let quedan = e.tam
    if (quedan === 0) return fuera
    if (e.tam >= corte) {
      for (const s of cadena(e.inicio, fat, e.nombre)) {
        if (quedan <= 0) break
        const n = Math.min(ss, quedan)
        fuera.push([sector(s), n])
        quedan -= n
      }
    } else {
      for (const m of cadena(e.inicio, miniFat, e.nombre)) {
        if (quedan <= 0) break
        const enMini = m * mss
        const s = miniFlujo[Math.floor(enMini / ss)]
        if (s === undefined) throw new Error(`${e.nombre}: minisector fuera del miniflujo`)
        const n = Math.min(mss, quedan)
        fuera.push([sector(s) + (enMini % ss), n])
        quedan -= n
      }
    }
    if (quedan > 0) throw new Error(`${e.nombre}: le faltan ${quedan} bytes`)
    for (const [o, n] of fuera)
      if (o + n > b.length) throw new Error(`${e.nombre}: sale del fichero`)
    return fuera
  }

  return {
    entradas,
    contenido(e) {
      const segs = segmentos(e)
      const fuera = new Uint8Array(e.tam)
      let p = 0
      for (const [o, n] of segs) {
        fuera.set(b.subarray(o, o + n), p)
        p += n
      }
      return fuera
    },
    tramos(e, desde, hasta, reemplazo) {
      if (reemplazo.length !== hasta - desde) throw new Error('el reemplazo no mide lo que tapa')
      const fuera: Tramo[] = []
      let p = 0
      for (const [o, n] of segmentos(e)) {
        const a = Math.max(desde, p)
        const z = Math.min(hasta, p + n)
        if (a < z)
          fuera.push({ inicio: o + (a - p), bytes: reemplazo.subarray(a - desde, z - desde) })
        p += n
      }
      return fuera
    },
  }
}

// ── Conjuntos de propiedades ([MS-OLEPS]) ────────────────────────────────────

export const FMTID_RESUMEN = 'F29F85E0-4FF9-1068-AB91-08002B27B3D9'
export const FMTID_DOCUMENTO = 'D5CDD502-2E9C-101B-9397-08002B2CF9AE'
export const FMTID_USUARIO = 'D5CDD505-2E9C-101B-9397-08002B2CF9AE'

export const NOMBRES_RESUMEN: Record<number, string> = {
  2: 'Title',
  3: 'Subject',
  4: 'Author',
  5: 'Keywords',
  6: 'Comments',
  7: 'Template',
  8: 'LastAuthor',
  9: 'RevNumber',
  18: 'AppName',
}
export const NOMBRES_DOCUMENTO: Record<number, string> = {
  2: 'Category',
  14: 'Manager',
  15: 'Company',
  26: 'ContentType',
  27: 'ContentStatus',
}

export interface CadenaPropiedad {
  pid: number
  /** El nombre del [MS-OSHARED] o, en la sección de usuario, el del diccionario. */
  nombre: string
  valor: string
  /** Los bytes de los caracteres en el FLUJO: [desde, hasta). */
  desde: number
  hasta: number
}

export interface SeccionPropiedades {
  fmtid: string
  cadenas: CadenaPropiedad[]
}

const guid = (b: Uint8Array, o: number) => {
  const dv = new DataView(b.buffer, b.byteOffset + o, 16)
  const h = (n: number, d: number) => n.toString(16).padStart(d, '0')
  const cola = Array.from(b.subarray(o + 8, o + 16), (x) => h(x, 2)).join('')
  return `${h(dv.getUint32(0, true), 8)}-${h(dv.getUint16(4, true), 4)}-${h(dv.getUint16(6, true), 4)}-${cola.slice(0, 4)}-${cola.slice(4)}`.toUpperCase()
}

function decodificador(paginaDeCodigos: number): TextDecoder {
  const etiqueta =
    paginaDeCodigos === 1200
      ? 'utf-16le'
      : paginaDeCodigos === 65001
        ? 'utf-8'
        : paginaDeCodigos === 10000
          ? 'macintosh'
          : `windows-${paginaDeCodigos}`
  try {
    return new TextDecoder(etiqueta)
  } catch {
    return new TextDecoder('latin1')
  }
}

export function leerPropiedades(f: Uint8Array): SeccionPropiedades[] {
  const dv = new DataView(f.buffer, f.byteOffset, f.byteLength)
  const u16 = (o: number) => {
    if (o < 0 || o + 2 > f.length) throw new Error(`propiedades: lectura fuera del flujo (${o})`)
    return dv.getUint16(o, true)
  }
  const u32 = (o: number) => {
    if (o < 0 || o + 4 > f.length) throw new Error(`propiedades: lectura fuera del flujo (${o})`)
    return dv.getUint32(o, true)
  }
  if (u16(0) !== 0xfffe) throw new Error('propiedades: orden de bytes imposible')
  const nConjuntos = u32(24)
  if (nConjuntos > 8) throw new Error(`propiedades: ${nConjuntos} secciones`)

  const secciones: SeccionPropiedades[] = []
  for (let i = 0; i < nConjuntos; i++) {
    if (28 + 20 * i + 20 > f.length) throw new Error('propiedades: cabecera cortada')
    const fmtid = guid(f, 28 + 20 * i)
    const base = u32(44 + 20 * i)
    const tam = u32(base)
    const n = u32(base + 4)
    if (n > 4096 || 8 + 8 * n > tam || base + tam > f.length) {
      throw new Error('propiedades: sección más larga que el flujo')
    }
    const pares: Array<[number, number]> = []
    for (let j = 0; j < n; j++) pares.push([u32(base + 8 + 8 * j), base + u32(base + 12 + 8 * j)])

    const pc = pares.find(([pid]) => pid === 1)
    const paginaDeCodigos = pc && u16(pc[1]) === 2 ? u16(pc[1] + 4) : 1252
    const dec = decodificador(paginaDeCodigos)
    const utf16 = new TextDecoder('utf-16le')

    const diccionario = new Map<number, string>()
    const dic = fmtid === FMTID_USUARIO ? pares.find(([pid]) => pid === 0) : undefined
    if (dic) {
      let o = dic[1]
      const entradas = u32(o)
      o += 4
      for (let k = 0; k < entradas && k < 4096; k++) {
        const pid = u32(o)
        const largo = u32(o + 4)
        const bytes = paginaDeCodigos === 1200 ? largo * 2 : largo
        if (o + 8 + bytes > f.length) throw new Error('propiedades: diccionario cortado')
        diccionario.set(pid, dec.decode(f.subarray(o + 8, o + 8 + bytes)).replaceAll('\u0000', ''))
        o += 8 + bytes
        if (paginaDeCodigos === 1200) o += (4 - (bytes % 4)) % 4
      }
    }

    const nombres =
      fmtid === FMTID_RESUMEN ? NOMBRES_RESUMEN : fmtid === FMTID_DOCUMENTO ? NOMBRES_DOCUMENTO : {}
    const cadenas: CadenaPropiedad[] = []
    for (const [pid, o] of pares) {
      if (pid < 2) continue
      const tipo = u16(o)
      if (tipo !== 0x1e && tipo !== 0x1f) continue
      const cuenta = u32(o + 4)
      const bytes = tipo === 0x1f ? cuenta * 2 : cuenta
      if (o + 8 + bytes > f.length) throw new Error(`propiedades: la cadena ${pid} sale del flujo`)
      const crudo = f.subarray(o + 8, o + 8 + bytes)
      const valor = (tipo === 0x1f ? utf16 : dec).decode(crudo)
      cadenas.push({
        pid,
        nombre: diccionario.get(pid) ?? nombres[pid] ?? `pid ${pid}`,
        valor,
        desde: o + 8,
        hasta: o + 8 + bytes,
      })
    }
    secciones.push({ fmtid, cadenas })
  }
  return secciones
}

// ── BIFF: WRITEACCESS ────────────────────────────────────────────────────────

export interface EscrituraBiff {
  usuario: string
  /** Lo que queda en el relleno: a veces, el final de un nombre anterior más largo. */
  resto: string
  /** Posiciones en el flujo Workbook: caracteres del nombre y relleno. */
  desde: number
  finUsuario: number
  hasta: number
  ancho: 1 | 2
}

export function leerWriteAccess(libro: Uint8Array): EscrituraBiff | null {
  const dv = new DataView(libro.buffer, libro.byteOffset, libro.byteLength)
  if (libro.length < 8) return null
  const bof = dv.getUint16(0, true)
  if (bof !== 0x0809 && bof !== 0x0409 && bof !== 0x0209 && bof !== 0x0009) return null
  const biff8 = bof === 0x0809 && dv.getUint16(4, true) === 0x0600
  const latin1 = new TextDecoder('latin1')
  const utf16 = new TextDecoder('utf-16le')

  for (let p = 0; p + 4 <= libro.length;) {
    const tipo = dv.getUint16(p, true)
    const largo = dv.getUint16(p + 2, true)
    if (p + 4 + largo > libro.length) throw new Error('BIFF: registro cortado')
    if (tipo === 0x005c && largo >= 3) {
      const d = p + 4
      const cch = biff8 ? dv.getUint16(d, true) : libro[d]
      const ancho: 1 | 2 = biff8 && libro[d + 2] & 1 ? 2 : 1
      const desde = d + (biff8 ? 3 : 1)
      const finUsuario = desde + cch * ancho
      if (finUsuario > d + largo) throw new Error('BIFF: WRITEACCESS más largo que su registro')
      const dec = ancho === 2 ? utf16 : latin1
      return {
        usuario: dec.decode(libro.subarray(desde, finUsuario)),
        resto: dec.decode(libro.subarray(finUsuario, d + largo)),
        desde,
        finUsuario,
        hasta: d + largo,
        ancho,
      }
    }
    if (tipo === 0x000a) break // EOF del globals: WRITEACCESS no está después
    p += 4 + largo
  }
  return null
}

// ── PowerPoint: Current User ─────────────────────────────────────────────────

export function leerUsuarioActual(f: Uint8Array): string | null {
  if (f.length < 28) return null
  const dv = new DataView(f.buffer, f.byteOffset, f.byteLength)
  const largo = dv.getUint16(20, true)
  if (28 + largo > f.length) throw new Error('Current User: nombre cortado')
  const ansi = new TextDecoder('latin1').decode(f.subarray(28, 28 + largo))
  const u = 32 + largo
  const unicode =
    u + 2 * largo <= f.length
      ? new TextDecoder('utf-16le').decode(f.subarray(u, u + 2 * largo))
      : ''
  return unicode || ansi
}
