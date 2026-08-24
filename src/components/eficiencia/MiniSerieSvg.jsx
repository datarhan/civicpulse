import {
  tramosSerie,
  bandaSerie,
  puentesHueco,
  puntosSueltos,
  puntosOtroModo,
  puntosEnEscala,
  escalaSerie,
  serieMediana,
} from './SerieServicio'

/**
 * La década de un servicio en un dibujo pequeño, con la mediana de sus
 * comparables detrás.
 *
 * Sale de `MultiplesSeries`, donde vivía metido dentro de la rejilla, porque el
 * libro de servicios lo necesita dentro de una celda. Copiarlo habría dejado
 * dos vocabularios de dibujo para la misma serie: continuo es medido, punteado
 * es no medido, la banda al 8 % es la mitad central de los comparables, el
 * anillo hueco es una entrega de otro modo de gestión y el ⚠ es una entrega
 * inverosímil, pinchada arriba o abajo según por dónde se sale de la escala.
 *
 * La escala vertical es PROPIA de cada serie: €/efectivo, €/tonelada y €/m² no
 * comparten magnitud, así que las formas se comparan y las alturas no. Quien lo
 * use debe decirlo donde el lector lo vea.
 *
 * `aria-hidden`: el dibujo no lleva la información, la lleva el texto que el
 * llamante imprime al lado. Un `img` con etiqueta aquí duplicaría la frase.
 */
export function MiniSerieSvg({ puntos, x0, x1, alto = 44, conMediana = false }) {
  const limpios = puntosEnEscala(puntos)
  if (limpios.length < 2) return null
  const anchoAnios = x1 - x0 || 1
  const px = (anio) => ((anio - x0) / anchoAnios) * 100
  const { lo: y0, hi: y1 } = escalaSerie(puntos)
  const py = (v) => 100 - ((v - y0) / (y1 - y0 || 1)) * 100

  const tramos = tramosSerie(puntos)
  const bandas = bandaSerie(puntos)
  const puentes = puentesHueco(puntos)
  const sueltos = puntosSueltos(puntos)
  const otrosModos = puntosOtroModo(puntos)
  const atipicos = puntos.filter((p) => p.atipico)
  const ultimo = limpios[limpios.length - 1]

  // La mediana de los comparables, punteada y en gris: es la que contesta «¿es
  // que sube el coste, o es que se declara otra cosa?». Sin ella la línea sola
  // se lee como gestión, que es justo lo que esta página no puede afirmar.
  const mediana = conMediana
    ? tramosSerie(
        serieMediana(puntos).map((p) => ({
          ...p,
          estado: p.valor === null ? 'ausente' : 'declarado',
        })),
      )
    : []

  return (
    <span
      aria-hidden="true"
      style={{ position: 'relative', display: 'block', height: alto, marginTop: 0 }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
      >
        {bandas.map((t) => (
          <path
            key={`b${t[0].anio}`}
            d={
              t
                .map(
                  (p, idx) =>
                    `${idx === 0 ? 'M' : 'L'}${px(p.anio).toFixed(2)},${py(p.p75Pares).toFixed(2)}`,
                )
                .join(' ') +
              ' ' +
              [...t]
                .reverse()
                .map((p) => `L${px(p.anio).toFixed(2)},${py(p.p25Pares).toFixed(2)}`)
                .join(' ') +
              ' Z'
            }
            fill="var(--civic)"
            opacity="0.08"
            stroke="none"
          />
        ))}
        {mediana
          .filter((t) => t.length >= 2)
          .map((t) => (
            <path
              key={`md${t[0].anio}`}
              d={t
                .map(
                  (p, idx) =>
                    `${idx === 0 ? 'M' : 'L'}${px(p.anio).toFixed(2)},${py(p.valor).toFixed(2)}`,
                )
                .join(' ')}
              stroke="var(--ink30)"
              strokeWidth="1"
              strokeDasharray="3 3"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        {puentes.map((p) => (
          <path
            key={`pu${p.desde.anio}`}
            d={`M${px(p.desde.anio).toFixed(2)},${py(p.desde.valor).toFixed(2)} L${px(p.hasta.anio).toFixed(2)},${py(p.hasta.valor).toFixed(2)}`}
            stroke="var(--civic)"
            strokeWidth="1"
            strokeDasharray="1.5 3"
            strokeLinecap="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {tramos
          .filter((t) => t.length >= 2)
          .map((t) => (
            <path
              key={t[0].anio}
              d={t
                .map(
                  (p, idx) =>
                    `${idx === 0 ? 'M' : 'L'}${px(p.anio).toFixed(2)},${py(p.valor).toFixed(2)}`,
                )
                .join(' ')}
              stroke="var(--civic)"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
      </svg>

      <span
        style={{
          position: 'absolute',
          left: `${px(ultimo.anio)}%`,
          top: `${py(ultimo.valor)}%`,
          width: 5,
          height: 5,
          marginLeft: -2.5,
          marginTop: -2.5,
          borderRadius: 'var(--r-pill)',
          background: 'var(--civic)',
        }}
      />
      {sueltos.map((p) => (
        <span
          key={`solo${p.anio}`}
          style={{
            position: 'absolute',
            left: `${px(p.anio)}%`,
            top: `${py(p.valor)}%`,
            width: 4,
            height: 4,
            marginLeft: -2,
            marginTop: -2,
            borderRadius: 'var(--r-pill)',
            background: 'var(--civic)',
          }}
        />
      ))}
      {otrosModos.map((p) => (
        <span
          key={`om${p.anio}`}
          style={{
            position: 'absolute',
            left: `${px(p.anio)}%`,
            top: `${py(p.valor)}%`,
            width: 6,
            height: 6,
            marginLeft: -3,
            marginTop: -3,
            borderRadius: 'var(--r-pill)',
            background: 'var(--paper)',
            border: '1.5px solid var(--civic)',
            boxSizing: 'border-box',
          }}
        />
      ))}
      {atipicos.map((p) => (
        <span
          key={`at${p.anio}`}
          className="mono"
          style={{
            position: 'absolute',
            left: `${px(p.anio)}%`,
            ...(p.valor > y1 ? { top: -2 } : { bottom: -2 }),
            transform: 'translateX(-50%)',
            fontSize: 'var(--fs-micro)',
            color: 'var(--warn-ink)',
            lineHeight: 1,
          }}
        >
          ⚠
        </span>
      ))}
    </span>
  )
}
