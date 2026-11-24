import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { CATALOGUE, LocaleProvider } from '../src/i18n'
import { GLOSARIO, partesConTerminos } from '../src/glosario'
import { TarjetaEnBreve } from '../src/components/EnBreve'
import { AgendaRow } from '../src/components/plenos/AgendaRow'
import { TERMINOS_DE_ACCESO } from '../src/lib/empleo-publico'
import {
  PALABRAS_DEL_PLENO,
  SIGLAS_DEL_PLENO,
  vocabularioDelOrdenDelDia,
} from '../src/scraper/en-breve-plenos'
import { RetribucionesPanel } from '../src/pages/Cargos'
import { installFetchMock } from './setup/mockFetch'
import ispaPublicado from '../public/data/ispa.json'
import dedicacionesPublicadas from '../public/data/dedicaciones.json'
import officialsPublicados from '../public/data/officials.json'

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

  it('ninguna definición lleva una cifra ni un nombre de aquí', () => {
    // Una definición es verdad de cualquier ayuntamiento: el único número es el
    // año de una norma («de 1986»), nunca un importe ni un expediente.
    const nombres = officialsPublicados.officials.map((o) => o.name).filter(Boolean)
    expect(nombres.length, 'hay nombres con los que comparar').toBeGreaterThan(0)
    for (const clave of NUEVAS) {
      for (const cat of [ES, CA]) {
        const def = cat[`glosario.${clave}.def`]
        expect(def.replace(/\b1986\b/g, ''), clave).not.toMatch(/\d|€/)
        expect(def, clave).not.toMatch(/Riba-roja/)
        for (const n of nombres) expect(def, `${clave}: ${n}`).not.toContain(n)
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
    expect(CA['glosario.parteInformativa.def']).not.toMatch(/Els seus punts no es voten/)
    expect(CA['glosario.parteInformativa.def']).toMatch(/Allò de què es dona compte no es vota/)
  })

  it('la oferta de empleo no da un plazo: la lista de debajo trae «OEP 2020» sin estado', () => {
    // «Tres años» encima de «OEP 2020» dejaba deducir un incumplimiento que el
    // registro de procesos, sin fechas ni estado, no permite afirmar.
    expect(ES['glosario.oep.def']).not.toMatch(/años|plazo/)
    expect(CA['glosario.oep.def']).not.toMatch(/anys|termini/)
  })

  it('el ISPA no dice si su cifra lleva trienios: /cargos dice que la fuente no lo dice', () => {
    // La misma página publica que el ISPA «no dice si la suya incluye
    // antigüedad» (`cargos.ispa.trienios`); la definición no puede afirmarlo.
    expect(ES['cargos.ispa.trienios']).toMatch(/no dice si la suya incluye antigüedad/)
    expect(ES['glosario.ispa.def']).not.toMatch(/trienio|antigüedad/)
    expect(CA['glosario.ispa.def']).not.toMatch(/trienni|antiguitat/)
  })
})

describe('el orden del día nombra aparte las siglas de sus títulos', () => {
  it('RPT, PMS, ROF y PEF son palabras del pleno, con su entrada', () => {
    expect([...SIGLAS_DEL_PLENO].sort()).toEqual(['pef', 'pms', 'rof', 'rpt'])
    for (const p of SIGLAS_DEL_PLENO) {
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
    for (const p of SIGLAS_DEL_PLENO) expect(v).not.toContain(p)
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

  it('el panel de retribuciones pinta «ISPA» como botón, sin marca a la vista, y la definición fuera de la cabecera', async () => {
    installFetchMock({
      '/data/ispa.json': ispaPublicado,
      '/data/dedicaciones.json': dedicacionesPublicadas,
      '/data/officials.json': officialsPublicados,
    })
    const { container } = render(
      <LocaleProvider>
        <MemoryRouter>
          <RetribucionesPanel />
        </MemoryRouter>
      </LocaleProvider>,
    )
    const boton = await screen.findByRole('button', { name: 'ISPA' })
    expect(container.textContent).not.toContain('[[')
    fireEvent.click(boton)
    const def = document.getElementById(boton.getAttribute('aria-controls'))
    expect(def?.textContent).toContain(ES['glosario.ispa.def'])
    // Dentro de la cabecera flexible, abrirla empujaba el total a otra línea: la
    // definición va fuera de la fila que pone el título y el total lado a lado.
    const cabecera = boton.closest('div[style*="flex-wrap"]')
    expect(cabecera, 'la línea vive en la cabecera flexible').not.toBeNull()
    expect(cabecera.contains(def)).toBe(false)
  })
})
