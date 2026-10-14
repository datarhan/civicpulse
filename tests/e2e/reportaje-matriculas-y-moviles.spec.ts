import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'

const snap = JSON.parse(readFileSync('public/data/reportajes/matriculas-y-moviles.json', 'utf8'))

test.describe('Reportaje · matrículas y móviles (/reportajes/matriculas-y-moviles)', () => {
  test('renders the article, the pliego quotes, the visit and its limits', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/reportajes/matriculas-y-moviles', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: /cámaras de matrículas/ })).toBeVisible({
      timeout: 8000,
    })

    // El aviso de borrador sigue al snapshot: está mientras no se publica y
    // desaparece al publicar. Atarlo a uno de los dos estados haría caducar la
    // prueba el día que la pieza cambia.
    const banners = await page.getByText(/Borrador · no publicado/).count()
    expect(banners).toBe(snap.meta.estado === 'publicado' ? 0 : 1)

    // EL HALLAZGO: la promesa y el párrafo que la deshace, los dos literales.
    await expect(page.getByText(/no intrusiva y anonimizada/).first()).toBeVisible()
    await expect(page.getByText(/dirección MAC aleatoria/).first()).toBeVisible()
    await expect(
      page.getByText(/cinco \(5\) cámaras con reconocimiento de matrículas/),
    ).toBeVisible()
    await expect(
      page.getByText(/sistema de videovigilancia de la Policía Local/).first(),
    ).toBeVisible()

    // LAS CONCESIONES. Si alguien las quita para que la pieza suene más fuerte,
    // esto se pone rojo: la finalidad declarada de las cámaras es gestionar el
    // aparcamiento, una de las cuatro soluciones es la calidad del aire, y la
    // campaña es publicidad comprada, no un rastreo propio.
    await expect(page.getByText(/tiempo medio de ocupación/).first()).toBeVisible()
    await expect(page.getByText(/calidad del aire/).first()).toBeVisible()
    await expect(page.getByText(/no un rastreo propio del Ayuntamiento/)).toBeVisible()
    // Las que añadió la revisión del 11-10, por la misma razón: la finalidad que
    // el pliego da a la integración con la Policía Local, su cláusula de
    // finalidad exclusiva, y la única mención a las evaluaciones de impacto.
    // Sin esta última, «no exige una evaluación de impacto» se lee como «no dice
    // nada de ellas», y los dos pliegos administrativos sí dicen algo.
    await expect(
      page.getByText(/gestión del tráfico y la seguridad en las áreas de aparcamiento/),
    ).toBeVisible()
    await expect(page.getByText(/ningún tratamiento destinado a fines distintos/)).toBeVisible()
    await expect(
      page.getByText(/colaborará en la realización de las evaluaciones de impacto/),
    ).toBeVisible()
    // El importe, con y sin IVA: la adjudicación sin IVA no es lo que costó.
    await expect(page.getByText(/73\.870,75 € con IVA/).first()).toBeVisible()

    // La visita dice lo que sostiene una foto, y nada más.
    await expect(
      page.getByText(
        /Una fotografía no prueba que una cámara lea matrículas ni de qué contrato es/,
      ),
    ).toBeVisible()
    await expect(page.getByText(/Este reportaje no afirma que falten aparatos/)).toBeVisible()
    // La versión municipal se cita de la nota del propio Ayuntamiento, literal:
    // si alguien vuelve a parafrasearla o a citar a un periódico en su lugar,
    // la frase que se contrasta deja de ser suya.
    await expect(
      page.getByText(/garantizando en todo momento la protección de la privacidad/),
    ).toBeVisible()
    await expect(page.getByText(/Nota municipal del 30-07-2026/)).toBeVisible()

    // Las fotos cargan de verdad: un <img> roto también «está en la página».
    const fotos = page.locator('.cp-pieza img')
    expect(await fotos.count()).toBe(snap.observado.fotos.length)
    for (const img of await fotos.all()) {
      await img.scrollIntoViewIfNeeded()
      await expect
        .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0)
    }

    // Las dos tablas tienen filas.
    expect(await page.locator('table tbody tr').count()).toBe(
      snap.observado.filas.length + snap.version.filas.length,
    )

    // El derecho de réplica, en la página.
    await expect(page.getByText(/derecho de réplica/).first()).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })
})
