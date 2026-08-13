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
 * 2. **El hueco se cruza punteado, no continuo.** Unir 2019 con 2021 con un
 *    tramo macizo afirmaría una interpolación que nadie ha medido; el convenio
 *    de siempre —continuo es medido, punteado no— dice lo que de verdad pasa, y
 *    el año va rotulado debajo para que se sepa cuál falta. Se probó antes
 *    dejarlo en blanco (se leía como una imagen rota) y con un bloque relleno
 *    (se leía como una barra, o sea como un valor enorme).
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
 * Los años sin entrega dentro del tramo publicado.
 *
 * La línea se rompía en el hueco —correcto: unir 2019 con 2021 afirmaría una
 * interpolación que nadie ha medido— pero nada decía por qué. Y como las diez
 * series carecen exactamente del mismo año, las diez tarjetas se partían por el
 * mismo sitio, que es justo lo que hace que un dato parezca una avería de
 * dibujo. Una señal deliberada que todo el mundo lee como rotura es una señal
 * fallida.
 *
 * Un año atípico NO es un hueco: la entrega existe y su cifra está publicada,
 * sólo que fuera de la escala y con su propia marca. Meterlos en el mismo saco
 * diría que el ministerio no publicó 2018 de alumbrado, y sí lo publicó.
 */
export function huecosSerie(puntos) {
  const anios = puntos.map((p) => p.anio).sort((a, b) => a - b)
  if (anios.length < 2) return []
  const presentes = new Set(anios)
  const huecos = []
  let actual = null
  for (let a = anios[0] + 1; a < anios[anios.length - 1]; a++) {
    if (presentes.has(a)) {
      if (actual) huecos.push(actual)
      actual = null
      continue
    }
    if (actual) actual.hasta = a
    else actual = { desde: a, hasta: a }
  }
  if (actual) huecos.push(actual)
  return huecos
}

/**
 * Los dos años PINTADOS que abrazan un hueco.
 *
 * La banda tiene que ocupar el hueco entero, de punto a punto, y no el año que
 * falta: medido sobre la página publicada, un hueco de 2020 deja 181 px entre
 * el final de la línea en 2019 y su reanudación en 2021, y una banda de 2019,5
 * a 2020,5 son 90 px flotando en el centro con blanco a los dos lados. Se leía
 * como un rectángulo gris suelto en vez de como «aquí no hay entrega», que es
 * exactamente el defecto que la banda venía a arreglar.
 *
 * `desde - 1` y `hasta + 1` están pintados siempre por construcción: un hueco
 * sólo se declara ENTRE dos años presentes, y los que faltan van agrupados.
 */
export function anclasHueco(hueco) {
  return { izq: hueco.desde - 1, der: hueco.hasta + 1 }
}

/**
 * El tramo punteado que cruza un año sin entrega.
 *
 * Se resistió al principio —unir 2019 con 2021 afirma una interpolación que
 * nadie ha medido— y la objeción valía para una línea CONTINUA, no para el
 * convenio de toda la vida: continuo es medido, punteado es no medido. Sin nada
 * que cruce, el corte se lee como una imagen rota (así empezó esto); con un
 * bloque relleno, como una barra. Un punteado dice justo lo que pasa, y el año
 * sigue rotulado debajo para que se sepa QUÉ falta.
 *
 * Nunca ancla en una entrega inverosímil. Su cifra está fuera de la escala a
 * propósito, así que un puente hasta ella dibujaría una pendiente hacia un valor
 * que la propia tarjeta declara ilegible. Cuando eso pasa no hay puente, y el
 * rótulo del año se queda solo.
 */
export function puentesHueco(puntos) {
  const legibles = new Map(
    puntos.filter((p) => !p.atipico && typeof p.valor === 'number').map((p) => [p.anio, p]),
  )
  return huecosSerie(puntos)
    .map((h) => {
      const { izq, der } = anclasHueco(h)
      const a = legibles.get(izq)
      const b = legibles.get(der)
      return a && b ? { desde: a, hasta: b } : null
    })
    .filter(Boolean)
}

