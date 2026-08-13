import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'

// Se lee el snapshot en vez de reescribir sus cifras: una spec que restituye la
// forma que debe comprobar es el modo de fallo 1 de docs/DATA_INTEGRITY.md, y
// estos números se mueven con cada entrega del ministerio.
const SNAP = JSON.parse(readFileSync('public/data/dea.json', 'utf8'))
const PUBLICADAS = SNAP.especificaciones.filter((e: { estado: string }) => e.estado === 'publicada')
const INSUFICIENTES = SNAP.especificaciones.filter(
  (e: { estado: string }) => e.estado !== 'publicada',
)
const FUENTE = JSON.parse(readFileSync('public/data/coste-efectivo.json', 'utf8'))

test.describe('Frontera (/laboratorio/frontera)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/laboratorio/frontera', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /La frontera del gasto/i })).toBeVisible({
      timeout: 8000,
    })
  })

  test('avisa de lo que NO es antes de enseñar ninguna cifra', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/laboratorio/frontera', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(/no es una nota ni un ranking/i)).toBeVisible({ timeout: 8000 })

    // El aviso tiene que estar POR ENCIMA de la primera puntuación en el DOM:
    // una advertencia al pie es una advertencia que nadie lee.
    const html = await page.content()
    const posAviso = html.search(/no es una nota ni un ranking/i)
    const posPuntuacion = html.search(/Distancia a la frontera/i)
    expect(posAviso).toBeGreaterThan(-1)
    expect(posPuntuacion).toBeGreaterThan(-1)
    expect(posAviso).toBeLessThan(posPuntuacion)

    expect(appErrors(errors)).toEqual([])
  })

  test('pone la calidad de la declaración antes que las puntuaciones', async ({ page }) => {
    // Es la medición que cambia lo que significa todo lo de abajo.
    expect(SNAP.declaracion.unidadCongeladas).toBeGreaterThan(0)
    await expect(
      page.getByRole('heading', { name: /Casi nadie vuelve a medir el denominador/i }),
    ).toBeVisible()

    const html = await page.content()
    expect(html.search(/Casi nadie vuelve a medir/i)).toBeLessThan(
      html.search(/Distancia a la frontera/i),
    )

    // Y la comparación entre las dos magnitudes, que es la evidencia: si sólo
    // se publicara el recuento de denominadores congelados sería una sospecha.
    await expect(page.getByText(/series de coste, sólo/i)).toBeVisible()
  })

  test('publica también las especificaciones que no dan puntuación', async ({ page }) => {
    // Una página que enseñe sólo la cesta que funciona está enseñando el
    // resultado en vez del método.
    expect(INSUFICIENTES.length).toBeGreaterThan(0)
    for (const e of INSUFICIENTES) {
      await expect(page.getByRole('heading', { name: e.titulo })).toBeVisible()
    }
    await expect(page.getByText(/sin puntuación/i).first()).toBeVisible()
    await expect(page.getByText(/Grados de libertad/i).first()).toBeVisible()
  })

  test('no nombra a ningún municipio salvo Riba-roja', async ({ page }) => {
    // La regla editorial de esta superficie, comprobada sobre el HTML servido y
    // no sobre el JSON: un componente puede pintar un nombre que el snapshot
    // guarda para otra cosa.
    const html = await page.content()
    const vistos = new Set<string>()
    let comprobados = 0
    for (const f of FUENTE.pares.filas as { ine: string; nombre: string }[]) {
      if (f.ine === '46214' || vistos.has(f.ine)) continue
      vistos.add(f.ine)
      expect(html, `«${f.nombre}» no puede aparecer en /laboratorio/frontera`).not.toContain(
        f.nombre,
      )
      comprobados++
    }
    // Que el bucle haya comprobado algo, y no cincuenta veces nada.
    expect(comprobados).toBeGreaterThan(40)
  })

  test('cada puntuación llega con su cobertura y su intervalo', async ({ page }) => {
    expect(PUBLICADAS.length).toBeGreaterThan(0)
    for (const e of PUBLICADAS) {
      await expect(page.getByRole('heading', { name: e.titulo })).toBeVisible()
    }
    await expect(page.getByText(/municipios de la banda/i).first()).toBeVisible()
    await expect(page.getByText(/Intervalo al/i).first()).toBeVisible()
    await expect(page.getByText(/réplicas/i).first()).toBeVisible()
  })

  test('la serie temporal enseña el tamaño de muestra de cada punto', async ({ page }) => {
    // Sin el n al lado, la pendiente se lee como «el municipio empeoró» cuando
    // parte del movimiento es quién declaró ese año.
    const principal = PUBLICADAS[0]
    expect(principal.serie.length).toBeGreaterThan(3)
    await expect(
      page.getByRole('heading', { name: /Qué pasa al mirarlo en el tiempo/i }),
    ).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^n$/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /Muestra variable/i })).toBeVisible()
    // Y un año sin puntuación se dice, no se interpola.
    const huecos = principal.serie.filter((p: { theta: number | null }) => p.theta === null)
    if (huecos.length > 0) {
      await expect(page.getByText(/sin puntuación/i).first()).toBeVisible()
    }
  })

  test('publica el método entero, que es lo que sostiene la negativa a nombrar', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: /El método, entero/i })).toBeVisible()
    await expect(page.getByText(/Cooper/i)).toBeVisible()
    await expect(page.getByText(/Simar y Wilson/i)).toBeVisible()
    await expect(page.getByText(/116 ter/i)).toBeVisible()
  })

  test('se alcanza desde el laboratorio', async ({ page }) => {
    await page.goto('/laboratorio', { waitUntil: 'domcontentloaded' })
    const enlace = page.getByRole('link', { name: /la frontera del gasto/i })
    await expect(enlace).toBeVisible({ timeout: 8000 })
    await enlace.click()
    await expect(page.getByRole('heading', { name: /La frontera del gasto/i })).toBeVisible()
  })

  test('axe evalúa la página y no encuentra nada bloqueante', async ({ page }) => {
    await page.waitForTimeout(900)
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    // Que la pasada haya EVALUADO algo. Dos suites de este repo estuvieron
    // verdes midiendo el vacío; «cero violaciones» de una regla que no llegó a
    // ejecutarse es indistinguible de una página limpia.
    const evaluated = r.passes.flatMap((p) => p.nodes).length
    expect(
      evaluated,
      `axe revisó ${evaluated} nodos en /laboratorio/frontera — un verde no prueba nada si las reglas no corrieron`,
    ).toBeGreaterThan(20)

    const blocking = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(
      blocking.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`),
      'violaciones bloqueantes de accesibilidad en /laboratorio/frontera',
    ).toEqual([])
  })
})
