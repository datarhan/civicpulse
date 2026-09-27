import { test, expect } from '@playwright/test'
import { TRINQUETE } from '../../src/scraper/trinquete'

/**
 * El trinquete publicado y el trinquete aplicado son el mismo.
 *
 * La política del overlay vivía en una cadena de `if (source === …)` que un
 * lector no podía ver por ningún lado, y el contrato de esta casa es enseñar el
 * método. Al publicarla aparece el riesgo de siempre: que la página y el código
 * se separen. Por eso la tabla se PINTA desde `trinquete.ts` y esto lo
 * comprueba — si alguien cambia una y no la otra, esto se pone rojo.
 */
test.describe('El trinquete publicado (/metodologia)', () => {
  test('cada etapa declarada aparece, con su sentido y su estado', async ({ page }) => {
    await page.goto('/metodologia', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { name: /El trinquete: cada etapa empuja/i }),
    ).toBeVisible({ timeout: 8000 })

    const etapas = Object.entries(TRINQUETE)
    expect(etapas.length, 'la declaración está vacía: esto no mediría nada').toBeGreaterThan(0)

    const texto = await page.locator('body').innerText()
    for (const [id, e] of etapas) {
      expect(texto, `falta la etapa ${id}`).toContain(e.nombre)
      expect(texto, `falta el sentido de ${id}`).toContain(
        e.direccion === 'sube' ? 'sólo puede reforzar' : 'sólo puede retractar',
      )
    }
    // Y la retirada se ve como retirada, no escondida.
    const hayRetirada = etapas.some(([, e]) => e.retirada)
    expect(hayRetirada).toBe(true)
    expect(texto).toMatch(/retirada/i)
  })

  test('dice el suelo y su única excepción', async ({ page }) => {
    await page.goto('/metodologia', { waitUntil: 'domcontentloaded' })
    // Esperar la sección ANTES de fotografiar el texto: sin esto la lectura
    // llegaba antes que el render y la prueba salía inestable — que es peor que
    // roja, porque se aprende a ignorarla.
    await expect(
      page.getByRole('heading', { name: /El trinquete: cada etapa empuja/i }),
    ).toBeVisible({ timeout: 8000 })
    const texto = await page.locator('body').innerText()
    expect(texto).toMatch(/tiene que nombrar contra qué se comprobó/i)
    expect(texto).toMatch(/retractación de un curador|bajar un veredicto nunca refuerza/i)
  })
})
