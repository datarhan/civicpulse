import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, waitFor } from '@testing-library/react'

import { LocaleProvider } from '../src/i18n'
import { invalidateSnapshots } from '../src/lib/snapshot-store'
import {
  ANIO_BASE_MINIMO,
  PROMESAS_POR_SERVICIO,
  cuestaConsigue,
  direccion,
  filasCuestaConsigue,
  indexar,
} from '../src/scraper/cuesta-consigue'
import { indexarCompetencias } from '../src/hooks/useCompetencias'
import { CuestaConsigueResponde } from '../src/components/eficiencia/CuestaConsigueResponde'
import { installFetchMock } from './setup/mockFetch'

/**
 * «Cuesta · Consigue · Responde» (docs/superpowers/specs/2026-10-22-lectura-
 * vecinal-eficiencia-design.md §3). Se mide contra los snapshots PUBLICADOS: si
 * llega otra entrega, la prueba mide la nueva.
 */
const leer = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const IND = leer('indicadores.json')
const COMP = leer('competencias.json')
const PROM = leer('promises.json')
const FILAS = filasCuestaConsigue(IND)

describe('la derivación', () => {
  it('mide algo: una fila por cada servicio del panel, los de resultado primero', () => {
    const conResultado = IND.resultados.items.map((r) => r.servicioRelacionado)
    expect(conResultado.length).toBeGreaterThan(0)
    expect(new Set(FILAS.map((f) => f.servicioId))).toEqual(
      new Set(IND.indicadores.map((i) => i.id)),
    )
    expect(FILAS.slice(0, new Set(conResultado).size).every((f) => f.resultado)).toBe(true)
    expect(FILAS.slice(new Set(conResultado).size).every((f) => !f.resultado)).toBe(true)
  })

  it('el índice sale de valorReal y medianaParesReal, desde el primer año ≥ 2021', () => {
    for (const f of FILAS) {
      if (!f.coste) continue
      const ind = IND.indicadores.find((i) => i.id === f.servicioId)
      const validos = ind.serie.filter((p) => p.estado === 'declarado' && !p.atipico && p.valorReal)
      const base = Math.min(...validos.map((p) => p.anio).filter((a) => a >= ANIO_BASE_MINIMO))
      expect(f.coste.nuestro.base).toBe(base)
      const enBase = validos.find((p) => p.anio === base).valorReal
      const ultimo = validos.find((p) => p.anio === f.coste.nuestro.ultimo).valorReal
      expect(f.coste.nuestro.cambio).toBeCloseTo((ultimo / enBase - 1) * 100, 6)
    }
  })

  it('el denominador congelado se dice, con su año', () => {
    for (const f of FILAS) {
      const den = IND.indicadores.find((i) => i.id === f.servicioId).declaracion?.denominador
      expect(f.coste?.congelado ?? false).toBe(!!den?.congelada)
      if (den?.congelada) expect(f.coste.congeladoDesde).toBe(den.desde ?? null)
    }
  })

  it('un resultado de un solo año no tiene dirección', () => {
    const r = cuestaConsigue(
      { id: 'x', serie: [] },
      {
        id: 'r',
        servicioRelacionado: 'x',
        etiqueta: 'e',
        unidad: '%',
        periodo: '2022',
        serie: [{ anio: 2022, valor: 6 }],
      },
    )
    expect(r.resultado.nuestro).toBeNull()
    expect(r.coste).toBeNull()
  })

  it('indexar y direccion', () => {
    const s = indexar(
      [
        { anio: 2021, valor: 50 },
        { anio: 2024, valor: 75 },
      ],
      2021,
    )
    expect(s.cambio).toBeCloseTo(50)
    expect(indexar([{ anio: 2021, valor: 50 }], 2021)).toBeNull()
    expect(direccion(0.4)).toBe('igual')
    expect(direccion(12)).toBe('sube')
    expect(direccion(-3)).toBe('baja')
  })

  it('el mapa de promesas apunta a promesas y servicios que existen', () => {
    const ids = new Set(PROM.items.map((p) => p.id))
    const servicios = new Set(IND.indicadores.map((i) => i.id))
    for (const [servicio, promesas] of Object.entries(PROMESAS_POR_SERVICIO)) {
      expect(servicios, servicio).toContain(servicio)
      for (const id of promesas) expect(ids, id).toContain(id)
    }
  })
})

function pinta({ nombresOn = true } = {}) {
  installFetchMock({ '/data/promises.json': PROM })
  return render(
    <LocaleProvider>
      <CuestaConsigueResponde
        data={IND}
        competencias={COMP}
        porClave={nombresOn ? indexarCompetencias(COMP) : new Map()}
        nombresOn={nombresOn}
      />
    </LocaleProvider>,
  )
}

afterEach(() => {
  localStorage.clear()
  invalidateSnapshots()
})

