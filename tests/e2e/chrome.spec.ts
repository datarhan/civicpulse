import { test, expect } from '@playwright/test'

test.describe('CmdK spotlight', () => {
  test('Cmd+K opens the spotlight, Escape closes it', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    // Wait for the InnerShell to mount before Meta+k — CmdK's keydown listener
    // is attached in its useEffect, so it isn't live until React has rendered.
    await expect(page.locator('.cp-shell-sidebar')).toBeVisible({ timeout: 10_000 })

    await page.keyboard.press('Meta+k')
    const input = page.getByPlaceholder('Saltar a…')
    await expect(input).toBeVisible({ timeout: 5000 })

    await page.keyboard.press('Escape')
    await expect(input).not.toBeVisible()
  })

  test('typing filters results and clicking a row navigates', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.cp-shell-sidebar')).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Meta+k')
    const input = page.getByPlaceholder('Saltar a…')
    await expect(input).toBeVisible({ timeout: 5000 })

    await input.fill('Presupuesto')
    // Scope to the CmdK panel — the panel is the input's grandparent .parentElement.parentElement,
    // but locating "the button containing 'Presupuesto' that is not a sidebar link" is enough.
    // CmdK rows are <button>; sidebar uses <a role=link>. getByRole('button') excludes links.
    const presupRow = page
      .locator('button')
      .filter({ hasText: /^Presupuesto/ })
      .first()
    await expect(presupRow).toBeVisible({ timeout: 5000 })
    await presupRow.click()
    await expect(page).toHaveURL(/\/presupuesto$/)
  })
})

test.describe('Tweaks panel (dark mode + i18n)', () => {
  test('toggling dark mode applies html.dark', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Ajustes' }).click()

    // TwkToggle button has no accessible name — it's the only button inside
    // the row whose label-div renders "Modo oscuro" (TweaksPanel.jsx:41-71).
    const darkRow = page
      .locator('div')
      .filter({ hasText: /^Modo oscuro$/ })
      .first()
    const darkToggle = darkRow.getByRole('button')
    await expect(darkToggle).toBeVisible({ timeout: 5000 })

    const wasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    await darkToggle.click()
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(!wasDark)

    // Reset so other tests start in light mode.
    await darkToggle.click()
  })

  test('switching language updates sidebar copy and persists', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(
      page.locator('.cp-shell-sidebar').getByRole('link', { name: 'Cargos' }).first(),
    ).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Ajustes' }).click()

    // TwkSelect renders one <button> per locale (TweaksPanel.jsx:4-39).
    // Click the "Valencià" button.
    await page.getByRole('button', { name: 'Valencià' }).click()

    // Valencian label for nav.cargos is "Càrrecs" (src/i18n.jsx:170).
    await expect(
      page.locator('.cp-shell-sidebar').getByRole('link', { name: 'Càrrecs' }).first(),
    ).toBeVisible({ timeout: 5000 })

    const saved = await page.evaluate(() => localStorage.getItem('cp:lang'))
    expect(saved).toBe('ca')

    // Reset to Spanish so other tests in the same worker stay on default.
    await page.getByRole('button', { name: 'Castellà' }).click()
  })
})

test.describe('Sidebar navigation (desktop InnerShell)', () => {
  const NAV_LINKS: Array<{ label: string; url: RegExp }> = [
    { label: 'Cargos', url: /\/cargos$/ },
    { label: 'Presupuesto', url: /\/presupuesto$/ },
    { label: 'Plenos', url: /\/plenos$/ },
    { label: 'Promesas', url: /\/promesas$/ },
    { label: 'Departamentos', url: /\/departamentos$/ },
    { label: 'Hallazgos', url: /\/hallazgos$/ },
    { label: 'Declaraciones', url: /\/declaraciones$/ },
    { label: 'Datos', url: /\/datos$/ },
    { label: 'Quejas', url: /\/quejas$/ },
    { label: 'Empleo', url: /\/empleo$/ },
    { label: 'Empleo público', url: /\/empleo-publico$/ },
    { label: 'Laboratorio', url: /\/laboratorio$/ },
    { label: 'Quiénes somos', url: /\/nosotros$/ },
  ]

  for (const { label, url } of NAV_LINKS) {
    test(`sidebar link "${label}" navigates to its route`, async ({ page }) => {
      await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
      await page
        .locator('.cp-shell-sidebar')
        .getByRole('link', { name: new RegExp(`^${label}$`) })
        .first()
        .click()
      await expect(page).toHaveURL(url)
    })
  }
})
