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

  // La lectura vecinal: cómo se entra, con las palabras de los títulos
  // definidas, y los procesos bajo un título por tipo.
  test('«¿Cómo se entra…?» define las cuatro palabras, y la lista va por tipos', async ({
    page,
  }) => {
    const { procesos } = JSON.parse(readFileSync('public/data/procesos-selectivos.json', 'utf8'))
    await page.goto('/empleo-publico', { waitUntil: 'domcontentloaded' })
    const como = page.locator('#como-se-entra')
    await expect(como.getByRole('heading', { level: 2 })).toHaveText(
      '¿Cómo se entra a trabajar en el Ayuntamiento?',
      { timeout: 8000 },
    )
    await expect(como.locator('dt')).toHaveText([
      'Oposición',
      'Concurso',
      'Bolsa de trabajo',
      'Estabilización',
    ])
    for (const dd of await como.locator('dd').all()) {
      expect((await dd.innerText()).length).toBeGreaterThan(40)
    }
    // Ningún proceso se pierde al agruparlos: tantos enlaces como procesos, y
    // un título por cada tipo que trae la instantánea.
    const lista = page.locator('#procesos')
    await expect(lista.locator('a[href^="http"]')).toHaveCount(procesos.length)
    const tipos = new Set(procesos.map((p: { tipo: string }) => p.tipo))
    await expect(lista.getByRole('heading', { level: 3 })).toHaveCount(tipos.size)
  })

  // La lista del Ayuntamiento corta los títulos con «…»; el raspador los
  // completa desde la página de cada proceso. Los que se ven cortados son
  // exactamente los que el raspado no pudo completar, ni uno más.
  test('los títulos se ven enteros, salvo los que el raspado dejó cortados', async ({ page }) => {
    const { procesos, titulos } = JSON.parse(
      readFileSync('public/data/procesos-selectivos.json', 'utf8'),
    )
    expect(titulos.cortados).toBe(
      titulos.completados + titulos.reutilizados + titulos.sinCompletar.length,
    )
    await page.goto('/empleo-publico', { waitUntil: 'domcontentloaded' })
    const enlaces = page.locator('#procesos a[href^="http"]')
    await expect(enlaces).toHaveCount(procesos.length, { timeout: 8000 })
    const textos = await enlaces.allInnerTexts()
    expect(textos.filter((t) => /…\s*$/.test(t))).toHaveLength(titulos.sinCompletar.length)
  })

  test('el destino del glosario existe y aterriza en la sección', async ({ page }) => {
    await page.goto('/empleo-publico#como-se-entra', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#como-se-entra')).toBeInViewport({ timeout: 8000 })
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
