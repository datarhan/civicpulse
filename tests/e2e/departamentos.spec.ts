import { test, expect } from '@playwright/test'
import { agendaHasDepartments } from './_agenda'

test.describe('Departamentos (/departamentos)', () => {
  test('index renders dept cards with responsible officials', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/departamentos', { waitUntil: 'domcontentloaded' })

    // Page eyebrow + title
    await expect(page.getByText(/Rendici.n de cuentas/i).first()).toBeVisible()
    await expect(page.getByText(/Departamentos · compromisos y plazos/i).first()).toBeVisible()

    // At least one canonical dept label is rendered (Urbanismo exists for sure
    // and has a responsible concejal on the current data snapshot).
    await expect(page.getByText('Urbanismo').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Hacienda').first()).toBeVisible()

    // "Sin concejal asignado" honest state renders where no portfolio matches —
    // the canonical enum has 28 slugs and the snapshot has 26 with responsables,
    // so the string must appear at least once.
    await expect(page.getByText(/Sin concejal asignado/i).first()).toBeVisible()

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('detail page /departamentos/:slug renders four sections', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))

    await page.goto('/departamentos/urbanismo', { waitUntil: 'domcontentloaded' })

    // Back link
    await expect(page.getByText(/Todos los departamentos/i).first()).toBeVisible()

    // The four section headings
    await expect(page.getByText('Compromisos plenarios').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Promesas electorales').first()).toBeVisible()
    await expect(page.getByText(/Puntos debatidos sin voto transcrito/i).first()).toBeVisible()
    await expect(page.getByText('Quejas ciudadanas activas').first()).toBeVisible()

    // The methodology note sits inside a collapsed <details> — its link is
    // hidden from the a11y tree until expanded, so open it like a user first.
    await page.locator('summary', { hasText: /Metodolog/i }).click()
    await expect(page.getByRole('link', { name: /Leer metodolog.a/i })).toHaveAttribute(
      'href',
      '/metodologia',
    )

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('unknown slug shows not-found state (not a crash)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))

    await page.goto('/departamentos/no-existe-este-slug', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(/Departamento no encontrado/i).first()).toBeVisible({
      timeout: 8000,
    })
    expect(errors).toEqual([])
  })

  test('landing rail has a Departamentos icon linking here', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // Rail item renders as an <a href="/departamentos"> inside the LeftRail
    // aside. We wait for at least one to be attached — lazy chunks can take a
    // beat — then verify click navigation works.
    const deptLink = page.locator('a[href="/departamentos"]').first()
    await expect(deptLink).toBeVisible({ timeout: 10_000 })
    await deptLink.click()
    await expect(page).toHaveURL(/\/departamentos$/)
    await expect(page.getByText(/Departamentos · compromisos y plazos/i).first()).toBeVisible({
      timeout: 8000,
    })
  })

  test('Plenos page TopDepartmentsCard chips link into /departamentos/:slug', async ({ page }) => {
    // The TopDepartmentsCard + its /departamentos/ chips only render when the
    // agenda snapshot has departments; skip when the upstream scraper has not
    // populated them (not a frontend bug — the page honestly hides the card).
    test.skip(!agendaHasDepartments(), 'plenos-agendas.json has no departments in this snapshot')
    await page.goto('/plenos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Ver dashboard por departamento/i).first()).toBeVisible({
      timeout: 8000,
    })
    const chip = page.locator('a[href^="/departamentos/"]').first()
    await expect(chip).toBeVisible()
  })
})
