import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * What has to be true for a twenty-night unattended sweep to be worth starting.
 *
 * `extract:speaker-map` is the one pass here that runs for weeks against a
 * backlog nobody watches, and on 2026-08-13 and again on 2026-08-14 it died on
 * its `yt-dlp` download and reported:
 *
 *     ✓ extract-speaker-map · gemini-api/gemini-3.5-flash
 *       attempted 0 · judged 0 · never-attempted 0 · 0 calls · $0.0000
 *
 * A tick, twice, over a pass that never reached the work, while 21 sessions
 * waited. Three separate defects had to line up:
 *
 *   1. the `finally` that writes the manifest runs BEFORE `main().catch()`
 *      calls `process.exit(1)`, so a crashed run recorded `exitCode: 0`;
 *   2. `--quiet --no-warnings` meant the log kept «Command failed: yt-dlp …»
 *      and nothing else, so the cause was unrecoverable after the fact;
 *   3. one failed download ended the night, with no retry.
 *
 * These are end-to-end on purpose. Every one of them lives in the seam between
 * the script's exit path and the manifest writer, which is exactly the seam a
 * unit test of either half cannot see.
 *
 * `RUN_MANIFEST_DIR` points every run below at a disposable directory:
 * `.run-manifests/` is `check:runs`'s whole input, and a test that writes a
 * genuinely-failed manifest there would put a real red in the health digest.
 */

const SCRIPT = resolve('scripts/extract-speaker-map.ts')
/** Has a video in pleno-videos.json, so the URL resolves without network. */
const PLENO = '15uvjew'

let sandbox: string
let manifests: string
let binDir: string
let callLog: string

/**
 * A `yt-dlp` that always fails, printing something we can look for — and that
 * HONOURS `--quiet` / `--no-warnings` by going silent, exactly as the real one
 * does.
 *
 * That last part is the whole test. The first version of this stub ignored its
 * flags and printed regardless, so putting `--quiet --no-warnings` back into
 * the script left all eight assertions green: the suite proved stderr could
 * reach the log and proved nothing about whether anything would be on it. A
 * fault injection that survives the fault is not a guard.
 */
const YT_DLP_FAILS = `#!/bin/sh
echo "$@" >> "$CALL_LOG"
quiet=""
for a in "$@"; do
  case "$a" in --quiet|--no-warnings) quiet=1;; esac
done
[ -z "$quiet" ] && echo "ERROR: [youtube] nZK1v9ZnKDc: Sign in to confirm you are not a bot" >&2
exit 1
`

/** A `yt-dlp` that succeeds, writing to the --output path it was handed. */
const YT_DLP_WORKS = `#!/bin/sh
echo "$@" >> "$CALL_LOG"
out=""
while [ $# -gt 0 ]; do
  case "$1" in --output) shift; out="$1";; esac
  shift
done
dest="$(echo "$out" | sed 's/%(ext)s/mp3/')"
# Big enough to clear MIN_CACHED_AUDIO_BYTES — the reuse check is a size check,
# and a file below it is treated as a truncation and fetched again, which is the
# behaviour we want everywhere EXCEPT in this stub.
head -c 4096 /dev/zero | tr '\\0' 'x' > "$dest"
exit 0
`

function installFakeYtDlp(body: string) {
  const p = join(binDir, 'yt-dlp')
  writeFileSync(p, body, { mode: 0o755 })
}

/**
 * Cada prueba de este fichero arranca el guion DE VERDAD con `npx tsx`, que
 * compila TypeScript y levanta un node por llamada: ~2,7 s medidos en el
 * runner. El presupuesto POR DEFECTO de vitest son 5 s, así que la única
 * prueba que hace DOS arranques vivía con un margen de 2,3 s sobre el reloj.
 *
 * El 8-09-2026 se lo comió: «Test timed out in 5000ms» tras 5.463 ms, con las
 * otras 5.895 pruebas en verde. No es un fallo del código que vigila —en local
 * el fichero entero pasa en 2,68 s—, es un presupuesto mal puesto, y el precio
 * lo paga la portada: la puerta de salud mira `npm test`, un rojo bloquea el
 * despliegue, y el pueblo se queda con los datos de anteayer por un reloj.
 *
 * El `spawnSync` de abajo ya se daba 120 s. Que el reloj de FUERA fuera 24
 * veces más corto que el de dentro era la incoherencia: el tope interno no se
 * podía alcanzar nunca.
 */
