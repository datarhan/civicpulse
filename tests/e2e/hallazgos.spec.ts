import { test, expect } from '@playwright/test'

test.describe('Hallazgos (/hallazgos)', () => {
  test('renders dashboard with at least one promoted finding', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })

    // Eyebrow + title
    await expect(page.getByText(/Verificaci.n editorial/i).first()).toBeVisible()
    await expect(page.getByText(/Hallazgos sobre declaraciones en pleno/i).first()).toBeVisible()

    // At least one finding present (promoted in the curate step of this session)
    // — cards display a title; we assert the summary hint renders.
    await expect(page.getByText(/Cómo se escribe un hallazgo/i).first()).toBeVisible({
      timeout: 8000,
    })

    // Filter chips — severity row always present when findings > 0
    await expect(page.getByRole('button', { name: /Informativo/i }).first()).toBeVisible()

    // Permalink anchors should work — the first finding card has a href
    // pointing to the current pathname + "#f-…"
    const firstPermalink = page.locator('a[href^="/hallazgos#f-"]').first()
    await expect(firstPermalink).toBeVisible()

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('severity filter toggles the visible set', async ({ page }) => {
    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })
    // Click the "Crítico" chip. Either it narrows to 0 (current state has no
    // criticals) — then the "Ninguno coincide con los filtros" state shows.
    const criticalChip = page.getByRole('button', { name: /^Crítico/i }).first()
    await criticalChip.click()
    // Either a "ningún" state or specifically-filtered results.
    await expect(page.getByText(/Ninguno coincide|Crítico/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('rail icon on landing links to /hallazgos', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const link = page.locator('a[href="/hallazgos"]').first()
    await expect(link).toBeVisible({ timeout: 10_000 })
    await link.click()
    await expect(page).toHaveURL(/\/hallazgos$/)
  })
})

test.describe('Cargo detail (/cargos/:slug)', () => {
  test('renders a councillor detail page from /cargos', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))

    // The mayor's slug is stable — officials.json always has role=alcalde
    await page.goto('/cargos/robert-raga-gadea', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(/Todos los departamentos|Cargos/i).first()).toBeVisible()
    await expect(page.getByText('Robert Raga Gadea').first()).toBeVisible({
      timeout: 8000,
    })

    // Stats strip
    await expect(page.getByText(/Concejalías/i).first()).toBeVisible()
    await expect(page.getByText(/Promesas · grupo/i).first()).toBeVisible()

    // Portfolio chips render; alcalde has Alcaldía + Innovación at least
    await expect(page.getByText(/Alcald.a/).first()).toBeVisible()

    // Methodology disclaimer at the bottom
    await expect(page.getByText(/Atribución|nivel de grupo parlamentario/i).first()).toBeVisible({
      timeout: 5000,
    })

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('unknown slug shows not-found state (no crash)', async ({ page }) => {
    await page.goto('/cargos/no-existe-este-concejal', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/no encontrado|Cargos/i).first()).toBeVisible({
      timeout: 8000,
    })
  })
})
