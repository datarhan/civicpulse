#!/usr/bin/env tsx
/**
 * Construye public/data/bibliotecas.json — visitas y prestatarios activos de
 * la biblioteca, por año, junto a los de la banda de comparación.
 *
 * Fuente: Estadística de Bibliotecas Públicas (Ministerio de Cultura), anexo 28
 * «Visitas y usuarios inscritos», una tabla HTML por provincia y año en
 * `mcu.es/alziraweb`, leída con un GET simple. Los años los dice el propio
 * desplegable de la página. Sólo responde bien desde la máquina del curador:
 * al contenedor de la nube le contesta 429 siempre, así que la cadencia es
 * `manual`, anual, con presupuesto largo.
 *
 * La banda es la del coste efectivo (`coste-efectivo.json` → `pares.miembros`,
 * cv-15k-40k), como en reciclaje, SIN el propio municipio y con su n declarado.
 * Las tasas usan el padrón del INE (tablas por provincia, por código INE): el
 * del propio municipio se coteja con `padron.json` antes de escribir.
 *
 * Cortés: User-Agent del proyecto, una pausa entre peticiones y cada página
 * cacheada en `.cache/bibliotecas/` (sólo `--refetch` vuelve a pedirla).
 *
 * Usage: npm run scrape:bibliotecas [-- --refetch]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TASAS,
  grupoDe,
  parseAnexoMunicipios,
  resolverMunicipio,
  tasasDe,
  type AnexoMunicipios,
  type BibliotecasSnapshot,
  type FilaPar,
  type PuntoBiblioteca,
} from '../src/scraper/bibliotecas'
import { parseInePadron } from '../src/scraper/padron'
import { INE_PROPIO } from '../src/scraper/dea-especificacion'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CACHE = join(ROOT, '.cache/bibliotecas')
const OUT = join(ROOT, 'public/data/bibliotecas.json')

const UA = 'CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)'
const BASE = 'https://www.mcu.es/alziraweb/alziraweb.cmd'
const ANEXO = 28
/** Las tres provincias de la Comunitat: la banda cv-15k-40k vive en las tres. */
const PROVINCIAS = ['03', '12', '46'] as const
/** Tablas del padrón del INE por municipio, una por provincia. */
const TABLAS_PADRON: Record<(typeof PROVINCIAS)[number], number> = {
  '03': 2856,
  '12': 2865,
  '46': 2903,
}
const PAUSA_MS = 3000

const url = (prov: string, anio: number | '') =>
  `${BASE}?command=GetAnexo&id=${ANEXO}&origen=PR&codigo=${prov}&ejercicio=${anio}&porcentaje=`

