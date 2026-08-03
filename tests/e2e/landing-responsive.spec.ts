import { test, expect } from '@playwright/test'

/**
 * The landing's responsive contract.
 *
 * mobile.spec.ts already visits `/` at 375px and asserted "no horizontal
 * scroll" — and passed, throughout the entire period the page was broken there.
 * That is the failure this file exists to prevent repeating: the editorial
 * column was a hard `width: 420 / flex-shrink: 0` at every viewport, so at
 * 375px the map rendered 0px wide and 101px of the column was CLIPPED. Clipping
 * produces no document overflow, so the assertion was satisfied *by the bug*.
 *
 * The checks below are the ones that could not be satisfied that way: the
 * column must actually fit, and the map must still be a map.
 */

/** Both panes must remain usable, so measure both — not just the document. */
const WIDTHS = [1440, 1280, 1024, 900, 820, 768, 600, 430, 375]

/** Below this the panes stack (kept in sync with STACK_BREAKPOINT). */
const STACK_BELOW = 1024

async function measure(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const col = document.querySelector('.d-editorial')
    const map = document.querySelector('.leaflet-container')
    const c = col?.getBoundingClientRect()
    const m = map?.getBoundingClientRect()
    return {
      colLeft: c ? Math.round(c.left) : null,
      colRight: c ? Math.round(c.right) : null,
      colWidth: c ? Math.round(c.width) : null,
      mapWidth: m ? Math.round(m.width) : null,
      mapHeight: m ? Math.round(m.height) : null,
      docWidth: document.documentElement.scrollWidth,
      viewWidth: window.innerWidth,
    }
  })
}

test.describe('Landing responsive contract', () => {
  for (const width of WIDTHS) {
    test(`${width}px — both panes usable, nothing clipped`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      const m = await measure(page)

      // The editorial column must FIT. This is the assertion the old
      // no-horizontal-scroll check could not make: content clipped off the
      // right edge is unreachable precisely because it doesn't scroll.
      expect(m.colRight, `column right edge at ${width}px`).toBeLessThanOrEqual(m.viewWidth + 1)
      expect(m.colLeft, `column left edge at ${width}px`).toBeGreaterThanOrEqual(0)

      // A 0px-wide map is not a degraded map, it is a missing one.
      expect(m.mapWidth, `map width at ${width}px`).toBeGreaterThanOrEqual(260)
      expect(m.mapHeight, `map height at ${width}px`).toBeGreaterThanOrEqual(240)

      // Still no document-level horizontal scroll (6px for control rounding).
      expect(m.docWidth, `document width at ${width}px`).toBeLessThanOrEqual(m.viewWidth + 6)
    })
  }

  test('panes sit side by side above the breakpoint and stack below it', async ({ page }) => {
    await page.setViewportSize({ width: STACK_BELOW + 200, height: 900 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const wide = await measure(page)
    expect(wide.colWidth, 'column keeps its fixed width on desktop').toBe(420)
    expect(wide.colLeft, 'column sits to the right of the map').toBeGreaterThan(0)

    await page.setViewportSize({ width: STACK_BELOW - 200, height: 900 })
    await page.waitForTimeout(900)
    const narrow = await measure(page)
    expect(narrow.colLeft, 'column starts at the left edge once stacked').toBe(0)
    expect(narrow.colWidth, 'column spans the viewport once stacked').toBe(narrow.viewWidth)
  })

  test('the shell never becomes a scroll container', async ({ page }) => {
    // Load-bearing, and not obvious: any overflow other than `visible` on
    // `.d-shell` makes axe's color-contrast rule evaluate zero nodes inside it,
    // which is how 26 real contrast failures stayed invisible. Clipping one
    // axis is not an escape hatch — per CSS Overflow §3 the other computes to
    // `auto`. Overflow is contained at its sources instead.
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1200)
      const overflow = await page.evaluate(() => {
        const el = document.querySelector('.d-shell')!
        const cs = getComputedStyle(el)
        return { x: cs.overflowX, y: cs.overflowY }
      })
      expect(overflow, `.d-shell overflow at ${width}px`).toEqual({ x: 'visible', y: 'visible' })
    }
  })
})
