import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'

import { CATALOGUE, LocaleProvider } from '../src/i18n'
import { GLOSARIO, partesConTerminos } from '../src/glosario'
import { TarjetaEnBreve } from '../src/components/EnBreve'
import { TECHO_MENOR_SIN_IVA } from '../src/scraper/contratos-menores'
import { entero } from '../src/lib/formatters'

/**
 * El vocabulario de la contratación en el glosario. El plan contaba unos treinta
 * términos y `/contratos` publicaba «negociados sin publicidad» y «concesión» sin
 * decir qué son: dos palabras que un vecino lee distinto de lo que significan.
 */
const NUEVAS = [
  'adjudicado',
  'licitacion',
  'contratoMenor',
  'negociadoSinPublicidad',
  'concesion',
  'lote',
  'ute',
  'pliego',
  'lpacap',
]
const ES = CATALOGUE.es
const CA = CATALOGUE.ca

const terminosDe = (clave) =>
  partesConTerminos(ES[clave])
    .filter((p) => typeof p !== 'string')
    .map((p) => p.clave)

afterEach(() => localStorage.clear())

describe('las entradas nuevas', () => {
  it.each(NUEVAS)('%s está en el glosario y en los dos idiomas, traducida', (clave) => {
    expect(GLOSARIO).toContain(clave)
    for (const lado of ['termino', 'def']) {
      const k = `glosario.${clave}.${lado}`
      expect(typeof ES[k], k).toBe('string')
      expect(typeof CA[k], k).toBe('string')
    }
    expect(CA[`glosario.${clave}.def`]).not.toBe(ES[`glosario.${clave}.def`])
  })

  it.each(NUEVAS)('%s se lee de un vistazo: tres frases como mucho', (clave) => {
    for (const cat of [ES, CA]) {
      const frases = cat[`glosario.${clave}.def`].split(/(?<=\.)\s+/).filter(Boolean)
      expect(frases.length).toBeLessThanOrEqual(3)
    }
  })

  it('los límites del contrato menor son los del art. 118, no una copia a mano', () => {
    const euros = (n) => entero(n)
    for (const cat of [ES, CA]) {
      const def = cat['glosario.contratoMenor.def']
      expect(def).toContain(euros(TECHO_MENOR_SIN_IVA.construction))
      expect(def).toContain(euros(TECHO_MENOR_SIN_IVA.services))
      expect(def).toContain(euros(TECHO_MENOR_SIN_IVA.supplies))
    }
  })

  it('el negociado dice que la ley lo limita, y desde cuándo', () => {
    const def = ES['glosario.negociadoSinPublicidad.def']
    expect(def).toMatch(/Hoy la ley sólo lo permite/)
    expect(def).toMatch(/artículo 168/)
    // 39 de los 103 son de 2017–18: decir sólo la ley vigente los haría parecer
    // irregulares, y la anterior los permitía por importe (RDL 3/2011, art. 174.e).
    expect(def).toMatch(/hasta 2018 también se podía por importe/)
    expect(CATALOGUE.ca['glosario.negociadoSinPublicidad.def']).toMatch(/fins al 2018/)
  })

  it('la concesión no promete qué mide cada importe: sólo el del agua es su valor estimado', () => {
    // Los bares también son concesiones (1892773#…): su importe es menor que su
    // valor estimado y el registro no dice qué es.
    expect(ES['glosario.concesion.def']).toMatch(/En la del agua/)
    expect(ES['glosario.concesion.def']).not.toMatch(/Su importe es/)
  })
})

describe('«En breve» de /contratos abre sus términos', () => {
  it('«¿cuánto?» ata lo adjudicado, y cada lote cuenta como un contrato', () => {
    expect(terminosDe('contratos.enBreve.cuanto.frase')).toEqual(['adjudicado'])
    expect(terminosDe('contratos.enBreve.cuanto.lotes')).toEqual(['lote'])
  })

  it('la salvedad de la concesión ata la concesión', () => {
    expect(terminosDe('contratos.enBreve.cuanto.mayorConcesion')).toEqual(['concesion'])
  })

  it('«¿sin concurso?» ata las tres palabras de la vía', () => {
    expect(terminosDe('contratos.enBreve.sinConcurso.frase')).toEqual([
      'licitacion',
      'contratoMenor',
      'negociadoSinPublicidad',
    ])
  })
})

describe('«con carácter general» dice qué regla es', () => {
  it('el plazo de una queja ata la ley que lo fija', () => {
    expect(terminosDe('quejas.enBreve.plazo.frase')).toEqual(['lpacap'])
  })
})

describe('la salvedad de una tarjeta abre términos', () => {
  it('pinta el término como botón y abre su definición', () => {
    render(
      <LocaleProvider>
        <TarjetaEnBreve
          id="x"
          pregunta="¿?"
          frases={['Una frase.']}
          salvedad="Una sola [[concesion|concesión]] pesa."
        />
      </LocaleProvider>,
    )
    const boton = screen.getByRole('button', { name: 'concesión' })
    expect(boton.closest('.cp-en-breve-salvedad')).toBeTruthy()
    fireEvent.click(boton)
    expect(document.body.textContent).toContain(ES['glosario.concesion.def'])
  })
})

/**
 * «Deuda pública» es un PROGRAMA, no un capítulo. `budget.json` lo trae en
 * `expenseByProgram` por 1,1 M€, y los capítulos que atienden la deuda son el 3 y
 * el 9, con otras cifras. Lo señaló la revisión lectora el 1-11-2026: la definición
 * y la nota de la deuda decían «capítulo» y otra frase de la misma página, «programa».
 */
describe('«Deuda pública» se llama como lo publica la fuente', () => {
  const { snapshot } = JSON.parse(readFileSync('public/data/budget.json', 'utf8'))

  it('es un programa y no un capítulo, en el dato', () => {
    expect(snapshot.expenseByProgram.some((p) => p.label === 'Deuda pública')).toBe(true)
    expect(snapshot.expenseByEconomicChapter.some((c) => /deuda/i.test(c.label))).toBe(false)
  })

  it('ninguna frase lo llama capítulo', () => {
    const malas = [
      ...Object.values(ES).filter((v) => /cap[ií]tulo «Deuda pública»/i.test(String(v))),
      ...Object.values(CA).filter((v) => /cap[ií]tol «Deute públic»/i.test(String(v))),
    ]
    expect(malas).toEqual([])
  })
})
