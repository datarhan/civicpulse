import { test, expect } from '@playwright/test'
import { CATALOGUE } from '../../src/i18n'
import { rellena } from '../../src/lib/formatters'
import { STACK_BREAKPOINT } from '../../src/variants/direction-d/tokens'

/**
 * La cabecera de la portada: que el detalle se VEA, y que el buscador abra.
 *
 * Las dos cosas venían de la revisión de la lámina como «no arreglado». El
 * detalle del tiempo, el aire y el metro existía y no se pintaba nunca: se
 * anclaba a la tira, y la tira lleva overflow-x para deslizarse, así que
 * quedaba recortado a la altura de la fila. Y el buscador de la portada estaba
 * pintado y muerto — sin onClick, y con CmdK sin montar en la rama de `/`.
 *
 * Aquí se mide con `elementFromPoint`, no con `getBoundingClientRect`: un panel
 * recortado CONSERVA su rectángulo, así que medirlo habría dado verde sobre un
 * panel invisible. Lo que se pregunta es qué hay pintado en ese píxel.
 *
 * Ya no hay que elegir qué chip anclar: la cabecera tiene UNO —«Hoy»— con el
 * tiempo, el aire y el metro dentro. Y se pinta aunque Open-Meteo no conteste
 * desde el runner, porque el metro no depende de la red: su horario es cálculo
 * puro, y sin temperatura el chip se compone con su propia cadena en vez de
 * dejar el hueco escrito.
 */
const CHIP_HOY = CATALOGUE.es['vivo.hoy.aria']

/**
 * Open-Meteo servido DESDE la prueba.
 *
 * Sin esto el runner no llega a la red, el chip se queda sólo con el metro y el
 * panel mide una sección de 329 px: «el pie lo pinta el panel» se cumplía por ser
 * corto, no por estar bien. Con las tres secciones mide 871 px en una ventana de
 * 900 —medido en el navegador— y sin tope se salía de la pantalla, con la sección
 * del metro inalcanzable. O sea que la prueba pasaba justo donde el defecto vivía.
 */
const CLIMA = {
  current: {
    temperature_2m: 21.4,
    apparent_temperature: 20.8,
    weather_code: 2,
    relative_humidity_2m: 54,
    wind_speed_10m: 12.2,
  },
  daily: {
    temperature_2m_min: [14.1, 13.2],
    temperature_2m_max: [26.3, 25.1],
    precipitation_probability_max: [10],
    sunrise: ['2026-09-14T07:41'],
    sunset: ['2026-09-14T20:29'],
  },
}
const AIRE = {
  current: { european_aqi: 24, pm2_5: 7.1, pm10: 12.4, nitrogen_dioxide: 8.2, ozone: 61.3 },
  hourly: { pm2_5: Array.from({ length: 30 }, (_, i) => 5 + (i % 4)) },
}

async function sirveElTiempo(page: import('@playwright/test').Page) {
  await page.route(/open-meteo\.com/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(route.request().url().includes('air-quality') ? AIRE : CLIMA),
    }),
  )
}

/**
 * Los dos extremos del texto del chip, compuestos con las plantillas del
 * catálogo y no escritos aquí: el más corto es «Hoy» a secas, y el más largo, el
 * de la noche —tiempo, y el primer tren de mañana— con tres cifras de espera y
 * una temperatura bajo cero, en el idioma en que salga más largo.
 */
const TEXTO_MAS_CORTO = CATALOGUE.es['vivo.hoy.chip.solo']
const TEXTO_MAS_LARGO = (['es', 'ca'] as const)
  .map((idioma) =>
    rellena(CATALOGUE[idioma]['vivo.hoy.chip'], {
      t: -10,
      m: rellena(CATALOGUE[idioma]['vivo.hoy.manana'], { m: 999 }),
    }),
  )
  .sort((a, b) => b.length - a.length)[0]

/**
 * El alto de la cabecera y dónde empieza el mapa, que es lo que el lector ve
 * saltar; y el ancho del CONTENIDO de la tira, para comprobar que lo que se
 * plantó o llegó la cambió de verdad. Con `texto`, lo planta antes de medir, en
 * la misma tarea, para que un repintado de React no se cuele entre las dos cosas.
 */
