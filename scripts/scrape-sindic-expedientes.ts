#!/usr/bin/env tsx
/**
 * Síndic de Greuges CV — índice de expedientes sobre Riba-roja de Túria.
 *
 * Único sitio de este dominio donde vive `fetch`. El parser está en
 * `src/scraper/sindic-expedientes.ts` y se prueba contra fixtures sin red;
 * aquí sólo se pagina, se junta y se escribe.
 *
 * Fuente: POST a `wp-admin/admin-ajax.php?action=buscador_expedientes_elastic_search`,
 * el buscador Elasticsearch de https://www.elsindic.com/actuaciones/. El
 * `robots.txt` del organismo lo permite explícitamente (`Allow:
 * /wp-admin/admin-ajax.php`). Se identifica el proyecto en el User-Agent y se
 * pausa entre páginas; no hay bucle apretado.
 *
 * Uso:
 *   npm run scrape:sindic-expedientes
 *   npm run scrape:sindic-expedientes -- --allow-empty   (ver abajo)
 *
 * Idempotente salvo `generatedAt`.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseResultados,
  repartirPorAdministracion,
  estadisticas,
  TIPOS_RESOLUCION_CONOCIDOS,
  type ExpedienteSindic,
} from '../src/scraper/sindic-expedientes'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public/data/sindic-expedientes.json')

const PORTAL = 'https://www.elsindic.com'
const BUSCADOR = `${PORTAL}/actuaciones/`
const ENDPOINT = `${PORTAL}/wp-admin/admin-ajax.php?action=buscador_expedientes_elastic_search`
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

const MUNICIPIO = 'Riba-roja de Túria'
/** Frase para el eje de texto. El índice parte el guion, así que «Riba-roja»
 *  y «Riba roja» son la misma consulta; «Ribarroja» junto no devuelve nada. */
const FRASE_TEXTO = 'Riba-roja'
const POR_PAGINA = 10
/** Tope de cortesía. 49 filas hoy; si un día hace falta más, se sube a mano. */
const MAX_PAGINAS = 40
const PAUSA_MS = 700

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Lo que cada eje reporta de sí mismo. Un eje que no trabajó tiene que notarse. */
interface ParteEje {
  eje: 'texto' | 'poblacion'
  consulta: Record<string, unknown>
  /** Total que declara el buscador. */
  declarado: number
  recogidas: number
  paginas: number
  /** Páginas que llegaron pero no supimos leer. Distinto de «sin resultados». */
  irreconocibles: number
}

