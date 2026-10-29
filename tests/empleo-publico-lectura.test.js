/**
 * /empleo-publico, la lectura vecinal (auditoría de las dos lecturas, §21): la
 * página respondía «¿cómo se entra a trabajar en el Ayuntamiento?» con una
 * lista de títulos y una píldora por tipo, sin decir qué es una bolsa ni una
 * estabilización.
 *
 * Ahora abre con cuatro definiciones, que son entradas del glosario —las mismas
 * que da Cmd+K—, y agrupa los procesos bajo un título por tipo. Lo que se
 * prueba aquí es lo que no se ve en una captura: que ningún proceso se pierde
 * ni se cuenta dos veces al agruparlos, y que el cajón de sastre no se come la
 * lista si el clasificador deja de reconocer los títulos.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import { agruparProcesos, TERMINOS_DE_ACCESO } from '../src/lib/empleo-publico'
import { PROCESO_TIPOS } from '../src/scraper/procesos-selectivos'
import { GLOSARIO } from '../src/glosario'
import { CATALOGUE, LOCALES } from '../src/i18n'

const { procesos } = JSON.parse(readFileSync('public/data/procesos-selectivos.json', 'utf8'))

describe('/empleo-publico · los procesos, por tipo', () => {
  const grupos = agruparProcesos(procesos)

  it('premisa: hay procesos publicados que agrupar', () => {
    expect(procesos.length).toBeGreaterThan(0)
  })

  it('cada proceso cae en un grupo, y sólo en uno', () => {
    const agrupados = grupos.flatMap((g) => g.procesos.map((p) => p.url))
    expect(agrupados.sort()).toEqual(procesos.map((p) => p.url).sort())
  })

  it('los grupos siguen el orden de los tipos del clasificador, y ninguno sale vacío', () => {
    const orden = grupos.map((g) => PROCESO_TIPOS.indexOf(g.tipo))
    expect(orden.every((i) => i >= 0)).toBe(true)
    expect(orden).toEqual([...orden].sort((a, b) => a - b))
    for (const g of grupos) expect(g.procesos.length).toBeGreaterThan(0)
  })

  it('dentro de cada grupo, el orden de la página del Ayuntamiento', () => {
    for (const g of grupos) {
      const posiciones = g.procesos.map((p) => procesos.indexOf(p))
      expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b))
    }
  })

  it('un tipo que el clasificador no conoce va a «otro»: no se pierde', () => {
    const raro = { id: 'x', titulo: 'Algo nuevo', tipo: 'inventado', url: 'https://x' }
    expect(agruparProcesos([raro])).toEqual([{ tipo: 'otro', procesos: [raro] }])
  })

  it('techo del cajón de sastre: «otro» es menos del 10 % de lo publicado', () => {
    const otro = grupos.find((g) => g.tipo === 'otro')?.procesos.length ?? 0
    expect(otro / procesos.length).toBeLessThan(0.1)
  })
})

describe('/empleo-publico · «¿Cómo se entra a trabajar en el Ayuntamiento?»', () => {
  it('sus cuatro definiciones son entradas del glosario', () => {
    expect(TERMINOS_DE_ACCESO).toEqual([
      'oposicion',
      'concurso',
      'bolsaDeTrabajo',
      'estabilizacion',
    ])
    for (const clave of TERMINOS_DE_ACCESO) expect(GLOSARIO, clave).toContain(clave)
  })

  it('cada una tiene término y definición en los dos idiomas', () => {
    for (const locale of LOCALES) {
      for (const clave of TERMINOS_DE_ACCESO) {
        expect(CATALOGUE[locale][`glosario.${clave}.termino`], `${locale} ${clave}`).toBeTruthy()
        expect(CATALOGUE[locale][`glosario.${clave}.def`], `${locale} ${clave}`).toBeTruthy()
      }
    }
  })

  it('la estabilización da las fechas de la ley, no las de hoy', () => {
    // Ley 20/2021, art. 2.2: convocatorias antes del 31-12-2022, procesos
    // terminados antes del 31-12-2024. La definición dice por qué la de la
    // lista no es una plaza abierta hoy.
    expect(CATALOGUE.es['glosario.estabilizacion.def']).toMatch(/2022.*2024/)
    expect(CATALOGUE.ca['glosario.estabilizacion.def']).toMatch(/2022.*2024/)
  })
})
