/**
 * La tira de indicadores de la portada, en palabras de vecino (26-10-2026).
 *
 * Hablaba el idioma de la fuente: «Presup. 2025 · Ayto. · definitivo · 60 %
 * ejec.», «Cap.1 económico», «Contratos adj. 2017–2026 · acumulado ·
 * Gobierto/PLACSP». Ahora cada celda dice qué es la cifra; lo exacto y la
 * fuente van en su `title`. Lo que se fija aquí:
 *
 * - El presupuesto se nombra «tope de gasto» ANTES de «gastado», y lo gastado
 *   lleva la fecha del listado del que sale (#358: un listado de junio leído
 *   como el cierre).
 * - «Último pleno» es la última sesión CELEBRADA. Del 7 al 10 de mayo de 2026
 *   el listado publicado traía la del 11 de mayo, y la tira, que tomaba el
 *   primer elemento, la daba como el último pleno antes de celebrarse.
 *
 * Se pinta con las instantáneas publicadas; las cifras esperadas salen de los
 * mismos módulos que la tira.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { KpiStrip } from '../../src/variants/direction-d/KpiStrip'
import { magnitudDelEjercicio } from '../../src/scraper/presupuesto-lectura'
import { hoyEnRibarroja } from '../../src/scraper/en-breve-portada'
import { pintaYLee } from '../setup/pinta-y-lee'

const publicado = (f) => JSON.parse(readFileSync(resolve('public/data', f), 'utf8'))

const RUTAS = [
  'padron.json',
  'budget.json',
  'budget-execution.json',
  'tenders.json',
  'paro.json',
  'plenos.json',
]
const DATOS = Object.fromEntries(RUTAS.map((f) => [`/data/${f}`, publicado(f)]))

const porCelda = (container) =>
  [...container.querySelectorAll('.d-kpi-cell')].map((c) =>
    JSON.stringify({ texto: c.textContent.replace(/\s+/g, ' ').trim(), titulo: c.title }),
  )

async function celdas(fetch, nombre) {
  const { piezas, pedidasSinServir } = await pintaYLee(
    {
      nombre,
      fetch,
      pinta: () => <KpiStrip />,
      // Las seis celdas con su cifra: ninguna en «—».
      listo: (c) =>
        c.querySelectorAll('.d-kpi-cell').length === 6 &&
        ![...c.querySelectorAll('.d-kpi-cell')].some((x) => /—/.test(x.textContent)),
    },
    'es',
    { lee: porCelda },
  )
  expect(pedidasSinServir).toEqual([])
  return piezas.map((p) => JSON.parse(p))
}

describe('la tira de la portada, en palabras de vecino', () => {
  it('el presupuesto es «tope de gasto», y lo gastado lleva la fecha de su listado', async () => {
    const ejecucion = DATOS['/data/budget-execution.json']
    const m = magnitudDelEjercicio(DATOS['/data/budget.json'].snapshot, ejecucion.latest)
    // Hoy la tira enseña el crédito definitivo con su ejecución: si no, esta
    // prueba no mediría la frase que fija.
    expect(m?.etapa).toBe('definitivo')
    expect(ejecucion.latest.fechaListado).toBeTruthy()

    const [, presupuesto, personal] = await celdas(DATOS, 'tira publicada')
    const texto = presupuesto.texto
    expect(texto).toContain(`Presupuesto ${m.year}`)
    expect(texto.indexOf('tope de gasto')).toBeGreaterThan(-1)
    expect(texto.indexOf('tope de gasto')).toBeLessThan(texto.indexOf('gastado'))
    expect(texto).toContain(
      `gastado el ${Math.round(m.pctEjecutado)} % a ${ejecucion.latest.fechaListado}`,
    )
    // Lo exacto, en el title, con la cifra de lo gastado nombrada como tal.
    expect(presupuesto.titulo).toMatch(/crédito definitivo/)
    expect(presupuesto.titulo).toMatch(/de los que se han gastado/)

    expect(personal.texto).toContain(`del presupuesto ${m.year}`)
    expect(personal.texto).not.toMatch(/Cap\.\s?1/)
  })

  it('el paro dice con qué mes compara: «el mes anterior» sólo si lo es', async () => {
    const paro = DATOS['/data/paro.json']
    const n = paro.series.length
    // Hoy las dos últimas entradas son meses seguidos; si no, el primer caso no
    // mediría nada.
    const meses = (p) => {
      const [y, m] = p.split('-').map(Number)
      return y * 12 + m
    }
    const [a, b] = paro.series.slice(-2).map((x) => x.period)
    expect(meses(b) - meses(a)).toBe(1)
    const [, , , , hoy] = await celdas(DATOS, 'tira publicada')
    expect(hoy.texto).toContain('respecto al mes anterior')

    // La forma de julio de 2026: la serie publicada saltaba de 2026-04 a 2026-07.
    const conHueco = { ...paro, series: [...paro.series.slice(0, n - 2), paro.series[n - 1]] }
    const [, , , , julio] = await celdas(
      { ...DATOS, '/data/paro.json': conHueco },
      'tira con un mes sin dato',
    )
    expect(julio.texto).not.toContain('mes anterior')
    const previo = conHueco.series.at(-2).period
    const mes = new Date(`${previo}-01T00:00:00Z`).toLocaleDateString('es-ES', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
    expect(julio.texto).toContain(`respecto a ${mes}`)
  })

  it('«Último pleno» es la última sesión celebrada, no una listada antes de celebrarse', async () => {
    const plenos = DATOS['/data/plenos.json']
    const hoy = hoyEnRibarroja()
    const celebrada = plenos.items
      .map((p) => p.date)
      .filter((d) => d < hoy)
      .sort()
      .at(-1)
    expect(celebrada).toBeTruthy()
    // La forma del 7-05-2026: la próxima sesión, ya convocada, primera del listado.
    const manana = new Date(Date.parse(`${hoy}T12:00:00Z`) + 864e5).toISOString().slice(0, 10)
    const conConvocada = {
      ...plenos,
      items: [{ ...plenos.items[0], id: 'convocada', date: manana }, ...plenos.items],
    }
    const celdasHoy = await celdas(
      { ...DATOS, '/data/plenos.json': conConvocada },
      'tira con una sesión convocada',
    )
    const pleno = celdasHoy[5].texto
    const dia = (iso) =>
      new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    expect(pleno).toContain(dia(celebrada))
    expect(pleno).not.toContain(dia(manana))
  })
})
