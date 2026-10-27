import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

// A real pleno id with claims, read from the committed manifest.
const FIRST_ID = (() => {
  const m = JSON.parse(readFileSync('public/data/pleno-claims/index.json', 'utf8'))
  return m.plenos?.[0]?.plenoId as string
})()

test.describe('Plenos index (/plenos)', () => {
  test('renders the session list and links to a detail page', async ({ page }) => {
    await page.goto('/plenos', { waitUntil: 'networkidle' })
    await expect(page.getByText(/Plenos municipales/i)).toBeVisible()
    // cross-session link to /declaraciones
    await expect(page.locator('a[href="/declaraciones"]').first()).toBeVisible()
    // at least one session row links into /plenos/<id>
    const row = page.locator('a[href^="/plenos/"]').first()
    await expect(row).toBeVisible()
    await row.click()
    await expect(page).toHaveURL(/\/plenos\/.+/)
  })
})

/**
 * «El último pleno», la lectura vecinal de /plenos. La sesión esperada sale de
 * los snapshots y del día de hoy en Riba-roja, no de una fecha escrita aquí.
 */
test.describe('«El último pleno» (/plenos)', () => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  const sesiones: Array<{ id: string; date: string }> = JSON.parse(
    readFileSync('public/data/plenos.json', 'utf8'),
  ).items
  const ultima = sesiones
    .filter((s) => s.date.slice(0, 10) < hoy)
    .reduce((a, b) => (b.date > a.date ? b : a))
  const agenda: Array<{ number: number; section: string }> =
    JSON.parse(readFileSync('public/data/plenos-agendas.json', 'utf8')).plenos.find(
      (p: { id: string }) => p.id === ultima.id,
    )?.agenda ?? []

  test('habla de la última sesión celebrada, con su orden del día en palabras llanas', async ({
    page,
  }) => {
    await page.goto('/plenos', { waitUntil: 'networkidle' })
    const tarjeta = page.locator('[data-en-breve="orden-del-dia"]')
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta.locator(`a[href="/plenos/${ultima.id}"]`)).toBeVisible()

    // Se mide algo: la sesión tiene orden del día y puntos para decidir.
    const decidir = agenda.filter((a) => a.section === 'resolutiva')
    expect(decidir.length).toBeGreaterThan(0)
    await expect(tarjeta.locator('.cp-plenos-puntos').first().locator('li')).toHaveCount(
      decidir.length,
    )

    // Ni un número de expediente en la capa vecinal.
    const bloque = page.locator('[data-en-breve-bloque]')
    expect(await bloque.innerText()).not.toMatch(/Expedient(?:e)?\s*:?\s*\d|Expte\.?\s*\d/i)
  })

  test('el divisor va entre el último pleno y todas las sesiones', async ({ page }) => {
    await page.goto('/plenos', { waitUntil: 'networkidle' })
    const bloque = await page.locator('[data-en-breve-bloque]').boundingBox()
    const divisor = await page.locator('[data-divisor-lecturas]').boundingBox()
    const tabla = await page.locator('#sesiones').boundingBox()
    expect(bloque && divisor && tabla).toBeTruthy()
    expect(bloque!.y + bloque!.height).toBeLessThanOrEqual(divisor!.y)
    expect(divisor!.y + divisor!.height).toBeLessThanOrEqual(tabla!.y)
  })

  test('a 375 px empieza en la primera pantalla y no desborda', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/plenos', { waitUntil: 'networkidle' })
    const bloque = page.locator('[data-en-breve-bloque]')
    await expect(bloque).toBeVisible()
    const caja = await bloque.boundingBox()
    expect(caja!.y).toBeLessThan(812)
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBe(0)
  })
})

test.describe('Pleno detail (/plenos/:id)', () => {
  test('shows the per-session sections and ships no hidden accusations', async ({ page }) => {
    const chunkBodies: Array<{ items?: unknown[] }> = []
    page.on('response', async (res) => {
      const url = res.url()
      if (/\/data\/pleno-claims\/[^/]+\.json$/.test(url) && !url.endsWith('index.json')) {
        try {
          chunkBodies.push(await res.json())
        } catch {
          /* ignore */
        }
      }
    })
    await page.goto(`/plenos/${FIRST_ID}`, { waitUntil: 'networkidle' })
    await expect(page.getByText('Orden del día').first()).toBeVisible()
    await expect(page.getByText('Declaraciones cotejadas').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Ver transcripción/i }).first()).toBeVisible()

    const shipped = chunkBodies.flatMap((c) => (c.items ?? []) as Array<Record<string, any>>)
    const hidden = shipped.filter(
      (it) =>
        it.claim?.type === 'acusacion_publica' &&
        ((it.claim?.accusationSubtype ?? 'opinativa') === 'opinativa' ||
          it.verification?.verdict === 'sin-datos'),
    )
    expect(hidden).toEqual([])
  })

  test('unknown id renders a not-found state', async ({ page }) => {
    await page.goto('/plenos/this-id-does-not-exist', { waitUntil: 'networkidle' })
    await expect(page.getByText(/Sesión no encontrada/i)).toBeVisible()
  })
})
