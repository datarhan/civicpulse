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

  test('«Ver responsable» belongs to its own card, not the next concejalía', async ({ page }) => {
    // The card and its link to the responsible councillor must be ONE grid
    // item. When the card component returned a fragment they became two, the
    // link landed in the next column, and — because a concejalía with no
    // responsable emits no link at all — the offset drifted down the list.
    // Every link then sat against a card belonging to somebody else, on a page
    // whose whole job is saying which councillor answers for which área.
    await page.goto('/departamentos', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('a[href^="/departamentos/"]').first()).toBeVisible({ timeout: 8000 })

    const layout = await page.evaluate(() => {
      const card = document.querySelector('a[href^="/departamentos/"]')
      let grid = card?.parentElement ?? null
      while (grid && getComputedStyle(grid).display !== 'grid') grid = grid.parentElement
      if (!grid) return null
      const items = Array.from(grid.children)
      const officialLinks = Array.from(grid.querySelectorAll('a[href^="/cargos/"]'))
      return {
        gridItems: items.length,
        cards: grid.querySelectorAll('a[href^="/departamentos/"]').length,
        officialLinks: officialLinks.length,
        // A link whose own grid cell holds no department card has nothing to
        // attach it to — the reader resolves it by proximity, which is wrong.
        orphaned: officialLinks
          .filter(
            (a) => !items.find((i) => i.contains(a))?.querySelector('a[href^="/departamentos/"]'),
          )
          .map((a) => a.getAttribute('href')),
        // Correct DOM nesting is not enough: the link hangs in the gutter
        // between two rows, and a reader assigns it to whichever card looks
        // closer. Only a card the link sits ABOVE competes for it — one off to
        // the side is disambiguated by column alignment, which `inOwnColumn`
        // covers. So the gap that matters is vertical, and it is the row gap.
        proximity: items
          .map((item) => {
            const own = item.querySelector('a[href^="/departamentos/"]')
            const link = item.querySelector('a[href^="/cargos/"]')
            if (!own || !link) return null
            const c = own.getBoundingClientRect()
            const l = link.getBoundingClientRect()
            const below = Array.from(grid.querySelectorAll('a[href^="/departamentos/"]'))
              .filter((o) => o !== own)
              .map((o) => o.getBoundingClientRect())
              .filter((r) => r.left < l.right && r.right > l.left && r.top >= l.bottom)
              .reduce((min, r) => Math.min(min, r.top - l.bottom), Infinity)
            // Raw sub-pixel values: rounding these put the comparison on a
            // knife edge where Chrome and headless Chromium disagreed, and the
            // test passed or failed on the renderer rather than the layout.
            return {
              dept: own.getAttribute('href'),
              inOwnColumn: l.left >= c.left - 1 && l.right <= c.right + 1,
              above: l.top - c.bottom,
              below: below === Infinity ? null : below,
            }
          })
          .filter((p): p is NonNullable<typeof p> => p !== null),
      }
    })

    expect(
      layout,
      'no grid of department cards found — stale selector, not a layout bug',
    ).not.toBeNull()
    // Prove the check measured something. Without these, a page that rendered
    // no cards at all would satisfy every assertion below.
    expect(layout!.cards).toBeGreaterThan(5)
    expect(layout!.officialLinks).toBeGreaterThan(5)

    expect(layout!.orphaned).toEqual([])
    expect(layout!.gridItems).toBe(layout!.cards)

    expect(layout!.proximity.length).toBe(layout!.officialLinks)
    expect(layout!.proximity.filter((p) => !p.inOwnColumn)).toEqual([])

    // Cards in the last row have nothing below them; the rest must be measured,
    // or a layout change that stops producing rows would pass by vacuum.
    const stacked = layout!.proximity.filter((p) => p.below !== null)
    expect(stacked.length).toBeGreaterThan(5)
    // The card below must be clearly further away than the card above, not
    // marginally so — a few pixels is not a distinction a reader makes.
    // Calibrated by ablation rather than taste: 3.77 at the shipped 20px row
    // gap, 2.43 with it back at 12px. The bound sits between, far enough from
    // both that sub-pixel differences between renderers cannot flip it.
    // Asserted as a scalar so a failure prints the number, not a list of slugs.
    const ratio = Math.min(...stacked.map((p) => p.below! / p.above))
    expect(ratio).toBeGreaterThan(3)
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
