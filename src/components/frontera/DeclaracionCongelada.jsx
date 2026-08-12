import { Card, Pill } from '../Primitives'

/**
 * El resultado más útil del experimento, y no es una puntuación.
 *
 * Va ARRIBA, antes que cualquier θ, porque cambia lo que significan todas las
 * cifras que vienen después. Un lector que llegue a la serie temporal sin haber
 * leído esto entenderá que el municipio empeoró; lo que dice el dato es que el
 * numerador se actualiza cada entrega y el denominador no.
 *
 * La comparación entre las dos magnitudes es lo que convierte esto en una
 * medición en vez de en una sospecha, así que las dos van en la misma frase.
 */
export function DeclaracionCongelada({ declaracion }) {
  if (!declaracion || !declaracion.unidadSeries) return null

  const { unidadSeries, unidadCongeladas, costeSeries, costeCongeladas, minEntregas, entregas } =
    declaracion
  const pctUnidad = Math.round((unidadCongeladas / unidadSeries) * 100)
  const pctCoste = costeSeries ? Math.round((costeCongeladas / costeSeries) * 100) : 0
  const propias = (declaracion.propias ?? []).filter((p) => p.magnitud === 'unidad')
  const propiasCongeladas = propias.filter((p) => p.congelada)

  return (
    <Card style={{ marginTop: 18, borderLeft: '3px solid var(--warn)' }}>
      <div
        className="mono"
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--ink50)',
        }}
      >
        Lo que hay que leer antes que ninguna cifra
      </div>
      <h2 style={{ fontSize: 17, fontWeight: 650, margin: '4px 0 8px', letterSpacing: '-.01em' }}>
        Casi nadie vuelve a medir el denominador
      </h2>

      <p style={{ margin: '0 0 10px', color: 'var(--ink70)', maxWidth: '64ch' }}>
        De las <span className="mono">{unidadSeries}</span> series de unidad física con al menos{' '}
        <span className="mono">{minEntregas}</span> entregas,{' '}
        <strong className="mono">{unidadCongeladas}</strong> ({pctUnidad} %) repiten exactamente el
        mismo valor entrega tras entrega hasta hoy. De las{' '}
        <span className="mono">{costeSeries}</span> series de coste, sólo{' '}
        <strong className="mono">{costeCongeladas}</strong> ({pctCoste} %). El dinero se actualiza
        cada año; las toneladas, los metros cuadrados y los puntos de luz, no.
      </p>

      <p style={{ margin: '0 0 10px', color: 'var(--ink70)', maxWidth: '64ch' }}>
        Eso vuelve inservible cualquier lectura temporal de un coste unitario: si el numerador se
        actualiza y el denominador es una copia, el cociente sólo puede subir, y sube porque nadie
        volvió a pesar la basura. No es una acusación —puede que la cifra sea correcta y estable—,
        es un dato sobre la calidad de la declaración, que es justo lo que hay que saber antes de
        dividir por ella.
      </p>

      {propias.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--ink50)',
              marginBottom: 6,
            }}
          >
            Riba-roja de Túria · {propiasCongeladas.length} de {propias.length} denominadores sin
            cambiar
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink50)' }}>
                <th style={{ padding: '4px 8px 4px 0', fontWeight: 500 }}>Servicio</th>
                <th style={{ padding: '4px 8px', fontWeight: 500, textAlign: 'right' }}>Valor</th>
                <th style={{ padding: '4px 8px', fontWeight: 500, textAlign: 'right' }}>
                  Sin cambiar desde
                </th>
                <th style={{ padding: '4px 0', fontWeight: 500 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {propias.map((p) => (
                <tr key={p.programa} style={{ borderTop: '1px solid var(--border2)' }}>
                  <td style={{ padding: '6px 8px 6px 0' }}>{p.programa}</td>
                  <td className="mono" style={{ padding: '6px 8px', textAlign: 'right' }}>
                    {p.valor === null ? '—' : p.valor.toLocaleString('es-ES')}
                  </td>
                  <td className="mono" style={{ padding: '6px 8px', textAlign: 'right' }}>
                    {p.congeladaDesde ?? '—'}
                  </td>
                  <td style={{ padding: '6px 0' }}>
                    <Pill tone={p.congelada ? 'warn' : 'ok'}>
                      {p.congelada ? `${p.repeticionesFinales} entregas iguales` : 'se actualiza'}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: 'var(--ink50)', marginTop: 8, marginBottom: 0 }}>
            Medido sobre {entregas} entregas del coste efectivo de los servicios. Una serie cuenta
            como sin cambiar cuando sus últimas {minEntregas} entregas o más traen el mismo valor
            hasta el cuarto decimal.
          </p>
        </div>
      )}
    </Card>
  )
}
