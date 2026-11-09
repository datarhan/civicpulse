#!/usr/bin/env tsx
/**
 * Plataforma de Rendición de Cuentas — Riba-roja's Cuenta General, ejercicio
 * by ejercicio: was it rendered, and on which date was each step taken.
 * Parser and the reasoning behind it: src/scraper/rendicion-cuentas.ts.
 *
 * Three kinds of request, all GET except the first:
 *   1. the search (a POST form, no session needed) → the recent ejercicios;
 *   2. the history page → the earlier ones;
 *   3. one page per ejercicio → its dates.
 *
 * The data moves once a year, so step 3 only runs for an ejercicio that is new,
 * whose status changed, or that was last read more than `RELEER_DIAS` ago — so
 * a correction upstream reaches the site within a month and `comprobadoEl`
 * never lags `generatedAt` by more than that. `--completo` re-reads them all.
 * The run prints what it downloaded, what it reused and why.
 *
 * It refuses to write on any failure — a network error, a status or label the
 * parser does not know, a page whose dates table is gone, an ejercicio that the
 * last snapshot had and the platform no longer lists, an entity it does not
 * recognise — so a bad night keeps yesterday's file rather than publishing a
 * partial one.
 *
 * Usage: npm run scrape:rendicion-cuentas [-- --completo]
 */
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseBusqueda,
  parseCuenta,
  parseEjercicios,
  diaEnEspana,
  recuentoRendidas,
  urlCuenta,
  urlEjercicios,
  ID_ENTIDAD_RIBA_ROJA,
  ORIGEN,
  RUTA_CONSULTA,
  type CeldaEjercicio,
  type EstadoCuenta,
  type Fechas,
} from '../src/scraper/rendicion-cuentas'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public/data/rendicion-cuentas.json')

const UA = 'CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)'
const PAUSA_MS = 1_000
const RELEER_DIAS = 30

// Comunitat Valenciana · Valencia · Ayuntamiento, by the form's own option values.
const BUSQUEDA = {
  idComunidadAutonoma: '17',
  idProvincia: '46',
  idTipoEntidad: 'A',
  denominacion: 'Riba-roja',
  submitFormBusquedaGeneral: 'Buscar',
}

