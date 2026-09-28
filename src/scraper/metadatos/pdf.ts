/**
 * Los metadatos de autoría de un PDF, leídos como los leería quien los busca y
 * no como los enseña un visor.
 *
 * Un visor enseña la ÚLTIMA revisión. Pero «quitar el autor» desde un visor
 * guarda una revisión incremental: añade un diccionario Info nuevo al final y
 * deja el viejo en el fichero, entero, a un `strings` de distancia. Por eso aquí
 * se leen TODOS los /Author —directos, indirectos (7 0 R) y dentro de flujos de
 * objetos comprimidos—, el dc:creator de cualquier paquete XMP, y el autor de
 * cada anotación (/T de las de marcado; no el de un campo de formulario, que es
 * su nombre).
 *
 * Un PDF cifrado no se puede leer sin descifrarlo: quien llama lo cuenta como
 * ilegible. Y un flujo de objetos o de metadatos que no se puede descomprimir
 * LANZA, porque podría llevar justo el diccionario Info: saltarlo sería dar por
 * limpio lo que nadie leyó.
 */
import { TextDecoder } from 'node:util'
import { inflateSync } from 'node:zlib'

export interface CampoPdf {
  campo: string
  valor: string
}

const TOPE = 64 * 1024 * 1024
const MARCADO =
  /\/Subtype\s*\/(Text|FreeText|Line|Square|Circle|Polygon|PolyLine|Highlight|Underline|Squiggly|StrikeOut|Stamp|Caret|Ink|FileAttachment|Sound|Redact)\b/

function literal(t: string, i: number): { bytes: number[]; fin: number } {
  const bytes: number[] = []
  let profundidad = 0
  for (let j = i; j < t.length; j++) {
    const ch = t[j]
    if (ch === '\\') {
      const n = t[++j]
      if (n === 'n') bytes.push(10)
      else if (n === 'r') bytes.push(13)
      else if (n === 't') bytes.push(9)
      else if (n === 'b') bytes.push(8)
      else if (n === 'f') bytes.push(12)
      else if (n === '\r') {
        if (t[j + 1] === '\n') j++
      } else if (n === '\n') {
        // continuación de línea
      } else if (n >= '0' && n <= '7') {
        let octal = n
        while (octal.length < 3 && t[j + 1] >= '0' && t[j + 1] <= '7') octal += t[++j]
        bytes.push(parseInt(octal, 8) & 0xff)
      } else if (n !== undefined) bytes.push(n.charCodeAt(0) & 0xff)
      continue
    }
    if (ch === '(') {
      profundidad++
      if (profundidad === 1) continue
    } else if (ch === ')') {
      profundidad--
      if (profundidad === 0) return { bytes, fin: j + 1 }
    }
    bytes.push(ch.charCodeAt(0) & 0xff)
  }
  throw new Error('PDF: cadena sin cerrar')
}

function hexadecimal(t: string, i: number): number[] {
  const fin = t.indexOf('>', i)
  if (fin < 0) throw new Error('PDF: cadena hexadecimal sin cerrar')
  let h = t.slice(i + 1, fin).replace(/\s+/g, '')
  if (!/^[0-9a-fA-F]*$/.test(h)) throw new Error('PDF: cadena hexadecimal imposible')
  if (h.length % 2) h += '0'
  const bytes: number[] = []
  for (let k = 0; k < h.length; k += 2) bytes.push(parseInt(h.slice(k, k + 2), 16))
  return bytes
}

function texto(bytes: number[]): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = ''
    for (let k = 2; k + 1 < bytes.length; k += 2)
      s += String.fromCharCode((bytes[k] << 8) | bytes[k + 1])
    return s
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(Uint8Array.from(bytes.slice(3)))
  }
  // PDFDocEncoding coincide con Latin-1 en todo lo que lleva un nombre.
  return String.fromCharCode(...bytes)
}

/** La cadena que empieza en `i` (saltando blancos), o null si no hay una. */
function cadenaEn(t: string, i: number): string | null {
  while (i < t.length && /\s/.test(t[i])) i++
  if (t[i] === '(') return texto(literal(t, i).bytes)
  if (t[i] === '<' && t[i + 1] !== '<') return texto(hexadecimal(t, i))
  return null
}

interface Flujo {
  dicc: string
  datos: string
}

