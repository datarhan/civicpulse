import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

// A real pleno id with claims, read from the committed manifest (for /plenos/:id).
const FIRST_PLENO_ID = JSON.parse(readFileSync('public/data/pleno-claims/index.json', 'utf8'))
  .plenos?.[0]?.plenoId

const ROUTES = [
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
  '/quejas',
  '/quejas/dashboard',
  '/quejas/q-no-existe',
  '/cambios',
  '/laboratorio',
  '/nosotros',
  '/about',
  '/metodologia',
  '/aviso-legal',
]

test.describe('Mobile shell (iPhone 13 mini / 375px)', () => {
  for (const path of ROUTES) {
    test(`${path} fits the viewport with no horizontal scroll`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(600)

      const overflow = await page.evaluate(() => ({
        docW: document.documentElement.scrollWidth,
        viewW: window.innerWidth,
      }))
      // Allow a 6px sub-pixel margin for browser rounding of map controls.
      expect(overflow.docW).toBeLessThanOrEqual(overflow.viewW + 6)
    })
  }

  test('hamburger opens the sidebar drawer, Escape closes it', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    const sidebar = page.locator('.cp-shell-sidebar')
    const hamburger = page.getByRole('button', { name: /menú/i })

    // Drawer starts collapsed (transform translated off-screen)
    await expect(sidebar).not.toHaveClass(/cp-sidebar-open/)

    await hamburger.click()
    await expect(sidebar).toHaveClass(/cp-sidebar-open/)

    await page.keyboard.press('Escape')
    await expect(sidebar).not.toHaveClass(/cp-sidebar-open/)
  })
})
