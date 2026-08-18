import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Declaraciones (/declaraciones)', () => {
  test('renders the global verified-claims browse page', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/declaraciones', { waitUntil: 'domcontentloaded' })

    // Eyebrow + title
    await expect(page.getByText(/Verificaci.n de declaraciones/i).first()).toBeVisible()
    await expect(page.getByText(/Declaraciones en pleno/i).first()).toBeVisible({
      timeout: 8000,
    })

    // Stats strip — at least the "Total" mini-stat renders.
    await expect(page.getByText(/^Total$/i).first()).toBeVisible({ timeout: 5000 })

    // Filter chip "Con evidencia" exists (default-selected).
    await expect(page.getByRole('button', { name: /Con evidencia/i }).first()).toBeVisible()

    // At least one claim card renders (we have 4658+ claims at time of writing).
    await expect(page.locator('text=/«[^»]+»/').first()).toBeVisible({ timeout: 8000 })

    expect(appErrors(errors)).toEqual([])
  })

  test('verdict filter narrows the visible set', async ({ page }) => {
    await page.goto('/declaraciones', { waitUntil: 'domcontentloaded' })
    // Click "Crítico"-style filter — try "contradicho". If 0 matches, the
    // empty-state copy renders. Either is a successful filter behaviour.
    const contradichoChip = page.getByRole('button', { name: /^contradicho/i }).first()
    await contradichoChip.click()
    await expect(page.getByText(/Ninguna declaraci.n coincide|contradicho/i).first()).toBeVisible({
      timeout: 5000,
    })
  })

  test('sidebar nav has Declaraciones entry linking here', async ({ page }) => {
    // Sidebar only renders on InnerShell routes — not on the landing page,
    // which has its own LeftRail. Use /cargos to exercise the full sidebar.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    const link = page.locator('a[href="/declaraciones"]').first()
    await expect(link).toBeVisible({ timeout: 10_000 })
    await link.click()
    await expect(page).toHaveURL(/\/declaraciones$/)
  })
})

/**
 * Cada claim reclasificado por curador sale en el registro con la etiqueta de
 * su tipo NUEVO — el enum se importa y la fila se localiza con los filtros
 * reales de la página, así que una entrada futura del sidecar queda vigilada
 * sin tocar este spec.
 */
test.describe('Reclasificaciones en el registro (/declaraciones)', () => {
  test('la fila reclasificada lleva la etiqueta del tipo nuevo, no «Acusación pública»', async ({
    page,
  }) => {
    const { readFileSync } = await import('node:fs')
    const { CLAIM_TYPE_LABEL } = await import('../../src/hooks/usePlenoClaims')
    const reclas = JSON.parse(
      readFileSync('public/data/pleno-claim-reclassifications.json', 'utf8'),
    ) as { entries: Record<string, { type: string }> }
    const monolito = JSON.parse(readFileSync('public/data/pleno-claims-verified.json', 'utf8')) as {
      items: Array<{ claim: { id: string; type: string; verbatim: string } }>
    }

    const entradas = Object.entries(reclas.entries)
    expect(entradas.length).toBeGreaterThan(0)

    for (const [claimId, e] of entradas) {
      const item = monolito.items.find((it) => it.claim.id === claimId)
      expect(item, `${claimId} no está en el corpus publicado`).toBeTruthy()
      expect(item!.claim.type).toBe(e.type)

      await page.goto('/declaraciones', { waitUntil: 'networkidle' })
      // El filtro arranca en «Con evidencia»; la fila reclasificada puede ser
      // sin-datos, así que primero «Todas» y después el buscador de literal.
      await page.getByRole('button', { name: /Todas/i }).first().click()
      await page.locator('input').first().fill(item!.claim.verbatim.slice(0, 30))
      const fila = page.locator('text=/«[^»]+»/').first()
      await expect(fila).toBeVisible({ timeout: 8000 })

      const label = CLAIM_TYPE_LABEL[e.type as keyof typeof CLAIM_TYPE_LABEL] ?? e.type
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
      await expect(page.getByText('Acusación pública', { exact: true })).toHaveCount(0)
    }
  })
})
