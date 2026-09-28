/**
 * Zip justo para OOXML (.xlsx, .docx, .pptx) y ODF (.ods, .odt): leer el
 * directorio central, sacar el contenido de una entrada, y reescribir el fichero
 * cambiando SÓLO las partes dadas.
 *
 * Reescribir copia cada entrada que no cambia byte a byte —cabecera local,
 * datos comprimidos y descriptor—, en el mismo orden, así que un `mimetype`
 * guardado primero sigue guardado y primero, como exige ODF. Es lo que la PR
 * #142 hizo a mano con `zipfile` de Python para el ODS del Consell, pero sin
 * recomprimir lo que no se toca.
 *
 * Zip64 y entradas cifradas LANZAN: quien llama lo cuenta como ilegible.
 */
import { TextDecoder } from 'node:util'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

export interface EntradaZip {
  nombre: string
  metodo: number
  banderas: number
  local: number
  datos: number
  tamComprimido: number
  tamReal: number
  /** Fin de la entrada local, descriptor de datos incluido. */
  finLocal: number
  central: number
  largoCentral: number
}

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (const x of b) c = TABLA_CRC[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Tope al descomprimir una parte: los metadatos no pesan megas; una bomba, sí. */
const TOPE = 64 * 1024 * 1024

export function leerZip(b: Uint8Array): EntradaZip[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const u16 = (o: number) => {
    if (o < 0 || o + 2 > b.length) throw new Error(`zip: lectura fuera del fichero (${o})`)
    return dv.getUint16(o, true)
  }
  const u32 = (o: number) => {
    if (o < 0 || o + 4 > b.length) throw new Error(`zip: lectura fuera del fichero (${o})`)
    return dv.getUint32(o, true)
  }

  let fin = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (u32(i) === 0x06054b50) {
      fin = i
      break
    }
  }
  if (fin < 0) throw new Error('zip: no tiene directorio central (¿cortado?)')
  const total = u16(fin + 10)
  const offCentral = u32(fin + 16)
  if (total === 0xffff || offCentral === 0xffffffff) throw new Error('zip64: no soportado')

  const decUtf8 = new TextDecoder('utf-8')
  const decAntiguo = new TextDecoder('latin1')
  const entradas: EntradaZip[] = []
  let c = offCentral
  for (let k = 0; k < total; k++) {
    if (u32(c) !== 0x02014b50) throw new Error('zip: directorio central roto')
    const banderas = u16(c + 8)
    const metodo = u16(c + 10)
    const tamComprimido = u32(c + 20)
    const tamReal = u32(c + 24)
    const n = u16(c + 28)
    const x = u16(c + 30)
    const m = u16(c + 32)
    const local = u32(c + 42)
    if (c + 46 + n > b.length) throw new Error('zip: nombre cortado')
    const nombre = (banderas & 0x0800 ? decUtf8 : decAntiguo).decode(b.subarray(c + 46, c + 46 + n))
    if (banderas & 0x0001) throw new Error(`zip: «${nombre}» está cifrada`)
    if (tamComprimido === 0xffffffff || local === 0xffffffff) throw new Error('zip64: no soportado')
    if (u32(local) !== 0x04034b50) throw new Error(`zip: «${nombre}» no tiene cabecera local`)
    const datos = local + 30 + u16(local + 26) + u16(local + 28)
    let finLocal = datos + tamComprimido
    if (finLocal > b.length) throw new Error(`zip: «${nombre}» sale del fichero`)
    if (banderas & 0x0008)
      finLocal += finLocal + 4 <= b.length && u32(finLocal) === 0x08074b50 ? 16 : 12
    entradas.push({
      nombre,
      metodo,
      banderas,
      local,
      datos,
      tamComprimido,
      tamReal,
      finLocal,
      central: c,
      largoCentral: 46 + n + x + m,
    })
    c += 46 + n + x + m
  }
  return entradas
}

export function contenidoZip(b: Uint8Array, e: EntradaZip): Uint8Array {
  const crudo = b.subarray(e.datos, e.datos + e.tamComprimido)
  if (e.metodo === 0) return crudo
  if (e.metodo === 8) return inflateRawSync(crudo, { maxOutputLength: TOPE })
  throw new Error(`zip: «${e.nombre}» usa el método de compresión ${e.metodo}`)
}

/**
 * El mismo zip con las partes de `nuevas` cambiadas. Lo demás se copia byte a
 * byte; sólo se mueven los desplazamientos que apuntan a lo que va detrás.
 */
export function reescribirZip(b: Uint8Array, nuevas: Map<string, Uint8Array>): Uint8Array {
  const entradas = leerZip(b)
  for (const nombre of nuevas.keys()) {
    if (!entradas.some((e) => e.nombre === nombre)) throw new Error(`zip: no hay «${nombre}»`)
  }
  const partes: Uint8Array[] = []
  const nuevosLocales = new Map<EntradaZip, number>()
  const cambios = new Map<EntradaZip, { crc: number; comprimido: number; real: number }>()
  let off = 0
  for (const e of [...entradas].sort((a, z) => a.local - z.local)) {
    nuevosLocales.set(e, off)
    const nueva = nuevas.get(e.nombre)
    if (!nueva) {
      const trozo = b.subarray(e.local, e.finLocal)
      partes.push(trozo)
      off += trozo.length
      continue
    }
    const datos = e.metodo === 0 ? nueva : deflateRawSync(nueva)
    const cabecera = Uint8Array.from(b.subarray(e.local, e.datos))
    const dv = new DataView(cabecera.buffer)
    const crc = crc32(nueva)
    dv.setUint16(6, e.banderas & ~0x0008, true)
    dv.setUint32(14, crc, true)
    dv.setUint32(18, datos.length, true)
    dv.setUint32(22, nueva.length, true)
    cambios.set(e, { crc, comprimido: datos.length, real: nueva.length })
    partes.push(cabecera, datos)
    off += cabecera.length + datos.length
  }
  const inicioCentral = off
  for (const e of entradas) {
    const central = Uint8Array.from(b.subarray(e.central, e.central + e.largoCentral))
    const dv = new DataView(central.buffer)
    dv.setUint32(42, nuevosLocales.get(e)!, true)
    const cambio = cambios.get(e)
    if (cambio) {
      dv.setUint16(8, e.banderas & ~0x0008, true)
      dv.setUint32(16, cambio.crc, true)
      dv.setUint32(20, cambio.comprimido, true)
      dv.setUint32(24, cambio.real, true)
    }
    partes.push(central)
    off += central.length
  }
  const dvb = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let fin = b.length - 22
  while (fin >= 0 && dvb.getUint32(fin, true) !== 0x06054b50) fin--
  const cola = Uint8Array.from(b.subarray(fin))
  const dvc = new DataView(cola.buffer)
  dvc.setUint32(12, off - inicioCentral, true)
  dvc.setUint32(16, inicioCentral, true)
  partes.push(cola)

  const total = partes.reduce((s, p) => s + p.length, 0)
  const fuera = new Uint8Array(total)
  let p = 0
  for (const parte of partes) {
    fuera.set(parte, p)
    p += parte.length
  }
  return fuera
}
