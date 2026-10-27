import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { rutaDeSesion } from '../../src/scraper/ruta-de-sesion'
import { tituloDeSesionEs } from '../../src/scraper/meta-og'
import { REGIMEN_DE_SESIONES, proximoPleno } from '../../src/scraper/proximo-pleno'
import { esAprobacionDeActa, sesionesDelUltimoAnio } from '../../src/scraper/en-breve-plenos'

// A real pleno id with claims, read from the committed manifest.
const FIRST_ID = (() => {
  const m = JSON.parse(readFileSync('public/data/pleno-claims/index.json', 'utf8'))
  return m.plenos?.[0]?.plenoId as string
})()

test.describe('Plenos index (/plenos)', () => {
  test('renders the session list and links to a detail page', async ({ page }) => {
    await page.goto('/plenos', { waitUntil: 'networkidle' })
    await expect(page.getByText(/Plenos municipales/i)).toBeVisible()
    // cross-session link to /declaraciones
    await expect(page.locator('a[href="/declaraciones"]').first()).toBeVisible()
    // at least one session row links into /plenos/<id>
    const row = page.locator('a[href^="/plenos/"]').first()
    await expect(row).toBeVisible()
    await row.click()
    await expect(page).toHaveURL(/\/plenos\/.+/)
  })
})

/**
 * «El último pleno», la lectura vecinal de /plenos. La sesión esperada sale de
 * los snapshots y del día de hoy en Riba-roja, no de una fecha escrita aquí.
 */
