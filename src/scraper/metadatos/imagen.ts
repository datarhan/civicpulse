/**
 * Metadatos de imágenes: JPEG, PNG, TIFF, WebP y SVG, con lo que llevan dentro
 * —EXIF, XMP e IPTC—.
 *
 * Aquí la política no es la de los documentos, y la diferencia la decide QUIÉN
 * puso el dato:
 *
 *   · El autor de una hoja lo rellena Office con la cuenta de quien la guarda,
 *     sin que nadie lo decida. Eso se señala siempre.
 *   · El nombre del fotógrafo en Artist, By-line o dc:creator lo pone él, a
 *     propósito: es su CRÉDITO, información de gestión de derechos que no se
 *     debe borrar. El retrato de una concejala que publica el ayuntamiento lo
 *     lleva, y se queda.
 *   · Lo que sí se va en cualquier imagen publicada: números de serie de cámara
 *     y objetivo (atan todas las fotos de un aparato a su dueño), el nombre del
 *     dueño de la cámara, el nombre del fichero original, rutas del disco de
 *     alguien, y coordenadas GPS.
 *   · Una foto de QUEJA no puede llevar nada: la manda un vecino, y el bot la
 *     publica sin metadatos. Esa política la aplica `index.ts`; aquí sólo se lee.
 *
 * Cada campo que se puede vaciar en su sitio lleva sus TRAMOS: los bytes del
 * fichero que lo tapan, de la misma longitud, sin mover nada —ni un byte de la
 * imagen—. Un número de serie EXIF pasa a NUL; un valor XMP, a espacios; la IFD
 * de GPS se queda sin entradas y sin sus valores.
 */
import { inflateSync } from 'node:zlib'
import { sinRelleno, type Campo, type Clase, type Tramo } from './tipos.ts'

const TAM_TIPO: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
}

const ASCII_EXIF: Record<number, [string, Clase]> = {
  0x013b: ['Artist', 'credito'],
  0x8298: ['Copyright', 'credito'],
  0xa430: ['CameraOwnerName', 'dispositivo'],
  0xa431: ['BodySerialNumber', 'dispositivo'],
  0xa435: ['LensSerialNumber', 'dispositivo'],
}

const XMP_CREDITO = [
  'dc:creator',
  'dc:rights',
  'photoshop:Credit',
  'photoshop:AuthorsPosition',
  'photoshop:CaptionWriter',
  'xmpRights:Owner',
  'Iptc4xmpCore:CreatorContactInfo',
]
const XMP_DISPOSITIVO = [
  'aux:SerialNumber',
  'aux:LensSerialNumber',
  'aux:OwnerName',
  'exifEX:BodySerialNumber',
  'exifEX:LensSerialNumber',
  'exifEX:CameraOwnerName',
  'xmpMM:PreservedFileName',
  'crs:RawFileName',
]
const XMP_LUGAR = [
  'exif:GPSLatitude',
  'exif:GPSLongitude',
  'exif:GPSDestLatitude',
  'exif:GPSDestLongitude',
]

const IPTC: Record<number, string> = {
  80: 'By-line',
  85: 'By-line Title',
  110: 'Credit',
  115: 'Source',
  116: 'Copyright',
  118: 'Contact',
  122: 'Writer/Editor',
}

/** Una ruta del disco de alguien: /Users/…, /home/…, C:\Users\…, file:///… */
export const RUTA_PERSONAL =
  /^(file:\/\/\/?)?(\/Users\/|\/home\/|[A-Za-z]:[\\/](Users|Documents and Settings)[\\/])/i

const latin1 = (b: Uint8Array, a: number, z: number) =>
  Buffer.from(b.buffer, b.byteOffset + a, Math.max(0, z - a)).toString('latin1')
const utf8 = (b: Uint8Array, a: number, z: number) =>
  Buffer.from(b.buffer, b.byteOffset + a, Math.max(0, z - a)).toString('utf8')
