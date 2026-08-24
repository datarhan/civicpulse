import { Card } from '../Primitives'

/**
 * Los diez servicios en una pantalla, antes de las diez fichas.
 *
 * La página preguntaba «¿cuánto cuesta y qué se obtiene?» y hacía leer trece
 * pantallas para contestarlo. Los percentiles estaban todos calculados y no
 * aparecían juntos en ningún sitio: había que recorrer las tarjetas una a una
 * para descubrir que policía y colegios son los dos caros y residuos y jardines
 * los dos baratos. Eso es una historia de un vistazo servida como maratón.
 *
 * NO introduce ninguna afirmación nueva. Cada punto es el `pares.percentil` que
 * su propia ficha ya publica, y el total es la suma de los costes efectivos que
 * el ministerio declara para esos mismos servicios en la misma entrega.
 *
 * Dos cosas que deliberadamente NO hace:
 *
 * - **No colorea.** Un punto rojo a la derecha convertiría «percentil 85» en un
 *   suspenso, y un coste por efectivo alto no es un suspenso: es un cuerpo mejor
 *   pagado o una plantilla más pequeña. El eje dice «más barato / más caro», que
 *   es lo que el percentil sostiene, y ahí se acaba.
 * - **No suma ni promedia posiciones.** Una media de percentiles sería la nota
 *   global que esta página se niega a publicar, por la puerta de atrás.
 *   La cabecera de la página CUENTA lados de la mediana («6 ↓ · 6 ↑»), y contar
 *   no es promediar: la única definición de «por debajo» vive en
 *   `particionPosiciones` (indicador-areas.ts) y la comparten la cabecera y
 *   las mini-frases de área, para que dos recuentos no puedan divergir en el
 *   50 exacto.
 */
export function ResumenPosiciones({ indicadores = [] }) {
  const conRatio = indicadores.filter((i) => i.valor !== null)
  if (conRatio.length === 0) return null

  const situados = conRatio
    .filter((i) => i.pares)
    .sort((a, b) => b.pares.percentil - a.pares.percentil)
  const sinSituar = conRatio.length - situados.length
  if (situados.length === 0) return null

  const total = conRatio.reduce((s, i) => s + (i.numerador.valor ?? 0), 0)
  const entrega = conRatio[0].citas?.[0]?.entrega

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
        Dónde queda cada servicio
      </div>
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70, var(--ink50))',
        }}
      >
        Los <strong className="mono">{conRatio.length}</strong> servicios con coste unitario
        declaran{' '}
        <strong className="mono">
          {total.toLocaleString('es-ES', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0,
          })}
        </strong>{' '}
        de coste efectivo en la entrega de <span className="mono">{entrega}</span> — no es el gasto
        del ayuntamiento, son estos {conRatio.length}. Cada punto es uno, situado entre sus
        comparables.
      </p>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {situados.map((i) => (
          <a
            key={i.id}
            href={`#s-${i.id}`}
            aria-label={`${i.etiqueta}: percentil ${i.pares.percentil} entre ${i.pares.n} municipios comparables`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) clamp(96px, 34%, 280px) 34px',
              gap: 10,
              alignItems: 'center',
              padding: '3px 0',
              color: 'inherit',
              textDecoration: 'none',
              borderRadius: 'var(--r-input)',
            }}
          >
            <span style={{ fontSize: 'var(--fs-meta)', lineHeight: 1.25 }}>{i.etiqueta}</span>

            {/* La pista es decoración de la cifra que va al lado: el percentil
                está escrito, así que un lector de pantalla no pierde nada. */}
            <span
              aria-hidden="true"
              style={{
                position: 'relative',
                height: 12,
                background: 'var(--soft)',
                borderRadius: 'var(--r-pill)',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 1,
                  bottom: 1,
                  width: 1,
                  background: 'var(--ink50, rgba(127,127,127,.45))',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: `${i.pares.percentil}%`,
                  top: 1,
                  width: 10,
                  height: 10,
                  marginLeft: -5,
                  borderRadius: 'var(--r-pill)',
                  background: 'var(--civic)',
                }}
              />
            </span>

            <span
              className="mono"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', textAlign: 'right' }}
            >
              p{i.pares.percentil}
            </span>
          </a>
        ))}
      </div>

      <div
        className="mono"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) clamp(96px, 34%, 280px) 34px',
          gap: 10,
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          marginTop: 4,
        }}
      >
        <span />
        <span style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>más barato</span>
          <span>más caro</span>
        </span>
        <span />
      </div>

      {sinSituar > 0 && (
        <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
          {sinSituar === 1
            ? 'Un servicio más tiene coste unitario pero no llega a quince municipios comparables, así que no se sitúa.'
            : `${sinSituar} servicios más tienen coste unitario pero no llegan a quince municipios comparables, así que no se sitúan.`}
        </p>
      )}
    </Card>
  )
}