/**
 * La serie de la MEDIANA DE PARES, que no es la nuestra con otro valor.
 *
 * Se construía con `{...p, valor: p.medianaPares}`, y eso arrastraba dos cosas
 * que no le pertenecen:
 *
 * 1. **`atipico`**, que es una propiedad de NUESTRA entrega. La mediana de los
 *    comparables de 2018 es una cifra perfectamente buena; que la de Riba-roja
 *    ese año sea 1,01 €/punto de luz no la estropea. La línea gris se cortaba
 *    ahí sin motivo, en el único servicio donde más falta hace ver contra qué
 *    se compara.
 * 2. **el valor del servicio** cuando no había mediana: el punto entraba tal
 *    cual, así que la línea de la mediana habría dibujado nuestra propia cifra
 *    haciéndola pasar por la de los pares. Hoy todos los puntos publicados
 *    traen mediana, así que no se ve; es una trampa esperando a la primera
 *    entrega que no la traiga.
 *
 * Aquí sólo entran años con mediana declarada, y sin más equipaje.
 */
export function serieMediana(puntos) {
  return puntos.map((p) => ({
    anio: p.anio,
    valor: typeof p.medianaPares === 'number' ? p.medianaPares : null,
  }))
}

/**
 * Entregas limpias que quedan aisladas y a las que una línea no llega.
 *
 * Alumbrado publica 11,31 €/punto de luz en 2019, verificado contra sus pares y
 * sin marcar como inverosímil — y no aparecía en el gráfico. Queda entre la
 * entrega imposible de 2018 y el año sin entrega de 2020, así que su tramo mide
 * un punto y el render descartaba los tramos de menos de dos. Una cifra
 * publicada que no se dibuja en ningún sitio es el mismo defecto que el hueco
 * sin rotular, un nivel más abajo: el dato está y la página no lo enseña.
 *
 * Se pintan como lunar. Un punto sin línea es exactamente lo que son.
 */
