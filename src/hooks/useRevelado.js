import { useEffect, useRef, useState } from 'react'

/** ¿Se puede animar? Sin IntersectionObserver, o con movimiento reducido, no. */
function puedeAnimar() {
  return (
    typeof window !== 'undefined' &&
    'IntersectionObserver' in window &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Revela una figura la primera vez que entra en pantalla.
 *
 * Devuelve la ref y las dos marcas que lee la hoja: `data-armado` esconde las
 * marcas animables (barras, puntos, trazos) y `data-visto` las lanza. El
 * estado de reposo —sin ninguna de las dos— es la figura completa, y es lo que
 * recibe quien no tiene IntersectionObserver, quien pidió movimiento reducido y
 * quien imprime (la hoja de impresión anula el armado). Sólo se animan marcas,
 * nunca texto: ninguna cifra cuenta hacia arriba ni pasa por valores que no son
 * el suyo.
 *
 * @param {{ umbral?: number }} [opts]
 */
export function useRevelado({ umbral = 0.3 } = {}) {
  const ref = useRef(/** @type {Element|null} */ (null))
  const [armado] = useState(puedeAnimar)
  const [visto, setVisto] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!armado || !el) return
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisto(true)
          io.disconnect()
        }
      },
      { threshold: umbral },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [armado, umbral])

  return {
    ref,
    marcas: {
      'data-armado': armado && !visto ? '' : undefined,
      'data-visto': armado && visto ? '' : undefined,
    },
  }
}
