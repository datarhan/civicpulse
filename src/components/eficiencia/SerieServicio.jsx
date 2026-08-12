/**
 * Diez entregas de un coste unitario, dibujadas — y con lo que no se puede
 * dibujar dejado fuera en vez de aplastado dentro.
 *
 * La tarjeta traía la serie como párrafo de dígitos: «2015: 46.645 €/efectivo ·
 * 2016: 50.263 €/efectivo · …», treinta palabras de mono que ocupan tres líneas
 * y que nadie lee. El comentario que lo justificaba tenía razón en el
 * diagnóstico y no en la conclusión: limpieza viaria declara 67,7 millones de
 * euros por metro cuadrado en 2015, y eso aplasta cualquier escala. Pero la
 * salida no es renunciar al gráfico, es dejar esa entrega fuera de la escala y
 * marcarla donde estaba. El dato ya sabe cuál es: `atipico` viene por punto.
 *
 * Tres decisiones, y las tres son de honestidad más que de estética:
 *
 * 1. **El eje X es el AÑO, no la posición en el array.** Falta la entrega de
 *    2020 en todas las series, y repartir los puntos a intervalos iguales
 *    dibujaría una década de nueve años.
 * 2. **La línea se corta en los huecos.** Unir 2019 con 2021 con un tramo recto
 *    afirma una interpolación que nadie ha medido.
 * 3. **La mediana de los pares va detrás, punteada.** Ya está publicada por
 *    punto (`medianaPares`) y ya se describe en prosa —«pasa de 0,07 a 1,05
 *    veces la mediana»—; dibujarla es lo que convierte esa frase en algo que se
 *    ve. Alumbrado sube un 1517 % mientras la mediana de sus pares no se mueve:
 *    la forma cuenta que cambió cómo se declara, no cuánto cuesta.
 *
 * Las cifras exactas no desaparecen: siguen, año por año, en el desplegable de
 * la tarjeta. Esto es el resumen, no el sustituto.
 */

// La línea base en cero (ver `escalaSerie`) deja la serie en la franja alta de
// la caja, que es el precio honesto de no recortar el eje. Se paga con altura.
const ALTO = 58

/**
 * Tramos continuos de la serie.
 *
 * Rompe en las entregas inverosímiles y en los huecos del calendario, que son
 * las dos cosas sobre las que la línea no debe pasar por encima.
 */
export function tramosSerie(puntos) {
  const tramos = []
  let actual = []
  let prev = null
  for (const p of puntos) {
    if (p.atipico || typeof p.valor !== 'number') {
      if (actual.length) tramos.push(actual)
      actual = []
      prev = null
      continue
    }
    if (prev !== null && p.anio - prev > 1) {
      if (actual.length) tramos.push(actual)
      actual = []
    }
    actual.push(p)
    prev = p.anio
  }
  if (actual.length) tramos.push(actual)
  return tramos
}

/**
 * El rango vertical, SÓLO sobre lo que se dibuja.
 *
 * Es la decisión que hace posible el gráfico. Meter aquí los 67,7 millones de
 * euros por metro cuadrado que el ministerio publica para limpieza viaria en
 * 2015 dejaría las otras nueve entregas pegadas al suelo, en una línea plana que
 * diría que ese coste nunca se movió.
 */
export function escalaSerie(puntos) {
  const limpios = puntos.filter((p) => !p.atipico && typeof p.valor === 'number')
  const valores = [
    ...limpios.map((p) => p.valor),
    ...limpios.filter((p) => typeof p.medianaPares === 'number').map((p) => p.medianaPares),
  ]
  if (!valores.length) return null
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const margen = (max - min) * 0.12 || Math.abs(max) * 0.12 || 1
  // Un coste unitario no baja de cero, así que la línea base es cero. Recortar
  // el eje por abajo para que la serie llene la caja es el truco clásico de
  // exagerar un cambio, y aquí la salvedad de al lado ya dice el porcentaje: el
  // dibujo no tiene por qué contarlo más grande que el texto.
  return { lo: min >= 0 ? 0 : min - margen, hi: max + margen }
}

