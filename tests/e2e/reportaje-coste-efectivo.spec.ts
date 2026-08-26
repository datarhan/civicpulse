import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'

// La pieza se ejercita en los DOS estados y el esperado se lee del snapshot
// congelado: una spec que asumiera «publicado» se saltaría el borrador entero,
// y una que asumiera «borrador» caducaría el día de la publicación.
const snap = JSON.parse(readFileSync('public/data/reportajes/coste-efectivo.json', 'utf8'))

test.describe('Reportaje · coste efectivo (/reportajes/coste-efectivo)', () => {
  test('renders the three findings with their frozen figures', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/reportajes/coste-efectivo', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { name: 'El panel se queda en blanco donde está el dinero' }),
    ).toBeVisible({ timeout: 8000 })

    // El aviso de borrador sigue al estado del snapshot, no a una suposición.
    if (snap.meta.estado === 'publicado') {
      expect(await page.getByText(/Borrador editorial/).count()).toBe(0)
    } else {
      await expect(page.getByText(/Borrador editorial/).first()).toBeVisible()
    }
    await expect(page.getByText(/derecho de réplica/i).first()).toBeVisible()

    // Hallazgo 1 · la entrega sin rendir, con su control anti-pandemia.
    //
    // Se afirma sobre el PÁRRAFO del cuerpo, no con un getByText suelto. Desde
    // la corrección del 26-08 la pieza CITA su propia frase vieja —«503; sólo
    // 2017, con 513, rindió más»— dentro de un <details> plegado, así que
    // `getByText(/503/).first()` resolvía a texto OCULTO: la spec habría pasado
    // midiendo la cita de lo que se retiró en vez de lo que la página afirma.
    //
    // Y el esperado se deriva del snapshot en vez de recitarse, que es el
    // defecto que obligó a esta corrección: la frase publicada llevaba dos
    // cifras a mano sobre un gráfico recortado, y era falsa.
    await expect(page.getByText('sin rendir').first()).toBeVisible()

    const porAnio = snap.rendicionCV.porAnio
    const ausente = snap.entregas.noPresentadas[0]
    const nAusente = porAnio.find((f) => f.anio === ausente).n
    const superaron = porAnio.filter((f) => f.n > nAusente).sort((a, b) => a.anio - b.anio)

    const control = page.getByText(/La explicación cómoda sería la pandemia/).first()
    await expect(control).toBeVisible()
    await expect(control).toContainText(`en ${ausente} rindieron ${nAusente}`)
    await expect(control).toContainText(
      `sólo ${superaron.length} de las ${porAnio.length} entregas publicadas`,
    )
    for (const f of superaron) {
      await expect(control).toContainText(`${f.anio} con ${f.n}`)
    }

    // Hallazgo 2 · los denominadores congelados y la franja de comparables.
    await expect(page.getByText(/11\.059,41/).first()).toBeVisible()
    await expect(
      page.getByText(`mediana · ${snap.congelados.banda.mediana.toLocaleString('es-ES')} %`),
    ).toBeVisible()
    await expect(page.getByText(`Riba-roja · ${snap.congelados.banda.propio} %`)).toBeVisible()

    // Hallazgo 3 · nominal contra constante, con las cifras congeladas.
    await expect(page.getByText(/22,8\s?%/).first()).toBeVisible()
    for (const s of snap.inflacion.servicios) {
      await expect(page.getByText(s.nombre).first()).toBeVisible()
    }

    // El límite de la pieza, dicho en la pieza.
    await expect(page.getByText(/Lo que esta pieza no dice/i).first()).toBeVisible()
    await expect(page.getByText(/la declaración no es el servicio/).first()).toBeVisible()

    // Fuentes primarias con enlaces reales.
    await expect(page.getByRole('link', { name: /Orden HAP\/2075\/2014/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /panel completo/ })).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('la infografía se sirve como página estática, no como la SPA reescrita', async ({
    page,
  }) => {
    await page.goto('/reportajes/coste-efectivo', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('link', { name: /infografía en una sola página/ })).toBeVisible({
      timeout: 8000,
    })

    // El fichero vivía en docs/, que Vercel no sirve, y «no enlazada» se leyó
    // como «no publicada» durante un mes. Ahora se pide por URL y se comprueba
    // que lo servido es la infografía de verdad: la reescritura de la SPA
    // también devolvería 200, pero con la app dentro.
    const res = await page.request.get('/infografias/eficiencia-2026-08.html')
    expect(res.status()).toBe(200)
    const html = await res.text()
    // Su PROPIO título, no el del reportaje. Desde que la pieza se re-ejeó
    // sobre la concesión (23-08-2026), la infografía resume un capítulo —el de
    // la declaración— y conserva el título con el que la pieza se publicó el 16
    // de agosto. El snapshot lo declara, así que el contrato sigue siendo
    // comprobable en vez de quedarse sin comprobar.
    expect(snap.infografia?.titulo, 'el reportaje ya no declara su infografía').toBeTruthy()
    expect(html).toContain(snap.infografia.titulo)
    expect(html).not.toContain('id="root"')
  })

  test('ninguna cifra del cuerpo contradice al snapshot congelado', async ({ page }) => {
    // La regla de la casa para reportajes: las cifras están CONGELADAS y la
    // página las lee del fichero, así que basta comprobar que las que más
    // riesgo tienen de reescribirse a mano siguen saliendo de ahí.
    await page.goto('/reportajes/coste-efectivo', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { name: 'El panel se queda en blanco donde está el dinero' }),
    ).toBeVisible({ timeout: 8000 })

    const cuerpo = await page.locator('.cp-page').innerText()
    expect(cuerpo).toContain(`${snap.congelados.propios} a la vez`)
    for (const f of snap.rendicionCV.porAnio) {
      expect(cuerpo).toContain(String(f.n))
    }
  })
})
