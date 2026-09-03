import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Pill } from '../Primitives'
import { PLENO_TONE, PLENO_LABEL } from '../../hooks/usePlenos'
import { fmtDateShort } from '../../lib/formatters'

const COLUMNAS = [
  { id: 'fecha', rotulo: 'Fecha' },
  { id: 'tipo', rotulo: 'Tipo' },
  { id: 'puntos', rotulo: 'Puntos del orden del día' },
  { id: 'decl', rotulo: 'Declaraciones' },
  { id: 'votos', rotulo: 'Votaciones' },
  { id: 'hall', rotulo: 'Hallazgos' },
]

/** El ancho de la barra de puntos, a escala común con la sesión más cargada. */
function anchoBarra(n, maximo) {
  if (!maximo) return 0
  return Math.max(4, Math.round((n / maximo) * 92))
}

/**
 * Una celda numérica que sabe distinguir «no procesado» de «cero».
 *
 * Es LA pieza del rediseño. `null` se pinta como una etiqueta discontinua con
 * su motivo escrito; `0` se pinta como un cero, en tinta apagada. Antes las
 * dos eran la misma celda vacía, y una página que existe para decir cuánto nos
 * falta no puede confundir «no lo hemos leído» con «lo leímos y no había».
 */
function Celda({ rotulo, n, ausente, tono }) {
  const comun = { fontSize: 'var(--fs-meta)' }
  return (
    <span className="cp-plenos-celda">
      <span className="cp-plenos-rotulo">{rotulo}</span>
      {n === null ? (
        <span
          className="mono"
          style={{
            ...comun,
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--r-input)',
            padding: '1px 6px',
            justifySelf: 'start',
            whiteSpace: 'nowrap',
          }}
        >
          {ausente}
        </span>
      ) : (
        <span
          className="mono"
          style={{
            ...comun,
            color: n === 0 ? 'var(--ink50)' : tono,
            fontWeight: n === 0 ? 400 : 500,
          }}
        >
          {n.toLocaleString('es-ES')}
        </span>
      )}
    </span>
  )
}

function Fila({ fila, maximoPuntos }) {
  return (
    <Link to={`/plenos/${fila.id}`} className="cp-plenos-fila">
      <span className="cp-plenos-celda">
        <span className="cp-plenos-rotulo">Fecha</span>
        <span className="mono" style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}>
          {fmtDateShort(fila.date)}
        </span>
      </span>
      <span className="cp-plenos-celda">
        <span className="cp-plenos-rotulo">Tipo</span>
        <Pill tone={PLENO_TONE[fila.kind] || 'ghost'} size="xs">
          {PLENO_LABEL[fila.kind] || fila.kind}
        </Pill>
      </span>
      <span className="cp-plenos-celda">
        <span className="cp-plenos-rotulo">Puntos</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {fila.puntos !== null && (
            <span
              aria-hidden="true"
              style={{
                display: 'block',
                height: 6,
                borderRadius: 'var(--r-input)',
                background: 'var(--civic)',
                width: anchoBarra(fila.puntos, maximoPuntos),
                flex: 'none',
              }}
            />
          )}
          {fila.puntos === null ? (
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                border: '1px dashed var(--border)',
                borderRadius: 'var(--r-input)',
                padding: '1px 6px',
                whiteSpace: 'nowrap',
              }}
            >
              sin extraer
            </span>
          ) : (
            <span className="mono" style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}>
              {fila.puntos}
            </span>
          )}
        </span>
      </span>
      <Celda rotulo="Declaraciones" n={fila.decl} ausente="sin extraer" tono="var(--intel-ink)" />
      <Celda rotulo="Votaciones" n={fila.votos} ausente="sin transcribir" tono="var(--warn-ink)" />
      <Celda rotulo="Hallazgos" n={fila.hall} ausente="sin extraer" tono="var(--intel-ink)" />
      <span
        className="mono cp-plenos-flecha"
        aria-hidden="true"
        style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}
      >
        →
      </span>
    </Link>
  )
}

/**
 * El índice de sesiones: filtros, columnas rotuladas y una leyenda al pie.
 *
 * Tres cosas que la auditoría pedía y que la lista plana anterior no daba:
 *
 * 1. COLUMNAS CON NOMBRE. Los contadores iban en una fila de glifos —«18
 *    puntos · 9 ✓ · 5 hallazgos»— con una leyenda en prosa antes de la primera
 *    fila. La revisión lectora leyó «7 ✓» como votaciones dos barridos
 *    seguidos. El arreglo no era una leyenda mejor: era rotular la columna.
 * 2. AUSENCIA VISIBLE. Ver `Celda`.
 * 3. UN CORTE POR AÑO Y CINCO FILTROS. Cuatro años de corporación en una lista
 *    homogénea de 61 filas no se pueden recorrer. Los rótulos de los filtros
 *    llevan su cuenta CALCULADA: un chip que promete 7 y enseña 4 es peor que
 *    no tener filtro.
 */
