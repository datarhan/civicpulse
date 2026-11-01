/**
 * Lector OCR, sólo Node, de las hojas de ejecución que llegan sin capa de texto.
 * Qué se lee y cuándo se publica está en budget-execution-ocr.ts, que es puro;
 * aquí sólo se pinta cada página y se le pasa a Tesseract.
 *
 * Todo es WebAssembly —mupdf pinta, tesseract.js lee, el modelo de español
 * viene del paquete @tesseract.js-data/spa— y nada toca la red ni pide un
 * binario del sistema. Es a propósito: este adaptador corre en la nocturna de
 * GitHub, que no instala poppler, y en el portátil. Un lector que sólo
 * existiera en uno de los dos publicaría el 3T de 2025 desde aquí y lo
 * borraría en la siguiente nocturna.
 *
 * Medido el 29-10-2026 sobre los dos «Resumen por capítulos» del 1T de 2026,
 * que sí traen texto: las 120 cifras, iguales a las de su capa de texto. Claude
 * Opus 5.5 las leyó igual de bien; no se usa porque cobra cada página y no
 * siempre contesta lo mismo, y esto corre cada noche sin nadie mirando.
 *
 * Ningún ajuste lee bien todas las hojas: en gris tal cual se pierden las filas
 * «Total» que van sobre banda gris; blanqueando lo claro se recuperan, pero una
 * cifra del 1T de 2026 salía «-0,602%». Así que se prueba un ajuste y, si su
 * lectura no cuadra, el siguiente; se publica la primera que cuadra, y el
 * snapshot dice con cuál. Probar dos no rebaja la puerta: una cifra mal leída
 * tendría que cuadrar con su porcentaje y con cinco sumas al céntimo.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import {
  lecturaAceptable,
  leerHojaOcr,
  plantillaOcr,
  type LecturaOcr,
} from './budget-execution-ocr'

export interface AjusteOcr {
  /** Resolución a la que se pinta la página. */
  ppp: number
  /** Lo que sea más claro que esto se blanquea; null, la página tal cual. */
  blanqueo: number | null
}

/**
 * En orden. Binarizar del todo —negro o blanco— y subir a 350 o 400 ppp se
 * midieron peor: engordan los trazos y el 5 se lee 3.
 */
export const AJUSTES: AjusteOcr[] = [
  { ppp: 300, blanqueo: null },
  { ppp: 300, blanqueo: 200 },
]

export const nombreDeAjuste = (a: AjusteOcr) =>
  `${a.ppp} ppp${a.blanqueo == null ? '' : `, blanqueo desde ${a.blanqueo}`}`

/** Una página que tarde más que esto es un lector colgado, no una página difícil. */
const TIEMPO_POR_PAGINA_MS = 90_000

/** Lo que firma una página leída del derecho; tumbada no se lee. */
const DERECHA = /Periodo:\s*\d{4}/

export interface HojaLeida {
  lectura: LecturaOcr
  /** El ajuste de la lectura que se devuelve, o null si ningún giro dejó leer la página. */
  ajuste: string | null
  /** Cuántos ajustes se probaron. */
  intentos: number
  /** El texto de esa lectura, para quien quiera mirarlo. */
  texto: string
}

export interface LectorOcr {
  /** Qué lee, con sus versiones: va al snapshot. */
  motor: string
  leerPdf(pdf: Uint8Array): Promise<HojaLeida>
  cerrar(): Promise<void>
}

function versionDe(require: NodeJS.Require, paquete: string): string {
  try {
    let dir = dirname(require.resolve(paquete))
    for (let i = 0; i < 4; i++, dir = dirname(dir)) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        if (pkg.name === paquete) return pkg.version
      } catch {
        /* sube un nivel */
      }
    }
  } catch {
    /* sin resolver */
  }
  return '?'
}

function conTiempo<T>(p: Promise<T>, ms: number, que: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, rechazar) => {
      t = setTimeout(() => rechazar(new Error(`${que}: más de ${ms / 1000} s`)), ms)
    }),
  ])
}

/**
 * Arranca el lector. Lanza si falta mupdf, tesseract.js o el modelo: quien raspa
 * lo cuenta como hojas que no se intentaron, con el motivo, no como hojas vacías.
 */
