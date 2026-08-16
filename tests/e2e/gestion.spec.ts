import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import type { IndicadorMunicipal } from '../../src/scraper/indicadores-friccion'
import { collectErrors, appErrors } from './_console'

type MunicipalLike = Pick<IndicadorMunicipal, 'id' | 'panel' | 'valor' | 'etiqueta' | 'periodo'>

const SNAP = JSON.parse(readFileSync('public/data/indicadores.json', 'utf8'))
const FICHAS = JSON.parse(readFileSync('public/data/eficiencia-findings.json', 'utf8'))
const AQUI = (SNAP.municipales ?? []).filter(
  (m: MunicipalLike) => m.valor !== null && m.panel === 'gestion',
)

// Misma bandera que /eficiencia —son la misma función partida en dos— y por
// tanto el mismo salto explícito cuando la build no la lleva.
test.describe('Gestión (/gestion)', () => {
  test.beforeEach(async ({ page }) => {
    const errores = collectErrors(page)
    await page.goto('/gestion', { waitUntil: 'domcontentloaded' })
    const montada = await page
      .getByRole('heading', { name: /Cómo funciona la casa por dentro/i })
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    // Mismo endurecimiento que /eficiencia: una página reventada tampoco monta
    // su h1, y saltar ahí convierte un crash en specs verdes.
    if (!montada && appErrors(errores).length > 0) {
      throw new Error(
        `/gestion no montó Y la consola trae errores — la página está rota, no apagada:\n` +
          appErrors(errores).join('\n'),
      )
    }
    test.skip(!montada, '/gestion no está montada — reconstruye con VITE_ENABLE_EFICIENCIA=true')
  })

  test('publica cada indicador de gestión con su periodo', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/gestion', { waitUntil: 'domcontentloaded' })

    expect(AQUI.length, 'ningún indicador de gestión en el snapshot').toBeGreaterThan(0)
    for (const m of AQUI) {
      await expect(page.getByRole('heading', { name: m.etiqueta })).toBeVisible({ timeout: 8000 })
      // Los contratos abarcan de 2017 a 2026 y la ejecución es de un ejercicio:
      // un porcentaje sin periodo convierte una cifra correcta en falsa.
      await expect(page.getByText(m.periodo, { exact: true }).first()).toBeVisible()
    }
    expect(appErrors(errors)).toEqual([])
  })

  test('no se trae los costes unitarios de la página hermana', async ({ page }) => {
    const servicios = SNAP.indicadores.filter((i: { valor: number | null }) => i.valor !== null)
    expect(servicios.length).toBeGreaterThan(0)
    for (const i of servicios) {
      await expect(
        page.getByRole('heading', { name: i.etiqueta }),
        `${i.id} es un coste unitario y se está publicando en /gestion`,
      ).toHaveCount(0)
    }
    // Y el camino de vuelta existe: dos páginas hermanas sin enlace entre
    // ellas son dos páginas que la mitad de los lectores no sabe que existen.
    await expect(page.locator('a[href="/eficiencia"]').first()).toBeVisible()
  })

  test('cada ficha firmada va con la cifra que congela', async ({ page }) => {
    const ids = AQUI.map((m: MunicipalLike) => m.id)
    const mias = FICHAS.items.filter((f: { indicadorId: string }) => ids.includes(f.indicadorId))
    const ajenas = FICHAS.items.length - mias.length

    await expect(page.getByRole('heading', { name: /Hallazgos firmados/i })).toBeVisible({
      timeout: 8000,
    })
    for (const f of mias) {
      await expect(page.getByRole('heading', { name: f.titulo })).toBeVisible()
    }
    for (const f of FICHAS.items.filter(
      (x: { indicadorId: string }) => !ids.includes(x.indicadorId),
    )) {
      await expect(
        page.getByRole('heading', { name: f.titulo }),
        `${f.id} habla de un indicador que no vive aquí`,
      ).toHaveCount(0)
    }

    // Y si hay fichas en la otra página, esta lo dice: «todavía no hay ninguna»
    // mientras la hermana tiene dos es la mentira por omisión que toda esta
    // sección existe para no cometer.
    if (ajenas > 0) {
      await expect(
        page.getByText(
          ajenas === 1 ? /otra ficha firmada/ : new RegExp(`otras ${ajenas} fichas firmadas`),
        ),
      ).toBeVisible()
      await expect(page.locator('a[href="/eficiencia"]').last()).toBeVisible()
    }
  })

  test('axe evalúa la página y no encuentra nada bloqueante', async ({ page }) => {
    await page.goto('/gestion', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(900)
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const evaluated = r.passes.flatMap((p) => p.nodes).length
    expect(
      evaluated,
      `axe revisó ${evaluated} nodos en /gestion — un verde no prueba nada si las reglas no corrieron`,
    ).toBeGreaterThan(20)

    const blocking = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(
      blocking.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`),
      'violaciones bloqueantes en /gestion',
    ).toEqual([])
  })
})
