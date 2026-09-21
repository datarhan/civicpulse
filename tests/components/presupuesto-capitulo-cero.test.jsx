/**
 * «Ese crédito no estaba en el presupuesto que se aprobó» — ¿en cuál de los dos?
 *
 * /presupuesto publica DOS presupuestos aprobados para el mismo ejercicio y lo
 * dice con todas las letras: la tarjeta «Dos fuentes, dos presupuestos
 * aprobados» cierra con «cada cifra de esta página dice de cuál viene». El pie
 * de «Capítulo a capítulo» era la excepción. Decía, en singular y sin
 * atribuir, que el crédito del capítulo dominante no estaba en el presupuesto
 * aprobado — y para 2025 ese capítulo es Inversiones reales, al que el
 * presupuesto remitido a CONPREL da 905.517,35 € de entrada mientras el estado
 * de ejecución del propio ayuntamiento lo abre en 0 €.
 *
 * Las dos fuentes son oficiales, la página publica las dos y no se reconcilian.
 * Así que la frase no es un matiz: elige una de las dos sin decirlo, y elige
 * precisamente en el sitio donde las dos discrepan más (905.517,35 € de los
 * 3.978.414,11 € de diferencia total).
 *
 * Lo señaló la revisión lectora sobre /presupuesto el 20-09-2026, y se cotejó
 * contra los dos snapshots antes de creerlo — la revisión acierta alrededor de
 * la mitad de las veces, así que un señalamiento sin cotejar no es un defecto,
 * es una hipótesis.
 *
 * La guarda es de RENDER, no de catálogo: la frase se elige en el componente
 * según lo que digan los datos, así que una prueba sobre las cadenas no podría
 * ver cuál de las dos se pinta.
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import Presupuesto from '../../src/pages/Presupuesto'
import { contrastarPresupuesto } from '../../src/scraper/budget-contraste'
import { capituloDominante } from '../../src/scraper/presupuesto-lectura'
import { pintaYLee } from '../setup/pinta-y-lee'

vi.mock('react-leaflet', () => {
  const Pinta = ({ children }) => <div>{children}</div>
  return {
    MapContainer: Pinta,
    Circle: Pinta,
    Tooltip: Pinta,
    TileLayer: () => null,
    AttributionControl: () => null,
    Polyline: () => null,
    useMap: () => ({ invalidateSize: () => {} }),
  }
})

const publicado = (ruta) => JSON.parse(readFileSync(resolve('public', `.${ruta}`), 'utf8'))

const RUTAS = [
  '/data/budget.json',
  '/data/budget-execution.json',
  '/data/obras.json',
  '/data/bdns.json',
  '/data/deuda-viva.json',
  '/data/tenders.json',
  '/data/tenders-ted.json',
  '/data/tender-geo.json',
  '/data/cpv-labels.json',
  '/data/entities.json',
  '/data/geo.json',
  '/data/quejas.json',
  '/data/queja-contract-relations.json',
  '/data/queja-contract-relations-approved.json',
]
const sirve = () => Object.fromEntries(RUTAS.map((r) => [r, publicado(r)]))

const AL_PULSAR = [
  '/data/entities.json',
  '/data/quejas.json',
  '/data/queja-contract-relations.json',
  '/data/queja-contract-relations-approved.json',
]

const escenario = (mapa) => ({
  nombre: 'presupuesto · capítulo que abre en cero',
  fetch: mapa,
  pinta: () => <Presupuesto />,
  listo: (c) => Boolean(c.querySelector('[data-capitulo]')),
  alPulsar: AL_PULSAR,
})

/**
 * El pie de la tarjeta de capítulos, por su marca en el DOM.
 *
 * Filtrando el texto de la página por «toda la ampliación» se cuela también el
 * lede, que habla del mismo capítulo con otras palabras y no es lo que esta
 * guarda juzga. Leer por marca es lo que hace el resto del repo
 * (`data-capitulo`, `data-recuento`, `data-section-head`).
 */
const leePie = (c) => [...c.querySelectorAll('[data-pie="capitulos"]')].map((el) => el.textContent)

describe('/presupuesto · el capítulo que abre en cero dice en QUÉ presupuesto', () => {
  it('premisa: las dos fuentes discrepan sobre ese mismo capítulo', () => {
    // Medida, no supuesta. Si algún día CONPREL y el listado municipal
    // coincidieran en el capítulo dominante, la frase de abajo dejaría de tener
    // dos presupuestos que distinguir y esta guarda estaría comprobando un caso
    // que ya no existe. Entonces se pone roja y lo dice, en vez de pasar.
    const ejecucion = publicado('/data/budget-execution.json').latest
    const conprel = publicado('/data/budget.json').snapshot
    const dominante = capituloDominante(ejecucion.gastos.chapters, ejecucion.gastos.total)
    expect(dominante, 'ningún capítulo domina la ampliación').toBeTruthy()
    expect(dominante.abrioEnCero, 'el capítulo dominante ya no abre en cero').toBe(true)

    const contraste = contrastarPresupuesto(conprel, ejecucion)
    expect(contraste, 'no hay contraste que hacer entre las dos fuentes').toBeTruthy()
    const fila = contraste.capitulos.find((c) => c.code === String(dominante.capitulo))
    expect(fila, `CONPREL no publica el capítulo ${dominante.capitulo}`).toBeTruthy()
    expect(
      fila.conprel,
      `CONPREL también abre el capítulo ${dominante.capitulo} en cero: ya no hay discrepancia`,
    ).toBeGreaterThan(0)
    expect(fila.municipal).toBe(0)
  })

  it('el pie nombra la otra fuente y publica su cifra', async () => {
    const { piezas } = await pintaYLee(escenario(sirve()), 'es', { lee: leePie })
    const pie = piezas.join(' ')
    expect(pie, 'no encuentro el pie de la tarjeta de capítulos').toBeTruthy()
    expect(pie, 'el pie habla de un solo presupuesto aprobado').toMatch(/CONPREL/)
    // La cifra de la otra fuente, escrita como la escribe la página.
    expect(pie, 'el pie no dice cuánto le da la otra fuente').toMatch(/0,9\d M€|905\.517/)
  })

  it('y no afirma en singular que el crédito no estuviera aprobado', async () => {
    const { piezas } = await pintaYLee(escenario(sirve()), 'es', { lee: leePie })
    expect(piezas.join(' ')).not.toMatch(/no estaba en el presupuesto que se aprobó/)
  })

  it('cuando las dos fuentes SÍ coinciden, la frase vuelve a ser la simple', async () => {
    // El otro lado de la puerta. Sin esto, un pie que dijera SIEMPRE «según
    // CONPREL…» pasaría las dos afirmaciones de arriba sin distinguir nada,
    // que es la guarda verde por no mirar.
    const mapa = structuredClone(sirve())
    const conprel = mapa['/data/budget.json'].snapshot
    const ejecucion = mapa['/data/budget-execution.json'].latest
    const dominante = capituloDominante(ejecucion.gastos.chapters, ejecucion.gastos.total)
    const fila = conprel.expenseByEconomicChapter.find((c) => c.code === String(dominante.capitulo))
    conprel.totalExpense -= fila.amount
    fila.amount = 0

    const { piezas } = await pintaYLee(escenario(mapa), 'es', { lee: leePie })
    const pie = piezas.join(' ')
    expect(pie, 'no encuentro el pie de la tarjeta de capítulos').toBeTruthy()
    expect(pie, 'sigue citando a CONPREL cuando las dos fuentes coinciden').not.toMatch(/CONPREL/)
  })
})
