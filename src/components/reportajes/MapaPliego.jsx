/**
 * El mapa de situación de «matrículas y móviles»: el Parc Natural del Túria,
 * las tres calles junto a las que el pliego sitúa sus aparcamientos con
 * cámaras, y Porxinos. Lee el bloque `mapa` de la instantánea, congelado por
 * `scripts/build-mapa-pliego.ts` (que se niega a escribirlo si alguna calle cae
 * dentro del parque).
 *
 * Lo que la figura NO hace, a propósito: poner un pin donde creemos que está
 * cada aparcamiento. El pliego no da su posición, da la calle; se dibuja la
 * calle. Y Porxinos es el punto con ese nombre en OpenStreetMap, no el
 * contorno del valle. El pie dice las dos cosas.
 *
 * Proyección equirrectangular con el coseno de la latitud media: a cinco
 * kilómetros, la diferencia con una UTM no se ve.
 */

import { fmtDateHuman } from '../../lib/formatters'

const W = 648

// Los rótulos van en unidades del dibujo y escalan con él: a 712px de columna,
// 15 unidades son unos 16px; a 327px serían 7, bajo el suelo de 11px del
// sitio. En el móvil crecen en unidades para quedarse en ~11px en pantalla. Por
// eso este fichero está, con nombre y motivo, entre los exentos de
// tests/type-scale.test.js, como el embudo de coste esperado.
const CSS = `
.cp-mapa-rotulo { font-size: 15px; }
.cp-mapa-menor { font-size: 13px; }
@media (max-width: 599px) {
  .cp-mapa-rotulo, .cp-mapa-menor { font-size: 22px; }
}
`

