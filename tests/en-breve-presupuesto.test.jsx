import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { CATALOGUE, LocaleProvider } from '../src/i18n'
import { GLOSARIO, partesConTerminos, textoLlano } from '../src/glosario'
import { useGlosario } from '../src/hooks/useGlosario'
import { invalidateSnapshots } from '../src/lib/snapshot-store'
import { cascadaGastos, capituloDominante } from '../src/scraper/presupuesto-lectura'
import { avanceDelAnio, enBrevePresupuesto } from '../src/scraper/en-breve-presupuesto'
import { magnitudesDe, revisarMagnitudes } from '../src/scraper/magnitudes-fiscales'
import EnBrevePresupuesto from '../src/components/Presupuesto/EnBrevePresupuesto'
import { installFetchMock } from './setup/mockFetch'
import { detectorDeCastellano, loQueSeLee } from './setup/castellano'
import { eurosBreves } from '../src/lib/formatters'

/**
 * «En breve», la primera capa de /presupuesto (docs/superpowers/specs/
 * 2026-10-21-lectura-vecinal-design.md). Un resumen sólo vale si dice lo mismo
 * que el detalle al que enlaza, así que se mide contra las funciones de la
 * sección de abajo y contra los snapshots PUBLICADOS: si el ejercicio cambia,
 * la prueba mide el ejercicio nuevo.
 */
const leer = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const BUDGET = leer('budget.json')
const EJEC = leer('budget-execution.json')
const DEUDA = leer('deuda-viva.json')
const GEO = leer('tender-geo.json')
const R = enBrevePresupuesto({ budget: BUDGET, ejecucion: EJEC, deuda: DEUDA, tenderGeo: GEO })

describe('las cifras salen de las mismas funciones que el detalle', () => {
  const c = cascadaGastos(EJEC.latest.gastos.total)

  it('mide algo: con los snapshots publicados, las cuatro respuestas existen', () => {
    expect(c?.cuadra, 'la cascada publicada ya no cuadra').toBe(true)
    expect(R.limite).not.toBeNull()
    expect(R.gastado).not.toBeNull()
    expect(R.enQue).not.toBeNull()
    expect(R.deuda).not.toBeNull()
    expect(R.barrio).not.toBeNull()
    expect(R.aprobado, 'con listado municipal no se resume el de CONPREL').toBeNull()
  })

  it('el tope y lo gastado son los de la cascada', () => {
    expect(R.limite.definitivo).toBe(c.definitivo)
    expect(R.limite.inicial + R.limite.modificaciones).toBeCloseTo(c.definitivo, 0)
    expect(R.gastado.ejecutado).toBe(c.ejecutado)
    expect(R.gastado.deCada100).toBe(Math.round(c.ejecutadoSobreDefinitivoPct))
  })

  it('el reparto suma lo gastado, y el dominante es el de capituloDominante', () => {
    const suma = R.enQue.filas.reduce((a, f) => a + f.ejecutado, 0)
    expect(suma).toBeCloseTo(c.ejecutado, 0)
    const cuotas = R.enQue.filas.reduce((a, f) => a + f.cuota, 0)
    expect(cuotas).toBeCloseTo(1, 6)
    const dom = capituloDominante(EJEC.latest.gastos.chapters, EJEC.latest.gastos.total)
    expect(R.enQue.dominante?.capitulo).toBe(dom?.capitulo)
  })

  it('la deuda y su comparación son las del Ministerio, sin redondeos propios', () => {
    expect(R.deuda.deudaEuros).toBe(DEUDA.ultimo.deudaEuros)
    expect(R.deuda.percentil).toBe(DEUDA.ultimo.percentil)
    expect(R.deuda.ceroDeCada100).toBe(
      Math.round((DEUDA.ultimo.reparto.aCero / DEUDA.ultimo.reparto.n) * 100),
    )
  })

  it('el barrio cuenta ZONAS (locatedAmount), no lugares sueltos', () => {
    const u = GEO.universe
    expect(R.barrio.deCada100).toBe(Math.round((u.locatedAmount / u.totalAmount) * 100))
  })

  it('la discrepancia de fuentes se dice cuando existe', () => {
    const conprel = BUDGET.snapshot.totalExpense
    const municipal = EJEC.latest.gastos.total.inicial
    if (BUDGET.snapshot.year === EJEC.latest.year && Math.abs(conprel - municipal) >= 1000)
      expect(R.limite.conprelDiscrepa).toBe(conprel)
    else expect(R.limite.conprelDiscrepa).toBeNull()
  })
})