export async function crearLectorOcr(): Promise<LectorOcr> {
  const mupdf = await import('mupdf')
  const { createWorker } = await import('tesseract.js')
  const require = createRequire(import.meta.url)
  const modelo = join(
    dirname(require.resolve('@tesseract.js-data/spa/package.json')),
    '4.0.0_best_int',
  )
  // OEM 1 = sólo LSTM. `cacheMethod: 'none'`: sin él, tesseract.js deja una
  // copia del modelo en el directorio desde el que se le llame. `errorHandler`:
  // sin él, una imagen que no sabe leer rechaza la promesa Y además lanza desde
  // su hilo, fuera de todo try, y tumba el proceso entero —el raspado de todos
  // los periodos— en vez de sólo esa hoja.
  const worker = await createWorker('spa', 1, {
    langPath: modelo,
    gzip: true,
    cacheMethod: 'none',
    errorHandler: () => {},
  })
  // PSM 6 = un bloque de texto uniforme: conserva las filas de la tabla, y
  // `preserve_interword_spaces` deja las columnas separadas por varios espacios.
  // `debug_file`: sin él, cada filete de la tabla sale en el registro de la
  // nocturna como «Image too small to scale!!».
  await worker.setParameters({
    tessedit_pageseg_mode: '6' as never,
    preserve_interword_spaces: '1',
    debug_file: '/dev/null',
  })
  const motor =
    `tesseract.js ${versionDe(require, 'tesseract.js')} (spa 4.0.0_best_int) ` +
    `sobre mupdf ${versionDe(require, 'mupdf')}`

  type Doc = InstanceType<typeof mupdf.Document>

  async function leerPagina(doc: Doc, n: number, giro: number, a: AjusteOcr) {
    const pagina = doc.loadPage(n)
    const z = a.ppp / 72
    const matriz = mupdf.Matrix.concat(mupdf.Matrix.scale(z, z), mupdf.Matrix.rotate(giro))
    const pix = pagina.toPixmap(matriz, mupdf.ColorSpace.DeviceGray, false, true)
    if (a.blanqueo != null) {
      const px = pix.getPixels()
      for (let i = 0; i < px.length; i++) if (px[i] >= a.blanqueo) px[i] = 255
    }
    const png = pix.asPNG()
    pix.destroy()
    pagina.destroy()
    const { data } = await conTiempo(
      worker.recognize(Buffer.from(png)),
      TIEMPO_POR_PAGINA_MS,
      `OCR de la página ${n + 1}`,
    )
    return data.text
  }

  /** El giro que deja leer la primera página, o null. Los originales son apaisados; «Print To PDF» los dejó en vertical con el contenido tumbado. */
  async function giroDe(doc: Doc, a: AjusteOcr): Promise<{ giro: number | null; primera: string }> {
    const [x0, y0, x1, y1] = doc.loadPage(0).getBounds()
    let primera = ''
    for (const giro of x1 - x0 > y1 - y0 ? [0, 90, 270] : [90, 270, 0]) {
      primera = await leerPagina(doc, 0, giro, a)
      if (DERECHA.test(primera)) return { giro, primera }
    }
    return { giro: null, primera }
  }

  async function textoDe(doc: Doc, giro: number, primera: string, a: AjusteOcr) {
    // El resumen es una página; del desglose basta la última, donde está su
    // «Total»; de la plantilla antigua hacen falta todas, porque cada capítulo
    // cierra donde le toca.
    const total = doc.countPages()
    const resto =
      plantillaOcr(primera).plantilla === 'desglose'
        ? total > 1
          ? [total - 1]
          : []
        : Array.from({ length: total - 1 }, (_, i) => i + 1)
    const textos = [primera]
    for (const n of resto) textos.push(await leerPagina(doc, n, giro, a))
    return textos.join('\n\f\n')
  }

  return {
    motor,
    async leerPdf(pdf) {
      const doc = mupdf.Document.openDocument(pdf, 'application/pdf')
      try {
        if (doc.countPages() === 0)
          return { lectura: leerHojaOcr(''), ajuste: null, intentos: 0, texto: '' }
        let giro: number | null = null
        let primeraLeida: HojaLeida | null = null
        for (const [i, a] of AJUSTES.entries()) {
          let primera: string
          if (giro == null) {
            const g = await giroDe(doc, a)
            if (g.giro == null) {
              if (i < AJUSTES.length - 1) continue
              return (
                primeraLeida ?? {
                  lectura: leerHojaOcr(g.primera),
                  ajuste: null,
                  intentos: i + 1,
                  texto: g.primera,
                }
              )
            }
            giro = g.giro
            primera = g.primera
          } else primera = await leerPagina(doc, 0, giro, a)
          const texto = await textoDe(doc, giro, primera, a)
          const hoja: HojaLeida = {
            lectura: leerHojaOcr(texto),
            ajuste: nombreDeAjuste(a),
            intentos: i + 1,
            texto,
          }
          if (lecturaAceptable(hoja.lectura)) return hoja
          primeraLeida ??= hoja
        }
        // Ninguna cuadró: se devuelve el motivo de la primera, que es la que
        // se habría publicado, y cuántos ajustes se probaron.
        return { ...primeraLeida!, intentos: AJUSTES.length }
      } finally {
        doc.destroy()
      }
    },
    async cerrar() {
      await worker.terminate()
    },
  }
}
