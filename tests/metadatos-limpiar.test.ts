import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  evaluar,
  leerMetadatos,
  limpiar,
  type Campo,
  type Lectura,
  type Limpieza,
} from '../src/scraper/metadatos/index.ts'
import {
  ESCANEO,
  MIMETYPE_ODS,
  OTRA,
  PERSONA,
  ascii,
  coordenada,
  iptc,
  jpeg,
  libro,
  metaOdf,
  ole,
  pdf,
  tiff,
  usuarioActualPpt,
  xmp,
  zipGuardado,
} from './metadatos-fabrica.ts'

/**
 * `npm run fixture:sin-autoria` vacía los metadatos de autoría EN SU SITIO,
 * sin volver a guardar el fichero, porque una fixture es la descarga real: si
 * se re-guarda con SheetJS o con Excel deja de serlo, y la prueba que la lee
 * pasa a probar lo que escribió nuestra herramienta.
 *
 * Lo que se comprueba aquí lo lee SheetJS, que no es el código que se prueba:
 * los campos quedan vacíos, las hojas iguales, y lo que no se tocaba, byte a
 * byte. Y lo que no sabe hacer sin romper algo —un comentario, que es parte del
 * documento; un PDF; la foto de una queja— lo rechaza sin escribir nada.
 */

const limpio = (r: Limpieza) => {
  if (r.estado !== 'limpio') throw new Error(`no quedó limpio: ${JSON.stringify(r)}`)
  return r
}
const campos = (l: Lectura): Campo[] => (l.estado === 'leido' ? l.campos : [])
const distintos = (a: Uint8Array, b: Uint8Array) => {
  let n = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++
  return n
}
/** Las partes de un OLE o de un zip, leídas por SheetJS: nombre → contenido. */
const partes = (b: Uint8Array): Map<string, Buffer> => {
  const c = XLSX.CFB.read(Buffer.from(b), { type: 'buffer' })
  const fuera = new Map<string, Buffer>()
  c.FileIndex.forEach((f, i) => {
    if (f.type === 2)
      fuera.set(c.FullPaths[i].replace(/^[^/]*\//, ''), Buffer.from(f.content as Uint8Array))
  })
  return fuera
}
const hoja = (b: Uint8Array) => {
  const wb = XLSX.read(Buffer.from(b), { type: 'buffer' })
  return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]])
}
const firma = (b: Buffer) => b.indexOf(Buffer.from('Sh33tJS', 'latin1'))

describe('un .xls, en su sitio', () => {
  it('vacía Author, LastAuthor y Company; la hoja y el flujo Workbook no cambian', () => {
    const antes = libro('xls')
    const r = limpio(limpiar(antes, 'x.xls'))
    expect(r.bytes.length).toBe(antes.length)
    expect(evaluar('x.xls', leerMetadatos(r.bytes, 'x.xls'))).toEqual([])
    const p = XLSX.read(Buffer.from(r.bytes), { type: 'buffer', bookProps: true }).Props ?? {}
    expect([p.Author, p.LastAuthor, p.Company].map((v) => v ?? '')).toEqual(['', '', ''])
    expect(hoja(r.bytes)).toBe(hoja(antes))
    expect(partes(r.bytes).get('Workbook')).toEqual(partes(antes).get('Workbook'))
  })

  it('un nombre en WRITEACCESS: cambian sus letras y nada más', () => {
    const antes = libro('xls', { Title: 't' })
    const i = firma(antes)
    antes.write('Ana Eje', i, 'latin1')
    const r = limpio(limpiar(antes, 'x.xls'))
    // «Ana Eje» tiene un espacio propio: pasan a espacio las otras seis.
    expect(distintos(antes, r.bytes)).toBe(6)
    expect(Buffer.from(r.bytes).toString('latin1', i, i + 7)).toBe('       ')
  })

  it('el resto de un nombre en el relleno: cambian sus letras, no el relleno', () => {
    const antes = libro('xls', { Title: 't' })
    antes.write('Marta', firma(antes) + 7 + 11, 'latin1')
    const r = limpio(limpiar(antes, 'x.xls'))
    expect(distintos(antes, r.bytes)).toBe(5)
  })

  it('lo que no lleva a nadie no se toca, y limpiar dos veces es limpiar una', () => {
    expect(limpiar(libro('xls', { Title: 't' }), 'x.xls')).toEqual({ estado: 'nada' })
    const r = limpio(limpiar(libro('xls'), 'x.xls'))
    expect(limpiar(r.bytes, 'x.xls')).toEqual({ estado: 'nada' })
  })

  it('el «Current User» de un .ppt no se toca a ciegas', () => {
    const r = limpiar(ole({ 'Current User': usuarioActualPpt('Marta Prueba') }), 'x.ppt')
    expect(r).toMatchObject({ estado: 'rechazado', motivo: expect.stringMatching(/a mano/) })
  })
})

