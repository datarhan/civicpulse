import { test, expect } from '@playwright/test'

test.describe('Cargos (/cargos)', () => {
  test('renders the corporación grid with mayor + party breakdown', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })

    // Mayor anchor — officials.json role=alcalde slug is stable.
    await expect(page.getByText('Robert Raga Gadea').first()).toBeVisible({ timeout: 8000 })

    // At least one party label appears (PSOE / PP / VOX / Compromís).
    await expect(page.getByText(/PSOE|PP|VOX|Compromís/).first()).toBeVisible()

    // Concejal cards link to /cargos/<slug>.
    const detailLink = page.locator('a[href^="/cargos/"]').first()
    await expect(detailLink).toBeVisible({ timeout: 8000 })

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('the alcalde card links Biografía to the published journalist report', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    // The alcalde has a published agent report, so his Biografía link must be
    // the INTERNAL report route (the old external transparency-listing URL
    // was useless as a biography). Other councillors keep the cvUrl fallback.
    const bioLink = page.locator('a[href^="/laboratorio/agentes/"]', { hasText: 'Biografía' })
    await expect(bioLink.first()).toBeVisible({ timeout: 8000 })
    await bioLink.first().click()
    await expect(page).toHaveURL(/\/laboratorio\/agentes\/a-robert-raga-bio/)
    await expect(page.getByText('Robert Raga Gadea').first()).toBeVisible({ timeout: 8000 })
  })

  test('a councillor with no delegated área says so, rather than rendering blank', async ({
    page,
  }) => {
    // 10 of 21 hold no portfolio, so no encaje row can exist for them. Without
    // this explicit state /cargos silently becomes "the governing party has
    // credentials, everyone else is blank" — an artifact of who governs, not of
    // who is qualified. The empty case has to be PROVEN reachable: a suite that
    // only asserts the populated path would stay green while the blank returned.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    const card = page
      .locator('div')
      .filter({ hasText: /^PP/ })
      .filter({ hasText: 'Laura Guzman Bruno' })
      .first()
    await expect(card).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Sin delegación de área').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(/no hay área con la que comparar/i).first()).toBeVisible()
  })

  test('the populated encaje block names áreas and renders no score', async ({ page }) => {
    // The published snapshot ships with zero rows (each names a living person
    // and waits on a curator signature), so asserting "no percentage on the
    // page" against it would pass by measuring an empty block — the exact
    // green-but-vacuous shape DATA_INTEGRITY warns about. Stub the snapshot so
    // the POPULATED render is what gets checked.
    await page.route('**/data/area-fit.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: '2026-08-03T00:00:00.000Z',
          mandate: '2023-2027',
          rows: [
            {
              officialSlug: 'teresa-pozuelo-martin',
              portfolio: 'Urbanismo',
              departmentSlug: 'urbanismo',
              reportId: 'r-teresa-pozuelo-bio-2026-07-30',
              formacion: {
                value: 'relacionada',
                evidence: [{ label: 'Arquitecto Técnico — UPV', sourceIds: ['src-060'] }],
              },
              experiencia: { value: 'sin-relacion-declarada', evidence: [] },
              curatedBy: 'e2e',
              curatedAt: '2026-08-03',
            },
          ],
        }),
      }),
    )
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })

    // The block is really there, and it names the área rather than counting it.
    await expect(page.getByText('Encaje declarado').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('sin relación declarada').first()).toBeVisible()

    const body = await page.locator('body').innerText()
    const section = body.slice(body.indexOf('CONCEJALAS Y CONCEJALES'))
    // innerText reflects CSS text-transform, so the eyebrow arrives uppercased.
    expect(section).toMatch(/encaje declarado/i)
    // No grade, in any of the shapes it could take.
    expect(section).not.toMatch(/encaje[^\n]{0,40}\d+\s*%/i)
    expect(section).not.toMatch(/\d+\s*\/\s*\d+\s*áreas/i)
    expect(section).not.toMatch(/\d+\s+de\s+\d+\s+áreas/i)
  })

  test('clicking a councillor link navigates into the detail view', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    const link = page.locator('a[href^="/cargos/"]').first()
    await expect(link).toBeVisible({ timeout: 8000 })
    const href = await link.getAttribute('href')
    expect(href).toMatch(/^\/cargos\/[a-z0-9-]+$/)
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${href!.replace(/\//g, '\\/')}$`))
    await expect(page.getByText(/nivel de grupo parlamentario|Atribución/i).first()).toBeVisible({
      timeout: 8000,
    })
  })
})
