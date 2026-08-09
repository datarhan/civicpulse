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

  /**
   * ClaimReview is emitted per ADJUDICATED finding, not per finding.
   *
   * This test used to assert `ldScripts.length > 0`, and it was green for the
   * wrong reason: every card emitted a block whose `reviewRating` came from
   * `severity`, so a councillor's own words shipped to Google's fact-check
   * index carrying CivicPulse's 5/5 «Verificado» because the finding happened
   * to be filed `informational`. The count is now derived from the published
   * snapshot rather than hard-coded, so this measures the gate in the rendered
   * DOM either way: zero today, N the day N refutations are curated.
   */
  test('publishes ClaimReview JSON-LD only for findings that carry a refutation', async ({
    page,
    request,
  }) => {
    const snapshot = await request.get('/data/pleno-findings.json')
    expect(snapshot.ok(), 'pleno-findings.json must be served').toBeTruthy()
    const items: { contradiction?: unknown[] }[] = (await snapshot.json()).items
    expect(items.length, 'no published findings — this test would measure nothing').toBeGreaterThan(
      10,
    )
    const expected = items.filter((f) => (f.contradiction ?? []).length > 0).length

    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Verificaci.n editorial/i).first()).toBeVisible({
      timeout: 8000,
    })
    // The cards mount after the snapshot lands; wait for one so an empty
    // `ldScripts` cannot be the pre-render state instead of the gate.
    await expect(page.locator('a[href^="/hallazgos#f-"]').first()).toBeVisible({ timeout: 15_000 })

    const ldScripts = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(ldScripts.length).toBe(expected)
    for (const raw of ldScripts) {
      const payload = JSON.parse(raw)
      expect(payload['@context']).toBe('https://schema.org')
      expect(payload['@type']).toBe('ClaimReview')
      expect(payload.author?.name).toBe('CivicPulse')
      // The only rating this site can source: `contradiction[]` is the only
      // adjudication either schema records, and it points one way.
      expect(payload.reviewRating?.ratingValue).toBe(1)
      expect(typeof payload.claimReviewed).toBe('string')
      // Pleno findings always point at the council session, never an outlet.
      expect(payload.itemReviewed?.appearance?.[0]?.url).toContain('/plenos')
    }
  })

  /**
   * A permalink that resolves to no element is worse than no permalink: the
   * href is well-formed, the page loads, and the reader is silently dropped at
   * the top with 52 findings between them and the one they were sent to read.
   *
   * Two independent things have to hold, and both were broken:
   *   · <Card> has to forward `id` (it destructured a fixed prop list),
   *   · something has to scroll AFTER the snapshot lands — the cards mount well
   *     after the browser's native hash scroll has already run and given up.
   *
   * So this asserts the settled position, not the markup. Fixing only the
   * passthrough leaves it red.
   */
  test('a cold-loaded #f-… permalink lands on its finding, not the page top', async ({
    page,
    request,
  }) => {
    // A real published id, read from the snapshot rather than hard-coded — a
    // curated file changes, and a stale literal would make this test measure
    // a missing element instead of a missing anchor.
    const snapshot = await request.get('/data/pleno-findings.json')
    expect(snapshot.ok(), 'pleno-findings.json must be served').toBeTruthy()
    const ids: string[] = (await snapshot.json()).items.map((f: { id: string }) => f.id)
    expect(ids.length, 'no published findings — this test would measure nothing').toBeGreaterThan(3)

    // Deliberately not the first card: the first one is at the top anyway, so
    // it would pass with no scrolling at all.
    const target = ids[ids.length - 1]

    await page.goto(`/hallazgos#${target}`, { waitUntil: 'domcontentloaded' })

    const el = page.locator(`[id="${target}"]`)
    await expect(el, 'the finding card must carry its id in the DOM').toBeAttached({
      timeout: 15_000,
    })

    // The settled scroll position, after fonts and one painted frame.
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    await page.waitForFunction(
      (id) => {
        const node = document.getElementById(id)
        if (!node) return false
        const top = node.getBoundingClientRect().top
        return top >= -4 && top < window.innerHeight
      },
      target,
      { timeout: 10_000 },
    )

    // And prove the page actually moved — a viewport tall enough to show every
    // finding would satisfy the check above without any scrolling.
    const scrolled = await page.evaluate(() => window.scrollY)
    expect(scrolled, 'the page never scrolled — the fragment resolved nowhere').toBeGreaterThan(100)
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