export function puntosSueltos(puntos) {
  return tramosSerie(puntos)
    .filter((t) => t.length === 1)
    .map((t) => t[0])
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
  const mediana = serieMediana(puntos)
  const tramosMediana = tramosSerie(mediana)
  const puentesMediana = puentesHueco(mediana)
  const atipicos = puntos.filter((p) => p.atipico)
  const huecos = huecosSerie(puntos)
  const ultimo = limpios[limpios.length - 1]
  const primero = limpios[0]
  const nombraHueco = (h) => (h.desde === h.hasta ? `${h.desde}` : `${h.desde}–${h.hasta}`)

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ position: 'relative', height: ALTO }}>
        {/* La banda del año que falta, DEBAJO de la línea.

            Sin ella el corte se lee como una imagen rota, y con más motivo aquí
            que en cualquier otro sitio: las diez series carecen del mismo año,
            así que las diez tarjetas se parten por el mismo punto. El año va
            escrito, pegado al suelo del gráfico, para que se lea como una
            anotación del eje y no como el valor de ese año. */}
        {huecos.map((h) => (
          <span
            key={h.desde}
            title={`No hay entrega de ${nombraHueco(h)} en este panel: el ministerio la publicó, pero aquí no se ha obtenido. La línea no la cruza porque interpolarla sería inventarla.`}
            style={{
              position: 'absolute',
              left: `${px(anclasHueco(h).izq)}%`,
              width: `${px(anclasHueco(h).der) - px(anclasHueco(h).izq)}%`,
              // Sólo el rótulo, pegado al suelo. Sin relleno y sin regla.
              //
              // Fue primero un rectángulo gris de arriba abajo, y un rectángulo
              // relleno dentro de un gráfico de líneas es la gramática de una
              // BARRA: en recogida de residuos se leía como que 2020 tuvo un
              // valor enorme, lo contrario de lo que significa. Luego una regla
              // punteada al ras del suelo, que ya no engañaba pero seguía
              // subrayando el vacío. Ahora la forma la lleva el puente
              // punteado, y aquí sólo queda decir QUÉ año falta.
              bottom: 0,
              height: 12,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 9,
                color: 'var(--ink50)',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                // Tapa el punteado por detrás. En alumbrado el puente cae justo
                // a la altura del rótulo y la línea le pasaba por encima de las
                // cifras; un rótulo sobre una línea necesita fondo o no se lee.
                background: 'var(--paper)',
                padding: '0 3px',
                borderRadius: 2,
              }}
            >
              {nombraHueco(h)}
            </span>
          </span>
        ))}
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
            (huecos.length
              ? ` Sin entrega de ${huecos.map(nombraHueco).join(' ni ')}: ese tramo va punteado porque nadie lo midió.`
              : '') +
            (conMediana.length >= 2 ? ' Al fondo, la mediana de los municipios comparables.' : '')
          }
        >
          {/* El puente de la mediana, con el mismo criterio que el de la
              serie: más fino y punteado corto, para que se distinga del rayado
              largo de los tramos que sí están medidos. */}
          {puentesMediana.map((p) => (
            <path
              key={`pm-${p.desde.anio}`}
              d={`M${px(p.desde.anio).toFixed(2)},${py(p.desde.valor).toFixed(2)} L${px(p.hasta.anio).toFixed(2)},${py(p.hasta.valor).toFixed(2)}`}
              stroke="var(--ink50, rgba(127,127,127,.55))"
              strokeWidth="0.75"
              strokeDasharray="1 3"
              strokeLinecap="round"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {tramosMediana
            .filter((t) => t.length >= 2)
            .map((t) => (
              <path
                key={`m${t[0].anio}`}
                d={camino(t, (p) => p.valor)}
                stroke="var(--ink50, rgba(127,127,127,.55))"
                strokeWidth="1"
                strokeDasharray="3 3"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          {/* El puente va DEBAJO de los tramos medidos y más fino: si se
              cruzan, manda la línea de verdad. Azul como la serie —es la misma
              serie— y punteado corto, distinto del rayado largo y gris de la
              mediana de pares, para que no se confundan. */}
          {puentesHueco(puntos).map((p) => (
            <path
              key={`puente-${p.desde.anio}`}
              d={`M${px(p.desde.anio).toFixed(2)},${py(p.desde.valor).toFixed(2)} L${px(p.hasta.anio).toFixed(2)},${py(p.hasta.valor).toFixed(2)}`}
              stroke="var(--civic)"
              strokeWidth="1.25"
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
        {/* Las entregas que ninguna línea alcanza. Mismo color que la línea:
            son la serie, no una anomalía. */}
        {puntosSueltos(puntos).map((p) => (
          <span
            key={`solo-${p.anio}`}
            title={`${p.anio}: ${formatea(p.valor)} — entrega aislada: la anterior no se puede leer como coste y la siguiente no existe, así que no hay línea que la una a nada.`}
            style={{
              position: 'absolute',
              left: `${px(p.anio)}%`,
              top: `${py(p.valor)}%`,
              width: 5,
              height: 5,
              marginLeft: -2.5,
              marginTop: -2.5,
              borderRadius: 999,
              background: 'var(--civic)',
            }}
          />
        ))}
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
              // Arriba si se sale por arriba, abajo si se sale por abajo.
              //
              // Iba siempre arriba, y para alumbrado eso era engañoso: su
              // entrega imposible de 2018 es 1,01 €/punto de luz, o sea
              // ridículamente BAJA, y la marca en el techo la insinuaba altísima.
              // No es un punto de la serie —por eso no va sobre la línea— pero
              // el lado por el que se sale sí es un hecho.
              ...(p.valor > y1 ? { top: 0 } : { bottom: 16 }),
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
