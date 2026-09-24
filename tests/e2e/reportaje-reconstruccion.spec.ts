import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { primeraFrase } from '../../src/components/reportajes/CorrectionNote'
import { collectErrors, appErrors } from './_console'

const META = JSON.parse(
  readFileSync('public/data/reportajes/reconstruccion-dana.json', 'utf8'),
).meta

test.describe('Reportaje · reconstrucción DANA (/reportajes/reconstruccion-dana)', () => {
  test('renders the article, KPIs, charts and the right-of-reply notice', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/reportajes/reconstruccion-dana', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { name: 'El dinero de la reconstrucción, calle a calle' }),
    ).toBeVisible({ timeout: 8000 })
    // Frozen headline figure from the snapshot.
    await expect(page.getByText('14,5 M€').first()).toBeVisible()
    // The accountability thesis + libel-safe framing must be present.
    await expect(page.getByText(/sin atribuir irregularidad/).first()).toBeVisible()
    // Published right-of-reply notice (estado === 'publicado'): Ayuntamiento
    // was contacted and did not respond within the window; réplica stays open.
    await expect(page.getByText(/no respondió dentro del plazo/).first()).toBeVisible()
    // The three data visualisations render as inline SVG.
    expect(await page.locator('svg[role="img"]').count()).toBeGreaterThanOrEqual(2)

    expect(appErrors(errors)).toEqual([])
  })

  test('las correcciones van plegadas: el hecho a la vista, el detalle se abre', async ({
    page,
  }) => {
    // El contrato del pliegue (17-08-2026): fecha + primera frase visibles, y lo
    // que se pliega es el cuerpo. Desde el 24-09-2026 el registro cierra la pieza
    // y lo que llega ANTES que las cifras es el aviso de una línea (lo fija la
    // prueba de abajo). Derivado del fichero real, no de una cadena.
    expect(META.correcciones.length, 'la pieza perdió sus correcciones').toBeGreaterThan(0)
    await page.goto('/reportajes/reconstruccion-dana', { waitUntil: 'domcontentloaded' })

    const c = META.correcciones[0]
    const resumen = primeraFrase(c.texto)
    await expect(page.getByText(`Corrección · ${c.fecha}`)).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(resumen).first()).toBeVisible()

    // Un trozo del cuerpo que NO está en el summary: oculto hasta abrir.
    const cuerpo = c.texto
      .replace(/\*\*/g, '')
      .slice(resumen.length + 1)
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join(' ')
    expect(cuerpo.length, 'la corrección real cabe entera en el summary').toBeGreaterThan(10)
    await expect(page.getByText(cuerpo, { exact: false })).toBeHidden()

    await page.getByText(`Corrección · ${c.fecha}`).click()
    await expect(page.getByText(cuerpo, { exact: false })).toBeVisible()
  })

  test('el aviso va sobre las cifras y el registro cierra la pieza', async ({ page }) => {
    // 24-09-2026: una línea arriba —cuántas y la fecha de la última— y el
    // registro entero al final. Se mide la POSICIÓN, que es lo que cambió: un
    // test que sólo buscara los textos seguiría en verde con el registro arriba.
    const n = META.correcciones.length
    expect(n, 'la pieza perdió sus correcciones').toBeGreaterThan(0)
    await page.goto('/reportajes/reconstruccion-dana', { waitUntil: 'domcontentloaded' })

    const aviso = page.getByText(
      n === 1 ? 'Esta pieza tiene una corrección' : `Esta pieza tiene ${n} correcciones`,
    )
    await expect(aviso).toBeVisible({ timeout: 8000 })
    const registro = page.locator('section#correcciones')
    await expect(registro.locator('details')).toHaveCount(n)

    const y = async (l) => (await l.boundingBox())?.y ?? NaN
    // El aviso, antes que la primera cifra de la cabecera; el registro, después
    // del cuerpo de la pieza.
    const primeraCifra = page.locator('.mono').filter({ hasText: /M€/ }).first()
    expect(await y(aviso)).toBeLessThan(await y(primeraCifra))
    expect(await y(registro)).toBeGreaterThan(await y(page.locator('article').first()))
    // Y es lo último de la página: nada del cuerpo queda por debajo.
    const ultimo = await registro.evaluate((el) => el.parentElement?.lastElementChild === el)
    expect(ultimo, 'el registro no es el último bloque de la pieza').toBe(true)

    // El enlace del aviso lleva al registro.
    await page.getByRole('link', { name: /al final/ }).click()
    await expect(page).toHaveURL(/#correcciones$/)
    await expect(registro.getByRole('heading', { name: 'Correcciones' })).toBeInViewport()
  })
})
