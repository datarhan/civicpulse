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
 *
 * SEGUNDA MITAD, 26-08-2026. El párrafo de arriba diagnostica `--rotate` y
 * arregla el rango, que era el otro defecto. Quitar las rutas fantasma redujo
 * el daño pero no lo curó: la inversión no la causaban los fantasmas sino el
 * ORDEN, y sigue ocurriendo con rutas todas legítimas. Medido en el push de la
 * Revisión Eficiencia —rango ya de tres puntos, cero fantasmas—: diecinueve
 * rutas reales, y /eficiencia y /gestion, que eran el cambio ENTERO, las
 * últimas, porque se habían leído a las 08:35 y las otras diecisiete no.
 *
 * Así que el gancho pide `--rotate-desde N`: las N primeras —las que el push
 * reescribió— en el orden en que se las dan, y rotación sólo en la cola. La
 * equidad hacía falta para lo que no cabe, no para la cabeza.
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

  it('refresca origin/main antes de calcular el rango', () => {
    // Los tres puntos NO BASTAN solos. El merge-base se calcula contra la
    // referencia LOCAL de origin/main, así que si está rancia vuelven a colarse
    // las rutas de trabajo ya fusionado. Medido con este mismo arreglo: PR
    // fusionada en GitHub, sin `git fetch` después, y el gancho anunció otra vez
    // 10 rutas donde eran 0. Es el caso normal —se fusiona y se sigue—, no el
    // raro, así que el rango correcto sin ref fresca es media solución.
    expect(codigo).toMatch(/git fetch[^\n]*origin main/)
  })

  it('y si no hay red lo dice, en vez de callarse un rango inflado', () => {
    // Mismo contrato que el resto del fichero: este gancho nunca bloquea, pero
    // tampoco puede insinuar que miró lo que tocaba cuando no lo hizo.
    expect(codigo).toMatch(/el rango puede venir inflado/)
  })

  it('sigue derivando las rutas del grafo de imports, no de una lista a mano', () => {
    // Si alguien sustituye esto por una lista fija, el rango deja de importar y
    // esta prueba se quedaría vigilando algo que ya no decide nada.
    expect(codigo).toMatch(/routes-for-changes\.ts\s+--stdin/)
  })
  it('pide las rutas ORDENADAS por centralidad, no un montón plano', () => {
    // `--json` + `.rutas` en vez de la salida por líneas: el orden viene ya
    // hecho desde `routes-for-changes`, que es el único que sabe qué fichero
    // cambió. Un `sort` aquí sería adivinar.
    expect(codigo).toMatch(/routes-for-changes\.ts\s+--stdin\s+--json/)
    expect(codigo).toMatch(/\.rutas\.join/)
  })

  it('rota SÓLO la cola: `--rotate-desde`, nunca `--rotate` a secas', () => {
    // El defecto medido: `--rotate` ordena por antigüedad, y la página en la
    // que estás iterando es la que MENOS antigüedad tiene. Con el techo de
    // 180 s entra una ruta, y era siempre la equivocada.
    expect(codigo).toMatch(/--rotate-desde/)
    const rotateSolo = codigo.match(/--rotate(?!-desde)/g) ?? []
    expect(
      rotateSolo,
      'un `--rotate` pelado manda al fondo justo la página que este push ' +
        'reescribió: se leyó hace un rato, luego es la menos antigua',
    ).toEqual([])
  })

  it('el número que pasa a --rotate-desde son las DIRECTAS, no una constante', () => {
    // Si alguien lo fija en 1 o en 3, la cabeza deja de significar «lo que el
    // push reescribió» y vuelve a ser una lotería con otra semilla.
    expect(codigo).toMatch(/--rotate-desde"?\s+"?\$N_DIRECTAS/)
    expect(codigo).toMatch(/N_DIRECTAS=.*\bdirectas\b/)
  })

  it('anuncia cuántas son directas, para que el parte se pueda contrastar', () => {
    // Lo único que distingue este arreglo de no haberlo hecho es LEER el parte
    // y ver que la primera ruta es la que tocaste. Sin el recuento no se puede.
    expect(codigo).toMatch(/directa\(s\)/)
  })
})
