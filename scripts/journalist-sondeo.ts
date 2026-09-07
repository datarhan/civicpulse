/**
 * `journalist:sondeo` — una sola puerta sobre los lectores que ya tiene el
 * repositorio, para preguntar por una persona sin inventarse descargas.
 *
 *   npm run journalist:sondeo -- --nombre "<nombre completo>" [--slug <slug de officials.json>]
 *       [--anios 2019,2023] [--semantico] [--out <ruta>]
 *
 * Lo usa la habilidad investigar-cargo (y los subagentes que la ejecutan):
 * BOE, DOGV, Dialnet y hemeroteca (gazette.ts), prensa, plenos y snapshots
 * locales (local.ts), la ficha de officials.json y un barrido nominal de la
 * contratación municipal (tenders.json, campo `assignee`). Imprime JSON y deja
 * un manifiesto de ejecución.
 *
 * Lo que fija el diseño es la contabilidad, no la búsqueda: cada fuente acaba
 * en hallado / vacío / fallo con su motivo, un lector que lanza no tumba a los
 * demás, y una fuente que NO se pidió (la semántica cuesta un backend de
 * embeddings) consta como no solicitada con una clave propia, para que nunca
 * se lea como «buscó y no encontró». Regla 2 de docs/DATA_INTEGRITY.md.
 *
 * Los lectores van en serie, por cortesía con los servidores de los boletines.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  leerBoe,
  leerDialnet,
  leerDogv,
  leerHemeroteca,
} from '../src/scraper/journalist-tools/gazette'
import {
  fetchOfficialBySlug,
  fetchPlenoClaimsForSubject,
  fetchPressForSubject,
  searchLocalSnapshots,
  semanticLocalHits,
} from '../src/scraper/journalist-tools/local'
import { NO_LLM_STATS, startRun } from '../src/scraper/run-manifest'

export interface FuenteSondeo {
  estado: 'hallado' | 'vacio' | 'fallo'
  n: number
  motivo?: string
  resultados: unknown[]
}

export interface TenderRow {
  id: string
  title: string
  assignee: string | null
}

export interface SondeoDeps {
  boe: (nombre: string) => Promise<unknown[]>
  dogv: (nombre: string) => Promise<unknown[]>
  dialnet: (nombre: string) => Promise<unknown[]>
  hemeroteca: (nombre: string, anio: number) => Promise<unknown[]>
  prensa: (nombre: string) => unknown[]
  plenoClaims: (nombre: string) => unknown[]
  snapshots: (nombre: string) => unknown[]
  semantico: (nombre: string) => Promise<unknown[]>
  official: (slug: string | undefined) => unknown | null
  tenders: TenderRow[]
}

export interface SondeoOpts {
  nombre: string
  slug?: string
  anios: number[]
  semantico: boolean
}

export interface Sondeo {
  nombre: string
  slug?: string
  generadoEn: string
  fuentes: Record<string, FuenteSondeo>
}

const plegar = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

/**
 * Contratos cuyo adjudicatario nombra los DOS apellidos como palabras enteras.
 * Los apellidos son los dos últimos tokens del nombre; con uno solo no se
 * barre nada — «Raga» a secas casa con media guía telefónica y con FRAGA no
 * (palabra entera), pero un apellido suelto no identifica a nadie.
 */
export function barridoNominal(tenders: readonly TenderRow[], nombre: string): TenderRow[] {
  const tokens = plegar(nombre).split(' ').filter(Boolean)
  if (tokens.length < 2) return []
  const apellidos = tokens.slice(-2)
  const patrones = apellidos.map(
    (t) => new RegExp(`(^|[^A-Z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^A-Z0-9])`),
  )
  return tenders.filter((t) => {
    if (!t.assignee) return false
    const a = plegar(t.assignee)
    return patrones.every((rx) => rx.test(a))
  })
}

async function medir(fn: () => Promise<unknown[]> | unknown[]): Promise<FuenteSondeo> {
  try {
    const resultados = await fn()
    const lista = Array.isArray(resultados) ? resultados : []
    return { estado: lista.length > 0 ? 'hallado' : 'vacio', n: lista.length, resultados: lista }
  } catch (err) {
    return { estado: 'fallo', n: 0, motivo: (err as Error).message, resultados: [] }
  }
}

