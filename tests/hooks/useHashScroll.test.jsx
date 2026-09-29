import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { useHashScroll } from '../../src/hooks/useHashScroll'
import { MARGEN_ANCLA } from '../../src/components/eficiencia/anclas'

/**
 * El reproductor del e2e intermitente de /eficiencia —«una sola página: …, y
 * las anclas siguen resolviendo»—: `#sec-declaracion` aterrizaba en y = 47 con
 * la topbar tapando hasta 52. Medido el 29-09-2026 fotograma a fotograma en
 * Chromium, no supuesto:
 *
 *   1. `goto('/eficiencia#sec-declaracion')` desde `/eficiencia` es un salto
 *      dentro del mismo documento, y llegaba con las seis caras de Google
 *      Fonts todavía en `loading`.
 *   2. Lo colocaba el PROPIO navegador, en 64: el ancla lleva
 *      `scrollMarginTop: MARGEN_ANCLA`, que dice a propósito lo mismo que mide
 *      el hook. Ni una llamada a `scrollTo` en ninguna pasada.
 *   3. El hook llegaba después, veía el destino en su sitio y volvía sin armar
 *      la segunda pasada de las fuentes: sólo se armaba cuando colocaba él.
 *   4. Las fuentes entraban 40–190 ms después, el héroe pasaba de 313,69 a
 *      298,30 px, lo de arriba perdía 16 px y no había ni una mutación del
 *      DOM: el MutationObserver no se enteraba.
 *   5. Lo tapaba, a veces, el anclaje de scroll de Chrome, que corrige solo
 *      cuando lo de arriba cambia de alto. Pero la animación de entrada de
 *      `.cp-page` —240 ms de transform— lo suspende, y las fuentes entraban
 *      dentro de esa ventana: con ella, 7 de 8 aterrizajes en 47; sin ella,
 *      8 de 8 en 64. De ahí lo intermitente.
 *
 * Aquí no hay maquetación, así que la página es un modelo: el destino vive a
 * `posicion` px del principio del documento, la ventana está en `scrollY`, y
 * `getBoundingClientRect().top` es la resta. Un cambio de fuente es lo que era
 * en el navegador: restar píxeles a `posicion` sin tocar el DOM, y el aviso de
 * `document.fonts` —`loadingdone`, el mismo evento que la sonda vio llegar en
 * cada pasada—. Sin anclaje: el hook no puede apoyarse en una corrección que el
 * navegador suspende cuando quiere.
 */

const TOPBAR = 52
// Lo que perdía lo de arriba al entrar las fuentes. Una línea, más o menos: lo
// que importa es que deja el destino debajo de la topbar, y eso se comprueba.
const ENCOGE = 16

let modelo
let scrollYOriginal
let scrollToOriginal

/** Una página ya pintada: la topbar pegajosa y el destino, lejos. */
function montarPagina({ posicion, scrollY }) {
  modelo = { posicion, scrollY }
  const topbar = document.createElement('header')
  topbar.className = 'cp-shell-topbar'
  topbar.style.position = 'sticky'
  topbar.getBoundingClientRect = () => rect(0, TOPBAR)
  const destino = document.createElement('section')
  destino.id = 'sec-declaracion'
  destino.getBoundingClientRect = () => rect(modelo.posicion - modelo.scrollY, 580)
  document.body.append(topbar, destino)
}

function rect(top, height) {
  return { top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top }
}

const arriba = () => document.getElementById('sec-declaracion').getBoundingClientRect().top

/**
 * Un `document.fonts` de juguete que se comporta como el de verdad en lo que
 * aquí importa: `status`, una promesa `ready` que se sustituye cuando empieza
 * otra carga, y el evento `loadingdone` al acabar.
 */
function fuentes({ cargando }) {
  const set = new EventTarget()
  let resolver = () => {}
  set.empiezan = () => {
    set.status = 'loading'
    set.ready = new Promise((r) => (resolver = r))
  }
  set.entran = () => {
    set.status = 'loaded'
    resolver(set)
    set.dispatchEvent(new Event('loadingdone'))
  }
  if (cargando) set.empiezan()
  else {
    set.status = 'loaded'
    set.ready = Promise.resolve(set)
  }
  Object.defineProperty(document, 'fonts', { configurable: true, value: set })
  return set
}

