import { Card, Pill } from '../Primitives'
import { MARGEN_ANCLA } from '../SubnavSecciones'
import { useT } from '../../i18n'
import { BandaPares } from './BandaPares'
import { SerieServicio, enTerminosReales } from './SerieServicio'
import { TIER_TONE } from './Escalones'
import { leerIndicador, lecturaVisible, chipDeclaracion } from '../../scraper/indicador-lectura'
import { Lectura } from './Lectura'
import { Resultado } from './Resultado'
import { CompetenciaDelegada } from './CompetenciaDelegada'
import { Concesion } from './Concesion'
import { GESTION, MOTIVO } from './vocabulario'

export function ServicioCard({ indicador, formatea, resultado, competencia }) {
  const t = useT()
  const i = indicador
  const g = GESTION[i.modoGestion] ?? GESTION['sin-clasificar']
  const motivo = i.numerador.motivo ?? i.denominador.motivo
  const cita = i.citas?.[0]
  const lecturaEntera = leerIndicador(i)
  // `banda: true` no significa que la banda esté abierta (va plegada en
  // <details>): significa que la tarjeta imprime `donde` por su cuenta, unas
  // líneas más abajo, y <Lectura> no debe repetirlo.
  //
  // `cifra` ya no gobierna nada —`lecturaVisible` conserva siempre `que`— y se
  // sigue pasando porque describe la pantalla con verdad. Cuando `que` era la
  // cifra repetida con otro formato, callarla parecía correcto; el efecto fue
  // que la página se quedó sin ninguna frase que dijera qué significa
  // «81.965 €/efectivo», y un lector lo preguntó. Ahora glosa el divisor y
  // marca el gasto como anual, que es lo que ninguna cifra puede decir sola.
  const lectura = lecturaVisible(lecturaEntera, {
    cifra: i.valor !== null,
    banda: true,
  })
  const declarados = i.serie.filter((p) => p.estado === 'declarado')
  const serie = enTerminosReales(declarados)
  const puntos = declarados.length
  const chip = chipDeclaracion(i)
  // Avisos y salvedades comparten destino: los primeros los cuenta ahora el
  // gráfico (la tendencia es la forma; la entrega imposible, el ⚠ del borde), y
  // las segundas son el texto largo que se leía una vez y se saltaba nueve.
  const salvedades = [...lectura.avisos, ...(i.caveats ?? [])]
  const conRecuentoDeclaracion = Boolean(
    i.declaracion?.denominador?.congelada &&
    typeof i.declaracion.paresCongelados === 'number' &&
    typeof i.declaracion.paresMedibles === 'number',
  )
  const plegable =
    salvedades.length + (declarados.length >= 2 ? 1 : 0) + (conRecuentoDeclaracion ? 1 : 0)

  return (
    // El id es el destino de los enlaces del resumen de arriba; el margen de
    // scroll deja la cabecera de la tarjeta por debajo de las barras fijas
    // (topbar + submenú), y lo declara quien las monta.
    <Card id={`s-${i.id}`} style={{ scrollMarginTop: MARGEN_ANCLA }}>
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        {/* h3: la ficha vive dentro de un bloque de área (o de «sin coste
            unitario»), cuya cabecera es el h2. */}
        <h3 style={{ fontSize: 'var(--fs-head)', fontWeight: 650, margin: 0 }}>{i.etiqueta}</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* La marca del denominador parado va PRIMERA y en tono de aviso:
              es lo que condiciona cómo se lee todo lo demás de la tarjeta. */}
          {chip && <Pill tone="warn">{chip.texto}</Pill>}
          <Pill tone={g.tone}>{g.label}</Pill>
          <Pill tone={TIER_TONE[i.tier] ?? 'neutral'}>{t(`eficiencia.tier.${i.tier}`)}</Pill>
        </div>
      </div>

      {/* Un hecho sobre lo que el ayuntamiento declaró, sin plegar. Vivía en
          `caveats`, dentro del desplegable, y era la clase de frase que se lee
          una vez y se salta nueve: que la fuente traiga casilla de viajeros y
          aquí vaya a cero mientras 22 comparables la rellenan no es un matiz
          del cociente, es lo que la ficha tiene que contar. */}
      {i.avisoDeclaracion && (
        <p
          style={{
            margin: '10px 0 0',
            paddingLeft: 10,
            borderLeft: '3px solid var(--warn)',
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70, var(--ink50))',
            maxWidth: '62ch',
          }}
        >
          {i.avisoDeclaracion}
        </p>
      )}

      {i.valor !== null ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
            <span
              className="mono"
              style={{ fontSize: 'var(--fs-page)', fontWeight: 600, letterSpacing: '-.02em' }}
            >
              {formatea(i.valor)}
            </span>
          </div>
          <div
            className="mono"
            style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', marginTop: 2 }}
          >
            {i.numerador.valor.toLocaleString('es-ES', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            })}{' '}
            ÷ {i.denominador.valor.toLocaleString('es-ES')} {i.divisor.plural} · entrega{' '}
            {cita?.entrega}
          </div>

          {/* Qué es el número y cómo NO se lee, antes que dónde queda.

              El orden es el arreglo, no un detalle de maquetación. Estas dos
              frases vivían debajo del gráfico, de la banda y del panel de
              resultado —media pantalla más abajo—, así que el lector llegaba
              antes a «queda más alto que tres de cada cuatro» que a «esto es un
              precio, no un rendimiento», y para cuando leía la segunda ya había
              sacado su conclusión de la primera. El módulo que las escribe
              avisa en su propia cabecera de que «una cifra sola miente por
              vecindad»; la tarjeta hacía exactamente eso con ellas. */}
          <Lectura lectura={lectura} conAvisos={false} />

          {/* Y ahora sí la posición. Sale entera de leerIndicador: tramo sin
              ranking, mediana con unidad, o el «no hay comparación» con su
              porqué. */}
          {lecturaEntera.donde && (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 'var(--fs-aux)',
                color: 'var(--ink70, var(--ink50))',
                maxWidth: '58ch',
              }}
            >
              {lecturaEntera.donde}
            </p>
          )}

          {/* La serie va dibujada, con las entregas inverosímiles fuera de la
              escala y marcadas donde estaban. Las cifras exactas, año por año,
              siguen en el desplegable de abajo.

              Va en euros constantes de la entrega que titula. El rótulo no es
              decorativo: una serie de coste en corrientes y otra deflactada se
              dibujan igual, y sólo una de las dos se puede leer. Si falta el
              índice de algún año se dice, y se dibujan los corrientes. */}
          <SerieServicio puntos={serie.puntos} formatea={formatea} unidad={i.unidad} />
          <div
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              marginTop: 6,
              textAlign: 'right',
            }}
          >
            {serie.reales
              ? `€ constantes de ${cita?.entrega}`
              : 'euros corrientes: falta el índice de algún año'}
          </div>

          <BandaPares indicador={i} formatea={formatea} />

          {/* El resultado, si esta funcion tiene uno: al lado, nunca dividido. */}
          <Resultado resultado={resultado} id={`r-${i.id}`} />
          {puntos < 2 && (
            <p style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', margin: '10px 0 0' }}>
              {t('eficiencia.serie.ausente')}
            </p>
          )}
        </>
      ) : (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, fontSize: 'var(--fs-aux)', color: 'var(--ink70, var(--ink50))' }}>
            {MOTIVO[motivo] ??
              'La fuente no permite calcular un coste unitario para este servicio.'}
          </p>
          {i.numerador.estado === 'declarado' && (
            <p
              className="mono"
              style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', margin: '8px 0 0' }}
            >
              Coste declarado:{' '}
              {i.numerador.valor.toLocaleString('es-ES', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              })}
            </p>
          )}
          {/* La tarjeta bloqueada no tiene cifra ni banda, así que aquí `que`
              ES el contenido: por qué no hay cociente. */}
          <Lectura lectura={lectura} conAvisos={false} />

          {/* Y quién cobra. «Está concedido» explica por qué la celda está
              vacía, pero deja al lector con la mitad: la otra mitad es a quién
              se le paga y hasta cuándo. Sin esto, la ficha se lee como un dato
              que falta en vez de como lo que es —el dinero de este servicio no
              cruza los libros del ayuntamiento porque lo cobra otro del recibo
              del vecino—. */}
          <Concesion concesion={i.concesion} />
        </div>
      )}

      {/* Lo que la tarjeta guardaba abierto y nadie leía.

          Ninguna de estas frases se borra —son el contenido de esta página, no
          su letra pequeña—, pero tenerlas las diez abiertas a la vez daba trece
          pantallas de las que diez eran repetición, y enterraba la salvedad de
          la tarjeta once bajo la de la tarjeta uno. Va en <details> y no
          desmontado: el texto sigue en el DOM, así que la búsqueda del
          navegador lo encuentra y lo despliega.

          El recuento en el resumen es la parte que hace que se abra: «(4)»
          promete algo concreto donde «ver más» no promete nada. */}
      {plegable > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-meta)', color: 'var(--civic)' }}>
            {declarados.length >= 2 ? 'Serie completa y salvedades' : 'Salvedades'} ({plegable})
          </summary>

          {declarados.length >= 2 && (
            <p
              className="mono"
              style={{
                fontSize: 'var(--fs-meta)',
                margin: '10px 0 0',
                color: 'var(--ink70, var(--ink50))',
              }}
            >
              {declarados.map((p, idx) => (
                <span key={p.anio}>
                  {idx > 0 && ' · '}
                  <span
                    style={
                      p.atipico
                        ? { color: 'var(--warn-ink)', textDecoration: 'underline dotted' }
                        : undefined
                    }
                    title={
                      p.atipico
                        ? // La mediana puede faltar: la cordura de la regla 7
                          // puede apoyarse en pares de cualquier modo cuando el
                          // del año no llega a quince, y ésos no se publican
                          // como comparación. formatea(undefined) tumbaba la
                          // página entera — y el skip-gate del e2e leyó el
                          // h1 ausente como «bandera apagada» y calló.
                          typeof p.medianaPares === 'number'
                          ? `Cifra inverosímil: los municipios comparables declararon una mediana de ${formatea(p.medianaPares)} ese año`
                          : 'Cifra inverosímil: se aparta más de veinte veces de lo declarado ese año, sin quince pares del mismo modo que citar (regla 7)'
                        : p.otroModo
                          ? `Ese año el servicio se prestaba en ${p.otroModo}: la cifra se publica pero no es comparable con la línea (regla 4)`
                          : undefined
                    }
                  >
                    {p.anio}: {formatea(p.valor)}
                    {p.atipico ? ' ⚠' : ''}
                  </span>
                </span>
              ))}
            </p>
          )}

          {/* Los recuentos de la declaración, como números y no sólo horneados
              dentro de una frase: `paresCongelados`/`paresMedibles` se
              calculaban y no los renderizaba nadie, así que la mitad de la
              salvedad —¿es un defecto local o de la fuente?— quedaba sin su
              dato. Derivado del snapshot; si el campo falta, la línea no sale. */}
          {conRecuentoDeclaracion && (
            <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', margin: '10px 0 0' }}>
              El denominador se declara idéntico desde{' '}
              <strong className="mono">{i.declaracion.denominador.desde}</strong> (
              <span className="mono">{i.declaracion.denominador.repeticionesFinales}</span> entregas
              seguidas) ·{' '}
              <strong className="mono">
                {i.declaracion.paresCongelados} de {i.declaracion.paresMedibles}
              </strong>{' '}
              comparables medibles hacen lo mismo.
            </p>
          )}

          {salvedades.length > 0 && (
            <ul
              style={{
                margin: '10px 0 0',
                paddingLeft: 18,
                color: 'var(--ink50)',
                fontSize: 'var(--fs-meta)',
              }}
            >
              {salvedades.map((c) => (
                <li key={c} style={{ marginBottom: 3 }}>
                  {c}
                </li>
              ))}
            </ul>
          )}
          <p style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', margin: '8px 0 0' }}>
            Las reglas numeradas que citan estas salvedades:{' '}
            <a href="/metodologia#reglas-eficiencia" style={{ color: 'var(--civic)' }}>
              reglas de filtrado y comparabilidad
            </a>
            .
          </p>
        </details>
      )}

      {cita && (
        <p
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', margin: '10px 0 0' }}
        >
          Fuente: coste efectivo {cita.entrega} ·{' '}
          <a
            href={cita.url}
            style={{ color: 'var(--civic)' }}
            target="_blank"
            rel="noreferrer noopener"
          >
            Ministerio de Hacienda ↗
          </a>
        </p>
      )}

      {/* Al final, y en las dos ramas: también las fichas sin cociente tienen
          quien responda de ellas —el agua y el alcantarillado sobre todo, que
          es donde el panel no ve nada—. Va aquí y no arriba a propósito: el
          docblock de CompetenciaDelegada explica por qué el nombre no puede
          preceder al aviso de escalón. */}
      <CompetenciaDelegada asignacion={competencia} />
    </Card>
  )
}