describe('lo que lee el vecino', () => {
  it('las frases de dirección no llevan valor', () => {
    const { container } = pinta()
    const frases = [...container.querySelectorAll('[data-ccr]')].map((e) => e.textContent)
    expect(frases.length).toBeGreaterThanOrEqual(FILAS.length)
    for (const f of frases)
      expect(f).not.toMatch(/\b(mejor|peor|bien|mal|eficiente|ineficiente)\b/i)
  })

  it('el nombre sólo va en «Responde», nunca junto a la cifra de coste', async () => {
    const { container } = pinta()
    const nombres = COMP.asignaciones
      .filter((a) => FILAS.some((f) => f.servicioId === a.clave))
      .map((a) => a.nombre)
    expect(nombres.length).toBeGreaterThan(0)
    for (const fila of container.querySelectorAll('[data-ccr-servicio]')) {
      const [cuesta, consigue, responde] = fila.querySelectorAll('.cp-ccr-columnas > section')
      for (const n of nombres) {
        expect(cuesta.textContent).not.toContain(n)
        expect(consigue.textContent).not.toContain(n)
      }
      const a = COMP.asignaciones.find((x) => x.clave === fila.dataset.ccrServicio)
      if (a) expect(responde.textContent).toContain(a.nombre)
    }
  })

  it('con la ventana LOREG, ningún nombre; y se dice por qué', () => {
    const { container } = pinta({ nombresOn: false })
    for (const a of COMP.asignaciones) expect(container.textContent).not.toContain(a.nombre)
    expect(container.textContent).toContain('no se publican durante el periodo electoral')
  })

  it('antes del mandato actual no se nombra a nadie, y se dice', () => {
    const { container } = pinta()
    expect(container.textContent).toContain('no nombramos a nadie')
  })

  it('las promesas del mapa se pintan; un servicio sin ellas lo dice', async () => {
    const { container } = pinta()
    await waitFor(() => {
      for (const [servicio, ids] of Object.entries(PROMESAS_POR_SERVICIO)) {
        const fila = container.querySelector(`[data-ccr-servicio="${servicio}"]`)
        if (!fila) continue
        for (const id of ids)
          expect(fila.textContent).toContain(PROM.items.find((p) => p.id === id).title)
      }
    })
    const sin = FILAS.filter((f) => f.promesas.length === 0)
    expect(container.querySelectorAll('[data-ccr="sin-promesa"]')).toHaveLength(sin.length)
  })

  it('la frase no-causal del resultado va en el cuerpo', () => {
    const { container } = pinta()
    // El bloque lleva UN resultado por tarjeta, el primero (la biblioteca tiene
    // dos; el de visitas vive en su ficha): se mide la frase de cada uno que lleva.
    const llevados = FILAS.filter((f) => f.resultado).map((f) => f.resultado.id)
    expect(llevados.length).toBeGreaterThan(0)
    for (const r of IND.resultados.items.filter((x) => llevados.includes(x.id)))
      expect(container.textContent).toContain(r.comoSeLee)
  })

  it('la nota del grupo dice lo que hay: su serie, sólo su último año, o ninguno', () => {
    const { container } = pinta()
    const casos = new Set()
    for (const f of FILAS.filter((x) => x.resultado?.nuestro)) {
      const fila = container.querySelector(`[data-ccr-servicio="${f.servicioId}"]`)
      const consigue = fila.querySelectorAll('.cp-ccr-columnas > section')[1]
      const nota = consigue.querySelector('[data-ccr="nota-grupo"]').textContent
      if (f.resultado.grupo) {
        casos.add('serie')
        expect(nota).toContain(`mismos ${f.resultado.nGrupo} municipios`)
        expect(consigue.textContent).toContain('Mediana de municipios parecidos')
        expect(nota).not.toContain('sólo tenemos el último año')
      } else if (f.resultado.nPares != null) {
        casos.add('ultimo')
        expect(nota).toContain('sólo tenemos el último año')
      } else {
        casos.add('ninguno')
        expect(nota).toContain('no se compara')
      }
    }
    // Los tres casos existen en los datos publicados: la prueba mide algo en cada uno.
    expect(casos).toEqual(new Set(['serie', 'ultimo', 'ninguno']))
  })

  it('los servicios sin resultado van plegados, y cada uno dice que no lo tiene', () => {
    const { container } = pinta()
    const resto = container.querySelector('[data-ccr-resto]')
    const sin = FILAS.filter((f) => !f.resultado)
    expect(resto.querySelectorAll('[data-ccr-servicio]')).toHaveLength(sin.length)
    expect(resto.querySelector('summary').textContent).toContain(String(sin.length))
    for (const fila of resto.querySelectorAll('[data-ccr-servicio]'))
      expect(fila.textContent).toContain('El Ministerio no pide ningún resultado de este servicio')
  })
})
