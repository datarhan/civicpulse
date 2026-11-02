// @ts-check
import { useEffect, useRef, useState } from 'react'
import { rellena } from '../lib/formatters'
import { useT } from '../i18n'

/*
 * El índice de una página larga: sus apartados, leídos de lo que la página ya
 * pintó. Nació en los reportajes (`IndicePieza`) y se comparte porque la lectura
 * experta tiene el mismo problema: /plenos y /cargos miden dieciséis pantallas a
 * 375 px, y sin índice sólo se llega al último apartado bajando.
 *
 * Tres reglas, de las que dos vienen de los reportajes:
 *
 * - Se LEE del DOM: una lista escrita a mano se queda vieja cuando la página
 *   cambia. Y se vuelve a leer cuando cambia la página, porque en una que carga
 *   sus datos después el primer vistazo sale vacío.
 * - La lista sólo existe mientras está abierto. Plegada dentro de un <details>
 *   seguiría en el DOM, y cada título saldría dos veces: la búsqueda del navegador
 *   caería primero en la copia del índice, y un `getByText(título).first()` de las
 *   pruebas resolvería a esa copia oculta.
 * - Con menos de tres apartados no se pinta: un índice de dos entradas es ruido.
 *
 * `pegado` lo deja a la vista al bajar, que es para lo que sirve en una página
 * larga. Tiene dos consecuencias: `useHashScroll` lo descuenta al aterrizar, para
 * que no tape el destino, y se cierra en cuanto se elige un apartado o se pulsa
 * fuera, porque abierto taparía lo que se está leyendo.
 *
 * No se imprime: en papel no hay adónde saltar.
 */

const MINIMO_DE_SECCIONES = 3

/**
 * @typedef {{ id: string, titulo: string, num?: string }} Seccion
 *
 * @param {{
 *   leer: (raiz: Element) => Seccion[],
 *   titulo: string,
 *   apartados: (n: number) => string,
 *   pegado?: boolean,
 * }} props
 */
export function IndiceSecciones({ leer, titulo, apartados, pegado = false }) {
  const ref = useRef(/** @type {HTMLElement|null} */ (null))
  const detalles = useRef(/** @type {HTMLDetailsElement|null} */ (null))
  const [secciones, setSecciones] = useState(/** @type {Seccion[]} */ ([]))
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    const raiz = ref.current?.closest('.cp-page')
    if (!raiz) return undefined
    const lee = () => {
      const nuevas = leer(raiz)
      // Sin cambio no hay repintado: el mapa de /contratos muta el DOM en cada
      // fotograma de su línea de tiempo.
      setSecciones((antes) => (JSON.stringify(antes) === JSON.stringify(nuevas) ? antes : nuevas))
    }
    lee()
    const observador = new MutationObserver(lee)
    observador.observe(raiz, { childList: true, subtree: true })
    return () => observador.disconnect()
  }, [leer])

  const cierra = () => {
    if (detalles.current) detalles.current.open = false
  }

  useEffect(() => {
    if (!pegado || !abierto) return undefined
    /** @param {PointerEvent} e */
    const alPulsarFuera = (e) => {
      if (!detalles.current?.contains(/** @type {Node} */ (e.target))) cierra()
    }
    /** @param {KeyboardEvent} e */
    const alTeclear = (e) => {
      if (e.key !== 'Escape') return
      cierra()
      // La lista desaparece con el foco dentro: vuelve a quien la abrió.
      detalles.current?.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', alPulsarFuera)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('pointerdown', alPulsarFuera)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [pegado, abierto])

  return (
    <nav
      ref={ref}
      aria-label={titulo}
      data-print-hide
      className={pegado ? 'cp-indice-pegado' : undefined}
    >
      {secciones.length >= MINIMO_DE_SECCIONES && (
        <details
          ref={detalles}
          className="cp-indice"
          onToggle={(e) => setAbierto(e.currentTarget.open)}
        >
          <summary>
            <span className="cp-indice-titulo">{titulo}</span>
            <span className="mono cp-indice-n">{apartados(secciones.length)}</span>
          </summary>
          {abierto && (
            <ol>
              {secciones.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} onClick={pegado ? cierra : undefined}>
                    {s.num && (
                      <span className="mono" aria-hidden="true">
                        {s.num}
                      </span>
                    )}
                    <span>{s.titulo}</span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </details>
      )}
    </nav>
  )
}

/**
 * Los apartados de la lectura experta: las `SeccionExperta` de la página con
 * algo dentro. Una sin datos no enseña su pestaña (`Lecturas.jsx`), y aquí sería
 * un enlace a nada. El título es el de esa pestaña, que no lleva cifras.
 *
 * @param {Element} raiz
 * @returns {Seccion[]}
 */
export function leerExperta(raiz) {
  return [...raiz.querySelectorAll('[data-seccion-experta]')]
    .filter((s) => (s.querySelector('.cp-experta-cuerpo')?.childNodes.length ?? 0) > 0)
    .map((s) => ({
      id: s.id,
      titulo: s.querySelector('.cp-experta-plegada span')?.textContent?.trim() ?? '',
    }))
}

/**
 * El índice de la lectura experta. Va justo antes de la primera sección y como
 * hermano suyo: un elemento `sticky` sólo se pega dentro de su padre, y bajo el
 * divisor, envuelto en su ancla, no acompañaría a nadie.
 */
export function IndiceExperta() {
  const t = useT()
  return (
    <IndiceSecciones
      leer={leerExperta}
      titulo={t('lecturas.indice')}
      apartados={(n) => rellena(t('lecturas.indice.apartados'), { n })}
      pegado
    />
  )
}