let ultimaPeticion = 0
async function traer(u: string, cachePath: string, refetch: boolean, latin1: boolean) {
  if (!refetch && existsSync(cachePath)) return readFile(cachePath, latin1 ? 'latin1' : 'utf8')
  const espera = ultimaPeticion + PAUSA_MS - Date.now()
  if (espera > 0) await new Promise((r) => setTimeout(r, espera))
  ultimaPeticion = Date.now()
  const res = await fetch(u, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(120_000),
  })
  if (res.status === 429) {
    throw new Error(
      `[bibliotecas] ${new URL(u).host} respondió 429: este host sólo contesta desde la máquina ` +
        'del curador (a la nube, siempre 429). No se escribe nada.',
    )
  }
  if (!res.ok) throw new Error(`[bibliotecas] HTTP ${res.status} ${u}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, buf)
  return buf.toString(latin1 ? 'latin1' : 'utf8')
}

/** Los años que ofrece el desplegable de la página. */
function aniosDisponibles(html: string): number[] {
  const sel = html.match(/<select[^>]*id="ejercicio"[\s\S]*?<\/select>/)?.[0] ?? ''
  const anios = [...sel.matchAll(/<option value="(\d{4})"/g)].map((m) => Number(m[1]))
  if (!anios.length) throw new Error('[bibliotecas] la página no ofrece ningún año')
  return anios.sort((a, b) => a - b)
}

/** El anexo, con la prueba de que no se perdió ninguna fila: la suma = TOTAL. */
function comprobado(a: AnexoMunicipios, prov: string): AnexoMunicipios {
  for (const k of [
    'visitas',
    'usuariosInscritos',
    'nuevosUsuarios',
    'prestatariosActivos',
  ] as const) {
    const suma = a.filas.reduce((s, f) => s + (f[k] ?? 0), 0)
    if (suma !== a.total[k]) {
      throw new Error(
        `[bibliotecas] provincia ${prov}, ${a.anio}: la suma de «${k}» (${suma}) no es la ` +
          `fila TOTAL (${a.total[k]}) — falta o sobra una fila; no se publica`,
      )
    }
  }
  return a
}

async function main() {
  const refetch = process.argv.includes('--refetch')
  const rec = startRun('scrape-bibliotecas', { mode: 'fetch', getStats: () => NO_LLM_STATS })

  // Los años: el desplegable de la página de Valencia sin año (la última).
  const portada = await traer(url('46', ''), join(CACHE, 'anexo28-PR46-actual.html'), refetch, true)
  const anios = aniosDisponibles(portada)

  const anexos = new Map<string, AnexoMunicipios>()
  for (const prov of PROVINCIAS) {
    for (const anio of anios) {
      const html = await traer(
        url(prov, anio),
        join(CACHE, `anexo28-PR${prov}-${anio}.html`),
        refetch,
        true,
      )
      rec.attempt()
      const a = comprobado(parseAnexoMunicipios(html), prov)
      if (a.anio !== anio) {
        throw new Error(`[bibliotecas] pedí ${anio} para ${prov} y la página dice ${a.anio}`)
      }
      anexos.set(`${prov}-${anio}`, a)
      console.log(`[bibliotecas] ${prov} ${anio}: ${a.filas.length} municipios`)
    }
  }

  const padrones = new Map<string, string>()
  for (const prov of PROVINCIAS) {
    const t = TABLAS_PADRON[prov]
    padrones.set(
      prov,
      await traer(
        `https://www.ine.es/jaxiT3/files/t/es/csv_bd/${t}.csv?nocab=1`,
        join(CACHE, `ine-${t}.csv`),
        refetch,
        false,
      ),
    )
  }
  const poblacion = (ine: string): Map<number, number> => {
    const s = parseInePadron(padrones.get(ine.slice(0, 2)) ?? '', { ineCode: ine })
    return new Map((s?.total ?? []).map((p) => [p.year, p.value]))
  }

  // El propio municipio.
  const propioPob = poblacion(INE_PROPIO)
  const padronRepo = JSON.parse(await readFile(join(ROOT, 'public/data/padron.json'), 'utf8'))
  for (const p of padronRepo.series.total as { year: number; value: number }[]) {
    if (anios.includes(p.year) && propioPob.get(p.year) !== p.value) {
      throw new Error(
        `[bibliotecas] el padrón ${p.year} de la tabla del INE (${propioPob.get(p.year)}) no es ` +
          `el de padron.json (${p.value}) — dos fuentes de población no se mezclan`,
      )
    }
  }
  const nombrePropio = 'Riba-roja de Túria'
  const serie: PuntoBiblioteca[] = anios.map((anio) => {
    const fila = resolverMunicipio(anexos.get(`46-${anio}`)!.filas, nombrePropio)
    if (!fila) throw new Error(`[bibliotecas] ${nombrePropio} no está en el anexo de ${anio}`)
    const pob = propioPob.get(anio) ?? null
    const { municipio: _m, ...cifras } = fila
    return { anio, ...cifras, poblacion: pob, ...tasasDe(cifras, pob) }
  })

  // La banda, sin el propio.
  const cesel = JSON.parse(await readFile(join(ROOT, 'public/data/coste-efectivo.json'), 'utf8'))
  const conjunto: string = cesel.pares?.conjunto ?? 'cv-15k-40k'
  const miembros: { ine: string; nombre: string }[] = (cesel.pares?.miembros ?? []).filter(
    (m: { ine: string }) => m.ine !== INE_PROPIO,
  )
  if (miembros.length < 15) throw new Error(`[bibliotecas] banda de ${miembros.length} miembros`)
  const filas: FilaPar[] = []
  for (const m of miembros) {
    const pob = poblacion(m.ine)
    for (const anio of anios) {
      const a = anexos.get(`${m.ine.slice(0, 2)}-${anio}`)
      const fila = a ? resolverMunicipio(a.filas, m.nombre) : null
      const p = pob.get(anio) ?? null
      const cifras = {
        visitas: fila?.visitas ?? null,
        usuariosInscritos: fila?.usuariosInscritos ?? null,
        nuevosUsuarios: fila?.nuevosUsuarios ?? null,
        prestatariosActivos: fila?.prestatariosActivos ?? null,
      }
      filas.push({
        ine: m.ine,
        nombre: m.nombre,
        anio,
        nombreFuente: fila?.municipio ?? null,
        prestatariosActivos: cifras.prestatariosActivos,
        visitas: cifras.visitas,
        poblacion: p,
        ...tasasDe(cifras, p),
      })
    }
  }

  const grupos = Object.fromEntries(
    TASAS.map((t) => [t, grupoDe(filas, serie, t, conjunto)]),
  ) as BibliotecasSnapshot['pares']['grupos']

  const salida: BibliotecasSnapshot & { stats: Record<string, unknown> } = {
    generatedAt: new Date().toISOString(),
    fuente: {
      nombre: 'Estadística de Bibliotecas Públicas — Ministerio de Cultura (anexo 28)',
      url: url('46', anios.at(-1)!),
      atribucion: 'Origen de los datos: Ministerio de Cultura',
      licencia:
        'Reutilización según las condiciones generales del RD 1495/2011 (aviso legal del ' +
        'Ministerio de Cultura; datos.gob.es/avisolegal)',
    },
    municipio: { ine: INE_PROPIO, nombre: nombrePropio, serie },
    pares: { conjunto, miembros: miembros.length, filas, grupos },
    stats: {
      anios,
      paginas: anexos.size,
      paresSinFila: [...new Set(filas.filter((f) => !f.nombreFuente).map((f) => f.nombre))],
      paresConDatoUltimo: Object.fromEntries(TASAS.map((t) => [t, grupos[t].ultimo?.n ?? 0])),
      panelFijo: Object.fromEntries(TASAS.map((t) => [t, grupos[t].serie?.[0].n ?? 0])),
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(salida, null, 2) + '\n')
  rec.finish()
  const u = serie.at(-1)!
  console.log(
    `[bibliotecas] ${nombrePropio} ${u.anio}: ${u.prestatariosPorMil?.toFixed(1)} prestatarios ` +
      `por 1.000 hab. (p${grupos.prestatariosPorMil.ultimo?.percentil ?? '—'}, ` +
      `n=${grupos.prestatariosPorMil.ultimo?.n ?? 0}) · ${u.visitasPorHabitante?.toFixed(2)} ` +
      `visitas/hab. (p${grupos.visitasPorHabitante.ultimo?.percentil ?? '—'})`,
  )
  console.log(`[bibliotecas] → ${OUT}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
