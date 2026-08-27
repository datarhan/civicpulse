import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'

// Las cifras salen del manifiesto publicado, no escritas a mano: una spec que
// restituye el número que debería salir se queda verde mientras la página
// pinta otro.
const TOTALS = JSON.parse(readFileSync('public/data/pleno-claims/index.json', 'utf8')).totals as {
  items: number
  cobertura: {
    porTipo: Record<string, { total: number; sinCorpus: number; comprobadoSinHallar: number }>
    porTema: Record<string, { total: number; sinCorpus: number; comprobadoSinHallar: number }>
    corpus: Record<string, number>
  }
}

const SUMA = Object.values(TOTALS.cobertura.porTipo).reduce(
  (a, v) => ({
    total: a.total + v.total,
    sinCorpus: a.sinCorpus + v.sinCorpus,
    conCorpus: a.conCorpus + v.comprobadoSinHallar,
  }),
  { total: 0, sinCorpus: 0, conCorpus: 0 },
)

test.describe('Cobertura de comprobación (/laboratorio/cobertura)', () => {
  test('la tabla cruzada cuadra con el universo que dice medir', () => {
    // Antes de mirar la página: que los datos que va a pintar sean coherentes.
    // Y que haya algo que medir — un cruce vacío pintaría un 100 % perfecto.
    expect(SUMA.total).toBe(TOTALS.items)
    expect(SUMA.sinCorpus).toBeGreaterThan(0)
    expect(SUMA.conCorpus).toBeGreaterThan(0)
    expect(Object.keys(TOTALS.cobertura.corpus).length).toBeGreaterThan(0)
  })

  test('pinta el hueco con la misma prominencia que lo cubierto', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/laboratorio/cobertura', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: /Qué podemos comprobar/i })).toBeVisible({
      timeout: 8000,
    })
    // Regla 2 del laboratorio: la ausencia se publica como ausencia. Las dos
    // cifras tienen que estar, no sólo la que favorece.
    await expect(page.getByText(String(SUMA.conCorpus), { exact: true }).first()).toBeVisible()
    await expect(page.getByText(String(SUMA.sinCorpus), { exact: true }).first()).toBeVisible()
    expect(appErrors(errors)).toEqual([])
  })

  test('dice lo que NO es antes de enseñar una cifra', async ({ page }) => {
    await page.goto('/laboratorio/cobertura', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/No juzga a nadie/i)).toBeVisible({ timeout: 8000 })

    // El aviso POR ENCIMA del primer número grande: una advertencia al pie es
    // una advertencia que nadie lee.
    const html = await page.content()
    const posAviso = html.search(/No juzga a nadie/i)
    const posCifra = html.search(/DECLARACIONES PUBLICADAS/i)
    expect(posAviso).toBeGreaterThan(-1)
    expect(posCifra).toBeGreaterThan(-1)
    expect(posAviso).toBeLessThan(posCifra)
  })

  test('declara su universo: lo publicado, no el corpus interno', async ({ page }) => {
    await page.goto('/laboratorio/cobertura', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/no se sirven|puerta editorial/i).first()).toBeVisible({
      timeout: 8000,
    })
    await expect(page.getByText(/no entra en la cadencia|no es un fact-check/i)).toBeVisible()
    await expect(page.getByText(/no genera hallazgos/i)).toBeVisible()
  })

  /**
   * Regla 1: esta página no nombra a nadie y no lleva ni una cita literal.
   *
   * Se comprueba contra el TEXTO SERVIDO, igual que `check:dea` comprueba el
   * JSON servido y no la estructura en memoria: es fácil romper la regla sin
   * querer —basta añadir un ejemplo «para que se entienda»— y el efecto sería
   * publicar el literal de una acusación que la puerta editorial retiene.
   */
  test('no nombra a nadie ni reproduce una sola cita', async ({ page }) => {
    await page.goto('/laboratorio/cobertura', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Qué podemos comprobar/i })).toBeVisible({
      timeout: 8000,
    })
    const texto = await page.locator('main, body').first().innerText()

    // Ni comillas angulares de cita: el verbatim de este sitio va siempre en «».
    expect(texto).not.toMatch(/«[^»]{25,}»/)

    // Ni el nombre de ningún cargo publicado.
    const officials = JSON.parse(readFileSync('public/data/officials.json', 'utf8'))
    const nombres = (officials.items ?? officials.officials ?? [])
      .map((o: { name?: string; nombre?: string }) => o.name ?? o.nombre)
      .filter((n: unknown): n is string => typeof n === 'string' && n.length > 6)
    expect(nombres.length).toBeGreaterThan(0) // que la comprobación evalúe algo
    for (const n of nombres) expect(texto).not.toContain(n)

    // Ni un solo literal de los que sirven los trozos.
    const dir = 'public/data/pleno-claims'
    const verbatims = readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .slice(0, 3)
      .flatMap(
        (f) =>
          (
            JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as {
              items: Array<{ claim: { verbatim?: string } }>
            }
          ).items,
      )
      .map((i) => i.claim?.verbatim)
      .filter((v): v is string => typeof v === 'string' && v.length > 40)
      .slice(0, 40)
    expect(verbatims.length).toBeGreaterThan(0) // idem
    for (const v of verbatims) expect(texto).not.toContain(v.slice(0, 40))
  })
})
