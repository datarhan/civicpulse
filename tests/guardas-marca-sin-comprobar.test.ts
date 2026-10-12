import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { clasificarGuarda } from '../src/scraper/health-monitor'

/**
 * Cinco guardas del parte salían 0 sin haber medido y lo decían con palabras
 * suyas —«nada que comprobar», «NO es un visto bueno», «sin historial no se
 * puede decir nada»— pero sin ninguna de las dos marcas que `clasificarGuarda`
 * lee (`MARCAS_SIN_COMPROBAR`). El parte las habría dado por limpias el día que
 * ese camino saltara. El predicado es estricto a propósito (en minúscula la
 * misma familia sale en las salidas normales de cada noche), así que el arreglo
 * va en la guarda: su renglón lleva la marca.
 *
 * Cada caso lleva a la guarda REAL a ese estado —un árbol temporal como cwd— y
 * le pasa su salida real a la función real: si alguien reescribe el renglón y
 * se le cae la marca, esto lo ve. Antes de juzgar la marca se comprueba que el
 * camino es el que se quería: un caso que acabara en otro sitio pasaría por no
 * haber llegado.
 */

const TSX = resolve('node_modules/.bin/tsx')
const guion = (nombre: string) => resolve('scripts', nombre)

const temporales: string[] = []
afterEach(() => {
  for (const d of temporales.splice(0)) rmSync(d, { recursive: true, force: true })
})
function temporal(prefijo: string): string {
  const d = mkdtempSync(join(tmpdir(), prefijo))
  temporales.push(d)
  return d
}

/**
 * git sin lo que el entorno le traiga: desde un gancho de git llegan
 * `GIT_DIR`/`GIT_INDEX_FILE`, que apuntarían al repositorio de verdad, y la
 * configuración global del curador podría poner un `core.hooksPath`.
 */
function entornoLimpio(techo: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v
  return {
    ...env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: techo,
  }
}

/** Como `runCheck` en scripts/monitor-health.ts: stdout y stderr juntos. */
function correr(script: string, cwd: string, args: string[] = []) {
  const r = spawnSync(TSX, [guion(script), ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: entornoLimpio(tmpdir()),
  })
  return { codigo: r.status, salida: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

function repoVacio(prefijo: string): string {
  const d = temporal(prefijo)
  execFileSync('git', ['init', '-q', d], { env: entornoLimpio(tmpdir()) })
  return d
}

const T = 60_000

describe('una guarda que sale 0 sin medir lleva la marca que el parte lee', () => {
  it.each([[[] as string[]], [['--staged']]])(
    'check:privado sin un fichero que escanear (%j)',
    (args) => {
      const { codigo, salida } = correr('check-privado.ts', repoVacio('privado-'), args)
      expect(codigo).toBe(0)
      expect(salida).toContain('no se escaneó ningún fichero')
      expect(clasificarGuarda(codigo, salida).desenlace).toBe('sin-comprobar')
    },
    T,
  )

  it(
    'check:eficiencia-findings sin ninguna ficha publicada',
    () => {
      const d = temporal('eficiencia-')
      mkdirSync(join(d, 'public/data'), { recursive: true })
      // La cabecera real, sin fichas: lo único que cambia es lo que se mide.
      const real = JSON.parse(readFileSync('public/data/eficiencia-findings.json', 'utf8'))
      writeFileSync(
        join(d, 'public/data/eficiencia-findings.json'),
        JSON.stringify({ ...real, items: [] }),
      )
      writeFileSync(join(d, 'public/data/indicadores.json'), '{}')
      const { codigo, salida } = correr('check-eficiencia-findings.ts', d)
      expect(codigo).toBe(0)
      expect(salida).toContain('no hay ninguna ficha publicada')
      expect(clasificarGuarda(codigo, salida).desenlace).toBe('sin-comprobar')
    },
    T,
  )

  describe('check:hooks', () => {
    it(
      'fuera de un repositorio git',
      () => {
        const { codigo, salida } = correr('check-hooks.ts', temporal('hooks-sin-git-'))
        expect(codigo).toBe(0)
        expect(salida).toContain('no estamos en un repositorio git')
        expect(clasificarGuarda(codigo, salida).desenlace).toBe('sin-comprobar')
      },
      T,
    )

    it(
      'en una máquina sin ganchos de git',
      () => {
        const { codigo, salida } = correr('check-hooks.ts', repoVacio('hooks-sin-ganchos-'))
        expect(codigo).toBe(0)
        expect(salida).toContain('esta máquina no tiene ganchos de git')
        expect(clasificarGuarda(codigo, salida).desenlace).toBe('sin-comprobar')
      },
      T,
    )

    it(
      'en un repositorio que no trae ganchos en .husky/',
      () => {
        const d = repoVacio('hooks-sin-husky-')
        execFileSync('git', ['-C', d, 'config', '--local', 'core.hooksPath', join(d, '.husky/_')], {
          env: entornoLimpio(tmpdir()),
        })
        const { codigo, salida } = correr('check-hooks.ts', d)
        expect(codigo).toBe(0)
        expect(salida).toContain('el repositorio no trae ganchos')
        expect(clasificarGuarda(codigo, salida).desenlace).toBe('sin-comprobar')
      },
      T,
    )
  })

  it(
    'check:officials-corrections sin fichero de correcciones',
    () => {
      const d = temporal('officials-')
      mkdirSync(join(d, 'public/data'), { recursive: true })
      writeFileSync(join(d, 'public/data/officials.json'), '{}')
      const { codigo, salida } = correr('check-officials-corrections.ts', d)
      expect(codigo).toBe(0)
      expect(salida).toContain('sin fichero de correcciones')
      expect(clasificarGuarda(codigo, salida).desenlace).toBe('sin-comprobar')
    },
    T,
  )

  it(
    'check:runs sin ningún manifiesto',
    () => {
      const { codigo, salida } = correr('check-runs.ts', temporal('runs-'))
      expect(codigo).toBe(0)
      expect(salida).toContain('no hay ningún manifiesto')
      expect(clasificarGuarda(codigo, salida).desenlace).toBe('sin-comprobar')
    },
    T,
  )
})
