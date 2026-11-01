import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync, chmodSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * ¿Puede el saneador de fuentes apt colgar el trabajo él solo?
 *
 * Pudo, el 2026-10-27 (ejecución 40523528957, #453). La imagen del runner ya no
 * trae la fuente de Google Chrome, así que `ci-apt-fuentes-rotas.sh` no retiró
 * nada —y aun así lanzó su `sudo apt-get update` de comprobación, SIN tope—. El
 * espejo de Ubuntu se atascó y el paso murió a los 7 min con «The action has
 * timed out», el mensaje que `ci-apt-con-tope.sh` existe para no dar, sin que
 * llegara a correr la instalación que sí lleva tope y sin una sola prueba.
 *
 * La comprobación demuestra que retirar la fuente ha servido. Si no se retiró
 * nada, no hay nada que demostrar, y la instalación que viene detrás hace su
 * propio `apt-get update` con tope. Si se retiró, la comprobación va por el
 * tope, con el suyo, corto: un `update` sano tarda unos 9 s.
 *
 * Se ejecuta el guion de verdad, con `sudo` y `apt-get` falsos delante en el
 * PATH y los dos sitios de fuentes en un directorio temporal.
 */
const RAIZ = join(__dirname, '..')
const GUION = join(RAIZ, 'scripts', 'ci-apt-fuentes-rotas.sh')
const CHROME = 'deb [arch=amd64] https://dl.google.com/linux/chrome/deb/ stable main\n'

// `timeout` es de coreutils: está en el runner de Ubuntu, donde corre esta
// suite en cada PR, y no en un Mac. Lo que pasa por el tope se salta allí.
const hayTimeout = spawnSync('sh', ['-c', 'command -v timeout']).status === 0

let tmp, bin, dir, lista, llamadas

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ci-apt-fuentes-'))
  bin = join(tmp, 'bin')
  dir = join(tmp, 'sources.list.d')
  lista = join(tmp, 'sources.list')
  llamadas = join(tmp, 'llamadas')
  spawnSync('mkdir', ['-p', bin, dir])
  writeFileSync(join(dir, 'ubuntu.sources'), 'URIs: http://azure.archive.ubuntu.com/ubuntu/\n')
  writeFileSync(lista, '# vacío\n')
  writeFileSync(join(bin, 'sudo'), '#!/bin/sh\nexec "$@"\n')
  writeFileSync(
    join(bin, 'apt-get'),
    '#!/bin/sh\necho "$*" >> "$LLAMADAS"\n[ -n "${FALSO_APT_DUERME:-}" ] && sleep "$FALSO_APT_DUERME"\nexit 0\n',
  )
  chmodSync(join(bin, 'sudo'), 0o755)
  chmodSync(join(bin, 'apt-get'), 0o755)
})

afterEach(() => rmSync(tmp, { recursive: true, force: true }))

const correr = (env = {}) =>
  spawnSync('bash', [GUION], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      CI_APT_FUENTES_DIR: dir,
      CI_APT_LISTA: lista,
      LLAMADAS: llamadas,
      ...env,
    },
    timeout: 60_000,
  })

describe('scripts/ci-apt-fuentes-rotas.sh', () => {
  it('sin fuente de Google Chrome no llama a apt', () => {
    const r = correr()
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/no había ninguna fuente de Google Chrome/)
    expect(existsSync(llamadas), 'lanzó un apt-get update sin nada que comprobar').toBe(false)
  })

  it.skipIf(!hayTimeout)('retira la fuente y comprueba apt por el tope', () => {
    const fuente = join(dir, 'google-chrome.list')
    writeFileSync(fuente, CHROME)
    const r = correr()
    expect(r.status).toBe(0)
    expect(existsSync(fuente)).toBe(false)
    expect(readFileSync(llamadas, 'utf8')).toMatch(/^update -qq$/m)
    expect(r.stdout).toMatch(/apt-get update correcto/)
  })

  it.skipIf(!hayTimeout)('si la comprobación se atasca, corta y lo dice con su nombre', () => {
    writeFileSync(join(dir, 'google-chrome.list'), CHROME)
    const t0 = Date.now()
    const r = correr({ FALSO_APT_DUERME: '30', CI_APT_TOPE_COMPROBACION: '1s' })
    expect(r.status).toBe(124)
    expect(Date.now() - t0, 'no cortó: esperó a apt').toBeLessThan(15_000)
    expect(r.stdout).toMatch(/^::error title=apt no terminó en 1s::/m)
  })
})
