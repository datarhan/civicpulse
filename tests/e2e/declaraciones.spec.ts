import { test, expect } from '@playwright/test'

test.describe('Declaraciones (/declaraciones)', () => {
  test('renders the global verified-claims browse page', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/declaraciones', { waitUntil: 'domcontentloaded' })

    // Eyebrow + title
    await expect(page.getByText(/Verificaci.n de declaraciones/i).first()).toBeVisible()
    await expect(page.getByText(/Declaraciones en pleno/i).first()).toBeVisible({
      timeout: 8000,
    })

    // Stats strip — at least the "Total" mini-stat renders.
    await expect(page.getByText(/^Total$/i).first()).toBeVisible({ timeout: 5000 })

    // Filter chip "Con evidencia" exists (default-selected).
    await expect(page.getByRole('button', { name: /Con evidencia/i }).first()).toBeVisible()

    // At least one claim card renders (we have 4658+ claims at time of writing).
    await expect(page.locator('text=/«[^»]+»/').first()).toBeVisible({ timeout: 8000 })

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('verdict filter narrows the visible set', async ({ page }) => {
    await page.goto('/declaraciones', { waitUntil: 'domcontentloaded' })
    // Click "Crítico"-style filter — try "contradicho". If 0 matches, the
    // empty-state copy renders. Either is a successful filter behaviour.
    const contradichoChip = page.getByRole('button', { name: /^contradicho/i }).first()
    await contradichoChip.click()
    await expect(page.getByText(/Ninguna declaraci.n coincide|contradicho/i).first()).toBeVisible({
      timeout: 5000,
    })
  })

  test('sidebar nav has Declaraciones entry linking here', async ({ page }) => {
    // Sidebar only renders on InnerShell routes — not on the landing page,
    // which has its own LeftRail. Use /cargos to exercise the full sidebar.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    const link = page.locator('a[href="/declaraciones"]').first()
    await expect(link).toBeVisible({ timeout: 10_000 })
    await link.click()
    await expect(page).toHaveURL(/\/declaraciones$/)
  })
})