vi.setConfig({ testTimeout: 60_000 })

function run(args: string[], extraEnv: Record<string, string> = {}) {
  return spawnSync('npx', ['tsx', SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      CALL_LOG: callLog,
      GEMINI_API_KEY: 'not-a-real-key-and-never-used',
      RUN_MANIFEST_DIR: manifests,
      // Fault injection only. The real backoff is measured in tens of seconds;
      // a test that waited it out would be a test nobody runs.
      SPEAKER_MAP_DOWNLOAD_RETRY_MS: '1',
      ...extraEnv,
    },
    timeout: 120_000,
  })
}

function newestManifest() {
  const files = readdirSync(manifests)
    .filter((f) => f.endsWith('.json'))
    .sort()
  expect(files.length, 'the run wrote no manifest at all').toBeGreaterThan(0)
  return JSON.parse(readFileSync(join(manifests, files[files.length - 1]), 'utf8'))
}

const ytDlpCalls = () => {
  try {
    return readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'speaker-map-survives-'))
  manifests = join(sandbox, 'manifests')
  binDir = join(sandbox, 'bin')
  callLog = join(sandbox, 'yt-dlp-calls.log')
  mkdirSync(manifests, { recursive: true })
  mkdirSync(binDir, { recursive: true })
})

afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

describe('a run that dies before reaching the work', () => {
  let res: ReturnType<typeof run>
  let m: ReturnType<typeof newestManifest>

  beforeAll(() => {
    // Missing audio: throws inside `main` before a single byte of network.
    res = run([PLENO, '--audio', join(sandbox, 'no-existe.mp3')])
    m = newestManifest()
  })

  it('exits non-zero', () => {
    expect(res.status).toBe(1)
  })

  it('does NOT record itself as a clean exit', () => {
    // The defect verbatim: `finally` read `process.exitCode` before the outer
    // `.catch()` had set it, so the manifest of a crash said 0.
    expect(m.exitCode, 'a crashed run wrote exitCode 0').toBe(1)
  })

  it('names what went wrong in the manifest, not just in the log', () => {
    const reasons = Object.keys(m.skipped ?? {})
    expect(reasons, 'the crash left no named cause behind').not.toEqual([])
    expect(reasons.join(' ')).toMatch(/audio|download|setup/i)
  })

  it('says how much work was owed, so "attempted 0" can be judged', () => {
    expect(typeof m.owed, 'no backlog recorded').toBe('number')
    expect(m.owed).toBeGreaterThan(0)
    expect(m.attempted).toBe(0)
  })
})

describe('a download that fails', () => {
  let res: ReturnType<typeof run>
  let m: ReturnType<typeof newestManifest>

  beforeAll(() => {
    rmSync(callLog, { force: true })
    installFakeYtDlp(YT_DLP_FAILS)
    res = run([PLENO])
    m = newestManifest()
  })

  it('says WHY, in words yt-dlp actually printed', () => {
    // `--quiet --no-warnings` is why two dead nights are undiagnosable today.
    const out = `${res.stdout}${res.stderr}`
    expect(out, 'yt-dlp stderr never reached the log').toContain(
      'Sign in to confirm you are not a bot',
    )
  })

  it('tries more than once before giving up on the night', () => {
    expect(ytDlpCalls(), 'one failure ended the run').toBeGreaterThan(1)
  })

  it('records the failure as a named cause and a dirty exit', () => {
    expect(m.exitCode).toBe(1)
    expect(Object.keys(m.skipped ?? {}).join(' ')).toMatch(/download/i)
  })
})

describe('the audio cache', () => {
  it('downloads once and reuses it on the next run', () => {
    rmSync(callLog, { force: true })
    installFakeYtDlp(YT_DLP_WORKS)
    const cache = join(sandbox, 'audio-cache')

    // Both runs die the same way afterwards — the stub mp3 has no chunks to
    // read — which is fine: what is under test is the download, and the second
    // run must not repeat it.
    run([PLENO], { SPEAKER_MAP_AUDIO_CACHE: cache })
    const first = ytDlpCalls()
    expect(first, 'the first run never downloaded anything').toBeGreaterThan(0)

    run([PLENO], { SPEAKER_MAP_AUDIO_CACHE: cache })
    expect(ytDlpCalls(), 'the second run downloaded the session again').toBe(first)
  })
})
