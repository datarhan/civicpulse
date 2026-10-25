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
 * El 18-10-2026 la misma revisión señaló el LEDE, que repetía el defecto con
 * otras palabras: «Casi toda la ampliación, el 90 %, fue a inversiones reales,
 * un capítulo que había empezado en cero». Se lee como 22 M€ de inversión que
 * no estaba presupuestada en enero, y eso sólo lo dice una de las dos fuentes.
 * El pie ya lo había resuelto; el lede no le preguntaba a CONPREL. Ahora los
 * dos leen la misma derivación (`ceroDelDominante`), y estas pruebas miran los
 * dos sitios para que no puedan volver a separarse.
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

/*
 * La ejecución sale del snapshot REAL publicado hasta el 2026-10-21, congelado.
 * Aquel snapshot tomaba la hoja de gastos del 2T de 2025 (impresa el
 * 30-06-2025) como cierre, y en ella Inversiones reales abría en 0 €; en la del
 * 4T, que es la que se publica ahora, abre con 905.517,35 €, como en CONPREL, y
 * el caso que esta guarda juzga ya no está en la página. La guarda sigue
 * valiendo para el ejercicio que de verdad abra un capítulo en cero.
 */
const HOJA_2T = resolve('tests/fixtures/budget-execution_publicado-2026-10-21_hoja-2t2025.json')
const publicado = (ruta) =>
  JSON.parse(
    readFileSync(
      ruta === '/data/budget-execution.json' ? HOJA_2T : resolve('public', `.${ruta}`),
      'utf8',
    ),
  )

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
const leeLede = (c) =>
  [...c.querySelectorAll('[data-lede="presupuesto"]')].map((el) => el.textContent)

/** El capítulo dominante en las dos fuentes, sobre un mapa ya clonado. */
const filaDominante = (mapa) => {
  const conprel = mapa['/data/budget.json'].snapshot
  const ejecucion = mapa['/data/budget-execution.json'].latest
  const dominante = capituloDominante(ejecucion.gastos.chapters, ejecucion.gastos.total)
  return {
    conprel,
    fila: conprel.expenseByEconomicChapter.find((c) => c.code === String(dominante.capitulo)),
  }
}

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
    // AL EURO, no en millones como el resto de la frase, y eso es deliberado:
    // la cifra es una remisión a la tarjeta de CONPREL de dos pantallas más
    // abajo, que la publica así. Con «0,91 M€» el lector tiene que convertir
    // para comprobar justo lo que la frase le invita a comprobar.
    expect(pie, 'el pie no dice cuánto le da la otra fuente, al euro').toMatch(/905\.517\s*€/)
    expect(pie, 'la remisión va en millones y la tarjeta de destino en euros').not.toMatch(
      /0,91 M€/,
    )
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

  it('el lede tampoco: atribuye el cero y da la cifra de CONPREL', async () => {
    const { piezas } = await pintaYLee(escenario(sirve()), 'es', { lee: leeLede })
    const lede = piezas.join(' ')
    expect(lede, 'no encuentro el lede').toMatch(/toda la ampliación/)
    expect(lede, 'el lede afirma el cero sin decir de qué fuente es').not.toMatch(
      /un capítulo que había empezado en cero/,
    )
    expect(lede, 'el lede no nombra al estado de ejecución').toMatch(/estado de ejecución/)
    expect(lede, 'el lede habla de un solo presupuesto aprobado').toMatch(/CONPREL/)
    expect(lede, 'el lede no dice cuánto le da la otra fuente, al euro').toMatch(/905\.517\s*€/)
  })

  it('y en valencià igual', async () => {
    const { piezas } = await pintaYLee(escenario(sirve()), 'ca', { lee: leeLede })
    const lede = piezas.join(' ')
    expect(lede, 'no encuentro el lede').toMatch(/tota l'ampliació/)
    expect(lede).not.toMatch(/un capítol que havia començat en zero/)
    expect(lede).toMatch(/CONPREL/)
    expect(lede).toMatch(/905\.517\s*€/)
  })

  it('cuando las dos coinciden en cero, el lede vuelve a ser el simple', async () => {
    const mapa = structuredClone(sirve())
    const { conprel, fila } = filaDominante(mapa)
    conprel.totalExpense -= fila.amount
    fila.amount = 0

    const { piezas } = await pintaYLee(escenario(mapa), 'es', { lee: leeLede })
    const lede = piezas.join(' ')
    expect(lede, 'con las dos fuentes en cero el cero ya no es de una').toMatch(
      /un capítulo que había empezado en cero/,
    )
    expect(lede).not.toMatch(/CONPREL/)
  })

  it('cuando CONPREL no trae ese capítulo, lede y pie lo dicen sin inventar cifra', async () => {
    const mapa = structuredClone(sirve())
    const { conprel, fila } = filaDominante(mapa)
    conprel.totalExpense -= fila.amount
    fila.amount = null

    const lede = (await pintaYLee(escenario(mapa), 'es', { lee: leeLede })).piezas.join(' ')
    expect(lede).not.toMatch(/un capítulo que había empezado en cero/)
    expect(lede).toMatch(/estado de ejecución/)
    expect(lede).toMatch(/CONPREL no trae cifra/)
    expect(lede, 'una cifra inventada para un capítulo sin dato').not.toMatch(/\b0\s*€/)

    const pie = (await pintaYLee(escenario(mapa), 'es', { lee: leePie })).piezas.join(' ')
    expect(pie).toMatch(/no trae dato de ese capítulo/)
  })

  it('con CONPREL de otro ejercicio, el pie no afirma nada de «los dos presupuestos»', async () => {
    // Hoy no ocurre (los dos snapshots son de 2025), pero basta con que el
    // Ayuntamiento publique el estado de ejecución de 2026 antes de que
    // Hacienda publique el CONPREL de 2026. El pie caía entonces en «no estaba
    // en ninguno de los dos presupuestos aprobados que publica esta página»
    // con un solo presupuesto de ese año cotejado: ninguno.
    const mapa = structuredClone(sirve())
    mapa['/data/budget.json'].snapshot.year -= 1

    const pie = (await pintaYLee(escenario(mapa), 'es', { lee: leePie })).piezas.join(' ')
    expect(pie, 'no encuentro el pie de la tarjeta de capítulos').toMatch(/toda la ampliación/)
    expect(pie).not.toMatch(/ninguno de los dos presupuestos/)
    expect(pie).toMatch(/estado de ejecución del propio Ayuntamiento/)
    expect(pie).toMatch(/no hay presupuesto remitido a CONPREL del mismo ejercicio/)
  })
})
