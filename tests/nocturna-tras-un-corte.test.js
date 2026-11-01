import { describe, it, expect, afterEach } from 'vitest'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'

/**
 * ¿Qué sabe la nocturna de sí misma cuando algo se corta antes de tiempo?
 *
 * Del 29 al 31-10-2026 «Run scraper(s)» agotó sus 30 minutos tres noches
 * seguidas, y el 26-10 fue el `apt` de Playwright el que agotó sus 3. Las cuatro
 * noches `Run tests` quedó `skipped`, porque un paso sin `if:` lleva un
 * `success()` implícito. Una prueba rota por datos pasó así tres días sin aviso
 * (`cambios-contratos.test.jsx`) hasta que la enseñó una PR ajena. #513 corta al
 * adaptador lento, pero no toca esto: un `apt` lento sigue tumbando las pruebas.
 *
 * Y la puerta de salud no ayudaba: sólo rojeaba con `failure`, de modo que unas
 * pruebas `skipped` pasaban por buenas, y su error, el último de la ejecución,
 * decía «la fuente lenta» sin decir cuál.
 *
 * Aquí se ejecutan los guiones de verdad, sacados del YAML, con la misma shell
 * que usa el runner (`bash -e`) y un `npm` falso. Mirar el texto del guion ya ha
 * dado verdes que no medían nada: lo cuenta `tests/prepush-range.test.js`.
 */
const WF = join(__dirname, '..', '.github', 'workflows', 'nightly-scrape.yml')
const pasos = load(readFileSync(WF, 'utf8')).jobs.scrape.steps

const paso = (nombre) => {
  const p = pasos.find((s) => s.name === nombre)
  if (!p) throw new Error(`la nocturna ya no tiene un paso llamado «${nombre}»`)
  return p
}

const temporales = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'nocturna-'))
  temporales.push(d)
  return d
}
afterEach(() => {
  while (temporales.length) rmSync(temporales.pop(), { recursive: true, force: true })
})

/** Un `npm` que apunta sus llamadas y hace lo que le pida el guion de la prueba. */
function npmFalso(dir, cuerpo) {
  const bin = join(dir, 'bin')
  mkdirSync(bin, { recursive: true })
  const ruta = join(bin, 'npm')
  writeFileSync(ruta, `#!/usr/bin/env bash\necho "$*" >> "${dir}/llamadas"\n${cuerpo}\n`)
  chmodSync(ruta, 0o755)
  return bin
}

function correr(nombre, { env = {}, bin, cwd } = {}) {
  const r = spawnSync('bash', ['-e', '-c', paso(nombre).run], {
    encoding: 'utf8',
    cwd,
    timeout: 30_000,
    env: {
      HOME: process.env.HOME,
      PATH: bin ? `${bin}:${process.env.PATH}` : process.env.PATH,
      ...env,
    },
  })
  return { rc: r.status, salida: `${r.stdout}\n${r.stderr}` }
}

describe('lo que viene detrás de un paso que se corta', () => {
  const trasElCorte = [
    'Cache Playwright browsers',
    'Install Playwright Chromium',
    'Install Playwright system deps (cache hit)',
    'Run tests',
  ]

  it.each(trasElCorte)('«%s» corre aunque un paso anterior falle', (nombre) => {
    const condicion = String(paso(nombre).if ?? '')
    expect(
      condicion,
      `sin un estado explícito GitHub añade success(), y «${nombre}» se salta en cuanto algo falla antes: así se quedaron cuatro noches de octubre sin pruebas`,
    ).toMatch(/!\s*cancelled\(\)/)
  })

  // `always()` aquí sería peor que nada: un trabajo cancelado por su tope tiene
  // que llegar al commit, no gastar lo que le queda en 9 minutos de pruebas.
  it.each(trasElCorte)('«%s» no corre en un trabajo cancelado', (nombre) => {
    expect(String(paso(nombre).if ?? '')).not.toMatch(/always\(\)/)
  })

  it('las dos instalaciones conservan su condición de caché', () => {
    expect(String(paso('Install Playwright Chromium').if)).toContain(
      "steps.cache-pw.outputs.cache-hit != 'true'",
    )
    expect(String(paso('Install Playwright system deps (cache hit)').if)).toContain(
      "steps.cache-pw.outputs.cache-hit == 'true'",
    )
  })

  it('las pruebas van detrás del raspado y delante del commit', () => {
    const orden = pasos.map((s) => s.name)
    expect(orden.indexOf('Run tests')).toBeGreaterThan(orden.indexOf('Run scraper(s)'))
    expect(orden.indexOf('Run tests')).toBeLessThan(orden.indexOf('Commit refreshed JSON'))
  })
})