export async function ejecutarSondeo(opts: SondeoOpts, deps: SondeoDeps): Promise<Sondeo> {
  const { nombre } = opts
  const fuentes: Record<string, FuenteSondeo> = {}
  fuentes.oficial = await medir(() => {
    const row = deps.official(opts.slug)
    return row ? [row] : []
  })
  fuentes.snapshots = await medir(() => deps.snapshots(nombre))
  fuentes.prensa = await medir(() => deps.prensa(nombre))
  fuentes.plenoClaims = await medir(() => deps.plenoClaims(nombre))
  fuentes.contratacion = await medir(() => barridoNominal(deps.tenders, nombre).slice(0, 10))
  fuentes.boe = await medir(() => deps.boe(nombre))
  fuentes.dogv = await medir(() => deps.dogv(nombre))
  fuentes.dialnet = await medir(() => deps.dialnet(nombre))
  for (const anio of opts.anios) {
    fuentes[`hemeroteca-${anio}`] = await medir(() => deps.hemeroteca(nombre, anio))
  }
  if (opts.semantico) {
    fuentes.semantico = await medir(() => deps.semantico(nombre))
  } else {
    fuentes['semantico-no-solicitado'] = {
      estado: 'vacio',
      n: 0,
      motivo:
        'no solicitado (--semantico): la recuperación semántica necesita un backend de embeddings',
      resultados: [],
    }
  }
  return {
    nombre,
    ...(opts.slug ? { slug: opts.slug } : {}),
    generadoEn: new Date().toISOString(),
    fuentes,
  }
}

function usage(): never {
  process.stderr.write(
    'Uso:\n' +
      '  npm run journalist:sondeo -- --nombre "<nombre completo>" [--slug <slug>] [--anios 2019,2023] [--semantico] [--out <ruta>]\n',
  )
  process.exit(2)
}

interface CliOpts extends SondeoOpts {
  out?: string
}

function parseArgs(argv: string[]): CliOpts {
  const o: CliOpts = { nombre: '', anios: [2019, 2023], semantico: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--nombre') o.nombre = argv[++i] ?? ''
    else if (a === '--slug') o.slug = argv[++i]
    else if (a === '--anios') {
      const v = argv[++i] ?? ''
      o.anios = v
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n > 1900)
    } else if (a === '--semantico') o.semantico = true
    else if (a === '--out') o.out = argv[++i]
    else if (a === '-h' || a === '--help') usage()
    else {
      process.stderr.write(`[journalist:sondeo] flag desconocido ${a}\n`)
      process.exit(2)
    }
  }
  if (!o.nombre.trim()) usage()
  return o
}

function leerTenders(): TenderRow[] {
  const p = resolve('public/data/tenders.json')
  if (!existsSync(p)) return []
  const raw = JSON.parse(readFileSync(p, 'utf8')) as {
    contracts?: Array<{ id?: unknown; title?: unknown; assignee?: unknown }>
  }
  return (raw.contracts ?? []).map((c) => ({
    id: String(c.id ?? ''),
    title: String(c.title ?? ''),
    assignee: typeof c.assignee === 'string' ? c.assignee : null,
  }))
}

/**
 * Los lectores de verdad. Los de boletín son los `leer*` de gazette.ts, que
 * LANZAN cuando no alcanzan el servidor (red, 5xx, el 302 sin cuerpo del
 * DOGV) — no los `fetch*` del agente, que degradan a `[]` y aquí se leerían
 * como «vacío». A cambio el sondeo no pasa por la caché de investigación:
 * es una herramienta manual y cada consulta pregunta de verdad.
 */
export function lectoresReales(
  opts: { fetchImpl?: typeof fetch; tenders?: TenderRow[] } = {},
): SondeoDeps {
  const f = opts.fetchImpl ?? fetch
  return {
    boe: (n) => leerBoe(n, 8, f),
    dogv: (n) => leerDogv(n, 8, f),
    dialnet: (n) => leerDialnet(n, 8, f),
    hemeroteca: (n, y) => leerHemeroteca(n, y, f),
    prensa: (n) => fetchPressForSubject(n, 30),
    plenoClaims: (n) => fetchPlenoClaimsForSubject(n, 20),
    snapshots: (n) => searchLocalSnapshots(n),
    semantico: (n) => semanticLocalHits(n, { topK: 8 }),
    official: (slug) => (slug ? fetchOfficialBySlug(slug) : null),
    tenders: opts.tenders ?? leerTenders(),
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const rec = startRun('journalist-sondeo', {
    mode: opts.slug ?? opts.nombre,
    getStats: () => NO_LLM_STATS,
  })
  const sondeo = await ejecutarSondeo(opts, lectoresReales())
  for (const [clave, f] of Object.entries(sondeo.fuentes)) {
    if (clave === 'semantico-no-solicitado') {
      rec.neverAttempt(1)
      continue
    }
    rec.attempt(1)
    if (f.estado === 'fallo') rec.skip(`fallo:${clave}`, 1)
    else rec.judge(1)
    rec.record(f.estado, 1)
  }
  const json = JSON.stringify(sondeo, null, 2)
  if (opts.out) {
    const p = resolve(opts.out)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, json + '\n')
    process.stderr.write(`[journalist:sondeo] → ${p}\n`)
  }
  process.stdout.write(json + '\n')
  rec.finish({ exitCode: 0 })
}

// Guarded so `ejecutarSondeo` / `barridoNominal` can be unit-tested without
// the CLI touching the network on import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`[journalist:sondeo] ${(err as Error).message}\n`)
    process.exit(1)
  })
}
