import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  AUTORIA_INSTITUCIONAL,
  enmascarar,
  esCandidato,
  evaluar,
  leerMetadatos,
  revisar,
  type Campo,
  type Lectura,
} from '../src/scraper/metadatos/index.ts'
import {
  EMPRESA,
  MIMETYPE_ODS,
  OTRA,
  PERSONA,
  ascii,
  coordenada,
  flujoDeObjetos,
  iptc,
  jpeg,
  libro,
  libroConPersonalizadas,
  metaOdf,
  objetoFlate,
  ole,
  pdf,
  png,
  textoPng,
  tiff,
  usuarioActualPpt,
  xmp,
  zipGuardado,
} from './metadatos-fabrica.ts'

/**
 * ¿Lleva un fichero el nombre de alguien en sus METADATOS?
 *
 * El 28-09-2026 una fixture real de Hacienda, `conprel_CV_2024.xls`, llevaba en
 * su `LastAuthor` el nombre de una persona del ministerio, y en el registro
 * WRITEACCESS de su libro —que `Props` de SheetJS no enseña— el de otra, con el
 * resto de un tercer nombre en el relleno. Pública desde abril. Ninguna de las
 * tres guardas de publicación lo podía ver: las tres leen TEXTO, y esto vive
 * dentro de la estructura binaria del fichero.
 *
 * Las pruebas separan LEER (qué campos hay, `leerMetadatos`) de JUZGAR (cuáles
 * se señalan, `evaluar`), porque la frontera entre los dos es la política: el
 * autor de una hoja se señala; el crédito de un fotógrafo, no, salvo en una foto
 * de queja, que no puede llevar nada.
 */

const leido = (l: Lectura) => {
  if (l.estado !== 'leido') throw new Error(`no se leyó: ${JSON.stringify(l)}`)
  return l
}
const pares = (campos: Campo[], clase?: Campo['clase']) =>
  campos.filter((c) => !clase || c.clase === clase).map((c) => [c.campo, c.valor])
const señalados = (ruta: string, b: Uint8Array) =>
  evaluar(ruta, leerMetadatos(b, ruta))
    .map((h) => h.campo)
    .sort()

describe('OLE: hojas .xls y demás ficheros compuestos', () => {
  it('lee Author y LastAuthor de SummaryInformation, Company de DocumentSummaryInformation y WRITEACCESS', () => {
    const l = leido(leerMetadatos(libro('xls'), 'x.xls'))
    expect(l.formato).toBe('ole')
    expect(pares(l.campos, 'autoria')).toEqual(
      expect.arrayContaining([
        ['SummaryInformation · Author', PERSONA],
        ['SummaryInformation · LastAuthor', OTRA],
        ['DocumentSummaryInformation · Company', EMPRESA],
        ['BIFF WRITEACCESS', 'Sh33tJS'],
      ]),
    )
  })

  it('señala a las dos personas y a la empresa, y no la firma de SheetJS en WRITEACCESS', () => {
    expect(señalados('x.xls', libro('xls'))).toEqual([
      'DocumentSummaryInformation · Company',
      'SummaryInformation · Author',
      'SummaryInformation · LastAuthor',
    ])
  })

  it('un nombre en WRITEACCESS, que Props de SheetJS no enseña', () => {
    const b = libro('xls', { Title: 'sin autoría' })
    const i = b.indexOf(Buffer.from('Sh33tJS', 'latin1'))
    b.write('Ana Eje', i, 'latin1')
    expect(pares(leido(leerMetadatos(b, 'x.xls')).campos, 'autoria')).toContainEqual([
      'BIFF WRITEACCESS',
      'Ana Eje',
    ])
    expect(señalados('x.xls', b)).toEqual(['BIFF WRITEACCESS'])
  })

  it('el resto de un nombre anterior en el relleno de WRITEACCESS también cuenta', () => {
    const b = libro('xls', { Title: 'sin autoría' })
    const i = b.indexOf(Buffer.from('Sh33tJS', 'latin1'))
    b.write('Marta', i + 7 + 11, 'latin1')
    expect(pares(leido(leerMetadatos(b, 'x.xls')).campos, 'autoria')).toContainEqual([
      'BIFF WRITEACCESS (resto del relleno)',
      'Marta',
    ])
  })

  it('las propiedades personalizadas con nombre de autoría (_AuthorEmail), guardadas en UTF-16', () => {
    const conCorreo = libroConPersonalizadas('xls', {
      _AuthorEmail: 'ana@ejemplo.test',
      Proyecto: 'Presupuesto',
    })
    const campos = leido(leerMetadatos(conCorreo, 'x.xls')).campos
    expect(pares(campos, 'autoria')).toContainEqual([
      'propiedad personalizada «_AuthorEmail»',
      'ana@ejemplo.test',
    ])
    expect(pares(campos).map(([c]) => c)).not.toContain('propiedad personalizada «Proyecto»')
  })

  it('el usuario que guardó un .ppt, en su flujo «Current User»', () => {
    const b = ole({ 'Current User': usuarioActualPpt('Marta Prueba') })
    expect(pares(leido(leerMetadatos(b, 'x.ppt')).campos, 'autoria')).toEqual([
      ['Current User (PowerPoint)', 'Marta Prueba'],
    ])
  })

  it('un fichero compuesto truncado es ILEGIBLE, no limpio', () => {
    const l = leerMetadatos(libro('xls').subarray(0, 700), 'x.xls')
    expect(l.estado).toBe('ilegible')
  })
})

