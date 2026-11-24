import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'

import { CATALOGUE, LocaleProvider } from '../src/i18n'
import { GLOSARIO, partesConTerminos } from '../src/glosario'
import { TarjetaEnBreve } from '../src/components/EnBreve'
import { AgendaRow } from '../src/components/plenos/AgendaRow'
import { TERMINOS_DE_ACCESO } from '../src/lib/empleo-publico'
import { PALABRAS_DEL_PLENO, vocabularioDelOrdenDelDia } from '../src/scraper/en-breve-plenos'

/**
 * El glosario, segunda tanda (plan «dos lecturas», 4a.7): las siglas y palabras
 * de la sede que las páginas imprimían sin decir qué son. Sólo definiciones:
 * ninguna cambia lo que una página afirma.
 */
const NUEVAS = [
  'ispa',
  'rpt',
  'bop',
  'dedicacion',
  'oep',
  'pms',
  'rof',
  'pef',
  'parteInformativa',
  'memoriaJustificativa',
]
const ES = CATALOGUE.es
const CA = CATALOGUE.ca

const terminosDe = (cat, clave) =>
  partesConTerminos(cat[clave])
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

  // Cuatro, no tres: la del plan económico-financiero lleva «es una medida de
  // corrección, no una sanción», que es lo que impide leerla como castigo.
  it.each(NUEVAS)('%s se lee de un vistazo: cuatro frases como mucho', (clave) => {
    for (const cat of [ES, CA]) {
      const frases = cat[`glosario.${clave}.def`].split(/(?<=\.)\s+/).filter(Boolean)
      expect(frases.length).toBeLessThanOrEqual(4)
    }
  })

  it('ninguna definición lleva una cifra del Ayuntamiento ni una sigla del año', () => {
    // Una definición es verdad de cualquier ayuntamiento: los años que salen son
    // los de una norma («de 1986»), nunca los de un expediente de aquí.
    for (const clave of NUEVAS) {
      for (const cat of [ES, CA]) {
        const def = cat[`glosario.${clave}.def`]
        expect(def, clave).not.toMatch(/€|\d+[.,]\d/)
        expect(def, clave).not.toMatch(/Riba-roja/)
      }
    }
  })

  it('el plan económico-financiero dice que corrige, no que castiga', () => {
    expect(ES['glosario.pef.def']).toMatch(/no una sanción/)
    expect(CA['glosario.pef.def']).toMatch(/no una sanció/)
  })

  it('la parte informativa no dice que nada de ella se vota: sólo lo que se da cuenta', () => {
    // Art. 46.2.e LBRL: la parte de control incluye mociones, que se votan.
    expect(ES['glosario.parteInformativa.def']).not.toMatch(/Sus puntos no se votan/)
    expect(ES['glosario.parteInformativa.def']).toMatch(/De lo que se da cuenta no se vota/)
  })

  it('la oferta de empleo no pone «tres años» al lado de un año de oferta', () => {
    // «OEP 2020» y «tres años» dejaban deducir un incumplimiento que no consta:
    // el registro de procesos no trae su estado.
    for (const cat of [ES, CA]) expect(cat['glosario.oep.def']).not.toMatch(/OEP \d{4}/)
  })
})

