// @ts-check
/**
 * La figura de cabecera de cada reportaje: su cifra central, dibujada.
 *
 * Todo sale del snapshot CONGELADO de la pieza (public/data/reportajes/<slug>.json)
 * — nunca de los datos vivos —, por la misma razón que la pieza congela sus
 * cifras: la figura y el texto no pueden separarse cuando el nightly mueve un
 * dato. La serie del agua de «coste-efectivo» vive en su bloque `emblema`.
 *
 * Los colores son los tokens del sitio, así que la figura sigue a html.dark.
 * Por eso NO va en la portada: su paleta es fija y no sigue el modo oscuro.
 *
 * Una pieza sin emblema dibujado devuelve null: mejor ninguna figura que una
 * genérica que no diga nada de la pieza.
 *
 * Se dibuja al entrar en pantalla (`useRevelado`): crecen las barras, brotan los
 * puntos, se traza el contorno. Sólo se animan MARCAS, con las clases
 * `cp-crece-x`, `cp-crece-y`, `cp-brota`, `cp-aparece` y `cp-traza` de
 * index.css. Ningún texto cambia de valor, de tamaño ni de sitio —nada cuenta
 * hacia arriba—: una cifra que pasa por valores intermedios es una cifra que
 * alguien pudo leer mal. Lo más que ocurre es que una barra que crece descubra
 * la etiqueta clara que lleva encima («14 a. 9 m.»). Sin IntersectionObserver,
 * con movimiento reducido o en papel, la figura está completa desde el primer
 * fotograma.
 */
import { useRevelado } from './Pieza'

const C = {
  ink: 'var(--ink)',
  // Lo macizo —la barra de la contrata anterior, la de los sensores— va con su
  // propia variable: en oscuro, `--ink` es casi blanco, y una plancha blanca era
  // lo más luminoso de la página, por encima de la cifra que la figura señala.
  macizo: 'var(--em-macizo, var(--ink))',
  ink50: 'var(--ink50)',
  ink20: 'var(--ink20)',
  paper: 'var(--paper)',
  civic: 'var(--civic)',
  accent: 'var(--crit-ink)',
}
const MONO = "'DM Mono', ui-monospace, monospace"

/** El orden de una marca en su animación (`--i`), para escalonarlas. */
const orden = (/** @type {number} */ i, extra = {}) =>
  /** @type {import('react').CSSProperties} */ (/** @type {unknown} */ ({ '--i': i, ...extra }))

// de-DE y no es-ES: es-ES no agrupa los miles de cuatro cifras («4514»), y las
// piezas escriben «87.050 €» y «4.514». Mismo separador decimal, la coma.
const es = (/** @type {number} */ v, d = 2) =>
  v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
const eurM = (/** @type {number} */ v) => `${es(v / 1e6)} M€`
const eur0 = (/** @type {number} */ v) => `${Math.round(v).toLocaleString('de-DE')} €`

/**
 * @param {{ x: number, y: number, size?: number, fill?: string, anchor?: 'start'|'middle'|'end',
 *   mono?: boolean, weight?: number, children: import('react').ReactNode }} p
 */
function T({
  x,
  y,
  size = 22,
  fill = C.ink,
  anchor = 'start',
  mono = false,
  weight = 400,
  children,
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fill={fill}
      textAnchor={anchor}
      fontWeight={weight}
      fontFamily={mono ? MONO : undefined}
    >
      {children}
    </text>
  )
}

function Hatch({ id }) {
  return (
    <defs>
      <pattern
        id={id}
        width="10"
        height="10"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line x1="0" y1="0" x2="0" y2="10" stroke={C.accent} strokeWidth="3" />
      </pattern>
    </defs>
  )
}