async function pedir(params: Record<string, unknown>): Promise<string> {
  const body = new URLSearchParams({ params: JSON.stringify(params) })
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
      Referer: BUSCADOR,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} en ${ENDPOINT}`)
  return res.text()
}

async function recorrerEje(
  eje: ParteEje['eje'],
  consulta: Record<string, unknown>,
): Promise<{ parte: ParteEje; filas: ExpedienteSindic[] }> {
  const filas: ExpedienteSindic[] = []
  let declarado = 0
  let paginas = 0
  let irreconocibles = 0

  for (let from = 0; paginas < MAX_PAGINAS; from += POR_PAGINA) {
    const r = parseResultados(await pedir(from ? { ...consulta, from } : consulta))
    paginas++
    if (!r.reconocida) {
      // NO se trata como «se acabó»: una plantilla que cambia dejaría de leer
      // en la página 1 y el parte diría «recogidas: 0» con cara de dato.
      irreconocibles++
      break
    }
    if (from === 0) declarado = r.total
    filas.push(...r.filas)
    if (r.filas.length === 0 || filas.length >= declarado) break
    await pausa(PAUSA_MS)
  }

  return {
    parte: { eje, consulta, declarado, recogidas: filas.length, paginas, irreconocibles },
    filas,
  }
}

async function filasPublicadas(): Promise<number | null> {
  try {
    const prev = JSON.parse(await readFile(OUT, 'utf8'))
    return (
      (prev?.contraAyuntamiento?.length ?? 0) + (prev?.vecinosOtrasAdministraciones?.length ?? 0)
    )
  } catch {
    return null // primera vez
  }
}

async function main() {
  const permitirVacio = process.argv.includes('--allow-empty')

  const texto = await recorrerEje('texto', {
    idioma: 'c',
    qs: `"${FRASE_TEXTO}"`,
    frase: true,
    anyoActual: new Date().getFullYear(),
  })
  await pausa(PAUSA_MS)
  const poblacion = await recorrerEje('poblacion', { idioma: 'c', poblacion: MUNICIPIO })

  const partes = [texto.parte, poblacion.parte]
  for (const p of partes) {
    console.log(
      `[sindic-exp] eje ${p.eje}: declarado ${p.declarado} · recogidas ${p.recogidas} · ` +
        `páginas ${p.paginas}${p.irreconocibles ? ` · IRRECONOCIBLES ${p.irreconocibles}` : ''}`,
    )
    if (p.irreconocibles) {
      console.error(
        `[sindic-exp] ERROR: el eje ${p.eje} devolvió una página que no se supo leer. ` +
          `El buscador ha cambiado de plantilla; no se escribe nada.`,
      )
      process.exit(1)
    }
    if (p.recogidas < p.declarado) {
      console.error(
        `[sindic-exp] ERROR: el eje ${p.eje} declara ${p.declarado} y sólo se recogieron ` +
          `${p.recogidas}. Publicar esto sería publicar un recorte como si fuera el total.`,
      )
      process.exit(1)
    }
  }

  const reparto = repartirPorAdministracion(texto.filas, poblacion.filas)
  const stats = estadisticas(reparto)
  console.log(
    `[sindic-exp] reparto: ${reparto.contraAyuntamiento.length} contra el Ayuntamiento · ` +
      `${reparto.vecinos.length} de vecinos ante otras administraciones · ` +
      `${reparto.descartadas.length} menciones descartadas · ${reparto.duplicadas} repetidas entre ejes`,
  )

  // Una pasada tiene que demostrar que trabajó (regla 2 de DATA_INTEGRITY).
  // Cero filas con HTTP 200 es exactamente la pinta que tuvo este dominio
  // durante 125 días, así que no se sobreescribe un snapshot con contenido.
  const publicadas = await filasPublicadas()
  if (reparto.contraAyuntamiento.length === 0 && publicadas && !permitirVacio) {
    console.error(
      `[sindic-exp] ABORTADO: la pasada no encontró ningún expediente contra el Ayuntamiento y ` +
        `lo publicado tiene ${publicadas}. Eso es un fallo de la fuente o del parser, no una ` +
        `noticia. Si de verdad el Síndic ha vaciado su registro: --allow-empty.`,
    )
    process.exit(1)
  }
  // Y la simétrica: una puerta que acepta TODO tampoco está haciendo su trabajo.
  // El eje de texto siempre arrastra menciones contra otras administraciones —
  // Conselleria, el Ayuntamiento de València—, así que cero rechazos significa
  // que el campo Administración dejó de venir o que la puerta se abrió.
  const rechazadas = reparto.vecinos.length + reparto.descartadas.length
  if (rechazadas === 0 && !permitirVacio) {
    console.error(
      `[sindic-exp] ABORTADO: la puerta no rechazó ni una fila de ${texto.parte.declarado} del ` +
        `eje de texto. O el campo «Administración» dejó de venir, o la puerta se abrió. ` +
        `Si de verdad hoy todo el registro va contra este ayuntamiento: --allow-empty.`,
    )
    process.exit(1)
  }
  if (stats.tiposDesconocidos > 0) {
    const total = Object.values(stats.porTipoResolucion).reduce((a, b) => a + b, 0)
    console.warn(
      `[sindic-exp] AVISO: ${stats.tiposDesconocidos}/${total} títulos de resolución fuera del ` +
        `vocabulario observado (${TIPOS_RESOLUCION_CONOCIDOS.join(' · ')}). Se guardan verbatim; ` +
        `revisa si el Síndic cambió su nomenclatura.`,
    )
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    note:
      'Índice de expedientes del Síndic de Greuges CV, transcrito del buscador del propio ' +
      'organismo. Materia, asunto, administración y el título de cada resolución van verbatim: ' +
      'este fichero NO emite ningún juicio. Las fichas firmadas —con resumen verbatim leído del ' +
      'PDF— viven en sindic.json y las escribe una persona con `npm run sindic:add`. ' +
      '«contraAyuntamiento» y «vecinosOtrasAdministraciones» responden a preguntas distintas y ' +
      'NO se suman.',
    source: {
      platform: 'Síndic de Greuges de la Comunitat Valenciana',
      portal: PORTAL,
      buscador: BUSCADOR,
      endpoint: ENDPOINT,
      robots: `${PORTAL}/robots.txt — Allow: /wp-admin/admin-ajax.php`,
    },
    consulta: {
      municipio: MUNICIPIO,
      ejes: partes,
      puerta:
        'Campo «Administración» del propio buscador: cuerpo municipal + alias del municipio con ' +
        'su desambiguador. El facet «poblacion» es la población del QUEJOSO, no la administración ' +
        'reclamada, y por sí solo no sirve de filtro.',
    },
    cobertura: {
      contraAyuntamientoDesde: stats.anioMasAntiguo,
      contraAyuntamientoHasta: stats.anioMasReciente,
      vecinosDesde: reparto.vecinos.length ? Math.min(...reparto.vecinos.map((f) => f.anio)) : null,
      vecinosHasta: reparto.vecinos.length ? Math.max(...reparto.vecinos.map((f) => f.anio)) : null,
      limite:
        'El eje de texto llega al inicio del registro publicado; el facet de población no ' +
        'devuelve expedientes anteriores a 2023, así que la segunda lista no es una serie ' +
        'histórica y su ausencia de filas antiguas no significa que no las hubiera.',
    },
    contraAyuntamiento: reparto.contraAyuntamiento,
    vecinosOtrasAdministraciones: reparto.vecinos,
    stats: {
      ...stats,
      mencionesDescartadas: reparto.descartadas.length,
      repetidasEntreEjes: reparto.duplicadas,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[sindic-exp] escrito → ${OUT}`)
  for (const [tipo, n] of Object.entries(stats.porTipoResolucion).sort((a, b) => b[1] - a[1])) {
    console.log(`  · ${String(n).padStart(3)} × ${tipo}`)
  }
}

main().catch((err) => {
  console.error('[sindic-exp] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
