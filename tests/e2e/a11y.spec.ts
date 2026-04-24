import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const ROUTES = [
  '/',
  '/cargos',
  '/presupuesto',
  '/plenos',
  '/promesas',
  '/datos',
  '/quejas',
  '/quejas/dashboard',
  '/metodologia',
  '/aviso-legal',
]

test.describe('Accessibility (WCAG 2.1 AA)', () => {
  for (const path of ROUTES) {
    test(`${path} has no critical or serious axe violations`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      const blocking = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      )
      if (blocking.length) {
        const summary = blocking
          .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
          .join('\n')
        throw new Error(`Found ${blocking.length} blocking a11y violation(s):\n${summary}`)
      }
      expect(blocking).toEqual([])
    })
  }
})