describe('lo que no se puede responder es null, nunca un cero', () => {
  it('sin listado municipal: ni tope ni gastado, y el aprobado de CONPREL en su lugar', () => {
    const r = enBrevePresupuesto({ budget: BUDGET, ejecucion: { latest: null } })
    expect(r.limite).toBeNull()
    expect(r.gastado).toBeNull()
    expect(r.enQue).toBeNull()
    expect(r.aprobado).toEqual({ year: BUDGET.snapshot.year, total: BUDGET.snapshot.totalExpense })
  })

  it('una cascada que no cuadra no se resume', () => {
    const latest = structuredClone(EJEC.latest)
    latest.gastos.total.actual += 1_000_000
    const r = enBrevePresupuesto({ budget: BUDGET, ejecucion: { latest } })
    expect(r.limite).toBeNull()
    expect(r.gastado).toBeNull()
  })

  it('sin reparto no hay comparación, pero la deuda sigue', () => {
    const r = enBrevePresupuesto({
      deuda: { ultimo: { ejercicio: 2025, deudaEuros: 5, percentil: null, reparto: null } },
    })
    expect(r.deuda).toMatchObject({ deudaEuros: 5, percentil: null, ceroDeCada100: null })
  })

  it('sin población del mismo ejercicio no se divide por vecino', () => {
    const budget = { snapshot: { ...BUDGET.snapshot, year: 1999 } }
    const r = enBrevePresupuesto({ budget, ejecucion: EJEC, deuda: DEUDA })
    expect(r.limite.porVecino).toBeNull()
    expect(r.deuda.porVecino).toBeNull()
  })

  it('el avance del año sólo se lee de una fecha del mismo ejercicio', () => {
    expect(avanceDelAnio('31/12/2025', 2025)).toBe(1)
    expect(avanceDelAnio('30/06/2025', 2025)).toBeCloseTo(181 / 365, 3)
    expect(avanceDelAnio('15/01/2026', 2025)).toBeNull()
    expect(avanceDelAnio('2025-12-31', 2025)).toBeNull()
    expect(avanceDelAnio(null, 2025)).toBeNull()
  })
})

