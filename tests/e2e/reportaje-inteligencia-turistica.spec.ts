import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'

const snap = JSON.parse(readFileSync('public/data/reportajes/inteligencia-turistica.json', 'utf8'))

test.describe('Reportaje · inteligencia turística (/reportajes/inteligencia-turistica)', () => {
  test('la declaración de intereses, las tablas y las citas', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/reportajes/inteligencia-turistica', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 8000 })

    // LA DECLARACIÓN DE INTERESES, ARRIBA. La pieza examina unas licitaciones a
    // las que su editor valoró concurrir: lo dice en la cabecera, antes del
    // primer apartado, y no sólo en la última cautela del método.
    const conflicto = page.locator('[data-conflicto]')
    await expect(conflicto).toBeVisible()
    await expect(conflicto).toContainText('valoró concurrir')
    const yConflicto = await conflicto.evaluate((el) => el.getBoundingClientRect().top)
    const ySeccion1 = await page
      .locator('#seccion-01')
      .evaluate((el) => el.getBoundingClientRect().top)
    expect(yConflicto).toBeLessThan(ySeccion1)

    // Las tres tablas son la compartida, la que se apila a 375px.
    expect(await page.locator('.cp-tabla table').count()).toBe(3)
    // La del plan marca los dos contratos de la pieza, y «única» en los
    // procedimientos abiertos con una sola oferta —los que cuenta el texto—.
    await expect(page.locator('tr[data-foco]')).toHaveCount(2)
    const unicas = snap.cluster.filter(
      (r: { pstd?: boolean; proc: string; licitadores: number }) =>
        r.pstd && r.proc.startsWith('abierto') && r.licitadores === 1,
    ).length
    await expect(page.locator('.cp-tabla td').filter({ hasText: /· única$/ })).toHaveCount(unicas)

    // Las seis frases de la nota municipal, bajo UNA etiqueta que dice qué
    // documento habla, y la intervención del pleno con la suya.
    await expect(
      page.getByText(/Nota municipal · Ayuntamiento de Riba-roja · 7-7-2026/i),
    ).toBeVisible()
    for (const c of snap.claims) await expect(page.getByText(c, { exact: true })).toBeVisible()
    await expect(page.getByText(/Intervención en el pleno/i)).toBeVisible()

    // Ningún aparte en ámbar: ninguno le pide a quien lee que haga algo.
    await expect(page.locator('[data-aparte="aviso"]')).toHaveCount(0)
    await expect(page.locator('[data-aparte="foco"]')).toHaveCount(2)

    // La pieza de la reconstrucción, enlazada donde se nombra.
    await expect(
      page.locator('.cp-pieza a[href="/reportajes/reconstruccion-dana"]').first(),
    ).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })
})