describe('OOXML y ODF', () => {
  it('lee dc:creator y cp:lastModifiedBy de core.xml, y Company de app.xml', () => {
    const l = leido(leerMetadatos(libro('xlsx'), 'x.xlsx'))
    expect(l.formato).toBe('ooxml')
    expect(pares(l.campos, 'autoria')).toEqual(
      expect.arrayContaining([
        ['docProps/core.xml · dc:creator', PERSONA],
        ['docProps/core.xml · cp:lastModifiedBy', OTRA],
        ['docProps/app.xml · Company', EMPRESA],
      ]),
    )
  })

  it('el autor de un comentario', () => {
    const b = libro('xlsx', { Title: 't' }, { autor: 'Marta Prueba', texto: 'revisar' })
    expect(pares(leido(leerMetadatos(b, 'x.xlsx')).campos, 'autoria')).toContainEqual([
      'xl/comments1.xml · autor de comentario',
      'Marta Prueba',
    ])
  })

  it('una propiedad personalizada de autoría en docProps/custom.xml', () => {
    const b = libroConPersonalizadas('xlsx', {
      _AuthorEmail: 'ana@ejemplo.test',
      Proyecto: 'Presupuesto',
    })
    const campos = leido(leerMetadatos(b, 'x.xlsx')).campos
    expect(pares(campos, 'autoria')).toEqual([
      ['docProps/custom.xml · _AuthorEmail', 'ana@ejemplo.test'],
    ])
  })

  it('el formato sale de los BYTES y no del nombre: un xlsx llamado .xls', () => {
    expect(leido(leerMetadatos(libro('xlsx'), 'descarga.xls')).formato).toBe('ooxml')
  })

  it('el autor de un cambio controlado en un .docx', () => {
    const b = zipGuardado([
      ['[Content_Types].xml', '<Types/>'],
      [
        'word/document.xml',
        '<w:document><w:body><w:ins w:id="1" w:author="Marta Prueba" w:date="2026-01-01T00:00:00Z"/></w:body></w:document>',
      ],
    ])
    expect(pares(leido(leerMetadatos(b, 'x.docx')).campos, 'autoria')).toEqual([
      ['word/document.xml · w:author', 'Marta Prueba'],
    ])
  })

  it('ODF: meta:initial-creator y dc:creator de meta.xml, y el autor de una anotación', () => {
    const b = zipGuardado([
      ['mimetype', MIMETYPE_ODS],
      ['meta.xml', metaOdf(PERSONA, OTRA)],
      [
        'content.xml',
        '<office:document-content><office:annotation><dc:creator>Marta Prueba</dc:creator></office:annotation></office:document-content>',
      ],
    ])
    const l = leido(leerMetadatos(b, 'x.ods'))
    expect(l.formato).toBe('odf')
    expect(pares(l.campos, 'autoria').sort()).toEqual([
      ['content.xml · dc:creator', 'Marta Prueba'],
      ['meta.xml · dc:creator', OTRA],
      ['meta.xml · meta:initial-creator', PERSONA],
    ])
  })

  it('un zip truncado es ILEGIBLE', () => {
    expect(leerMetadatos(libro('xlsx').subarray(0, 400), 'x.xlsx').estado).toBe('ilegible')
  })
})

