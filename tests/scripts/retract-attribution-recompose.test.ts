/**
 * Una retractación toca `pleno-claims-verified.json`, que es un fichero
 * COMPUESTO: lo fecha `composedAt`, y eso no lo mueve escribirlo — lo mueve
 * recomponerlo. Hasta el 3-sep-2026 el CLI escribía y paraba ahí, así que PR
 * #80 movió cuatro atribuciones y dejó el sello en el día anterior; con él,
 * `check:stamps` —que entra en el parte nocturno— en rojo.
 *
 * Se ejercita en seco y por subproceso: el CLI llama a `process.exit()` y
 * escribe en `public/data/`, así que ni se prueba en el mismo proceso ni se le
 * deja escribir nada aquí.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/retract-claim-attribution.ts')

/** Una declaración real que HOY lleva bloc, para que la pasada en seco tenga
 *  algo que retirar: sin retiradas no hay nada que recomponer, y el test
 *  pasaría sin ejercitar la rama que le importa. Se lee del snapshot en vez de
 *  escribirse a mano, que es como un id se queda obsoleto en silencio. */
const CON_BLOC = (() => {
  const d = JSON.parse(readFileSync('public/data/pleno-claims-verified.json', 'utf8'))
  const fila = (d.items ?? []).find(
    (i: { claim?: { id?: string; speakerGroup?: string | null } }) => i.claim?.speakerGroup,
  )
  return fila?.claim?.id as string
})()

function run(args: string[]): { code: number; out: string; err: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, NODE_ENV: 'test' },
  })
  return { code: r.status ?? 1, out: r.stdout ?? '', err: r.stderr ?? '' }
}

describe('retract-attribution · recomposición del sello', () => {
  it('el snapshot todavía trae alguna atribución que retirar', () => {
    // Si esto se cae, el test de abajo dejó de medir lo que dice medir.
    expect(CON_BLOC).toBeTruthy()
  })

  it('anuncia que recompondrá el fichero compuesto que va a tocar', () => {
    const r = run(['--dry-run', '--claim', CON_BLOC])
    expect(r.code).toBe(0)
    const salida = r.out + r.err
    // Que la pasada haya hecho algo: sin retiradas, no habría rama que probar.
    expect(salida).toMatch(/retiraría/)
    expect(salida).toMatch(/recompondría/)
    expect(salida).toMatch(/pleno-claims-verified\.json/)
  })

  it('en seco no escribe nada', () => {
    const antes = readFileSync('public/data/pleno-claims-verified.json', 'utf8')
    run(['--dry-run', '--claim', CON_BLOC])
    expect(readFileSync('public/data/pleno-claims-verified.json', 'utf8')).toBe(antes)
  })
})
