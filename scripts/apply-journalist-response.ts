/**
 * Curator CLI — apply a right-of-reply to a published journalist report.
 *
 *   npm run journalist-reply -- <reportId> <FROM> "<verbatim ≥20 chars>" [sourceUrl] [YYYY-MM-DD]
 *                               [--nombre "<quién firma>"]
 *
 * FROM es un valor de RESPONSE_BLOCS (src/scraper/journalist/types.ts):
 *
 *   - un grupo municipal (PSOE, PP, VOX, Compromís, Ciudadanos, EU-Podem);
 *   - `person`: la persona de la que trata el informe, y SÓLO ella. La página y
 *     el alma la publican con el nombre del sujeto del encargo, así que la
 *     réplica de cualquier otra persona puesta aquí saldría con el nombre
 *     equivocado;
 *   - `aludido`: una institución u otra persona que el informe nombra —el
 *     alcalde replicando a la biografía de un concejal, el ayuntamiento, una
 *     empresa—, con `--nombre`, que es lo que se publica en «Réplica de …».
 *
 * Mirrors apply-finding-response.ts. The GitHub workflow at
 * .github/workflows/ingest-journalist-responses.yml calls this CLI after a
 * maintainer approves the issue with the `publicar` label.
 *
 * Re-validates the whole reports snapshot before writing.
 */
import { existsSync, readFileSync } from 'node:fs'
import { rewriteJsonIfPresent, writeSnapshot } from './lib/snapshot-io'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  RESPONSE_BLOCS,
  validateReportsSnapshot,
  type JournalistReport,
  type JournalistReportResponse,
  type JournalistReportsSnapshot,
} from '../src/scraper/journalist'

const REPORTS = resolve('public/data/journalist-reports.json')
const CHUNK_DIR = resolve('public/data/journalist-reports')

// El enum del validador, importado. Aquí había una copia a mano que se quedó
// sin EU-Podem: el validador del informe publicado lo admitía y este CLI lo
// rechazaba antes de llegar a él, así que ese grupo no podía replicar.
const ALLOWED_FROM: readonly string[] = RESPONSE_BLOCS

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run journalist-reply -- <reportId> <FROM> "<verbatim ≥20 chars>" [sourceUrl] [YYYY-MM-DD] [--nombre "<quién firma>"]\n' +
      '\n' +
      `FROM ∈ ${ALLOWED_FROM.join(' | ')}\n`,
  )
  process.exit(2)
}

interface Opts {
  reportId: string
  from: string
  fromName?: string
  quote: string
  sourceUrl?: string
  respondedAt: string
}

/**
 * Los argumentos, o un Error con el motivo. Exportado para las pruebas: el
 * `main()` de abajo sólo corre cuando se lanza el script.
 */
export function parseArgs(argv: string[]): Opts {
  let fromName: string | undefined
  const args: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') usage()
    else if (a === '--nombre') fromName = (argv[++i] ?? '').trim()
    else args.push(a)
  }
  if (args.length < 3) usage()
  const [reportId, from, quote, ...rest] = args
  let sourceUrl: string | undefined
  let respondedAt = new Date().toISOString().slice(0, 10)
  for (const r of rest) {
    if (/^https?:\/\//.test(r)) sourceUrl = r
    else if (/^\d{4}-\d{2}-\d{2}$/.test(r)) respondedAt = r
    else throw new Error(`cannot interpret extra arg "${r}" (expected URL or YYYY-MM-DD)`)
  }
  if (!ALLOWED_FROM.includes(from)) {
    throw new Error(`FROM must be one of ${ALLOWED_FROM.join('|')}`)
  }
  if (quote.trim().length < 20) throw new Error('quote must be verbatim ≥20 chars')
  // Un `aludido` se publica con el nombre con el que firma; un nombre en otra
  // réplica se perdería en silencio. El validador lo exige igual; aquí se dice
  // antes de tocar el fichero.
  if (from === 'aludido' && !(fromName && fromName.length >= 3)) {
    throw new Error('FROM «aludido» needs --nombre "<quién firma>" (≥3 chars)')
  }
  if (from !== 'aludido' && fromName !== undefined) {
    throw new Error('--nombre only goes with FROM «aludido»')
  }
  return {
    reportId,
    from,
    ...(from === 'aludido' ? { fromName } : {}),
    quote: quote.trim(),
    ...(sourceUrl ? { sourceUrl } : {}),
    respondedAt,
  }
}

function main(): void {
  let opts: Opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`[journalist-reply] ${(err as Error).message}\n`)
    process.exit(2)
  }
  if (!existsSync(REPORTS)) {
    process.stderr.write(`[journalist-reply] ${REPORTS} missing\n`)
    process.exit(1)
  }
  const snap = validateReportsSnapshot(readFileSync(REPORTS, 'utf8'))
  const idx = snap.items.findIndex((r) => r.id === opts.reportId)
  if (idx < 0) {
    process.stderr.write(`[journalist-reply] report ${opts.reportId} not found\n`)
    process.exit(1)
  }
  const response: JournalistReportResponse = {
    from: opts.from,
    ...(opts.fromName ? { fromName: opts.fromName } : {}),
    quote: opts.quote,
    respondedAt: opts.respondedAt,
    ...(opts.sourceUrl ? { sourceUrl: opts.sourceUrl } : {}),
  }
  const next: JournalistReport = { ...snap.items[idx], response }
  const items = [...snap.items]
  items[idx] = next
  const out: JournalistReportsSnapshot = { ...snap, generatedAt: new Date().toISOString(), items }
  writeSnapshot(REPORTS, out, validateReportsSnapshot)
  rewriteJsonIfPresent(resolve(CHUNK_DIR, `${next.assignmentId}.json`), next)
  process.stdout.write(
    `[journalist-reply] attached response to ${opts.reportId} · from=${opts.from} · respondedAt=${opts.respondedAt}\n`,
  )
}

// Sólo al lanzarlo, no al importarlo (las pruebas importan `parseArgs`). Con
// `pathToFileURL` y no con `file://${argv[1]}`: una ruta con espacios o acentos
// se codifica, y una guarda que no casara dejaría el workflow sin escribir nada
// y cerrando el issue con «Réplica publicada».
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
