import { test, expect } from '@playwright/test'
import { agendaHasDepartments } from './_agenda'

const HAS_DEPTS = agendaHasDepartments()

test.describe('Plenos (/plenos)', () => {
  test('renders pleno list + agenda + claim ledger sections', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/plenos', { waitUntil: 'domcontentloaded' })

    // Always-present sections (driven by plenos.json + pleno-claims, which load
    // independently of the agenda scraper). Anchored in src/pages/Plenos.jsx.
    await expect(page.getByText('Plenos recientes').first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText('Declaraciones hechas en el pleno · contraste con los datos').first(),
    ).toBeVisible()

    // The department analysis (TopDepartmentsCard) only renders when the agenda
    // snapshot has departments; the page honestly hides it otherwise.
    if (HAS_DEPTS) {
      await expect(
        page.getByText('Departamentos con más presencia en el pleno').first(),
      ).toBeVisible()
      await expect(page.locator('a[href^="/departamentos/"]').first()).toBeVisible()
    }

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('"Ver" expander reveals agenda items inline', async ({ page }) => {
    // The agenda expander needs per-pleno agenda items; skip when the agenda
    // snapshot is empty (upstream scraper not populated — not a frontend bug).
    test.skip(!HAS_DEPTS, 'plenos-agendas.json has no departments in this snapshot')
    await page.goto('/plenos', { waitUntil: 'domcontentloaded' })
    // Button label is the literal "Ver" / "Ocultar" toggle (src/pages/Plenos.jsx:109).
    const expander = page.getByRole('button', { name: /^Ver$/ }).first()
    await expect(expander).toBeVisible({ timeout: 8000 })
    await expander.click()
    // Once expanded, agenda rows render section pills (every item carries a
    // section). Robust to the sparse department inference of the regmeet feed.
    await expect(page.getByText(/Resolutiva|Informativa|Ruegos y preguntas/).first()).toBeVisible({
      timeout: 5000,
    })
  })
})