// ── Basuras: quince años, y luego un mes, sobre el mismo eje ─────────────
function Basuras({ data }) {
  const [kSav, kNueva] = data.kpis
  const start = new Date(data.cronologia[0].fecha)
  const y0 = 2011
  const X = (/** @type {number} */ t) => 40 + ((t - y0) / 15) * 640
  const sav0 = start.getFullYear() + start.getMonth() / 12
  const sav1 = 2025 + 10 / 12 // «a noviembre de 2025», según el kpi
  const nueva1 = sav1 + 1 / 12 // «1 mes», según el kpi
  return {
    label: `La contrata anterior duró ${kSav.n}; la nueva, ${kNueva.n} hasta el expediente de penalidades.`,
    body: (
      <>
        <T x={40} y={40} fill={C.ink50}>
          contrata anterior
        </T>
        <rect
          className="cp-crece-x"
          // Curva pareja y no de muelle: son quince años, y tienen que tardar.
          style={orden(0, { '--dur': '1500ms', '--ease': 'var(--ease-base)' })}
          x={X(sav0)}
          y={54}
          width={X(sav1) - X(sav0)}
          height={64}
          fill={C.macizo}
        />
        <T x={X(sav0) + 20} y={97} size={28} fill={C.paper} mono weight={500}>
          {kSav.n}
        </T>
        <T x={X(sav1) - 12} y={170} fill={C.accent} anchor="end" weight={600}>
          {`nueva contrata · ${kNueva.n}`}
        </T>
        {/* La nueva contrata aparece cuando la anterior ha terminado de crecer:
            quince años, y luego un mes. */}
        <rect
          className="cp-crece-y"
          style={orden(0, { '--d': '1450ms', '--dur': '500ms' })}
          x={X(sav1)}
          y={138}
          width={Math.max(7, X(nueva1) - X(sav1))}
          height={64}
          fill={C.accent}
        />
        <line x1={40} y1={238} x2={680} y2={238} stroke={C.ink50} strokeWidth={2} />
        {[2011, 2015, 2020, 2025].map((y) => (
          <g key={y}>
            <line x1={X(y)} y1={238} x2={X(y)} y2={248} stroke={C.ink50} strokeWidth={2} />
            <T
              x={X(y)}
              y={276}
              size={20}
              fill={C.ink50}
              anchor={y === 2011 ? 'start' : 'middle'}
              mono
            >
              {y}
            </T>
          </g>
        ))}
      </>
    ),
  }
}

// ── Conteo de visitantes: lo comprado, y las cifras que lo justificaban ──
function ConteoVisitantes({ data }) {
  const [sens, promo] = data.contratos
  const total = sens.importe + promo.importe
  const w1 = (640 * sens.importe) / total
  const cero = data.kpis.find((/** @type {{n:string}} */ k) => k.n === '0')
  // El `transform` de posición va en un <g> interior: la animación usa la
  // propiedad CSS `transform`, que pisaría el atributo del mismo elemento.
  const Doc = ({ x, i }) => (
    <g className="cp-aparece" style={orden(i, { '--d': '700ms' })}>
      <g transform={`translate(${x},168)`}>
        <path d="M0 0h44l16 16v76H0z" fill={C.paper} stroke={C.ink50} strokeWidth={2} />
        <path d="M44 0v16h16" fill="none" stroke={C.ink50} strokeWidth={2} />
        {[30, 44, 58, 72].map((y) => (
          <line key={y} x1={10} y1={y} x2={50} y2={y} stroke={C.ink20} strokeWidth={4} />
        ))}
      </g>
    </g>
  )
  return {
    label: `${eur0(total)} en dos contratos; ${cero ? cero.n : '0'} cifras de visitantes en las memorias que los justificaban.`,
    body: (
      <>
        <T x={40} y={36} fill={C.ink50} mono>
          {`${eur0(total)} en dos contratos · sin IVA`}
        </T>
        <rect className="cp-crece-x" x={40} y={50} width={w1} height={56} fill={C.macizo} />
        <rect
          className="cp-crece-x"
          style={orden(0, { '--d': '520ms', '--dur': '600ms' })}
          x={40 + w1}
          y={50}
          width={640 - w1}
          height={56}
          fill={C.civic}
        />
        <T x={40} y={136} size={20}>{`sensores · ${eur0(sens.importe)}`}</T>
        <T x={680} y={136} size={20} anchor="end">{`promoción · ${eur0(promo.importe)}`}</T>
        <Doc x={40} i={0} />
        <Doc x={116} i={1} />
        <T x={214} y={250} size={96} fill={C.accent} weight={600}>
          {cero ? cero.n : '0'}
        </T>
        <T x={290} y={212} size={24} weight={600}>
          cifras de visitantes
        </T>
        <T x={290} y={244} fill={C.ink50}>
          en las dos memorias justificativas
        </T>
      </>
    ),
  }
}

