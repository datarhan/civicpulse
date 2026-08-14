import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  clasificarFalloDeNavegacion,
  MOTIVOS_PARA_HABLAR,
  pasadaHabla,
  REINTENTOS_SERVIDOR,
  ESPERA_SERVIDOR_MS,
  type Recuento,
} from '../src/scraper/reader-review'

/**
 * El barrido de superficies tiene que sobrevivir a que se le muera el servidor
 * que está leyendo, y —sobre todo— tiene que DECIRLO.
 *
 * El 2026-08-14 a las 07:30 el barrido nocturno arrancó, leyó cinco páginas
 * durante diecinueve minutos, y en la sexta se encontró el preview muerto:
 *
 *   page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4189/departamentos
 *
 * Lo que pasó entonces son tres averías apiladas, y ninguna la vio nadie:
 *
 *   1. La excepción escapó del bucle hasta el `main().catch()`, que imprime una
 *      línea y sale. NO se imprimió el resumen — el mismo resumen que este
 *      fichero se toma tantas molestias en que nombre las rutas que no leyó.
 *      Veintiséis rutas quedaron sin leer y ninguna se nombró.
 *   2. La caché se escribe UNA vez, después del bucle. Al morir antes, las
 *      cinco páginas ya revisadas se tiraron enteras: diecinueve minutos de
 *      llamadas al modelo que hubo que repetir.
 *   3. Salió 1 — que es EXACTAMENTE el código con el que sale una pasada sana
 *      que encontró señalamientos. El envoltorio registró «terminado
 *      (review:surfaces salió 1)» y el parte del día quedó indistinguible de
 *      uno bueno.
 *
 * Es el modo de fallo nº2 de docs/DATA_INTEGRITY.md —«una pasada tiene que
 * demostrar que hizo trabajo»— con un disfraz nuevo: aquí ni siquiera llegó a
 * mentir sobre lo que hizo, simplemente se calló.
 */

describe('clasificar un fallo de navegación', () => {
  // El literal es el de hoy, copiado del log, no uno inventado que se parezca.
  const REAL =
    'page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4189/departamentos\n' +
    'Call log:\n  - navigating to "http://127.0.0.1:4189/departamentos", waiting until "networkidle"'

  it('reconoce como servidor caído el error que mató al barrido de hoy', () => {
    expect(clasificarFalloDeNavegacion(new Error(REAL))).toBe('servidor-caido')
  })

  it('reconoce las demás formas de que no haya nadie escuchando', () => {
    for (const msg of [
      'connect ECONNREFUSED 127.0.0.1:4189',
      'page.goto: net::ERR_EMPTY_RESPONSE at http://127.0.0.1:4189/plenos',
      'page.goto: net::ERR_CONNECTION_RESET at http://127.0.0.1:4189/quejas',
      'socket hang up',
    ]) {
      expect(clasificarFalloDeNavegacion(new Error(msg)), msg).toBe('servidor-caido')
    }
  })

  it('NO confunde un fallo de UNA ruta con un servidor muerto', () => {
    // Si todo fallo se leyera como «el servidor se cayó», la pasada se
    // interrumpiría entera por una página lenta y las otras veintiséis se
    // declararían inalcanzables sin haberlo intentado. Diferenciar es lo que
    // permite seguir leyendo.
    for (const msg of [
      'page.goto: Timeout 30000ms exceeded.',
      'Target page, context or browser has been closed',
      'net::ERR_ABORTED',
    ]) {
      expect(clasificarFalloDeNavegacion(new Error(msg)), msg).toBe('ruta')
    }
  })

  it('no se traga un no-Error', () => {
    expect(clasificarFalloDeNavegacion('ECONNREFUSED')).toBe('servidor-caido')
    expect(clasificarFalloDeNavegacion(null)).toBe('ruta')
  })
})

describe('una pasada con algo que decir sale ≠ 0', () => {
  const cero = (): Recuento =>
    Object.fromEntries(MOTIVOS_PARA_HABLAR.map((m) => [m, 0])) as Recuento

  it('calla sólo cuando TODOS los motivos están a cero', () => {
    expect(pasadaHabla(cero())).toBe(false)
  })

  // Recorre la lista exportada en vez de repetir los casos a mano. Es la regla
  // nº1 de docs/DATA_INTEGRITY.md: seis tests de este repo copiaron una forma
  // en lugar de importarla y siguieron verdes mientras producción no casaba con
  // nada. Aquí eso significa que añadir un motivo nuevo a MOTIVOS_PARA_HABLAR y
  // olvidarse de cablearlo pone este test en rojo solo.
  for (const motivo of MOTIVOS_PARA_HABLAR) {
    it(`habla cuando lo único distinto de cero es «${motivo}»`, () => {
      expect(pasadaHabla({ ...cero(), [motivo]: 1 })).toBe(true)
    })
  }

  it('incluye una categoría para las rutas que no se pudieron alcanzar', () => {
    // Sin ella el arreglo de hoy no existe: la pasada moriría igual y la
    // decisión de salida no tendría dónde enterarse.
    expect(MOTIVOS_PARA_HABLAR).toContain('inalcanzables')
  })
})

describe('se insiste antes de dar por muerto el servidor', () => {
  // La inyección de fallo baja estos dos por entorno para no tardar cuarenta
  // segundos, así que los valores que rigen de verdad no los comprueba nadie
  // más. Puestos a cero, el lector vuelve a rendirse a la primera y el
  // vigilante que relanza el preview del barrido queda de adorno — sin que
  // ningún test se ponga rojo. Aquí se ponen.
  it('los valores por defecto dejan margen a que el vigilante relance el preview', () => {
    expect(REINTENTOS_SERVIDOR).toBeGreaterThan(0)
    // El vigilante mira cada 10 s y vite tarda 2-3 s en levantar: la ventana
    // total tiene que cubrir holgadamente ese ciclo.
    expect(REINTENTOS_SERVIDOR * ESPERA_SERVIDOR_MS).toBeGreaterThanOrEqual(20_000)
  })
})