describe('PDF', () => {
  const autores = (b: Uint8Array) =>
    pares(leido(leerMetadatos(b, 'x.pdf')).campos, 'autoria')
      .filter(([c]) => c === '/Author')
      .map(([, v]) => v)
      .sort()

  it('el /Author del diccionario Info, y no /Producer', () => {
    const b = pdf([
      '1 0 obj << /Type /Catalog >> endobj',
      '2 0 obj << /Author (Ana Ejemplo) /Producer (LibreOffice 7.6) >> endobj',
    ])
    expect(pares(leido(leerMetadatos(b, 'x.pdf')).campos, 'autoria')).toEqual([
      ['/Author', PERSONA],
    ])
  })

  it('una revisión incremental no borra el /Author de la anterior: salen los dos', () => {
    const b = pdf([
      '2 0 obj << /Author (Ana Ejemplo) >> endobj',
      'xref\ntrailer << /Info 2 0 R >>\n%%EOF',
      '2 0 obj << /Author (Luis Muestra) >> endobj',
    ])
    expect(autores(b)).toEqual([PERSONA, OTRA])
  })

  it('un /Author indirecto (7 0 R) se resuelve', () => {
    const b = pdf(['2 0 obj << /Author 7 0 R >> endobj', '7 0 obj (Ana Ejemplo) endobj'])
    expect(autores(b)).toEqual([PERSONA])
  })

  it('un Info dentro de un flujo de objetos comprimido', () => {
    const b = Buffer.concat([
      Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n', 'latin1'),
      flujoDeObjetos(5, [[2, '<< /Author (Ana Ejemplo) >>']]),
      Buffer.from('trailer << /Root 1 0 R /Info 2 0 R >>\n%%EOF\n', 'latin1'),
    ])
    expect(autores(b)).toEqual([PERSONA])
  })

  it('dc:creator del XMP, sin comprimir y comprimido', () => {
    const dc = '<dc:creator><rdf:Seq><rdf:li>Ana Ejemplo</rdf:li></rdf:Seq></dc:creator>'
    const suelto = pdf([
      `3 0 obj << /Type /Metadata /Subtype /XML >>\nstream\n${xmp('', dc)}\nendstream\nendobj`,
    ])
    const comprimido = Buffer.concat([
      Buffer.from('%PDF-1.7\n', 'latin1'),
      objetoFlate(3, '/Type /Metadata /Subtype /XML', xmp('', dc)),
      Buffer.from('%%EOF\n', 'latin1'),
    ])
    for (const b of [suelto, comprimido]) {
      expect(pares(leido(leerMetadatos(b, 'x.pdf')).campos, 'autoria')).toEqual([
        ['XMP · dc:creator', PERSONA],
      ])
    }
  })

  it('decodifica las cadenas: escapes, octal en PDFDocEncoding y UTF-16BE en hexadecimal', () => {
    expect(autores(pdf(['2 0 obj << /Author (Ana \\(Ejemplo\\)) >> endobj']))).toEqual([
      'Ana (Ejemplo)',
    ])
    expect(autores(pdf(['2 0 obj << /Author (Mar\\355a) >> endobj']))).toEqual(['María'])
    expect(autores(pdf(['2 0 obj << /Author <FEFF0041006E0061> >> endobj']))).toEqual(['Ana'])
  })

  it('el autor de una anotación (/T), y no el nombre de un campo de formulario', () => {
    const b = pdf([
      '4 0 obj << /Type /Annot /Subtype /Text /T (Marta Prueba) /Contents (ok) >> endobj',
      '6 0 obj << /Type /Annot /Subtype /Widget /T (campo1) >> endobj',
    ])
    expect(pares(leido(leerMetadatos(b, 'x.pdf')).campos, 'autoria')).toEqual([
      ['anotación · /T', 'Marta Prueba'],
    ])
  })

  it('un PDF cifrado es ILEGIBLE: sus cadenas no se pueden leer', () => {
    const b = pdf(['2 0 obj << /Author (xx) >> endobj'], '<< /Root 1 0 R /Encrypt 9 0 R >>')
    const l = leerMetadatos(b, 'x.pdf')
    expect(l.estado).toBe('ilegible')
    expect(l.estado === 'ilegible' && l.motivo).toMatch(/cifrado/)
  })
})

