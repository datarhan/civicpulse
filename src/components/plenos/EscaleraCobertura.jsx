import { Card } from '../Primitives'

const TONO_BARRA = {
  civic: 'var(--civic)',
  intel: 'var(--intel)',
  warn: 'var(--warn)',
}

/**
 * «Qué tenemos del acta»: cuatro escalones sobre el mismo denominador.
 *
 * NO están anidados, y la tarjeta lo dice cuando no lo están. El orden del día
 * lo trae regmeet y las declaraciones la transcripción: son dos tuberías
 * independientes, así que una sesión puede tener transcripción sin acta. El pie
 * afirmaba lo contrario mientras la tabla de al lado enseñaba las cuatro
 * sesiones que lo desmienten.
 *
 * Es la respuesta al hallazgo central de la auditoría — el índice contaba
 * cosas sin decir nunca sobre cuántas sesiones las contaba, así que la única
 * lectura posible de una columna vacía era «no pasó nada». La escalera pone el
 * denominador arriba del todo y en la misma tarjeta que los numeradores.
 *
 * Las barras van de RELLENO, así que usan el tono base y no el `-ink`: los
 * tonos semánticos base no se redefinen en oscuro precisamente porque su
 * trabajo es pintar, no escribir.
 */
export function EscaleraCobertura({ escalera, excepciones }) {
  if (!escalera?.length) return null
  const sueltas = (excepciones?.declSinOrden ?? 0) + (excepciones?.votosSinDecl ?? 0)
  return (
    <Card style={{ padding: '18px 20px' }}>
      <div
        style={{
          fontSize: 'var(--fs-meta)',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '.05em',
          color: 'var(--ink50)',
        }}
      >
        Qué tenemos del acta
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 13 }}>
        {escalera.map((e) => (
          <div key={e.id}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>{e.rotulo}</span>
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-meta)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  flex: 'none',
                }}
              >
                {e.n === e.de ? e.n : `${e.n} de ${e.de}`}
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 'var(--r-input)',
                background: 'var(--soft)',
                marginTop: 5,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(e.cuota * 100).toFixed(1)}%`,
                  background: TONO_BARRA[e.tono] || 'var(--civic)',
                  borderRadius: 'var(--r-input)',
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <p
        style={{
          margin: '13px 0 0',
          paddingTop: 11,
          borderTop: '1px solid var(--border2)',
          fontSize: 'var(--fs-micro)',
          lineHeight: 1.5,
          color: 'var(--ink50)',
        }}
      >
        Los cuatro escalones se cuentan sobre las mismas {escalera[0]?.de ?? 0} sesiones, pero no
        están anidados:{' '}
        {sueltas > 0 ? (
          <>
            {excepciones.declSinOrden > 0 && (
              <>
                {excepciones.declSinOrden === 1
                  ? 'una sesión tiene declaraciones extraídas sin su orden del día'
                  : `${excepciones.declSinOrden} sesiones tienen declaraciones extraídas sin su orden del día`}
              </>
            )}
            {excepciones.declSinOrden > 0 && excepciones.votosSinDecl > 0 && ', y '}
            {excepciones.votosSinDecl > 0 && (
              <>
                {excepciones.votosSinDecl === 1
                  ? 'una tiene votaciones sin declaraciones'
                  : `${excepciones.votosSinDecl} tienen votaciones sin declaraciones`}
              </>
            )}
            . El orden del día lo publica regmeet y las declaraciones salen de la transcripción, así
            que una sesión puede tener lo segundo sin lo primero.
          </>
        ) : (
          <>
            hoy cada escalón resulta ser un subconjunto del anterior, pero es una coincidencia de la
            cobertura, no una garantía: el orden del día lo publica regmeet y las declaraciones
            salen de la transcripción.
          </>
        )}{' '}
        La cobertura sube cuando se transcribe una sesión antigua, no cuando el pleno se reúne.
      </p>
    </Card>
  )
}