const empieza = (b: Uint8Array, a: number, s: string) => latin1(b, a, a + s.length) === s
const espacios = (n: number) => new Uint8Array(n).fill(0x20)
const presencia = (campo: string, bytes: number): Campo => ({
  campo,
  valor: `(${bytes} bytes)`,
  clase: 'presencia',
})

// ── TIFF / EXIF ──────────────────────────────────────────────────────────────

export function leerTiff(b: Uint8Array, base: number, fin: number, prefijo: string): Campo[] {
  const le = b[base] === 0x49 && b[base + 1] === 0x49
  if (!le && !(b[base] === 0x4d && b[base + 1] === 0x4d)) throw new Error(`${prefijo}: no es TIFF`)
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const dentro = (o: number, n: number) => {
    if (o < 0 || n < 0 || base + o + n > fin)
      throw new Error(`${prefijo}: lectura fuera (${o}+${n})`)
  }
  const u16 = (o: number) => (dentro(o, 2), dv.getUint16(base + o, le))
  const u32 = (o: number) => (dentro(o, 4), dv.getUint32(base + o, le))

  const campos: Campo[] = []
  const vistas = new Set<number>()

  const gps = (off: number) => {
    const n = u16(off)
    if (n > 1000) throw new Error(`${prefijo}: IFD de GPS con ${n} entradas`)
    dentro(off, 2 + 12 * n)
    const tramos: Tramo[] = [{ inicio: base + off, bytes: new Uint8Array(2 + 12 * n) }]
    const partes: string[] = []
    let hayCoordenadas = false
    for (let i = 0; i < n; i++) {
      const e = off + 2 + 12 * i
      const tag = u16(e)
      const tipo = u16(e + 2)
      const tam = (TAM_TIPO[tipo] ?? 1) * u32(e + 4)
      if (tam > 4) {
        const dato = u32(e + 8)
        dentro(dato, tam)
        tramos.push({ inicio: base + dato, bytes: new Uint8Array(tam) })
      }
      if ((tag === 2 || tag === 4) && tipo === 5 && tam >= 8) {
        const dato = u32(e + 8)
        const valores: number[] = []
        for (let k = 0; k < tam / 8; k++) {
          const num = u32(dato + 8 * k)
          const den = u32(dato + 8 * k + 4)
          if (num !== 0) hayCoordenadas = true
          valores.push(den ? num / den : 0)
        }
        partes.push(`${tag === 2 ? 'lat' : 'lon'} ${valores.map((v) => +v.toFixed(4)).join(' ')}`)
      }
    }
    if (hayCoordenadas) {
      campos.push({
        campo: `${prefijo} · GPS`,
        valor: partes.join(' · '),
        clase: 'localizacion',
        tramos,
      })
    } else if (n > 0) campos.push(presencia(`${prefijo} · GPS sin coordenadas`, 2 + 12 * n))
  }

  const ifd = (off: number, donde: string) => {
    if (off === 0 || vistas.has(off)) return
    vistas.add(off)
    const n = u16(off)
    if (n > 1000) throw new Error(`${prefijo}: IFD con ${n} entradas`)
    for (let i = 0; i < n; i++) {
      const e = off + 2 + 12 * i
      const tag = u16(e)
      const tipo = u16(e + 2)
      const tam = (TAM_TIPO[tipo] ?? 1) * u32(e + 4)
      const dato = tam <= 4 ? e + 8 : u32(e + 8)
      if (tag === 0x8769 || tag === 0xa005) {
        ifd(u32(e + 8), tag === 0x8769 ? 'Exif' : 'Interop')
        continue
      }
      if (tag === 0x8825) {
        gps(u32(e + 8))
        continue
      }
      if (ASCII_EXIF[tag] || tag === 0x9c9d || tag === 0x927c || tag === 0x02bc || tag === 0x83bb) {
        dentro(dato, tam)
      }
      if (ASCII_EXIF[tag]) {
        const [nombre, clase] = ASCII_EXIF[tag]
        // Copyright puede traer dos cadenas: la del fotógrafo y la del editor.
        const valor = sinRelleno(
          latin1(b, base + dato, base + dato + tam)
            .split('\u0000')
            .filter(Boolean)
            .join(' / '),
        )
        if (valor) {
          campos.push({
            campo: `${prefijo} · ${nombre}`,
            valor,
            clase,
            tramos: [{ inicio: base + dato, bytes: new Uint8Array(tam) }],
          })
        }
      } else if (tag === 0x9c9d) {
        const valor = sinRelleno(
          Buffer.from(b.buffer, b.byteOffset + base + dato, tam).toString('utf16le'),
        )
        if (valor) campos.push({ campo: `${prefijo} · XPAuthor`, valor, clase: 'credito' })
      } else if (tag === 0x927c && tam > 0) {
        campos.push({
          campo: `${prefijo} · MakerNote`,
          valor: `(${tam} bytes)`,
          clase: 'dispositivo',
          tramos: [{ inicio: base + dato, bytes: new Uint8Array(tam) }],
        })
      } else if (tag === 0x02bc) {
        campos.push(...leerXmp(b, base + dato, base + dato + tam))
      } else if (tag === 0x83bb) {
        campos.push(...leerIim(b, base + dato, base + dato + tam))
      }
    }
    if (donde === 'IFD0') ifd(u32(off + 2 + 12 * n), 'IFD1')
  }

  ifd(u32(4), 'IFD0')
  return campos
}

