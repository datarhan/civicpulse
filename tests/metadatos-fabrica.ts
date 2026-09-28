/**
 * Ficheros de pega para las pruebas de `check:metadatos` y de
 * `fixture:sin-autoria`.
 *
 * Los nombres son OBVIAMENTE FALSOS a propósito, como en `privado.test.ts`: una
 * prueba alimentada con el dato real volvería a comitear lo que la guarda
 * existe para impedir.
 *
 * Y cada fichero lo escribe algo que NO es el código que se prueba: SheetJS
 * escribe los libros de verdad (xls con su WRITEACCESS, xlsx con su
 * docProps/core.xml), y el PDF, el JPEG, el PNG y el zip de ODF se arman aquí
 * byte a byte. Un lector que se probara contra ficheros escritos por su propio
 * escritor sólo demostraría que está de acuerdo consigo mismo.
 */
import * as XLSX from 'xlsx'
import { deflateSync } from 'node:zlib'

export const PERSONA = 'Ana Ejemplo'
export const OTRA = 'Luis Muestra'
export const EMPRESA = 'Casa Ficticia'

/** Un libro de verdad, escrito por SheetJS, con autoría en sus metadatos. */
export function libro(
  bookType: 'xls' | 'xlsx',
  props: Record<string, string> = { Author: PERSONA, LastAuthor: OTRA, Company: EMPRESA },
  comentario?: { autor: string; texto: string },
): Buffer {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    ['concepto', 'importe'],
    ['Capítulo 1', 1234.5],
  ])
  if (comentario) ws.A1.c = [{ a: comentario.autor, t: comentario.texto }]
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
  wb.Props = props
  return XLSX.write(wb, { type: 'buffer', bookType }) as Buffer
}

/**
 * Un libro con propiedades personalizadas: SheetJS las escribe en la sección de
 * usuario de DocumentSummaryInformation (xls, en UTF-16) o en docProps/custom.xml.
 */
export function libroConPersonalizadas(
  bookType: 'xls' | 'xlsx',
  custprops: Record<string, string>,
): Buffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 1]]), 'Hoja1')
  wb.Custprops = custprops
  return XLSX.write(wb, { type: 'buffer', bookType }) as Buffer
}

/** Un fichero compuesto OLE con los flujos que se le den (escritor de SheetJS). */
export function ole(flujos: Record<string, Uint8Array>): Buffer {
  const cfb = XLSX.CFB.utils.cfb_new()
  for (const [nombre, datos] of Object.entries(flujos)) {
    XLSX.CFB.utils.cfb_add(cfb, nombre, Buffer.from(datos))
  }
  return Buffer.from(XLSX.CFB.write(cfb, { type: 'buffer' }) as Uint8Array)
}

/**
 * El flujo «Current User» de un .ppt ([MS-PPT] 2.3.2): cabecera de registro,
 * tamaño, testigo, posición de la última edición, y el nombre de usuario en
 * ANSI y en UTF-16.
 */
