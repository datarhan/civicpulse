import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { FIRST_PLENO_ID } from './_rutas'

/**
 * El pliegue de las dos lecturas: «Ver: lo esencial · todo» (decisión D1-B de
 * la auditoría de las dos lecturas; salvaguarda 4 del diseño de la lectura
 * vecinal). Lo que la prueba de componente no puede ver porque depende de la
 * hoja de estilos: qué queda a la vista en cada estado.
 *
 * Corre sobre cada página que ya tiene las dos lecturas. Cada prueba afirma
 * antes que la página TIENE secciones que plegar: en una página sin ninguna,
 * «nada plegado» y «el texto no cambia» pasarían sin haber medido nada.
 */

const RUTAS = ['/cambios', '/cargos', '/plenos', `/plenos/${FIRST_PLENO_ID}`, '/quejas']

const ESENCIAL = JSON.stringify({ lecturas: 'esencial' })

async function conEsencial(page: Page) {
  await page.addInitScript((valor) => {
    // Sólo la primera carga: una prueba que recarga mide lo que guardó el control.
    if (!sessionStorage.getItem('cp:prueba-pliegue')) {
      localStorage.setItem('cp:tweaks', valor)
      sessionStorage.setItem('cp:prueba-pliegue', '1')
    }
  }, ESENCIAL)
}

/**
 * La capa vecinal de /cambios es una frase que no enlaza hacia abajo: ahí no
 * hay anclas que probar. Se dice aquí, y la prueba de anclas exige CERO en esa
 * ruta: si un día enlaza, la prueba lo dice en vez de seguir sin medir nada.
 */
const SIN_ANCLAS = new Set(['/cambios'])

/** Espera a que la página tenga sus secciones y a que dejen de llegar datos. */
async function lista(page: Page, ruta: string) {
  await page.goto(ruta, { waitUntil: 'domcontentloaded' })
  // /cambios cuenta hacia atrás desde hoy: con la ventana de 7 días, una
  // semana tranquila no tendría ninguna sección que plegar. La de 30 sí.
  if (ruta === '/cambios') {
    await page.locator('button[aria-pressed]').filter({ hasText: '30' }).click()
  }
  await expect(page.locator('[data-seccion-experta]').first()).toBeAttached({ timeout: 10_000 })
  await expect(page.locator('[data-ver-lecturas]')).toBeVisible()
  await page.waitForTimeout(1200)
}

/** Las secciones con algo dentro: una vacía no enseña ni su pestaña. */
async function conCuerpo(page: Page) {
  return page.locator('[data-seccion-experta]:has(> .cp-experta-cuerpo:not(:empty))')
}

