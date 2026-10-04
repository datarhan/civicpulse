import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Lo que dice `verify:pleno-claims` cuando la recomposición que lanza aborta.
 *
 * El guion hace dos cosas: escribe la base determinista y después recompone
 * base ⊕ overlay → pleno-claims-verified.json → trozos (`rebuildVerified`). La
 * recomposición tiene guardas que fallan CERRADO —una acusación ya publicada
 * que subiría, un overlay que el validador rechaza, una atribución que se
 * perdería, el techo de retirada de los trozos— y lanzan antes de publicar. El
 * guion capturaba ese aborto, imprimía «rebuild FAILED» y salía 0: quien lo
 * llama —`retract-attribution`, `extract-and-verify`, la tubería de /hallazgos—
 * leía «recompuesto» donde no se había recompuesto nada. Una pasada que no hizo
 * su trabajo informando de éxito es la regla 2 de docs/DATA_INTEGRITY.md; lo
 * apuntó la PR #218, en «Para decidir».
 *
 * De punta a punta a propósito: el defecto vive en la costura entre el guion y
 * la recomposición, y lo que se prueba es lo que ve quien lo llama —el código de
 * salida— y lo que queda en disco. La fila es de verdad
 * (tests/fixtures/recomposicion-abortada_2026-10-04.json): una acusación que el
 * emparejador determinista da por «verificado» sobre un contrato que no acredita
 * lo que denuncia, y que lo publicado mantiene en «sin-datos» sólo porque el
 * motor de veredictos la retractó en el overlay. Basta con que esa entrada falte
 * para que recomponer suba una acusación publicada.
 */

const SCRIPT = resolve('scripts/verify-pleno-claims.ts')
// tsx por su ruta: `npx` desde una caja de arena sin node_modules lo bajaría de
// la red.
const TSX = resolve('node_modules/.bin/tsx')
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/recomposicion-abortada_2026-10-04.json'), 'utf8'),
)
const ID = '10yl550-106-acu-dd1a86'
const ENTRADA = FIXTURE.overlay.entries[ID]

// Arranca el guion de verdad (~3 s con tsx); el tope de 5 s de vitest no da.
vi.setConfig({ testTimeout: 60_000 })

const cajas: string[] = []
afterAll(() => {
  for (const c of cajas) rmSync(c, { recursive: true, force: true })
})

interface Corrida {
  status: number | null
  stdout: string
  stderr: string
  publicadoAntes: string
  publicadoDespues: string
  /** El veredicto que la pasada determinista escribió en la base, o null si no la escribió. */
  enLaBase: string | null
}

/**
 * Una caja de arena con la fixture: la declaración, su fila publicada, el
 * contrato que el emparejador le casa y el overlay que se pida.
 */
function correr(overlay: unknown, transcripcion?: string): Corrida {
  const caja = mkdtempSync(join(tmpdir(), 'recomposicion-abortada-'))
  cajas.push(caja)
  const data = join(caja, 'public/data')
  mkdirSync(join(data, 'pleno-claims'), { recursive: true })
  mkdirSync(join(data, 'pleno-transcripts'), { recursive: true })
  const escribir = (ruta: string, valor: unknown) =>
    writeFileSync(join(data, ruta), JSON.stringify(valor, null, 2) + '\n')
  escribir('pleno-claims-suggestions.json', FIXTURE.sugerencias)
  escribir('pleno-claims-verified.json', FIXTURE.publicado)
  escribir('pleno-claims-overlay.json', overlay)
  escribir('tenders.json', FIXTURE.tenders)
  if (transcripcion !== undefined) {
    writeFileSync(join(data, 'pleno-transcripts', '10yl550.txt'), transcripcion)
  }
  const publicado = join(data, 'pleno-claims-verified.json')
  const publicadoAntes = readFileSync(publicado, 'utf8')

  const res = spawnSync(TSX, [SCRIPT], {
    cwd: caja,
    encoding: 'utf8',
    // Un entorno limpio: una escotilla de las guardas exportada en el shell de
    // quien corre la prueba (CLAIMS_REBUILD_ALLOW_*) la dejaría sin objeto.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
    timeout: 120_000,
  })

  const base = join(data, 'pleno-claims-verified-base.json')
  const enLaBase = existsSync(base)
    ? (JSON.parse(readFileSync(base, 'utf8')).items.find(
        (it: { claim: { id: string } }) => it.claim.id === ID,
      )?.verification.verdict ?? null)
    : null
  return {
    status: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
    publicadoAntes,
    publicadoDespues: readFileSync(publicado, 'utf8'),
    enLaBase,
  }
}