describe('inyección de fallo: el lector contra un servidor que no existe', () => {
  // La prueba de verdad. Se apunta el lector real a un puerto donde no hay
  // nada y se comprueba que hace las tres cosas que hoy no hizo: nombrar lo que
  // no leyó, imprimir el resumen, y no reventar con una traza pelada.
  //
  // No gasta modelo: no se llega a leer una sola página, así que no hay llamada
  // que hacer. Lo único que cuesta es levantar chromium.
  it('nombra las rutas que no alcanzó en vez de morirse en la primera', () => {
    const r = spawnSync('npx', ['tsx', 'scripts/review-surfaces.ts', '--all'], {
      encoding: 'utf8',
      timeout: 180_000,
      env: {
        ...process.env,
        // Puerto alto y sin escuchar. NO vale el 1: está en la lista de puertos
        // bloqueados de Chromium, que responde ERR_UNSAFE_PORT sin llegar a
        // tocar la red — un error que el clasificador lee como fallo de ESA
        // ruta, no como servidor caído. La primera versión de este test usaba
        // el 1, pasaba en verde, y no ejecutaba ni una vez el camino que dice
        // probar. Es el defecto que este fichero entero persigue, cometido
        // dentro del test que lo persigue.
        REVIEW_BASE_URL: 'http://127.0.0.1:49999',
        // Los reintentos SÍ se recorren —el bucle es parte de lo que se prueba—
        // pero en milisegundos: con los valores de producción este test tardaría
        // cuarenta segundos en llegar a la primera aserción.
        REVIEW_SERVER_RETRIES: '2',
        REVIEW_SERVER_RETRY_MS: '150',
        // Que ninguna clave se cuele: si alguna ruta llegara a leerse, esto
        // dejaría de ser gratis. No debería llegar ninguna.
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: '',
      },
    })
    const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`

    // Prueba de trabajo antes que nada: si chromium no arrancó, lo de abajo
    // pasaría por los motivos equivocados.
    expect(salida, 'el lector no llegó a arrancar').not.toBe('')
    // Insistió antes de rendirse. Sin esto el vigilante que relanza el preview
    // del barrido no sirve de nada: la ruta que pilla el hueco de diez segundos
    // se declara inalcanzable y la pasada para con el servidor ya de vuelta.
    expect(salida, 'se rindió a la primera negativa, sin reintentar').toMatch(
      /no responde — reintento 2\/2/,
    )
    // Y la prueba de que se recorrió el camino que se quería recorrer: esta
    // frase sólo la imprime la rama de «servidor caído».
    expect(
      salida,
      'no se ejecutó la rama de servidor caído: la inyección no reprodujo la avería',
    ).toMatch(/dejó de responder\. NO se han intentado/)

    expect(salida, 'no dijo que no pudo alcanzar las rutas').toMatch(/NO ALCANZADA/i)
    // Nombradas, no contadas: «26 sin revisar» sin la lista es la truncadura
    // silenciosa otra vez.
    expect(salida, 'no nombró ninguna ruta concreta').toMatch(/\/(plenos|promesas|quejas)/)

    // Y contadas UNA vez. Sin la parada temprana el bucle sigue, y cada ruta
    // que falla vuelve a apuntar TODAS las que quedaban: ablacionando el
    // `break` esta cifra pasó de 27 a 378. Una ruta no puede estar sin alcanzar
    // catorce veces, y un recuento inflado en el titular es lo que después
    // acaba en el digest.
    const cab = salida.match(/\[review\] \d+ de (\d+) ruta\(s\) públicas[^\n]*/)
    expect(cab, 'no se encontró la línea de resumen').not.toBeNull()
    const publicas = Number(cab![1])
    const noAlcanzadas = Number(cab![0].match(/· (\d+) NO ALCANZADA\(S\): EL SERVIDOR/)?.[1] ?? 0)
    expect(noAlcanzadas, 'el titular cuenta rutas repetidas').toBeLessThanOrEqual(publicas)
    expect(noAlcanzadas, 'el titular no contó ninguna').toBeGreaterThan(0)
    // El resumen tiene que salir SIEMPRE. Es la línea que el envoltorio y una
    // persona leen para saber qué pasó.
    expect(salida, 'no imprimió el resumen final').toMatch(/\[review\]/)
    expect(r.status, 'una pasada que no leyó nada no puede salir 0').not.toBe(0)
  }, 190_000)
})

describe('el trabajo hecho se guarda aunque la pasada se corte', () => {
  it('la caché se escribe en un finally, no sólo al final del camino feliz', () => {
    // Guard de código y no de comportamiento, a propósito: reproducir «muere en
    // la ruta 8 de 34 con el modelo respondiendo» pide un servidor que se caiga
    // a mitad, y el coste de montarlo supera con mucho lo que protege. Lo que
    // sí se puede fijar es que la escritura no cuelgue de que el bucle termine
    // bien, que es lo único que falló hoy.
    const src = readFileSync(resolve('scripts/review-surfaces.ts'), 'utf8')
    const escritura = src.indexOf('writeFileSync(CACHE')
    expect(escritura, 'ya no se escribe la caché').toBeGreaterThan(-1)
    const antes = src.slice(0, escritura)
    expect(
      /\bfinally\s*\{[^}]*$/s.test(antes) || /persistirCache/.test(src),
      'la caché se escribe fuera de un finally: una excepción a mitad de pasada ' +
        'vuelve a tirar el trabajo ya hecho',
    ).toBe(true)
  })
})
