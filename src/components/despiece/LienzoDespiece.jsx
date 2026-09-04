/**
 * El dibujo. Componente tonto: no calcula nada, pinta lo que le dan.
 *
 * Toda la aritmética vive en `despiece-geometria.js`, que es puro y está
 * probado. Es el mismo reparto que `embudo-geometria.js` / `Embudo.jsx`, y
 * existe porque una cuenta metida en el JSX no la comprueba nadie.
 */
import { GEOMETRIA, trazar } from './despiece-geometria'

const ETIQUETA_CARRIL = {
  fuente: 'fuente',
  script: 'guion',
  parser: 'parser',
  snapshot: 'snapshot',
  hook: 'hook',
  vista: 'vista',
  ruta: 'ruta',
  proceso: 'proceso',
}

/** La opacidad cae con la distancia: para un concentrador, un binario miente. */
function opacidadDe(id, recorrido) {
  if (!recorrido) return 1
  if (id === recorrido.centro) return 1
  const d = recorrido.arriba.get(id) ?? recorrido.abajo.get(id)
  if (d === undefined) return 0.12
  return d === 1 ? 0.85 : d === 2 ? 0.55 : 0.35
}

export default function LienzoDespiece({
  nodos,
  aristas,
  medidas,
  primarias,
  recorrido,
  onElegir,
  elegido,
}) {
  return (
    <div className="cp-desp-lienzo">
      <svg
        width={medidas.ancho}
        height={medidas.alto}
        viewBox={`0 0 ${medidas.ancho} ${medidas.alto}`}
        role="img"
        aria-label={`Despiece: ${nodos.length} piezas y ${aristas.length} relaciones`}
        style={{ display: 'block', maxWidth: 'none' }}
      >
        {medidas.carriles.map((c) => (
          <text
            key={c.carril}
            x={c.x}
            y={18}
            className="mono"
            fontSize="11"
            fill="var(--ink50)"
            letterSpacing="0.06em"
          >
            {(ETIQUETA_CARRIL[c.carril] ?? c.carril).toUpperCase()}
          </text>
        ))}

        {aristas.map((a) => {
          const t = trazar(medidas, a)
          if (!t) return null
          const clave = `${a.de}→${a.a}`
          const esPrimaria = primarias.has(clave)
          const op = Math.min(opacidadDe(a.de, recorrido), opacidadDe(a.a, recorrido))
          // `nombra` dice que un guion menciona el fichero y que no se sabe el
          // verbo. Va punteada y siempre fina: dibujarla igual que una lectura
          // afirmaría una dirección que nadie ha derivado.
          const sinVerbo = a.tipo === 'nombra'
          return (
            <path
              key={clave}
              d={t.d}
              fill="none"
              stroke={t.atras ? 'var(--warn)' : 'var(--civic)'}
              strokeWidth={esPrimaria && !sinVerbo ? 1.4 : 0.8}
              strokeOpacity={(esPrimaria && !sinVerbo ? 0.55 : 0.22) * op}
              strokeDasharray={sinVerbo ? '1 3' : t.salta > 0 ? '3 3' : undefined}
            />
          )
        })}

        {nodos.map((n) => {
          const caja = medidas.cajas.get(n.id)
          if (!caja) return null
          const op = opacidadDe(n.id, recorrido)
          const activo = n.id === elegido
          return (
            <g
              key={n.id}
              className="cp-desp-nodo"
              opacity={op}
              tabIndex={0}
              role="button"
              aria-label={`${ETIQUETA_CARRIL[n.carril] ?? n.carril} ${n.nombre}${n.analizado ? '' : ', no leído'}`}
              onClick={() => onElegir(activo ? null : n.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onElegir(activo ? null : n.id)
                }
              }}
            >
              <rect
                x={caja.x}
                y={caja.y}
                width={caja.ancho}
                height={caja.alto}
                rx={6}
                fill={activo ? 'var(--civic-soft)' : 'var(--soft)'}
                stroke={activo ? 'var(--civic)' : n.analizado ? 'var(--border2)' : 'var(--warn)'}
                strokeWidth={activo ? 1.6 : 1}
                strokeDasharray={n.analizado ? undefined : '3 2'}
              />
              <text
                x={caja.x + 8}
                y={caja.y + caja.alto / 2 + 4}
                className="mono"
                fontSize="11"
                fill={activo ? 'var(--civic-ink)' : 'var(--ink70)'}
              >
                {n.nombre.length > 22 ? `${n.nombre.slice(0, 21)}…` : n.nombre}
              </text>
              {!n.analizado && (
                <text
                  x={caja.x + caja.ancho - 8}
                  y={caja.y + caja.alto / 2 + 4}
                  fontSize="11"
                  textAnchor="end"
                  fill="var(--warn-ink)"
                >
                  ⚠
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <p
        className="mono"
        style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', margin: '6px 0 0' }}
      >
        línea continua = espinazo · a trazos = se salta un carril · ámbar = va hacia atrás
        (realimentación) · borde a trazos con ⚠ = no se pudo leer
      </p>
    </div>
  )
}

export { GEOMETRIA }
