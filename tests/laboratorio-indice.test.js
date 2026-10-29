/**
 * /laboratorio, el índice de los experimentos. Sus tarjetas salen del grupo
 * `laboratorio` de la navegación; lo único propio de la página es la pregunta
 * de cada una. Esto vigila que un experimento nuevo no aparezca sin pregunta
 * —pintaría la clave cruda del catálogo delante de un vecino— y que el índice
 * no se enlace a sí mismo.
 */
import { describe, it, expect } from 'vitest'
import { entradasDeGrupo } from '../src/nav'
import { CATALOGUE, LOCALES } from '../src/i18n'
import { PREGUNTA_DE, tarjetasDelLaboratorio } from '../src/pages/Laboratorio'

describe('/laboratorio · el índice', () => {
  const tarjetas = tarjetasDelLaboratorio()

  it('mira algo: el grupo del laboratorio tiene experimentos', () => {
    expect(entradasDeGrupo('laboratorio').length).toBeGreaterThan(3)
  })

  it('una tarjeta por cada entrada del grupo, salvo el propio índice, más la salud de los datos', () => {
    const delMenu = entradasDeGrupo('laboratorio')
      .filter((n) => n.to !== '/laboratorio' && !n.soloDesarrollo)
      .map((n) => n.to)
    expect(tarjetas.map((n) => n.to).sort()).toEqual([...delMenu, '/lab-health'].sort())
    expect(tarjetas.map((n) => n.to)).not.toContain('/laboratorio')
  })

  it('los experimentos van primero, y los datos y su salud al final', () => {
    const rutas = tarjetas.map((n) => n.to)
    const primeraNoExperimento = rutas.findIndex((to) => !to.startsWith('/laboratorio/'))
    expect(rutas.slice(primeraNoExperimento).every((to) => !to.startsWith('/laboratorio/'))).toBe(
      true,
    )
    expect(rutas.at(-1)).toBe('/lab-health')
  })

  it('cada tarjeta tiene pregunta, nombre y frase en los dos idiomas', () => {
    for (const n of tarjetas) {
      expect(PREGUNTA_DE[n.to], `${n.to} sin pregunta`).toBeTruthy()
      for (const locale of LOCALES) {
        for (const clave of [PREGUNTA_DE[n.to], n.labelKey, n.descKey])
          expect(CATALOGUE[locale][clave], `${locale} ${n.to} ${clave}`).toBeTruthy()
      }
    }
  })

  it('las herramientas del curador, que sólo existen en desarrollo, no son tarjetas', () => {
    const dev = entradasDeGrupo('laboratorio').filter((n) => n.soloDesarrollo)
    // Las pruebas corren fuera de producción, así que aquí están en el menú.
    expect(dev.length).toBeGreaterThan(0)
    for (const n of dev) expect(tarjetas.map((x) => x.to)).not.toContain(n.to)
  })

  it('el laboratorio de prensa tiene su propia entrada, fuera del índice', () => {
    expect(entradasDeGrupo('laboratorio').some((n) => n.to === '/laboratorio/prensa')).toBe(true)
  })
})
