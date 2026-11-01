/**
 * La lectura vecinal de /quejas, «Cómo quejarse y qué pasa después», en los dos
 * idiomas: lo que dice sale del bot, del enrutador de quejas y del Síndic, y en
 * valencià no se queda nada en castellano salvo lo que es dato (el título que el
 * Síndic da a un expediente se reproduce literal).
 *
 * Se pinta el bloque solo, con los dos ficheros del Síndic que pide. Un segundo
 * escenario le quita al índice su cobertura y a las fichas sus «falta de
 * respuesta», para que las frases de esos casos no nazcan sin leer.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { EnBreveQuejas } from '../../src/components/Quejas/EnBreveQuejas'
import { CATALOGUE } from '../../src/i18n'
import { fmtDateLong } from '../../src/lib/formatters'
import { caminoDeUnaQueja, sindicEnBreve } from '../../src/scraper/en-breve-quejas'
import {
  cadenasDe,
  datosPintados,
  detectorDeCastellano,
  masLargasPrimero,
} from '../setup/castellano'
import { pintaYLee } from '../setup/pinta-y-lee'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const INDICE = lee('sindic-expedientes.json')
const FICHAS = lee('sindic.json')

/** Nombres que se escriben igual en los dos idiomas. */
const SIGLAS = ['Síndic de Greuges', 'Telegram', 'Comunitat Valenciana']

const escenario = (nombre, indice, fichas) => ({
  nombre,
  fetch: { '/data/sindic-expedientes.json': indice, '/data/sindic.json': fichas },
  pinta: () => <EnBreveQuejas bot="https://t.me/munigraph_bot" />,
  listo: (c) => c.querySelector('[data-en-breve="sindic"]') !== null,
})

/** Sin cobertura en el índice y sin ninguna ficha titulada «falta de respuesta». */
function sinCoberturaNiFalta() {
  const indice = structuredClone(INDICE)
  delete indice.cobertura
  const fichas = structuredClone(FICHAS)
  fichas.items = fichas.items.filter((f) => !/falta de respuesta/i.test(f.titulo))
  return { indice, fichas }
}

const otro = sinCoberturaNiFalta()
const ESCENARIOS = [
  escenario('lo publicado', INDICE, FICHAS),
  escenario('sin cobertura ni «falta de respuesta»', otro.indice, otro.fichas),
]

describe('/quejas · «Cómo quejarse y qué pasa después»', () => {
  it('dice las cifras del bot, del enrutador y del Síndic', async () => {
    const c = caminoDeUnaQueja()
    const s = sindicEnBreve({ indice: INDICE, fichas: FICHAS.items })
    const { piezas } = await pintaYLee(ESCENARIOS[0], 'es')
    const texto = piezas.join('\n')
    expect(texto).toContain(`Si ${c.apoyos} vecinos la apoyan`)
    expect(texto).toContain(`tiene ${c.acuseDias} días para acusar recibo y ${c.meses} meses`)
    expect(texto).toContain(String(s.expedientes))
    expect(texto).toContain(`En ${s.recomendaciones} de esos expedientes`)
    expect(texto).toContain(`${s.porFaltaDeRespuesta} de ellos los titula`)
    expect(texto).toContain(`«${s.ultima.titulo}»`)
    expect(texto).toContain(fmtDateLong(s.ultima.fecha, 'es'))
  }, 60000)

  it.each(ESCENARIOS)(
    '$nombre: en valencià, nada en castellano que no sea dato',
    async (esc) => {
      const es = await pintaYLee(esc, 'es')
      const ca = await pintaYLee(esc, 'ca')
      expect(es.pedidasSinServir).toEqual([])
      expect(ca.piezas.length).toBe(es.piezas.length)
      const datos = datosPintados(es.piezas, cadenasDe(esc.fetch))
      const { castellanoEn, sinTraducir } = detectorDeCastellano(
        masLargasPrimero([...datos, ...SIGLAS]),
      )
      expect
        .soft([...new Set(ca.piezas.flatMap((p) => castellanoEn(p)))], 'castellano en valencià')
        .toEqual([])
      expect
        .soft(
          [...new Set(sinTraducir(es.piezas.map((p, i) => [p, ca.piezas[i]])))],
          'se lee igual en los dos idiomas',
        )
        .toEqual([])
    },
    60000,
  )

  it('cada cadena quejas.enBreve.* se pinta en algún escenario', async () => {
    // El plural de transparencia no se puede pintar: la ley da un mes (art. 20 Ley
    // 19/2013), y la frase existe por si un día no.
    const SIN_ESCENARIO = new Set(['quejas.enBreve.plazo.transparencia'])
    const claves = Object.keys(CATALOGUE.es).filter(
      (k) => k.startsWith('quejas.enBreve.') && !SIN_ESCENARIO.has(k),
    )
    expect(claves.length).toBeGreaterThan(20)
    const leido = []
    for (const esc of ESCENARIOS) leido.push(...(await pintaYLee(esc, 'es')).piezas)
    // Las etiquetas de accesibilidad no son texto pintado: se leen del DOM aparte.
    const texto = leido.join('\n') + '\n' + CATALOGUE.es['quejas.enBreve.plazo.figura']
    const sinPintar = claves.filter((clave) =>
      CATALOGUE.es[clave]
        .split(/\{\w+\}/)
        .map((trozo) => trozo.replace(/[↓→↗]/g, '').trim())
        .filter((trozo) => /\p{L}/u.test(trozo))
        .some((trozo) => !texto.includes(trozo)),
    )
    expect(sinPintar).toEqual([])
  }, 120000)
})
