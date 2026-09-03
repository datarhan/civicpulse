// @ts-check
import { useEffect, useRef, useState } from 'react'
import { useT } from '../../../i18n'
import { IncendiosLegend } from './IncendiosLegend'

const cardStyle = {
  background: 'rgba(255,255,255,.94)',
  border: '1px solid #DCD7C8',
  borderRadius: 'var(--r-input)',
  padding: '8px 10px',
  fontFamily: "'Outfit', system-ui, sans-serif",
  boxShadow: '0 4px 16px rgba(11,15,25,.16)',
  width: 268,
}

const titleStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 'var(--fs-micro)',
  color: 'rgba(11,15,25,.62)',
  letterSpacing: '.1em',
  textTransform: 'uppercase',
}

const botonStyle = {
  border: '1px solid #C9C3B4',
  background: 'transparent',
  borderRadius: 'var(--r-input)',
  padding: '1px 8px',
  fontFamily: "'Outfit', system-ui, sans-serif",
  fontSize: 'var(--fs-micro)',
  color: 'rgba(11,15,25,.75)',
  cursor: 'pointer',
}

/**
 * Deslizador de años para la capa de incendios: acumula de `anyoMin` hasta el
 * año elegido, así que al recorrerlo se ve cómo se van sumando cicatrices
 * sobre el mismo monte.
 *
 * Es hermano de MoneyTimeSlider, no una generalización suya: aquel recorre
 * fechas continuas y lleva sus dos filtros de gasto, éste recorre 32 años
 * discretos. Fundirlos daría un control con dos modos y ningún dueño.
 *
 * El rAF de reproducción se cancela al desmontar, y la capa entera se
 * desmonta cuando se apaga su interruptor — que es lo que garantiza que una
 * capa apagada no siga animando nada.
 */
export function IncendiosYearSlider({ anyoMin, anyoMax, value, onChange, serie }) {
  const t = useT()
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)
  const cursor = useRef(value ?? anyoMax)

  useEffect(() => {
    if (!playing) return undefined
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      onChange(anyoMax)
      setPlaying(false)
      return undefined
    }
    // Arranca desde el principio si ya estaba al final: darle a play sin que
    // pase nada es peor que no tener el botón.
    cursor.current = (value ?? anyoMax) >= anyoMax ? anyoMin : (value ?? anyoMin)
    let ultimo = 0
    const tick = (ahora) => {
      // ~4 años por segundo: 32 años en unos 8 s, legible sin aburrir.
      if (ahora - ultimo > 250) {
        ultimo = ahora
        cursor.current = Math.min(anyoMax, cursor.current + 1)
        onChange(cursor.current)
        if (cursor.current >= anyoMax) {
          setPlaying(false)
          return
        }
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // `value` a propósito fuera: si entrara, cada onChange reiniciaría el bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, anyoMin, anyoMax, onChange])

  const actual = value ?? anyoMax
  const hasta = (serie ?? []).filter((s) => s.anyo <= actual)
  const acumulados = hasta.reduce((total, s) => total + s.total, 0)
  const esteAnyo = (serie ?? []).find((s) => s.anyo === actual)?.total ?? 0

  return (
    <div style={cardStyle} className="cp-incendios-slider">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={titleStyle}>{t('map.incendios.serie')}</span>
        <button
          type="button"
          style={botonStyle}
          onClick={() => setPlaying((p) => !p)}
          aria-label={`${playing ? t('map.timeline.pause') : t('map.timeline.play')}: ${t('map.incendios.title')}`}
        >
          {playing ? '❙❙' : '▶'}
        </button>
      </div>

      <input
        type="range"
        min={anyoMin}
        max={anyoMax}
        step={1}
        value={actual}
        onChange={(e) => {
          setPlaying(false)
          onChange(Number(e.target.value))
        }}
        aria-label={t('map.incendios.serie')}
        style={{ width: '100%', marginTop: 6, accentColor: '#8C2A12' }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: "'DM Mono', monospace",
          fontSize: 'var(--fs-micro)',
          color: 'rgba(11,15,25,.7)',
        }}
      >
        <span>{anyoMin}</span>
        <span style={{ color: '#8C2A12', fontWeight: 600 }}>
          {actual}
          {/* Un año sin incendios se dice, no se deja en blanco: el hueco es
              parte de la serie. */}
          {esteAnyo > 0 ? ` · +${esteAnyo}` : ' · sin incendios'}
        </span>
        <span>{anyoMax}</span>
      </div>

      <div style={{ marginTop: 3, fontSize: 'var(--fs-aux)', color: 'rgba(11,15,25,.7)' }}>
        {acumulados} incendios acumulados desde {anyoMin}
      </div>

      {/* Leyenda y cobertura DENTRO de esta tarjeta, no en una segunda: el
          mapa mide 277 px de alto a 375 px y la pila ya iba 59 px por encima
          de su borde antes de esta capa. Dos tarjetas la sacaban de la
          pantalla. Es además lo que hace el control de gasto con su cobertura. */}
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #E6E1D4' }}>
        <IncendiosLegend />
      </div>
    </div>
  )
}
