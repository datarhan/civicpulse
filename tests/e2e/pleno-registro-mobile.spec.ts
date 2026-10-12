import { test, expect, type Page } from '@playwright/test'
import { FIRST_PLENO_ID } from './_rutas'

/**
 * El registro de declaraciones de /plenos/:id (ClaimLedger, pestaña
 * Declaraciones): la cabecera de cada fila envuelve sin partir sus piezas.
 *
 * Era un flex de una línea —tipo, grupo, «firmado», fecha, cifras— sin
 * `flex-wrap`, y en un teléfono cada pieza encogía hasta su contenido mínimo:
 * medido el 04-10-2026 a 375 px sobre la build de producción, la fecha salía
 * en dos líneas («2025- / 12-01») en 275 de 430 filas de /plenos/qz6weg y en
 * 155 de 258 de /plenos/10yl550, y «Obra citada» también se partía. Nada se
 * salía de la página, así que `mobile.spec.ts`, que mide el ancho del
 * DOCUMENTO, no podía verlo. Aquí se cuentan las líneas que pinta cada pieza
 * —los rectángulos de un `Range` sobre su contenido—, que es lo que ve quien
 * lee.
 *
 * La regla vive en src/index.css (`.cp-ledger-head`), y su comentario dice por
 * qué una pieza de varias palabras sí puede partirse por un espacio: cuando es
 * más ancha que la columna entera —«Afirmación numérica» a 320 px; a 375, una
 * unidad como «90 % pago de facturas sobre el presupuesto ejecutado»—. Así que
 * lo que se prohíbe es partir una pieza que cabría entera en una línea propia,
 * que es exactamente el defecto. La fecha no se parte nunca.
 *
 * Y cuenta lo que midió: filas pintadas, una fecha en cada una, y —quitada la
 * clase— que la misma medida SÍ ve fechas partidas. Una clase renombrada o una
 * pestaña que dejara de pintar daría verde sin mirar nada.
 */

type Medida = {
  filas: number
  fechas: number
  fechasPartidas: string[]
  partidasSinNecesidad: string[]
  fuera: string[]
  firmaSola: number
}

async function medir(page: Page, sinClase = false): Promise<Medida> {
  return page.evaluate((sinClase) => {
    const filas = [...document.querySelectorAll<HTMLElement>('.cp-ledger-head')]
    if (sinClase) filas.forEach((f) => f.classList.remove('cp-ledger-head'))
    // Lo que mediría la pieza en una sola línea: si cabe en la fila, partirla
    // no tenía excusa.
    const anchoEnUnaLinea = (el: HTMLElement) => {
      const antes = el.style.whiteSpace
      el.style.whiteSpace = 'nowrap'
      const w = el.getBoundingClientRect().width
      el.style.whiteSpace = antes
      return w
    }
    const lineas = (el: Element) => {
      const r = document.createRange()
      r.selectNodeContents(el)
      return new Set(
        [...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)),
      ).size
    }
    const m = {
      filas: filas.length,
      fechas: 0,
      fechasPartidas: [] as string[],
      partidasSinNecesidad: [] as string[],
      fuera: [] as string[],
      firmaSola: 0,
    }
    for (const fila of filas) {
      const caja = fila.getBoundingClientRect()
      for (const pieza of fila.children as HTMLCollectionOf<HTMLElement>) {
        const texto = (pieza.textContent ?? '').trim()
        if (lineas(pieza) > 1 && anchoEnUnaLinea(pieza) <= caja.width)
          m.partidasSinNecesidad.push(texto)
        if (pieza.getBoundingClientRect().right > caja.right + 0.5) m.fuera.push(texto)
        if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
          m.fechas++
          if (lineas(pieza) > 1) m.fechasPartidas.push(texto)
        }
      }
      const firma = [...fila.querySelectorAll('span')].find(
        (s) => (s.textContent ?? '').trim() === 'firmado',
      )
      const grupo = firma?.previousElementSibling
      if (firma && grupo) {
        const a = grupo.getBoundingClientRect()
        const b = firma.getBoundingClientRect()
        if (Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) > 4) m.firmaSola++
      }
    }
    if (sinClase) filas.forEach((f) => f.classList.add('cp-ledger-head'))
    return m
  }, sinClase)
}

async function aVentana(page: Page, width: number) {
  await page.setViewportSize({ width, height: 812 })
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  )
}

for (const densidad of ['comfortable', 'spacious']) {
  test(`/plenos/:id · registro: ninguna fecha se parte, y ninguna pieza sale de su fila (${densidad})`, async ({
    page,
  }) => {
    await page.addInitScript((densidad) => {
      localStorage.setItem('cp:tweaks', JSON.stringify({ dark: false, density: densidad }))
    }, densidad)
    await page.goto(`/plenos/${FIRST_PLENO_ID}`, { waitUntil: 'domcontentloaded' })
    await page
      .getByRole('button', { name: /declaraciones/i })
      .first()
      .click()
    await expect(page.locator('.cp-ledger-head').first()).toBeVisible({ timeout: 20_000 })
    const mas = page.getByRole('button', { name: /cargar más/i })
    while (await mas.count()) await mas.first().click()
    await page.evaluate(() => document.fonts.ready.then(() => undefined))

    for (const width of [320, 375, 1280]) {
      await aVentana(page, width)
      const m = await medir(page)
      expect(m.filas, `${width} px · filas del registro pintadas`).toBeGreaterThan(20)
      expect(m.fechas, `${width} px · una fecha en cada fila`).toBe(m.filas)
      expect(m.fechasPartidas, `${width} px · fechas en dos líneas`).toEqual([])
      expect(m.fuera, `${width} px · piezas fuera de su fila`).toEqual([])
      expect(m.firmaSola, `${width} px · «firmado» en otra línea que su grupo`).toBe(0)
      expect(
        m.partidasSinNecesidad,
        `${width} px · piezas en dos líneas que cabían enteras en una`,
      ).toEqual([])
    }

    // La misma medida, sin la regla, ve el defecto: si no lo viera, el verde
    // de arriba no diría nada.
    await aVentana(page, 375)
    const sinRegla = await medir(page, true)
    expect(
      sinRegla.fechasPartidas.length,
      '375 px sin .cp-ledger-head · la medida tendría que ver fechas partidas',
    ).toBeGreaterThan(0)
  })
}
