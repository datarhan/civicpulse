import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { INSTALA_CON_APT } from './setup/workflows.js'

/**
 * ¿Sirve la caché de Actions los paquetes que el espejo de apt no sirve?
 *
 * El 2026-10-26 el espejo de Ubuntu de los runners hizo caer cinco trabajos de
 * CI bajando siempre los mismos 25,9 MB, la última vez en `playwright`
 * (ejecución 40331307200). `scripts/ci-apt-debs.sh` repone esos .deb antes de
 * `install-deps` y los guarda después, y `e2e.yml` los cachea.
 *
 * Lo que puede fallar en silencio es el cableado: un guion que repone en un
 * directorio que la caché no guarda, o una instalación que se salta la
 * reposición, dejan la CI verde los días buenos y bajando del espejo igual que
 * antes. Así que aquí se exige el cableado entero, y el directorio se LEE del
 * guion en vez de copiarse (regla 1 de DATA_INTEGRITY).
 */
const RAIZ = join(__dirname, '..')
const GUION = join(RAIZ, 'scripts', 'ci-apt-debs.sh')
const E2E = join(RAIZ, '.github', 'workflows', 'e2e.yml')

const textoGuion = readFileSync(GUION, 'utf8')
// `${CI_APT_DEBS:-$HOME/.cache/apt-chromium}` → `~/.cache/apt-chromium`
const dirGuion = (textoGuion.match(/CI_APT_DEBS:-\$HOME(\/[^}]+)\}/) ?? [])[1]

const doc = load(readFileSync(E2E, 'utf8'))
const trabajos = Object.entries(doc?.jobs ?? {}).map(([id, t]) => ({ id, pasos: t?.steps ?? [] }))
const conApt = trabajos.flatMap(({ id, pasos }) =>
  pasos
    .filter((p) => typeof p?.run === 'string' && INSTALA_CON_APT.test(p.run))
    .map((paso) => ({ id, nombre: paso.name, paso, pasos })),
)

describe('e2e.yml · los .deb de apt pasan por la caché', () => {
  it('lee el directorio del guion y encuentra instalaciones con apt', () => {
    expect(dirGuion, 'el guion ya no declara su directorio como se espera').toMatch(/^\/\S+$/)
    expect(conApt.length).toBeGreaterThanOrEqual(2)
  })

  it.each(conApt)('$id · $nombre · repone antes y guarda después', ({ paso }) => {
    const lineas = paso.run.split('\n').map((l) => l.trim())
    const instala = lineas.findIndex((l) => INSTALA_CON_APT.test(l))
    const repone = lineas.findIndex((l) => /^bash scripts\/ci-apt-debs\.sh reponer$/.test(l))
    const guarda = lineas.findIndex((l) => /^bash scripts\/ci-apt-debs\.sh guardar$/.test(l))
    expect(repone, 'no repone los .deb: apt los vuelve a pedir al espejo').toBeGreaterThanOrEqual(0)
    expect(repone).toBeLessThan(instala)
    expect(guarda, 'no guarda los .deb: la caché nunca se llena').toBeGreaterThan(instala)
  })

  it.each(conApt)('$id · $nombre · su trabajo cachea el directorio del guion', ({ pasos }) => {
    const rutas = pasos
      .filter((p) => /^actions\/cache@/.test(p?.uses ?? ''))
      .map((p) => String(p.with?.path ?? '').trim())
    expect(rutas, 'la caché guarda otro sitio: el guion repone de un directorio vacío').toContain(
      `~${dirGuion}`,
    )
  })
})

describe('scripts/ci-apt-debs.sh', () => {
  let base, cache, archivos
  const correr = (modo) =>
    spawnSync('bash', [GUION, ...(modo ? [modo] : [])], {
      encoding: 'utf8',
      env: { ...process.env, CI_APT_DEBS: cache, CI_APT_ARCHIVOS: archivos, CI_APT_SUDO: '' },
    })
  const debs = (dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.deb'))
      .sort()

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'ci-apt-debs-'))
    cache = join(base, 'cache')
    archivos = join(base, 'archivos')
    mkdirSync(archivos)
  })
  afterEach(() => rmSync(base, { recursive: true, force: true }))

  it('sin caché no repone nada, y lo dice', () => {
    const r = correr('reponer')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/no había \.deb en la caché/)
    expect(debs(archivos)).toEqual([])
  })

  it('guarda sólo los .deb, y la caché queda igual que lo instalado', () => {
    mkdirSync(cache)
    writeFileSync(join(cache, 'viejo_1.deb'), 'v')
    for (const f of ['a_1.deb', 'b_2.deb', 'lock']) writeFileSync(join(archivos, f), f)
    const r = correr('guardar')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/guardados 2 \.deb/)
    // El viejo sale: si no, la caché crecería con cada actualización.
    expect(debs(cache)).toEqual(['a_1.deb', 'b_2.deb'])
  })

  it('repone en el directorio de apt lo que guardó', () => {
    mkdirSync(cache)
    for (const f of ['a_1.deb', 'b_2.deb']) writeFileSync(join(cache, f), f)
    const r = correr('reponer')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/repuestos 2 \.deb/)
    expect(debs(archivos)).toEqual(['a_1.deb', 'b_2.deb'])
  })

  // Regla 2 de DATA_INTEGRITY: guardar cero tras instalar querría decir que la
  // caché no sirve de nada. Eso es un aviso visible, no un «guardados 0».
  it('guardar cero .deb avisa en vez de callar', () => {
    const r = correr('guardar')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/^::warning title=caché de apt vacía::/m)
  })

  it('sin modo, no hace nada y sale con error', () => {
    expect(correr().status).toBe(2)
  })
})