/** @param {{ mapa: any }} props */
export default function MapaPliego({ mapa }) {
  const [s, w, n, e] = mapa.encuadre
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180)
  const H = Math.round((W * (n - s)) / ((e - w) * k))
  /** @param {[number, number]} p */
  const xy = ([la, lo]) => [((lo - w) / (e - w)) * W, ((n - la) / (n - s)) * H]
  /** @param {[number, number][]} l */
  const d = (l) =>
    l
      .map(
        (p, i) =>
          `${i ? 'L' : 'M'}${xy(p)
            .map((v) => v.toFixed(1))
            .join(' ')}`,
      )
      .join('')

  // Metros por unidad del dibujo, para la barra de escala.
  const mPorU = ((e - w) * k * 111_320) / W
  const barraM = 1000
  const barraU = barraM / mPorU

  // Las calles se rotulan en columna a su derecha, con una guía a cada una:
  // están a doscientos metros unas de otras y los nombres no caben al lado.
  const calles = mapa.aparcamientos.map((a) => {
    const pts = a.tramos.flat().map(xy)
    const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length
    const cy = pts.reduce((t, p) => t + p[1], 0) / pts.length
    return { ...a, cx, cy }
  })
  const colX = Math.max(...calles.map((c) => c.cx)) + 40
  // Cada rótulo a la altura de su calle, y si choca con el de arriba, justo
  // debajo: ordenados por altura, las guías no se cruzan. El paso (30 unidades)
  // cabe el rótulo del móvil: 22 de letra, ~28 con acentos y descendentes.
  const orden = [...calles].sort((a, b) => a.cy - b.cy)
  /** @type {number[]} */
  const alturas = []
  orden.forEach((c, i) => alturas.push(i ? Math.max(c.cy + 5, alturas[i - 1] + 30) : c.cy + 5))
  const [px, py] = xy(mapa.lugar.punto)
  const [rx, ry] = xy(mapa.parque.rotulo)
  const [tx, ty] = xy(mapa.pueblo.punto)
  const resumen =
    `Mapa. Las tres calles junto a las que el pliego sitúa los aparcamientos con cámaras ` +
    `(${calles.map((c) => c.calle).join(', ')}) están en el casco urbano, fuera del ` +
    `${mapa.parque.nombre}. ${mapa.lugar.nombre} queda ${mapa.lugar.dentroDelParque ? 'dentro' : 'fuera'} del parque.`

  return (
    <figure className="cp-ancho cp-mapa-pliego" style={{ margin: '18px 0' }}>
      <style>{CSS}</style>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'var(--ink50)',
          marginBottom: 8,
        }}
      >
        Dónde pone el pliego sus aparatos
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={resumen}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          background: 'var(--paper)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-card)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <title>{resumen}</title>
        <defs>
          <clipPath id="cp-mapa-pliego-marco">
            <rect x="0" y="0" width={W} height={H} />
          </clipPath>
        </defs>
        <g clipPath="url(#cp-mapa-pliego-marco)">
          <path
            d={mapa.parque.anillos.map(d).join('')}
            fillRule="evenodd"
            style={{
              fill: 'var(--civic)',
              fillOpacity: 0.16,
              stroke: 'var(--civic)',
              strokeWidth: 1,
              strokeOpacity: 0.7,
            }}
          />
          {mapa.rio?.tramos.map((t, i) => (
            <path
              key={i}
              d={d(t)}
              style={{ fill: 'none', stroke: 'var(--ink50)', strokeWidth: 1.5 }}
            />
          ))}
          {calles.map((c) =>
            c.tramos.map((t, i) => (
              <path
                key={`${c.calle}-${i}`}
                d={d(t)}
                style={{
                  fill: 'none',
                  stroke: 'var(--ink)',
                  strokeWidth: 4,
                  strokeLinecap: 'round',
                }}
              />
            )),
          )}
          {orden.map((c, i) => {
            const ly = alturas[i]
            return (
              <g key={c.calle}>
                <path
                  d={`M${c.cx.toFixed(1)} ${c.cy.toFixed(1)}L${(colX - 6).toFixed(1)} ${(ly - 5).toFixed(1)}`}
                  style={{ stroke: 'var(--ink50)', strokeWidth: 0.75, fill: 'none' }}
                />
                <text
                  x={colX}
                  y={ly}
                  className="cp-mapa-rotulo"
                  style={{ fill: 'var(--ink)', fontWeight: 600 }}
                >
                  {c.nombre}
                </text>
              </g>
            )
          })}
          {/* El nombre del parque, en un punto que el build comprueba dentro de él. */}
          <text
            x={rx}
            y={ry}
            textAnchor="middle"
            className="cp-mapa-rotulo"
            style={{ fill: 'var(--civic)', fontWeight: 600 }}
          >
            {mapa.parque.nombre}
          </text>
          {/* El pueblo: sólo su nombre, a la izquierda de su nodo, para situar el
              casco urbano. No es un aparato ni un aparcamiento. */}
          <text
            x={tx - 10}
            y={ty + 5}
            textAnchor="end"
            className="cp-mapa-rotulo cp-mapa-menor"
            style={{ fill: 'var(--ink70)' }}
          >
            {mapa.pueblo.nombre}
          </text>
          <circle
            cx={px}
            cy={py}
            r={6}
            style={{ fill: 'var(--paper)', stroke: 'var(--ink)', strokeWidth: 2 }}
          />
          <text
            x={px + 11}
            y={py + 5}
            className="cp-mapa-rotulo"
            style={{ fill: 'var(--ink)', fontWeight: 600 }}
          >
            {mapa.lugar.nombre}
          </text>
        </g>
        {/* Escala, abajo a la izquierda. */}
        <g transform={`translate(14 ${H - 16})`}>
          <path d={`M0 0H${barraU.toFixed(1)}`} style={{ stroke: 'var(--ink)', strokeWidth: 2 }} />
          <path
            d={`M0 -4V0M${barraU.toFixed(1)} -4V0`}
            style={{ stroke: 'var(--ink)', strokeWidth: 2 }}
          />
          <text
            x={barraU + 6}
            y={4}
            className="cp-mapa-rotulo cp-mapa-menor"
            style={{ fill: 'var(--ink70)' }}
          >
            1 km
          </text>
        </g>
      </svg>
      <figcaption
        style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', marginTop: 6, lineHeight: 1.4 }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            marginRight: 5,
            verticalAlign: '-1px',
            background: 'var(--civic)',
            opacity: 0.35,
          }}
        />
        {mapa.parque.nombre}. Cada aparcamiento está dibujado como la calle junto a la que lo sitúa
        el pliego ({calles.map((c) => `${c.nombre}: ${c.calle}`).join('; ')}): el pliego no da su
        posición exacta. {mapa.lugar.nombre}, por el punto con ese nombre en OpenStreetMap, no por
        el contorno del valle. Norte arriba. Datos {mapa.fuente.atribucion} ({mapa.fuente.licencia}
        ), consultados el {fmtDateHuman(mapa.fuente.consultadoEl)}.
      </figcaption>
    </figure>
  )
}
