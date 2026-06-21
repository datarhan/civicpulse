import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'

// A real pleno id with claims, read from the committed manifest (for /plenos/:id).
const FIRST_PLENO_ID = JSON.parse(
  readFileSync('public/data/pleno-claims/index.json', 'utf8'),
).plenos?.[0]?.plenoId

// Routes the suite enforces — must stay free of critical/serious violations.
const STRICT_ROUTES = [
  '/',
  '/cargos',
  '/cargos/robert-raga-gadea',
  '/presupuesto',
  '/plenos',
  `/plenos/${FIRST_PLENO_ID}`,
  '/promesas',
  '/departamentos',
  '/departamentos/urbanismo',
  '/hallazgos',
  '/declaraciones',
  '/datos',
  '/quejas',
  '/quejas/dashboard',
  '/quejas/q-no-existe',
  '/cambios',
  '/laboratorio',
  '/laboratorio/agentes',
  '/laboratorio/agentes/a-robert-raga-bio',
  '/lab-health',
  '/metodologia',
  '/aviso-legal',
]

// Empty by design — when a regression is found, add the path here with a
// reason citing the axe rule id and a TODO to fix the page, not the test.
const KNOWN_DEBT_ROUTES: Array<{ path: string; reason: string }> = []

async function scanForBlockingViolations(page: import('@playwright/test').Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  return results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
}

test.describe('Accessibility (WCAG 2.1 AA)', () => {
  for (const path of STRICT_ROUTES) {
    test(`${path} has no critical or serious axe violations`, async ({ page }) => {
      const blocking = await scanForBlockingViolations(page, path)
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

test.describe('Accessibility — known debt (quarantined)', () => {
  for (const { path, reason } of KNOWN_DEBT_ROUTES) {
    test(`${path} (debt: ${reason})`, async ({ page }) => {
      test.fixme(true, `Known a11y debt on ${path}: ${reason}`)
      const blocking = await scanForBlockingViolations(page, path)
      expect(blocking).toEqual([])
    })
  }
})
