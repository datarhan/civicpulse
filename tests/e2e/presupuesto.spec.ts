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

  // La rendición de la Cuenta General: una fila por ejercicio con página en la
  // plataforma, y en cada una las tres fechas que se contrastan. Se cuenta
  // contra el propio snapshot para que un bloque que no pinta nada —el hook
  // devolviendo su vacío— no pase por «no había filas».
  test('la rendición de cuentas pinta una fila por ejercicio, con sus tres fechas', async ({
    page,
  }) => {
    const r = JSON.parse(readFileSync('public/data/rendicion-cuentas.json', 'utf8'))
    const conPagina = r.ejercicios.filter((e: { fechas: unknown }) => e.fechas)
    expect(conPagina.length).toBeGreaterThan(0)
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    const bloque = page.locator('#rendicion')
    await expect(bloque).toBeVisible({ timeout: 10_000 })
    await expect(bloque.locator('[data-rendicion]')).toHaveCount(conPagina.length)
    const ultimo = Math.max(...conPagina.map((e: { ejercicio: number }) => e.ejercicio))
    await expect(bloque.locator('[data-section-head]')).toContainText(String(ultimo))
    await expect(bloque.locator(`[data-rendicion="${ultimo}"] [role="cell"]`)).toHaveCount(3)
  })
})
