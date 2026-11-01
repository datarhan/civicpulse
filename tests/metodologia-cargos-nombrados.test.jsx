/**
 * El contrato dice «cargo», no «persona», porque la puerta sabe de cargos.
 *
 * «Lo que nombra a una persona lleva siempre la firma de alguien del equipo»
 * prometía más de lo que nada comprobaba, y `src/scraper/cargos-nombrados.ts`
 * sólo conoce la plantilla: no hay lista de vecinos ni de empresas. Un «persona»
 * vuelto a estas frases repetiría el defecto con la puerta ya en su sitio.
 *
 * Se lee el texto RENDERIZADO, como en metodologia-citas-contraste: los
 * comentarios «Decía …» guardan a propósito la redacción vieja.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import Metodologia from '../src/pages/Metodologia'
import AvisoLegal from '../src/pages/AvisoLegal'
import { CATALOGUE } from '../src/i18n'

const realFetch = globalThis.fetch

beforeAll(() => {
  globalThis.fetch = async () => new Response('not found', { status: 404 })
})

afterAll(() => {
  globalThis.fetch = realFetch
  cleanup()
})

describe('En breve', () => {
  const frase = (lengua) => CATALOGUE[lengua]['metodologia.enBreve.maquina.frase']

  it('promete la firma para lo que la puerta cubre, en las dos lenguas', () => {
    expect(frase('es')).toContain('Un hallazgo o una promesa que afirme algo de un cargo concreto')
    expect(frase('es')).toContain('lleva siempre la firma')
    expect(frase('ca')).toContain('Una troballa o una promesa que afirme alguna cosa')
    expect(frase('ca')).toContain('porta sempre la firma')
  })

  it('no vuelve a prometerla para cualquier persona', () => {
    expect(frase('es')).not.toMatch(/nombra a una persona/)
    expect(frase('ca')).not.toMatch(/nomena una persona/)
  })
})

describe('/metodologia#politica-automatizacion', () => {
  let texto = ''

  beforeAll(() => {
    texto = render(<Metodologia />).container.querySelector('#politica-automatizacion').textContent
  })

  it('dice qué comprueban los dos procesos y qué no', () => {
    expect(texto).toContain('Comprueban los nombres de los cargos, no los de cualquier persona')
    expect(texto).toContain('auto-curación de /promesas y la del laboratorio de prensa')
  })

  it('no promete una firma para nombrar a cualquier persona', () => {
    expect(texto).not.toContain('Nombrar a una persona concreta')
    expect(texto).not.toContain('ninguna persona concreta')
  })

  it('dice dónde acaba lo retenido en prensa', () => {
    expect(texto).toContain('se queda sin publicar')
  })
})

describe('/aviso-legal', () => {
  it('lleva el mismo límite', () => {
    const texto = render(<AvisoLegal />).container.textContent
    expect(texto).toContain('que lo que sale solo no nombre a un cargo')
    expect(texto).toContain('No comprueban los nombres de otras personas')
  })
})
