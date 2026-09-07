/**
 * `journalist:entorno` — el entorno societario de un cargo, del expediente a
 * la persona.
 *
 *   npm run journalist:entorno -- --slug <slug de officials.json>
 *       [--llaves editorial/investigaciones/<slug>/llaves.json]
 *       [--out editorial/investigaciones/<slug>/entorno.json] [--borme-dir .cache/borme]
 *
 * Parte de lo que ya es público por ser del Ayuntamiento —adjudicatarios de
 * `tenders.json`, beneficiarios de `bdns.json` cuando el snapshot los trae,
 * personas nombradas en los edictos de `bop.json`—, resuelve quién administra
 * cada sociedad en la caché anual del BORME (`npm run scrape:borme`, barrido
 * central) y sólo entonces cruza esas personas con el cargo, con sus
 * familiares DOCUMENTADOS (`--llaves`: nombre, parentesco y el documento que
 * lo prueba) y con sus dos apellidos. Además lista las abstenciones con motivo
 * («interés directo», «parentesco») de las transcripciones de pleno, que son
 * candidatas a llave oficial en el acta.
 *
 * Lo que sale es un fichero PRIVADO bajo `editorial/` (se niega a escribir en
 * `public/`): tres niveles —propio, llave documentada, pista de apellidos— y un
 * recuento con lo que sólo se cuenta y no se nombra. Nada de esto se publica
 * sin las dos llaves de `references/limites.md`.
 *
 * Cada fuente acaba en found / empty / failed con motivo (regla 2 de
 * docs/DATA_INTEGRITY.md): una caché del BORME ausente es un fallo, no «no
 * había sociedades».
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import {
  acumularBorme,
  cerrarEntorno,
  contrapartesDe,
  crearAcumulador,
  estadoFuente,
  type AnuncioEntorno,
  type BdnsEntorno,
  type BopEntorno,
  type Concejal,
  type EstadoFuente,
  type Llave,
  type TenderEntorno,
} from '../src/scraper/journalist-entorno'
import { NO_LLM_STATS, startRun } from '../src/scraper/run-manifest'

interface CliOpts {
  slug: string
  llaves?: string
  out?: string
  bormeDir: string
}

function usage(): never {
  process.stderr.write(
    'Uso:\n' +
      '  npm run journalist:entorno -- --slug <slug> [--llaves <ruta.json>] [--out <ruta.json>] [--borme-dir .cache/borme]\n',
  )
  process.exit(2)
}

function parseArgs(argv: string[]): CliOpts {
  const o: CliOpts = { slug: '', bormeDir: '.cache/borme' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--slug') o.slug = argv[++i] ?? ''
    else if (a === '--llaves') o.llaves = argv[++i]
    else if (a === '--out') o.out = argv[++i]
    else if (a === '--borme-dir') o.bormeDir = argv[++i] ?? o.bormeDir
    else if (a === '-h' || a === '--help') usage()
    else {
      process.stderr.write(`[journalist:entorno] flag desconocido ${a}\n`)
      process.exit(2)
    }
  }
  if (!o.slug.trim()) usage()
  return o
}

function leerJson<T>(path: string): T | null {
  const p = resolve(path)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

function concejalDe(slug: string): Concejal | null {
  const snap = leerJson<{
    officials?: Array<{ slug: string; name: string; role?: string }>
    formerOfficials?: Array<{ slug: string; name: string; role?: string }>
  }>('public/data/officials.json')
  if (!snap) return null
  const row = [...(snap.officials ?? []), ...(snap.formerOfficials ?? [])].find(
    (o) => o.slug === slug,
  )
  return row ? { slug: row.slug, nombre: row.name, ...(row.role ? { rol: row.role } : {}) } : null
}

/** Las llaves las escribe una persona: cada una con nombre, parentesco y documento fechado. */
export function parseLlaves(json: string): Llave[] {
  const raw = JSON.parse(json) as unknown
  if (!Array.isArray(raw)) throw new Error('llaves: se esperaba una lista')
  return raw.map((r, i) => {
    const o = r as Record<string, unknown>
    const doc = o.documento as Record<string, unknown> | undefined
    if (typeof o.nombre !== 'string' || o.nombre.trim().split(/\s+/).length < 2)
      throw new Error(`llaves[${i}].nombre: nombre y apellidos`)
    if (typeof o.parentesco !== 'string' || !o.parentesco.trim())
      throw new Error(`llaves[${i}].parentesco requerido`)
    if (
      !doc ||
      typeof doc.titulo !== 'string' ||
      typeof doc.fecha !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(doc.fecha)
    )
      throw new Error(
        `llaves[${i}].documento: titulo y fecha (YYYY-MM-DD) requeridos — sin documento no hay llave`,
      )
    return {
      nombre: o.nombre.trim(),
      parentesco: o.parentesco.trim(),
      documento: {
        titulo: doc.titulo,
        fecha: doc.fecha,
        ...(typeof doc.url === 'string' ? { url: doc.url } : {}),
        ...(typeof doc.extracto === 'string' ? { extracto: doc.extracto } : {}),
      },
    }
  })
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const out = resolve(opts.out ?? `editorial/investigaciones/${opts.slug}/entorno.json`)
  const publicDir = resolve('public') + sep
  if (out.startsWith(publicDir)) {
    process.stderr.write(
      '[journalist:entorno] REFUSE: la salida no puede ir bajo public/ — todo lo que hay ahí se publica\n',
    )
    process.exit(2)
  }
  const concejal = concejalDe(opts.slug)
  if (!concejal) {
    process.stderr.write(`[journalist:entorno] slug ${opts.slug} no está en officials.json\n`)
    process.exit(2)
  }

  const rec = startRun('journalist-entorno', { mode: opts.slug, getStats: () => NO_LLM_STATS })
  const fuentes: Record<string, EstadoFuente> = {}

  const tendersSnap = leerJson<{ contracts?: TenderEntorno[] }>('public/data/tenders.json')
  const tenders = tendersSnap?.contracts ?? null
  fuentes.tenders = estadoFuente(
    tenders ? tenders.filter((t) => t.assignee).length : null,
    'public/data/tenders.json ausente',
  )

  const bdnsSnap = leerJson<{ items?: BdnsEntorno[] }>('public/data/bdns.json')
  const bdns = bdnsSnap?.items ?? null
  const bdnsConBeneficiario = bdns
    ? bdns.filter((b) => b.beneficiary ?? b.beneficiario).length
    : null
  fuentes.bdns =
    bdns && bdnsConBeneficiario === 0
      ? {
          estado: 'empty',
          n: 0,
          motivo:
            'el snapshot trae convocatorias, no beneficiarios (BDNS por beneficiario: sólo en la web)',
        }
      : estadoFuente(bdnsConBeneficiario, 'public/data/bdns.json ausente')

  const bopSnap = leerJson<{ anuncios?: BopEntorno[] }>('public/data/bop.json')
  const bop = bopSnap?.anuncios ?? null
  fuentes.bop = estadoFuente(bop ? bop.length : null, 'public/data/bop.json ausente')
  if (bop) fuentes.bop.motivo = 'ventana rodante de 30 días: los edictos antiguos no están aquí'

  let llaves: Llave[] = []
  if (opts.llaves) {
    const raw = existsSync(resolve(opts.llaves)) ? readFileSync(resolve(opts.llaves), 'utf8') : null
    if (raw === null) fuentes.llaves = estadoFuente(null, `${opts.llaves} ausente`)
    else {
      llaves = parseLlaves(raw)
      fuentes.llaves = estadoFuente(llaves.length)
    }
  } else {
    fuentes.llaves = {
      estado: 'empty',
      n: 0,
      motivo: 'no se pasó --llaves: sin familiares documentados que cruzar',
    }
  }

  const contrapartes = contrapartesDe({ tenders: tenders ?? [], bdns: bdns ?? [], bop: bop ?? [] })
  const acc = crearAcumulador(concejal, contrapartes, llaves)

  const bormeDir = resolve(opts.bormeDir)
  const ficheros = existsSync(bormeDir)
    ? readdirSync(bormeDir)
        .filter((f) => /^borme-.*\.json$/.test(f))
        .sort()
    : []
  let anunciosLeidos = 0
  const fallosBorme: string[] = []
  for (const f of ficheros) {
    try {
      const snap = JSON.parse(readFileSync(resolve(bormeDir, f), 'utf8')) as {
        hallazgos?: AnuncioEntorno[]
      }
      const anuncios = snap.hallazgos ?? []
      anunciosLeidos += anuncios.length
      acumularBorme(acc, anuncios)
    } catch (e) {
      fallosBorme.push(`${f}: ${(e as Error).message}`)
    }
  }
  fuentes.borme =
    ficheros.length === 0
      ? estadoFuente(
          null,
          `caché ausente en ${bormeDir} (npm run scrape:borme -- --desde 2009-01-02 --hasta <hoy> --provincia VALENCIA)`,
        )
      : estadoFuente(anunciosLeidos)
  if (fallosBorme.length > 0) fuentes.borme.motivo = `ficheros ilegibles: ${fallosBorme.join('; ')}`
  fuentes.borme.motivo = `${fuentes.borme.motivo ? fuentes.borme.motivo + ' · ' : ''}${ficheros.length} fichero(s) anual(es)`

  const transcriptsDir = resolve('public/data/pleno-transcripts')
  const transcripts: Record<string, string> = {}
  if (existsSync(transcriptsDir)) {
    for (const f of readdirSync(transcriptsDir)) {
      if (!f.endsWith('.txt')) continue
      transcripts[f.replace(/\.txt$/, '')] = readFileSync(resolve(transcriptsDir, f), 'utf8')
    }
  }
  fuentes.transcripts = estadoFuente(
    existsSync(transcriptsDir) ? Object.keys(transcripts).length : null,
    'public/data/pleno-transcripts ausente',
  )
  const plenos =
    leerJson<{ items?: Array<{ id: string; date?: string | null }> }>('public/data/plenos.json')
      ?.items ?? []

  const entorno = cerrarEntorno(acc, { transcripts, plenos })

  for (const [clave, f] of Object.entries(fuentes)) {
    rec.attempt(1)
    if (f.estado === 'failed') rec.skip(`fallo:${clave}`, 1)
    else rec.judge(1)
    rec.record(f.estado, 1)
  }

  const salida = {
    slug: concejal.slug,
    nombre: concejal.nombre,
    generadoEn: new Date().toISOString(),
    aviso:
      'PRIVADO. Del expediente a la persona: aquí sólo hay nombres de quien ya consta en un expediente municipal. Una pista de apellidos no es un parentesco; una llave sin nexo con el cargo no se publica. Ver .claude/skills/investigar-cargo/references/limites.md.',
    fuentes,
    ...entorno,
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(salida, null, 2) + '\n')

  const r = entorno.recuento
  process.stdout.write(
    `[journalist:entorno] ${concejal.nombre} · contrapartes ${r.contrapartes} (${r.empresasResueltasEnBorme} resueltas en el BORME, ${anunciosLeidos} anuncios leídos) · ` +
      `propio ${r.propio} · llave documentada ${r.llaveDocumentada} · pista de apellidos ${r.pistaApellidos} · ` +
      `contrapartes con sus apellidos ${r.contrapartesConApellidos} · abstenciones con motivo ${r.abstenciones} · ` +
      `sólo contados: un apellido ${r.ruidoUnApellido}, dos apellidos fuera de expedientes ${r.fueraDeExpedientes}\n`,
  )
  for (const [clave, f] of Object.entries(fuentes)) {
    process.stdout.write(`  · ${clave}: ${f.estado} (${f.n})${f.motivo ? ` — ${f.motivo}` : ''}\n`)
  }
  process.stdout.write(`[journalist:entorno] → ${out}\n`)
  rec.finish({ exitCode: 0 })
}

// Guarded so `parseLlaves` can be unit-tested without the CLI reading disk on import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`[journalist:entorno] ${(err as Error).message}\n`)
    process.exit(1)
  })
}