function objetosYFlujos(t: string): { objetos: Map<string, string[]>; flujos: Flujo[] } {
  const objetos = new Map<string, string[]>()
  const flujos: Flujo[] = []
  const guardar = (clave: string, cuerpo: string) =>
    objetos.set(clave, [...(objetos.get(clave) ?? []), cuerpo])
  const cabecera = /(\d+)\s+(\d+)\s+obj\b/g
  for (let m = cabecera.exec(t); m; m = cabecera.exec(t)) {
    const desde = m.index + m[0].length
    let hasta = t.indexOf('endobj', desde)
    if (hasta < 0) hasta = t.length
    const s = /\bstream\r?\n/.exec(t.slice(desde, hasta))
    if (s) {
      const inicioDatos = desde + s.index + s[0].length
      const fin = t.indexOf('endstream', inicioDatos)
      if (fin < 0) throw new Error('PDF: flujo sin endstream')
      flujos.push({
        dicc: t.slice(desde, desde + s.index),
        datos: t.slice(inicioDatos, fin).replace(/\r?\n$/, ''),
      })
      hasta = t.indexOf('endobj', fin)
      if (hasta < 0) hasta = t.length
      guardar(`${m[1]} ${m[2]}`, t.slice(desde, desde + s.index))
    } else guardar(`${m[1]} ${m[2]}`, t.slice(desde, hasta))
    cabecera.lastIndex = hasta
  }
  return { objetos, flujos }
}

function descomprimir(f: Flujo): string | null {
  const filtros = [...f.dicc.matchAll(/\/(\w+Decode)\b/g)].map((m) => m[1])
  const importante = /\/Type\s*\/(ObjStm|Metadata)\b/.test(f.dicc)
  if (filtros.length === 0) return importante ? f.datos : null
  if (filtros.length === 1 && filtros[0] === 'FlateDecode') {
    try {
      return inflateSync(Buffer.from(f.datos, 'latin1'), { maxOutputLength: TOPE }).toString(
        'latin1',
      )
    } catch (e) {
      if (importante)
        throw new Error(
          `PDF: no se puede descomprimir un flujo que importa (${(e as Error).message})`,
        )
      return null
    }
  }
  if (importante)
    throw new Error(`PDF: flujo de objetos o de metadatos con filtro ${filtros.join('+')}`)
  return null
}

export function leerPdf(b: Uint8Array): { cifrado: boolean; campos: CampoPdf[] } {
  const bruto = Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('latin1')
  if (/\/Encrypt\b/.test(bruto)) return { cifrado: true, campos: [] }

  const { objetos, flujos } = objetosYFlujos(bruto)
  const espacios = [bruto]
  const cuerpos: string[] = [...objetos.values()].flat()
  for (const f of flujos) {
    const t = descomprimir(f)
    if (t === null) continue
    espacios.push(t)
    if (/\/Type\s*\/ObjStm\b/.test(f.dicc)) {
      const n = Number(/\/N\s+(\d+)/.exec(f.dicc)?.[1])
      const primero = Number(/\/First\s+(\d+)/.exec(f.dicc)?.[1])
      if (!Number.isFinite(n) || !Number.isFinite(primero))
        throw new Error('PDF: flujo de objetos sin /N o /First')
      const nums = t.slice(0, primero).trim().split(/\s+/).map(Number)
      for (let k = 0; k < n; k++) {
        const desde = primero + nums[2 * k + 1]
        const hasta = k + 1 < n ? primero + nums[2 * k + 3] : t.length
        const cuerpo = t.slice(desde, hasta)
        objetos.set(`${nums[2 * k]} 0`, [...(objetos.get(`${nums[2 * k]} 0`) ?? []), cuerpo])
        cuerpos.push(cuerpo)
      }
    }
  }

  const campos: CampoPdf[] = []
  const vistos = new Set<string>()
  const añadir = (campo: string, valor: string | null) => {
    const v = valor?.replaceAll('\u0000', '').trim()
    if (!v || vistos.has(`${campo}\u0000${v}`)) return
    vistos.add(`${campo}\u0000${v}`)
    campos.push({ campo, valor: v })
  }

  for (const t of espacios) {
    for (const m of t.matchAll(/\/Author\b/g)) {
      const tras = m.index! + m[0].length
      const ref = /^\s*(\d+)\s+(\d+)\s+R\b/.exec(t.slice(tras, tras + 40))
      if (ref) {
        for (const cuerpo of objetos.get(`${ref[1]} ${ref[2]}`) ?? [])
          añadir('/Author', cadenaEn(cuerpo, 0))
      } else añadir('/Author', cadenaEn(t, tras))
    }
    for (const paquete of t.match(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>|<rdf:RDF[\s\S]*?<\/rdf:RDF>/g) ??
      []) {
      const xml = Buffer.from(paquete, 'latin1').toString('utf8')
      for (const m of xml.matchAll(/<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/g)) {
        const nombres = [...m[1].matchAll(/<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/g)].map((x) => x[1])
        for (const n of nombres.length ? nombres : [m[1]])
          añadir('XMP · dc:creator', n.replace(/<[^>]+>/g, ''))
      }
    }
  }
  for (const cuerpo of cuerpos) {
    if (!MARCADO.test(cuerpo)) continue
    const m = /\/T\b/.exec(cuerpo)
    if (m) añadir('anotación · /T', cadenaEn(cuerpo, m.index + m[0].length))
  }
  return { cifrado: false, campos }
}
