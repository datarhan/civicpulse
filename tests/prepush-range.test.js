import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ¿Lee el gancho de pre-push las rutas que el push TOCA?
 *
 * Durante un tiempo, no: leía justamente las otras. El rango era de dos puntos
 *
 *   RANGE="${PREPUSH_RANGE:-origin/main..HEAD}"
 *
 * y en `git diff` los dos puntos comparan las dos PUNTAS, no «lo que trae mi
 * rama». Con la rama un poco atrasada, todo lo que hubiera avanzado main
 * entraba como si lo hubieras cambiado tú. Medido sobre la PR #26:
 *
 *   origin/main..HEAD    45 ficheros → 10 rutas
 *   origin/main...HEAD   23 ficheros →  2 rutas   ← las que el push tocaba
 *
 * Y no se quedaba en ruido. El gancho pasa `--rotate`, que ordena por
 * antigüedad para que ninguna ruta se quede sin leer nunca; con ocho rutas
 * fantasma en la lista —sin leer hacía tiempo— éstas se colocaban DELANTE de
 * las dos reales, que acababan de leerse. Con el tope de 180 s sólo daba tiempo
 * a una. El resultado no era aleatorio sino invertido: cuanto más al día estaba
 * una página, menos probable era que la revisión llegara a ella. Las dos que el
 * push había reescrito salieron las últimas de diez y no se leyeron.
 *
 * Un carácter. Por eso hay una prueba: a simple vista los dos rangos son el
 * mismo, y quien lo lea sin haberlo medido lo «simplificará» otra vez.
 */
const HOOK = join(__dirname, '..', '.husky', 'pre-push')
const texto = readFileSync(HOOK, 'utf8')

/**
 * El fichero sin comentarios.
 *
 * Load-bearing: el comentario que explica todo esto CITA la forma mala como
 * ejemplo, así que una comprobación que mirase el fichero entero se pondría
 * roja por su propia documentación.
 */
const codigo = texto
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n')

describe('el rango del gancho de pre-push', () => {
  it('usa tres puntos, no dos', () => {
    expect(codigo).toMatch(/origin\/main\.\.\.HEAD/)
  })

  it('no deja ni un rango de dos puntos contra origin/main', () => {
    // El control de la prueba de arriba: `...` contiene `..`, así que buscar la
    // forma buena no descarta que quede la mala en otra línea.
    const dosPuntos = codigo.match(/origin\/main\.\.(?!\.)/g) ?? []
    expect(
      dosPuntos,
      'un `git diff origin/main..HEAD` compara las dos puntas: con la rama ' +
        'atrasada mete las rutas que cambió main y desplaza a las que tocó el push',
    ).toEqual([])
  })

  it('sigue derivando las rutas del grafo de imports, no de una lista a mano', () => {
    // Si alguien sustituye esto por una lista fija, el rango deja de importar y
    // esta prueba se quedaría vigilando algo que ya no decide nada.
    expect(codigo).toMatch(/routes-for-changes\.ts\s+--stdin/)
  })
})