interface EjercicioPublicado {
  ejercicio: number
  /** Our word for the status (`ESTADOS_CUENTA`), declared in CAMPOS_TRADUCIDOS. */
  estado: EstadoCuenta
  /** The platform's own word (the icon's alt), which check:vocabulary watches. */
  estadoFuente: string
  url: string
  /** null when the platform offers no page for the ejercicio. */
  fechas: Fechas | null
  /** When that page was last read (YYYY-MM-DD). */
  comprobadoEl: string | null
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function leer(url: string, body?: Record<string, string>): Promise<string> {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      'User-Agent': UA,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
  // The platform serves ISO-8859-1; decoding as UTF-8 would mangle «Túria».
  return Buffer.from(await res.arrayBuffer()).toString('latin1')
}

function anterior(): Map<number, EjercicioPublicado> {
  if (!existsSync(OUT)) return new Map()
  try {
    const prev = JSON.parse(readFileSync(OUT, 'utf8')) as { ejercicios?: EjercicioPublicado[] }
    return new Map((prev.ejercicios ?? []).map((e) => [e.ejercicio, e]))
  } catch {
    return new Map()
  }
}

function fallar(msg: string): never {
  console.error(`[rendicion-cuentas] ${msg} — no se escribe nada`)
  process.exit(1)
}

async function main() {
  const completo = process.argv.includes('--completo')
  const hoy = diaEnEspana(new Date())
  const umbral = diaEnEspana(new Date(Date.now() - RELEER_DIAS * 86_400_000))

  // 1. The search: exactly one entity, ours.
  const busqueda = parseBusqueda(await leer(`${ORIGEN}${RUTA_CONSULTA}index.html`, BUSQUEDA))
  const fila = busqueda.filas.find((f) => f.idEntidad === ID_ENTIDAD_RIBA_ROJA)
  if (busqueda.filas.length !== 1 || !fila) {
    fallar(
      `la búsqueda devolvió ${busqueda.filas.length} fila(s) y ninguna es la entidad ${ID_ENTIDAD_RIBA_ROJA}`,
    )
  }
  if (fila.denominacion !== 'Riba-roja de Túria' || fila.tipo !== 'Ayuntamiento') {
    fallar(`la entidad ${ID_ENTIDAD_RIBA_ROJA} se llama ahora «${fila.tipo} ${fila.denominacion}»`)
  }
  if (fila.ejercicios.length === 0) fallar('la búsqueda no trae ningún ejercicio')

  // 2. The history.
  await dormir(PAUSA_MS)
  const historico = fila.historico
    ? parseEjercicios(await leer(urlEjercicios(ID_ENTIDAD_RIBA_ROJA)))
    : []
  if (fila.historico && historico.length === 0) fallar('el histórico no trae ningún ejercicio')

  const celdas = new Map<number, CeldaEjercicio>()
  for (const c of [...historico, ...fila.ejercicios]) celdas.set(c.ejercicio, c)
  const desconocidas = [...celdas.values()].filter((c) => c.estado === null)
  if (desconocidas.length > 0) {
    fallar(
      `estado desconocido en ${desconocidas.map((c) => `${c.ejercicio} («${c.marca ?? ''}»)`).join(', ')}`,
    )
  }

  // A year the last snapshot had and the platform no longer lists is a changed
  // page (the history link gone, a column moved), not a year that stopped
  // existing: writing would drop it from the site without a word.
  const prev = anterior()
  const desaparecidos = [...prev.keys()].filter((a) => !celdas.has(a))
  if (desaparecidos.length > 0) {
    fallar(`la plataforma ya no lista ${desaparecidos.sort().join(', ')}, que sí estaban`)
  }

  // 3. One page per ejercicio — new, changed or older than RELEER_DIAS, unless --completo.
  const salida: EjercicioPublicado[] = []
  let descargadas = 0
  const reutilizadas: number[] = []
  const sinPagina: number[] = []

  for (const c of [...celdas.values()].sort((a, b) => b.ejercicio - a.ejercicio)) {
    const estado = c.estado as EstadoCuenta
    // Non-null: a cell without a mark has no estado and failed above.
    const estadoFuente = c.marca as string
    const url = urlCuenta(ID_ENTIDAD_RIBA_ROJA, c.ejercicio)
    const antes = prev.get(c.ejercicio)

    if (!c.enlace) {
      sinPagina.push(c.ejercicio)
      salida.push({
        ejercicio: c.ejercicio,
        estado,
        estadoFuente,
        url,
        fechas: null,
        comprobadoEl: null,
      })
      continue
    }
    const reciente = antes?.comprobadoEl != null && antes.comprobadoEl >= umbral
    if (!completo && antes && antes.estado === estado && antes.fechas && reciente) {
      reutilizadas.push(c.ejercicio)
      salida.push({ ...antes, estado, estadoFuente, url })
      continue
    }

    await dormir(PAUSA_MS)
    const cuenta = parseCuenta(await leer(url))
    descargadas++
    if (cuenta.ejercicio !== c.ejercicio) {
      fallar(`la página de ${c.ejercicio} dice ser del ejercicio ${cuenta.ejercicio}`)
    }
    if (cuenta.camposLeidos === 0) {
      fallar(`la página de ${c.ejercicio} no trae la tabla de fechas: ¿cambió la página?`)
    }
    if (cuenta.camposDesconocidos.length > 0) {
      fallar(`etiquetas nuevas en ${c.ejercicio}: ${cuenta.camposDesconocidos.join(' | ')}`)
    }
    if (cuenta.fechasIlegibles.length > 0) {
      fallar(`fechas ilegibles en ${c.ejercicio}: ${cuenta.fechasIlegibles.join(' | ')}`)
    }
    salida.push({
      ejercicio: c.ejercicio,
      estado,
      estadoFuente,
      url,
      fechas: cuenta.fechas,
      comprobadoEl: hoy,
    })
  }

  const anios = salida.map((e) => e.ejercicio)
  const { rendidas, conEstado } = recuentoRendidas(salida.map((e) => e.estado))
  const payload = {
    generatedAt: new Date().toISOString(),
    note: 'Cuenta General del Ayuntamiento de Riba-roja de Túria en la Plataforma de Rendición de Cuentas: estado de cada ejercicio y fecha de cada trámite, tal como los publica la plataforma. Los plazos legales y su contraste se calculan en src/scraper/rendicion-cuentas.ts (PLAZOS, evaluarPlazo).',
    source: {
      platform:
        'Plataforma de Rendición de Cuentas (Tribunal de Cuentas y órganos autonómicos de control externo)',
      portal: ORIGEN,
      consulta: urlEjercicios(ID_ENTIDAD_RIBA_ROJA),
      idEntidad: ID_ENTIDAD_RIBA_ROJA,
    },
    entidad: `${fila.tipo} ${fila.denominacion}`,
    ejercicios: salida,
    stats: {
      ejercicios: salida.length,
      // `rendidas` de `conEstado`: no-aplica y N.D. no dicen nada en ningún
      // sentido y no entran en ninguno de los dos (recuentoRendidas).
      rendidas,
      conEstado,
      conFechas: salida.filter((e) => e.fechas !== null).length,
      desde: Math.min(...anios),
      hasta: Math.max(...anios),
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[rendicion-cuentas] ${salida.length} ejercicios (${payload.stats.desde}–${payload.stats.hasta}), ` +
      `${payload.stats.rendidas} rendidos · páginas descargadas ${descargadas}, ` +
      `reutilizadas ${reutilizadas.length} (mismo estado, leídas hace menos de ${RELEER_DIAS} días), ` +
      `sin página ${sinPagina.length}${sinPagina.length ? ` (${sinPagina.join(', ')})` : ''} → ${OUT}`,
  )
}

main().catch((err) => {
  console.error('[rendicion-cuentas] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