for (const ruta of RUTAS) {
  test.describe(`El pliegue en ${ruta}`, () => {
    test('sin elección guardada, no hay nada plegado', async ({ page }) => {
      await lista(page, ruta)
      expect(await page.locator('[data-seccion-experta]').count()).toBeGreaterThan(0)
      await expect(page.locator('[data-seccion-experta][data-plegada]')).toHaveCount(0)
      await expect(page.locator('[data-ver-lecturas]')).toHaveAttribute('aria-expanded', 'true')
      const secciones = await conCuerpo(page)
      for (let i = 0; i < (await secciones.count()); i++) {
        await expect(secciones.nth(i).locator('> .cp-experta-cuerpo')).toBeVisible()
        await expect(secciones.nth(i).locator('> .cp-experta-plegada')).toBeHidden()
      }
    })

    test('con «lo esencial», la capa vecinal entera y cada sección reducida a su título', async ({
      page,
    }) => {
      await conEsencial(page)
      await lista(page, ruta)
      await expect(page.locator('[data-ver-lecturas]')).toHaveAttribute('aria-expanded', 'false')
      const secciones = await conCuerpo(page)
      const n = await secciones.count()
      expect(n).toBeGreaterThan(0)
      for (let i = 0; i < n; i++) {
        const s = secciones.nth(i)
        await expect(s.locator('> .cp-experta-cuerpo')).toBeHidden()
        const pestana = s.locator('> .cp-experta-plegada')
        await expect(pestana).toBeVisible()
        // Una cifra en el título quedaría a la vista sin su salvedad.
        expect(await pestana.innerText()).not.toMatch(/\d/)
      }
      // La lectura vecinal, con sus salvedades, no se pliega nunca.
      const vecinal = page.locator('[data-en-breve-bloque], [data-en-breve], .cp-en-breve-salvedad')
      for (let i = 0; i < (await vecinal.count()); i++) {
        await expect(vecinal.nth(i)).toBeVisible()
      }
      await expect(page.locator('[data-divisor-lecturas]')).toBeVisible()
    })

    test('plegar cambia lo que se ve, no lo que hay', async ({ page }) => {
      await lista(page, ruta)
      const texto = () => page.locator('main').evaluate((m) => m.textContent)
      const antes = await texto()
      await page.locator('[data-ver-lecturas]').click()
      await expect(page.locator('[data-seccion-experta][data-plegada]').first()).toBeAttached()
      expect(await texto()).toBe(antes)
    })

    test('cada enlace de la capa vecinal abre la sección a la que apunta', async ({ page }) => {
      await conEsencial(page)
      await lista(page, ruta)
      const hrefs = await page
        .locator('[data-en-breve-bloque] a[href^="#"], a.cp-en-breve-saltar[href^="#"]')
        .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))])
      if (SIN_ANCLAS.has(ruta)) expect(hrefs).toEqual([])
      else expect(hrefs.length).toBeGreaterThan(0)
      for (const href of hrefs) {
        await lista(page, ruta)
        await page.locator(`a[href="${href}"]`).first().click()
        const id = decodeURIComponent(href!.slice(1))
        const destino = page.locator(`[id="${id}"]`)
        await expect(destino).toBeVisible()
        await expect(destino).toBeInViewport()
        // Nunca dentro de una sección cerrada.
        expect(
          await destino.evaluate((el) => !!el.closest('[data-seccion-experta][data-plegada]')),
        ).toBe(false)
      }
    })

    test('la impresión despliega todo', async ({ page }) => {
      await conEsencial(page)
      await lista(page, ruta)
      await page.emulateMedia({ media: 'print' })
      const secciones = await conCuerpo(page)
      for (let i = 0; i < (await secciones.count()); i++) {
        await expect(secciones.nth(i).locator('> .cp-experta-cuerpo')).toBeVisible()
        await expect(secciones.nth(i).locator('> .cp-experta-plegada')).toBeHidden()
      }
      await expect(page.locator('[data-ver-lecturas]')).toBeHidden()
    })

    for (const ancho of [1280, 375]) {
      test(`axe con «lo esencial» a ${ancho} px`, async ({ page }) => {
        await page.setViewportSize({ width: ancho, height: 900 })
        await conEsencial(page)
        await lista(page, ruta)
        const r = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
        const graves = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
        expect(graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([])
      })
    }
  })
}

test.describe('El pliegue, de una página a otra', () => {
  test('un enlace compartido con #fragmento abre su sección aunque se lea «lo esencial»', async ({
    page,
  }) => {
    await conEsencial(page)
    for (const [ruta, id] of [
      ['/cargos', 'quien-fiscaliza'],
      ['/plenos', 'sesiones'],
      ['/quejas', 'sindic'],
    ]) {
      await page.goto(`${ruta}#${id}`, { waitUntil: 'domcontentloaded' })
      const destino = page.locator(`[id="${id}"]`)
      await expect(destino).toBeVisible({ timeout: 10_000 })
      await expect(destino).toBeInViewport()
      expect(
        await destino.evaluate((el) => !!el.closest('[data-seccion-experta][data-plegada]')),
      ).toBe(false)
      // Las demás siguen plegadas: el enlace abre lo suyo, no la página.
      await expect(page.locator('[data-seccion-experta][data-plegada]').first()).toBeAttached()
    }
  })

  test('la elección se guarda al navegar y al recargar', async ({ page }) => {
    await lista(page, '/plenos')
    await page.locator('[data-ver-lecturas]').click()
    await expect(page.locator('[data-ver-lecturas]')).toHaveAttribute('aria-expanded', 'false')
    await page.locator('.cp-shell-sidebar a[href="/cargos"]').first().click()
    await expect(page).toHaveURL(/\/cargos$/)
    await expect(page.locator('[data-ver-lecturas]')).toHaveAttribute('aria-expanded', 'false', {
      timeout: 10_000,
    })
    await expect(page.locator('[data-seccion-experta][data-plegada]').first()).toBeAttached()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-ver-lecturas]')).toHaveAttribute('aria-expanded', 'false', {
      timeout: 10_000,
    })
  })

  test('la pestaña de una sección la abre y lleva el foco a lo que abrió', async ({ page }) => {
    await conEsencial(page)
    await lista(page, '/cargos')
    const seccion = page.locator('#quien-fiscaliza')
    await seccion.locator('> .cp-experta-plegada button').click()
    await expect(seccion.locator('> .cp-experta-cuerpo')).toBeVisible()
    await expect(seccion.locator('> .cp-experta-cuerpo')).toBeFocused()
    await expect(page.locator('#quien-dirige > .cp-experta-cuerpo')).toBeHidden()
  })
})
