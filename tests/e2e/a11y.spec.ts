import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'

// A real pleno id with claims, read from the committed manifest (for /plenos/:id).
const FIRST_PLENO_ID = JSON.parse(readFileSync('public/data/pleno-claims/index.json', 'utf8'))
  .plenos?.[0]?.plenoId

// A real job-offer id, read from the committed snapshot (for /empleo/:id).
const FIRST_OFERTA_ID = JSON.parse(readFileSync('public/data/empleo.json', 'utf8')).items?.[0]?.id

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
  '/empleo',
  '/empleo-publico',
  `/empleo/${FIRST_OFERTA_ID}`,
  '/quejas',
  '/quejas/dashboard',
  '/quejas/q-no-existe',
  '/cambios',
  '/eficiencia',
  '/laboratorio',
  '/laboratorio/agentes',
  '/laboratorio/frontera',
  '/nosotros',
  '/about',
  '/reportajes',
  '/reportajes/reconstruccion-dana',
  '/reportajes/inteligencia-turistica',
  '/blog/building-civicpulse-with-ai',
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
  // A run must prove it did work — docs/DATA_INTEGRITY.md rule #2, applied to
  // this gate rather than to a scraper.
  //
  // The landing reported "no contrast violations" for its entire history while
  // axe evaluated ZERO nodes on it. axe cannot resolve a background stack
  // through the Leaflet tile layer, so it abandons the rule for the whole page;
  // comparable routes get hundreds of checks (/cargos 258, /presupuesto 543).
  // Hiding the map — which carries no text of ours — lets the rule see the 222
  // nodes that do. That first honest run surfaced 26 real failures, from
  // 1.54:1 metro badges to section headings sitting at 4.0 on their own washes.
  //
  // The assertion is on the COUNT as well as the verdict: a zero means the rule
  // silently no-op'd, and any green above it is worth nothing.
  const HIDE_MAP = '.leaflet-container{display:none !important}'
  for (const path of ['/', '/cargos', '/presupuesto']) {
    test(`${path} — contrast rule runs, and passes what it sees`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      await page.addStyleTag({ content: HIDE_MAP })
      await page.waitForTimeout(300)
      const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
      const violations = r.violations.flatMap((v) => v.nodes)
      const evaluated = r.passes.flatMap((p) => p.nodes).length + violations.length
      expect(
        evaluated,
        `axe checked ${evaluated} nodes for contrast on ${path} — the rule did not run, so a green result proves nothing`,
      ).toBeGreaterThan(20)
      expect(
        violations.map((n) => `${n.target.join(' ')} — ${n.any[0]?.message ?? ''}`),
        `contrast failures on ${path}`,
      ).toEqual([])
    })
  }

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
