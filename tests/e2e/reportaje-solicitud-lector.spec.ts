import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { REPORTAJE_SLUGS } from '../../src/reportajes'

/**
 * «Copiar texto de la solicitud» (components/reportajes/SolicitudLector.jsx),
 * mirado donde se pinta.
 *
 * La prueba unitaria fija el texto y la regla; ésta mira lo que sólo se ve en la
 * página: que el botón está en las dos piezas que lo piden, que NO está en
 * ninguna que trae su bloque de solicitudes registradas —se deriva de sus datos,
 * no de una lista a mano—, y que lo copiado es, carácter a carácter, el texto
 * que se enseña debajo.
 */
const leer = (slug: string) =>
  JSON.parse(readFileSync(`public/data/reportajes/${slug}.json`, 'utf8'))

const CON_ESCRITO = ['inteligencia-turistica', 'basuras']

test.describe('Reportajes · la solicitud que puede presentar quien lee', () => {
  for (const slug of CON_ESCRITO) {
    test(`${slug}: copia el escrito que enseña`, async ({ page, context, browserName }) => {
      test.skip(browserName !== 'chromium', 'los permisos del portapapeles son de Chromium')
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await page.goto(`/reportajes/${slug}`, { waitUntil: 'domcontentloaded' })

      const bloque = page.locator('[data-solicitud-lector]')
      await expect(bloque).toBeVisible({ timeout: 8000 })
      const boton = bloque.getByRole('button', { name: 'Copiar texto de la solicitud' })
      await boton.click()
      await expect(bloque.getByRole('button', { name: 'Copiado' })).toBeVisible()

      const copiado = await page.evaluate(() => navigator.clipboard.readText())
      const enseñado = await bloque.locator('[data-solicitud-texto]').textContent()
      expect(copiado.length).toBeGreaterThan(500)
      expect(copiado).toBe(enseñado)
      expect(copiado).toContain('Área de Transparencia')
      expect(copiado).toContain(`https://www.civicpulse.es/reportajes/${slug}`)
      // La fecha de la pieza, que es a la que se refiere lo que las preguntas dan por sentado.
      expect(copiado).toMatch(/publicado el \d{1,2} de [a-z]+ de \d{4}/)
    })
  }

  const yaPedidas = REPORTAJE_SLUGS.filter((s) => leer(s).solicitudes != null)

  test('mira algo: hay piezas con sus solicitudes ya registradas', () => {
    expect(yaPedidas.length).toBeGreaterThan(0)
  })

  for (const slug of yaPedidas) {
    test(`${slug}: ya las registró, y no ofrece el escrito`, async ({ page }) => {
      await page.goto(`/reportajes/${slug}`, { waitUntil: 'domcontentloaded' })
      // Que la pieza ha pintado antes de contar lo que falta: un cero sobre una
      // página en blanco no prueba nada.
      await expect(page.locator('[data-seccion]').first()).toBeVisible({ timeout: 8000 })
      await expect(page.locator('[data-solicitud-lector]')).toHaveCount(0)
    })
  }
})
