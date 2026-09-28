/**
 * ¿Lleva un fichero el nombre de alguien en sus METADATOS?
 *
 * El 28-09-2026 una fixture real de Hacienda, `conprel_CV_2024.xls`, llevaba en
 * su `LastAuthor` el nombre de una persona del ministerio y, en el registro
 * WRITEACCESS de su libro —que `Props` de SheetJS no enseña—, el de otra, con el
 * resto de un tercer nombre en el relleno. Estaba publicada desde abril. Dos
 * días antes, la tabla del Consell de la PR #142 había traído otros dos nombres
 * en su `meta.xml`, que se quitaron a mano. Ninguna de las tres guardas de
 * publicación podía verlo: `check:secrets`, `check:privado` y `check:editorial`
 * leen TEXTO, y esto vive dentro de la estructura binaria del fichero.
 *
 * Este módulo LEE (`leerMetadatos`: qué campos hay y de qué clase) y JUZGA
 * (`evaluar`: cuáles se señalan), por separado, porque la frontera entre los dos
 * es la política:
 *
 *   · La autoría de un DOCUMENTO se señala siempre, salvo que sea un órgano o
 *     un programa de `AUTORIA_INSTITUCIONAL`. La rellena Office con la cuenta de
 *     quien guarda, sin que nadie lo decida.
 *   · El crédito de un fotógrafo NO se señala: lo puso él, a propósito, y es
 *     información de gestión de derechos (`imagen.ts` lo explica).
 *   · Números de serie, dueños de cámara, rutas de un disco y coordenadas se
 *     señalan en cualquier imagen.
 *   · Una foto de QUEJA no puede llevar nada de nada.
 *
 * Tres resultados por fichero, nunca dos: leído, ILEGIBLE o ajeno. Un fichero
 * con extensión de documento que no se deja leer no es un fichero limpio: es
 * uno que nadie ha mirado, y sale como tal.
 *
 * `limpiar` vacía en su sitio lo señalado, sin volver a guardar el fichero, y
 * se niega —con el motivo— a lo que no sabe hacer sin romperlo.
 */
import { createHash } from 'node:crypto'
import { TextDecoder } from 'node:util'
import {
  FMTID_DOCUMENTO,
  FMTID_RESUMEN,
  FMTID_USUARIO,
  leerCfb,
  leerPropiedades,
  leerUsuarioActual,
  leerWriteAccess,
} from './cfb.ts'
import { leerJpeg, leerPng, leerSvg, leerTiff, leerWebp, RUTA_PERSONAL } from './imagen.ts'
import { leerPdf } from './pdf.ts'
import { sinRelleno, type Campo, type Clase } from './tipos.ts'
import { contenidoZip, leerZip, reescribirZip, type EntradaZip } from './zip.ts'

export type { Campo, Clase, Tramo } from './tipos.ts'

export type Formato =
  'ole' | 'ooxml' | 'odf' | 'zip' | 'pdf' | 'jpeg' | 'png' | 'tiff' | 'webp' | 'svg'

export type Lectura =
  | { estado: 'leido'; formato: Formato; campos: Campo[] }
  | { estado: 'ilegible'; formato: Formato | null; motivo: string }
  | { estado: 'ajeno' }

export interface Hallazgo {
  ruta: string
  campo: string
  clase: Clase
  valor: string
}

/**
 * Autores que NO son personas: un órgano o un programa. Cada entrada dice por
 * qué, y un nombre de persona nunca entra aquí — se vacía con
 * `npm run fixture:sin-autoria`.
 */
export const AUTORIA_INSTITUCIONAL: ReadonlyArray<{ valor: string; razon: string }> = [
  {
    valor: 'S. G. de Estudios Financieros de las Entidades Locales',
    razon:
      'la Subdirección General de Hacienda que publica CONPREL; es el Author de conprel_CV_2024.xls, y es un órgano, no una persona',
  },
  {
    valor: 'Sh33tJS',
    razon:
      'lo que SheetJS escribe en WRITEACCESS al guardar un .xls: la librería con que se recortan fixtures, no una persona',
  },
  {
    valor: 'Microsoft Office User',
    razon: 'el nombre que pone Office cuando no hay una cuenta iniciada: no es nadie',
  },
  {
    valor: 'Usuario de Microsoft Office',
    razon: 'el mismo nombre por defecto de Office, en español: no es nadie',
  },
]

/**
 * Ficheros revisados a mano, por su sha256: pasan aunque traigan algo que la
 * guarda señala o que no sabe leer (un PDF cifrado, por ejemplo). Atado al
 * contenido: cambia un byte y se vuelve a mirar. Vacío mientras nada lo pida.
 */