async function mideCabecera(page: import('@playwright/test').Page, texto?: string) {
  return page.evaluate((plantado) => {
    const chip = document.querySelector('.cp-vivo-chip')
    if (plantado != null) {
      const rotulo = chip?.querySelector('.mono')
      if (!rotulo) throw new Error('el chip no tiene rótulo donde plantar el texto')
      rotulo.textContent = plantado
    }
    const barra = document.querySelector('.d-topbar')?.getBoundingClientRect()
    const mapa = document.querySelector('.d-mappane')?.getBoundingClientRect()
    const tira = document.querySelector('[data-vivo-tira]')
    if (!barra || !mapa || !tira) throw new Error('falta la cabecera, el mapa o la tira')
    return {
      alto: Math.round(barra.height),
      mapa: Math.round(mapa.top),
      tira: tira.scrollWidth,
      chip: chip instanceof HTMLElement ? chip.innerText.replace(/\s+/g, ' ').trim() : '',
    }
  }, texto ?? null)
}

/** Qué está pintado en el pie del panel: el panel mismo, o quien lo recorta. */
async function quienPintaElPie(page: import('@playwright/test').Page, idPanel: string) {
  return page.evaluate((id) => {
    const panel = document.getElementById(id)
    if (!panel) return { error: 'sin panel' }
    const r = panel.getBoundingClientRect()
    const x = Math.round(r.left + r.width / 2)
    const y = Math.round(r.bottom - 3)
    const golpeado = document.elementFromPoint(x, y)
    return {
      alto: Math.round(r.height),
      dentro: panel.contains(golpeado),
      etiqueta: golpeado ? golpeado.tagName.toLowerCase() : null,
      clase: golpeado instanceof HTMLElement ? golpeado.className : null,
    }
  }, idPanel)
}

