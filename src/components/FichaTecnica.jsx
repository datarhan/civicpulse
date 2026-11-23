import { useEffect, useRef } from 'react'

/**
 * El pliegue de lo que sirve para volver a comprobar una cifra y no para
 * leerla: hojas, filas y columnas de un documento, entregas anteriores, la
 * fecha de una copia, el formato de un fichero.
 *
 * Nació en /quejas como «Datos técnicos» (auditoría de las dos lecturas, §18)
 * y se generaliza aquí para que cada página no escriba el suyo.
 *
 * QUÉ NO VA DENTRO, nunca: una salvedad, la frase que dice cómo se lee una
 * cifra, la vía de réplica o el enlace al documento de la cifra que titula.
 * Lo primero es la regla de la casa —la salvedad viaja con la cifra—; lo
 * último, la promesa de /aviso-legal de publicar la respuesta «íntegra junto a
 * la ficha». Un pliegue no puede ser el sitio donde una de esas cosas deja de
 * verse. `tests/e2e/servicio-detalle.spec.ts` lo mira con el pliegue cerrado.
 *
 * AL IMPRIMIR SE ABRE. Un `<details>` cerrado no imprime su contenido, y una
 * ficha impresa sin sus celdas es una cita sin dirección. Tras imprimir vuelve
 * como estaba: lo que el lector abrió sigue abierto.
 */
export function FichaTecnica({ rotulo, children, style, estiloRotulo, ...resto }) {
  const ref = useRef(null)
  useEffect(() => {
    let estabaAbierta = null
    const antes = () => {
      const d = ref.current
      // Dos `beforeprint` seguidos sin `afterprint`: el segundo vería el
      // pliegue ya abierto por el primero y lo dejaría abierto después.
      if (!d || estabaAbierta !== null) return
      estabaAbierta = d.open
      d.open = true
    }
    const despues = () => {
      const d = ref.current
      if (!d || estabaAbierta === null) return
      d.open = estabaAbierta
      estabaAbierta = null
    }
    window.addEventListener('beforeprint', antes)
    window.addEventListener('afterprint', despues)
    return () => {
      window.removeEventListener('beforeprint', antes)
      window.removeEventListener('afterprint', despues)
    }
  }, [])
  return (
    <details ref={ref} data-ficha-tecnica="" style={style} {...resto}>
      <summary
        style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--ink70)', ...estiloRotulo }}
      >
        {rotulo}
      </summary>
      {children}
    </details>
  )
}