export const REVISADOS: ReadonlyArray<{ sha256: string; ruta: string; razon: string }> = []

const EXTENSIONES = new Set(
  (
    'xls xlsx xlsm xlsb xlt xltx xltm doc docx docm dot dotx dotm ppt pptx pptm pps ppsx ' +
    'pot potx ods odt odp odg ots ott otp pdf jpg jpeg jpe png tif tiff webp svg'
  ).split(' '),
)

/** ¿Es de un formato que se mira? Por la extensión: el formato real sale de los bytes. */
export function esCandidato(ruta: string): boolean {
  const m = /\.([a-z0-9]+)$/i.exec(ruta)
  return !!m && EXTENSIONES.has(m[1].toLowerCase())
}

export const esFotoDeQueja = (ruta: string) => /(^|\/)public\/data\/quejas-photos\//.test(ruta)

function formatoDe(b: Uint8Array, ruta: string): Formato | null {
  const es = (firma: number[]) => firma.every((x, i) => b[i] === x)
  if (es([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole'
  if (es([0x50, 0x4b, 0x03, 0x04]) || es([0x50, 0x4b, 0x05, 0x06])) return 'zip'
  if (es([0xff, 0xd8, 0xff])) return 'jpeg'
  if (es([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (es([0x49, 0x49, 0x2a, 0x00]) || es([0x4d, 0x4d, 0x00, 0x2a])) return 'tiff'
  if (
    es([0x52, 0x49, 0x46, 0x46]) &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return 'webp'
  }
  const cabeza = Buffer.from(b.buffer, b.byteOffset, Math.min(1024, b.length)).toString('latin1')
  if (cabeza.includes('%PDF-')) return 'pdf'
  if (/\.svg$/i.test(ruta)) return 'svg'
  return null
}

// ── OLE ──────────────────────────────────────────────────────────────────────

/** Nombres de propiedad personalizada que dicen quién: _AuthorEmail, Propietario… */
const AUTORIA_PERSONALIZADA =
  /author|autor|mail|correo|owner|propietari|creator|creador|editor|reviewer|revisor|manager|responsable/i

function camposOle(b: Uint8Array): Campo[] {
  const cfb = leerCfb(b)
  const campos: Campo[] = []
  for (const e of cfb.entradas) {
    if (e.tipo !== 2) continue
    const prefijo = e.almacen ? `${e.almacen}/` : ''
    if (
      e.nombre === '\u0005SummaryInformation' ||
      e.nombre === '\u0005DocumentSummaryInformation'
    ) {
      for (const s of leerPropiedades(cfb.contenido(e))) {
        for (const p of s.cadenas) {
          const valor = sinRelleno(p.valor)
          if (!valor) continue
          let clase: Clase | null = null
          let campo = ''
          if (s.fmtid === FMTID_RESUMEN && (p.pid === 4 || p.pid === 8)) clase = 'autoria'
          if (s.fmtid === FMTID_RESUMEN && p.pid === 7 && RUTA_PERSONAL.test(valor))
            clase = 'dispositivo'
          if (s.fmtid === FMTID_DOCUMENTO && (p.pid === 14 || p.pid === 15)) clase = 'autoria'
          if (clase) campo = `${prefijo}${e.nombre.slice(1)} · ${p.nombre}`
          if (s.fmtid === FMTID_USUARIO && AUTORIA_PERSONALIZADA.test(p.nombre)) {
            clase = 'autoria'
            campo = `${prefijo}propiedad personalizada «${p.nombre}»`
          }
          if (!clase) continue
          campos.push({
            campo,
            valor,
            clase,
            tramos: cfb.tramos(e, p.desde, p.hasta, new Uint8Array(p.hasta - p.desde)),
          })
        }
      }
    }
    if (e.nombre === 'Workbook' || e.nombre === 'Book') {
      const w = leerWriteAccess(cfb.contenido(e))
      if (!w) continue
      const blancos = (n: number) =>
        Uint8Array.from({ length: n }, (_, i) => (w.ancho === 2 && i % 2 ? 0x00 : 0x20))
      const usuario = sinRelleno(w.usuario)
      if (usuario) {
        campos.push({
          campo: `${prefijo}BIFF WRITEACCESS`,
          valor: usuario,
          clase: 'autoria',
          tramos: cfb.tramos(e, w.desde, w.finUsuario, blancos(w.finUsuario - w.desde)),
        })
      }
      const resto = sinRelleno(w.resto)
      if (resto) {
        campos.push({
          campo: `${prefijo}BIFF WRITEACCESS (resto del relleno)`,
          valor: resto,
          clase: 'autoria',
          tramos: cfb.tramos(e, w.finUsuario, w.hasta, blancos(w.hasta - w.finUsuario)),
        })
      }
    }
    if (e.nombre === 'Current User') {
      const u = sinRelleno(leerUsuarioActual(cfb.contenido(e)) ?? '')
      if (u)
        campos.push({ campo: `${prefijo}Current User (PowerPoint)`, valor: u, clase: 'autoria' })
    }
  }
  return campos
}

// ── OOXML y ODF ──────────────────────────────────────────────────────────────

const entidades = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

const textoDe = (xml: string) =>
  sinRelleno(entidades(xml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' '))

function tipoZip(b: Uint8Array, entradas: EntradaZip[]): 'ooxml' | 'odf' | null {
  if (entradas.some((e) => e.nombre === '[Content_Types].xml')) return 'ooxml'
  const m = entradas.find((e) => e.nombre === 'mimetype')
  if (
    m &&
    Buffer.from(contenidoZip(b, m))
      .toString('latin1')
      .startsWith('application/vnd.oasis.opendocument')
  ) {
    return 'odf'
  }
  return null
}

function camposZip(b: Uint8Array, entradas: EntradaZip[], tipo: 'ooxml' | 'odf'): Campo[] {
  const campos: Campo[] = []
  const vistos = new Set<string>()
  const añadir = (parte: string, elemento: string, campo: string, valor: string) => {
    const v = sinRelleno(valor)
    if (!v || vistos.has(`${campo}\u0000${v}`)) return
    vistos.add(`${campo}\u0000${v}`)
    campos.push({ campo, valor: v, clase: 'autoria', parte, elemento })
  }
  const utf8 = new TextDecoder('utf-8')
  for (const e of entradas) {
    const n = e.nombre
    const interesa =
      tipo === 'ooxml'
        ? /^docProps\/(core|app|custom)\.xml$|^xl\/comments\d*\.xml$|^xl\/persons\/person\.xml$|^word\/.+\.xml$|^ppt\/commentAuthors\.xml$/.test(
            n,
          )
        : /^(meta|content|styles)\.xml$/.test(n)
    if (!interesa) continue
    const xml = utf8.decode(contenidoZip(b, e))
    const elementos = (nombres: string[]) => {
      for (const el of nombres) {
        for (const m of xml.matchAll(new RegExp(`<${el}(?:\\s[^>]*)?>([\\s\\S]*?)</${el}>`, 'g'))) {
          añadir(n, el, `${n} · ${el}`, textoDe(m[1]))
        }
      }
    }
    const atributos = (nombre: string, campo: string) => {
      for (const m of xml.matchAll(new RegExp(`\\s${nombre}="([^"]*)"`, 'g'))) {
        añadir(n, nombre, `${n} · ${campo}`, entidades(m[1]))
      }
    }
    if (tipo === 'ooxml') {
      if (n === 'docProps/core.xml') elementos(['dc:creator', 'cp:lastModifiedBy'])
      if (n === 'docProps/app.xml') elementos(['Manager', 'Company'])
      if (n === 'docProps/custom.xml') {
        for (const m of xml.matchAll(/<property\b([^>]*)>([\s\S]*?)<\/property>/g)) {
          const nombre = entidades(/\sname="([^"]*)"/.exec(m[1])?.[1] ?? '')
          if (AUTORIA_PERSONALIZADA.test(nombre)) {
            añadir(n, `property:${nombre}`, `${n} · ${nombre}`, textoDe(m[2]))
          }
        }
      }
      if (/^xl\/comments\d*\.xml$/.test(n)) {
        for (const m of xml.matchAll(/<author>([\s\S]*?)<\/author>/g)) {
          añadir(n, 'author', `${n} · autor de comentario`, textoDe(m[1]))
        }
      }
      if (n === 'xl/persons/person.xml') {
        atributos('displayName', 'displayName')
        atributos('userId', 'userId')
      }
      if (n.startsWith('word/')) {
        atributos('w:author', 'w:author')
        atributos('w15:author', 'w15:author')
        atributos('w:initials', 'w:initials')
      }
      if (n === 'ppt/commentAuthors.xml') atributos('name', 'name')
    } else {
      if (n === 'meta.xml') {
        elementos(['meta:initial-creator', 'dc:creator'])
        for (const m of xml.matchAll(
          /<meta:user-defined\b([^>]*)>([\s\S]*?)<\/meta:user-defined>/g,
        )) {
          const nombre = entidades(/\smeta:name="([^"]*)"/.exec(m[1])?.[1] ?? '')
          if (AUTORIA_PERSONALIZADA.test(nombre)) {
            añadir(n, `meta:user-defined:${nombre}`, `${n} · ${nombre}`, textoDe(m[2]))
          }
        }
      } else elementos(['dc:creator'])
    }
  }
  return campos
}

// ── Lectura ──────────────────────────────────────────────────────────────────

export function leerMetadatos(b: Uint8Array, ruta: string): Lectura {
  const formato = formatoDe(b, ruta)
  if (!formato) {
    return esCandidato(ruta)
      ? {
          estado: 'ilegible',
          formato: null,
          motivo:
            'la extensión dice documento o imagen, y los bytes no son de ningún formato que se mire',
        }
      : { estado: 'ajeno' }
  }
  try {
    switch (formato) {
      case 'ole':
        return { estado: 'leido', formato, campos: camposOle(b) }
      case 'zip': {
        const entradas = leerZip(b)
        const tipo = tipoZip(b, entradas)
        if (!tipo) {
          return esCandidato(ruta)
            ? { estado: 'ilegible', formato, motivo: 'un zip que no es ni OOXML ni ODF' }
            : { estado: 'ajeno' }
        }
        return { estado: 'leido', formato: tipo, campos: camposZip(b, entradas, tipo) }
      }
      case 'pdf': {
        const r = leerPdf(b)
        if (r.cifrado) {
          return {
            estado: 'ilegible',
            formato,
            motivo: 'PDF cifrado: sus cadenas no se leen sin descifrarlo',
          }
        }
        return {
          estado: 'leido',
          formato,
          campos: r.campos.map((c) => ({ ...c, clase: 'autoria' })),
        }
      }
      case 'jpeg':
        return { estado: 'leido', formato, campos: leerJpeg(b) }
      case 'png':
        return { estado: 'leido', formato, campos: leerPng(b) }
      case 'tiff':
        return { estado: 'leido', formato, campos: leerTiff(b, 0, b.length, 'EXIF') }
      case 'webp':
        return { estado: 'leido', formato, campos: leerWebp(b) }
      case 'svg':
        return { estado: 'leido', formato, campos: leerSvg(b) }
      default:
        return { estado: 'ajeno' }
    }
  } catch (e) {
    return { estado: 'ilegible', formato, motivo: (e as Error).message }
  }
}

// ── Política ─────────────────────────────────────────────────────────────────

const normal = (s: string) => sinRelleno(s).normalize('NFC')
const INSTITUCIONAL = new Set(AUTORIA_INSTITUCIONAL.map((e) => normal(e.valor)))
/** Un número de serie a ceros es el «desconocido» del fabricante: no dice nada. */
const sinInformacion = (v: string) => /^[0\s]*$/.test(v)

export function evaluar(ruta: string, l: Lectura): Hallazgo[] {
  if (l.estado !== 'leido') return []
  const queja = esFotoDeQueja(ruta)
  return l.campos
    .filter((c) => {
      if (queja) return true
      const v = normal(c.valor)
      if (!v) return false
      if (c.clase === 'autoria') return !INSTITUCIONAL.has(v)
      if (c.clase === 'dispositivo') return !sinInformacion(v)
      return c.clase === 'localizacion'
    })
    .map((c) => ({ ruta, campo: c.campo, clase: c.clase, valor: c.valor }))
}

export interface Revision {
  lectura: Lectura
  hallazgos: Hallazgo[]
  /** La razón, si el fichero está en REVISADOS. */
  revisado?: string
}

export function revisar(ruta: string, b: Uint8Array, revisados = REVISADOS): Revision {
  const lectura = leerMetadatos(b, ruta)
  const sha256 = createHash('sha256').update(b).digest('hex')
  const r = revisados.find((x) => x.sha256 === sha256)
  if (r) return { lectura, hallazgos: [], revisado: r.razon }
  return { lectura, hallazgos: evaluar(ruta, lectura) }
}

/**
 * Lo que la salida enseña de un valor: su forma, no su contenido. Los registros
 * de la CI de un repositorio público son públicos, y una guarda que imprime el
 * nombre que encuentra lo vuelve a publicar.
 */
export function enmascarar(valor: string): string {
  const s = valor.normalize('NFC').trim()
  return `«${s.replace(/[\p{L}\p{N}]/gu, '•')}» (${[...s].length} car.)`
}

// ── Limpieza en su sitio ─────────────────────────────────────────────────────

export type Limpieza =
  | { estado: 'limpio'; bytes: Uint8Array; cambios: string[] }
  | { estado: 'nada' }
  | { estado: 'rechazado'; motivo: string }

/** Las partes de un zip que son SÓLO metadatos: quitar un elemento no toca el documento. */
const PARTES_DE_METADATOS = new Set([
  'docProps/core.xml',
  'docProps/app.xml',
  'docProps/custom.xml',
  'meta.xml',
])

function quitar(xml: string, elemento: string): string {
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (elemento.startsWith('property:')) {
    const nombre = escapar(elemento.slice('property:'.length))
    return xml.replace(
      new RegExp(`<property\\b[^>]*\\sname="${nombre}"[^>]*>[\\s\\S]*?</property>`, 'g'),
      '',
    )
  }
  if (elemento.startsWith('meta:user-defined:')) {
    const nombre = escapar(elemento.slice('meta:user-defined:'.length))
    return xml.replace(
      new RegExp(
        `<meta:user-defined\\b[^>]*\\smeta:name="${nombre}"[^>]*>[\\s\\S]*?</meta:user-defined>`,
        'g',
      ),
      '',
    )
  }
  const el = escapar(elemento)
  return xml.replace(new RegExp(`<${el}(?:\\s[^>]*)?(?:/>|>[\\s\\S]*?</${el}>)`, 'g'), '')
}

export function limpiar(b: Uint8Array, ruta: string): Limpieza {
  const rechazo = (motivo: string): Limpieza => ({ estado: 'rechazado', motivo })
  const l = leerMetadatos(b, ruta)
  if (l.estado === 'ajeno') return { estado: 'nada' }
  if (l.estado === 'ilegible') return rechazo(`ilegible: ${l.motivo}`)
  const hallazgos = evaluar(ruta, l)
  if (hallazgos.length === 0) return { estado: 'nada' }
  if (esFotoDeQueja(ruta)) {
    return rechazo(
      'las fotos de quejas las anonimiza el bot antes de publicarlas; si una llega con metadatos, el fallo está allí y no en esta copia',
    )
  }
  if (l.formato === 'pdf') {
    return rechazo(
      'en un PDF hay que vaciar cada revisión, los flujos comprimidos y el XMP: no se hace a ciegas, hazlo a mano y compruébalo con check:metadatos',
    )
  }
  const señalados = new Set(hallazgos.map((h) => `${h.campo}\u0000${h.valor}`))
  const aTapar = l.campos.filter((c) => señalados.has(`${c.campo}\u0000${c.valor}`))

  let fuera: Uint8Array
  if (l.formato === 'ooxml' || l.formato === 'odf') {
    const contenido = aTapar.filter((c) => !PARTES_DE_METADATOS.has(c.parte ?? ''))
    if (contenido.length) {
      return rechazo(
        `${contenido.map((c) => c.campo).join(', ')}: comentarios, cambios controlados y personas son parte del documento; hazlo a mano`,
      )
    }
    const entradas = leerZip(b)
    const nuevas = new Map<string, Uint8Array>()
    for (const parte of new Set(aTapar.map((c) => c.parte!))) {
      let xml = new TextDecoder('utf-8').decode(
        contenidoZip(
          b,
          entradas.find((e) => e.nombre === parte)!,
        ),
      )
      for (const c of aTapar.filter((x) => x.parte === parte)) xml = quitar(xml, c.elemento!)
      nuevas.set(parte, Buffer.from(xml, 'utf8'))
    }
    fuera = reescribirZip(b, nuevas)
  } else {
    const sinTramos = aTapar.filter((c) => !c.tramos)
    if (sinTramos.length) {
      return rechazo(
        `${sinTramos.map((c) => c.campo).join(', ')}: no sé vaciarlo en su sitio sin romper el fichero; hazlo a mano`,
      )
    }
    fuera = Uint8Array.from(b)
    for (const c of aTapar) for (const t of c.tramos!) fuera.set(t.bytes, t.inicio)
  }

  const despues = leerMetadatos(fuera, ruta)
  if (despues.estado !== 'leido') return rechazo('el resultado no se deja leer: no se escribe')
  const quedan = evaluar(ruta, despues)
  if (quedan.length) return rechazo(`quedó sin vaciar: ${quedan.map((h) => h.campo).join(', ')}`)
  return { estado: 'limpio', bytes: fuera, cambios: aTapar.map((c) => c.campo) }
}
