/**
 * /metodologia ordenada por lo que el lector viene a comprobar (auditoría de las
 * dos lecturas, §28): grupos, un índice y cada apartado abierto con una frase.
 *
 * La página es el contrato editorial publicado, así que lo que importa es que el
 * índice y la página no puedan separarse: los grupos se declaran una vez
 * (`components/metodologia/grupos.js`) y aquí se comparan con lo que se pinta, en
 * el orden en que se pinta. Una sección nueva sin grupo o sin frase, o un grupo
 * cuyas secciones se desperdiguen por la página, pone esto en rojo.
 *
 * Y la frase no puede prometer de más: se escribe a mano y resume una regla, así
 * que no copia un plazo ni una cifra —la cifra vive en la regla, y aquí
 * envejecería sola— y es una sola frase de verdad.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import Metodologia from '../src/pages/Metodologia'
import { CATALOGUE } from '../src/i18n'
import { invalidateSnapshots } from '../src/lib/snapshot-store'
import {
  ANCLA_INDICE,
  GRUPOS_METODOLOGIA,
  anclaDeGrupo,
  grupoEnPosicion,
} from '../src/components/metodologia/grupos'
import { detectorDeCastellano } from './setup/castellano'

const OFFICIALS = readFileSync(join(__dirname, '..', 'public/data/officials.json'), 'utf8')
const SECCIONES = GRUPOS_METODOLOGIA.flatMap((g) => g.secciones)

const realFetch = globalThis.fetch
const realScrollTo = window.scrollTo
let pagina

beforeAll(async () => {
  globalThis.fetch = async (url) =>
    String(url).endsWith('/data/officials.json')
      ? new Response(OFFICIALS, { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('not found', { status: 404 })
  window.scrollTo = vi.fn()
  invalidateSnapshots()
  const { container } = render(<Metodologia />)
  // Sin el padrón esa sección no se monta, y la comparación de abajo mentiría.
  await waitFor(() => expect(container.querySelector('#mudanza-portal')).not.toBeNull())
  pagina = container
})

afterAll(() => {
  globalThis.fetch = realFetch
  window.scrollTo = realScrollTo
  invalidateSnapshots()
  cleanup()
})

describe('los grupos', () => {
  it('cada sección está en un solo grupo', () => {
    expect(SECCIONES.length).toBeGreaterThan(0)
    expect(new Set(SECCIONES).size).toBe(SECCIONES.length)
    expect(new Set(GRUPOS_METODOLOGIA.map((g) => g.id)).size).toBe(GRUPOS_METODOLOGIA.length)
    for (const g of GRUPOS_METODOLOGIA) expect(g.secciones.length).toBeGreaterThan(0)
  })

  it('cada apartado de la página está en un grupo, en el orden en que se lee', () => {
    const tarjetas = [...pagina.querySelectorAll('.cp-card')].filter(
      (t) => !t.closest('[data-en-breve-bloque]'),
    )
    expect(tarjetas.length).toBeGreaterThan(0)
    expect(tarjetas.map((t) => t.id)).toEqual(SECCIONES)
  })

  it('cada grupo abre con su título, y sus apartados quedan entre él y el siguiente', () => {
    const orden = [...pagina.querySelectorAll('h2[data-grupo-metodologia], .cp-card[id]')]
      .filter((n) => !n.closest('[data-en-breve-bloque]'))
      .map((n) => n.id)
    expect(orden).toEqual(GRUPOS_METODOLOGIA.flatMap((g) => [anclaDeGrupo(g.id), ...g.secciones]))
  })

  it('los títulos no saltan de nivel: grupo, apartado, subapartado', () => {
    const niveles = [...pagina.querySelectorAll('h1, h2, h3, h4, h5')]
      .filter((h) => !h.closest('[data-en-breve-bloque]') && !h.closest('nav'))
      .map((h) => Number(h.tagName[1]))
    expect(niveles[0]).toBe(1)
    niveles.forEach((n, i) => {
      if (i > 0)
        expect(n, `el título ${i} salta de h${niveles[i - 1]} a h${n}`).toBeLessThanOrEqual(
          niveles[i - 1] + 1,
        )
    })
    for (const s of SECCIONES)
      expect(pagina.querySelector(`[id="${s}"] h3`), `#${s} sin h3`).not.toBeNull()
  })

  it('el índice dice en cada momento en qué grupo estás', () => {
    const cabeceras = [
      { id: 'a', top: 100 },
      { id: 'b', top: 900 },
      { id: 'c', top: 2000 },
    ]
    expect(grupoEnPosicion(cabeceras, 0)).toBe('a')
    expect(grupoEnPosicion(cabeceras, 100)).toBe('a')
    expect(grupoEnPosicion(cabeceras, 899)).toBe('a')
    expect(grupoEnPosicion(cabeceras, 900)).toBe('b')
    expect(grupoEnPosicion(cabeceras, 99999)).toBe('c')
    expect(grupoEnPosicion([], 500)).toBeNull()
  })
})

describe('el índice', () => {
  const plegado = () => pagina.querySelector(`[id="${ANCLA_INDICE}"]`)
  const lateral = () => pagina.querySelector('[data-indice-lateral]')

  it('el plegado lista cada grupo y cada apartado, y sólo cuando se abre', () => {
    const detalles = plegado().querySelector('details')
    expect(detalles.querySelector('a')).toBeNull()
    fireEvent(detalles, new Event('toggle', { bubbles: false }))
    detalles.open = true
    fireEvent(detalles, new Event('toggle', { bubbles: false }))
    const hrefs = [...detalles.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(
      GRUPOS_METODOLOGIA.flatMap((g) => [
        `#${anclaDeGrupo(g.id)}`,
        ...g.secciones.map((s) => `#${s}`),
      ]),
    )
  })

  it('el lateral lista los grupos y despliega sólo el que se está leyendo', () => {
    const nav = within(lateral())
    expect(nav.getAllByRole('link').length).toBe(
      GRUPOS_METODOLOGIA.length + GRUPOS_METODOLOGIA[0].secciones.length,
    )
    const actual = lateral().querySelector('[aria-current="true"]')
    expect(actual.getAttribute('href')).toBe(`#${anclaDeGrupo(GRUPOS_METODOLOGIA[0].id)}`)
  })

  it('cada destino del índice existe una sola vez en la página', () => {
    for (const id of [...GRUPOS_METODOLOGIA.map((g) => anclaDeGrupo(g.id)), ...SECCIONES]) {
      expect(pagina.querySelectorAll(`[id="${id}"]`).length, `#${id}`).toBe(1)
    }
  })
})

describe('«En una frase»', () => {
  it('cada apartado abre con la suya, inmediatamente bajo su título', () => {
    for (const s of SECCIONES) {
      const frase = pagina.querySelector(`[id="${s}"] [data-en-una-frase]`)
      expect(frase, `#${s} sin frase`).not.toBeNull()
      expect(frase.getAttribute('data-en-una-frase')).toBe(s)
      expect(frase.textContent).toContain(CATALOGUE.es[`metodologia.frase.${s}`])
      const delante = [...pagina.querySelector(`[id="${s}"]`).querySelectorAll('p, ul, ol, table')]
      expect(delante[0], `#${s}: la frase no es lo primero`).toBe(frase)
    }
  })

  for (const loc of ['es', 'ca']) {
    it(`${loc}: una sola frase, corta, sin plazos ni cifras`, () => {
      for (const s of SECCIONES) {
        const frase = CATALOGUE[loc][`metodologia.frase.${s}`]
        expect(frase, `${loc} ${s} sin frase`).toBeTruthy()
        expect(frase, `${loc} ${s}`).toMatch(/\.$/)
        expect(frase.slice(0, -1), `${loc} ${s}: más de una frase`).not.toMatch(/[.!?]\s/)
        expect(frase, `${loc} ${s}: una cifra envejece sola`).not.toMatch(/\d/)
        expect(frase.split(/\s+/).length, `${loc} ${s}: demasiado larga`).toBeLessThanOrEqual(35)
      }
    })

    it(`${loc}: cada grupo y cada apartado tienen su rótulo`, () => {
      for (const g of GRUPOS_METODOLOGIA)
        expect(CATALOGUE[loc][`metodologia.grupo.${g.id}`], g.id).toBeTruthy()
      for (const s of SECCIONES) expect(CATALOGUE[loc][`metodologia.seccion.${s}`], s).toBeTruthy()
    })
  }

  it('ninguna frase nombra a un cargo: esto no es una firma', () => {
    const { officials } = JSON.parse(OFFICIALS)
    const apellidos = officials.flatMap((o) =>
      o.name
        .split(/\s+/)
        .slice(1)
        .filter((p) => p.length > 3),
    )
    expect(apellidos.length).toBeGreaterThan(0)
    for (const loc of ['es', 'ca'])
      for (const s of SECCIONES)
        for (const a of apellidos)
          expect(CATALOGUE[loc][`metodologia.frase.${s}`], `${s}: ${a}`).not.toContain(a)
  })

  it('en valencià no queda nada en castellano', () => {
    const { castellanoEn } = detectorDeCastellano(['CV', 'CPV'])
    const claves = Object.keys(CATALOGUE.ca).filter((k) =>
      /^metodologia\.(grupo|seccion|frase|indice|enUnaFrase)/.test(k),
    )
    expect(claves.length).toBeGreaterThan(SECCIONES.length)
    const texto = claves.map((k) => CATALOGUE.ca[k]).join(' · ')
    expect(castellanoEn(texto)).toEqual([])
  })
})

describe('los enlaces al contrato', () => {
  /** Todo fichero fuente del sitio. */
  function ficheros(dir, out = []) {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) ficheros(p, out)
      else if (/\.(jsx?|tsx?)$/.test(e)) out.push(p)
    }
    return out
  }

  const enlaces = ficheros(join(__dirname, '..', 'src')).flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/\/metodologia#([a-z0-9-]+)/g)].map((m) => ({
      fichero: f,
      ancla: m[1],
    })),
  )

  it('mide algo: la página tiene enlaces desde fuera', () => {
    expect(enlaces.length).toBeGreaterThan(10)
  })

  it('todo /metodologia#ancla del sitio aterriza en un elemento de la página', () => {
    for (const { fichero, ancla } of enlaces)
      expect(pagina.querySelector(`[id="${ancla}"]`), `${fichero} → #${ancla}`).not.toBeNull()
  })

  it('las páginas de cada materia llevan a su parte del contrato, no a lo alto', () => {
    const conAncla = (rel) =>
      readFileSync(join(__dirname, '..', rel), 'utf8').match(/\/metodologia(#[a-z-]+)?["'`]/g)
    for (const rel of [
      'src/pages/Promesas.jsx',
      'src/pages/Plenos.jsx',
      'src/pages/Quejas.jsx',
      'src/pages/CargoDetalle.jsx',
      'src/pages/HallazgoDetalle.jsx',
      'src/pages/DepartamentoDetalle.jsx',
      'src/pages/LaboratorioPrensa.jsx',
      'src/pages/Presupuesto.jsx',
    ]) {
      const hrefs = conAncla(rel)
      expect(hrefs, rel).not.toBeNull()
      for (const h of hrefs) expect(h, rel).toMatch(/#/)
    }
  })
})

describe('el contrato que se movió', () => {
  it('ninguna remisión de posición cruza un apartado', () => {
    // Al ordenar la página, «la política de automatización más abajo» pasaba a
    // estar arriba: las remisiones entre apartados son enlaces, no direcciones.
    const texto = screen.getByText(/como cuenta la/i, { selector: 'li' }).textContent
    expect(texto).not.toMatch(/política de automatización más abajo/)
  })
})