// ── Coste efectivo: el panel del agua, entrega a entrega ─────────────────
function CosteEfectivo({ data }) {
  const serie = new Map(
    (data.emblema?.agua ?? []).map((/** @type {{anio:number, coste:number}} */ f) => [
      f.anio,
      f.coste,
    ]),
  )
  const years = data.entregas.publicadas
  const missing = new Set(data.entregas.noPresentadas)
  const w = 54
  const gap = (640 - years.length * w) / (years.length - 1)
  const on = years.filter((/** @type {number} */ y) => serie.get(y) > 0).length
  const off = years.filter((/** @type {number} */ y) => serie.has(y) && !(serie.get(y) > 0)).length
  return {
    label: `Coste efectivo del agua declarado: cifra en ${on} entregas, cero en ${off} y una sin presentar.`,
    body: (
      <>
        <Hatch id="emblema-ce-h" />
        <T x={40} y={34} size={21} fill={C.ink50} mono>
          agua · coste efectivo declarado, M€
        </T>
        {years.map((/** @type {number} */ y, /** @type {number} */ i) => {
          const x = 40 + i * (w + gap)
          const v = serie.get(y)
          const falta = missing.has(y)
          return (
            <g key={y}>
              {falta ? (
                <rect
                  className="cp-aparece"
                  style={orden(i)}
                  x={x}
                  y={52}
                  width={w}
                  height={150}
                  fill="url(#emblema-ce-h)"
                  stroke={C.accent}
                  strokeWidth={2.5}
                />
              ) : v > 0 ? (
                <>
                  <rect
                    className="cp-crece-y"
                    style={orden(i)}
                    x={x}
                    y={52}
                    width={w}
                    height={150}
                    fill={C.civic}
                  />
                  <T
                    x={x + w / 2}
                    y={186}
                    size={17}
                    fill={C.paper}
                    anchor="middle"
                    mono
                    weight={500}
                  >
                    {es(v / 1e6)}
                  </T>
                </>
              ) : (
                <>
                  <rect
                    className="cp-aparece"
                    style={orden(i)}
                    x={x + 1.5}
                    y={53.5}
                    width={w - 3}
                    height={147}
                    fill="none"
                    stroke={C.ink50}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                  <T x={x + w / 2} y={186} size={20} fill={C.ink50} anchor="middle" mono>
                    0
                  </T>
                </>
              )}
              <T
                x={x + w / 2}
                y={230}
                size={19}
                fill={falta ? C.accent : C.ink50}
                anchor="middle"
                mono
                weight={falta ? 500 : 400}
              >
                {String(y).slice(2)}
              </T>
            </g>
          )
        })}
        <rect x={40} y={258} width={16} height={16} fill={C.civic} />
        <T x={64} y={273} size={19}>
          cifra
        </T>
        <rect
          x={130}
          y={259}
          width={14}
          height={14}
          fill="none"
          stroke={C.ink50}
          strokeWidth={2}
          strokeDasharray="4 3"
        />
        <T x={154} y={273} size={19}>
          cero
        </T>
        <rect
          x={222}
          y={258}
          width={16}
          height={16}
          fill="url(#emblema-ce-h)"
          stroke={C.accent}
          strokeWidth={2}
        />
        <T x={246} y={273} size={19}>
          sin entrega
        </T>
      </>
    ),
  }
}

// ── Inteligencia turística: el plan, y la parte que se celebró ───────────
function InteligenciaTuristica({ data }) {
  const plan = Number(data.plan.total.replace(/[^\d,]/g, '').replace(',', '.'))
  const k = data.kpis.find((/** @type {{l:string}} */ x) => /inteligencia/.test(x.l))
  const small = Number(k.n.replace(/[^\d]/g, ''))
  const S = 236
  const s = Math.max(8, S * Math.sqrt(small / plan))
  return {
    label: `Plan de ${eurM(plan)}; los dos contratos de inteligencia turística, ${eur0(small)} sin IVA.`,
    body: (
      <>
        <rect x={40} y={32} width={S} height={S} fill={C.ink20} stroke={C.ink50} strokeWidth={2} />
        <rect
          className="cp-brota cp-brota-esquina"
          style={orden(0, { '--d': '350ms', '--dur': '1100ms' })}
          x={40}
          y={32 + S - s}
          width={s}
          height={s}
          fill={C.accent}
        />
        <T x={310} y={64} size={34} mono weight={500}>
          {eurM(plan)}
        </T>
        <T x={310} y={94} size={20} fill={C.ink50}>
          Plan de Sostenibilidad Turística 2022
        </T>
        <line x1={310} y1={128} x2={680} y2={128} stroke={C.ink20} strokeWidth={2} />
        <T x={310} y={176} size={34} fill={C.accent} mono weight={500}>
          {eur0(small)}
        </T>
        <T x={310} y={206} size={20} fill={C.ink50}>
          los dos contratos de «inteligencia
        </T>
        <T x={310} y={232} size={20} fill={C.ink50}>
          turística», sin IVA
        </T>
        {/* El total del plan viene de la convocatoria y no dice si lleva IVA;
            los 51.787 € son sin IVA. La pieza pone las dos juntas; la figura
            lo avisa en vez de presentar el área como exacta. */}
        <T x={310} y={262} size={16} fill={C.ink50} mono>
          área ≈ euros · el total del plan es
        </T>
        <T x={310} y={284} size={16} fill={C.ink50} mono>
          la cifra de la convocatoria
        </T>
      </>
    ),
  }
}

