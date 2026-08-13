import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Cargos (/cargos)', () => {
  test('renders the corporación grid with mayor + party breakdown', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })

    // Mayor anchor — officials.json role=alcalde slug is stable.
    await expect(page.getByText('Robert Raga Gadea').first()).toBeVisible({ timeout: 8000 })

    // At least one party label appears (PSOE / PP / VOX / Compromís).
    await expect(page.getByText(/PSOE|PP|VOX|Compromís/).first()).toBeVisible()

    // Concejal cards link to /cargos/<slug>.
    const detailLink = page.locator('a[href^="/cargos/"]').first()
    await expect(detailLink).toBeVisible({ timeout: 8000 })

    expect(appErrors(errors)).toEqual([])
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

  test('the encaje block states its backing once per card, never as a repeated badge', async ({
    page,
  }) => {
    // Against the REAL snapshot, not a stub: the rule under test is about how
    // many times a thing renders, and a one-row stub cannot fail it.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Encaje declarado').first()).toBeVisible({ timeout: 8000 })

    const body = await page.locator('body').innerText()
    const count = (re: RegExp) => (body.match(re) ?? []).length
    const cards = count(/ENCAJE DECLARADO/g)
    const sentences = count(/Lo que aquí se cita procede del CV/g)

    // It renders at all (an assertion that measures nothing is the failure mode
    // this repo keeps hitting), and never more than once per card.
    expect(cards).toBeGreaterThan(0)
    expect(sentences).toBeGreaterThan(0)
    expect(sentences).toBeLessThanOrEqual(cards)
    // And NOT as a mark beside every chip. While all the assessments agree —
    // they all do today — the per-item mark must not appear anywhere at all.
    // Matched as a bare word rather than a whole line: the mark is a flex item
    // and how innerText breaks lines around it is a layout detail, so anchoring
    // to one would make this assertion depend on styling to fail. The one-line
    // sentence above never contains the word.
    expect(body).not.toMatch(/\bautodeclarada\b/)
  })

  test('every encaje card states what it was compared against, harshest included', async ({
    page,
  }) => {
    // Against the REAL snapshot, and about the cards a reader judges hardest.
    // Three published officials — jose-luis-ramos-march, maria-esther-gomez-laredo
    // and alfredo-pla-gimenez — read «sin relación declarada» on both axes and
    // cite nothing at all, so no backing sentence applied and the card rendered
    // two bare negative labels with no provenance whatsoever. Two of them carry a
    // signed warning frame above as well. A card stating nothing about its source
    // reads as a finding no component asserts.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Encaje declarado').first()).toBeVisible({ timeout: 8000 })
    const body = await page.locator('body').innerText()

    // innerText reflects CSS text-transform, so the eyebrow arrives uppercased.
    const blocks = body
      .split('ENCAJE DECLARADO')
      .slice(1)
      .map((s) => {
        const end = s.indexOf('qué exige la ley')
        return end === -1 ? s : s.slice(0, end)
      })
    // The assertion has to bite on something: a gate that measures zero cards is
    // the green-but-vacuous shape DATA_INTEGRITY warns about.
    expect(blocks.length).toBeGreaterThan(0)
    // The uncited case is REACHABLE in the published data, not only in a stub.
    expect(blocks.filter((b) => /Lo que se compara es el CV/.test(b)).length).toBeGreaterThan(0)
    // And no card goes without: every provenance sentence names the CV. If a
    // card with divergent backing ever appears — none exists today — this goes
    // red, and someone decides what the per-item marks say about provenance.
    for (const b of blocks) expect(b).toMatch(/\bCV\b/)
  })

  test('the populated encaje block names the credential and renders no score', async ({ page }) => {
    // Stubbed on purpose: the published rows move with every promotion, so
    // pinning "no percentage anywhere" to them would drift into measuring
    // whatever happens to be there — including, at the limit, an empty block,
    // the green-but-vacuous shape DATA_INTEGRITY warns about. The stub fixes a
    // known POPULATED shape so the assertion always has something to bite on.
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
                evidence: [
                  {
                    label: 'Arquitecto Técnico — UPV',
                    short: 'Arquitecto Técnico',
                    sourceIds: ['src-060'],
                  },
                ],
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

    // The block is really there, and «Formación» names the TITLE — not the área,
    // which the card already prints above, and not the university, which is not
    // what «Formación» claims and belongs on the área view with its citation.
    await expect(page.getByText('Encaje declarado').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Arquitecto Técnico').first()).toBeVisible()
    await expect(page.getByText('sin relación declarada').first()).toBeVisible()

    const body = await page.locator('body').innerText()
    const section = body.slice(body.indexOf('CONCEJALAS Y CONCEJALES'))
    // innerText reflects CSS text-transform, so the eyebrow arrives uppercased.
    expect(section).toMatch(/encaje declarado/i)
    expect(section).not.toContain('UPV')
    // One área, related, so the relation reaches all of them: nothing to qualify.
    expect(section).not.toMatch(/solo en/i)
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
