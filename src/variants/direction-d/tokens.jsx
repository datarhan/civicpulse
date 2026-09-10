import { useEffect, useState } from 'react'

const RIBA_ROJA_CENTER = [39.5439, -0.5711]

const SERIF = "'Fraunces', Georgia, serif"
const SANS = "'Outfit', system-ui, -apple-system, sans-serif"
const MONO = "'DM Mono', ui-monospace, monospace"

const PALETTE = {
  bg: '#FAF8F2',
  paper: '#FFFFFF',
  ink: '#0B0F19',
  // Los mismos dos alfas que la escala compartida de index.css. Esta paleta
  // llevaba una segunda escala paralela —.82 / .68 / .65 / .60— que discrepaba
  // de la del sitio: la misma familia de sinónimos, dos veces. Las cuatro
  // claves se conservan porque 54 sitios del aterrizaje las nombran, pero sólo
  // llevan dos valores.
  ink80: 'rgba(11,15,25,.78)',
  ink60: 'rgba(11,15,25,.62)',
  ink50: 'rgba(11,15,25,.62)',
  ink40: 'rgba(11,15,25,.62)',
  rule: '#1F1F1F',
  hair: '#DCD7C8',
  // Petróleo, como la marca compartida. El valor anterior era el de
  // PARTY_COLORS.PP. 7,35:1 sobre el papel cálido de esta portada.
  civic: '#0E5B62',
  // El petróleo hondo del sitio (--civic-ink): el paso del ratón o del foco
  // sobre una superficie ya pintada de petróleo.
  civicInk: '#0A4449',
  // La fila señalada de un desplegable: el petróleo al 7 %. Es un lavado de
  // fondo, nunca un color de texto.
  civicWash: 'rgba(14,91,98,.07)',
  accent: '#B0291F',
  accent2: '#1E3A8A',
  // FILL vs INK, the same split index.css already makes with `--ok` /
  // `--ok-ink`. The vivid tones are for shapes — sparkline strokes, dots, bars —
  // where contrast rules don't apply. As TEXT on the warm paper they fail AA:
  // ok is 3.10:1 and warn 3.00:1 against #FAF8F2, and both were being used for
  // KPI values and badge labels. The -Ink variants are the text-safe pair
  // (4.72:1 and 4.73:1). axe never reported this because its contrast rule
  // evaluates zero nodes on the landing — see a11y.spec.ts.
  ok: '#16A34A',
  okInk: '#15803D',
  warn: '#D97706',
  warnInk: '#92400E',
  crit: '#DC2626',
  amber: '#92400E',
}

function fmtClock(d) {
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateLong(d) {
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function useClock(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
// La puerta al bot de quejas desde la portada. Una sola constante para las dos
// llamadas que la abren —la de la columna y la de la barra de secciones—, con
// el mismo parámetro de arranque, para que no puedan discrepar.
const BOT_QUEJAS = 'https://t.me/munigraph_bot?start=landing'

export { RIBA_ROJA_CENTER, SERIF, SANS, MONO, PALETTE, BOT_QUEJAS, fmtClock, fmtDateLong, useClock }
