/**
 * El cotejo base ⊕ overlay → publicado, leído de disco y con linaje por
 * CONTENIDO. Lo comparten `check:verified-compose`, `monitor:health` y las
 * puertas de firma (`antes-de-firmar`, `relabel-attribution`).
 *
 * Por qué una huella y no sólo el sello. El base está gitignorado, así que cada
 * copia del repositorio tiene el suyo. El 20-10-2026 una sesión rederivó en su
 * worktree —base nuevo, sello nuevo— y fusionó lo publicado a main. El base del
 * checkout principal seguía siendo el del 19, y la guarda, que sólo comparaba
 * sellos, leyó «lo publicado es más nuevo que su base» y salió `contradice` en
 * el parte. Ni una cifra estaba mal: recomponer desde los datos de hoy daba el
 * publicado byte a byte salvo 27 sellos. Cada rederivación fusionada desde un
 * worktree lo habría repetido.
 *
 * La huella es del contenido del base (sus `items`), sin sello. `verified-rebuild`
 * la copia al publicado como `baseHuella`; aquí se recalcula del base en disco.
 * Si casan, lo publicado sale de ESTE contenido, se generara donde se generara.
 *
 * Y cuando el base en disco es más viejo que lo publicado y no casa, no se
 * grita: se regenera (`--base-only`, lo mismo que corre la nocturna; sólo
 * escribe el fichero gitignorado y es determinista, sin red ni LLM) y se vuelve
 * a cotejar. Si entonces casa, era un base atrasado; si no, la contradicción es
 * de verdad y sale como tal.
 */
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { cotejarCompose, type CotejoCompose } from '../../src/scraper/verified-merge'
import { BASE, VERIFIED } from '../verified-rebuild'
import { huellaDelBase } from './huella-base'

export { huellaDelBase }

function leer(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** El cotejo de lo que hay en disco ahora mismo, sin tocar nada. */
export function cotejarEnDisco(): CotejoCompose {
  const base = leer(BASE)
  const publicado = leer(VERIFIED)
  return cotejarCompose({
    baseGeneratedAt: texto(base?.generatedAt),
    publicadoGeneratedAt: texto(publicado?.generatedAt),
    huellaBase: base ? huellaDelBase(base) : null,
    huellaPublicada: texto(publicado?.baseHuella),
  })
}

export interface CotejoSanado {
  cotejo: CotejoCompose
  /** Se regeneró el base porque iba por detrás de lo publicado. */
  regenerado: boolean
  /** Si se intentó regenerar y falló, por qué. */
  fallo: string | null
}

/**
 * Coteja y, si el único desacuerdo es un base local más viejo que lo
 * publicado, lo regenera y coteja otra vez. Nunca toca lo publicado.
 */
export function cotejarSanando(): CotejoSanado {
  const antes = cotejarEnDisco()
  const publicado = leer(VERIFIED)
  const baseAtrasado =
    antes.estado === 'contradice' &&
    texto(publicado?.baseHuella) != null &&
    antes.baseGeneratedAt != null &&
    antes.publicadoGeneratedAt != null &&
    Date.parse(antes.baseGeneratedAt) < Date.parse(antes.publicadoGeneratedAt)
  if (!baseAtrasado) return { cotejo: antes, regenerado: false, fallo: null }

  const r = spawnSync('npx', ['tsx', 'scripts/verify-pleno-claims.ts', '--base-only'], {
    cwd: resolve(BASE, '../../..'),
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    const cola = (r.stderr || r.stdout || String(r.error ?? '')).trim().split('\n').slice(-3)
    return {
      cotejo: antes,
      regenerado: false,
      fallo: `verify --base-only salió ${r.status}: ${cola.join(' / ')}`,
    }
  }
  return { cotejo: cotejarEnDisco(), regenerado: true, fallo: null }
}
