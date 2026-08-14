import { test, expect } from '@playwright/test'
import { STRICT_ROUTES } from './_rutas'

/**
 * Contraste AA medido, en las dos temperaturas, componiendo alfa contra el fondo
 * de verdad.
 *
 * Esta puerta no existía y por eso la misma familia de defecto apareció CINCO
 * veces: un color que significa algo —un veredicto, un partido— usado como color
 * de TEXTO en vez de como relleno. Se corrigió en `/quejas`, en el popup del
 * mapa y dentro de `<Quote>`, y seguía viva en `/departamentos`,
 * `/declaraciones` y `/cargos`. Nadie lo veía porque nada lo medía.
 *
 * Por qué axe no basta, y no es un reproche a axe:
 *   · no compone alfa — la mitad de la tinta de este sitio es `rgba(…, .62)`
 *   · no ve el modo OSCURO, donde fallan los siete colores de partido
 *   · abandona la regla entera cuando no puede resolver un fondo, que es lo que
 *     pasa sobre las teselas de Leaflet
 *
 * MIDE, no prohíbe. `color: var(--ok)` es correcto sobre texto grande y sobre un
 * relleno; una regla estática daría falsos positivos y acabaría desactivada. Lo
 * que se comprueba es el resultado en pantalla.
 */

/** Umbral WCAG 1.4.3 según el tamaño renderizado. */
function suelo(px: number, bold: boolean) {
  return px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5
}

test.describe('Contraste AA medido', () => {
  for (const ruta of STRICT_ROUTES) {
    test(`${ruta} — texto legible en claro y en oscuro`, async ({ page }) => {
      await page.goto(ruta, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(600)

      // Sin esto, los valores leídos tras cambiar de tema son los ANTERIORES:
      // la transición no avanza mientras se conduce la página por CDP, y se
      // acaba midiendo el tema que ya no está. Costó tres diagnósticos falsos.
      await page.addStyleTag({ content: '*{transition:none !important;animation:none !important}' })

      const resultado = await page.evaluate(
        ({ umbrales }) => {
          function lum(v: number[]) {
            const s = v.map((c) => {
              const x = c / 255
              return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
            })
            return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
          }
          const nums = (s: string) => (s.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number)
          // Composición alfa: un `rgba` sólo tiene contraste una vez aplastado
          // sobre lo que tiene detrás.
          function flat(c: string, bg: number[]) {
            const f = nums(c)
            const a = f.length > 3 ? f[3] : 1
            return [0, 1, 2].map((i) => a * f[i] + (1 - a) * bg[i])
          }

          const salida: Record<string, { medidos: number; fallos: string[] }> = {}
          for (const tema of ['claro', 'oscuro']) {
            document.documentElement.classList.toggle('dark', tema === 'oscuro')
            void document.documentElement.offsetHeight

            const fondoPagina = nums(getComputedStyle(document.body).backgroundColor).slice(0, 3)
            const nodos = [
              ...document.querySelectorAll(
                'p,span,div,a,h1,h2,h3,h4,td,th,li,button,blockquote,figcaption,strong,em,label',
              ),
            ].filter((e) => e.textContent?.trim() && !e.children.length)

            const fallos: string[] = []
            for (const el of nodos) {
              // Lo decorativo no lo lee nadie: un glifo `aria-hidden` junto a su
              // etiqueta no es texto que haya que poder leer.
              if (el.closest('[aria-hidden="true"]')) continue
              const s = getComputedStyle(el)
              if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue

              let bgS = s.backgroundColor
              let n: Element | null = el
              while (bgS === 'rgba(0, 0, 0, 0)' && n?.parentElement) {
                n = n.parentElement
                bgS = getComputedStyle(n).backgroundColor
              }
              // Un degradado da `backgroundColor` transparente: la sonda subiría
              // al padre y compararía contra un fondo que no es el que se ve.
              // Se salta en vez de inventar un veredicto.
              if (n && getComputedStyle(n).backgroundImage !== 'none') continue

              const bg = bgS === 'rgba(0, 0, 0, 0)' ? fondoPagina : flat(bgS, fondoPagina)
              const fg = flat(s.color, bg)
              const l1 = lum(fg)
              const l2 = lum(bg)
              const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)

              const px = parseFloat(s.fontSize)
              const min = px >= 24 || (px >= 18.66 && +s.fontWeight >= 700) ? 3 : 4.5
              if (ratio < min) {
                fallos.push(
                  `${ratio.toFixed(2)}:1 (min ${min}) · ${px}px · «${el.textContent!.trim().slice(0, 34)}» · ${s.color} sobre ${bgS}`,
                )
              }
            }
            salida[tema] = { medidos: nodos.length, fallos: fallos.slice(0, 8) }
          }
          document.documentElement.classList.remove('dark')
          void umbrales
          return salida
        },
        { umbrales: [suelo(11, false), suelo(24, false)] },
      )

      for (const tema of ['claro', 'oscuro'] as const) {
        // Prueba de trabajo: si el selector dejara de encontrar nodos, «cero
        // fallos» sería verdad y no significaría nada. Es la forma
        // `r?.findings ?? []` que este repo ya ha pagado dos veces.
        expect(
          resultado[tema].medidos,
          `${ruta} · ${tema}: no se midió ningún elemento, así que un verde no prueba nada`,
        ).toBeGreaterThan(10)

        expect(resultado[tema].fallos, `${ruta} · ${tema}`).toEqual([])
      }
    })
  }
})
