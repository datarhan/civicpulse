import { test, expect } from '@playwright/test'

/**
 * /departamentos/:slug a 375 px: ningún texto de la tira de cifras pasa el borde de
 * su celda.
 *
 * La tira ponía cuatro columnas también en un teléfono: 72 px por celda y 48 de
 * contenido. «APROBADOS» pasaba 6 px el borde, y el motivo «sin voto transcrito»,
 * que ahora va debajo cuando un área no tiene votaciones transcritas, otros 7.
 * `mobile.spec.ts` no podía verlo: mide lo que ensancha el documento, y un texto
 * que invade la celda de al lado no ensancha la página. Esto mide lo pintado, con
 * un Range sobre cada pieza de cada celda.
 */
type Celda = { piezas: { texto: string; pasa: number }[] }

const midePasadas = () =>
  [
    ...([...document.querySelectorAll('div')].find(
      (d) => d.children.length === 0 && d.textContent?.trim() === 'Aprobados',
    )?.parentElement?.parentElement?.children ?? []),
  ].map((celda) => {
    const borde = celda.getBoundingClientRect().right
    return {
      piezas: [...celda.children].map((pieza) => {
        const r = document.createRange()
        r.selectNodeContents(pieza)
        const derecha = Math.max(...[...r.getClientRects()].map((x) => x.right))
        return { texto: pieza.textContent?.trim() ?? '', pasa: Math.round(derecha - borde) }
      }),
    }
  })

test('a 375 px, ningún texto de la tira de cifras de una concejalía pasa el borde de su celda', async ({
  page,
}) => {
  expect(page.viewportSize()?.width, 'el proyecto de teléfono tiene que fijar 375 px').toBe(375)
  await page.goto('/departamentos/urbanismo', { waitUntil: 'domcontentloaded' })
  await page.getByText('Aprobados', { exact: true }).first().waitFor()
  await page.evaluate(() => document.fonts.ready.then(() => undefined))

  // Dos lecturas seguidas iguales: el motivo llega con las votaciones, y medida
  // antes la celda no lo tendría.
  let celdas: Celda[] = []
  await expect
    .poll(async () => {
      const antes = JSON.stringify(celdas)
      celdas = await page.evaluate(midePasadas)
      return celdas.length > 0 && JSON.stringify(celdas) === antes
    })
    .toBe(true)

  // Mide algo: la tira tiene sus cuatro cifras, cada una con su rótulo y su valor.
  expect(celdas.length, 'no se encontró la tira de cifras').toBe(4)
  for (const c of celdas) expect(c.piezas.length, JSON.stringify(c)).toBeGreaterThanOrEqual(2)
  const fuera = celdas.flatMap((c) => c.piezas.filter((p) => p.pasa > 0))
  expect(fuera, 'textos que pasan el borde de su celda').toEqual([])
})
