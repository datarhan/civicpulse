import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Laboratorio (/laboratorio)', () => {
  test('renders header, KPI strip, and dashboard rail', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/laboratorio', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByText(/Observatorio de medios · Riba-roja de Túria/i).first(),
    ).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByRole('heading', { name: 'Laboratorio de verificación de prensa' }),
    ).toBeVisible()

    await expect(page.getByText('Titulares monitorizados').first()).toBeVisible()
    await expect(page.getByText('Artículos auditados').first()).toBeVisible()
    await expect(page.getByText('Tasa de verificación').first()).toBeVisible()
    await expect(page.getByText('Tasa de discrepancia').first()).toBeVisible()
    await expect(page.getByText('Triangulación').first()).toBeVisible()
    await expect(page.getByText('Hallazgos editoriales').first()).toBeVisible()

    await expect(page.getByLabel('Filtrar por medio')).toBeVisible()
    await expect(page.getByLabel('Filtrar por veredicto')).toBeVisible()

    await expect(page.getByText(/Medios monitorizados/i).first()).toBeVisible()
    await expect(page.getByText(/Lo que la prensa local no está siguiendo/i).first()).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  // Honesty invariant (data-independent), reanclado el 2026-08-29 de la tasa de
  // VERIFICACIÓN a la de DISCREPANCIA.
  //
  // Las dos no son simétricas, y colgar el aviso de la primera dejaba pasar
  // justo el estado que había: 63 claims, las 63 `sin-datos`. La verificación
  // valía «0 %» —cierto: 0 de 63 comprobadas, que es una cobertura— así que la
  // rama del else exigía que el aviso NO saliera, y la página publicaba «TASA
  // DE DISCREPANCIA 0 %» sin advertencia ninguna. Un 0 % de discrepancia sobre
  // un corpus que nadie ha examinado se lee «hemos mirado y no hay
  // discrepancias».
  //
  // El aviso cuelga ahora de lo que de verdad significa: si ni una sola
  // afirmación ha llegado a un veredicto, la discrepancia no vale 0, no existe,
  // y el aviso lo dice. Sigue sin depender del dato cargado.
  test('shows the extraction-pending banner iff the discrepancy rate is unavailable', async ({
    page,
  }) => {
    await page.goto('/laboratorio', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { name: 'Laboratorio de verificación de prensa' }),
    ).toBeVisible({ timeout: 8000 })

    const valorKpi = async (etiqueta: string) =>
      (
        await page
          .getByText(etiqueta, { exact: true })
          .first()
          .locator('xpath=following-sibling::div[1]')
          .innerText()
      ).trim()

    const discrepancia = await valorKpi('Tasa de discrepancia')
    const bannerVisible = await page.getByText(/Extracción pendiente/i).isVisible()

    if (discrepancia === '—') {
      expect(bannerVisible, 'sin veredictos resueltos el aviso tiene que salir').toBe(true)
    } else {
      expect(bannerVisible, 'con la discrepancia medida el aviso sobra').toBe(false)
    }

    // Y la asimetría, afirmada: la cobertura no se apaga con el hallazgo. Si
    // alguien vuelve a poner las dos tasas en «—» a la vez, esto lo dice.
    if (bannerVisible) {
      const verificacion = await valorKpi('Tasa de verificación')
      expect(
        verificacion,
        '«0 de 63 verificadas» es un hecho y se publica; sólo la discrepancia se calla',
      ).not.toBe('—')
    }
  })

  test('sidebar has a Laboratorio link that lands on /laboratorio', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    const link = page
      .locator('.cp-shell-sidebar')
      .getByRole('link', { name: /Laboratorio/i })
      .first()
    await expect(link).toBeVisible({ timeout: 8000 })
    await link.click()
    await expect(page).toHaveURL(/\/laboratorio$/)
  })

  test('methodology footer + right-of-reply CTA render', async ({ page }) => {
    await page.goto('/laboratorio', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Política editorial/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('link', { name: /Leer metodología/i }).first()).toBeVisible()
  })

  test('publishes ClaimReview JSON-LD only for press findings that carry a refutation', async ({
    page,
    request,
  }) => {
    // Derived from the snapshot, not hard-coded: press-findings.json is empty
    // today, so a bare `length === 0` would be green whatever the component
    // did. `contradiction[]` is the gate on this surface too — a press
    // `verificado` verdict comes from the same deterministic matcher and is
    // not an adjudication (see ClaimReviewJsonLd.jsx).
    const snapshot = await request.get('/data/press-findings.json')
    expect(snapshot.ok(), 'press-findings.json must be served').toBeTruthy()
    const items: { contradiction?: unknown[] }[] = (await snapshot.json()).items
    const expected = items.filter((f) => (f.contradiction ?? []).length > 0).length

    await page.goto('/laboratorio', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { name: 'Laboratorio de verificación de prensa' }),
    ).toBeVisible({ timeout: 8000 })

    const ldScripts = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(ldScripts.length).toBe(expected)
    for (const raw of ldScripts) {
      const payload = JSON.parse(raw)
      expect(payload['@context']).toBe('https://schema.org')
      expect(payload['@type']).toBe('ClaimReview')
      expect(payload.author?.name).toBe('CivicPulse')
      expect(payload.reviewRating?.ratingValue).toBe(1)
      expect(typeof payload.claimReviewed).toBe('string')
    }
  })
})
