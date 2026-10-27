import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'
import { magnitudDelEjercicio } from '../../src/scraper/presupuesto-lectura'
import { magnitudesDe, revisarMagnitudes } from '../../src/scraper/magnitudes-fiscales'
import { ALLOWED_DEPARTMENT_SLUGS } from '../../src/scraper/departments'
import { partyOfAlcaldia } from '../../src/scraper/corporation-seats'
import { eur0, eurM } from '../../src/components/Presupuesto/FigurasEnBreve'
import { yearSpan } from '../../src/lib/year-span'
import { isCommittedContract } from '../../src/lib/contract-status'
import { AlcaldeBox } from '../../src/variants/direction-d/blocks/AlcaldeBox'
import {
  DepartamentosBlockD,
  PromesasBlockD,
} from '../../src/variants/direction-d/blocks/GovernmentBlocks'
import Departamentos from '../../src/pages/Departamentos'
import { installFetchMock } from '../setup/mockFetch'

/**
 * La columna de la portada, en el registro de un vecino (auditoría «dos
 * lecturas», 25-10-2026, portada §5–6):
 *
 * - los euros, redondeados donde se leen y exactos en el `title`, como la tira
 *   de indicadores: «67.072.869 € crédito definitivo 2025» pasa a «67,1 M€ tope
 *   de gasto 2025»;
 * - «12 · PSOE · 12» pasa a una frase, «12 promesas del partido de la alcaldía
 *   (PSOE)» —de la alcaldía y no «que gobierna»: el padrón no registra pactos de
 *   gobierno (`quienManda`)—;
 * - «28 · 26/28 · 21» pasa a una frase, y el 28 sale del registro de
 *   concejalías, no de un número escrito en el componente;
 * - las frases de método se van a su página. «Sin juicios automáticos de
 *   cumplimiento» no se muda a ninguna: el curador automático ha subido de
 *   «documentada» a «en progreso» promesas que esperan revisión, así que no es
 *   cierta.
 *
 * Las cifras esperadas salen de los mismos ficheros que la portada lee hoy.
 */

const datos = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const REAL = {
  '/data/officials.json': datos('officials.json'),
  '/data/promises.json': datos('promises.json'),
  '/data/plenos-agendas.json': datos('plenos-agendas.json'),
  '/data/budget.json': datos('budget.json'),
  '/data/budget-execution.json': datos('budget-execution.json'),
  '/data/tenders.json': datos('tenders.json'),
  '/data/bdns.json': datos('bdns.json'),
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  invalidateSnapshots()
})

function pinta(arbol, servir = REAL, idioma = 'es') {
  localStorage.setItem('cp:lang', idioma)
  installFetchMock(servir)
  return render(
    <LocaleProvider>
      <MemoryRouter>{arbol}</MemoryRouter>
    </LocaleProvider>,
  )
}

describe('AlcaldeBox · gobierno municipal en euros redondeados', () => {
  const m = magnitudDelEjercicio(
    REAL['/data/budget.json'].snapshot,
    REAL['/data/budget-execution.json'].latest,
  )
  const stats = REAL['/data/tenders.json'].stats
  const anios = yearSpan(
    REAL['/data/tenders.json'].contracts.filter(isCommittedContract).map((c) => c.awardDate),
  )

  it('mide algo: hoy el ejercicio tiene crédito definitivo y gasto', () => {
    expect(m?.etapa).toBe('definitivo')
    expect(m.ejecutado).toBeGreaterThan(0)
    expect(stats.awardedTotalEuros).toBeGreaterThan(0)
  })

  it('el presupuesto, redondeado y en palabras llanas; exacto en el title', async () => {
    const { container } = pinta(<AlcaldeBox />)
    const fecha = REAL['/data/budget-execution.json'].latest.fechaListado
    await waitFor(() =>
      expect(container.textContent).toContain(`${eurM(m.valor)} tope del presupuesto`),
    )
    expect(container.textContent).toContain(`${eurM(m.valor)} tope del presupuesto ${m.year}`)
    expect(container.textContent).toContain(`${eurM(m.ejecutado)} gastados a ${fecha}`)
    // La cifra a la unidad ya no se lee, pero sigue a un toque: en el title.
    expect(container.textContent).not.toContain(eur0(m.valor))
    const enlace = [...container.querySelectorAll('a[title]')].find((a) =>
      a.textContent.includes('tope del presupuesto'),
    )
    expect(enlace.getAttribute('title')).toContain(eur0(m.valor))
    expect(enlace.getAttribute('title')).toContain(eur0(m.ejecutado))
  })

  // «67,1 M€ tope de gasto 2025» ponía «gasto» pegado al crédito definitivo, y
  // la revisión lectora lo señaló con esta misma comprobación, sin modelo.
  it('ninguna cifra que no es gasto lleva al lado una palabra de gasto', async () => {
    const { container } = pinta(<AlcaldeBox />)
    await waitFor(() => expect(container.textContent).toContain('tope del presupuesto'))
    const M = magnitudesDe(REAL['/data/budget.json'], REAL['/data/budget-execution.json'])
    expect(M.length, 'mide algo: hay magnitudes con que comparar').toBeGreaterThan(0)
    const leido = [
      container.textContent,
      ...[...container.querySelectorAll('[title]')].map((e) => e.getAttribute('title')),
    ]
    for (const texto of leido) expect(revisarMagnitudes(texto, M), texto).toEqual([])
  })

  it('los contratos, redondeados y «sumados»; la suma exacta en el title', async () => {
    const { container } = pinta(<AlcaldeBox />)
    await waitFor(() => expect(container.textContent).toContain('contratos adjudicados'))
    expect(container.textContent).toContain(
      `${stats.awardedContracts} contratos adjudicados en ${anios}`,
    )
    expect(container.textContent).toContain(`${eurM(stats.awardedTotalEuros)} sumados`)
    expect(container.textContent).not.toContain(eur0(stats.awardedTotalEuros))
    const enlace = [...container.querySelectorAll('a[title]')].find((a) =>
      a.textContent.includes('contratos adjudicados'),
    )
    expect(enlace.getAttribute('title')).toContain(eur0(stats.awardedTotalEuros))
  })
})

