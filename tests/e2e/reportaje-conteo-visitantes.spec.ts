import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Reportaje · conteo de visitantes (/reportajes/conteo-visitantes)', () => {
  test('renders the article, the frozen figures and the load-bearing finding', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/reportajes/conteo-visitantes', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: /Contar visitantes en un pueblo/ })).toBeVisible(
      { timeout: 8000 },
    )

    // estado === 'publicado' → el aviso de borrador NO puede estar.
    expect(await page.getByText(/Borrador · no publicado/).count()).toBe(0)

    // EL HALLAZGO. Si esta cita desaparece del texto, el reportaje se ha quedado
    // sin lo único que lo sostiene: que el apartado de necesidad de los dos
    // expedientes remite a una actuación que no es ninguno de los dos.
    await expect(page.getByText(/Realidad aumentada destinada a la puesta en valor/)).toBeVisible()
    await expect(page.getByText(/actuación nº 9/).first()).toBeVisible()
    await expect(page.getByText(/actuación nº 8/).first()).toBeVisible()

    // Las dos cifras que el titular promete, congeladas en el snapshot.
    await expect(page.getByText('87.050 €').first()).toBeVisible()
    await expect(page.getByText('16/100').first()).toBeVisible()

    // Las tablas tienen filas de verdad, no un tbody vacío.
    expect(await page.locator('table tbody tr').count()).toBeGreaterThan(4)

    // Y las dos concesiones que hacen defendible la pieza: si alguien las quita
    // para que suene más fuerte, esto se pone rojo. La calidad del aire es un
    // fin legítimo, y los criterios subjetivos NO rebasaron el umbral.
    await expect(page.getByText(/calidad del aire/).first()).toBeVisible()
    await expect(page.getByText(/comité de expertos/).first()).toBeVisible()

    // El derecho de réplica tiene que estar en la página, no sólo en el aviso
    // legal: la pieza nombra a dos empresas y a un ayuntamiento.
    await expect(page.getByText(/derecho de réplica/).first()).toBeVisible()

    // Las solicitudes, con su reloj CALCULADO el día que se lee.
    //
    // A la Secretaría de Estado se le escribió DOS veces: la solicitud del 9-sep
    // (contestada el 16) y el seguimiento del 17-sep, que pide la resolución de
    // ampliación que obra en su poder. Cada una tiene su reloj, así que son dos
    // filas. Se ancla en la cabeza «enviada el <fecha>» porque es lo único de la
    // fila que no cambia cuando el estado pasa de «en plazo» a «sin respuesta» o
    // «respondida»: una prueba atada a la frase del estado caduca sola.
    expect(await page.getByText(/Secretaría de Estado de Turismo · enviada el/).count()).toBe(2)
    await expect(
      page.getByText(/Secretaría de Estado de Turismo · enviada el 17 de septiembre de 2026/),
    ).toBeVisible()
    await expect(page.getByText(/Turisme Comunitat Valenciana · enviada el/)).toBeVisible()

    // LA CONTESTACIÓN QUE NO RESUELVE (21-09-2026). Turisme CV dijo que por
    // correo no la atiende y que hay que usar su trámite electrónico. Tiene que
    // VERSE —si no, la página calla que contestaron— y la fila NO puede pasar a
    // «respondida»: no concedieron, no denegaron y no dijeron que no les
    // correspondiera, así que el mes del artículo 20 sigue corriendo.
    await expect(page.getByText(/por su trámite electrónico/)).toBeVisible()
    await expect(page.getByText(/el mes del artículo 20 sigue corriendo/)).toBeVisible()

    // LA SALVEDAD JURÍDICA, y es la que no puede caerse. Salieron por correo:
    // consta el envío, no la recepción por el órgano competente, que es donde
    // el art. 20.1 arranca el mes. Sin esta frase la página estaría afirmando
    // un vencimiento que no puede acreditar, que es exactamente la clase de
    // afirmación que este sitio no publica.
    await expect(page.getByText(/órgano competente para resolver/).first()).toBeVisible()
    await expect(page.getByText(/no se presentan como vencimientos acreditados/)).toBeVisible()

    // Y la fecha se lee en castellano, no en ISO: es prosa, no un volcado.
    expect(await page.getByText(/enviada el \d{4}-\d{2}-\d{2}/).count()).toBe(0)

    // LA PRIMERA RESPUESTA (16-09-2026). La Secretaría de Estado no concedió ni
    // denegó: dijo que no le corresponde. La fila no puede seguir «en plazo», y
    // tiene que constar que no entregaron documentos — si esa frase cae, la
    // página parece haber recibido algo que no recibió.
    await expect(
      page.getByText(/El 16 de septiembre de 2026 contestaron que no les corresponde/),
    ).toBeVisible()
    await expect(page.getByText(/No acompañan ninguno de los documentos pedidos/)).toBeVisible()

    // Y el plazo europeo, completado: sin la ampliación, el apartado enfrenta el
    // hito del 2T-2026 con un contrato que vencía en julio y el lector saca una
    // conclusión que el Ministerio desmiente.
    await expect(
      page.getByText(/El plazo del contrato, que vencía el 20 de julio, queda dentro/),
    ).toBeVisible()

    // «Remitieron» sería falso: en la Ley 19/2013 remitir es REENVIAR la
    // solicitud al competente (art. 19.1), justo lo que no hicieron. Se prohíbe
    // en la prosa escrita a mano, que no pasa por la prueba unitaria de la frase.
    expect(await page.getByText(/\bremitieron\b/).count()).toBe(0)

    expect(appErrors(errors)).toEqual([])
  })
})
