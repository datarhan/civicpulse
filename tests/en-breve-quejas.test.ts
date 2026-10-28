import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  APOYOS_PARA_EL_LOTE,
  caminoDeUnaQueja,
  sindicEnBreve,
} from '../src/scraper/en-breve-quejas'
import { ESCALATION_PROFILES, LEGAL_CATALOG, plazoDeResolucion } from '../src/scraper/queja-router'

/**
 * La lectura vecinal de /quejas (auditoría de las dos lecturas, §18): cómo me
 * quejo, si me tienen que contestar y qué pasa si no. Cada cifra de las tres
 * tarjetas sale de un sitio que ya la tiene: el bot, el enrutador de quejas y el
 * índice del Síndic con sus fichas firmadas. Ninguna se escribe aquí.
 */
const raiz = join(__dirname, '..')
const leer = (f: string) => JSON.parse(readFileSync(join(raiz, 'public', 'data', f), 'utf8'))

describe('APOYOS_PARA_EL_LOTE', () => {
  it('es el umbral del bot: el sitio no puede prometer otro número que el que el bot cumple', () => {
    const fuente = readFileSync(join(raiz, 'bot', 'src', 'db', 'queries.ts'), 'utf8')
    const m = /export const VERIFIED_THRESHOLD = (\d+)/.exec(fuente)
    expect(m, 'el bot ya no declara VERIFIED_THRESHOLD').toBeTruthy()
    expect(APOYOS_PARA_EL_LOTE).toBe(Number(m![1]))
  })
})

describe('caminoDeUnaQueja — los plazos, del enrutador de quejas', () => {
  const c = caminoDeUnaQueja()

  it('el acuse es el paso del art. 21.4 LPACAP del perfil general', () => {
    const paso = ESCALATION_PROFILES.standard.find((p) => p.basis === LEGAL_CATALOG.LPACAP_21_4)
    expect(paso, 'el perfil general ya no trae el acuse').toBeTruthy()
    expect(c.acuseDias).toBe(paso!.whenDays)
  })

  it('los meses para contestar son los de plazoDeResolucion, general y de transparencia', () => {
    expect(c.meses).toBe(plazoDeResolucion('via_publica').amount)
    expect(c.mesesTransparencia).toBe(plazoDeResolucion('transparencia').amount)
    expect(plazoDeResolucion('via_publica').unit).toBe('months')
    expect(c.meses).toBeGreaterThan(c.mesesTransparencia)
  })

  it('y los apoyos, la constante', () => {
    expect(c.apoyos).toBe(APOYOS_PARA_EL_LOTE)
  })
})

describe('sindicEnBreve — el índice del Síndic y las fichas que hemos firmado', () => {
  const indice = leer('sindic-expedientes.json')
  const fichas: { expediente: string; fecha: string; titulo: string }[] = leer('sindic.json').items
  const s = sindicEnBreve({ indice, fichas })!

  it('lee datos de verdad', () => {
    expect(indice.contraAyuntamiento.length).toBeGreaterThan(10)
    expect(fichas.length).toBeGreaterThan(5)
  })

  it('los expedientes son los del registro con el Ayuntamiento como administración investigada', () => {
    expect(s.expedientes).toBe(indice.contraAyuntamiento.length)
    expect(s.desde).toBe(indice.cobertura.contraAyuntamientoDesde)
  })

  it('«le hizo recomendaciones al Ayuntamiento» son las fichas firmadas, no las resoluciones del índice', () => {
    // Una resolución de consideraciones va a la Conselleria: el índice cuenta una
    // más que las fichas, que sólo existen para las dirigidas al Ayuntamiento.
    expect(s.recomendaciones).toBe(fichas.length)
  })

  it('«por no responder» son las fichas cuyo título del Síndic dice «falta de respuesta»', () => {
    expect(s.porFaltaDeRespuesta).toBe(
      fichas.filter((f) => /falta de respuesta/i.test(f.titulo)).length,
    )
    expect(s.porFaltaDeRespuesta).toBeGreaterThan(0)
    expect(s.porFaltaDeRespuesta).toBeLessThanOrEqual(s.recomendaciones)
  })

  it('la más reciente es la ficha de fecha mayor, con su título literal', () => {
    const ultima = [...fichas].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
    expect(s.ultima).toEqual({ fecha: ultima.fecha, titulo: ultima.titulo })
  })

  it('sin índice, o sin su lista de expedientes, null; sin fichas, ninguna recomendación y ninguna última', () => {
    expect(sindicEnBreve({ indice: null, fichas })).toBeNull()
    // Un índice sin la lista no es «0 expedientes»: no se ha medido nada.
    const { contraAyuntamiento: _sinLista, ...sinLista } = indice
    expect(sindicEnBreve({ indice: sinLista, fichas })).toBeNull()
    const sinFichas = sindicEnBreve({ indice, fichas: [] })!
    expect(sinFichas.recomendaciones).toBe(0)
    expect(sinFichas.porFaltaDeRespuesta).toBe(0)
    expect(sinFichas.ultima).toBeNull()
  })
})
