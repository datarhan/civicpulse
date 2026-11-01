import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'
import { euros } from '../../src/lib/formatters'

/**
 * /contratos: la contratación, en su propia página. Hasta el 1-11-2026 vivía
 * debajo del presupuesto, y un vecino que buscara «contratos» no encontraba nada
 * que pulsar (auditoría de las dos lecturas, §5).
 */

test.describe('Contratos (/contratos)', () => {
  test('la página tiene su «En breve», su mapa, su listado y sus cuatro secciones', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await page.goto('/contratos', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { level: 1, name: 'Contratos' })).toBeVisible({
      timeout: 8000,
    })
    await expect(page).toHaveTitle(/^Contratos · /)
    for (const id of ['cuanto', 'aQuien', 'sinConcurso']) {
      await expect(page.locator(`[data-en-breve="${id}"]`)).toBeVisible()
    }
    await expect(
      page.getByRole('heading', { name: '¿A dónde va el dinero en contratos?' }),
    ).toBeVisible()
    await expect(page.getByRole('tab', { name: /Explorar contratos/ })).toBeVisible()
    await expect(page.locator('#menores')).toBeVisible()
    await expect(page.locator('#obras')).toBeVisible()
    await expect(page.locator('#ted')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Subvenciones · Base Nacional' })).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('está en la navegación, bajo «Dinero»', async ({ page }) => {
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await page.getByRole('link', { name: 'Contratos', exact: true }).first().click()
    await expect(page).toHaveURL(/\/contratos$/)
  })

  test('«¿A quién?» abre la lista de quién recibe el dinero', async ({ page }) => {
    await page.goto('/contratos', { waitUntil: 'domcontentloaded' })
    const tarjeta = page.locator('[data-en-breve="aQuien"]')
    await tarjeta.getByRole('link').click()
    await expect(page).toHaveURL(/#quien-recibe$/)
    await expect(page.getByRole('tab', { name: /Quién recibe el dinero/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByPlaceholder('Buscar contrato o empresa…')).toHaveCount(0)
  })

  test('el barrio se elige aquí también, y abre su lista', async ({ page }) => {
    const { zones } = JSON.parse(readFileSync('public/data/tender-geo.json', 'utf8'))
    const slug = zones.find((z) => z.contractCount > 0).slug
    await page.goto('/contratos', { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Elige tu barrio').selectOption(slug)
    await page.getByRole('button', { name: 'Ver sus contratos' }).click()
    await expect(page).toHaveURL(new RegExp(`/contratos\\?barrio=${slug}#mapa-gasto-barrio$`))
    await expect(page.locator('#mapa-gasto-barrio').getByText('← todas las zonas')).toBeVisible()
  })

  test('la tarjeta del total dice lo mismo que el mapa', async ({ page }) => {
    const { universe } = JSON.parse(readFileSync('public/data/tender-geo.json', 'utf8'))
    await page.goto('/contratos', { waitUntil: 'domcontentloaded' })
    const cifra = page.locator('[data-en-breve="cuanto"] .cp-en-breve-cifra')
    await expect(cifra).toHaveText(/M€/, { timeout: 8000 })
    await expect(page.locator('#mapa-gasto')).toContainText(await cifra.innerText())
    expect(universe.totalAmount).toBeGreaterThan(0)
    expect(euros(universe.totalAmount)).toMatch(/€$/)
  })
})

test.describe('/presupuesto después de la mudanza', () => {
  test('la contratación ya no está aquí, y la página dice dónde', async ({ page }) => {
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    const puente = page.locator('[data-puente-contratos]')
    await expect(puente).toBeVisible({ timeout: 8000 })
    await expect(puente.getByRole('link')).toHaveAttribute('href', '/contratos')
    await expect(page.locator('#menores')).toHaveCount(0)
    await expect(page.locator('#obras')).toHaveCount(0)
    await expect(page.locator('#ted')).toHaveCount(0)
    await expect(page.locator('#subvenciones')).toHaveCount(0)
    await expect(page.locator('#mapa-gasto')).toHaveCount(0)
  })

  test('el enlace viejo a una sección llega a /contratos, a esa sección', async ({ page }) => {
    await page.goto('/presupuesto#menores', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/contratos#menores$/)
    await expect(page.locator('#menores')).toBeVisible({ timeout: 15000 })
  })

  test('el enlace viejo de un barrio conserva el barrio', async ({ page }) => {
    const { zones } = JSON.parse(readFileSync('public/data/tender-geo.json', 'utf8'))
    const slug = zones.find((z) => z.contractCount > 0).slug
    await page.goto(`/presupuesto?barrio=${slug}#mapa-gasto-barrio`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page).toHaveURL(new RegExp(`/contratos\\?barrio=${slug}#mapa-gasto-barrio$`))
    await expect(page.locator('#mapa-gasto-barrio').getByText('← todas las zonas')).toBeVisible({
      timeout: 15000,
    })
  })

  test('el selector de barrio de /presupuesto lleva a /contratos', async ({ page }) => {
    const { zones } = JSON.parse(readFileSync('public/data/tender-geo.json', 'utf8'))
    const slug = zones.find((z) => z.contractCount > 0).slug
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Elige tu barrio').selectOption(slug)
    await page.getByRole('button', { name: 'Ver sus contratos' }).click()
    await expect(page).toHaveURL(new RegExp(`/contratos\\?barrio=${slug}#mapa-gasto-barrio$`))
  })
})
