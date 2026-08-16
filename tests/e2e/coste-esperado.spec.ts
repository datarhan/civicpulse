import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'

// Se lee el snapshot en vez de reescribir sus cifras: estos números se mueven
// con cada entrega del ministerio, y una spec que los restituye se queda verde
// mientras la página diverge.
const SNAP = JSON.parse(readFileSync('public/data/coste-esperado.json', 'utf8'))
const PUBLICADAS = [
  ...SNAP.especificaciones.filter((e: { estado: string }) => e.estado === 'publicada'),
].sort(
  (a: { propia: { razon: number } }, b: { propia: { razon: number } }) =>
    b.propia.razon - a.propia.razon,
)
const FALLIDAS = SNAP.especificaciones.filter((e: { estado: string }) => e.estado !== 'publicada')
const FUENTE = JSON.parse(readFileSync('public/data/coste-efectivo.json', 'utf8'))

test.describe('Coste esperado (/laboratorio/coste-esperado)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/laboratorio/coste-esperado', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /El coste esperado/i })).toBeVisible({
      timeout: 8000,
    })
  })

  test('avisa de lo que NO es antes de enseñar ninguna cifra', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/laboratorio/coste-esperado', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(/no es una nota/i)).toBeVisible({ timeout: 8000 })

    // El aviso por ENCIMA del primer veredicto en el DOM: una advertencia al
    // pie es una advertencia que nadie lee.
    const html = await page.content()
    const posAviso = html.search(/no es una nota/i)
    const posVeredicto = html.search(/de lo esperado/i)
    expect(posAviso).toBeGreaterThan(-1)
    expect(posVeredicto).toBeGreaterThan(-1)
    expect(posAviso).toBeLessThan(posVeredicto)

    // Y el R² a la vista se DERIVA del snapshot, no se escribe: el rango que
    // enseña la página tiene que ser el del dato.
    const r2s = PUBLICADAS.map((e: { modelo: { r2: number } }) => Math.round(e.modelo.r2 * 100))
    await expect(
      page.getByText(`entre el ${Math.min(...r2s)} % y el ${Math.max(...r2s)} %`),
    ).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('cada servicio publicado llega con su embudo, su R² y su cobertura', async ({ page }) => {
    expect(PUBLICADAS.length, 'sin especificaciones publicadas en el snapshot').toBeGreaterThan(0)
    for (const e of PUBLICADAS) {
      await expect(page.getByRole('heading', { name: e.label, exact: true })).toBeVisible()
    }
    // Un embudo por especificación publicada, y cada uno declara en su propio
    // aria-label qué es la nube y quién es el único punto con nombre.
    const embudos = page.locator('svg[role="img"]')
    await expect(embudos).toHaveCount(PUBLICADAS.length)
    const etiquetas = await embudos.evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label') ?? ''),
    )
    for (const l of etiquetas) {
      expect(l).toMatch(/sin nombre/)
      expect(l).toMatch(/Riba-roja/)
    }
    await expect(page.getByText(/municipios en gestión directa/).first()).toBeVisible()
  })

  test('el orden publicado es de más a menos veces lo esperado', async ({ page }) => {
    const encabezados = page.locator('h3')
    const textos = await encabezados.allTextContents()
    expect(textos).toEqual(PUBLICADAS.map((e: { label: string }) => e.label))
  })

  test('las especificaciones que fallan se publican como fallidas', async ({ page }) => {
    expect(
      FALLIDAS.length,
      'el snapshot no trae ninguna fallida — revisar, no relajar',
    ).toBeGreaterThan(0)
    await expect(page.getByRole('heading', { name: /publicadas como fallidas/i })).toBeVisible()
    for (const e of FALLIDAS) {
      await expect(page.getByText(e.label, { exact: true })).toBeVisible()
      await expect(page.getByText(e.estado, { exact: true }).first()).toBeVisible()
    }
  })

  test('no nombra a ningún municipio salvo Riba-roja', async ({ page }) => {
    // Sobre el HTML servido, no sobre el JSON: un componente puede pintar un
    // nombre que el snapshot guarda para otra cosa. La lista larga (censo de
    // 542) la recorre check:coste-esperado; aquí va la de pares, que ya cazó
    // este defecto una vez en la frontera.
    const html = await page.content()
    const vistos = new Set<string>()
    let comprobados = 0
    for (const f of FUENTE.pares.filas as { ine: string; nombre: string }[]) {
      if (f.ine === '46214' || vistos.has(f.ine)) continue
      vistos.add(f.ine)
      expect(html, `«${f.nombre}» no puede aparecer en /laboratorio/coste-esperado`).not.toContain(
        f.nombre,
      )
      comprobados++
    }
    expect(comprobados).toBeGreaterThan(40)
  })

  test('publica el método entero, que es lo que sostiene la negativa a nombrar', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: /El método entero/i })).toBeVisible()
    await expect(page.getByText(/mínimos cuadrados/i)).toBeVisible()
    await expect(page.getByText(/t de Student/i)).toBeVisible()
    await expect(
      page.getByText(new RegExp(`${SNAP.modelo.minMuestra} municipios por servicio`)),
    ).toBeVisible()
    // La escalera de impulsores declarada: v1 = sólo población, y se dice.
    await expect(page.getByText(/sólo log\(población\)/i)).toBeVisible()
  })

  test('se alcanza desde el laboratorio', async ({ page }) => {
    await page.goto('/laboratorio', { waitUntil: 'domcontentloaded' })
    const enlace = page.getByRole('link', { name: /el coste esperado/i })
    await expect(enlace).toBeVisible({ timeout: 8000 })
    await enlace.click()
    await expect(page.getByRole('heading', { name: /El coste esperado/i })).toBeVisible()
  })

  test('axe evalúa la página y no encuentra nada bloqueante', async ({ page }) => {
    await page.waitForTimeout(900)
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const evaluated = r.passes.flatMap((p) => p.nodes).length
    expect(
      evaluated,
      `axe revisó ${evaluated} nodos — un verde no prueba nada si las reglas no corrieron`,
    ).toBeGreaterThan(20)

    const blocking = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(
      blocking.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`),
      'violaciones bloqueantes de accesibilidad en /laboratorio/coste-esperado',
    ).toEqual([])
  })
})