// ── XMP ──────────────────────────────────────────────────────────────────────

/**
 * Propiedades XMP en sus dos formas, atributo (`aux:SerialNumber="…"`) y
 * elemento (`<dc:creator><rdf:Seq><rdf:li>…`). Las posiciones se calculan
 * sobre los BYTES —el paquete se lee como Latin-1, un carácter por byte—, y
 * los valores se descodifican como UTF-8.
 */
export function leerXmp(b: Uint8Array, ini: number, fin: number): Campo[] {
  const t = latin1(b, ini, fin)
  const campos: Campo[] = []
  const propiedad = (nombre: string, clase: Clase, vaciable: boolean) => {
    const atributo = new RegExp(`\\s${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'g')
    for (const m of t.matchAll(atributo)) {
      const crudo = m[1] ?? m[2]
      const a = m.index! + m[0].length - 1 - crudo.length
      const valor = sinRelleno(utf8(b, ini + a, ini + a + crudo.length))
      if (!valor) continue
      campos.push({
        campo: `XMP · ${nombre}`,
        valor,
        clase,
        tramos: vaciable ? [{ inicio: ini + a, bytes: espacios(crudo.length) }] : undefined,
      })
    }
    const elemento = new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`, 'g')
    for (const m of t.matchAll(elemento)) {
      const interior = m[1]
      const a = m.index! + m[0].length - `</${nombre}>`.length - interior.length
      const valor = sinRelleno(
        utf8(b, ini + a, ini + a + interior.length)
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' '),
      )
      if (!valor) continue
      // Sólo el texto, fuera de las etiquetas, pasa a espacios.
      const tramos: Tramo[] = []
      if (vaciable) {
        let pos = 0
        for (const trozo of interior.split(/(<[^>]*>)/)) {
          if (!trozo.startsWith('<') && trozo.trim()) {
            tramos.push({ inicio: ini + a + pos, bytes: espacios(trozo.length) })
          }
          pos += trozo.length
        }
      }
      campos.push({ campo: `XMP · ${nombre}`, valor, clase, tramos: vaciable ? tramos : undefined })
    }
  }
  for (const n of XMP_CREDITO) propiedad(n, 'credito', false)
  for (const n of XMP_DISPOSITIVO) propiedad(n, 'dispositivo', true)
  for (const n of XMP_LUGAR) propiedad(n, 'localizacion', true)
  return campos
}

// ── IPTC ─────────────────────────────────────────────────────────────────────