export function SerieServicio({ puntos, formatea, unidad }) {
  const limpios = puntos.filter((p) => !p.atipico && typeof p.valor === 'number')
  if (limpios.length < 2) return null

  const conMediana = limpios.filter((p) => typeof p.medianaPares === 'number')
  const anios = puntos.map((p) => p.anio)
  const x0 = Math.min(...anios)
  const x1 = Math.max(...anios)
  const anchoAnios = x1 - x0 || 1
  const px = (anio) => ((anio - x0) / anchoAnios) * 100

  const { lo: y0, hi: y1 } = escalaSerie(puntos)
  const py = (v) => 100 - ((v - y0) / (y1 - y0 || 1)) * 100

  const camino = (tramo, leer) =>
    tramo
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${px(p.anio).toFixed(2)},${py(leer(p)).toFixed(2)}`)
      .join(' ')

  const tramos = tramosSerie(puntos)
  const tramosMediana = tramosSerie(
    puntos.map((p) => (typeof p.medianaPares === 'number' ? { ...p, valor: p.medianaPares } : p)),
  )
  const atipicos = puntos.filter((p) => p.atipico)
  const ultimo = limpios[limpios.length - 1]
  const primero = limpios[0]

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ position: 'relative', height: ALTO }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
          role="img"
          aria-label={
            `Serie de ${limpios.length} entregas: ${formatea(primero.valor)} en ${primero.anio}, ` +
            `${formatea(ultimo.valor)} en ${ultimo.anio}.` +
            (atipicos.length
              ? ` ${atipicos.length} entrega${atipicos.length > 1 ? 's' : ''} publicada${
                  atipicos.length > 1 ? 's' : ''
                } con cifras que no pueden ser un coste, fuera de la escala: ${atipicos
                  .map((p) => p.anio)
                  .join(', ')}.`
              : '') +
            (conMediana.length >= 2 ? ' Al fondo, la mediana de los municipios comparables.' : '')
          }
        >
          {tramosMediana
            .filter((t) => t.length >= 2)
            .map((t) => (
              <path
                key={`m${t[0].anio}`}
                d={camino(t, (p) => p.medianaPares)}
                stroke="var(--ink40, rgba(127,127,127,.55))"
                strokeWidth="1"
                strokeDasharray="3 3"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          {tramos
            .filter((t) => t.length >= 2)
            .map((t) => (
              <path
                key={t[0].anio}
                d={camino(t, (p) => p.valor)}
                stroke="var(--civic)"
                strokeWidth="1.75"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
        </svg>

        {/* Los marcadores van en HTML y no en el SVG: con preserveAspectRatio
            «none» un círculo se estira a elipse, y aquí el ancho lo pone la
            tarjeta. */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${px(ultimo.anio)}%`,
            top: `${py(ultimo.valor)}%`,
            width: 6,
            height: 6,
            marginLeft: -3,
            marginTop: -3,
            borderRadius: 999,
            background: 'var(--civic)',
          }}
        />
        {atipicos.map((p) => (
          // Fuera de la escala, en el borde, y visiblemente no en la línea: la
          // cifra es oficial y por eso no se esconde, pero no se puede leer
          // como coste y por eso no se dibuja como uno.
          <span
            key={p.anio}
            className="mono"
            title={`${p.anio}: ${formatea(p.valor)} — cifra inverosímil, fuera de la escala`}
            style={{
              position: 'absolute',
              left: `${px(p.anio)}%`,
              top: 0,
              transform: 'translateX(-50%)',
              fontSize: 10,
              color: 'var(--warn-ink)',
              lineHeight: 1,
            }}
          >
            ⚠
          </span>
        ))}
      </div>

      <div
        className="mono"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--ink50)',
          marginTop: 4,
        }}
      >
        <span>{x0}</span>
        <span>
          {conMediana.length >= 2 ? '- - - mediana de comparables · ' : ''}
          {unidad}
        </span>
        <span>{x1}</span>
      </div>
    </div>
  )
}
