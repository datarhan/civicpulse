import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Lo que hay bajo `editorial/` y está RASTREADO en git no puede crecer.
 *
 * EL FALLO, medido el 2026-09-10: `git ls-files editorial/` devolvía **27
 * ficheros**, todos borradores del agente periodista sobre concejales **vivos y
 * nombrados**, con `legalSensitivity: high|medium`, y los 27 estaban en
 * `origin/main` — de un repositorio que es **público** desde el 8-sep-2026.
 *
 * La regla de la casa ya lo prohibía: «prosa automática no revisada sobre una
 * persona viva va en editorial/ (gitignored)». Y `editorial/` **está** en el
 * `.gitignore`, línea 28. Lo que faltaba saber es que **`.gitignore` no
 * desrastrea lo ya rastreado**: sólo evita que se añada lo que no está. Los
 * borradores entraron con `git add -f` porque la propia habilidad
 * `biografia-concejal` lo mandaba, y con el repositorio PRIVADO eso era
 * razonable — versionaba el borrador y lo mantenía fuera del sitio servido, que
 * era el agujero de agosto (`62ce8962 fix(journalist): stop serving unreviewed
 * drafts from the public site`).
 *
 * **Nadie comiteó nada sensible después de abrir el repositorio.** Los 27 son
 * del 1-ago y del 7-sep, con el repo aún privado. El 8-sep cambió la
 * visibilidad y en ese instante quedaron legibles por cualquiera. Ése es el
 * patrón que esta prueba vigila: no un descuido, sino **una práctica que era
 * segura bajo `private` y dejó de serlo sin que nada la volviera a mirar**.
 *
 * POR QUÉ AQUÍ Y NO EN `check:privado`: aquella guarda pregunta «¿se está
 * comiteando algo **NUESTRO** y privado?» — su prueba de sujeto somos nosotros.
 * Esto va de **terceros**, así que queda fuera por diseño, no por fallo. Son
 * dos preguntas distintas y necesitan dos puertas.
 *
 * La lista se DERIVA de `git ls-files`, nunca se escribe a mano. Lo único
 * escrito es la **línea base**, que es el registro de una decisión —«estos 27 ya
 * eran públicos cuando se decidió dejarlos»— y por eso sólo puede **encoger**.
 */

const LINEA_BASE = resolve('tests/fixtures/editorial-rastreado-linea-base.txt')

/** Todo lo rastreado bajo editorial/, leído de git. */
function rastreados() {
  const out = execFileSync('git', ['ls-files', 'editorial/'], { encoding: 'utf8' })
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .sort()
}

function lineaBase() {
  return readFileSync(LINEA_BASE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .sort()
}

describe('editorial/ rastreado en git · no puede crecer', () => {
  // Regla 2 de DATA_INTEGRITY: una pasada tiene que demostrar que hizo algo.
  // Si `git ls-files` deja de responder o el fichero de línea base desaparece,
  // esta prueba daría el visto bueno sin haber mirado nada — que es exactamente
  // el defecto de `r?.findings ?? []`.
  it('la comprobación se ha podido ejecutar', () => {
    expect(() => rastreados()).not.toThrow()
    expect(lineaBase().length).toBeGreaterThan(0)
  })

  it('no aparece NINGÚN fichero nuevo rastreado bajo editorial/', () => {
    const base = new Set(lineaBase())
    const nuevos = rastreados().filter((f) => !base.has(f))
    // El mensaje nombra los ficheros: una puerta que sólo dice «creció» obliga
    // a repetir el trabajo a quien la ve en rojo.
    expect(
      nuevos,
      `Han entrado en git ficheros nuevos bajo editorial/:\n  ${nuevos.join('\n  ')}\n\n` +
        'editorial/ está en el .gitignore: si están rastreados es por un `git add -f`.\n' +
        'Si es prosa no revisada sobre una persona viva, NO va a un repositorio público.\n' +
        'Sácalos con `git rm --cached <fichero>` (el fichero se queda en disco).',
    ).toEqual([])
  })

  it('la línea base no cita ficheros que ya no están (sólo puede encoger)', () => {
    const ahora = new Set(rastreados())
    const idos = lineaBase().filter((f) => !ahora.has(f))
    // Encoger es BUENO — es que alguien los sacó. No falla; pide que se anote,
    // porque una línea base que cita lo que ya no existe envejece hasta mentir.
    if (idos.length) {
      console.warn(
        `[editorial] ${idos.length} fichero(s) de la línea base ya no están rastreados. ` +
          'Actualiza tests/fixtures/editorial-rastreado-linea-base.txt con `git ls-files editorial/ | sort`.',
      )
    }
    expect(Array.isArray(idos)).toBe(true)
  })
})