export function TablaSesiones({ filas, filtros, porAnio, loading }) {
  const [activo, setActivo] = useState('todas')
  const filtro = filtros.find((f) => f.id === activo) ?? filtros[0]
  const visibles = filtro ? filas.filter(filtro.pasa) : filas
  const maximoPuntos = filas.reduce((m, f) => Math.max(m, f.puntos ?? 0), 0)
  // La cabecera de año contaba SIEMPRE el año entero, así que con un filtro
  // puesto decía «2026 · 11 sesiones» encima de cuatro filas. Es el mismo
  // defecto que esta página existe para arreglar —una cifra que no describe lo
  // que hay debajo—, cometido por el rediseño. Filtrado dice las dos: cuántas
  // se ven y de cuántas.
  const totalPorAnio = new Map(porAnio.map((g) => [g.anio, g.n]))
  const visiblesPorAnio = new Map()
  for (const f of visibles) visiblesPorAnio.set(f.anio, (visiblesPorAnio.get(f.anio) || 0) + 1)
  const notaAnio = (anio) => {
    const total = totalPorAnio.get(anio)
    const vistas = visiblesPorAnio.get(anio)
    return vistas === total ? `${total} sesiones` : `${vistas} de ${total} sesiones`
  }

  let anioPrevio = null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 'var(--fs-meta)',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '.05em',
              color: 'var(--ink50)',
            }}
          >
            Las sesiones ·{' '}
            {visibles.length === filas.length
              ? filas.length
              : `${visibles.length} de ${filas.length}`}
          </div>
          <h2 style={{ fontSize: 'var(--fs-head)', fontWeight: 700, margin: '6px 0 0' }}>
            Una fila por sesión, de la última a la primera
          </h2>
        </div>
        <div
          role="group"
          aria-label="Filtrar sesiones"
          style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
        >
          <span
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              color: 'var(--ink50)',
            }}
          >
            Ver
          </span>
          {filtros.map((f) => (
            <button
              key={f.id}
              type="button"
              className="cp-plenos-chip"
              aria-pressed={activo === f.id}
              onClick={() => setActivo(f.id)}
            >
              {f.rotulo} · {f.n}
            </button>
          ))}
        </div>
      </div>

      <Card pad={false}>
        <div className="cp-plenos-tabla">
          <div
            className="cp-plenos-cabecera"
            style={{
              padding: '12px 18px 10px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--soft)',
            }}
          >
            {COLUMNAS.map((c) => (
              <div
                key={c.id}
                style={{
                  fontSize: 'var(--fs-micro)',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '.05em',
                  color: 'var(--ink50)',
                }}
              >
                {c.rotulo}
              </div>
            ))}
            <div />
          </div>

          {loading && (
            <div style={{ padding: 14, fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>…</div>
          )}

          {!loading && visibles.length === 0 && (
            <div style={{ padding: 14, fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
              Ninguna sesión cumple ese filtro.
            </div>
          )}

          {visibles.map((fila) => {
            const abreAnio = fila.anio !== anioPrevio
            anioPrevio = fila.anio
            return (
              <div key={fila.id}>
                {abreAnio && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 10,
                      padding: '11px 18px 7px',
                      background: 'var(--surf)',
                      borderBottom: '1px solid var(--border2)',
                    }}
                  >
                    <span className="mono" style={{ fontSize: 'var(--fs-meta)', fontWeight: 500 }}>
                      {fila.anio}
                    </span>
                    <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                      {notaAnio(fila.anio)}
                    </span>
                  </div>
                )}
                <Fila fila={fila} maximoPuntos={maximoPuntos} />
              </div>
            )
          })}

          <div
            style={{
              display: 'flex',
              gap: 20,
              alignItems: 'center',
              flexWrap: 'wrap',
              padding: '12px 18px',
              background: 'var(--soft)',
              borderTop: '1px solid var(--border)',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink70)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 22,
                  height: 6,
                  borderRadius: 'var(--r-input)',
                  background: 'var(--civic)',
                  flex: 'none',
                }}
              />
              puntos del orden del día, a escala común
            </span>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink70)',
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--r-input)',
                  padding: '1px 6px',
                  flex: 'none',
                }}
              >
                sin extraer
              </span>
              la sesión se celebró; esa parte del acta no está procesada
            </span>
            {/* El cero habla del REGISTRO, no del mundo. Decir «no había nada»
                afirmaría que miramos y estaba vacío, y para los hallazgos eso
                sería falso: la firma de un curador puede estar pendiente. */}
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink70)',
              }}
            >
              <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                0
              </span>
              procesada, y nada publicado en esa columna
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              Ninguna cifra de esta tabla mide la actividad del pleno.
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