const veredictoPublicado = (r: Corrida): string =>
  JSON.parse(r.publicadoDespues).items.find((it: { claim: { id: string } }) => it.claim.id === ID)
    .verification.verdict

describe('el control: con la retractación del motor en el overlay, recompone', () => {
  let r: Corrida
  beforeAll(() => {
    r = correr(FIXTURE.overlay)
  })

  it('termina bien y reescribe lo publicado', () => {
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0)
    expect(r.publicadoDespues).not.toBe(r.publicadoAntes)
  })

  it('la base sube la acusación y el overlay la mantiene en sin-datos', () => {
    // Sin esto, los casos de abajo no medirían nada: si la pasada determinista
    // dejara de casar este contrato, quitar la entrada no subiría ninguna
    // acusación y «no aborta» se leería como «no hay defecto».
    expect(r.enLaBase).toBe('verificado')
    expect(veredictoPublicado(r)).toBe('sin-datos')
  })
})

describe.each([
  {
    caso: 'sin la entrada del overlay, recomponer subiría una acusación publicada',
    overlay: { ...FIXTURE.overlay, entries: {} },
    motivo: /ABORTADO: este rebuild subiría 1 acusación/,
  },
  {
    caso: 'el validador rechaza el overlay: una entrada que espera firma',
    overlay: {
      ...FIXTURE.overlay,
      entries: { [ID]: { ...ENTRADA, requiresHumanApproval: true } },
    },
    motivo: /lleva requiresHumanApproval/,
  },
])('$caso', ({ overlay, motivo }) => {
  let r: Corrida
  beforeAll(() => {
    r = correr(overlay)
  })

  it('llega a recomponer: la pasada determinista sí escribe la base', () => {
    expect(r.enLaBase).toBe('verificado')
  })

  it('no toca lo publicado', () => {
    expect(r.publicadoDespues).toBe(r.publicadoAntes)
  })

  it('sale con error, no con 0', () => {
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(1)
  })

  it('y dice por qué, lo que hizo y lo que no', () => {
    expect(r.stderr).toMatch(motivo)
    expect(r.stderr).toMatch(/hecho: la base determinista ·/)
    expect(r.stderr).toMatch(/sin tocar: pleno-claims-verified\.json y los trozos/)
  })
})

describe('los trozos abortan DESPUÉS de escribir el monolito', () => {
  // El techo de retirada de chunk-pleno-claims salta cuando casi nada consta en
  // ninguna transcripción: una transcripción que no contiene la declaración la
  // retiene, y una de una es el 100 %. Para entonces el monolito ya está
  // escrito, así que «lo publicado sigue como estaba» sería mentira.
  let r: Corrida
  beforeAll(() => {
    r = correr(FIXTURE.overlay, 'Texto de otra sesión: aquí no consta la declaración.\n')
  })

  it('sale con error, no con 0', () => {
    expect(r.stderr).toMatch(/no constan en ninguna transcripción/)
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(1)
  })

  it('y dice que el monolito SÍ se reescribió y los trozos no', () => {
    expect(r.publicadoDespues).not.toBe(r.publicadoAntes)
    expect(r.stderr).toMatch(/hecho: la base determinista y pleno-claims-verified\.json ·/)
    expect(r.stderr).toMatch(/sin hacer: los trozos/)
  })
})
