import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { RUTAS_LOCALES, construirGrafoRutas } from '../../scripts/lib/route-graph'
import { fichaDe, leerDeDisco } from '../../scripts/lib/fichas-representativas'

/**
 * Una frase de «En breve» cabe en una lectura: ninguna pasa de 35 palabras.
 *
 * Es uno de los objetivos medibles de la auditoría de las dos lecturas
 * («How to tell it worked»): la media por debajo de 20 y ninguna por encima de
 * 35. Re-medido el 02-11-2026 con el guion de la propia auditoría, las medias
 * cumplían todas y cinco frases no: /plenos 81, /metodologia 40, /contratos 39
 * (la de la concesión, escrita el día antes), la portada 37 y /quejas 36. Nada
 * lo comprobaba, y cada una pasó su revisión leída sola.
 *
 * Mide la prosa NUESTRA. Un título de la sede (el de un punto del orden del día)
 * se publica literal y no lo acortamos aquí sin decidirlo: va marcado con
 * `data-literal` y no cuenta. Las frases se parten como en el guion de la
 * auditoría —cada línea, y cada punto, interrogación o exclamación seguidos de
 * espacio— y sólo cuentan las de seis palabras o más.
 *
 * Las rutas salen del grafo: las que alcanzan `EnBreve.jsx`. Una página nueva
 * con «En breve» entra sola.
 */
const MAXIMO = 35

const grafo = construirGrafoRutas(resolve('src'))
const leer = leerDeDisco(resolve('public/data'))
const CON_EN_BREVE = [...(grafo.rutasPorFichero.get(resolve('src/components/EnBreve.jsx')) ?? [])]
  .filter((r) => !RUTAS_LOCALES.includes(r))
  .sort()

/** La URL que se pide: la ruta, o la ficha representativa de una plantilla. */
function url(ruta: string): string | null {
  if (!ruta.includes(':')) return ruta
  const { id } = fichaDe(ruta, leer)
  return id ? ruta.replace(/:[A-Za-z]+/, encodeURIComponent(id)) : null
}

/** Las frases de un texto, partidas como en el guion de la auditoría. */
export function frases(texto: string): string[] {
  return texto
    .replace(/\n+/g, '. ')
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 6)
}

/** Palabras con letra o cifra: un «·» o una raya no son palabra. */
const palabras = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length

test('mide algo: el grafo encuentra las páginas con «En breve» y la regla parte bien', () => {
  expect(CON_EN_BREVE.length).toBeGreaterThanOrEqual(6)
  for (const r of ['/presupuesto', '/contratos', '/plenos', '/quejas', '/metodologia']) {
    expect(CON_EN_BREVE).toContain(r)
  }
  const real =
    'En 13 de esos expedientes, que hemos leído uno a uno, el Síndic se dirigió al Ayuntamiento para recomendarle algo o recordarle sus deberes legales; 8 de ellos los titula el propio Síndic «falta de respuesta».'
  expect(frases(real).map(palabras)).toEqual([36])
  expect(
    frases('¿Cuánto se ha contratado?\nUn solo contrato, de 5 M€, es el 4 % de esa suma.'),
  ).toEqual(['Un solo contrato, de 5 M€, es el 4 % de esa suma.'])
})

for (const ruta of CON_EN_BREVE) {
  const destino = url(ruta)
  test(`${ruta}: ninguna frase de «En breve» pasa de ${MAXIMO} palabras`, async ({ page }) => {
    test.skip(!destino, `${ruta}: SIN FICHA con la que leerla`)
    await page.goto(destino!, { waitUntil: 'domcontentloaded' })
    const bloques = page.locator('[data-en-breve]')
    await expect(bloques.first()).toBeVisible({ timeout: 10_000 })
    const textos = await page.evaluate(() => {
      // Un literal de la fuente no es prosa nuestra: se aparta para leer, y vuelve.
      const literales = [
        ...document.querySelectorAll<HTMLElement>('[data-en-breve] [data-literal]'),
      ]
      const antes = literales.map((n) => n.style.display)
      literales.forEach((n) => (n.style.display = 'none'))
      const leidos = [...document.querySelectorAll<HTMLElement>('[data-en-breve]')].map(
        (b) => b.innerText,
      )
      literales.forEach((n, i) => (n.style.display = antes[i]))
      return leidos
    })
    const todas = textos.flatMap(frases)
    expect(todas.length, `${ruta}: «En breve» sin ninguna frase que medir`).toBeGreaterThan(0)
    const largas = todas
      .filter((f) => palabras(f) > MAXIMO)
      .map((f) => `${palabras(f)} palabras: ${f}`)
    expect(largas, `${ruta}: frases de «En breve» de más de ${MAXIMO} palabras`).toEqual([])
  })
}