describe('el orden del día nombra aparte las siglas de sus títulos', () => {
  it('RPT, PMS, ROF y PEF son palabras del pleno, con su entrada', () => {
    for (const p of ['rpt', 'pms', 'rof', 'pef']) {
      expect(PALABRAS_DEL_PLENO).toContain(p)
      expect(typeof ES[`plenos.palabra.${p}`]).toBe('string')
      expect(typeof CA[`plenos.palabra.${p}`]).toBe('string')
    }
  })

  const punto = (title) => ({ number: 1, title, section: 'resolutiva' })
  it.each([
    ['rpt', "Expedient: 3947/2025/GEN, Aprovació sobre mesures d'actualització de la RPT i xifra"],
    ['rpt', 'APROVACIÓ DE LA MODIFICACIÓ PUNTUAL Núm. IV/2023 DE LA VIGENT RPT, SOBRE'],
    ['pms', 'Aprobación transferencia de crédito … del crédito PMS 2022 dentro del mismo proyecto'],
    ['rof', 'Moción conjunta … sobre el ROF (Reglamento de Organización y Funcionamiento'],
    ['pef', 'Dación de cuenta al Pleno del seguimiento del plan económico-financiero, (PEF) del'],
  ])('«%s» en «%s»', (palabra, titulo) => {
    expect(vocabularioDelOrdenDelDia([punto(titulo)])).toContain(palabra)
  })

  it.each([
    'Aprobación del PROFESORADO de la escuela',
    'Reglamento de la RPTX del consorcio',
    'Moción sobre el PEFC forestal',
  ])('ninguna sigla dentro de otra palabra: «%s»', (titulo) => {
    const v = vocabularioDelOrdenDelDia([punto(titulo)])
    for (const p of ['rpt', 'pms', 'rof', 'pef']) expect(v).not.toContain(p)
  })
})

describe('el rótulo de la parte de cada punto abre su definición', () => {
  const fila = (section) => (
    <LocaleProvider>
      <AgendaRow item={{ number: 3, title: 'Un punto', section }} />
    </LocaleProvider>
  )

  it('«Resolutiva» abre la parte resolutiva', () => {
    render(fila('resolutiva'))
    fireEvent.click(screen.getByRole('button', { name: ES['pleno.seccion.resolutiva'] }))
    expect(document.body.textContent).toContain(ES['glosario.parteResolutiva.def'])
  })

  it('«Informativa» abre la parte informativa', () => {
    render(fila('informativa'))
    fireEvent.click(screen.getByRole('button', { name: ES['pleno.seccion.informativa'] }))
    expect(document.body.textContent).toContain(ES['glosario.parteInformativa.def'])
  })

  it('«Ruegos y preguntas» sigue siendo un rótulo, sin botón', () => {
    render(fila('ruegos'))
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.body.textContent).toContain(ES['pleno.seccion.ruegos'])
  })
})

describe('/empleo-publico define la oferta de empleo con las vías de acceso', () => {
  it('la OEP está en «¿Cómo se entra?»', () => {
    expect(TERMINOS_DE_ACCESO).toContain('oep')
  })
})

describe('/cargos ata la dedicación y el ISPA', () => {
  it('«con sueldo fijado por el pleno» abre la dedicación, en los dos idiomas', () => {
    expect(terminosDe(ES, 'cargos.enBreve.sueldos.cifraNota')).toEqual(['dedicacion'])
    expect(terminosDe(CA, 'cargos.enBreve.sueldos.cifraNota')).toEqual(['dedicacion'])
  })

  it('la nota de la cifra de una tarjeta pinta sus términos como botones', () => {
    render(
      <LocaleProvider>
        <TarjetaEnBreve
          id="x"
          pregunta="¿?"
          cifra="7 de 21"
          cifraNota="con [[dedicacion|sueldo fijado por el pleno]]"
          frases={['Una frase.']}
        />
      </LocaleProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'sueldo fijado por el pleno' }))
    expect(document.body.textContent).toContain(ES['glosario.dedicacion.def'])
  })

  it('la línea del total de retribuciones abre el ISPA', () => {
    expect(terminosDe(ES, 'cargos.ispa.total')).toEqual(['ispa'])
    expect(terminosDe(CA, 'cargos.ispa.total')).toEqual(['ispa'])
  })

  it('Cargos.jsx pinta esa línea con sus términos, no con `t()` a secas', () => {
    const src = readFileSync('src/pages/Cargos.jsx', 'utf8')
    expect(src).toMatch(/FraseConTerminos/)
  })
})
