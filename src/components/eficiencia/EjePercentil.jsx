import { geometriaEje, ticksRango } from './eje-percentil'

/**
 * El eje de posición: una sola geometría para toda la página.
 *
 * Escala fija de percentil 0 a 100. Gris claro, la mitad central del grupo;
 * línea, la mediana; barra, la banda plausible; punto, Riba-roja. Cuando la
 * banda cruza la mediana el punto va HUECO y con trazo discontinuo, que es la
 * misma convención que `MachineProposal` usa para «esto no es una afirmación
 * firme» — aquí, para una posición que la muestra no sostiene.
 *
 * La posición NO se colorea nunca. Un coste unitario alto es un precio, no un
 * suspenso, y pintar de rojo el extremo caro convertiría el panel en la nota
 * global que esta página lleva dos años negándose a poner. El único color que
 * entra por `referencia` es el de un límite LEGAL, que sí es un umbral y no una
 * opinión nuestra.
 *
 * Accesibilidad: la posición no puede quedar codificada sólo por geometría ni
 * sólo por color. El `aria-label` la lleva como texto, y quien la use en una
 * fila debe además imprimir el percentil legible al lado. Sin `descripcion` el
 * eje se marca `aria-hidden`: es la forma de decir «esto es decoración», y es
 * distinto de anunciar una imagen sin nombre.
 */
export function EjePercentil({
  percentil,
  banda,
  ticks = 0,
  etiqueta = null,
  variante = 'compacta',
  descripcion,
}) {
  const g = geometriaEje({ percentil, banda })
  const detallada = variante === 'detallada'
  const alto = detallada ? 18 : 14
  const pct = (n) => `${n}%`

  // Hueca, la banda pierde el color de marca: el petróleo dice «esto es una
  // medida», y una banda que cruza la mediana no está midiendo un lado.
  const colorBanda = g.marcador?.hueco ? 'var(--ink30)' : 'var(--civic-band)'

  return (
    <div style={{ position: 'relative', height: detallada ? 46 : alto }}>
      {detallada && etiqueta && g.marcador && (
        <div
          className="mono"
          style={{
            position: 'absolute',
            left: pct(g.marcador.left),
            top: 0,
            transform: 'translateX(-50%)',
            fontSize: 'var(--fs-micro)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          {etiqueta}
        </div>
      )}

      {/* Sin descripción, el eje es DECORATIVO y se marca como tal: un
          `role="img"` con `aria-label=""` es una imagen que se anuncia y no
          dice nada, y axe lo suspende con razón. Pasa en la leyenda, donde los
          dos ejemplos los explica el texto de al lado. */}
      <div
        {...(descripcion ? { role: 'img', 'aria-label': descripcion } : { 'aria-hidden': 'true' })}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: detallada ? 18 : 0,
          height: alto,
          borderRadius: 'var(--r-pill)',
          background: 'var(--soft)',
        }}
      >
        {/* la mitad central del grupo */}
        <div
          style={{
            position: 'absolute',
            left: pct(g.iqr.left),
            width: pct(g.iqr.width),
            top: 0,
            bottom: 0,
            background: 'var(--ink10)',
          }}
        />
        {/* la mediana */}
        <div
          style={{
            position: 'absolute',
            left: pct(g.mediana),
            top: -2,
            bottom: -2,
            width: 1,
            background: 'var(--ink50)',
          }}
        />
        {/* las rayas: un comparable cada una, por puesto */}
        {ticksRango(ticks).map((left, k) => (
          <div
            key={k}
            data-eje-tick=""
            style={{
              position: 'absolute',
              left: pct(left),
              top: 2,
              width: 1,
              height: alto - 4,
              background: 'var(--ink30)',
            }}
          />
        ))}
        {/* la banda plausible del percentil */}
        {g.banda && (
          <div
            style={{
              position: 'absolute',
              left: pct(g.banda.left),
              width: pct(g.banda.width),
              top: (alto - 4) / 2,
              height: 4,
              borderRadius: 'var(--r-pill)',
              background: colorBanda,
            }}
          />
        )}
        {/* Riba-roja */}
        {g.marcador && (
          <div
            data-eje-marcador={g.marcador.hueco ? 'hueco' : 'solido'}
            style={{
              position: 'absolute',
              left: pct(g.marcador.left),
              top: detallada ? -2 : 2,
              width: detallada ? 14 : 10,
              height: detallada ? alto + 4 : 10,
              marginLeft: detallada ? -7 : -5,
              borderRadius: detallada ? 'var(--r-pill)' : '50%',
              background: g.marcador.hueco ? 'var(--paper)' : 'var(--civic)',
              border: g.marcador.hueco
                ? '1.5px dashed var(--ink50)'
                : detallada
                  ? '2px solid var(--paper)'
                  : 'none',
            }}
          />
        )}
      </div>
    </div>
  )
}
