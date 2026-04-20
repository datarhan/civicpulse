import { test, expect } from '@playwright/test'

const ROUTES = ['/', '/cargos', '/presupuesto', '/plenos', '/promesas', '/quejas', '/quejas/dashboard']

test.describe('Mobile shell (iPhone 13 mini / 375px)', () => {
  for (const path of ROUTES) {
    test(`${path} fits the viewport with no horizontal scroll`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' })
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
    await page.goto('/cargos', { waitUntil: 'networkidle' })
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
