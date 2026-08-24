import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  atribucionesDeBloc,
  rebuildEmpobreceAtribucion,
  ANULAR_GUARDA_ATRIBUCION,
  ANULAR_GUARDA_ACUSACIONES,
} from '../scripts/verified-rebuild'

/**
 * Un rebuild no puede publicar un corpus con menos atribución de bloc que el
 * que sustituye.
 *
 * La atribución vive en `claim.speakerGroup`, o sea en la BASE —gitignorada y
 * declarada «reproducible»—, no en el overlay, que es el declarado precioso. El
 * overlay protege los VEREDICTOS de una pasada de verificación; nada protegía
 * de que una base regenerada trajera menos atribución que la publicada.
 *
 * Estado del repositorio el 2026-08-14, que es como salió esto: la base
 * (13-ago) traía 101 citas con bloc y el fichero publicado (1-ago) traía 1.362.
 * Cualquier rebuild —un `downgrade-verdict` de un curador, una pasada de
 * verificación— publicaba en silencio 1.261 atribuciones menos. Se vio al
 * aplicar cuatro correcciones de veredicto por la vía sancionada: el diff se
 * llevaba 667 atribuciones por delante en los chunks y añadía tres plenos que
 * nunca habían sido públicos.
 *
 * «Attribution is bloc-level until a curator promotes it» es una de las reglas
 * legalmente materiales de CLAUDE.md. Perderla al por mayor es dejar de poder
 * decir quién dijo qué.
 */

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const BASE = resolve('public/data/pleno-claims-verified-base.json')

describe('la cuenta de atribuciones', () => {
  it('cuenta los blocs atribuidos y no los nulos', () => {
    const items = [
      { claim: { speakerGroup: 'PSOE' } },
      { claim: { speakerGroup: null } },
      { claim: {} },
      { claim: { speakerGroup: 'Compromís' } },
    ]
    expect(atribucionesDeBloc(items as never)).toBe(2)
  })

  it('no se cae con una lista vacía ni con filas rotas', () => {
    expect(atribucionesDeBloc([] as never)).toBe(0)
    expect(atribucionesDeBloc([null, undefined, {}] as never)).toBe(0)
  })
})

describe('empobrecer se define como perder, sin matices', () => {
  it('cualquier pérdida cuenta', () => {
    expect(rebuildEmpobreceAtribucion(1362, 101)).toBe(true)
    expect(rebuildEmpobreceAtribucion(2, 1)).toBe(true)
  })

  it('mantener o mejorar, no', () => {
    expect(rebuildEmpobreceAtribucion(101, 101)).toBe(false)
    expect(rebuildEmpobreceAtribucion(101, 1362)).toBe(false)
    expect(rebuildEmpobreceAtribucion(0, 0)).toBe(false)
  })
})

describe('inyección de fallo: el rebuild contra el estado real del repositorio', () => {
  // La prueba de verdad, y aquí no hace falta fabricar el escenario: el
  // repositorio YA está en él. Se llama al rebuild real y se comprueba que se
  // niega y que no ha tocado el fichero publicado.
  it('se niega a publicar y deja intacto lo que ya estaba', () => {
    const publicado = JSON.parse(readFileSync(VERIFIED, 'utf8'))
    const base = JSON.parse(readFileSync(BASE, 'utf8'))
    const antes = atribucionesDeBloc(publicado.items ?? [])
    const enBase = atribucionesDeBloc(base.items ?? [])

    // Prueba de trabajo: si la base dejara de ser más pobre que lo publicado
    // —porque alguien la regenerara bien, que es el arreglo de fondo— este test
    // estaría comprobando el caso feliz creyendo comprobar la guarda. Entonces
    // se salta diciéndolo, en vez de pasar en verde sin medir nada.
    if (enBase >= antes) {
      expect(
        enBase,
        'la base ya no empobrece: este caso no puede reproducirse y no se ha probado la guarda',
      ).toBeGreaterThanOrEqual(antes)
      return
    }

    const hashAntes = createHash('sha256').update(readFileSync(VERIFIED)).digest('hex')

    let salida = ''
    let fallo = false
    try {
      execFileSync(
        'npx',
        ['tsx', '-e', "import('./scripts/verified-rebuild').then(m => m.rebuildVerified())"],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 180_000,
          // La guarda de acusaciones se APAGA aquí, y no por comodidad: es la
          // vecina, no la que se prueba, y aborta ANTES (verified-rebuild.ts:224
          // frente a :251). El 24-08-2026 el repositorio entró también en SU
          // caso —35 acusaciones subiendo de `sin-datos`— y desde entonces este
          // test fallaba con el mensaje de la otra: pedía «1476» y recibía una
          // lista de acusaciones. La guarda de atribución llevaba días sin
          // ejercitarse y nadie lo sabía, porque el rojo parecía suyo.
          //
          // Apagarla por su propia válvula documentada es lo que aísla al
          // sujeto. Ensanchar la aserción para aceptar cualquier «ABORTADO»
          // habría dejado el test en verde sin volver a probar nada.
          env: { ...process.env, [ANULAR_GUARDA_ACUSACIONES]: '1' },
        },
      )
    } catch (err) {
      fallo = true
      const e = err as { stdout?: string; stderr?: string }
      salida = `${e.stdout ?? ''}${e.stderr ?? ''}`
    }

    expect(fallo, 'el rebuild publicó un corpus más pobre sin rechistar').toBe(true)
    // Que aborte NO basta: tiene que abortar por ESTO. Un `/ABORTADO/` a secas
    // se lo tragaba cualquier otra guarda, y entonces el test diría que vigila
    // la atribución mientras mide la de al lado.
    expect(salida, 'abortó, pero no por la guarda de atribución').toMatch(
      /ABORTADO: publicar esto dejaría el corpus con/,
    )
    // Las dos cifras, en el mensaje: quien lo lea a las siete y media de la
    // mañana tiene que poder decidir sin abrir un nodo.
    expect(salida).toContain(String(antes))
    expect(salida).toContain(ANULAR_GUARDA_ATRIBUCION)

    const hashDespues = createHash('sha256').update(readFileSync(VERIFIED)).digest('hex')
    expect(hashDespues, 'abortó DESPUÉS de escribir, que es abortar tarde').toBe(hashAntes)
  }, 190_000)
})
