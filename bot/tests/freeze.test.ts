import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isLoregFrozen, frozenUntil } from '../src/services/freeze.ts'

/**
 * Las pruebas del bot no pueden depender del bloqueo LOREG EN VIVO.
 *
 * `freeze.ts` leía siempre `public/data/promises.json` del repositorio. Desde
 * que el despliegue espera a que las pruebas pasen (bot-deploy.yml), eso era una
 * trampa: el día que alguien corriera `npm run freeze:set -- <fecha>`, las
 * pruebas del digest y del silencio —que fijan fechas de 2026 y esperan «no
 * congelado»— se pondrían en rojo, el despliegue se saltaría, y el bot seguiría
 * con la imagen de antes: sin congelar, difundiendo en campaña. Justo lo que la
 * ruta de `promises.json` en el disparador del despliegue existe para evitar.
 *
 * Ahora la ruta sale de `PROMISES_JSON` si está (como `OFFICIALS_JSON` en
 * router.ts), y `bot/vitest.config.ts` la apunta a un fixture sin bloqueo.
 */
describe('el bloqueo LOREG que ven las pruebas', () => {
  const antes = process.env.PROMISES_JSON
  let dir: string | null = null
  afterEach(() => {
    process.env.PROMISES_JSON = antes
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('las pruebas leen un promises.json de fixture, no el del sitio', () => {
    expect(process.env.PROMISES_JSON ?? '').toMatch(/tests[/\\]fixtures[/\\]/)
    expect(frozenUntil()).toBeNull()
  })

  it('con un fixture congelado, lo dice (el control: la variable se lee de verdad)', () => {
    dir = mkdtempSync(join(tmpdir(), 'cp-freeze-'))
    const ruta = join(dir, 'promises.json')
    writeFileSync(ruta, JSON.stringify({ frozenUntil: '2027-06-10' }))
    process.env.PROMISES_JSON = ruta
    expect(isLoregFrozen(new Date('2027-05-01T00:00:00Z'))).toBe(true)
    expect(isLoregFrozen(new Date('2027-07-01T00:00:00Z'))).toBe(false)
  })
})
