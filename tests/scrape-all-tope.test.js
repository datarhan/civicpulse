import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * ¿Puede un adaptador lento llevarse por delante lo que va detrás?
 *
 * Del 29 al 31-10-2026 la nocturna salió roja tres noches seguidas con todos sus
 * adaptadores sanos salvo uno, y ése era blando. `scrape:agua-pares` necesita
 * más de media hora y arrancaba al minuto 12 de un paso de 30: el hacha caía dentro
 * de él, y con ella se perdían `scrape:promise-suggestions`, `scrape:elections`,
 * las derivaciones y el `npm test` de esa noche (`TESTS_OUTCOME: skipped`). Un
 * fallo «blando» que tumbaba lo mismo que uno duro.
 *
 * Estas pruebas corren el `scrape-all.sh` DE VERDAD, con su lista y su cola
 * reales: lo único falso es el `npm` que encuentra en el PATH. Una prueba que
 * leyera el guion con una expresión regular se quedaría verde con el tope mal
 * cableado, y el tope mal cableado es justo el fallo que hay que ver.
 */
const GUION = resolve('scripts/scrape-all.sh')
const CON_TOPE = resolve('scripts/con-tope.mjs')

let dir
let registro

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'scrape-all-tope-'))
  registro = join(dir, 'registro')
  writeFileSync(registro, '')
  const falso = (nombre, cuerpo) => {
    const ruta = join(dir, nombre)
    writeFileSync(ruta, `#!/bin/bash\n${cuerpo}\n`)
    chmodSync(ruta, 0o755)
  }
  // `npm run --silent refresh -- --list llm` es la única llamada silenciosa del
  // guion y no es un paso: no cuenta como ejecutado.
  falso(
    'npm',
    `[ "$1" = run ] && shift
[ "$1" = --silent ] && exit 0
echo "$1" >> "$REGISTRO"
case " $LENTOS " in *" $1 "*) exec sleep 60 ;; esac
exit 0`,
  )
  falso('npx', 'exit 1')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const pasada = ({ lentos = '', tope = '1', presupuesto = '60' } = {}) => {
  const r = spawnSync('bash', [GUION], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 40_000,
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      REGISTRO: registro,
      LENTOS: lentos,
      SCRAPE_TOPE_ADAPTADOR_S: tope,
      SCRAPE_PRESUPUESTO_ADAPTADORES_S: presupuesto,
      GITHUB_STEP_SUMMARY: join(dir, 'resumen'),
    },
  })
  return { status: r.status, salida: r.stdout, pasos: readFileSync(registro, 'utf8').split('\n') }
}

describe('scrape-all: un adaptador lento no tumba la nocturna', () => {
  it('uno blando que se atasca se corta y la pasada sigue hasta el final', () => {
    const { status, salida, pasos } = pasada({ lentos: 'scrape:sindicatura' })
    expect(pasos, 'el adaptador se intentó').toContain('scrape:sindicatura')
    expect(pasos, 'lo que va detrás se ejecutó').toContain('scrape:elections')
    expect(pasos, 'las derivaciones se ejecutaron').toContain('refresh')
    expect(pasos, 'la cola de guardas se ejecutó').toContain('check:cadence')
    expect(status, 'un blando no tiñe la pasada').toBe(0)
    expect(salida).toMatch(/AGOTÓ SU TOPE.*scrape:sindicatura/)
  }, 45_000)

  it('uno crítico que se atasca tiñe la pasada, pero no la corta', () => {
    const { status, salida, pasos } = pasada({ lentos: 'scrape:tenders' })
    expect(pasos).toContain('scrape:elections')
    expect(pasos).toContain('refresh')
    expect(status, 'un crítico sin hacer no es «all critical scrapers succeeded»').toBe(1)
    expect(salida).toMatch(/critical failure.*\n(.*\n)*.*scrape:tenders/)
  }, 45_000)

  it('agotado el presupuesto, lo que falta se nombra NO intentado y la cola corre igual', () => {
    const { status, salida, pasos } = pasada({
      lentos: 'scrape:officials',
      presupuesto: '1',
    })
    expect(pasos, 'el presupuesto se agotó en el primero').not.toContain('scrape:elections')
    expect(pasos, 'pero la cola no depende de él').toContain('refresh')
    expect(pasos).toContain('check:cadence')
    expect(salida).toMatch(/NO intentado.*\n(.*\n)*.*scrape:elections/)
    expect(status, 'un crítico que no se intentó tampoco es un éxito').toBe(1)
  }, 45_000)

  // El caso de las tres noches. Sólo-local no es «se olvidó»: se dice cada noche.
  it('no intenta scrape:agua-pares y lo dice', () => {
    const { salida, pasos } = pasada()
    expect(pasos).not.toContain('scrape:agua-pares')
    expect(salida).toMatch(/scrape:agua-pares.*scrape-ci-blocked/)
  }, 45_000)

  // Regla 2: intentados / hechos / nunca intentados, por separado y cuadrando.
  // Sin esto, «no lo intenté» y «no había nada que hacer» salen igual.
  it('el parte cuenta previstos, intentados, hechos y no intentados, y cuadran', () => {
    const { salida } = pasada({ lentos: 'scrape:sindicatura' })
    const m = salida.match(
      /(\d+) previstos · (\d+) intentados · (\d+) hechos · (\d+) fallidos · (\d+) agotaron su tope · (\d+) no intentados/,
    )
    expect(m, `sin parte en la salida:\n${salida.slice(-800)}`).not.toBeNull()
    const [previstos, intentados, hechos, fallidos, agotados, noIntentados] = m.slice(1).map(Number)
    expect(previstos).toBe(intentados + noIntentados)
    expect(intentados).toBe(hechos + fallidos + agotados)
    expect(agotados).toBe(1)
    expect(noIntentados, 'scrape:agua-pares, al menos').toBeGreaterThanOrEqual(1)
    expect(
      readFileSync(join(dir, 'resumen'), 'utf8'),
      'el parte llega a la página de la ejecución',
    ).toContain(m[0])
  }, 45_000)
})

