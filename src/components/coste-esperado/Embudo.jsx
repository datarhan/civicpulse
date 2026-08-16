import { curvaBanda, ticksLog, etiquetaEuros, etiquetaHabitantes } from './embudo-geometria'

/**
 * El embudo: cada municipio de la muestra como punto sin nombre, la banda de
 * predicción detrás, y Riba-roja como el ÚNICO punto con nombre.
 *
 * Es el gráfico que la ola D dejó fuera de /eficiencia a propósito: los
 * límites de un embudo son un modelo, y los veredictos de modelo viven en el
 * laboratorio. Aquí está bien hecho lo que allí estaría mal puesto.
 *
 * Dos decisiones de dibujo que son política:
 *
 * - **Los puntos no llevan identidad.** Ni nombre, ni INE, ni tooltip que los
 *   distinga más allá de sus dos coordenadas. La muestra publicada ya va
 *   anónima y ordenada; el dibujo no puede deshacer lo que el dato protege.
 * - **La banda se muestrea de la MISMA función que publica el snapshot**
 *   (`intervaloPrediccion`), no de una copia local: si la guarda reproduce el
 *   modelo, reproduce también el dibujo.
 */
const ALTO = 220
const MARGEN = { arriba: 8, abajo: 22, izq: 46, der: 10 }

export function Embudo({ modelo, muestra, propia, formateaEuros }) {
  if (!modelo || !muestra?.length) return null

  const pobs = muestra.map((p) => p.poblacion)
  const costes = muestra.map((p) => p.coste)
  const pobMin = Math.min(...pobs, propia?.poblacion ?? Infinity)
  const pobMax = Math.max(...pobs, propia?.poblacion ?? -Infinity)
  const banda = curvaBanda(modelo, pobMin, pobMax)
  const costeMin = Math.min(...costes, ...banda.map((b) => b.inferior))
  const costeMax = Math.max(...costes, ...banda.map((b) => b.superior))

  const lx0 = Math.log(pobMin)
  const lx1 = Math.log(pobMax)
  const ly0 = Math.log(costeMin)
  const ly1 = Math.log(costeMax)
  // Ancho lógico fijo con viewBox: los radios y tipografías del SVG escalan
  // con el contenedor sin deformarse (aquí las unidades son del dibujo, no px
  // de CSS — por eso las fuentes van en unidades SVG y no en tokens).
  const ANCHO = 720
  const plotW = ANCHO - MARGEN.izq - MARGEN.der
  const plotH = ALTO - MARGEN.arriba - MARGEN.abajo
  const px = (pob) => MARGEN.izq + ((Math.log(pob) - lx0) / (lx1 - lx0 || 1)) * plotW
  const py = (c) => MARGEN.arriba + (1 - (Math.log(c) - ly0) / (ly1 - ly0 || 1)) * plotH

  const area =
    banda
      .map(
        (b, i) =>
          `${i === 0 ? 'M' : 'L'}${px(b.poblacion).toFixed(1)},${py(b.superior).toFixed(1)}`,
      )
      .join(' ') +
    ' ' +
    [...banda]
      .reverse()
      .map((b) => `L${px(b.poblacion).toFixed(1)},${py(b.inferior).toFixed(1)}`)
      .join(' ') +
    ' Z'
  const central = banda
    .map(
      (b, i) => `${i === 0 ? 'M' : 'L'}${px(b.poblacion).toFixed(1)},${py(b.esperado).toFixed(1)}`,
    )
    .join(' ')

  const resumen =
    `${muestra.length} municipios de la comunidad, sin nombre, como puntos: población contra ` +
    `gasto declarado, ambos en escala logarítmica. La banda sombreada es el intervalo de ` +
    `predicción del ${Math.round((1 - modelo.nivelAlfa) * 100)} %.` +
    (propia
      ? ` Riba-roja, el único punto con nombre: ${formateaEuros(propia.costeObservado)} observados ` +
        `contra ${formateaEuros(propia.esperado)} esperados, ${
          propia.dentroDeLoEsperado ? 'dentro' : 'FUERA'
        } de la banda.`
      : ' Riba-roja no tiene punto en este servicio.')

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      style={{ width: '100%', height: 'auto', display: 'block', marginTop: 10 }}
      role="img"
      aria-label={resumen}
    >
      {/* Rejilla y ejes: potencias de diez, en el tono más recesivo. */}
      {ticksLog(pobMin, pobMax).map((t) => (
        <g key={`x${t}`}>
          <line
            x1={px(t)}
            x2={px(t)}
            y1={MARGEN.arriba}
            y2={ALTO - MARGEN.abajo}
            stroke="var(--ink50)"
            opacity="0.14"
            strokeWidth="1"
          />
          <text
            x={px(t)}
            y={ALTO - 8}
            textAnchor="middle"
            className="mono"
            style={{ fontSize: 10, fill: 'var(--ink50)' }}
          >
            {etiquetaHabitantes(t)}
          </text>
        </g>
      ))}
      {ticksLog(costeMin, costeMax).map((t) => (
        <g key={`y${t}`}>
          <line
            x1={MARGEN.izq}
            x2={ANCHO - MARGEN.der}
            y1={py(t)}
            y2={py(t)}
            stroke="var(--ink50)"
            opacity="0.14"
            strokeWidth="1"
          />
          <text
            x={MARGEN.izq - 6}
            y={py(t) + 3}
            textAnchor="end"
            className="mono"
            style={{ fontSize: 10, fill: 'var(--ink50)' }}
          >
            {etiquetaEuros(t)}
          </text>
        </g>
      ))}

      {/* La banda primero: es contexto y todo lo demás va encima. */}
      <path d={area} fill="var(--intel)" opacity="0.1" stroke="none" />
      <path
        d={central}
        fill="none"
        stroke="var(--intel)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        opacity="0.75"
      />

      {/* La muestra: puntos sin identidad. El título repite las coordenadas y
          nada más — no hay nada más que decir de un punto anónimo. */}
      {muestra.map((p, i) => (
        <circle
          key={i}
          cx={px(p.poblacion)}
          cy={py(p.coste)}
          r="2.4"
          fill="var(--ink50)"
          opacity="0.4"
        >
          <title>{`≈${Math.round(p.poblacion).toLocaleString('es-ES')} hab · ${formateaEuros(p.coste)}`}</title>
        </circle>
      ))}

      {propia && (
        <g>
          <circle
            cx={px(propia.poblacion)}
            cy={py(propia.costeObservado)}
            r="5"
            fill="var(--civic)"
            stroke="var(--paper)"
            strokeWidth="1.5"
          >
            <title>{`Riba-roja de Túria: ${formateaEuros(propia.costeObservado)} observados · ${formateaEuros(propia.esperado)} esperados`}</title>
          </circle>
          <text
            x={px(propia.poblacion) + 9}
            y={py(propia.costeObservado) + 4}
            className="mono"
            style={{ fontSize: 11, fontWeight: 600, fill: 'var(--civic)' }}
          >
            Riba-roja
          </text>
        </g>
      )}
    </svg>
  )
}
