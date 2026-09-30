import { useEffect, useRef, useState } from 'react'
import { fmtDateCompacta } from '../../lib/formatters'
import { useLocale } from '../../i18n'

export default function TimeSlider({ min, max, value, onChange }) {
  const { locale, t } = useLocale()
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)
  const acc = useRef(value)

  useEffect(() => {
    if (!playing) return undefined
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      onChange(max)
      setPlaying(false)
      return undefined
    }
    acc.current = value
    const step = (max - min) / 120
    const tick = () => {
      acc.current = Math.min(max, acc.current + step)
      onChange(acc.current)
      if (acc.current >= max) {
        setPlaying(false)
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  if (!min || !max || min >= max) return null
  // Compacta: la etiqueta vive en 92 px, y en valencià «de maig del» no cabe.
  const label = fmtDateCompacta(new Date(value).toISOString(), locale)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
      <button
        onClick={() => {
          if (value >= max) onChange(min)
          setPlaying((p) => !p)
        }}
        aria-label={
          playing ? t('presupuesto.gasto.tiempo.pausar') : t('presupuesto.gasto.tiempo.reproducir')
        }
        style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--fs-head)' }}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        step={Math.max(1, (max - min) / 200)}
        onChange={(e) => {
          setPlaying(false)
          onChange(Number(e.target.value))
        }}
        aria-label={t('presupuesto.gasto.tiempo.aria')}
        aria-valuetext={label}
        // Sin accentColor el navegador pinta el control con SU azul de sistema.
        // Es el gemelo del deslizador del aterrizaje, que sí lo declaraba: un
        // control de tiempo sobre dinero público quedaba en un azul que no es
        // de la paleta y que nadie eligió.
        //
        // `width: 0` porque el control aporta su ancho intrínseco, 129 px, al
        // mínimo de la fila aunque `flex: 1` lo estire: con el botón, la fecha
        // y los huecos la fila no bajaba de 257,5 px, ese mínimo subía hasta la
        // pista `1fr` de la rejilla del mapa, y a 320 px de pantalla la columna
        // se salía 27,5 de su caja. `minWidth: 0` no basta: deja encoger, pero
        // no quita el control del mínimo. El ancho lo sigue poniendo `flex: 1`,
        // así que donde la fila tiene sitio mide lo mismo que antes.
        style={{ flex: 1, width: 0, accentColor: 'var(--civic)' }}
      />
      <span className="mono" style={{ fontSize: 'var(--fs-micro)', width: 92, textAlign: 'right' }}>
        {label}
      </span>
    </div>
  )
}