export function usuarioActualPpt(nombre: string): Buffer {
  const b = Buffer.alloc(32 + nombre.length * 3)
  b.writeUInt16LE(0x0000, 0) // recVer/recInstance
  b.writeUInt16LE(0x0ff6, 2) // RT_CurrentUserAtom
  b.writeUInt32LE(b.length - 8, 4)
  b.writeUInt32LE(0x14, 8) // size
  b.writeUInt32LE(0xe391c05f, 12) // headerToken (sin cifrar)
  b.writeUInt32LE(0, 16) // offsetToCurrentEdit
  b.writeUInt16LE(nombre.length, 20) // lenUserName
  b.writeUInt16LE(0x03f4, 22) // docFileVersion
  b[24] = 3 // majorVersion
  b[25] = 0 // minorVersion
  b.write(nombre, 28, 'latin1')
  b.writeUInt32LE(8, 28 + nombre.length) // relVersion
  b.write(nombre, 32 + nombre.length, 'utf16le')
  return b
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

/**
 * Un zip sin comprimir, en el ORDEN dado. Es lo que pide ODF: `mimetype`
 * primero y guardado tal cual, que el escritor de SheetJS no garantiza.
 */
export function zipGuardado(entradas: Array<[string, string]>): Buffer {
  const locales: Buffer[] = []
  const centrales: Buffer[] = []
  let offset = 0
  for (const [nombre, texto] of entradas) {
    const datos = Buffer.from(texto, 'utf8')
    const n = Buffer.from(nombre, 'utf8')
    const crc = crc32(datos)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // nombres en UTF-8
    local.writeUInt16LE(0, 8) // guardado
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(datos.length, 18)
    local.writeUInt32LE(datos.length, 22)
    local.writeUInt16LE(n.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(datos.length, 20)
    central.writeUInt32LE(datos.length, 24)
    central.writeUInt16LE(n.length, 28)
    central.writeUInt32LE(offset, 42)
    locales.push(local, n, datos)
    centrales.push(central, n)
    offset += 30 + n.length + datos.length
  }
  const cd = Buffer.concat(centrales)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(entradas.length, 8)
  fin.writeUInt16LE(entradas.length, 10)
  fin.writeUInt32LE(cd.length, 12)
  fin.writeUInt32LE(offset, 16)
  return Buffer.concat([...locales, cd, fin])
}

export const MIMETYPE_ODS = 'application/vnd.oasis.opendocument.spreadsheet'

export function metaOdf(creadora: string, editora: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><office:document-meta ' +
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/"><office:meta>' +
    `<meta:initial-creator>${creadora}</meta:initial-creator>` +
    `<dc:creator>${editora}</dc:creator>` +
    '<meta:generator>MicrosoftOffice/16.0</meta:generator>' +
    '</office:meta></office:document-meta>'
  )
}

// ── TIFF / EXIF ──────────────────────────────────────────────────────────────

export type EtiquetaTiff = {
  tag: number
  tipo: 1 | 2 | 3 | 4 | 5 | 7
  valor: string | number | number[] | Uint8Array
}

function bytesDe(e: EtiquetaTiff): Buffer {
  switch (e.tipo) {
    case 2:
      return Buffer.from(`${e.valor}\0`, 'latin1')
    case 3: {
      const b = Buffer.alloc(2)
      b.writeUInt16LE(Number(e.valor))
      return b
    }
    case 4: {
      const b = Buffer.alloc(4)
      b.writeUInt32LE(Number(e.valor))
      return b
    }
    case 5: {
      const v = e.valor as number[]
      const b = Buffer.alloc(v.length * 4)
      v.forEach((x, i) => b.writeUInt32LE(x, i * 4))
      return b
    }
    default:
      return Buffer.from(e.valor as Uint8Array)
  }
}

const cuenta = (e: EtiquetaTiff, b: Buffer) =>
  e.tipo === 3 || e.tipo === 4 ? 1 : e.tipo === 5 ? b.length / 8 : b.length

function ifd(etiquetas: EtiquetaTiff[], base: number): Buffer {
  const cab = Buffer.alloc(2 + 12 * etiquetas.length + 4)
  cab.writeUInt16LE(etiquetas.length, 0)
  const datos: Buffer[] = []
  let libre = base + cab.length
  etiquetas.forEach((e, i) => {
    const v = bytesDe(e)
    const o = 2 + 12 * i
    cab.writeUInt16LE(e.tag, o)
    cab.writeUInt16LE(e.tipo, o + 2)
    cab.writeUInt32LE(cuenta(e, v), o + 4)
    if (v.length <= 4) v.copy(cab, o + 8)
    else {
      cab.writeUInt32LE(libre, o + 8)
      const par = v.length % 2 ? Buffer.concat([v, Buffer.alloc(1)]) : v
      datos.push(par)
      libre += par.length
    }
  })
  return Buffer.concat([cab, ...datos])
}

/** Un TIFF little-endian: IFD0, y si se dan, la IFD de Exif y la de GPS. */
export function tiff(ifd0: EtiquetaTiff[], exif: EtiquetaTiff[] = [], gps: EtiquetaTiff[] = []) {
  const cero: EtiquetaTiff[] = [...ifd0]
  if (exif.length) cero.push({ tag: 0x8769, tipo: 4, valor: 0 })
  if (gps.length) cero.push({ tag: 0x8825, tipo: 4, valor: 0 })
  cero.sort((a, b) => a.tag - b.tag)
  const offExif = 8 + ifd(cero, 8).length
  const offGps = offExif + (exif.length ? ifd(exif, offExif).length : 0)
  for (const e of cero) {
    if (e.tag === 0x8769) e.valor = offExif
    if (e.tag === 0x8825) e.valor = offGps
  }
  return Buffer.concat([
    Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]),
    ifd(cero, 8),
    exif.length ? ifd(exif, offExif) : Buffer.alloc(0),
    gps.length ? ifd(gps, offGps) : Buffer.alloc(0),
  ])
}

export const ascii = (tag: number, valor: string): EtiquetaTiff => ({ tag, tipo: 2, valor })
/** Grados, minutos y segundos como tres racionales. */
export const coordenada = (tag: number, g: number, m: number, s: number): EtiquetaTiff => ({
  tag,
  tipo: 5,
  valor: [g, 1, m, 1, s * 100, 100],
})

// ── JPEG ─────────────────────────────────────────────────────────────────────

