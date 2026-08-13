import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Presupuesto (/presupuesto)', () => {
  test('renders money map dashboard + spend charts + subsidies', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })

    // New money-map dashboard (src/components/Presupuesto/GastoDashboard.jsx)
    await expect(page.getByText('¿A dónde va el dinero en contratos?').first()).toBeVisible({
      timeout: 8000,
    })
    await expect(page.getByRole('tab', { name: /Explorar contratos/ })).toBeVisible()

    // Existing budget context + subsidies still present
    await expect(page.getByText('En qué se gasta el dinero público').first()).toBeVisible()
    await expect(page.getByText('De dónde vienen los ingresos municipales').first()).toBeVisible()
    await expect(page.getByText('Subvenciones · Base Nacional').first()).toBeVisible()
    await expect(page.getByText(/€/).first()).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('the money-map heading matches what the figure under it counts', async ({ page }) => {
    // «¿A dónde va el dinero en obras?» sat directly above «De 68 M€
    // adjudicados en contratos», of which obras are roughly a quarter — the
    // heading promised public works and the figure delivered all municipal
    // contracting, majority town-wide services. The section's own small print
    // already said so four lines below, so the page contradicted itself.
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })

    // Anchored on a phrase that is a direct text node of the intro div, not on
    // the bolded clause — `getByText` resolves to the innermost match, and the
    // <strong> alone carries no percentage.
    const intro = page.getByText(/el desglose completo está en/i).first()
    // Wait for the SHARE, not merely for the sentence. The section mounts as
    // soon as tender-geo.json lands, while the percentage needs tenders.json
    // too — until then the copy degrades to «el grueso», which is honest on
    // screen but would let this test read a state with no claim in it and pass.
    await expect(intro).toContainText(/las obras son el \d+ %/, { timeout: 8000 })
    await expect(intro).toContainText(/todo el gasto en contratos, no solo obras/i)

    // The heading's obras share and the chart that proves it come from one
    // computation, so they cannot disagree one scroll apart. Compare them.
    const introText = await intro.innerText()
    const claimed = introText.match(/las obras son el (\d+) %/)
    expect(claimed, `no obras share in: ${introText}`).not.toBeNull()

    await page.getByRole('tab', { name: /Tipos de gasto/ }).click()
    const panelLoc = page.locator('[role="tabpanel"]')
    await expect(panelLoc).toContainText('Obras', { timeout: 8000 })
    const panel = await panelLoc.innerText()
    // Assert the check evaluated something: an empty panel would let any claim
    // through unchallenged.
    expect(panel).toMatch(/Obras/)
    const rows = panel.split('\n')
    const obrasPct = rows[rows.findIndex((r) => r.trim() === 'Obras') + 2]?.trim()
    expect(obrasPct).toBe(`${claimed![1]}%`)

    // And the claim has to be a minority share, or «no solo obras» would be the
    // wrong correction — this is the sentence's whole point.
    expect(Number(claimed![1])).toBeLessThan(50)
  })

  test('clicking a tab switches the panel', async ({ page }) => {
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: /Quién recibe el dinero/ }).click()
    // Leaderboard rows render contractor names; the explorer search box is gone.
    await expect(page.getByPlaceholder('Buscar contrato o empresa…')).toHaveCount(0)
  })
})