describe('PromesasBlockD · una frase en vez de «12 · PSOE · 12»', () => {
  const items = REAL['/data/promises.json'].items
  const partido = partyOfAlcaldia(REAL['/data/officials.json'])

  it('mide algo: hoy todas las promesas son del partido de la alcaldía', () => {
    expect(items.length).toBeGreaterThan(1)
    expect(partido).toBeTruthy()
    expect(items.every((p) => p.party === partido)).toBe(true)
  })

  it('las cuenta como una frase y sin la frase de método', async () => {
    const { container } = pinta(<PromesasBlockD />)
    await waitFor(() =>
      expect(container.textContent).toContain(
        `${items.length} promesas del partido de la alcaldía (${partido})`,
      ),
    )
    expect(container.textContent).not.toContain(`${partido} · ${items.length}`)
    expect(container.textContent).not.toMatch(/juicios automáticos/i)
  })

  it('con promesas de varios partidos no dice «de la alcaldía»: las reparte por partido', async () => {
    const mezcla = {
      ...REAL,
      '/data/promises.json': {
        ...REAL['/data/promises.json'],
        items: [items[0], { ...items[1], party: 'PP' }, { ...items[2], party: 'PP' }],
      },
    }
    const { container } = pinta(<PromesasBlockD />, mezcla)
    await waitFor(() => expect(container.textContent).toContain('3 promesas, por partido:'))
    expect(container.textContent).toContain('PP · 2')
    expect(container.textContent).toContain(`${partido} · 1`)
    expect(container.textContent).not.toMatch(/alcaldía/)
  })

  it('el texto de la portada no promete lo que el curador automático sí hace', () => {
    for (const idioma of ['es', 'ca'])
      expect(CATALOGUE[idioma]['landing.promesas.blurb'], idioma).not.toMatch(/autom[aà]tic/i)
  })
})

describe('DepartamentosBlockD · una frase en vez de «28 · 26/28 · 21»', () => {
  const cobertura = REAL['/data/plenos-agendas.json'].stats.deptCoverage

  it('mide algo: hay concejalías sin responsable que conste', () => {
    expect(cobertura).toBeGreaterThan(0)
    expect(cobertura).toBeLessThan(ALLOWED_DEPARTMENT_SLUGS.length)
  })

  it('dice cuántas concejalías hay y en cuántas consta quién la lleva', async () => {
    const { container } = pinta(<DepartamentosBlockD />)
    await waitFor(() =>
      expect(container.textContent).toContain(
        `${ALLOWED_DEPARTMENT_SLUGS.length} concejalías; en ${cobertura} consta quién la lleva.`,
      ),
    )
    // Los 21 concejales, junto a 28 concejalías, se leían como que se las
    // reparten: la oposición no lleva ninguna. El pleno ya dice sus escaños.
    expect(screen.queryByText('Concejales')).toBeNull()
  })

  it('la frase de método se ha ido a /departamentos', async () => {
    for (const idioma of ['es', 'ca']) {
      expect(CATALOGUE[idioma]['landing.rendicion.blurb'], idioma).not.toMatch(
        /registr|autom[aà]tic/i,
      )
      expect(CATALOGUE[idioma]['departamentos.reglas'], idioma).toMatch(/registr/)
    }
    // Y la página la pinta, con sus datos de hoy.
    localStorage.setItem('cp:lang', 'es')
    globalThis.fetch = async (url) => {
      const ruta = String(url).replace(/^https?:\/\/[^/]+/, '')
      try {
        return new Response(readFileSync(`public${ruta}`, 'utf8'), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch {
        return new Response('not found', { status: 404 })
      }
    }
    const { container } = render(
      <LocaleProvider>
        <MemoryRouter>
          <Departamentos />
        </MemoryRouter>
      </LocaleProvider>,
    )
    const reglas = CATALOGUE.es['departamentos.reglas'].replace(
      '{casilla}',
      CATALOGUE.es['departamentos.card.quejas'],
    )
    await waitFor(() => expect(container.textContent).toContain(reglas))
  })
})
