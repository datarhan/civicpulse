import { Card } from '../Primitives'
import {
  enTerminosReales,
  tramosSerie,
  bandaSerie,
  puentesHueco,
  escalaSerie,
  puntosSueltos,
  puntosOtroModo,
  puntosEnEscala,
} from './SerieServicio'
import { seriesDibujables, dominioComun, aniosSinEntrega } from './multiples'

/**
 * Trece décadas en una pantalla, en la MISMA retícula.
 *
 * La franja de posiciones dice dónde queda hoy cada coste; esta rejilla dice
 * por dónde vino. Son preguntas distintas —el punto y el camino— y por eso van
 * contiguas y en el mismo orden, no fundidas en un gráfico que no contestaría
 * ninguna.
 *
 * Cada mini-serie es el gráfico de su tarjeta reducido a lo que sobrevive a
 * 44 píxeles: la banda de comparables detrás, la línea delante, el puente
 * punteado sobre el año sin entrega y el ⚠ de la cifra inverosímil. Lo que no
 * cabe no se pierde: cada mini ancla a su ficha (#s-<id>), donde está entero.
 *
 * Dos decisiones de retícula, ambas para que «mismo sitio» signifique algo:
 *
 * - **El eje X es común.** La serie que empieza tarde deja hueco a la
 *   izquierda; alinear cada una a su primer año haría coincidir 2015 de una
 *   con 2014 de otra en el mismo píxel.
 * - **La escala vertical es propia.** €/efectivo, €/tonelada y €/m² no
 *   comparten magnitud; forzar una escala común aplastaría doce series para
 *   acomodar la más cara. El pie lo declara: las formas se comparan, las
 *   alturas no.
 */
const ALTO_MINI = 44

function MiniSerie({ indicador, declarados, formatea, x0, x1 }) {
  const serie = enTerminosReales(declarados)
  const puntos = serie.puntos
  const limpios = puntosEnEscala(puntos)
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
  const primero = limpios[0]
  const ultimo = limpios[limpios.length - 1]

  const resumen =
    `${indicador.etiqueta}: de ${formatea(primero.valor)} en ${primero.anio} ` +
    `a ${formatea(ultimo.valor)} en ${ultimo.anio}` +
    (serie.reales ? '' : ', en euros corrientes') +
    (atipicos.length
      ? `; ${atipicos.length === 1 ? 'una entrega inverosímil' : `${atipicos.length} entregas inverosímiles`} fuera de la escala (${atipicos.map((p) => p.anio).join(', ')})`
      : '') +
    '. Abre su ficha.'

  return (
    <a
      href={`#s-${indicador.id}`}
      aria-label={resumen}
      title={resumen}
      style={{
        display: 'block',
        color: 'inherit',
        textDecoration: 'none',
        borderRadius: 'var(--r-input)',
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'baseline',
          justifyContent: 'space-between',
          fontSize: 'var(--fs-micro)',
          lineHeight: 1.3,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--ink70, var(--ink50))',
          }}
        >
          {indicador.etiqueta}
        </span>
        {!serie.reales && (
          <span className="mono" style={{ color: 'var(--warn-ink)', flexShrink: 0 }}>
            corrientes
          </span>
        )}
      </span>

      <span
        aria-hidden="true"
        style={{ position: 'relative', display: 'block', height: ALTO_MINI, marginTop: 3 }}
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
    </a>
  )
}

export function MultiplesSeries({ indicadores = [], formateaCon }) {
  const dibujables = seriesDibujables(indicadores)
  if (dibujables.length < 2) return null

  const dominio = dominioComun(dibujables.map((s) => s.declarados))
  const sinEntrega = aniosSinEntrega(dibujables.map((s) => s.declarados))
  const todasReales = dibujables.every((s) => enTerminosReales(s.declarados).reales)
  const entrega = dibujables[0].indicador.citas?.[0]?.entrega

  return (
    <Card style={{ marginTop: 12 }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--ink50)',
        }}
      >
        La década, servicio a servicio
      </div>
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70, var(--ink50))',
        }}
      >
        Arriba, dónde queda hoy cada coste entre sus comparables; aquí, por dónde vino. Detrás de
        cada línea, sombreada, la mitad central de esos comparables. Cada mini-serie abre su ficha.
      </p>

      <div
        style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '14px 16px',
        }}
      >
        {dibujables.map((s) => (
          <MiniSerie
            key={s.indicador.id}
            indicador={s.indicador}
            declarados={s.declarados}
            formatea={formateaCon(s.indicador.unidad)}
            x0={dominio.x0}
            x1={dominio.x1}
          />
        ))}
      </div>

      {/* El pie es una sola línea corrida, sin años flanqueando la rejilla:
          un «2014 … 2024» a los bordes de la tarjeta diría que la FILA entera
          recorre la década, cuando quien la recorre es cada mini-serie. El
          dominio se dice con palabras y derivado del dato. */}
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          marginTop: 10,
          lineHeight: 1.5,
        }}
      >
        Cada serie recorre {dominio.x0}–{dominio.x1} ·{' '}
        {todasReales
          ? entrega
            ? `€ constantes de ${entrega} · `
            : ''
          : 'las marcadas, en euros corrientes · '}
        escala vertical propia: las formas se comparan, las alturas no
        {sinEntrega.length > 0 && <> · sin entrega de {sinEntrega.join(', ')}: tramo punteado</>}
      </div>
    </Card>
  )
}
