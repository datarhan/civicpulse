import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'

const leer = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))

test.describe('Datos (/datos)', () => {
  test('renders Wikidata + padrón chart + dataset catalog', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/datos', { waitUntil: 'domcontentloaded' })

    // i18n title (src/i18n.jsx:91).
    await expect(page.getByText('Datos abiertos').first()).toBeVisible({ timeout: 8000 })

    // Padrón section heading (src/pages/Datos.jsx:372).
    await expect(page.getByText('Población residente').first()).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Catálogo de datos' })).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  // La lectura vecinal de /datos (auditoría de las dos lecturas, §22): qué es
  // y dónde se lee mejor una cifra suelta; y el catálogo, que es a lo que se
  // viene, antes que la ficha del municipio y las cien asociaciones.
  test('la frase de arriba y el catálogo primero', async ({ page }) => {
    await page.goto('/datos', { waitUntil: 'domcontentloaded' })
    const frase = page.locator('[data-datos-frase]')
    await expect(frase).toContainText('conjuntos de datos que usa CivicPulse', { timeout: 8000 })
    await expect(frase.locator('a')).toHaveCount(5)

    const fichas = page.locator('[data-ficha-catalogo]')
    await expect(fichas.first()).toBeVisible()
    const identidad = page.getByText('Identidad del municipio', { exact: false }).first()
    await expect(identidad).toBeVisible()
    const yCatalogo = (await fichas.first().boundingBox())!.y
    const yIdentidad = (await identidad.boundingBox())!.y
    expect(yCatalogo).toBeLessThan(yIdentidad)
  })

  // La lista escrita a mano repetía cuatro ficheros que ya estaban arriba con
  // su recuento, uno de ellos con otro nombre: un fichero, una ficha.
  test('cada fichero sale una sola vez en el catálogo', async ({ page }) => {
    await page.goto('/datos', { waitUntil: 'domcontentloaded' })
    const fichas = page.locator('[data-ficha-catalogo]')
    await expect(fichas.first()).toBeVisible({ timeout: 8000 })
    const rutas = await fichas.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-ficha-catalogo')),
    )
    expect(rutas.length).toBeGreaterThan(30)
    expect(new Set(rutas).size).toBe(rutas.length)
    // Las ofertas de la ADL no son «empleo público».
    await expect(page.getByText('Empleo público · ADL')).toHaveCount(0)
  })

  test('el municipio con su nombre oficial, y la etiqueta de Wikidata dicha como tal', async ({
    page,
  }) => {
    const oficial = leer('padron.json').name
    const etiqueta = leer('wikidata.json').facts.label
    expect(oficial).toBe('Riba-roja de Túria')
    await page.goto('/datos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: oficial, exact: true })).toBeVisible({
      timeout: 8000,
    })
    await expect(page.getByRole('heading', { name: etiqueta, exact: true })).toHaveCount(0)
    await expect(page.getByText(`En Wikidata figura como «${etiqueta}»`)).toBeVisible()
  })

  test('un recuento de uno va en singular', async ({ page }) => {
    const n = leer('quejas.json').items.length
    await page.goto('/datos', { waitUntil: 'domcontentloaded' })
    const ficha = page.locator('[data-ficha-catalogo="/data/quejas.json"]')
    await expect(ficha).toContainText(`${n} ${n === 1 ? 'queja' : 'quejas'}`, { timeout: 8000 })
    await expect(page.locator('[data-ficha-catalogo]').getByText(/^1 \S+s$/)).toHaveCount(0)
  })

  // Del 13-jul al 4-oct-2026 la tarjeta del registro de asociaciones pintó
  // correos dentro del nombre de una entidad: el PDF de julio estrenó una columna
  // CIF que el parser no conocía. Las pruebas del parser miran el JSON; ésta mira
  // lo que se SIRVE, que es lo que lee cualquiera.
  test('no pinta ninguna dirección de correo', async ({ page }) => {
    await page.goto('/datos', { waitUntil: 'domcontentloaded' })

    // Que la comprobación mida algo: la tarjeta sólo se pinta con el registro
    // cargado, y el registro tiene del orden de cien entidades.
    const cabecera = page.getByText(/^Entidades y asociaciones \(\d+\)$/)
    await expect(cabecera).toBeVisible({ timeout: 8000 })
    const filas = Number((await cabecera.innerText()).match(/\((\d+)\)/)?.[1])
    expect(filas).toBeGreaterThan(80)

    // Los nombres van plegados por tipo, y `innerText` no lee lo plegado: sin
    // abrirlos, esta prueba dejaría de mirar justo lo que vigila.
    await page
      .locator('[data-asociaciones-tipo]')
      .evaluateAll((els) => els.forEach((d) => ((d as HTMLDetailsElement).open = true)))
    const nombres = await page.locator('[data-asociaciones-tipo] > div > div').count()
    expect(nombres).toBe(filas)

    const texto = await page.locator('body').innerText()
    expect(texto.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)).toBeNull()
  })
})
