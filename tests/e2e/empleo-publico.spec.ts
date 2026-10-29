import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'

test.describe('Empleo público (/empleo-publico)', () => {
  test('renders the municipal hiring processes', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/empleo-publico', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Empleo público' })).toBeVisible({
      timeout: 8000,
    })
    // distinct from the ADL feed
    await expect(
      page.getByText(/procesos selectivos del propio Ayuntamiento/i).first(),
    ).toBeVisible()
    expect(appErrors(errors)).toEqual([])
  })

  // La plantilla municipal, traída de /cargos: la pregunta, la frase que dice
  // por qué sus dos cifras no se restan, y las cifras con sus fuentes.
  test('la plantilla municipal, con la frase que cuadra sus dos cifras', async ({ page }) => {
    const plantilla = JSON.parse(readFileSync('public/data/plantilla.json', 'utf8'))
    await page.goto('/empleo-publico', { waitUntil: 'domcontentloaded' })
    const seccion = page.locator('#plantilla')
    await expect(seccion.getByRole('heading', { level: 2 })).toHaveText(
      '¿Cuánta gente trabaja en el Ayuntamiento?',
      { timeout: 8000 },
    )
    const puente = seccion.locator('[data-puente-plantilla]')
    await expect(puente).toContainText(`trabajaban ${plantilla.total} personas`)
    await expect(puente).toContainText(`${plantilla.authorized.plazas} plazas`)
    await expect(puente).toContainText('No se pueden restar')
  })

  test('/cargos enlaza a ella y el enlace aterriza en la sección', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    const enlace = page.locator('[data-puntero-plantilla] a')
    await expect(enlace).toHaveAttribute('href', '/empleo-publico#plantilla', { timeout: 8000 })
    await enlace.click()
    await expect(page).toHaveURL(/\/empleo-publico#plantilla$/)
    await expect(page.locator('#plantilla')).toBeInViewport({ timeout: 8000 })
  })
})