function leerIim(b: Uint8Array, ini: number, fin: number): Campo[] {
  const campos: Campo[] = []
  for (let p = ini; p + 5 <= fin && b[p] === 0x1c;) {
    const registro = b[p + 1]
    const dato = b[p + 2]
    const largo = (b[p + 3] << 8) | b[p + 4]
    if (largo & 0x8000) throw new Error('IPTC: conjunto de longitud extendida')
    const a = p + 5
    const z = a + largo
    if (z > fin) throw new Error('IPTC: conjunto cortado')
    if (registro === 2 && IPTC[dato]) {
      const valor = sinRelleno(utf8(b, a, z))
      if (valor) campos.push({ campo: `IPTC · ${IPTC[dato]} (2:${dato})`, valor, clase: 'credito' })
    }
    p = z
  }
  return campos
}

/** Los recursos de Photoshop («8BIM»): 0x0404 lleva IPTC; 0x0424, XMP. */
function leerIrb(b: Uint8Array, ini: number, fin: number): Campo[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const campos: Campo[] = []
  for (let p = ini; p + 12 <= fin && empieza(b, p, '8BIM');) {
    const id = dv.getUint16(p + 4)
    const largoNombre = b[p + 6]
    let q = p + 7 + largoNombre
    if ((largoNombre + 1) % 2) q++
    if (q + 4 > fin) throw new Error('IRB: recurso cortado')
    const tam = dv.getUint32(q)
    const a = q + 4
    const z = a + tam
    if (z > fin) throw new Error('IRB: recurso cortado')
    if (id === 0x0404) campos.push(...leerIim(b, a, z))
    if (id === 0x0424) campos.push(...leerXmp(b, a, z))
    p = z + (tam % 2)
  }
  return campos
}

// ── Contenedores ─────────────────────────────────────────────────────────────

const XMP_NS = 'http://ns.adobe.com/xap/1.0/\u0000'
const XMP_EXTENDIDO = 'http://ns.adobe.com/xmp/extension/\u0000'

export function leerJpeg(b: Uint8Array): Campo[] {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('JPEG: no empieza por SOI')
  const campos: Campo[] = []
  for (let p = 2; p + 4 <= b.length;) {
    if (b[p] !== 0xff) throw new Error(`JPEG: se esperaba un marcador en ${p}`)
    const m = b[p + 1]
    if (m === 0xff) {
      p++
      continue
    }
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01 || m === 0xd8) {
      p += 2
      continue
    }
    if (m === 0xda || m === 0xd9) break // lo que sigue es la imagen
    const largo = (b[p + 2] << 8) | b[p + 3]
    const a = p + 4
    const z = p + 2 + largo
    if (largo < 2 || z > b.length) throw new Error('JPEG: segmento cortado')
    if (m === 0xe1 && empieza(b, a, 'Exif\u0000\u0000')) {
      campos.push(presencia('JPEG · segmento EXIF', z - a))
      campos.push(...leerTiff(b, a + 6, z, 'EXIF'))
    } else if (m === 0xe1 && empieza(b, a, XMP_NS)) {
      campos.push(presencia('JPEG · segmento XMP', z - a))
      campos.push(...leerXmp(b, a + XMP_NS.length, z))
    } else if (m === 0xe1 && empieza(b, a, XMP_EXTENDIDO)) {
      campos.push(presencia('JPEG · segmento XMP extendido', z - a))
      campos.push(...leerXmp(b, a + XMP_EXTENDIDO.length + 40, z))
    } else if (m === 0xed && empieza(b, a, 'Photoshop 3.0\u0000')) {
      campos.push(presencia('JPEG · segmento IPTC', z - a))
      campos.push(...leerIrb(b, a + 14, z))
    } else if (m === 0xfe) {
      const valor = sinRelleno(latin1(b, a, z))
      if (valor) campos.push({ campo: 'JPEG · comentario', valor, clase: 'presencia' })
    }
    p = z
  }
  return campos
}

