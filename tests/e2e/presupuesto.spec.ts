import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'
import { euros } from '../../src/lib/formatters'

test.describe('Presupuesto (/presupuesto)', () => {
  test('renders spend charts and budget context', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })

    // El título dice «prevé gastarse» desde el 5-09-2026: son créditos
    // presupuestados (41,58 M€), no obligaciones reconocidas (18,91 M€).
    await expect(page.getByText('En qué prevé gastarse el dinero público').first()).toBeVisible({
      timeout: 8000,
    })
    await expect(page.getByText('De dónde vienen los ingresos municipales').first()).toBeVisible()
    await expect(page.getByText(/€/).first()).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  // El aviso habla sólo de CONPREL —sus ingresos frente a sus gastos—, pero se
  // calculaba cotejando con `latest`, y con el 1T de 2026 como periodo más
  // nuevo dejó de pintarse sin que ninguna prueba lo notara. Se decide con el
  // propio budget.json: si el Ministerio da ingresos y gastos distintos, el
  // aviso tiene que estar, con la diferencia.
  test('el aviso de que CONPREL no cuadra sale cuando sus dos totales difieren', async ({
    page,
  }) => {
    const s = JSON.parse(readFileSync('public/data/budget.json', 'utf8')).snapshot
    const dif = Math.abs(s.totalRevenue - s.totalExpense)
    test.skip(dif < 1000, 'CONPREL cuadra este ejercicio: no hay aviso que buscar')
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    const aviso = page.locator('#descuadre')
    await expect(aviso).toBeVisible({ timeout: 10_000 })
    await expect(aviso).toContainText(euros(dif))
  })
})