describe('OOXML y ODF', () => {
  it('quita dc:creator, cp:lastModifiedBy y Company; las demás partes, byte a byte', () => {
    const antes = libro('xlsx')
    const r = limpio(limpiar(antes, 'x.xlsx'))
    expect(evaluar('x.xlsx', leerMetadatos(r.bytes, 'x.xlsx'))).toEqual([])
    const p = XLSX.read(Buffer.from(r.bytes), { type: 'buffer', bookProps: true }).Props ?? {}
    expect([p.Author, p.LastAuthor, p.Company]).toEqual([undefined, undefined, undefined])
    expect(hoja(r.bytes)).toBe(hoja(antes))
    const a = partes(antes)
    const d = partes(r.bytes)
    expect([...d.keys()].sort()).toEqual([...a.keys()].sort())
    for (const [nombre, contenido] of a) {
      if (nombre === 'docProps/core.xml' || nombre === 'docProps/app.xml') continue
      expect(d.get(nombre), nombre).toEqual(contenido)
    }
  })

  it('el autor de un comentario es parte del documento: se rechaza sin escribir nada', () => {
    const b = libro('xlsx', { Title: 't' }, { autor: 'Marta Prueba', texto: 'revisar' })
    expect(limpiar(b, 'x.xlsx')).toMatchObject({
      estado: 'rechazado',
      motivo: expect.stringMatching(/comentarios/),
    })
  })

  it('ODF: mimetype sigue el primero y sin comprimir, y meta:generator se queda', () => {
    const antes = zipGuardado([
      ['mimetype', MIMETYPE_ODS],
      ['meta.xml', metaOdf(PERSONA, OTRA)],
      ['content.xml', '<office:document-content/>'],
    ])
    const b = Buffer.from(limpio(limpiar(antes, 'x.ods')).bytes)
    expect(b.readUInt32LE(0)).toBe(0x04034b50)
    expect(b.readUInt16LE(8)).toBe(0)
    expect(b.toString('latin1', 30, 38)).toBe('mimetype')
    const meta = partes(b).get('meta.xml')!.toString('utf8')
    expect(meta).not.toMatch(/initial-creator|dc:creator/)
    expect(meta).toContain('<meta:generator>MicrosoftOffice/16.0</meta:generator>')
  })
})

describe('imágenes', () => {
  const EXIF = tiff(
    [ascii(0x013b, PERSONA)],
    [ascii(0xa431, '123456789012')],
    [
      ascii(0x0001, 'N'),
      coordenada(0x0002, 39, 30, 12),
      ascii(0x0003, 'W'),
      coordenada(0x0004, 0, 30, 5),
    ],
  )
  const XMP = xmp(
    'aux:SerialNumber="123456789012" xmpMM:PreservedFileName="IMG_0001.CR3"',
    `<dc:creator><rdf:Seq><rdf:li>${PERSONA}</rdf:li></rdf:Seq></dc:creator>`,
  )

  it('vacía serie, nombre de fichero y GPS; deja el crédito y ni un byte de la imagen', () => {
    const antes = jpeg({ exif: EXIF, xmp: XMP, iptc: iptc([[2, 80, PERSONA]]) })
    const r = limpio(limpiar(antes, 'public/data/photos/x.jpg'))
    expect(r.bytes.length).toBe(antes.length)
    const escaneo = antes.indexOf(ESCANEO)
    expect(Buffer.from(r.bytes).subarray(escaneo)).toEqual(antes.subarray(escaneo))
    const despues = campos(leerMetadatos(r.bytes, 'x.jpg'))
    expect(
      despues
        .filter((c) => c.clase === 'credito')
        .map((c) => [c.campo, c.valor])
        .sort(),
    ).toEqual([
      ['EXIF · Artist', PERSONA],
      ['IPTC · By-line (2:80)', PERSONA],
      ['XMP · dc:creator', PERSONA],
    ])
    expect(despues.filter((c) => c.clase === 'dispositivo' || c.clase === 'localizacion')).toEqual(
      [],
    )
  })

  it('una foto de queja no se arregla aquí: si trae algo, el fallo está en el bot', () => {
    const r = limpiar(jpeg({ exif: EXIF }), 'public/data/quejas-photos/q-abc.jpg')
    expect(r).toMatchObject({ estado: 'rechazado', motivo: expect.stringMatching(/bot/) })
  })

  it('un número de serie a ceros no dice nada: no hay nada que limpiar', () => {
    const b = jpeg({ exif: tiff([], [ascii(0xa435, '0000000000')]) })
    expect(limpiar(b, 'public/data/photos/x.jpg')).toEqual({ estado: 'nada' })
  })
})

describe('PDF', () => {
  it('se rechaza: cada revisión, los flujos comprimidos y el XMP, a mano', () => {
    const b = pdf(['2 0 obj << /Author (Ana Ejemplo) >> endobj'])
    expect(limpiar(b, 'x.pdf')).toMatchObject({
      estado: 'rechazado',
      motivo: expect.stringMatching(/a mano/),
    })
  })
})