export function leerPng(b: Uint8Array): Campo[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const campos: Campo[] = []
  const texto = (trozo: string, clave: string, valor: string, tramos?: Tramo[]) => {
    const v = sinRelleno(valor)
    if (!v) return
    const clase: Clase = /^(Author|Copyright|Creator)$/i.test(clave) ? 'credito' : 'presencia'
    campos.push({ campo: `PNG ${trozo} · ${clave}`, valor: v, clase, tramos })
  }
  for (let p = 8; p + 12 <= b.length;) {
    const largo = dv.getUint32(p)
    const tipo = latin1(b, p + 4, p + 8)
    const a = p + 8
    const z = a + largo
    if (z + 4 > b.length) throw new Error('PNG: trozo cortado')
    if (tipo === 'tEXt' || tipo === 'zTXt' || tipo === 'iTXt') {
      const cero = b.indexOf(0, a)
      if (cero < 0 || cero >= z) throw new Error(`PNG: ${tipo} sin clave`)
      const clave = latin1(b, a, cero)
      if (tipo === 'tEXt') texto(tipo, clave, latin1(b, cero + 1, z))
      else if (tipo === 'zTXt')
        texto(tipo, clave, inflateSync(b.subarray(cero + 2, z)).toString('latin1'))
      else {
        const comprimido = b[cero + 1] === 1
        const finIdioma = b.indexOf(0, cero + 3)
        const finTraducida = b.indexOf(0, finIdioma + 1)
        if (finIdioma < 0 || finTraducida < 0 || finTraducida >= z)
          throw new Error('PNG: iTXt roto')
        const d = finTraducida + 1
        if (clave === 'XML:com.adobe.xmp') {
          campos.push(presencia('PNG · XMP', z - d))
          if (comprimido) {
            const x = inflateSync(b.subarray(d, z))
            campos.push(...leerXmp(x, 0, x.length).map(({ tramos, ...c }) => c))
          } else campos.push(...leerXmp(b, d, z))
        } else {
          texto(
            tipo,
            clave,
            comprimido ? inflateSync(b.subarray(d, z)).toString('utf8') : utf8(b, d, z),
          )
        }
      }
    } else if (tipo === 'eXIf') {
      campos.push(presencia('PNG · trozo eXIf', largo))
      campos.push(...leerTiff(b, a, z, 'EXIF'))
    } else if (tipo === 'IEND') break
    p = z + 4
  }
  return campos
}

export function leerWebp(b: Uint8Array): Campo[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const campos: Campo[] = []
  for (let p = 12; p + 8 <= b.length;) {
    const tipo = latin1(b, p, p + 4)
    const largo = dv.getUint32(p + 4, true)
    const a = p + 8
    const z = a + largo
    if (z > b.length) throw new Error('WebP: trozo cortado')
    if (tipo === 'EXIF') {
      campos.push(presencia('WebP · trozo EXIF', largo))
      campos.push(...leerTiff(b, empieza(b, a, 'Exif\u0000\u0000') ? a + 6 : a, z, 'EXIF'))
    } else if (tipo === 'XMP ') {
      campos.push(presencia('WebP · trozo XMP', largo))
      campos.push(...leerXmp(b, a, z))
    }
    p = z + (largo % 2)
  }
  return campos
}

export function leerSvg(b: Uint8Array): Campo[] {
  const t = latin1(b, 0, b.length)
  if (!/<svg\b/.test(t.slice(0, 8192))) throw new Error('SVG: no hay elemento <svg>')
  const campos: Campo[] = []
  for (const m of t.matchAll(/<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/g)) {
    const a = m.index! + m[0].indexOf('>') + 1
    const valor = sinRelleno(
      utf8(b, a, a + m[1].length)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' '),
    )
    if (valor) campos.push({ campo: 'SVG · dc:creator', valor, clase: 'credito' })
  }
  const atributo = /\s((?:sodipodi|inkscape):[\w-]+|xlink:href|href)\s*=\s*"([^"]*)"/g
  for (const m of t.matchAll(atributo)) {
    const valor = utf8(b, m.index! + m[0].length - 1 - m[2].length, m.index! + m[0].length - 1)
    if (!RUTA_PERSONAL.test(valor)) continue
    const a = m.index! + m[0].length - 1 - m[2].length
    campos.push({
      campo: `SVG · ${m[1]}`,
      valor,
      clase: 'dispositivo',
      tramos: [{ inicio: a, bytes: espacios(m[2].length) }],
    })
  }
  return campos
}
