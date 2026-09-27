import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { TRINQUETE } from '../../src/scraper/trinquete'
import { fmtTheta, sensibilidadCestas } from '../../src/scraper/dea-sensibilidad'

const DEA = JSON.parse(readFileSync('public/data/dea.json', 'utf8'))

/**
 * La tarjeta #frontera decía que cuatro cestas «igual de defendibles» llevaban
 * la distancia a la frontera a recorrer «media escala»; ningún dea.json dio
 * más que 0,43 frente a 0,53. La medición sale ahora del snapshot, y aquí se
 * comprueba que la página pinta la del fichero publicado.
 */
test('la medición de las cestas en #frontera es la del snapshot', async ({ page }) => {
  const s = sensibilidadCestas(DEA.especificaciones)
  expect(s.probadas, 'el snapshot no trae cestas: esto no mediría nada').toBeGreaterThan(0)
  await page.goto('/metodologia#frontera', { waitUntil: 'domcontentloaded' })
  const tarjeta = page.locator('#frontera')
  await expect(tarjeta).toContainText(`probamos`, { timeout: 8000 })
  await expect(tarjeta).not.toContainText('media escala')
  if (s.theta?.cambia) {
    await expect(tarjeta).toContainText(
      `va de ${fmtTheta(s.theta.min)} a ${fmtTheta(s.theta.max)} según la cesta`,
    )
  }
})

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