describe('imágenes', () => {
  const EXIF = tiff(
    [ascii(0x010f, 'Canon'), ascii(0x013b, PERSONA), ascii(0x8298, 'www.ejemplo.test')],
    [ascii(0xa431, '123456789012'), ascii(0xa435, '0000000000')],
    [
      ascii(0x0001, 'N'),
      coordenada(0x0002, 39, 30, 12),
      ascii(0x0003, 'W'),
      coordenada(0x0004, 0, 30, 5),
    ],
  )
  const XMP = xmp(
    'aux:SerialNumber="123456789012" exif:GPSLatitude="39,30.2N"',
    `<dc:creator><rdf:Seq><rdf:li>${PERSONA}</rdf:li></rdf:Seq></dc:creator>`,
  )
  const completa = () =>
    jpeg({ exif: EXIF, xmp: XMP, iptc: iptc([[2, 80, PERSONA]]), comentario: 'hecho con prueba' })

  it('clasifica cada campo: crédito, dispositivo, localización o mera presencia', () => {
    const l = leido(leerMetadatos(completa(), 'x.jpg'))
    expect(l.formato).toBe('jpeg')
    expect(pares(l.campos, 'credito').sort()).toEqual([
      ['EXIF · Artist', PERSONA],
      ['EXIF · Copyright', 'www.ejemplo.test'],
      ['IPTC · By-line (2:80)', PERSONA],
      ['XMP · dc:creator', PERSONA],
    ])
    expect(pares(l.campos, 'dispositivo').sort()).toEqual([
      ['EXIF · BodySerialNumber', '123456789012'],
      ['EXIF · LensSerialNumber', '0000000000'],
      ['XMP · aux:SerialNumber', '123456789012'],
    ])
    expect(
      pares(l.campos, 'localizacion')
        .map(([c]) => c)
        .sort(),
    ).toEqual(['EXIF · GPS', 'XMP · exif:GPSLatitude'])
    expect(pares(l.campos, 'presencia')).toContainEqual(['JPEG · comentario', 'hecho con prueba'])
  })

  it('fuera de las quejas señala número de serie y GPS, no el crédito ni un número de serie a ceros', () => {
    expect(señalados('public/data/photos/x.jpg', completa())).toEqual([
      'EXIF · BodySerialNumber',
      'EXIF · GPS',
      'XMP · aux:SerialNumber',
      'XMP · exif:GPSLatitude',
    ])
  })

  it('una foto de queja no puede llevar NADA: se señala todo, crédito incluido', () => {
    const todos = leido(leerMetadatos(completa(), 'q.jpg'))
      .campos.map((c) => c.campo)
      .sort()
    expect(señalados('public/data/quejas-photos/q-abc.jpg', completa())).toEqual(todos)
  })

  it('una foto sin metadatos no da nada, ni siquiera en quejas', () => {
    expect(leido(leerMetadatos(jpeg({}), 'x.jpg')).campos).toEqual([])
    expect(señalados('public/data/quejas-photos/q-abc.jpg', jpeg({}))).toEqual([])
  })

  it('una MakerNote es del fabricante y puede llevar números de serie: dispositivo', () => {
    const b = jpeg({
      exif: tiff([], [{ tag: 0x927c, tipo: 7, valor: Buffer.from('Canon serial 99887766') }]),
    })
    expect(pares(leido(leerMetadatos(b, 'x.jpg')).campos, 'dispositivo').map(([c]) => c)).toEqual([
      'EXIF · MakerNote',
    ])
  })

  it('PNG: el Author de un trozo tEXt y el EXIF de un trozo eXIf', () => {
    const b = png([
      ['tEXt', textoPng('Author', PERSONA)],
      ['eXIf', tiff([], [ascii(0xa431, '123456789012')])],
    ])
    const l = leido(leerMetadatos(b, 'x.png'))
    expect(pares(l.campos, 'credito')).toEqual([['PNG tEXt · Author', PERSONA]])
    expect(pares(l.campos, 'dispositivo')).toEqual([['EXIF · BodySerialNumber', '123456789012']])
  })

  it('TIFF suelto', () => {
    const l = leido(leerMetadatos(tiff([ascii(0x013b, PERSONA)]), 'x.tif'))
    expect(l.formato).toBe('tiff')
    expect(pares(l.campos, 'credito')).toEqual([['EXIF · Artist', PERSONA]])
  })

  it('SVG: dc:creator, y la ruta del disco de quien lo exportó', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" ' +
      'xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ' +
      'sodipodi:docname="/Users/ana/Escritorio/og.svg" inkscape:export-filename="og.png">' +
      `<metadata><rdf:RDF><cc:Work><dc:creator><cc:Agent><dc:title>${PERSONA}</dc:title></cc:Agent></dc:creator></cc:Work></rdf:RDF></metadata></svg>`
    const l = leido(leerMetadatos(Buffer.from(svg), 'og.svg'))
    expect(pares(l.campos, 'credito')).toEqual([['SVG · dc:creator', PERSONA]])
    expect(pares(l.campos, 'dispositivo')).toEqual([
      ['SVG · sodipodi:docname', '/Users/ana/Escritorio/og.svg'],
    ])
  })
})