describe('«Run tests» tras un corte', () => {
  const llamadas = (dir) => readFileSync(join(dir, 'llamadas'), 'utf8').trim().split('\n')

  // Sin rc, el hacha cayó antes del `refresh` del final de scrape-all.sh. Las
  // pruebas verían los derivados rancios y `data-graph-frescura` rojearía por el
  // corte, tapando lo que de verdad esté roto: 6 fallos el 14-09-2026.
  it('sin rc, rederiva antes de probar', () => {
    const dir = tmp()
    const r = correr('Run tests', { env: { SCRAPE_RC: '' }, bin: npmFalso(dir, 'exit 0') })
    expect(r.rc).toBe(0)
    expect(llamadas(dir)).toEqual(['run refresh', 'test'])
  })

  it('con rc, scrape-all.sh ya rederivó y sólo prueba', () => {
    const dir = tmp()
    const r = correr('Run tests', { env: { SCRAPE_RC: '1' }, bin: npmFalso(dir, 'exit 0') })
    expect(r.rc).toBe(0)
    expect(llamadas(dir)).toEqual(['test'])
  })

  it('un rederivado que falla no se lleva las pruebas', () => {
    const dir = tmp()
    const bin = npmFalso(dir, '[ "$1" = run ] && exit 7\nexit 0')
    const r = correr('Run tests', { env: { SCRAPE_RC: '' }, bin })
    expect(r.rc).toBe(0)
    expect(llamadas(dir)).toEqual(['run refresh', 'test'])
  })

  it('una prueba roja sale roja', () => {
    const dir = tmp()
    const bin = npmFalso(dir, '[ "$1" = test ] && exit 1\nexit 0')
    expect(correr('Run tests', { env: { SCRAPE_RC: '0' }, bin }).rc).toBe(1)
  })
})

describe('«Run scraper(s)» deja su bitácora', () => {
  const entorno = (dir) => ({
    ADAPTERS: 'all',
    RUNNER_TEMP: dir,
    GITHUB_OUTPUT: join(dir, 'salida'),
  })

  // La tubería es lo delicado: sin `pipefail`, `rc` sería el de `tee`, siempre 0,
  // y un crítico caído saldría verde. Es el defecto que no se puede repetir.
  it('el rc que llega a la puerta es el de scrape:all, no el de tee', () => {
    const dir = tmp()
    const bin = npmFalso(dir, 'echo "[scrape-all] FAILED (1): scrape:events"\nexit 3')
    const r = correr('Run scraper(s)', { env: entorno(dir), bin })
    expect(r.rc).toBe(0)
    expect(readFileSync(join(dir, 'salida'), 'utf8')).toContain('rc=3')
  })

  it('lo escrito sigue saliendo por el registro', () => {
    const dir = tmp()
    const bin = npmFalso(dir, 'echo "[scrape-all] running: scrape:officials"')
    const r = correr('Run scraper(s)', { env: entorno(dir), bin })
    expect(r.salida).toContain('[scrape-all] running: scrape:officials')
    expect(readFileSync(join(dir, 'scrape-all.log'), 'utf8')).toContain('scrape:officials')
  })

  // El caso que importa: el hacha no avisa. Lo escrito hasta el golpe tiene que
  // estar ya en el fichero, y el paso no llega a escribir su rc.
  it('un golpe de hacha deja escrito hasta dónde llegó', async () => {
    const dir = tmp()
    const bin = npmFalso(dir, 'echo "[scrape-all] running: scrape:lento"\nexec sleep 60')
    const hijo = spawn('bash', ['-e', '-c', paso('Run scraper(s)').run], {
      detached: true,
      stdio: 'ignore',
      env: { HOME: process.env.HOME, PATH: `${bin}:${process.env.PATH}`, ...entorno(dir) },
    })
    const bitacora = join(dir, 'scrape-all.log')
    const escrita = () =>
      existsSync(bitacora) && readFileSync(bitacora, 'utf8').includes('scrape:lento')
    try {
      for (let i = 0; i < 60 && !escrita(); i++) await new Promise((r) => setTimeout(r, 50))
    } finally {
      process.kill(-hijo.pid, 'SIGKILL')
    }
    expect(escrita(), 'lo escrito antes del golpe no llegó al fichero').toBe(true)
    expect(existsSync(join(dir, 'salida'))).toBe(false)
  })
})

