import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

/**
 * La cascada de /presupuesto: del crédito inicial a lo ejecutado.
 *
 * Esta sección existe porque el hecho más grande de la página no se contaba:
 * el estado de ejecución trae 24,5 M€ de modificaciones sobre 37,6 M€ de
 * crédito inicial, y de ahí sale el «30,4 % ejecutado» que puesto solo se lee
 * como no gastar. Las pruebas de datos no pueden ver eso —las cifras estaban
 * bien y la palabra faltaba—, así que esto MIDE la geometría contra la
 * aritmética que la geometría afirma.
 *
 * La identidad que dibujan las barras: las cuatro se escalan contra el
 * presupuesto definitivo, así que el ancho de «inicial» más el de
 * «modificaciones» tiene que dar exactamente el de «definitivo», que ocupa su
 * carril entero. Si alguien cambia el denominador de una de las cuatro, las
 * cifras siguen siendo correctas y el dibujo miente — que es exactamente cómo
 * se publicó la banda de /eficiencia tapando la mitad de su hueco con toda la
 * suite en verde.
 */

const euros = (s: string) => Number(s.replace(/[^\d]/g, ''))

test.describe('Presupuesto · la cascada de ejecución', () => {
  test('las cuatro magnitudes se nombran, y ninguna se llama como otra', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(/Ejecución presupuestaria/).first()).toBeVisible({ timeout: 8000 })
    const cascada = page.locator('#cascada')
    await expect(cascada).toBeVisible()

    // Las cuatro, cada una con su nombre. «Ejecutado» es lo único que se ha
    // gastado; el definitivo es crédito, y llamarlo gasto es el defecto que
    // `magnitudes-fiscales` persigue en la prosa de todo el sitio.
    await expect(cascada).toContainText('Crédito inicial aprobado')
    await expect(cascada).toContainText('Modificaciones de crédito')
    await expect(cascada).toContainText('Presupuesto definitivo')
    await expect(cascada).toContainText('obligaciones reconocidas netas')

    expect(appErrors(errors)).toEqual([])
  })

  test('la aritmética de la cascada cuadra, y el dibujo la respeta', async ({ page }) => {
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#cascada')).toBeVisible({ timeout: 8000 })

    const m = await page.evaluate(() => {
      const fila = (id: string) => document.querySelector(`[data-cascada="${id}"]`)
      const cifra = (id: string) => fila(id)?.querySelector('.mono')?.textContent ?? ''
      const barra = (id: string) =>
        document.querySelector(`[data-barra="${id}"]`)?.getBoundingClientRect().width ?? -1
      const carril = (id: string) =>
        document.querySelector(`[data-barra="${id}"]`)?.parentElement?.getBoundingClientRect()
          .width ?? -1
      const ids = ['inicial', 'modificaciones', 'definitivo', 'ejecutado']
      return {
        cifras: Object.fromEntries(ids.map((i) => [i, cifra(i)])),
        anchos: Object.fromEntries(ids.map((i) => [i, barra(i)])),
        carril: carril('definitivo'),
        titulo: document.querySelector('#cascada [data-section-head]')?.textContent ?? '',
      }
    })

    // Que la prueba midió algo: cuatro filas con cifra y cuatro barras reales.
    // Un selector que no case devolvería -1 y todo lo de abajo pasaría solo.
    for (const id of ['inicial', 'modificaciones', 'definitivo', 'ejecutado']) {
      expect(euros(m.cifras[id]), `sin cifra en ${id}`).toBeGreaterThan(0)
      expect(m.anchos[id], `sin barra en ${id}`).toBeGreaterThan(0)
    }

    const ini = euros(m.cifras.inicial)
    const mod = euros(m.cifras.modificaciones)
    const def = euros(m.cifras.definitivo)
    const eje = euros(m.cifras.ejecutado)

    // 1. La aritmética que la sección afirma, sobre las cifras PUBLICADAS.
    expect(Math.abs(ini + mod - def), 'inicial + modificaciones ≠ definitivo').toBeLessThanOrEqual(
      1,
    )

    // 2. Y el dibujo. El definitivo ocupa su carril entero, y los otros tres
    //    se escalan contra él: los anchos tienen que reproducir los cocientes.
    expect(Math.abs(m.anchos.definitivo - m.carril)).toBeLessThanOrEqual(1.5)
    expect(
      Math.abs(m.anchos.inicial + m.anchos.modificaciones - m.anchos.definitivo),
      'las dos barras de arriba no suman la de abajo: hay dos denominadores',
    ).toBeLessThanOrEqual(1.5)
    expect(Math.abs(m.anchos.ejecutado - (eje / def) * m.carril)).toBeLessThanOrEqual(1.5)

    // 3. El titular dice el crecimiento, y es el de estas cifras — no uno
    //    escrito a mano que sobreviva a la próxima entrega.
    const pct = m.titulo.match(/creció un (\d+) %/)
    expect(pct, `el titular no declara el crecimiento: ${m.titulo}`).not.toBeNull()
    expect(Number(pct![1])).toBe(Math.round((mod / ini) * 100))

    // 4. Y el aviso da los DOS denominadores, que es el punto de la sección.
    const aviso = await page.locator('#cascada p').allInnerTexts()
    const texto = aviso.join(' ')
    expect(texto).toMatch(/% ejecutado» es un cociente sobre el presupuesto definitivo/)
    const dos = texto.match(/«([\d,]+) % ejecutado».*?es el ([\d,]+) %/s)
    expect(dos, `el aviso no da los dos porcentajes: ${texto}`).not.toBeNull()
    const sobreDef = Number(dos![1].replace(',', '.'))
    const sobreIni = Number(dos![2].replace(',', '.'))
    expect(sobreDef).toBeCloseTo((eje / def) * 100, 0)
    expect(sobreIni).toBeCloseTo((eje / ini) * 100, 0)
    // El segundo es mayor por construcción; si no lo fuera, la frase sobra.
    expect(sobreIni).toBeGreaterThan(sobreDef)
  })

  test('capítulo a capítulo: el que abrió en cero se ve abriendo en cero', async ({ page }) => {
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Dónde se amplió el crédito y dónde se ejecutó')).toBeVisible({
      timeout: 8000,
    })

    const filas = await page.evaluate(() =>
      [...document.querySelectorAll('[data-capitulo]')].map((f) => {
        const cap = f.getAttribute('data-capitulo')!
        const caja = (sel: string) => {
          const e = f.querySelector(sel)
          if (!e) return null
          const r = e.getBoundingClientRect()
          return { x: r.x, w: r.width, der: r.right }
        }
        return {
          cap,
          ini: caja(`[data-barra-ini="${cap}"]`),
          amp: caja(`[data-barra-amp="${cap}"]`),
          eje: caja(`[data-barra-ej="${cap}"]`),
          texto: (f as HTMLElement).innerText,
        }
      }),
    )

    // Que midió algo: los ocho capítulos del listado, con sus tres tramos.
    expect(filas.length, 'no se midió ningún capítulo').toBeGreaterThanOrEqual(8)

    for (const f of filas) {
      expect(f.ini, `cap.${f.cap} sin tramo de crédito inicial`).not.toBeNull()
      expect(f.amp, `cap.${f.cap} sin tramo de ampliación`).not.toBeNull()
      expect(f.eje, `cap.${f.cap} sin barra de ejecutado`).not.toBeNull()

      // El crédito inicial y la ampliación van PEGADOS, sin hueco ni solape:
      // juntos son el crédito definitivo, y esa adyacencia es toda la lectura
      // de la fila. Superpuestos —como se dibujaron primero— el gris de
      // `--ink30`, que lleva alfa, componía sobre el ámbar un caqui que no era
      // ninguno de los dos cuadraditos de la leyenda. Lo vio el navegador; la
      // suite entera estaba en verde.
      expect(
        Math.abs(f.amp!.x - f.ini!.der),
        `cap.${f.cap}: la ampliación no arranca donde acaba el crédito inicial`,
      ).toBeLessThanOrEqual(1)

      // Y lo ejecutado nunca sobresale del crédito definitivo.
      expect(
        f.eje!.der,
        `cap.${f.cap}: lo ejecutado se sale del crédito definitivo`,
      ).toBeLessThanOrEqual(f.amp!.der + 1)
    }

    // El hallazgo de la página, dibujado: un capítulo con crédito inicial 0 y
    // definitivo grande. Su tramo gris mide CERO y el ámbar es la barra entera.
    // Si algún día deja de haberlo, esta prueba lo dice en vez de pasar sola.
    const enCero = filas.filter((f) => f.texto.includes('crédito inicial 0 €'))
    expect(enCero.length, 'ningún capítulo declara haber abierto en cero').toBeGreaterThanOrEqual(1)
    for (const f of enCero) {
      expect(
        f.ini!.w,
        `cap.${f.cap} dice abrir en cero y pinta crédito inicial`,
      ).toBeLessThanOrEqual(0.5)
      expect(f.amp!.w, `cap.${f.cap} abre en cero y no pinta ampliación`).toBeGreaterThan(20)
    }
  })

  test('ningún hueco del catálogo llega a la pantalla', async ({ page }) => {
    // El guard de i18n mira el CÓDIGO; esto mira lo que se lee. La página
    // publica ~30 frases con marcador y basta olvidar un valor para imprimir
    // «un {pct} % más», que es lo que /empleo llegó a publicar.
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#cascada')).toBeVisible({ timeout: 8000 })
    const texto = await page.locator('.cp-page').innerText()
    expect(texto.length, 'la página no llegó a pintar texto').toBeGreaterThan(2000)
    expect(texto.match(/\{\w+\}/g) ?? [], 'huecos sin rellenar en pantalla').toEqual([])
  })
})
