import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { INSTALA_CON_APT } from './setup/workflows.js'

/**
 * ¿Puede un espejo de apt lento comerse el trabajo entero de CI?
 *
 * Pudo, el 2026-10-26 (ejecución 40305149332, #431). `e2e.yml` era entonces un
 * solo trabajo de 20 min que lo hacía todo en fila, las ejecuciones sanas
 * tardaban 16–19,5, y el espejo de Ubuntu sirvió los paquetes a 13,6 kB/s:
 * el paso de `playwright install-deps` tardó 1.044 s en vez de ~20, a la suite
 * de unidad le quedaron 96 s y el trabajo se canceló con el código bien.
 *
 * El arreglo tiene dos mitades y aquí se fijan las dos. El workflow se partió
 * en trabajos paralelos, que dan el margen; y apt lleva tope propio,
 * `scripts/ci-apt-con-tope.sh`, para que un espejo lento falle pronto y diga
 * qué es en vez de agotar el presupuesto de todos. Una instalación que se
 * saltara el guion volvería a poder comerse el trabajo sin que nada lo
 * señalara.
 *
 * Vigila las instalaciones que PASAN POR APT. Desde el 2026-10-26 (#435)
 * `unidad` baja sólo el navegador, sin apt: su única prueba con navegador no
 * pinta texto y las bibliotecas de Chromium ya vienen en el runner, mientras
 * que `install-deps` lo tumbó tres veces por bajar fuentes. Esa instalación no
 * necesita tope de apt, pero su trabajo sigue entrando en el presupuesto de
 * abajo, que mira todos.
 *
 * El tope por defecto se LEE del guion, no se copia aquí: una prueba que
 * repite un valor de producción sigue verde cuando producción cambia (regla 1
 * de DATA_INTEGRITY).
 */
const RAIZ = join(__dirname, '..')
const GUION = join(RAIZ, 'scripts', 'ci-apt-con-tope.sh')
const E2E = join(RAIZ, '.github', 'workflows', 'e2e.yml')
const INSTALA = INSTALA_CON_APT
const POR_EL_TOPE = /\bbash\s+scripts\/ci-apt-con-tope\.sh\s+npx\s+playwright\s+install/
// Checkout, setup-node, `npm ci` y la caché: lo que corre sin tope propio.
const RESERVA_MIN = 2

const textoGuion = readFileSync(GUION, 'utf8')
const topeGuionMin = Number((textoGuion.match(/CI_APT_TOPE:-(\d+)m\}/) ?? [])[1])

const doc = load(readFileSync(E2E, 'utf8'))
const esInstalacion = (p) => typeof p?.run === 'string' && INSTALA.test(p.run)
const trabajos = Object.entries(doc?.jobs ?? {}).map(([id, trabajo]) => ({
  id,
  trabajo,
  pasos: trabajo?.steps ?? [],
}))
const instalaciones = trabajos.flatMap(({ id, pasos }) =>
  pasos.filter(esInstalacion).map((paso) => ({ id, nombre: paso.name, paso })),
)

describe('e2e.yml · cada instalación de Chromium con apt pasa por el tope', () => {
  // Regla 2 de DATA_INTEGRITY: cero instalaciones haría pasar todo lo de abajo
  // sin haber mirado nada. Dos: la de caché fallada y la de caché acertada.
  it('encuentra las instalaciones con apt que dice vigilar', () => {
    expect(instalaciones.length).toBeGreaterThanOrEqual(2)
  })

  it('lee el tope por defecto del guion', () => {
    expect(topeGuionMin).toBeGreaterThan(0)
  })

  it.each(instalaciones)('$id · $nombre · va por el guion', ({ paso }) => {
    const linea = paso.run.split('\n').find((l) => INSTALA.test(l))
    expect(
      linea,
      'la instalación corre sin tope: un espejo lento vuelve a comerse el trabajo',
    ).toMatch(POR_EL_TOPE)
  })

  // El tope del paso es el respaldo, no el corte: tiene que caer DESPUÉS del
  // guion (más los 30 s de `-k`), o el paso muere con «The action has timed
  // out» antes de que el guion diga qué ha pasado.
  it.each(instalaciones)('$id · $nombre · tiene respaldo por encima del guion', ({ paso }) => {
    expect(typeof paso['timeout-minutes']).toBe('number')
    expect(paso['timeout-minutes']).toBeGreaterThan(topeGuionMin + 0.5)
  })

  // Lo que el 26-10 faltaba: aun con apt en su tope, el resto de los pasos con
  // tope cabe en el trabajo. Las dos instalaciones con apt de un trabajo se
  // excluyen por su `if:` (caché fallada o acertada), así que cuenta la mayor.
  // Mira TODOS los trabajos, también los que no pasan por apt: el tope de
  // `npm test` vive en `unidad`.
  it('mira el presupuesto de cada trabajo', () => {
    expect(trabajos.length).toBeGreaterThan(0)
  })

  it.each(trabajos)('$id · los pasos con tope caben en el trabajo', ({ trabajo, pasos }) => {
    const minutos = (p) => p['timeout-minutes'] ?? 0
    const apt = Math.max(0, ...pasos.filter(esInstalacion).map(minutos))
    const resto = pasos.filter((p) => !esInstalacion(p)).reduce((t, p) => t + minutos(p), 0)
    expect(typeof trabajo['timeout-minutes']).toBe('number')
    expect(
      apt + resto + RESERVA_MIN,
      `apt (${apt}) + pasos con tope (${resto}) + ${RESERVA_MIN} de reserva no caben en ${trabajo['timeout-minutes']}`,
    ).toBeLessThanOrEqual(trabajo['timeout-minutes'])
  })
})

const correr = (args, { env = {}, bash = 'bash' } = {}) =>
  spawnSync(bash, [GUION, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 60_000,
  })

// `timeout` es de coreutils: está en el runner de Ubuntu, donde corre esta
// suite en cada PR, y no en un Mac. Allí lo de abajo se salta y lo dice.
const hayTimeout = spawnSync('sh', ['-c', 'command -v timeout']).status === 0

describe('scripts/ci-apt-con-tope.sh', () => {
  // Corre en cualquier máquina: sin `timeout` en el PATH, el guion se niega en
  // vez de ejecutar el mandato sin tope y callárselo.
  it('sin `timeout` no ejecuta el mandato a pelo', () => {
    const r = correr(['true'], { env: { PATH: '/sin-nada' }, bash: '/bin/bash' })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/falta `timeout`/)
  })

  it.skipIf(!hayTimeout)('sin mandato, no finge haber hecho nada', () => {
    expect(correr([]).status).toBe(2)
  })

  it.skipIf(!hayTimeout)('deja pasar el código del mandato cuando termina', () => {
    expect(correr(['true']).status).toBe(0)
    const r = correr(['sh', '-c', 'exit 3'])
    expect(r.status).toBe(3)
    // Un fallo de verdad de apt no se disfraza de espejo lento.
    expect(r.stdout).not.toMatch(/::error/)
  })

  it.skipIf(!hayTimeout)('corta al agotar el tope y lo dice con su nombre', () => {
    const t0 = Date.now()
    const r = correr(['sleep', '30'], { env: { CI_APT_TOPE: '1s' } })
    expect(r.status).toBe(124)
    expect(Date.now() - t0, 'no cortó: esperó al mandato').toBeLessThan(15_000)
    expect(r.stdout).toMatch(/^::error title=apt no terminó en 1s::/m)
    expect(r.stdout).toContain('Re-run failed jobs')
  })
})
