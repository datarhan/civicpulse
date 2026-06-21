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
    await expect(page.getByText('Declaraciones contrastadas').first()).toBeVisible()
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