describe('la puerta de salud', () => {
  const bitacora = [
    '[scrape-all] running: scrape:officials',
    '[scrape-all] ok: scrape:officials',
    '[scrape-all] running: scrape:agua-pares',
    '[agua-pares] 03082 Jávea/Xàbia: The operation was aborted due to timeout',
    '',
  ].join('\n')

  const puerta = (env, texto) => {
    const dir = tmp()
    if (texto !== undefined) writeFileSync(join(dir, 'scrape-all.log'), texto)
    return correr('Health gate', { env: { RUNNER_TEMP: dir, ...env } })
  }
  const verde = { SCRAPE_OUTCOME: 'success', SCRAPE_RC: '0', TESTS_OUTCOME: 'success' }

  it('deja pasar la noche buena', () => {
    expect(puerta(verde).rc).toBe(0)
  })

  it('unas pruebas rojas tiñen la noche', () => {
    expect(puerta({ ...verde, TESTS_OUTCOME: 'failure' }).rc).toBe(1)
  })

  // Lo que `= "failure"` dejaba pasar: pruebas que no corrieron contaban como
  // pruebas que pasaron. Lo que no se ha mirado no es un verde.
  it('unas pruebas que no corrieron tampoco son un verde', () => {
    const r = puerta({ ...verde, TESTS_OUTCOME: 'skipped' })
    expect(r.rc).toBe(1)
    expect(r.salida).toMatch(/skipped/)
  })

  it('dice en qué etapa cayó el hacha', () => {
    const r = puerta(
      { SCRAPE_OUTCOME: 'failure', SCRAPE_RC: '', TESTS_OUTCOME: 'success' },
      bitacora,
    )
    expect(r.rc).toBe(1)
    expect(r.salida).toContain('scrape:agua-pares')
    expect(r.salida).not.toContain('scrape:officials')
  })

  it('sin bitácora lo dice, y sigue en rojo', () => {
    const r = puerta({ SCRAPE_OUTCOME: 'failure', SCRAPE_RC: '', TESTS_OUTCOME: 'success' })
    expect(r.rc).toBe(1)
    expect(r.salida).toMatch(/no se sabe en qué etapa/i)
  })

  // Si `npm ci` o el corpus fallan, el raspado no corre: sin rc también, pero
  // «agotó su tiempo» sería mentira. Nunca intentado no es lo mismo que cortado.
  it('un raspado que no llegó a correr no se cuenta como cortado', () => {
    const r = puerta({ SCRAPE_OUTCOME: 'skipped', SCRAPE_RC: '', TESTS_OUTCOME: 'success' })
    expect(r.rc).toBe(1)
    expect(r.salida).toMatch(/no llegó a correr/i)
    expect(r.salida).not.toMatch(/agotó/i)
  })

  it('nombra a los críticos caídos, con lo que scrape-all.sh imprime al final', () => {
    const r = puerta(
      { SCRAPE_OUTCOME: 'success', SCRAPE_RC: '1', TESTS_OUTCOME: 'success' },
      [
        '[scrape-all] 2 critical failure(s):',
        '  - scrape:events',
        '  - scrape:bdns (no intentado)',
        '',
      ].join('\n'),
    )
    expect(r.rc).toBe(1)
    expect(r.salida).toContain('scrape:events')
    expect(r.salida).toContain('scrape:bdns (no intentado)')
  })
})

/**
 * El 29-10 el paso dijo que «a curated file collided with a scraper output», y
 * no: el fichero era `budget-execution.json`, salida de raspador. #493 lo había
 * regenerado con la nocturna en marcha. Un mensaje falso mandó a buscar donde no
 * era, así que aquí se reproduce con un repositorio de verdad.
 */
describe('un choque al rebasar dice qué ficheros chocaron', () => {
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' })

  it('nombra el fichero y no afirma que sea curado', () => {
    const dir = tmp()
    const origen = join(dir, 'origen.git')
    git(dir, 'init', '--bare', '-b', 'main', origen)
    const runner = join(dir, 'runner')
    git(dir, 'clone', origen, runner)
    git(runner, 'config', 'user.name', 'prueba')
    git(runner, 'config', 'user.email', 'prueba@example.org')
    mkdirSync(join(runner, 'public/data'), { recursive: true })
    writeFileSync(join(runner, 'public/data/budget-execution.json'), '{"v":0}\n')
    git(runner, 'add', '.')
    git(runner, 'commit', '-m', 'base')
    git(runner, 'push', 'origin', 'HEAD:main')

    const otro = join(dir, 'otro')
    git(dir, 'clone', origen, otro)
    git(otro, 'config', 'user.name', 'prueba')
    git(otro, 'config', 'user.email', 'prueba@example.org')
    writeFileSync(join(otro, 'public/data/budget-execution.json'), '{"v":"pr"}\n')
    git(otro, 'commit', '-am', 'una PR regenera la salida del raspador')
    git(otro, 'push', 'origin', 'HEAD:main')

    writeFileSync(join(runner, 'public/data/budget-execution.json'), '{"v":"nocturna"}\n')
    const r = correr('Commit refreshed JSON', {
      cwd: runner,
      bin: npmFalso(dir, 'exit 0'),
      env: {
        ADAPTERS: 'all',
        EVENT_NAME: 'schedule',
        SCRAPE_RC: '0',
        GITHUB_REF_NAME: 'main',
        GITHUB_OUTPUT: join(dir, 'salida'),
      },
    })
    expect(r.rc).toBe(1)
    expect(r.salida).toMatch(/::error::.*public\/data\/budget-execution\.json/)
    expect(r.salida).not.toMatch(/a curated file collided/)
    expect(readFileSync(join(dir, 'salida'), 'utf8')).toContain('changed=false')
  })
})
