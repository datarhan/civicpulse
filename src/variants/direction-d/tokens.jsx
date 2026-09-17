import { useEffect, useState } from 'react'

const RIBA_ROJA_CENTER = [39.5439, -0.5711]

/**
 * Por debajo de este ancho el armazón de dos paneles deja de funcionar y la
 * portada se apila — y, con ella, la cabecera se envuelve en varias filas.
 *
 * Vive aquí, con los tokens, y no en DirectionD, porque lo necesitan también
 * las hojas `*.css.js` de la portada: importarlo de DirectionD cerraría un
 * ciclo (DirectionD → Topbar → Vivo → vivo.css.js → DirectionD), y copiar el
 * 1024 a mano en cada hoja es la constante repetida que este repo ya ha pagado
 * dos veces. DirectionD lo reexporta para quien lo importaba de allí.
 */
const STACK_BREAKPOINT = 1024

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

function fmtClock(d, idioma = 'es') {
  return d.toLocaleTimeString(idioma === 'ca' ? 'ca-ES' : 'es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * El día del membrete de la columna, en el idioma de la interfaz: «martes, 15 de
 * septiembre de 2026» salía igual en la portada valenciana.
 */
function fmtDateLong(d, idioma = 'es') {
  return d.toLocaleDateString(idioma === 'ca' ? 'ca-ES' : 'es-ES', {
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

// Por debajo de este ancho la pila de controles del mapa se pliega por defecto: a
// 375 px medía más de 300 px de alto sobre un mapa de 277 a 357 y tapaba las cuatro
// estaciones de Riba-roja. Lo lee la media query de DirectionD.jsx, para que el
// umbral y la regla que lo aplica no puedan discrepar.
const MAPA_COMPACTO = 560

// Alto del MAPA por debajo del cual la pila de controles se pliega, midiera lo
// que midiera la ventana. El pliegue cortaba sólo por ANCHO, y el eje era el
// equivocado: la pila va anclada abajo y mide unos 310-340 px, y las estaciones de
// Riba-roja caen a unos 225-345 px del borde de arriba del mapa, así que lo que
// decide si las tapa es cuánto mide el mapa de alto. Barrido el 17-09-2026 con la
// pila desplegada:
//
//   ventana     mapa       estaciones tapadas
//   600×900     600×468    4 de 4
//   900×900     900×468    3 de 4   ← ancho de sobra y el mapa, bajo
//   768×1024    768×532    1 de 4
//   1024×768    604×593    1 de 4
//   1100×900    680×725    0 de 4   ← más estrecho que 900 y ninguna tapada
//   1280×900    860×725    0 de 4
//
// 700 deja plegados todos los que tapaban y sin tocar los de 725, que es el
// escritorio. Lo lee la container query de DirectionD.jsx.
const MAPA_PLEGADO_ALTO = 700

export {
  RIBA_ROJA_CENTER,
  SERIF,
  SANS,
  MONO,
  PALETTE,
  BOT_QUEJAS,
  MAPA_COMPACTO,
  MAPA_PLEGADO_ALTO,
  STACK_BREAKPOINT,
  fmtClock,
  fmtDateLong,
  useClock,
}