describe('con-tope: el perro guardián', () => {
  const correr = (args, env = {}) =>
    spawnSync(process.execPath, [CON_TOPE, ...args], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 20_000,
      env: { ...process.env, ...env },
    })
  const vive = (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  // Un proceso con SIGKILL sigue respondiendo a kill(0) hasta que alguien lo recoge,
  // y al nieto lo recoge init, no esta prueba: recién devuelto el 124 puede ser un
  // zombi, y mirar una sola vez dio rojo en la CI de #531 con el tope bien hecho.
  // El margen no tapa a un superviviente: el `sleep 60` no cabe en él.
  const desaparece = (pid, ms = 3_000) => {
    const limite = Date.now() + ms
    const parada = new Int32Array(new SharedArrayBuffer(4))
    while (vive(pid) && Date.now() < limite) Atomics.wait(parada, 0, 0, 20)
    return !vive(pid)
  }

  it('devuelve el código del mandato si termina a tiempo', () => {
    expect(correr(['5', 'sh', '-c', 'exit 7']).status).toBe(7)
  })

  it('agota el tope con 124 y no deja vivo a ningún nieto', () => {
    // `npm run` → sh → node: matar sólo al hijo deja a node raspando sin dueño.
    const pidf = join(dir, 'pid')
    const r = correr(['1', 'sh', '-c', `sleep 60 & echo $! > ${pidf}; wait`])
    expect(r.status).toBe(124)
    const nieto = Number(readFileSync(pidf, 'utf8'))
    expect(nieto).toBeGreaterThan(0)
    expect(desaparece(nieto), 'el nieto sobrevivió al tope').toBe(true)
  })

  it('remata con SIGKILL a quien ignora SIGTERM', () => {
    const pidf = join(dir, 'pid')
    const r = correr(['1', 'sh', '-c', `trap '' TERM; sleep 60 & echo $! > ${pidf}; wait`], {
      CON_TOPE_GRACIA_MS: '300',
    })
    expect(r.status).toBe(124)
    expect(desaparece(Number(readFileSync(pidf, 'utf8')))).toBe(true)
  })

  // Un guardián que no vigila no puede ejecutar el mandato igual: eso sería
  // mentir sobre lo que hace, que es la razón de ci-apt-con-tope.sh para negarse.
  it('se niega a correr con un tope que no es un número', () => {
    const marca = join(dir, 'marca')
    const r = correr(['ocho', 'touch', marca])
    expect(r.status).toBe(2)
    expect(spawnSync('test', ['-e', marca]).status, 'el mandato corrió sin tope').toBe(1)
  })

  it('dice 127 si el mandato no existe', () => {
    expect(correr(['5', 'no-existe-este-mandato']).status).toBe(127)
  })
})