describe('el glosario', () => {
  const marcadas = (loc) =>
    Object.values(CATALOGUE[loc]).flatMap((v) =>
      [...String(v).matchAll(/\[\[(\w+)\|/g)].map((m) => m[1]),
    )

  it('mide algo: el catálogo marca términos en los dos idiomas', () => {
    expect(marcadas('es').length).toBeGreaterThan(0)
    expect(marcadas('ca').length).toBe(marcadas('es').length)
  })

  it('todo término marcado existe en el glosario y tiene definición en los dos idiomas', () => {
    for (const loc of ['es', 'ca'])
      for (const clave of marcadas(loc)) {
        expect(GLOSARIO, clave).toContain(clave)
        expect(CATALOGUE[loc][`glosario.${clave}.termino`], `${loc} ${clave}`).toBeTruthy()
        expect(CATALOGUE[loc][`glosario.${clave}.def`], `${loc} ${clave}`).toBeTruthy()
      }
  })

  it('cada clave tiene su fila en useGlosario, con un destino en la sección que la explica', () => {
    let filas = []
    function Lee() {
      filas = useGlosario()
      return null
    }
    render(
      <LocaleProvider>
        <Lee />
      </LocaleProvider>,
    )
    expect(filas.map((f) => f.clave).sort()).toEqual([...GLOSARIO].sort())
    for (const f of filas) {
      expect(f.termino, f.clave).not.toMatch(/^glosario\./)
      expect(f.def, f.clave).not.toMatch(/^glosario\./)
      expect(f.to, f.clave).toMatch(
        /^\/(presupuesto#(cascada|capitulos|deuda)|eficiencia#sec-(servicios|declaracion|entregas)|metodologia#rectificacion|plenos#ultimo-pleno|quejas#(sindic|consell-transparencia|ctbg|sindicatura))$/,
      )
    }
  })

  it('parte la frase y deja en texto llano una clave que no existe', () => {
    expect(partesConTerminos('Es un [[creditoDefinitivo|tope]], no [[inventada|x]].')).toEqual([
      'Es un ',
      { clave: 'creditoDefinitivo', texto: 'tope' },
      ', no ',
      'x',
      '.',
    ])
    expect(textoLlano('a [[deudaViva|b]] c')).toBe('a b c')
  })
})

function pinta(idioma) {
  localStorage.setItem('cp:lang', idioma)
  installFetchMock({
    '/data/budget.json': BUDGET,
    '/data/budget-execution.json': EJEC,
    '/data/deuda-viva.json': DEUDA,
    '/data/tender-geo.json': GEO,
  })
  return render(
    <MemoryRouter initialEntries={['/presupuesto']}>
      <LocaleProvider>
        <EnBrevePresupuesto />
        <Ubicacion />
      </LocaleProvider>
    </MemoryRouter>,
  )
}

/** Dónde ha dejado el selector al lector: la URL, que es lo que lee el mapa. */
function Ubicacion() {
  const { pathname, search, hash } = useLocation()
  return <output data-ubicacion="">{`${pathname}${search}${hash}`}</output>
}

/** Espera a que estén las cuatro tarjetas y la advertencia del mapa. */
async function listo(container) {
  await waitFor(() => {
    for (const id of ['limite', 'gastado', 'enQue', 'deuda', 'barrio'])
      expect(container.querySelector(`[data-en-breve="${id}"]`), id).not.toBeNull()
  })
}

afterEach(() => {
  localStorage.clear()
  invalidateSnapshots()
})

describe('lo que lee el vecino', () => {
  it('ninguna cifra que no es de ejecución va llamada «gastada»', async () => {
    const { container } = pinta('es')
    await listo(container)
    const texto = container.textContent
    // Mide algo: las dos cifras que más se confunden están en el texto.
    const m = eurosBreves
    expect(texto).toContain(m(R.limite.definitivo))
    expect(texto).toContain(m(R.gastado.ejecutado))
    const M = magnitudesDe(BUDGET, EJEC)
    expect(M.length).toBeGreaterThan(3)
    for (const tarjeta of container.querySelectorAll('[data-en-breve]'))
      expect(revisarMagnitudes(tarjeta.textContent, M), tarjeta.dataset.enBreve).toEqual([])
  })

  it('ningún hueco ni marca del glosario llega al lector, en ningún idioma', async () => {
    for (const idioma of ['es', 'ca']) {
      const { container, unmount } = pinta(idioma)
      await listo(container)
      const texto = loQueSeLee(container).join(' · ')
      expect(texto, idioma).not.toMatch(/\{\w+\}|\[\[|\]\]/)
      unmount()
      invalidateSnapshots()
    }
  })

  it('en valencià no queda nada en castellano', async () => {
    const { castellanoEn } = detectorDeCastellano(['CONPREL', 'Riba-roja'])
    const { container } = pinta('ca')
    await listo(container)
    expect(screen.getByRole('heading', { name: 'En resum' })).toBeInTheDocument()
    // El bloque, no el contenedor: la ruta que pinta `Ubicacion` es una URL.
    const texto = loQueSeLee(container.querySelector('[data-en-breve-bloque]')).join(' · ')
    expect(texto.length).toBeGreaterThan(200)
    expect(castellanoEn(texto)).toEqual([])
  })

  it('pulsar un término abre su definición, y volver a pulsarlo la cierra', async () => {
    const { container } = pinta('es')
    await listo(container)
    // El término del glosario va en la frase del gasto, que habla en pasado del
    // cierre y en presente de un año en curso: «gastó» o «gastados».
    const boton = screen.getByRole('button', { name: R.gastado.enCurso ? 'gastados' : 'gastó' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    const panel = document.getElementById(boton.getAttribute('aria-controls'))
    expect(panel?.textContent).toContain('No es lo mismo que lo pagado')
    expect(panel?.textContent).toContain('Obligaciones reconocidas')
    fireEvent.click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'false')
  })

  it('cada respuesta enlaza a una sección con nombre', async () => {
    const { container } = pinta('es')
    await listo(container)
    const anclas = [...container.querySelectorAll('[data-en-breve] > a.cp-en-breve-ancla')].map(
      (a) => a.getAttribute('href'),
    )
    expect(new Set(anclas)).toEqual(new Set(['#cascada', '#capitulos', '#deuda']))
  })
})

describe('el selector de barrio', () => {
  it('ofrece todas las zonas del mapa, y la que falta', async () => {
    const { container } = pinta('es')
    await listo(container)
    const opciones = [...screen.getByLabelText('Elige tu barrio').querySelectorAll('option')]
    const valores = opciones.map((o) => o.value).filter((v) => v && !v.startsWith('__'))
    expect(new Set(valores)).toEqual(new Set(GEO.zones.map((z) => z.slug)))
    expect(opciones.at(-1).textContent).toBe('Mi barrio no aparece')
    // Los recuentos son los del snapshot, no otros.
    const oliveral = GEO.zones.find((z) => z.slug === 'l-oliveral')
    if (oliveral)
      expect(opciones.find((o) => o.value === 'l-oliveral').textContent).toContain(
        `${oliveral.contractCount} contrato`,
      )
  })

  it('elegir no navega; «Ver sus contratos» lleva al mapa con la zona abierta', async () => {
    const { container } = pinta('es')
    await listo(container)
    const ubicacion = container.querySelector('[data-ubicacion]')
    const boton = screen.getByRole('button', { name: 'Ver sus contratos' })
    expect(boton).toBeDisabled()
    const slug = GEO.zones[0].slug
    fireEvent.change(screen.getByLabelText('Elige tu barrio'), { target: { value: slug } })
    expect(ubicacion.textContent).toBe('/presupuesto')
    fireEvent.click(boton)
    expect(ubicacion.textContent).toBe(`/presupuesto?barrio=${slug}#mapa-gasto-barrio`)
  })

  it('«Mi barrio no aparece» se contesta aquí, sin inventar un punto', async () => {
    const { container } = pinta('es')
    await listo(container)
    fireEvent.change(screen.getByLabelText('Elige tu barrio'), { target: { value: '__otro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver sus contratos' }))
    const aviso = container.querySelector('[data-barrio-otro]')
    expect(aviso?.textContent).toContain('No podemos situar contratos en tu barrio')
    expect(container.querySelector('[data-ubicacion]').textContent).toBe('/presupuesto')
    expect(screen.getByRole('link', { name: 'Avisar de un problema en tu calle' })).toHaveAttribute(
      'href',
      '/quejas',
    )
  })
})