test.describe('Cabecera de la portada', () => {
  test('el detalle del chip se pinta, y no lo recorta la tira', async ({ page }) => {
    // Con las tres secciones dentro, que es el panel de verdad: con una sola, el
    // pie cae tan arriba que esta prueba pasaría aunque el panel se saliera.
    await sirveElTiempo(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const chip = page.getByRole('button', { name: CHIP_HOY })
    await expect(chip).toBeVisible({ timeout: 8000 })
    const idPanel = await chip.getAttribute('aria-controls')
    // Sin el `String()` de antes: envolver un `null` daba la cadena «null», que
    // es verdadera, y esta comprobación no podía fallar nunca.
    expect(idPanel, 'el chip no declara qué panel abre').not.toBeNull()

    // ABLACIÓN: cerrado, en ese píxel no hay panel. Sin esto, «hay panel» podría
    // cumplirlo un panel que estuviera abierto desde el principio. Y primero que
    // el panel EXISTA: `toBeHidden` se cumple igual con un panel que no está en
    // el DOM, y entonces la ablación no distinguiría «oculto» de «ausente».
    await expect(page.locator(`#${idPanel}`)).toHaveCount(1)
    await expect(page.locator(`#${idPanel}`)).toBeHidden()

    await chip.click()
    await expect(page.locator(`#${idPanel}`)).toBeVisible()
    const pie = await quienPintaElPie(page, idPanel)
    expect(pie.alto, 'el panel tiene alto de verdad').toBeGreaterThan(80)
    expect(
      pie.dentro,
      `en el pie del panel se pinta <${pie.etiqueta} class="${pie.clase}">, no el panel: está recortado`,
    ).toBe(true)
  })

  test('con las tres secciones el panel cabe en la ventana', async ({ page }) => {
    // El defecto que esto fija: la portada de escritorio es un shell de 100vh y no
    // desplaza el documento, así que un panel más alto que la ventana no se
    // alcanza. Medido antes del tope: 871 px de panel en 900 de ventana, con la
    // sección del metro fuera de la pantalla.
    await sirveElTiempo(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const chip = page.getByRole('button', { name: CHIP_HOY })
    await expect(chip).toBeVisible({ timeout: 8000 })
    await chip.click()
    const idPanel = await chip.getAttribute('aria-controls')
    expect(idPanel).not.toBeNull()

    // Que estén las TRES: con menos, el panel es corto y esto no mide nada.
    await expect(page.locator(`#${idPanel} [role="group"]`)).toHaveCount(3)

    const m = await page.evaluate((id) => {
      const p = document.getElementById(id as string)
      if (!p) return null
      const b = p.getBoundingClientRect()
      return {
        fondo: Math.round(b.bottom),
        ventana: window.innerHeight,
        visible: Math.round(p.clientHeight),
        contenido: Math.round(p.scrollHeight),
        desbordeY: getComputedStyle(p).overflowY,
      }
    }, idPanel)
    expect(m).not.toBeNull()
    expect(m!.fondo, 'el panel se sale por abajo de la ventana').toBeLessThanOrEqual(m!.ventana + 1)
    // Y lo que no cabe se alcanza desplazando DENTRO del panel. Se mira el
    // `overflow-y` CALCULADO, no la aritmética: comparar contenido con hueco
    // visible es una tautología —o cabe, o no cabe— y no puede fallar nunca, que
    // es precisamente la clase de aserción decorativa que este PR ha arreglado ya
    // dos veces. Recortado sin desplazamiento sería contenido publicado e
    // inalcanzable, que es el defecto del que sale todo esto.
    if (m!.contenido > m!.visible + 1) {
      expect(
        ['auto', 'scroll'].includes(m!.desbordeY),
        `el panel recorta ${m!.contenido - m!.visible}px sin forma de llegar a ellos (overflow-y: ${m!.desbordeY})`,
      ).toBe(true)
    }
    // Y que la comprobación de arriba haya tenido algo que comprobar: si el panel
    // cupiera entero, no diría nada del recorte, así que se exige que las tres
    // secciones sumen más que el hueco visible a esta altura de ventana.
    expect(
      m!.contenido,
      'el panel ya no desborda: esta prueba dejó de medir el recorte',
    ).toBeGreaterThan(m!.visible + 1)
  })

  test('abrir el detalle no ensancha el documento', async ({ page }) => {
    for (const ancho of [1440, STACK_BREAKPOINT - 124, 375]) {
      await page.setViewportSize({ width: ancho, height: 900 })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const chip = page.getByRole('button', { name: CHIP_HOY })
      await expect(chip).toBeVisible({ timeout: 8000 })
      await chip.click()
      const medida = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        vista: window.innerWidth,
      }))
      expect(medida.doc, `a ${ancho} el documento se ensancha`).toBeLessThanOrEqual(
        medida.vista + 1,
      )
    }
  })

  test('en estrecho el panel cabe en la pantalla', async ({ page }) => {
    // Anclado a la derecha del envoltorio, con la cabecera envuelta en varias
    // filas, el panel se salía por un lado. En estrecho se ancla a la cabecera.
    //
    // Con las tres secciones servidas: el tope de altura de estrecho descuenta una
    // cabecera envuelta de 116 px, y sin las tres el panel es corto y ese tope no
    // se pone a prueba nunca.
    await sirveElTiempo(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const chip = page.getByRole('button', { name: CHIP_HOY })
    await expect(chip).toBeVisible({ timeout: 8000 })
    await chip.click()
    const idPanel = String(await chip.getAttribute('aria-controls'))
    const caja = await page.locator(`#${idPanel}`).boundingBox()
    expect(caja).not.toBeNull()
    expect(Math.round(caja!.x), 'el panel se sale por la izquierda').toBeGreaterThanOrEqual(0)
    expect(
      Math.round(caja!.x + caja!.width),
      'el panel se sale por la derecha',
    ).toBeLessThanOrEqual(376)
  })

  test('Escape cierra el detalle y el foco se queda en el chip', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const chip = page.getByRole('button', { name: CHIP_HOY })
    await expect(chip).toBeVisible({ timeout: 8000 })
    await chip.click()
    const idPanel = String(await chip.getAttribute('aria-controls'))
    await page.locator(`#${idPanel}`).press('Escape')
    await expect(page.locator(`#${idPanel}`)).toBeHidden()
    const enfocado = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') ?? null,
    )
    expect(enfocado).toBe(CHIP_HOY)
  })

  test('el buscador de la portada abre con el botón y con el atajo', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const buscar = page.getByRole('button', { name: CATALOGUE.es['topbar.search'] })
    await expect(buscar).toBeVisible({ timeout: 8000 })
    await buscar.click()
    const entrada = page.getByPlaceholder('Saltar a…')
    await expect(entrada).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')
    await expect(entrada).not.toBeVisible()

    // Y el atajo, que en la portada no estaba montado en absoluto.
    await page.keyboard.press('Meta+k')
    await expect(entrada).toBeVisible({ timeout: 5000 })
  })

  test('a 375 el buscador se queda en icono y conserva su nombre', async ({ page }) => {
    // La clase `cp-topbar-search` trae más que la regla de impresión que decía su
    // comentario: por debajo de 720px `index.css` esconde la pista y el «⌘K» con
    // `!important`, así que el botón se queda SIN texto visible. Medido: 36×28 px
    // en la tercera fila, junto al reloj, sin desbordar el documento, que está bien.
    //
    // Lo que no puede pasar es que se quede además sin nombre, y ese es el fallo
    // que ningún ancho de escritorio puede ver: aquí el nombre sólo puede venir
    // de la etiqueta, porque contenido ya no hay.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const buscar = page.getByRole('button', { name: CATALOGUE.es['topbar.search'] })
    await expect(buscar).toBeVisible({ timeout: 8000 })

    // ABLACIÓN del nombre: sin texto visible, la aserción de arriba sólo puede
    // haberse cumplido por el aria-label. Si algún día vuelve a haber texto, esta
    // línea se cae y avisa de que la de arriba ya no prueba lo que dice.
    expect((await buscar.innerText()).trim(), 'a 375 el botón no debería tener texto').toBe('')

    const caja = await buscar.boundingBox()
    expect(caja).not.toBeNull()
    // Diana mínima de 24×24 (WCAG 2.2, criterio 2.5.8).
    expect(Math.round(caja!.width), 'la diana es más estrecha de 24px').toBeGreaterThanOrEqual(24)
    expect(Math.round(caja!.height), 'la diana es más baja de 24px').toBeGreaterThanOrEqual(24)

    const medida = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      vista: window.innerWidth,
    }))
    expect(medida.doc, 'el botón estirado saca el documento de cuadro').toBeLessThanOrEqual(
      medida.vista + 1,
    )

    // Y sigue abriendo: un icono sin texto que tampoco abriera sería el defecto
    // original otra vez, más pequeño.
    await buscar.click()
    await expect(page.getByPlaceholder('Saltar a…')).toBeVisible({ timeout: 5000 })
  })

  // Lo que llega después del primer pintado no puede mover la cabecera. A 375,
  // al contestar Open-Meteo el chip pasaba de 164 a 245 px, el reloj caía a una
  // tercera fila y la cabecera de 70 a 116: el mapa y todo lo de debajo bajaban
  // 46 px un instante después de pintar (y estaciones-mobile.spec.ts fallaba a
  // ratos por eso, PR #438). Y el texto del metro cambia con la hora, así que el
  // alto cambiaba también sin red de por medio.
  //
  // Open-Meteo se RETIENE, no se corta: así la medida de antes se toma con la
  // petición en vuelo, que es lo que ve el lector, y la de después con el tiempo
  // pintado. 768 es el estrecho con dos filas, donde la marca y el chip
  // compartían la primera mientras el chip cupiera.
  for (const [ancho, alto] of [
    [320, 700],
    [375, 812],
    [768, 1024],
  ] as const) {
    test(`a ${ancho} px la cabecera mide lo mismo antes y después del tiempo, y con cualquier texto del chip`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: alto })
      let sueltaElTiempo = () => {}
      const llegaElTiempo = new Promise<void>((resolver) => (sueltaElTiempo = resolver))
      await page.route(/open-meteo\.com/, async (route) => {
        await llegaElTiempo
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(route.request().url().includes('air-quality') ? AIRE : CLIMA),
        })
      })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const chip = page.getByRole('button', { name: CHIP_HOY })
      await expect(chip).toBeVisible({ timeout: 8000 })

      // ABLACIÓN: que la primera medida sea de verdad la de ANTES del tiempo. Sin
      // esto, un Open-Meteo que llegara antes de medir daría dos medidas iguales
      // del mismo estado, y la prueba pasaría sin haber visto el cambio.
      await expect(page.locator('[data-vivo-cargando]')).toHaveCount(1)
      await expect(chip).not.toContainText('°')
      const sinTiempo = await mideCabecera(page)

      sueltaElTiempo()
      await expect(chip).toContainText('°', { timeout: 8000 })
      const conTiempo = await mideCabecera(page)
      expect(conTiempo.tira, 'el tiempo llegó y la tira no se ensanchó').toBeGreaterThan(
        sinTiempo.tira,
      )
      expect(
        { alto: conTiempo.alto, mapa: conTiempo.mapa },
        `a ${ancho} px la cabecera cambia al llegar el tiempo («${sinTiempo.chip}» → «${conTiempo.chip}»)`,
      ).toEqual({ alto: sinTiempo.alto, mapa: sinTiempo.mapa })

      // Los dos extremos del texto, plantados: el metro no espera a la hora de la
      // prueba para decir «ahora» o «419 min (mañana)».
      for (const [texto, sentido] of [
        [TEXTO_MAS_CORTO, 'estrecha'],
        [TEXTO_MAS_LARGO, 'ensancha'],
      ] as const) {
        const plantado = await mideCabecera(page, texto)
        expect(plantado.chip, 'el texto no se plantó en el chip').toContain(texto)
        // Y que el texto plantado mueva la tira de verdad: si no, la comparación
        // de abajo no mediría nada.
        if (sentido === 'ensancha') expect(plantado.tira).toBeGreaterThan(conTiempo.tira)
        else expect(plantado.tira).toBeLessThan(sinTiempo.tira)
        expect(
          { alto: plantado.alto, mapa: plantado.mapa },
          `a ${ancho} px la cabecera cambia con el texto «${texto}» en el chip`,
        ).toEqual({ alto: sinTiempo.alto, mapa: sinTiempo.mapa })
      }
    })
  }
})
