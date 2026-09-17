import { Card } from '../Primitives'
import { useT } from '../../i18n'
import { rellena } from '../../lib/formatters'

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
  const t = useT()
  if (!escalera?.length) return null
  // Cada excepción en singular o en plural, y las dos unidas con la conjunción del
  // idioma. Un escalón a cero no se nombra.
  const declSinOrden = excepciones?.declSinOrden ?? 0
  const votosSinDecl = excepciones?.votosSinDecl ?? 0
  const excepcionesNombradas = [
    declSinOrden === 1 && t('plenos.indice.escalera.declSinOrden.uno'),
    declSinOrden > 1 &&
      rellena(t('plenos.indice.escalera.declSinOrden.varios'), { n: declSinOrden }),
    votosSinDecl === 1 && t('plenos.indice.escalera.votosSinDecl.uno'),
    votosSinDecl > 1 &&
      rellena(t('plenos.indice.escalera.votosSinDecl.varios'), { n: votosSinDecl }),
  ].filter(Boolean)
  const sueltas = declSinOrden + votosSinDecl
  const lista =
    excepcionesNombradas.length === 2
      ? rellena(t('plenos.indice.escalera.ambas'), {
          a: excepcionesNombradas[0],
          b: excepcionesNombradas[1],
        })
      : excepcionesNombradas[0]
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
        {t('plenos.indice.escalera.titulo')}
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
              <span style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
                {t(`plenos.indice.escalera.${e.id}`)}
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-meta)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  flex: 'none',
                }}
              >
                {e.n === e.de ? e.n : rellena(t('plenos.indice.deTotal'), { n: e.n, total: e.de })}
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
        {rellena(t('plenos.indice.escalera.nota'), { n: escalera[0]?.de ?? 0 })}{' '}
        {sueltas > 0
          ? rellena(t('plenos.indice.escalera.sueltas'), { lista })
          : t('plenos.indice.escalera.anidadas')}{' '}
        {t('plenos.indice.escalera.sube')}
      </p>
    </Card>
  )
}
