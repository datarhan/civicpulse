/**
 * La portada dejó de pintar un carril de glifos sin rótulo y pasó a cinco
 * grupos con nombre —la lámina 1b de «Portada · Revisión»—. Los grupos viven
 * en src/nav.js, junto a las entradas, y eso abre un modo de fallo que el
 * carril no tenía: una ruta nueva sin `group` se ve en la barra lateral de las
 * páginas interiores y NO en la portada, sin que nada avise. Y una sin frase
 * pinta la clave cruda del catálogo delante de un vecino.
 *
 * Nada de aquí repite NAV ni el catálogo: los dos se importan.
 */
import { describe, expect, it } from 'vitest'
import { NAV, NAV_SECONDARY, NAV_GROUPS, GRUPO_PROYECTO, entradasDeGrupo } from '../src/nav'
import { CATALOGUE, LOCALES } from '../src/i18n'

const TODAS = [...NAV, ...NAV_SECONDARY]
const GRUPOS_VALIDOS = new Set([...NAV_GROUPS.map((g) => g.id), GRUPO_PROYECTO.id])

describe('nav — los grupos de la portada', () => {
  it('cada entrada, salvo la propia portada, pertenece a un grupo que existe', () => {
    let revisadas = 0
    for (const n of TODAS) {
      if (n.to === '/') continue
      expect(GRUPOS_VALIDOS.has(n.group), `${n.to} declara group=${n.group}`).toBe(true)
      revisadas++
    }
    // Prueba de trabajo: con NAV vacío, lo de arriba pasaría sin mirar nada.
    expect(revisadas).toBeGreaterThan(15)
  })

  it('ningún grupo de la barra se abre vacío', () => {
    for (const g of NAV_GROUPS) {
      expect(entradasDeGrupo(g.id).length, `el grupo ${g.id} no tiene secciones`).toBeGreaterThan(0)
    }
  })

  it('la portada llega a todo lo que lista la barra lateral, y a cada cosa una sola vez', () => {
    const alcanzables = [...NAV_GROUPS, GRUPO_PROYECTO].flatMap((g) =>
      entradasDeGrupo(g.id).map((n) => n.to),
    )
    expect(new Set(alcanzables).size, 'una sección aparece en dos grupos').toBe(alcanzables.length)
    const esperadas = TODAS.filter((n) => n.to !== '/').map((n) => n.to)
    expect([...alcanzables].sort()).toEqual([...esperadas].sort())
  })

  it('cada sección de la barra trae su frase, en los dos idiomas', () => {
    let revisadas = 0
    for (const g of NAV_GROUPS) {
      for (const n of entradasDeGrupo(g.id)) {
        for (const loc of LOCALES) {
          const texto = CATALOGUE[loc][n.descKey]
          expect(
            typeof texto === 'string' && texto.trim().length > 0,
            `${loc} · ${n.to} · ${n.descKey}`,
          ).toBe(true)
        }
        revisadas++
      }
    }
    expect(revisadas).toBeGreaterThan(10)
  })

  it('todo rótulo que pinta la barra existe en los dos idiomas', () => {
    // La barra lateral de desarrollo llevaba `nav.curator` sin clave, y t()
    // cae a la clave cruda: se veía «nav.curator». El índice de la portada lo
    // pintaría igual, así que aquí se piden TODOS los rótulos que enseña.
    const claves = [
      ...NAV_GROUPS.flatMap((g) => [g.labelKey, g.ledeKey]),
      GRUPO_PROYECTO.labelKey,
      ...TODAS.filter((n) => n.to !== '/').map((n) => n.labelKey),
    ]
    expect(claves.length).toBeGreaterThan(20)
    for (const k of claves) {
      for (const loc of LOCALES) expect(CATALOGUE[loc][k], `${loc} · ${k}`).toBeTruthy()
    }
  })
})
