// @vitest-environment node
/**
 * La guarda actúa donde escribió Vite, no en `dist/` escrito a mano.
 *
 * Hasta el 26-10-2026 `vitePublicationGuard` resolvía `dist/` por su cuenta y
 * no leía el `build.outDir` de Vite. Medido ese día con builds de diagnóstico:
 * un `vite build --outDir X` dejaba en X un `pleno-findings.json` con el
 * literal de cada cita retenida y los borradores de la lista dentro, y además
 * volvía a aplicar la retención sobre el `dist/` ya servido, que acababa con
 * huellas de huellas. Nadie usa `--outDir` aquí, pero un artefacto sin retener
 * que sale sin aviso es la avería que la guarda existe para cerrar.
 *
 * Se lanza el gancho de verdad sobre una salida en un directorio temporal, con
 * los datos reales de `public/data/`: lo que se juzga es esa salida, y que el
 * `dist/` del repositorio sigue exactamente como estaba (o sin existir).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  PUBLICATION_DENYLIST,
  copiaServidaDeHallazgos,
  vitePublicationGuard,
} from '../publication-denylist.js'
import { citaRetenida } from '../src/lib/cita-retenida.js'

const REPO = resolve(__dirname, '..')
const PUBLIC_DATA = join(REPO, 'public', 'data')
const HALLAZGOS_EN_DIST = join(REPO, 'dist', 'data', 'pleno-findings.json')

// Sin `dist/` construido, «no lo tocó» compara una ausencia con otra y sale
// verde también con el código anterior, que es como corre el job `unidad` de
// la CI (`npm test` sin compilar). Se DECLARA saltada, como en
// `publication-denylist.test.ts`.
const SIN_DIST = !existsSync(HALLAZGOS_EN_DIST)
if (SIN_DIST) {
  console.warn(
    '[publication-guard-outdir] dist/data/pleno-findings.json ausente — no se ha comprobado ' +
      'que la guarda deje dist/ en paz. Se genera con `npm run build`.',
  )
}

/** Huella del `dist/` del repositorio, el que la guarda tocaba antes. */
const huellaDeDist = () =>
  createHash('sha256').update(readFileSync(HALLAZGOS_EN_DIST)).digest('hex')

const leer = (ruta: string) => JSON.parse(readFileSync(ruta, 'utf8'))

describe('vitePublicationGuard con un outDir que no es dist/', () => {
  let raiz: string
  let datos: string
  let distAntes: string | undefined

  beforeAll(async () => {
    raiz = mkdtempSync(join(tmpdir(), 'cp-outdir-'))
    // Relativo a propósito: Vite lo resuelve contra `config.root`, no contra
    // el directorio desde el que se lanza.
    datos = join(raiz, 'salida', 'data')
    mkdirSync(datos, { recursive: true })
    for (const f of ['pleno-findings.json', 'finding-quote-provenance.json', 'officials.json']) {
      copyFileSync(join(PUBLIC_DATA, f), join(datos, f))
    }
    // Los de la lista escrita y uno derivado: un borrador que ninguna página pide.
    for (const rel of PUBLICATION_DENYLIST) {
      writeFileSync(join(raiz, 'salida', rel.replace(/^public\//, '')), '[]\n')
    }
    writeFileSync(join(datos, 'borrador-sin-pedir.json'), '[{"requiresHumanApproval": true}]\n')

    if (!SIN_DIST) distAntes = huellaDeDist()
    const guarda = vitePublicationGuard()
    guarda.configResolved({ root: raiz, build: { outDir: 'salida' } })
    await guarda.closeBundle.handler()
  })

  afterAll(() => {
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  })

  it('retiene los literales en ESA salida', () => {
    const fuente = leer(join(PUBLIC_DATA, 'pleno-findings.json'))
    const procedencia = leer(join(PUBLIC_DATA, 'finding-quote-provenance.json'))
    const retenidas = Object.values(procedencia.quotes ?? {})
      .flat()
      .filter((e) => citaRetenida(e as { gate?: string } | null))
    // Sin citas retenidas en los datos, la igualdad de abajo no probaría nada.
    expect(
      retenidas.length,
      'ninguna cita retenida en public/data: no se juzga nada',
    ).toBeGreaterThan(0)

    const esperado = copiaServidaDeHallazgos(
      fuente,
      procedencia,
      leer(join(PUBLIC_DATA, 'officials.json')),
    ).snapshot
    expect(esperado).not.toEqual(fuente)
    expect(leer(join(datos, 'pleno-findings.json'))).toEqual(esperado)
  })

  it('aplica la lista en ESA salida, la escrita y la derivada', () => {
    const quedan = PUBLICATION_DENYLIST.filter((rel) =>
      existsSync(join(raiz, 'salida', rel.replace(/^public\//, ''))),
    )
    expect(quedan).toEqual([])
    expect(existsSync(join(datos, 'borrador-sin-pedir.json'))).toBe(false)
    // Y no quita de más: lo limpio se queda.
    expect(existsSync(join(datos, 'officials.json'))).toBe(true)
  })

  it.skipIf(SIN_DIST)('no toca el dist/ del repositorio', () => {
    expect(huellaDeDist(), 'dist/data/pleno-findings.json cambió al construir en otra salida').toBe(
      distAntes,
    )
  })
})

describe('vitePublicationGuard sin la configuración de Vite', () => {
  it('se cae en vez de suponer dist/', async () => {
    // Suponer `dist/` es la avería de arriba: juzgar un directorio que quizá
    // no es el que se va a desplegar y dar por bueno el que sí.
    await expect(vitePublicationGuard().closeBundle.handler()).rejects.toThrow(
      /no se sabe qué juzgar/,
    )
  })
})