test.describe('«El último pleno» (/plenos)', () => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  const sesiones: Array<{ id: string; date: string; kind: string; title: string }> = JSON.parse(
    readFileSync('public/data/plenos.json', 'utf8'),
  ).items
  const ultima = sesiones
    .filter((s) => s.date.slice(0, 10) < hoy)
    .reduce((a, b) => (b.date > a.date ? b : a))
  const agendas = JSON.parse(readFileSync('public/data/plenos-agendas.json', 'utf8')).plenos
  const agenda: Array<{ number: number; section: string }> =
    agendas.find((p: { id: string }) => p.id === ultima.id)?.agenda ?? []

  test('habla de la última sesión celebrada, con su orden del día en palabras llanas', async ({
    page,
  }) => {
    await page.goto('/plenos', { waitUntil: 'networkidle' })
    const tarjeta = page.locator('[data-en-breve="orden-del-dia"]')
    await expect(tarjeta).toBeVisible()
    // Enlaza por el alias legible, y el alias lleva a esa sesión.
    const ruta = rutaDeSesion(ultima, sesiones)
    expect(ruta).not.toBe(`/plenos/${ultima.id}`)
    await expect(tarjeta.locator(`a[href="${ruta}"]`)).toBeVisible()

    // Se mide algo: la sesión tiene orden del día y puntos para decidir.
    const decidir = agenda.filter((a) => a.section === 'resolutiva')
    expect(decidir.length).toBeGreaterThan(0)
    await expect(tarjeta.locator('.cp-plenos-puntos').first().locator('li')).toHaveCount(
      decidir.length,
    )

    // Ni un número de expediente en la capa vecinal.
    const bloque = page.locator('[data-en-breve-bloque]')
    expect(await bloque.innerText()).not.toMatch(/Expedient(?:e)?\s*:?\s*\d|Expte\.?\s*\d/i)
  })

  test('el enlace legible abre la sesión, con la ficha y la canónica de su id', async ({
    page,
  }) => {
    const ruta = rutaDeSesion(ultima, sesiones)
    await page.goto(ruta, { waitUntil: 'networkidle' })
    await expect(page.locator('h1')).toContainText(String(Number(ultima.date.slice(8, 10))))
    await expect(page.getByRole('button', { name: /Ver transcripción/i }).first()).toBeVisible()
    // El alias tiene su fichero de prerender-meta, con la ficha y la canónica del id.
    // `vite preview` sólo sirve el índice de una carpeta con la barra final (sin
    // ella, el HTML de reserva, también para el id); Vercel lo sirve sin barra.
    const html = await (await page.request.get(`${ruta}/`)).text()
    expect(html).toMatch(new RegExp(`<link rel="canonical" href="[^"]*/plenos/${ultima.id}"`))
    expect(html).toContain(`<title>${tituloDeSesionEs(ultima.date)} · `)
  })

  test('«¿Cuándo es el próximo?» dice lo que cuentan las fechas, sin deducir una', async ({
    page,
  }) => {
    await page.goto('/plenos', { waitUntil: 'networkidle' })
    const tarjeta = page.locator('[data-en-breve="proximo"]')
    await expect(tarjeta).toBeVisible()
    const p = proximoPleno({ sesiones, hoy })
    if (p.convocado) {
      const s = sesiones.find((x) => x.id === p.convocado!.id)!
      await expect(tarjeta.locator(`a[href="${rutaDeSesion(s, sesiones)}"]`)).toBeVisible()
      return
    }
    // Mide algo: hay ordinarios que contar.
    expect(p.ordinarios).toBeGreaterThan(10)
    const texto = await tarjeta.innerText()
    expect(texto).toContain('Todavía no tenemos su fecha.')
    expect(texto).toContain(`De los ${p.ordinarios} plenos ordinarios desde ese acuerdo`)
    expect(texto).toContain(`${p.primerLunes}, el primer lunes del mes`)
    // Ninguna fecha: ni un día de un mes en la tarjeta, salvo el del acta que enlaza.
    const sinEnlace = texto.replace(/El acuerdo, en el acta del .*/, '')
    expect(sinEnlace).not.toMatch(/\d{1,2} de [a-záéíóú]+ de \d{4}/i)
    const acuerdo = sesiones.find((x) => x.id === REGIMEN_DE_SESIONES.plenoId)!
    await expect(
      tarjeta.locator(`a[href="${rutaDeSesion(acuerdo, sesiones)}#pestana-transcripcion"]`),
    ).toBeVisible()
  })

  test('a la derecha del orden del día, las votaciones y debajo el próximo', async ({ page }) => {
    await page.goto('/plenos', { waitUntil: 'networkidle' })
    const caja = (id: string) => page.locator(`[data-en-breve="${id}"]`).boundingBox()
    const orden = await caja('orden-del-dia')
    const votos = await caja('votaciones')
    const prox = await caja('proximo')
    expect(orden && votos && prox).toBeTruthy()
    expect(votos!.x).toBeGreaterThan(orden!.x + orden!.width - 1)
    expect(Math.abs(prox!.x - votos!.x)).toBeLessThan(1)
    expect(prox!.y).toBeGreaterThanOrEqual(votos!.y + votos!.height)
  })

  test('los plenos del último año: una fila por sesión, por su alias, sin el acta', async ({
    page,
  }) => {
    const filas = sesionesDelUltimoAnio({ sesiones, agendas, hoy })
    expect(filas.length, 'mide algo').toBeGreaterThan(3)
    await page.goto('/plenos', { waitUntil: 'networkidle' })
    const lista = page.locator('[data-plenos-anio] .cp-plenos-anio-lista > li')
    await expect(lista).toHaveCount(filas.length)
    // La primera es la sesión anterior a la última, y enlaza por su alias.
    const primera = sesiones.find((s) => s.id === filas[0].id)!
    await expect(
      lista.first().locator(`a[href="${rutaDeSesion(primera, sesiones)}"]`),
    ).toBeVisible()
    // La aprobación del acta no sale entre los puntos, aunque se vote.
    const textos = await page.locator('[data-plenos-anio] .cp-plenos-puntos-texto').allInnerTexts()
    expect(textos.length).toBeGreaterThan(0)
    expect(textos.filter((x) => esAprobacionDeActa(x))).toEqual([])
    // Y va en la lectura vecinal, encima del divisor.
    const bloque = await page.locator('[data-plenos-anio]').boundingBox()
    const divisor = await page.locator('[data-divisor-lecturas]').boundingBox()
    expect(bloque!.y + bloque!.height).toBeLessThanOrEqual(divisor!.y)
  })

  test('el divisor va entre el último pleno y todas las sesiones', async ({ page }) => {
    await page.goto('/plenos', { waitUntil: 'networkidle' })
    const bloque = await page.locator('[data-en-breve-bloque]').boundingBox()
    const divisor = await page.locator('[data-divisor-lecturas]').boundingBox()
    const tabla = await page.locator('#sesiones').boundingBox()
    expect(bloque && divisor && tabla).toBeTruthy()
    expect(bloque!.y + bloque!.height).toBeLessThanOrEqual(divisor!.y)
    expect(divisor!.y + divisor!.height).toBeLessThanOrEqual(tabla!.y)
  })

  test('a 375 px empieza en la primera pantalla y no desborda', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/plenos', { waitUntil: 'networkidle' })
    const bloque = page.locator('[data-en-breve-bloque]')
    await expect(bloque).toBeVisible()
    const caja = await bloque.boundingBox()
    expect(caja!.y).toBeLessThan(812)
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBe(0)
  })
})

test.describe('Pleno detail (/plenos/:id)', () => {
  test('shows the per-session sections and ships no hidden accusations', async ({ page }) => {
    const chunkBodies: Array<{ items?: unknown[] }> = []
    page.on('response', async (res) => {
      const url = res.url()
      if (/\/data\/pleno-claims\/[^/]+\.json$/.test(url) && !url.endsWith('index.json')) {
        try {
          chunkBodies.push(await res.json())
        } catch {
          /* ignore */
        }
      }
    })
    await page.goto(`/plenos/${FIRST_ID}`, { waitUntil: 'networkidle' })
    await expect(page.getByText('Orden del día').first()).toBeVisible()
    await expect(page.getByText('Declaraciones cotejadas').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Ver transcripción/i }).first()).toBeVisible()

    const shipped = chunkBodies.flatMap((c) => (c.items ?? []) as Array<Record<string, any>>)
    const hidden = shipped.filter(
      (it) =>
        it.claim?.type === 'acusacion_publica' &&
        ((it.claim?.accusationSubtype ?? 'opinativa') === 'opinativa' ||
          it.verification?.verdict === 'sin-datos'),
    )
    expect(hidden).toEqual([])
  })

  test('unknown id renders a not-found state', async ({ page }) => {
    await page.goto('/plenos/this-id-does-not-exist', { waitUntil: 'networkidle' })
    await expect(page.getByText(/Sesión no encontrada/i)).toBeVisible()
  })
})