describe('política', () => {
  it('un autor institucional de la lista no se señala; cada entrada dice por qué está', () => {
    const b = libro('xls', { Author: 'S. G. de Estudios Financieros de las Entidades Locales' })
    expect(señalados('x.xls', b)).toEqual([])
    for (const e of AUTORIA_INSTITUCIONAL) expect(e.razon.length).toBeGreaterThan(20)
  })

  it('un fichero revisado a mano, por su sha256, pasa con su razón; cambiado un byte, vuelve a mirarse', () => {
    const b = libro('xls')
    const sha256 = createHash('sha256').update(b).digest('hex')
    const lista = [{ sha256, ruta: 'x.xls', razon: 'revisado a mano en la prueba' }]
    expect(revisar('x.xls', b, lista)).toMatchObject({
      revisado: 'revisado a mano en la prueba',
      hallazgos: [],
    })
    const otro = Buffer.from(b)
    otro[otro.length - 1] ^= 1
    expect(revisar('x.xls', otro, lista).hallazgos.length).toBeGreaterThan(0)
  })

  it('lo que no es un formato que se mire queda fuera', () => {
    expect(leerMetadatos(Buffer.from('{"a":1}'), 'x.json').estado).toBe('ajeno')
    expect(esCandidato('tests/fixtures/X.XLS')).toBe(true)
    expect(esCandidato('public/data/photos/a.jpeg')).toBe(true)
    expect(esCandidato('public/data/promises.json')).toBe(false)
  })
})

describe('enmascarar: la salida no republica lo que encuentra', () => {
  it('cambia cada letra y cada cifra por un punto y dice cuántos caracteres había', () => {
    expect(enmascarar(PERSONA)).toBe('«••• •••••••» (11 car.)')
    expect(enmascarar('B.O.')).toBe('«•.•.» (4 car.)')
    expect(enmascarar('203027002064')).toBe('«••••••••••••» (12 car.)')
    expect(enmascarar('María Núñez')).toBe('«••••• •••••» (11 car.)')
  })
})

describe('los ficheros reales del repositorio', () => {
  const rastreados = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((r) => r && esCandidato(r))

  it('se leen todos: ninguno se da por limpio sin haberlo abierto', () => {
    expect(rastreados.length).toBeGreaterThan(0)
    const noLeidos = rastreados.filter((r) => leerMetadatos(readFileSync(r), r).estado !== 'leido')
    expect(noLeidos).toEqual([])
  })

  it('el Author institucional de CONPREL se lee entero, sin nadie al lado', () => {
    const ruta = 'tests/fixtures/conprel_CV_2024.xls'
    const l = leido(leerMetadatos(readFileSync(ruta), ruta))
    expect(pares(l.campos, 'autoria')).toContainEqual([
      'SummaryInformation · Author',
      'S. G. de Estudios Financieros de las Entidades Locales',
    ])
    expect(evaluar(ruta, l)).toEqual([])
  })
})