const segmento = (marca: number, datos: Buffer) => {
  const h = Buffer.alloc(4)
  h[0] = 0xff
  h[1] = marca
  h.writeUInt16BE(datos.length + 2, 2)
  return Buffer.concat([h, datos])
}

/** Datos de imagen de pega tras el SOS: lo que la limpieza NO puede tocar. */
export const ESCANEO = Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0])

export function iptc(conjuntos: Array<[number, number, string]>): Buffer {
  const iim = Buffer.concat(
    conjuntos.map(([registro, dato, texto]) => {
      const v = Buffer.from(texto, 'utf8')
      const h = Buffer.from([0x1c, registro, dato, 0, 0])
      h.writeUInt16BE(v.length, 3)
      return Buffer.concat([h, v])
    }),
  )
  const tam = Buffer.alloc(4)
  tam.writeUInt32BE(iim.length)
  const recurso = Buffer.concat([
    Buffer.from('8BIM', 'latin1'),
    Buffer.from([0x04, 0x04, 0x00, 0x00]), // 0x0404 IPTC-NAA, nombre vacío
    tam,
    iim,
    iim.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0),
  ])
  return Buffer.concat([Buffer.from('Photoshop 3.0\0', 'latin1'), recurso])
}

export function jpeg(p: {
  exif?: Buffer
  xmp?: string
  iptc?: Buffer
  comentario?: string
}): Buffer {
  const partes = [
    Buffer.from([0xff, 0xd8]),
    segmento(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
  ]
  if (p.exif)
    partes.push(segmento(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), p.exif])))
  if (p.xmp) {
    partes.push(
      segmento(
        0xe1,
        Buffer.concat([
          Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'),
          Buffer.from(p.xmp),
        ]),
      ),
    )
  }
  if (p.iptc) partes.push(segmento(0xed, p.iptc))
  if (p.comentario) partes.push(segmento(0xfe, Buffer.from(p.comentario, 'latin1')))
  partes.push(
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    ESCANEO,
    Buffer.from([0xff, 0xd9]),
  )
  return Buffer.concat(partes)
}

/** Un paquete XMP: propiedades como atributos de rdf:Description y como elementos. */
export function xmp(atributos: string, elementos = ''): string {
  return (
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ' +
    'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:aux="http://ns.adobe.com/exif/1.0/aux/" ' +
    `xmlns:exif="http://ns.adobe.com/exif/1.0/" ${atributos}>${elementos}` +
    '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>'
  )
}

// ── PNG ──────────────────────────────────────────────────────────────────────

function trozo(tipo: string, datos: Buffer): Buffer {
  const tam = Buffer.alloc(4)
  tam.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([tam, cuerpo, crc])
}

export function png(trozos: Array<[string, Buffer]>): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8 // profundidad
  ihdr[9] = 0 // gris
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    ...trozos.map(([t, d]) => trozo(t, d)),
    trozo('IDAT', deflateSync(Buffer.from([0, 0]))),
    trozo('IEND', Buffer.alloc(0)),
  ])
}

export const textoPng = (clave: string, texto: string) =>
  Buffer.from(`${clave}\0${texto}`, 'latin1')

// ── PDF ──────────────────────────────────────────────────────────────────────

/** Un PDF de texto: los objetos que se den, en orden, y un tráiler. */
export function pdf(objetos: string[], trailer = '<< /Size 9 /Root 1 0 R /Info 2 0 R >>'): Buffer {
  return Buffer.from(
    `%PDF-1.7\n%\xe2\xe3\xcf\xd3\n${objetos.join('\n')}\ntrailer\n${trailer}\n%%EOF\n`,
    'latin1',
  )
}

/** Un objeto con un flujo comprimido con Flate, como lo escribe un PDF 1.5+. */
export function objetoFlate(numero: number, dicc: string, contenido: string): Buffer {
  const datos = deflateSync(Buffer.from(contenido, 'latin1'))
  return Buffer.concat([
    Buffer.from(
      `${numero} 0 obj\n<< ${dicc} /Length ${datos.length} /Filter /FlateDecode >>\nstream\n`,
      'latin1',
    ),
    datos,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ])
}

/** Un flujo de objetos (/Type /ObjStm) con los objetos dados, comprimido. */
export function flujoDeObjetos(numero: number, objetos: Array<[number, string]>): Buffer {
  let cuerpo = ''
  const pares: string[] = []
  for (const [n, texto] of objetos) {
    pares.push(`${n} ${cuerpo.length}`)
    cuerpo += `${texto}\n`
  }
  const cabecera = `${pares.join(' ')}\n`
  return objetoFlate(
    numero,
    `/Type /ObjStm /N ${objetos.length} /First ${cabecera.length}`,
    cabecera + cuerpo,
  )
}
