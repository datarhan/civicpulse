import { lazy, Suspense } from 'react'
import { useReportaje } from '../../hooks/useReportaje'
import CabeceraPieza, { ENTRADILLA } from '../../components/reportajes/CabeceraPieza'
import { Card, SectionHead } from '../../components/Primitives'
import { CorrectionNote } from '../../components/reportajes/CorrectionNote'
import { SecHead, Revela, useRevelado, Aparte } from '../../components/reportajes/Pieza'

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function eurC(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + ' M€'
  if (n >= 1e3) return Math.round(n / 1e3) + ' k€'
  return Math.round(n) + ' €'
}
/* ---- Cronograma (barras por mes) ---- */
function Timeline({ data }) {
  const W = 680,
    H = 210,
    mL = 6,
    mR = 6,
    mT = 14,
    mB = 26
  const iw = W - mL - mR,
    ih = H - mT - mB
  const max = Math.max(...data.map((d) => d.amount))
  const bw = iw / data.length
  const { ref, marcas } = useRevelado()
  // Los picos —cualquier mes por encima del 30 % del mayor— llevan su importe
  // encima. Sólo lo llevaba el mayor, noviembre de 2024, y el otro que la
  // entradilla nombra —el vallado de marzo de 2026, 445.313 €— quedaba como
  // una barra sin cifra ni mes: su etiqueta era la penúltima, la que se salta.
  const picos = data.flatMap((d, i) => (d.amount >= 0.3 * max ? [i] : []))
  // Un mes sí y otro no, y siempre el último. Con un número par de meses el
  // penúltimo también es par, y las dos etiquetas finales se montaban
  // («mar 26abr 26»): se salta el penúltimo. Después, cada pico se queda con su
  // mes y sus vecinos lo pierden —salvo que el vecino sea otro pico ya rotulado,
  // y entonces el que cede es éste: dos meses seguidos no caben—.
  const meses = new Set(
    data.flatMap((_, i) =>
      (i % 2 === 0 && i !== data.length - 2) || i === data.length - 1 ? [i] : [],
    ),
  )
  for (const p of picos) {
    if (picos.includes(p - 1) && meses.has(p - 1)) continue
    meses.add(p)
    if (!picos.includes(p - 1)) meses.delete(p - 1)
    if (!picos.includes(p + 1)) meses.delete(p + 1)
  }
  return (
    <svg
      ref={ref}
      {...marcas}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', display: 'block' }}
      role="img"
      aria-label="Cronograma de adjudicaciones DANA por mes"
    >
      <line x1={mL} y1={mT + ih} x2={W - mR} y2={mT + ih} stroke="var(--border)" strokeWidth="1" />
      {data.map((d, i) => {
        const x = mL + i * bw
        const bx = x + bw * 0.16
        const bwid = bw * 0.68
        const bh = d.amount > 0 ? Math.max(2, (d.amount / max) * ih) : 0
        const mo = +d.month.slice(5) - 1
        return (
          <g key={d.month}>
            {d.amount > 0 && (
              <rect
                className="cp-crece-y"
                style={{ '--i': i, '--paso': '45ms' }}
                x={bx}
                y={mT + ih - bh}
                width={bwid}
                height={bh}
                rx="2"
                fill="var(--civic)"
              >
                <title>{`${MES[mo]} ${d.month.slice(0, 4)} · ${eurC(d.amount)} · ${d.count} contrato${d.count > 1 ? 's' : ''}`}</title>
              </rect>
            )}
            {picos.includes(i) && (
              <text
                x={bx + bwid / 2}
                y={mT + ih - bh - 5}
                textAnchor="middle"
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', fill: 'var(--ink50)' }}
              >
                {eurC(d.amount)}
              </text>
            )}
            {meses.has(i) && (
              <text
                x={x + bw / 2}
                y={H - 9}
                textAnchor="middle"
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', fill: 'var(--ink50)' }}
              >
                {MES[mo] + ' ' + d.month.slice(2, 4)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/* ---- El mapa de §02, sobre el mapa base, perezoso: sólo esta pieza lo usa,
        y a media página (MapaDana.jsx cuenta por qué dejó de ser un SVG).
        Misma clave que la figura de cabecera: con referencia DANA en
        petróleo, el resto en gris. Y no en rojo: el rojo es el color de lo que
        una pieza documenta como fallo, y ésta no atribuye irregularidad a
        nadie. ---- */
const MapaDana = lazy(() => import('../../components/reportajes/MapaDana'))

/* ---- La clave del mapa, en HTML: debajo del mapa y no dentro, donde sus
        letras se leerían sobre las teselas. ---- */
function ClaveMapa() {
  const punto = (color, opacidad) => ({
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: color,
    opacity: opacidad,
    marginRight: 6,
    verticalAlign: '-1px',
  })
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px 18px',
        fontSize: 'var(--fs-meta)',
        color: 'var(--ink70)',
        marginTop: 10,
      }}
    >
      <span>
        <span aria-hidden="true" style={punto('var(--civic)', 0.85)} />
        con referencia DANA
      </span>
      <span>
        {/* El gris del mapa: la tinta al 40 %, como pinta Leaflet el resto. */}
        <span aria-hidden="true" style={punto('var(--ink)', 0.4)} />
        sin referencia DANA
      </span>
    </div>
  )
}

/* ---- Barras horizontales (adjudicatarios / zonas) ---- */
function Barras({ rows }) {
  const max = Math.max(...rows.map((r) => r.value))
  return (
    <Revela style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {rows.map((r, i) => (
        <div key={i}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 12,
              fontSize: 'var(--fs-aux)',
              marginBottom: 5,
            }}
          >
            {/* El nombre entero, en dos líneas si hace falta. Se cortaba a 34
                caracteres y con puntos suspensivos: «HIDRAQUA GESTION INTEGRAL
                DE AGUA…», el nombre de una adjudicataria a medias. */}
            <span style={{ color: 'var(--ink)' }}>{r.label}</span>
            <span
              className="mono"
              style={{ color: 'var(--ink50)', fontSize: 'var(--fs-meta)', flexShrink: 0 }}
            >
              {eurC(r.value)}
              {r.count != null && (
                <span style={{ color: 'var(--ink50)', fontSize: 'var(--fs-micro)' }}>
                  {' '}
                  · {r.count}
                </span>
              )}
            </span>
          </div>
          <div
            style={{
              height: 8,
              background: 'var(--soft)',
              borderRadius: 'var(--r-pill)',
              overflow: 'hidden',
            }}
          >
            <div
              className="cp-crece-x"
              style={{
                '--i': i,
                height: '100%',
                width: Math.max(3, (r.value / max) * 100) + '%',
                background: 'var(--civic)',
                borderRadius: 'var(--r-input)',
              }}
            />
          </div>
        </div>
      ))}
    </Revela>
  )
}

/* ---- De dónde viene el dinero (lista de financiadores, sin sumar) ---- */
const FUNDERS = [
  {
    who: 'Gobierno de España',
    sub: 'Orden TMD/101/2025 · hasta el 100 % de las obras',
    fig: '14.553.100 €',
  },
  {
    who: 'Generalitat · Plan Endavant',
    sub: '17,5 M€ ayuda directa + escombros + EDAR + centro de salud',
    fig: '46,3 M€',
  },
  { who: 'UE · FEDER (Plan EDIL)', sub: 'reconstrucción urbana', fig: '9,5 M€' },
  // Sin cifra propia para Riba-roja: la de la CHJ es de doce municipios y la de
  // la Diputació no se desglosa. Su columna decía «río Túria» y «provincial»
  // con la letra y el color de un importe; ahora dice que no hay importe.
  {
    who: 'Estado · CHJ',
    sub: 'emergencia del cauce del Túria (parte de 19 M€ / 12 municipios)',
    fig: null,
  },
  { who: 'Diputació de València', sub: 'ayuda provincial + personal', fig: null },
]
function Funders() {
  return (
    <div style={{ margin: '4px 0 8px' }}>
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 8 }}
      >
        Importes anunciados <span style={{ color: 'var(--warn-ink)' }}>· no sumar</span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          background: 'var(--border)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-card)',
          overflow: 'hidden',
        }}
      >
        {FUNDERS.map((f, i) => (
          <div
            key={i}
            style={{
              background: 'var(--paper)',
              padding: '12px 16px',
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 12,
              alignItems: 'baseline',
            }}
          >
            <div style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink)' }}>
              {f.who}
              <div style={{ color: 'var(--ink50)', fontSize: 'var(--fs-micro)', marginTop: 2 }}>
                {f.sub}
              </div>
            </div>
            {f.fig ? (
              <div
                className="mono"
                style={{
                  fontSize: 'var(--fs-aux)',
                  color: 'var(--civic)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {f.fig}
              </div>
            ) : (
              <div
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', textAlign: 'right' }}
              >
                sin cifra
                <br />
                para Riba-roja
              </div>
            )}
          </div>
        ))}
      </div>
      <p
        className="cp-pie"
        style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', margin: '10px 0 0' }}
      >
        Cofinancian obras solapadas: <b style={{ color: 'var(--ink50)' }}>no deben sumarse</b> en
        una única cifra de reconstrucción.
      </p>
    </div>
  )
}

/* ---- Lo que sigue sin ejecutarse. El `Aparte` compartido, en petróleo: es lo
        que la pieza señala, y el ámbar —el color de un aviso para quien lee—
        no le pedía hacer nada. ---- */
function Callout() {
  const li = {
    marginBottom: 7,
    color: 'var(--ink70)',
    fontSize: 'var(--fs-body)',
    lineHeight: 1.45,
  }
  const em = { color: 'var(--civic-ink)' }
  return (
    <Aparte title="Adjudicado no es ejecutado" tono="foco">
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li style={li}>
          La reposición hídrica del municipio iba al <b style={em}>30 %</b> en 2026, según la
          concesionaria.
        </li>
        <li style={li}>
          Pendientes: colectores en <b style={em}>calle dels Fusters</b>, grupos electrógenos en{' '}
          <b style={em}>El Oliveral</b> y <b style={em}>Sector 13</b> (~100.000 €, sin adjudicar).
        </li>
        <li style={{ ...li, marginBottom: 0 }}>
          Las pasarelas del Túria no se reconstruyeron hasta <b style={em}>abril de 2026</b>, ~18
          meses después.
        </li>
      </ul>
    </Aparte>
  )
}

/**
 * Lo que suman los lugares con gasto DANA: cuántos, con cuántos contratos DANA y
 * por cuánto. Derivado de la lista que pintan las barras, no escrito: «Seis
 * emplazamientos», a mano, se quedó contando la lista de la versión del 06-07.
 */
/** Noviembre de 2024, el mes de la ola, de la misma serie que la gráfica. */
export function mesDeLaOla(timeline) {
  const m = timeline.find((x) => x.month === '2024-11')
  if (!m) throw new Error('reconstrucción DANA: la serie mensual no trae noviembre de 2024')
  return m
}

/** «1,33»: millones con dos decimales y coma, como los escribe la pieza. */
export const millones = (n) => (n / 1e6).toFixed(2).replace('.', ',')

export function danaSituadoDe(danaPlaces) {
  return {
    lugares: danaPlaces.length,
    contratos: danaPlaces.reduce((a, p) => a + p.danaContractCount, 0),
    importe: danaPlaces.reduce((a, p) => a + p.danaAmount, 0),
  }
}

/**
 * Las cuatro cifras de la cabecera. Función y no literal en el JSX: el test de los
 * emblemas comprueba que las que la figura ya imprime (y que la pieza esconde
 * donde la figura se ve) son de verdad tarjetas de aquí.
 */
export function kpisReconstruccion(t) {
  return [
    { n: '14,5 M€', l: 'solo del Estado (Orden TMD/101/2025)', tone: 'var(--civic)' },
    // Counts read from the data, not hardcoded. They were literals ('73',
    // '72') beside amounts that came from `t`, so correcting the totals
    // would have left the count saying 73 next to the corrected 2,75 M€.
    { n: String(t.danaContracts), l: `contratos ref. DANA · ${eurC(t.danaAmount)}` },
    // «62 geolocalizados» junto a «75 contratos» se leía como 62 contratos, y eran
    // 62 LUGARES (aquel recuento situaba 127). Desde el 18-10-2026 el campo cuenta
    // contratos y la tarjeta lo dice.
    {
      n: String(t.situatedContracts),
      l: `contratos situados en el mapa · ${eurC(t.situatedAmount)}`,
    },
    // Decía «0 órganos que fiscalizan los contratos municipales», y es falso: la
    // Sindicatura de Comptes es el órgano de control externo de las entidades locales,
    // programa «la fiscalización de la contratación en las entidades locales durante
    // 2023 y 2024» —2024 es el año de la riada— y revisa los reparos de los
    // interventores locales. Lo que sí es cero, y es lo que sostiene el reportaje, es
    // el alcance MUNICIPAL de los informes DANA: los dos especiales están acotados al
    // sector autonómico por su propio título.
    {
      n: '0',
      l: 'informes DANA de la Sindicatura que alcanzan al tramo municipal',
      // Petróleo, lo que la pieza señala. Iba en ámbar, el color de un aviso.
      tone: 'var(--civic-ink)',
    },
  ]
}

export default function ReconstruccionDana() {
  const { loading, error, data } = useReportaje('reconstruccion-dana')

  if (loading)
    return (
      <div className="cp-page" style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
        <p style={{ color: 'var(--ink70)' }}>Cargando reportaje…</p>
      </div>
    )
  if (error || !data)
    return (
      <div className="cp-page" style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
        <p style={{ color: 'var(--ink70)' }}>No se pudo cargar el reportaje.</p>
      </div>
    )

  const t = data.totals
  const m = data.meta
  const ej = data.ejecucion2025
  const danaSituado = danaSituadoDe(data.danaPlaces)
  const ola = mesDeLaOla(data.timelineFull)

  return (
    <div
      className="cp-page cp-pieza"
      style={{
        padding: '24px',
        maxWidth: 760,
        margin: '0 auto',
        fontSize: 'var(--fs-head)',
        lineHeight: 1.62,
      }}
    >
      {/* Cabecera común. Las tarjetas las arma la página con sus totales
          (`kpisReconstruccion`), y la entradilla son los dos párrafos de
          apertura, escritos aquí porque mezclan cifras del snapshot con prosa. */}
      <CabeceraPieza
        slug="reconstruccion-dana"
        data={data}
        borrador={{
          titulo: 'Borrador editorial · pendiente de derecho de réplica.',
          texto:
            'Esta pieza aún no es una publicación definitiva: se recabará la versión del Ayuntamiento de Riba-roja y se incorporará antes de darla por publicada.',
        }}
        kpis={kpisReconstruccion(t)}
        entradilla={
          <>
            <p style={ENTRADILLA}>
              En los días que siguieron a la DANA del 29 de octubre de 2024, el Ayuntamiento de
              Riba-roja de Túria firmó contratos casi a diario. Palas para despejar caminos,
              camiones para retirar el lodo, bombas para achicar los polígonos anegados. Solo en{' '}
              {/* De la serie de la gráfica, no escrito: decía «22 contratos por 1,39
                  millones», la serie del 6 de julio, y la corrección del 19-10-2026
                  rehízo la gráfica (21 y 1,33) sin tocar esta frase. Las dos cifras
                  del mismo mes quedaron a un palmo. */}
              noviembre de aquel año adjudicó{' '}
              <b>
                {ola.count} contratos por {millones(ola.amount)} millones de euros
              </b>
              , buena parte por el procedimiento de emergencia que permite la ley cuando no hay
              tiempo para un concurso. Año y medio después, la reconstrucción todavía se contrata:
              el último gran contrato con referencia a la DANA que consta en el registro público —un
              vallado de parcelas en los polígonos industriales por <b>445.313 euros</b>— se
              adjudicó en marzo de 2026.
            </p>
            <p style={{ ...ENTRADILLA, margin: '14px 0 0' }}>
              Entre esas dos fechas, un análisis de la contratación municipal permite seguir el
              rastro del dinero contrato a contrato, y en muchos casos calle a calle. De los{' '}
              {/* «entre 2018 y 2026» era falso: el denominador congelado son los 698 contratos
                  adjudicados del snapshot del 02-08-2026, y su adjudicación más antigua es del
                  03-07-2017. 2017 aporta 15 contratos y 3,35 M€ — el 4,9% de la cifra. */}
              {eurC(t.totalAwarded)} que el Ayuntamiento adjudicó entre julio de 2017 y julio de
              2026 —sin contar la concesión del agua, que se adjudica por sus diecisiete años de una
              vez y por sí sola pesa casi tanto como todo lo demás junto—,{' '}
              <b>
                {t.danaContracts} contratos por {eurC(t.danaAmount)} referencian expresamente la
                DANA
              </b>{' '}
              en su título. Es una cifra conservadora —el suelo trazable, no el total de la
              reconstrucción—, pero{' '}
              <b>extiende en 16 meses la última cuenta pública del propio Ayuntamiento</b>, que en
              2024 cifró en 63 contratos de emergencia y 2.048.621 euros su respuesta inmediata a la
              riada.
            </p>
          </>
        }
      />

      <article style={{ color: 'var(--ink70)' }}>
        <SecHead num="01" kicker="Cuándo" title="La ola y la cola" />
        <p>
          El grueso llegó de golpe. La retirada de fango y la limpieza de caminos y viales coparon
          las primeras semanas: media docena de empresas se repartieron esos trabajos entre el 20 y
          el 25 de noviembre de 2024, cada una por importes de entre 55.000 y 240.000 euros.
          Después, el ritmo cayó y la contratación se estiró durante todo 2025 y hasta bien entrado
          2026: recuperación de instalaciones, colectores, grupos electrógenos, ascensores.
        </p>
        <Card style={{ margin: '18px 0 8px' }}>
          <SectionHead
            eyebrow="Cuándo · nov 2024 – abr 2026"
            title="Contratos con referencia DANA, por mes"
          />
          <div style={{ marginTop: 10 }}>
            <Timeline data={data.timelineFull} />
          </div>
        </Card>
        <p className="cp-pie" style={cap()}>
          Importe adjudicado (sin IVA) por mes. Fuente: PLACSP/Gobierto · contratos cuyo título
          referencia la DANA.
        </p>

        <SecHead num="02" kicker="Dónde" title="El mapa, contrato a contrato" />
        <p>
          {/* Decía «l'Oliveral (125.000 euros, seis contratos) y La Reva le sigue de cerca
              (99.000 euros, siete contratos)»: los contratos eran TODOS los del lugar, no los
              de la DANA, y el mapa era el de la versión del 06-07. Rehecho el 18-10-2026 sobre
              la misma lista que dibuja el mapa; el porqué, en la corrección de esa fecha. */}
          Situados sobre el mapa del municipio, esos contratos se concentran donde más golpeó el
          agua. El poblado de <b>l'Oliveral</b> absorbe el mayor gasto DANA geolocalizado (125.000
          euros en dos contratos, el mayor de ellos en calles de los polígonos industriales El
          Oliveral y Sector 14); le siguen el <b>polideportivo municipal</b> (114.000 euros, un
          contrato: el cambio de pavimento de sus pistas) y la urbanización <b>La Reva</b> (101.000
          euros, cuatro contratos). El alcalde, Robert Raga (PSPV), cifró en unas 1.400 empresas y
          20.000 trabajadores el tejido del área industrial afectada por la DANA.
        </p>
        <Card style={{ margin: '18px 0 8px' }}>
          <SectionHead eyebrow="Dónde" title="Contratos municipales geolocalizados" />
          <div style={{ marginTop: 10 }}>
            <Suspense fallback={<div className="cp-mapa-dana" />}>
              <MapaDana
                boundary={data.boundary}
                bbox={data.bbox}
                places={data.places}
                danaPlaces={data.danaPlaces}
              />
            </Suspense>
            <ClaveMapa />
          </div>
        </Card>
        <p className="cp-pie" style={cap()}>
          Un punto por lugar: {data.places.length} lugares que nombran {t.situatedContracts}{' '}
          contratos. Un contrato cuyo título nombra varios lugares no se sitúa en ninguno. Radio
          proporcional a √importe; en petróleo, los lugares con algún contrato que referencia la
          DANA, y en gris el resto. Los dos con más gasto DANA llevan su nombre; los demás lo dicen
          al pasar por encima o al tocarlos. En discontinua, el contorno del término (OSM), sobre el
          mapa base de OpenStreetMap. Fuente: tender-geo · resolutor determinista de topónimos.
        </p>

        <SecHead num="03" kicker="Quién" title="Los adjudicatarios" />
        <p>
          Ocho empresas concentran la mayor parte del gasto DANA trazado. Los describimos por lo que
          consta en el registro público —importe y objeto—, sin atribuir irregularidad.
        </p>
        <Card style={{ margin: '18px 0 20px' }}>
          <Barras
            rows={data.contractors.map((c) => ({
              label: c.name,
              value: c.amount,
              count: c.count,
            }))}
          />
        </Card>

        <SecHead num="04" kicker="Zonas" title="El gasto DANA que hemos podido situar" />
        <p>
          {/* «Seis emplazamientos», escrito a mano, sobre la lista de la versión del 06-07. Se
              deriva de la lista para que no vuelva a separarse de las barras. */}
          El gasto DANA que el título del contrato permite ubicar con precisión se reparte en{' '}
          {danaSituado.lugares} lugares: {danaSituado.contratos} de los {t.danaContracts} contratos
          con referencia a la DANA, por {eurC(danaSituado.importe)} de {eurC(t.danaAmount)}. Una
          fracción del total, no el mapa de la reconstrucción.
        </p>
        <Card style={{ margin: '18px 0 20px' }}>
          <Barras
            rows={data.danaPlaces.map((p) => ({
              label: p.name,
              value: p.danaAmount,
              // Los contratos DANA del lugar, como cuentan las barras de adjudicatarios;
              // `contractCount` son todos los del lugar.
              count: p.danaContractCount,
            }))}
          />
        </Card>

        <SecHead num="05" kicker="Financiación" title="De dónde viene el dinero" />
        <p>
          La reconstrucción de Riba-roja se financia desde al menos cinco administraciones, y
          conviene no confundir lo anunciado con lo ejecutado ni sumar unas ayudas con otras, porque
          cofinancian obras solapadas. Solo del Estado, el municipio tiene reconocidos{' '}
          <b>14.553.099,88 euros</b> por la Orden TMD/101/2025, que cubre hasta el 100 % de la
          reparación de infraestructuras.
        </p>
        <Funders />
        <p>
          {/* Decía «el presupuesto municipal de reconstrucción para 2025 —43,5 millones—», que
              invitaba a leerlo como una partida de reconstrucción. No lo es: 43,5 M€ es el
              presupuesto ENTERO del municipio para 2025 (nuestro propio dato de ingresos, 43.516.817
              €), y por eso superaba al gasto municipal de todo el año, 41,58 M€ — una comparación
              imposible que el reportaje dejaba en pie. La prensa lo tituló «presupuesto para la
              reconstrucción» y aquí se tomó al pie de la letra. */}
          El presupuesto municipal de 2025 —43,5 millones, cuatro más que el ejercicio anterior—
          recibió su aprobación inicial en el pleno extraordinario y urgente del 31 de julio de
          2025, con los votos a favor del gobierno del PSPV, el rechazo del PP y la abstención de
          Compromís, Esquerra Unida-Podem y Vox. Llegó con siete meses de retraso, y el retraso es
          el dato: el Ayuntamiento lo atribuyó a los daños de la riada y presentó las cuentas como
          el presupuesto de la reconstrucción. No es una partida de 43,5 millones para reconstruir
          —es el presupuesto entero del municipio, cuyo crédito de gastos rendido al ministerio para
          2025 era de 41,58 millones—, sino el año completo ordenado alrededor de ella.
          {/* Decía «Lo efectivamente reconocido a 31 de diciembre fue menos de la mitad: 18,91
              millones», escrito a mano desde la hoja del segundo trimestre que el sitio leyó
              como cierre hasta el 22-10-2026 (#417). El arreglo de los datos no llegó a la
              frase, así que ahora sale de `ejecucion2025`, congelado en el JSON de la pieza y
              vigilado por check:drift contra el cierre de budget-execution.json. */}
          {ej && (
            <>
              {' '}
              A 31 de diciembre se habían reconocido obligaciones por{' '}
              {millones(ej.obligacionesReconocidas)} millones: el{' '}
              {Math.round((ej.obligacionesReconocidas / ej.creditoInicial) * 100)} % del crédito
              inicial y el {Math.round((ej.obligacionesReconocidas / ej.creditoDefinitivo) * 100)} %
              del crédito definitivo, que las modificaciones del año llevaron a{' '}
              {millones(ej.creditoDefinitivo)} millones.
            </>
          )}
        </p>

        <SecHead num="06" kicker="El vacío" title="Quién audita esto, y con qué lupa" />
        <p>
          {/* Los dos {' '} de este párrafo no son adorno: JSX se come el salto de
              línea entre una palabra y una etiqueta, y se publicaba «control
              externoespecífico» y «de esamirada» (revisión del 19-10-2026). */}
          Ese caudal de dinero público llega, en su tramo municipal, sin un control externo{' '}
          <i>específico de la DANA</i>. La Sindicatura de Comptes anunció la fiscalización de los
          contratos y subvenciones ligados a la riada, pero acotada al <b>sector autonómico</b> —la
          ferroviaria FGV y la pública VAERSA, donde ya detectó sobrecostes y falta de
          transparencia—, no a los ayuntamientos: sus dos informes especiales llevan «en el sector
          autonómico» en el propio título. Los contratos de emergencia municipales, adjudicados a
          menudo sin concurrencia por la urgencia de la catástrofe, quedan fuera de <i>esa</i>{' '}
          mirada. Tampoco el visor infoDANA del Gobierno, que detalla las ayudas{' '}
          <i>pueblo a pueblo</i>, desciende al contrato concreto ni a la calle.
        </p>
        <p>
          Eso no significa que nadie mire. La Sindicatura es el órgano de control externo de las
          entidades locales, a la que los ayuntamientos rinden su Cuenta General, y su programa
          anual incluye{' '}
          <b>la fiscalización de la contratación en las entidades locales durante 2023 y 2024</b>{' '}
          —2024 es el año de la riada— además de la revisión de los reparos de los interventores
          locales. La diferencia es el foco: esa fiscalización mira la contratación municipal en
          general y por muestreo, no el gasto de la reconstrucción como tal. Un contrato de
          emergencia de Riba-roja puede entrar en ella, pero ningún informe publicado hasta hoy
          responde a la pregunta de cuánto se gastó aquí en reconstruirse y en qué.
        </p>

        <SecHead num="07" kicker="Lo pendiente" title="Lo que sigue sin ejecutarse" />
        {/* Decía «Casi dieciocho meses después de la riada»: en el borrador, esa cuenta era la
            de las pasarelas, reconstruidas en abril de 2026 (la caja de abajo la conserva). Al
            subir a abrir el apartado perdió su referente, y la pieza es de julio de 2026, veinte
            meses después (revisión lectora, 18-10-2026; corrección del 19-10). */}
        <p>
          Adjudicar no es terminar. Cuando se publicó esta pieza, en julio de 2026, buena parte de
          la reconstrucción seguía en marcha —o sin empezar—.
        </p>
        <Callout />
        <p style={{ marginTop: 20 }}>
          La DANA causó seis víctimas mortales en el término municipal, según el balance del
          Ayuntamiento, y una factura que la administración aún salda a plazos: el Consistorio ha
          cifrado en torno a los 22 millones de euros los daños del municipio. Este análisis no
          atribuye a nadie una mala gestión: pone sobre la mesa, con datos abiertos y verificables,{' '}
          {/* Sin el {' '} de arriba, JSX se come el salto de línea junto al comentario y se
              publicaba «verificables,qué». */}
          {/* Decía «adónde ha ido el dinero de la reconstrucción», y a dos líneas de los 22 M€ de
              daños eso se lee como el total. Lo que se traza son 2,75 M€ en contratos que dicen
              «DANA» en el título: el suelo, como la propia pieza advierte más arriba. La frase de
              cierre es donde el lector se queda con la idea, así que ahí el matiz no es opcional. */}
          qué parte de ese dinero deja rastro en el registro público de contratos —2,75 de esos 22
          millones— y qué queda por hacer.
        </p>
      </article>

      {/* Fuentes y método: una caja debajo de la otra, con el texto a la medida
          de lectura, como en las otras piezas. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          margin: '32px 0 0',
        }}
      >
        <div
          style={{
            background: 'var(--soft)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '18px 20px',
          }}
        >
          <h3 style={boxH()}>Fuentes primarias</h3>
          <ul style={{ ...boxUl(), maxWidth: 'var(--medida)' }}>
            <li style={boxLi()}>
              <b>PLACSP / Gobierto</b> — el ledger contrato a contrato.
            </li>
            <li style={boxLi()}>
              <b>BOE</b> — Orden TMD/101/2025; RDL DANA 6/2024 y 7/2024.
            </li>
            <li style={boxLi()}>
              <b>Ayuntamiento</b> — nota «14,5 millones» + acuerdos de la Junta de Gobierno Local.
            </li>
            <li style={boxLi()}>
              <b>Regmeet / ribarroja.es</b> — orden del día del pleno del 31-jul-2025.
            </li>
            <li style={boxLi()}>
              <b>Generalitat</b> — balance de reconstrucción + visor infoDANA.
            </li>
          </ul>
        </div>
        <div
          style={{
            background: 'var(--soft)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '18px 20px',
          }}
        >
          <h3 style={boxH()}>Método y cautelas</h3>
          <ul style={{ ...boxUl(), maxWidth: 'var(--medida)' }}>
            <li style={boxLi()}>
              <b>«DANA» = coincidencia por palabra en el título</b> del contrato: el suelo trazable,
              no el total de reconstrucción.
            </li>
            <li style={boxLi()}>
              {/* La fecha de los IMPORTES, no la de la pieza. «datos a {fechaDatos}»
                  decía 06-07 sobre cifras que la corrección del 02-08-2026 recalculó
                  con el registro de ese día (metodo.recalculadoEl): lo señaló la
                  revisión lectora el 18-10-2026. fechaDatos se queda, porque las
                  listas la usan como fecha de la pieza. */}
              {data.metodo?.recalculadoEl
                ? `Importes sin IVA, sobre contratos adjudicados, recalculados el ${data.metodo.recalculadoEl} sobre el registro de ese día.`
                : `Importes sin IVA, sobre contratos adjudicados (datos a ${m.fechaDatos}).`}{' '}
              <b>Adjudicado ≠ ejecutado</b>; los financiadores no se suman.
            </li>
            {data.metodo?.situadoEl && (
              <li style={boxLi()}>
                Lo situado en el mapa se recalculó el {data.metodo.situadoEl} con el resolutor de
                topónimos de ese día, sobre los mismos contratos.
              </li>
            )}
            <li style={boxLi()}>
              Fallecidos, daños municipales, tejido industrial y sentido del voto: declaraciones del
              Ayuntamiento recogidas por la prensa local.
            </li>
            <li style={boxLi()}>
              Cada cifra enlaza a su fuente. Metodología en{' '}
              <a href="/metodologia" style={{ color: 'var(--civic)' }}>
                /metodologia
              </a>
              .
            </li>
          </ul>
        </div>
      </div>

      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          margin: '16px 0 0',
          lineHeight: 1.5,
        }}
      >
        Este medio solicitó la versión del Ayuntamiento de Riba-roja, que no respondió dentro del
        plazo. El derecho de réplica sigue abierto: se publicará íntegro si se recibe. Contacto y
        correcciones:{' '}
        <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
          aviso legal
        </a>
        .
      </p>

      <CorrectionNote correcciones={m.correcciones} />
    </div>
  )
}

function cap() {
  return {
    fontSize: 'var(--fs-meta)',
    color: 'var(--ink50)',
    margin: '10px 0 4px',
    lineHeight: 1.45,
  }
}
function boxH() {
  return {
    fontSize: 'var(--fs-meta)',
    textTransform: 'uppercase',
    letterSpacing: '.1em',
    color: 'var(--ink50)',
    margin: '0 0 12px',
    fontWeight: 700,
  }
}
function boxUl() {
  return { margin: 0, paddingLeft: 18 }
}
function boxLi() {
  return { fontSize: 'var(--fs-aux)', color: 'var(--ink50)', marginBottom: 8, lineHeight: 1.45 }
}
