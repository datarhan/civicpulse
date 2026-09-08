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
    { label: 'Reportajes', url: /\/reportajes$/ },
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

/**
 * Al cambiar de página, el lector empieza por arriba.
 *
 * Medido en producción el 8-09-2026: con /cargos a 3.000 px, pulsar
 * «Biografía →» abría la biografía —9.272 px— también a 3.000 px, o sea en
 * mitad del apartado de bienes, sin el nombre a la vista. Ninguna prueba lo
 * veía porque todas navegan con `goto`, que SÍ recarga y sí resetea el scroll;
 * el defecto sólo existe en la navegación de cliente, que es la que usa quien
 * lee. Aquí se pulsa el enlace, como un lector.
 */
test.describe('Scroll al navegar', () => {
  test('pulsar un enlace desde media página abre la siguiente por arriba', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.cp-shell-sidebar')).toBeVisible({ timeout: 10_000 })
    const bio = page.locator('a[href^="/laboratorio/agentes/"]').first()
    await expect(bio).toBeVisible({ timeout: 10_000 })

    await page.evaluate(() => window.scrollTo(0, 1200))
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(600)

    await bio.click()
    await expect(page).toHaveURL(/\/laboratorio\/agentes\/.+/)
    await expect
      .poll(async () => page.evaluate(() => Math.round(window.scrollY)), { timeout: 8000 })
      .toBeLessThan(60)
  })

  test('volver atrás NO devuelve al lector arriba: recupera donde lo dejó', async ({ page }) => {
    // La otra mitad de la regla. Un reseteo incondicional arreglaría el defecto
    // de arriba y rompería esto, que es peor: quien vuelve a una lista larga
    // pierde su sitio y tiene que buscarlo otra vez.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.cp-shell-sidebar')).toBeVisible({ timeout: 10_000 })
    const bio = page.locator('a[href^="/laboratorio/agentes/"]').first()
    await expect(bio).toBeVisible({ timeout: 10_000 })

    await page.evaluate(() => window.scrollTo(0, 1200))
    await bio.click()
    await expect(page).toHaveURL(/\/laboratorio\/agentes\/.+/)

    await page.goBack()
    await expect(page).toHaveURL(/\/cargos$/)
    await expect
      .poll(async () => page.evaluate(() => Math.round(window.scrollY)), { timeout: 8000 })
      .toBeGreaterThan(600)
  })

  test('un permalink con fragmento sigue aterrizando en su ancla, no arriba', async ({ page }) => {
    // `useHashScroll` es el dueño de los fragmentos y lleva el offset de la
    // barra pegajosa. Un reseteo que no se apartara lo pisaría, y todo
    // permalink del sitio volvería a abrir por arriba — el defecto que aquel
    // hook vino a arreglar.
    await page.goto('/metodologia#mudanza-portal', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.cp-shell-sidebar')).toBeVisible({ timeout: 10_000 })
    // UNA sola lectura atómica, y la banda entera dentro del sondeo.
    //
    // Las dos versiones anteriores sondeaban una condición y afirmaban sobre
    // otra, en dos lecturas: la página sigue colocándose entre una y otra, así
    // que la carrera existía en los dos sentidos y se vieron los dos —el ancla
    // a 260 px por debajo, y otra pasada a 802 px por encima—. Cualquier patrón
    // de «sondea A, lee B» sobre una página que aún asienta es flaky por
    // construcción; el arreglo no es esperar más, es preguntar una sola cosa.
    //
    // El valor devuelto dice CUÁNTO se fue cuando falla, que es lo que hace
    // falta para diagnosticar sin abrir la captura.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const el = document.getElementById('mudanza-portal')
            if (!el) return 'sin-ancla'
            const top = Math.round(el.getBoundingClientRect().top)
            return top > -20 && top < 140 ? 'en-banda' : `fuera-de-banda:${top}`
          }),
        { timeout: 15_000 },
      )
      .toBe('en-banda')
  })
})
