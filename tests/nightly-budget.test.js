import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'

/**
 * ¿Puede la nocturna perder una noche entera de datos sin decirlo?
 *
 * El 7-09-2026 la portada llevaba cuatro días enseñando la misma noticia. El
 * raspado no estaba roto —corrido a mano ese día devolvía titulares de hoy—:
 * lo que fallaba era el PRESUPUESTO del trabajo, y falla de una forma que no
 * se parece a un fallo.
 *
 * La cadena, medida y no supuesta:
 *
 *   1. Un trabajo que agota su `timeout-minutes` de JOB no concluye `failure`,
 *      concluye `cancelled`.
 *   2. El paso que comitea llevaba `if: !cancelled()`, así que un trabajo
 *      cancelado se SALTA el commit y los datos frescos mueren en el runner.
 *   3. Nadie lo veía: la racha de rojos sólo contaba `failure` (arreglado en
 *      #114), y el digest publicaba «nocturnas-en-rojo=0» con cinco noches sin
 *      verde.
 *
 * Y el presupuesto no cuadraba desde el principio. Los únicos pasos con tope
 * eran «Verifier corpus» (6) y «Run scraper(s)» (22): 28 minutos declarados
 * dentro de un trabajo de 30, dejando DOS para `npm ci`, Playwright, 5.909
 * pruebas, el commit, el push, el resumen y la puerta de salud. La cuenta sólo
 * salía mientras el raspado no gastara lo suyo. Medido en la ejecución
 * 34275573755: raspado 17,1 min de 22, pruebas 3,8, trabajo 23,4 de 30. Con el
 * raspado en su tope la ejecución se pasa del trabajo y se cancela.
 *
 * Las dos reglas de abajo son independientes a propósito. La segunda hace raro
 * el cancelado; la PRIMERA hace que, cuando pase igual, no cueste una noche.
 * Una sola de las dos deja el defecto vivo.
 */
const WF = join(__dirname, '..', '.github', 'workflows', 'nightly-scrape.yml')
const crudo = readFileSync(WF, 'utf8')
const doc = load(crudo)
const job = doc.jobs.scrape
const pasos = job.steps

const paso = (nombre) => {
  const p = pasos.find((s) => s.name === nombre)
  if (!p) throw new Error(`la nocturna ya no tiene un paso llamado «${nombre}»`)
  return p
}

/** Los pasos que ejecutan un guion propio; los `uses:` van en la RESERVA. */
const pasosConGuion = pasos.filter((s) => typeof s.run === 'string')

/**
 * Minutos para lo que no lleva tope propio: checkout, setup-node y la caché de
 * Playwright, que son acciones de terceros y no un guion nuestro. Medidos a
 * 0,1 min cada uno en 34275573755; tres es holgura, no estimación.
 */
const RESERVA = 3

describe('el presupuesto de la nocturna', () => {
  // Si este vuelve a `!cancelled()`, un trabajo que agote su tope tira a la
  // basura todo lo que los adaptadores acababan de raspar.
  it('comitea los datos aunque el trabajo se cancele', () => {
    const condicion = String(paso('Commit refreshed JSON').if ?? '')
    expect(
      condicion,
      'el commit debe correr con always(): un JOB timeout concluye `cancelled` y `!cancelled()` se lo salta, que es como se perdió la noche del 7-09-2026',
    ).toMatch(/always\(\)/)
    expect(condicion, 'always() y !cancelled() se contradicen en el mismo paso').not.toMatch(
      /!\s*cancelled\(\)/,
    )
  })

  // Un paso sin tope no se puede sumar, y lo que no se puede sumar no se puede
  // comprobar: `Run tests` corría 5.909 pruebas sin presupuesto ninguno.
  it('todo paso que ejecuta un guion declara su tope', () => {
    const sinTope = pasosConGuion.filter((s) => typeof s['timeout-minutes'] !== 'number')
    expect(
      sinTope.map((s) => s.name),
      'sin tope propio un paso puede comerse el presupuesto del trabajo entero y cancelarlo',
    ).toEqual([])
  })

  // La suma sobrestima a propósito: los dos pasos de Playwright se excluyen
  // entre sí (uno corre con caché y el otro sin ella) y aquí cuentan los dos.
  // Sobrestimar sólo pide un tope de trabajo más alto, que es gratis —el
  // repositorio es público desde el 8-09-2026 y los minutos no se facturan—.
  // Subestimar cuesta una noche de datos.
  it('los topes de los pasos caben dentro del tope del trabajo', () => {
    const suma = pasosConGuion.reduce((t, s) => t + (s['timeout-minutes'] ?? 0), 0)
    expect(
      suma + RESERVA,
      `los pasos suman ${suma} min + ${RESERVA} de reserva y el trabajo sólo da ${job['timeout-minutes']}`,
    ).toBeLessThanOrEqual(job['timeout-minutes'])
  })

  // El tope del raspado es el que se calibró contra fuentes lentas; que la
  // regla de arriba se cumpla BAJÁNDOLO sería arreglar la cuenta rompiendo lo
  // que la cuenta protege.
  it('no cuadra la cuenta recortando el raspado', () => {
    expect(paso('Run scraper(s)')['timeout-minutes']).toBeGreaterThanOrEqual(22)
  })
})
