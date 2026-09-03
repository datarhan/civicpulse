// @ts-check
import { useMemo } from 'react'
import { Polygon, Tooltip, Popup } from 'react-leaflet'
import { useIncendios } from '../../../hooks/useIncendios'
import { useIncendiosPerimetros } from '../../../hooks/useIncendiosPerimetros'
import { tonoPorRecencia } from '../../../lib/incendios'
import { IncendioPopup } from '../popups/IncendioPopup'

/**
 * Perímetros de incendio forestal del ICV que cruzan el término municipal,
 * 1993 en adelante. Geometría oficial: ni un vértice es nuestro.
 *
 * Dos cosas que esta capa hace a propósito:
 *
 * - Sólo dibuja lo que INTERSECTA la frontera. El snapshot trae además algún
 *   incendio que la GVA atribuye a Riba-roja y cartografía fuera del término
 *   —el mayor de la serie, de 1994, está así—; ése se cuenta en la cobertura
 *   pero no se pinta, porque dibujarlo pondría una cicatriz donde no ardió.
 *
 * - Los perímetros se solapan: la misma ladera arde más de una vez en treinta
 *   años. Por eso van translúcidos y ordenados de más viejo a más reciente,
 *   para que lo último quede encima y la superposición se vea.
 */
export function IncendiosLayer({ anyoVisible = null }) {
  const { data: indice } = useIncendios()
  const { data: perimetros } = useIncendiosPerimetros()

  const filas = useMemo(() => {
    const anillosPorId = perimetros?.anillos ?? {}
    const u = indice?.universe
    const anyoMin = u?.anyoMin ?? 1993
    const anyoMax = u?.anyoMax ?? new Date().getFullYear()
    return (indice?.incendios ?? [])
      .filter((i) => i.intersecta && anillosPorId[i.id]?.length)
      .filter((i) => anyoVisible === null || i.anyo <= anyoVisible)
      .map((i) => ({
        ...i,
        anillos: anillosPorId[i.id],
        tono: tonoPorRecencia(i.anyo, anyoMin, anyoMax),
      }))
      .sort((a, b) => a.anyo - b.anyo)
  }, [indice, perimetros, anyoVisible])

  // Sin perímetros no se pinta nada: un vacío honesto, no una mancha vacía.
  if (filas.length === 0) return null

  return (
    <>
      {filas.map((i) => (
        <Polygon
          key={i.id}
          positions={i.anillos}
          pathOptions={{
            color: i.tono,
            fillColor: i.tono,
            fillOpacity: 0.32,
            weight: 1.2,
            opacity: 0.85,
          }}
          eventHandlers={{
            // react-leaflet no propaga pathOptions.className al path de forma
            // fiable (ver MoneyLayer), así que se etiqueta al añadir la capa:
            // es el asidero estable para los e2e.
            add: (e) => {
              const el = e.target.getElement && e.target.getElement()
              if (el) el.classList.add('cp-incendio')
            },
          }}
        >
          <Tooltip direction="top" sticky>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'var(--fs-meta)' }}>
              <strong>{i.anyo}</strong>
              {i.paraje ? ` · ${i.paraje}` : ''}
              <br />
              {i.superficieHa.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ha
              {!i.propio && ' · consta en otro término'}
            </div>
          </Tooltip>
          <Popup closeButton autoPan maxWidth={320}>
            <IncendioPopup incendio={i} fuente={indice?.fuente} />
          </Popup>
        </Polygon>
      ))}
    </>
  )
}
