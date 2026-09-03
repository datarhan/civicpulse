// @ts-check
import { useIncendios } from '../../../hooks/useIncendios'
import { TONOS_RECENCIA, repartoDeCausas, CAUSA_ETIQUETA } from '../../../lib/incendios'
import { IncendiosCobertura } from './IncendiosCobertura'

const titleStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 'var(--fs-micro)',
  color: 'rgba(11,15,25,.62)',
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  marginBottom: 4,
}

const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })

/**
 * Leyenda de la capa de incendios. Los cuadraditos leen TONOS_RECENCIA, que es
 * la misma tabla con la que la capa pinta los polígonos: si se declararan por
 * separado, la leyenda acabaría enseñando un color que el mapa no usa.
 *
 * Debajo, el reparto de causas tal y como lo clasifica la Generalitat —no
 * nuestro— con el denominador a la vista, porque los partes que no determinan
 * causa no pueden estar dentro de un porcentaje sobre causas.
 */
export function IncendiosLegend() {
  const { data } = useIncendios()
  const reparto = repartoDeCausas(data?.incendios ?? [])

  return (
    <div className="cp-incendios-legend">
      {/* Tope con scroll propio, y RELATIVO a la ventana. Medido: sin tope la
          tarjeta se comía 437 px de un mapa de 732 con 141 px cortados por
          arriba; y a 375 px el mapa mide 277 px, así que un tope fijo empuja
          la pila fuera de la pantalla por completo. Arriba, además, espera el
          teletipo en directo, que pinta a z-index 401 —por encima de esta
          pila—, así que hace falta holgura, no sólo caber. */}
      <div
        style={{ maxHeight: 'min(190px, 20vh)', overflowY: 'auto', overscrollBehavior: 'contain' }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TONOS_RECENCIA.map((tono) => (
            <div key={tono.color} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 14,
                  height: 10,
                  // Sin radio: esta capa pinta superficies, y un cuadradito recto
                  // lee como área. El círculo de QuejasLegend es otra cosa —una
                  // burbuja por barrio— y aquí engañaría.
                  background: tono.color,
                  opacity: 0.55,
                  border: `1px solid ${tono.color}`,
                  flex: '0 0 auto',
                }}
              />
              <span style={{ fontSize: 'var(--fs-micro)', color: 'rgba(11,15,25,.7)' }}>
                {tono.corta}
              </span>
            </div>
          ))}
        </div>

        {reparto.conCausa > 0 && (
          <div
            style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: '1px solid #E6E1D4',
              fontSize: 'var(--fs-aux)',
              color: 'rgba(11,15,25,.7)',
              lineHeight: 1.35,
            }}
          >
            <div style={{ ...titleStyle, marginBottom: 3 }}>Causa según el parte</div>
            {reparto.grupos.map((g) => (
              <div
                key={g.causa}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
              >
                <span>{CAUSA_ETIQUETA[g.causa]}</span>
                <span style={{ fontFamily: "'DM Mono', monospace" }}>
                  {g.total} · {nf1.format(g.pct)}%
                </span>
              </div>
            ))}
            <div style={{ marginTop: 3, fontSize: 'var(--fs-micro)', color: 'rgba(11,15,25,.55)' }}>
              {/* El denominador, a la vista. Los partes sin causa determinada
                quedan fuera: «no se sabe» no es una causa. */}
              Sobre {reparto.conCausa} partes con causa determinada
              {reparto.sinClasificar > 0 && `; en otros ${reparto.sinClasificar} no consta`}.
            </div>
          </div>
        )}

        <IncendiosCobertura universe={data?.universe} />
      </div>
    </div>
  )
}