function Pagina() {
  useHashScroll()
  return null
}

const abrir = (ruta) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Pagina />
    </MemoryRouter>,
  )

beforeEach(() => {
  scrollYOriginal = Object.getOwnPropertyDescriptor(window, 'scrollY')
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => modelo.scrollY })
  scrollToOriginal = window.scrollTo
  window.scrollTo = vi.fn(({ top }) => {
    modelo.scrollY = top
  })
})

afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'scrollY', scrollYOriginal)
  window.scrollTo = scrollToOriginal
  delete document.fonts
  document.body.replaceChildren()
})

describe('useHashScroll · las fuentes que entran después del aterrizaje', () => {
  it('si el navegador ya lo había colocado, lo recoloca cuando entran las fuentes', async () => {
    const set = fuentes({ cargando: true })
    // El salto del propio navegador: deja el destino en su `scroll-margin-top`.
    montarPagina({ posicion: 2320, scrollY: 2320 - MARGEN_ANCLA })
    abrir('/eficiencia#sec-declaracion')

    const aterrizaje = arriba()
    expect(aterrizaje).toBe(MARGEN_ANCLA)
    // Lo que el cambio de fuente hace sin nadie que lo corrija: la prueba sólo
    // significa algo si ese hueco queda de verdad debajo de la topbar.
    expect(aterrizaje - ENCOGE).toBeLessThan(TOPBAR)

    await act(async () => {
      modelo.posicion -= ENCOGE
      set.entran()
    })

    expect(arriba()).toBe(aterrizaje)
  })

  it('y también cuando la carga empieza DESPUÉS de colocar, con `ready` ya resuelto', async () => {
    // Una fuente se pide cuando hay texto que la necesita, así que puede
    // empezar a cargar con el destino ya colocado. `document.fonts.ready` es
    // una promesa de un solo uso: la que se cogió al colocar ya estaba
    // resuelta y no se entera de la carga siguiente.
    const set = fuentes({ cargando: false })
    montarPagina({ posicion: 2320, scrollY: 0 })
    abrir('/eficiencia#sec-declaracion')
    await act(async () => {})

    const aterrizaje = arriba()
    expect(window.scrollTo).toHaveBeenCalledTimes(1)
    expect(aterrizaje).toBeGreaterThanOrEqual(TOPBAR)
    expect(aterrizaje - ENCOGE).toBeLessThan(TOPBAR)

    await act(async () => {
      set.empiezan()
      modelo.posicion -= ENCOGE
      set.entran()
    })

    expect(arriba()).toBe(aterrizaje)
  })

  it('quien ha empezado a leer manda: las fuentes no le mueven la ventana', async () => {
    const set = fuentes({ cargando: true })
    montarPagina({ posicion: 2320, scrollY: 2320 - MARGEN_ANCLA })
    abrir('/eficiencia#sec-declaracion')

    act(() => {
      window.dispatchEvent(new Event('wheel'))
    })
    await act(async () => {
      modelo.posicion -= ENCOGE
      set.entran()
    })

    // Se ha movido, y se queda donde el lector lo tiene.
    expect(arriba()).toBe(MARGEN_ANCLA - ENCOGE)
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('al irse de la página deja de escuchar a las fuentes', async () => {
    const set = fuentes({ cargando: true })
    montarPagina({ posicion: 2320, scrollY: 2320 - MARGEN_ANCLA })
    const { unmount } = abrir('/eficiencia#sec-declaracion')

    unmount()
    await act(async () => {
      modelo.posicion -= ENCOGE
      set.entran()
    })

    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('sigue recolocando cuando lo que llega por encima son datos (el caso de /metodologia)', async () => {
    fuentes({ cargando: false })
    montarPagina({ posicion: 2320, scrollY: 2320 - MARGEN_ANCLA })
    abrir('/eficiencia#sec-declaracion')
    const aterrizaje = arriba()

    // Una tarjeta que entra por encima: esto SÍ es una mutación del DOM.
    await act(async () => {
      modelo.posicion += 260
      document.body.prepend(document.createElement('article'))
    })

    expect(arriba()).toBe(aterrizaje)
  })
})