// ── Reconstrucción DANA: cada lugar que nombra un contrato, en el término ─
function ReconstruccionDana({ data }) {
  const { south, north, west, east } = data.bbox
  const k = Math.cos((((south + north) / 2) * Math.PI) / 180)
  const H = 264
  const Wm = ((east - west) * k * H) / (north - south)
  const P = (/** @type {number} */ lat, /** @type {number} */ lng) => [
    40 + ((lng - west) * k * H) / (north - south),
    18 + ((north - lat) / (north - south)) * H,
  ]
  const outline =
    data.boundary
      .map(([lat, lng], /** @type {number} */ i) => {
        const [x, y] = P(lat, lng)
        return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join('') + 'Z'
  const max = Math.max(...data.places.map((/** @type {{amount:number}} */ p) => p.amount))
  const t = data.totals
  const tx = 40 + Wm + 50
  return {
    label: `Mapa de los lugares que nombran los contratos: ${eurM(t.situatedAmount)} situados; ${eurM(t.danaAmount)} con referencia a la DANA.`,
    body: (
      <>
        <path
          className="cp-traza"
          pathLength={1}
          d={outline}
          fill={C.ink20}
          stroke={C.ink50}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {[...data.places]
          .sort((a, b) => b.amount - a.amount)
          .map((p, i) => {
            const [x, y] = P(p.lat, p.lng)
            const dana = p.danaAmount > 0
            return (
              <circle
                key={p.name}
                className="cp-brota"
                style={orden(i, { '--d': '700ms', '--paso': '28ms' })}
                cx={x}
                cy={y}
                r={3 + 15 * Math.sqrt(p.amount / max)}
                fill={dana ? C.accent : C.civic}
                fillOpacity={dana ? 0.9 : 0.55}
                stroke={C.paper}
                strokeWidth={1.5}
              />
            )
          })}
        <T x={tx} y={60} size={32} mono weight={500}>
          {eurM(t.situatedAmount)}
        </T>
        <T x={tx} y={88} size={19} fill={C.ink50}>
          {`en ${t.situatedContracts} emplazamientos con dirección`}
        </T>
        <T x={tx} y={150} size={32} fill={C.accent} mono weight={500}>
          {eurM(t.danaAmount)}
        </T>
        <T x={tx} y={178} size={19} fill={C.ink50}>
          {`en ${t.danaContracts} contratos con referencia a la DANA`}
        </T>
        <circle cx={tx + 8} cy={222} r={8} fill={C.accent} />
        <T x={tx + 24} y={228} size={17}>
          con referencia DANA
        </T>
        <circle cx={tx + 8} cy={250} r={8} fill={C.civic} fillOpacity={0.55} />
        <T x={tx + 24} y={256} size={17}>
          sin referencia DANA
        </T>
        <T x={tx} y={284} size={15} fill={C.ink50} mono>
          {`un punto = un lugar (${data.places.length}) · área = importe`}
        </T>
      </>
    ),
  }
}

/** Slugs con emblema dibujado. Exportado para que un test exija uno por pieza. */
export const EMBLEMAS = {
  basuras: Basuras,
  'conteo-visitantes': ConteoVisitantes,
  'coste-efectivo': CosteEfectivo,
  'inteligencia-turistica': InteligenciaTuristica,
  'reconstruccion-dana': ReconstruccionDana,
}

// Media queries no caben en el prop `style`: van en una hoja. Por debajo de
// 480px las etiquetas del viewBox bajan de ~9px — por debajo del suelo de
// 11px del sitio —, así que la figura se oculta: la pieza se lee igual sin ella.
//
// `--em-macizo` es el relleno de lo macizo (ver `C.macizo`): la tinta en claro y
// la tinta al 62 % en oscuro, donde la plena era una plancha blanca.
const CSS = `
.cp-emblema { display: block; }
.cp-emblema svg { display: block; width: 100%; height: auto; }
html.dark .cp-emblema { --em-macizo: var(--ink50); }
@media print { html.dark .cp-emblema { --em-macizo: var(--ink); } }
@media (max-width: 479px) { .cp-emblema { display: none; } }
`

/**
 * @param {{ slug: string, data: any, style?: import('react').CSSProperties }} props
 */
export default function Emblema({ slug, data, style }) {
  // Antes de cualquier return: los hooks no se saltan.
  const { ref, marcas } = useRevelado()
  const Figura = EMBLEMAS[slug]
  if (!Figura || !data) return null
  const { label, body } = Figura({ data })
  return (
    <figure
      ref={/** @type {import('react').RefObject<HTMLElement>} */ (ref)}
      className="cp-emblema"
      style={{ margin: 0, ...style }}
      {...marcas}
    >
      <style>{CSS}</style>
      {/* El dibujo ocupa x 36–684 de un lienzo de 720: el viewBox recorta el
          margen para que el borde de la figura caiga donde el del titular. */}
      <svg
        viewBox="36 0 648 300"
        role="img"
        aria-label={label}
        style={{ fontFamily: 'var(--font-body)' }}
      >
        <title>{label}</title>
        {body}
      </svg>
    </figure>
  )
}
