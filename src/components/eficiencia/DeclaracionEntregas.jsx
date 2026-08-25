/**
 * Qué declaró el ayuntamiento, entrega a entrega.
 *
 * La cifra congelada estaba dicha en prosa —«la misma cifra desde 2019»— y una
 * frase así se lee y se olvida. Puesta en una rejilla, cinco casillas idénticas
 * en fila debajo de cinco casillas que cambian todos los años son la
 * demostración, no la afirmación.
 *
 * Dos detalles que no son estéticos:
 *
 * - La tinta sobre una casilla --warn SÓLIDA es `--warn-on`, nunca #fff.
 *   `--warn-ink` sobre `--warn` da 1,58:1 y el blanco tampoco pasa; el token
 *   existe justamente para este par y lo mide `tests/brand-tokens.test.js`.
 * - La entrega que falta lleva su rayado, pero el texto va sobre una pastilla
 *   SÓLIDA encima. `contraste.spec.ts` se salta cualquier elemento con
 *   `background-image` por no poder componerlo, así que un «—» sobre el rayado
 *   sería una casilla que ninguna pasada de contraste mira: verde por no
 *   ejecutarse, que es el defecto que esta casa lleva años pagando.
 */
const HATCH = 'repeating-linear-gradient(135deg, var(--warn-soft) 0 4px, var(--paper) 4px 8px)'

function Casilla({ children, tono, primera, ultima }) {
  const radio = `${primera ? 'var(--r-input)' : 0} ${ultima ? 'var(--r-input)' : 0} ${
    ultima ? 'var(--r-input)' : 0
  } ${primera ? 'var(--r-input)' : 0}`
  const base = {
    height: 22,
    display: 'grid',
    placeItems: 'center',
    borderRadius: radio,
    fontSize: 'var(--fs-micro)',
  }
  if (tono === 'ausente') {
    return (
      <span style={{ ...base, background: HATCH, border: '1px dashed var(--warn)' }}>
        <span
          className="mono"
          style={{
            background: 'var(--paper)',
            color: 'var(--warn-ink)',
            padding: '0 4px',
            borderRadius: 'var(--r-input)',
          }}
        >
          {children}
        </span>
      </span>
    )
  }
  const fondo =
    tono === 'congelada'
      ? { background: 'var(--warn)', color: 'var(--warn-on)', fontWeight: 500 }
      : tono === 'coste'
        ? { background: 'var(--civic-soft)', color: 'var(--civic-ink)' }
        : { background: 'var(--soft)', color: 'var(--ink70)' }
  return (
    <span className="mono" style={{ ...base, ...fondo }}>
      {children}
    </span>
  )
}

/**
 * El coste se abrevia; la cantidad NUNCA.
 *
 * Es la diferencia entre enseñar el hecho y borrarlo. «32 k» cinco veces
 * seguidas no demuestra nada —podrían ser 31.992, 32.100 y 31.950— y la
 * afirmación de esta ficha es justamente que es la MISMA cifra. Del coste, en
 * cambio, sólo hace falta ver que se mueve.
 */
/** La cantidad, entera y sin abreviar. Es la cifra que la ficha afirma repetida. */
const exacto = (v) => v.toLocaleString('es-ES', { maximumFractionDigits: 0 })

const compacto = (v) =>
  v >= 1e6
    ? `${(v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M`
    : v >= 1000
      ? `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 0 })} k`
      : v.toLocaleString('es-ES', { maximumFractionDigits: 0 })

export function DeclaracionEntregas({ indicador, entregasPublicadas = [], noPresentadas = [] }) {
  const i = indicador
  const anios = entregasPublicadas.length
    ? [...entregasPublicadas].sort((a, b) => a - b)
    : (i.serie ?? []).map((p) => p.anio)
  if (anios.length < 3) return null

  const porAnio = new Map((i.serie ?? []).map((p) => [p.anio, p]))
  const congeladaDesde = i.declaracion?.denominador?.congelada
    ? i.declaracion.denominador.desde
    : null

  const fila = (clave, rotulo, formato, tonoDe) => (
    <>
      <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink70)' }}>{rotulo}</span>
      {anios.map((a, k) => {
        const p = porAnio.get(a)
        const falta = noPresentadas.includes(a) || !p || p.estado !== 'declarado'
        const v = p?.[clave]
        return (
          <Casilla
            key={a}
            tono={falta ? 'ausente' : tonoDe(a)}
            primera={k === 0}
            ultima={k === anios.length - 1}
          >
            {falta || typeof v !== 'number' ? '—' : formato(v)}
          </Casilla>
        )
      })}
    </>
  )

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border2)' }}>
      <span
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--ink50)',
        }}
      >
        Qué declaró el ayuntamiento, entrega a entrega
      </span>

      {/* overflowX explícito: `.cp-scroll-x` de index.css sólo enciende por
          debajo de 720px, así que en escritorio esta rejilla empujaría la
          página igual que hizo la tabla del libro. */}
      <div style={{ marginTop: 12, overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `92px repeat(${anios.length}, minmax(52px, 1fr))`,
            gap: 4,
            alignItems: 'center',
            minWidth: 92 + anios.length * 56,
          }}
        >
          <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            entrega
          </span>
          {anios.map((a) => (
            <span
              key={a}
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                textAlign: 'center',
                color: noPresentadas.includes(a) ? 'var(--warn-ink)' : 'var(--ink50)',
              }}
            >
              {a}
            </span>
          ))}

          {fila(
            'numerador',
            'coste',
            (v) => `${compacto(v)}`,
            () => 'coste',
          )}
          {fila('denominador', i.divisor.singular, exacto, (a) =>
            congeladaDesde && a >= congeladaDesde ? 'congelada' : 'neutra',
          )}
        </div>
      </div>

      {congeladaDesde && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            maxWidth: '72ch',
            lineHeight: 1.6,
          }}
        >
          {i.declaracion.denominador.repeticionesFinales} entregas seguidas con la misma cantidad,
          mientras el coste se actualiza en todas.
          {noPresentadas.length > 0 && (
            <>
              {' '}
              La entrega de {noPresentadas.join(', ')} no falta por un problema de descarga: falta
              porque el ayuntamiento no la presentó, y calcularla antes del 1 de noviembre es una
              obligación del artículo 116 ter de la Ley de Bases de Régimen Local.
            </>
          )}
        </p>
      )}
    </div>
  )
}
