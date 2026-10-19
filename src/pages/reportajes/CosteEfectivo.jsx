import { useReportaje } from '../../hooks/useReportaje'
import CabeceraPieza from '../../components/reportajes/CabeceraPieza'
import { CorrectionNote } from '../../components/reportajes/CorrectionNote'
import { SecHead, Revela, Pliegue } from '../../components/reportajes/Pieza'
import { FichaSociedad } from '../../components/reportajes/FichaSociedad'
import { useSociedades, indexarSociedades } from '../../hooks/useSociedades'
import { enCastellano } from '../../scraper/solicitud-enviada'
// La tarjeta de las solicitudes es la del conteo, no una copia. Había una
// copia aquí, «misma frase que en el conteo» según su comentario, y se quedó
// atrás en cada cambio de aquélla: renglones de cien caracteres, lo pedido sin
// rótulo, la nota a --fs-micro, y sin plegar.
import { SolicitudesEnviadas } from './ConteoVisitantes'
import { isoDeFecha, msDeIso, silencioDeLaFicha, duracion } from '../../lib/cronologia'

const SERIF = "'Fraunces', Georgia, serif"

// El cuerpo, al tamaño de la pieza (--fs-head, heredado del contenedor) como en
// las otras cuatro. Iba a --fs-body: la única pieza con el texto corrido a 14px,
// y a la medida de lectura eso eran ochenta y tantos caracteres por línea.
const P = ({ children }) => <p style={{ color: 'var(--ink70)', margin: '12px 0' }}>{children}</p>

/* ---- Figura con marco y pie, para las tres piezas gráficas ---- */
function Figura({ titulo, pie, children }) {
  return (
    <figure
      style={{
        margin: '18px 0',
        padding: '16px 18px',
        background: 'var(--soft)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card)',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          color: 'var(--ink50)',
          marginBottom: 12,
        }}
      >
        {titulo}
      </div>
      {children}
      {pie && (
        <figcaption
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            marginTop: 12,
            lineHeight: 1.5,
          }}
        >
          {pie}
        </figcaption>
      )}
    </figure>
  )
}

/* ---- Las once casillas de entrega. Rejilla, no flex: con flex la última
        caía sola a la segunda línea estirada a todo el ancho — justo la
        casilla que no debe llamar la atención.
        La entrega sin rendir va en rojo, no en ámbar: es un incumplimiento que
        Hacienda registra, y el emblema de la cabecera ya la pinta en rojo. Iba
        en ámbar aquí y en las barras de abajo, y el mismo año salía con dos
        colores en la misma pieza. ---- */
function CasillasEntregas({ publicadas, noPresentadas }) {
  const sin = new Set(noPresentadas)
  return (
    <div
      role="img"
      aria-label={`De ${publicadas.length} entregas publicadas por el ministerio, el ayuntamiento no rindió ${noPresentadas.length}: ${noPresentadas.join(', ')}.`}
      style={{
        display: 'grid',
        gap: 6,
        gridTemplateColumns: 'repeat(auto-fit, minmax(52px, 1fr))',
      }}
    >
      {publicadas.map((a) => {
        const falta = sin.has(a)
        return (
          <div
            key={a}
            className="mono"
            style={{
              textAlign: 'center',
              padding: '10px 4px 8px',
              borderRadius: 'var(--r-input)',
              border: falta ? '1px solid var(--crit)' : '1px solid var(--border)',
              color: falta ? 'var(--crit-ink)' : 'var(--ink70)',
              background: falta
                ? 'repeating-linear-gradient(45deg, var(--crit-soft) 0 5px, transparent 5px 10px)'
                : 'var(--paper)',
              fontSize: 'var(--fs-meta)',
            }}
          >
            {a}
            <div
              style={{
                fontSize: 'var(--fs-micro)',
                marginTop: 2,
                color: falta ? 'var(--crit-ink)' : 'var(--ok-ink)',
              }}
            >
              {falta ? 'sin rendir' : '✓'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---- Barras: ayuntamientos que rindieron cada entrega. El año propio sin
        rendir va en rojo, el del emblema, Y es la barra más larga: eso ES el argumento. ---- */
function BarrasRendicion({ porAnio, anioPropio }) {
  const max = Math.max(...porAnio.map((f) => f.n))
  return (
    <Revela style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {porAnio.map((f, i) => {
        const propio = f.anio === anioPropio
        return (
          <div
            key={f.anio}
            style={{
              display: 'grid',
              gridTemplateColumns: '46px 1fr 44px',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-meta)',
                color: propio ? 'var(--crit-ink)' : 'var(--ink50)',
                fontWeight: propio ? 700 : 400,
              }}
            >
              {f.anio}
            </span>
            <div
              style={{
                height: 12,
                background: 'var(--border)',
                borderRadius: 'var(--r-input)',
                overflow: 'hidden',
              }}
            >
              <div
                className="cp-crece-x"
                style={{
                  '--i': i,
                  '--paso': '50ms',
                  width: `${(100 * f.n) / max}%`,
                  height: '100%',
                  background: propio ? 'var(--crit)' : 'var(--civic)',
                }}
              />
            </div>
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-meta)',
                textAlign: 'right',
                color: propio ? 'var(--crit-ink)' : 'var(--ink70)',
                fontWeight: propio ? 700 : 400,
              }}
            >
              {f.n}
            </span>
          </div>
        )
      })}
    </Revela>
  )
}

/* ---- La franja de comparables: mitad central sombreada, mediana marcada,
        Riba-roja como punto. Misma gramática que BandaPares en /eficiencia,
        congelada a la cifra de esta pieza.
        Los comparables en gris y Riba-roja en petróleo: es lo que la pieza
        mira, no un fallo —el texto dice que «no es una rareza local»—. Iba en
        ámbar, y con la mediana en petróleo el énfasis caía en los demás. ---- */
function FranjaComparables({ banda }) {
  // Las cuatro cifras en es-ES. La de Riba-roja iba en crudo y se publicó
  // «86.7 %» con punto inglés al lado de «41,3 %»: sólo había pasado
  // desapercibida mientras valía 100, sin decimales que delataran el formato.
  const es = (v) => v.toLocaleString('es-ES')
  return (
    <div
      role="img"
      aria-label={`Entre ${banda.n} municipios comparables, la mediana repite el ${es(banda.mediana)} % de sus denominadores; el rango intercuartílico va del ${es(banda.p25)} % al ${es(banda.p75)} %. Riba-roja repite el ${es(banda.propio)} %.`}
      style={{ position: 'relative', height: 82, margin: '6px 0 2px' }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 27,
          height: 10,
          background: 'var(--border)',
          borderRadius: 'var(--r-input)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${banda.p25}%`,
          width: `${banda.p75 - banda.p25}%`,
          top: 27,
          height: 10,
          background: 'var(--ink30)',
          borderRadius: 'var(--r-input)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${banda.mediana}%`,
          top: 21,
          width: 2,
          height: 22,
          background: 'var(--ink70)',
        }}
      />
      <span
        className="mono"
        style={{
          position: 'absolute',
          left: `${banda.p25}%`,
          top: 0,
          transform: 'translateX(-50%)',
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          whiteSpace: 'nowrap',
        }}
      >
        p25 · {banda.p25.toLocaleString('es-ES')} %
      </span>
      <span
        className="mono"
        style={{
          position: 'absolute',
          left: `${banda.mediana}%`,
          top: 44,
          transform: 'translateX(-50%)',
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          whiteSpace: 'nowrap',
        }}
      >
        mediana · {banda.mediana.toLocaleString('es-ES')} %
      </span>
      <span
        className="mono"
        style={{
          position: 'absolute',
          left: `${banda.p75}%`,
          top: 0,
          transform: 'translateX(-50%)',
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          whiteSpace: 'nowrap',
        }}
      >
        p75 · {banda.p75.toLocaleString('es-ES')} %
      </span>
      <div
        title={`Riba-roja: ${es(banda.propio)} %`}
        style={{
          position: 'absolute',
          left: `${banda.propio}%`,
          top: 26,
          width: 12,
          height: 12,
          marginLeft: -6,
          borderRadius: 'var(--r-pill)',
          background: 'var(--civic)',
          boxShadow: '0 0 0 2px var(--paper)',
        }}
      />
      {/* Una fila propia, debajo de la de la mediana. Compartían fila y a 375px
          «mediana · 57,7 %» y «Riba-roja · 86,7 %» se pisaban 50px: con el
          punto propio a la derecha de la mediana, las dos etiquetas crecen una
          hacia la otra. Medido con getBoundingClientRect, no a ojo. */}
      <span
        className="mono"
        style={{
          position: 'absolute',
          right: 0,
          top: 62,
          fontSize: 'var(--fs-micro)',
          color: 'var(--civic-ink)',
          fontWeight: 700,
        }}
      >
        Riba-roja · {es(banda.propio)} %
      </span>
    </div>
  )
}

/* ---- Nominal contra real, por servicio. Los corrientes en gris y los
        constantes en petróleo: la pieza habla de lo que queda al quitar el
        nivel de precios, y eso es lo que se mira. Los corrientes iban en ámbar,
        el color de un aviso, y se llevaban la vista. ---- */
function ParNominalReal({ servicios }) {
  const max = Math.max(...servicios.map((s) => s.nominal))
  const fmt = (v) =>
    `${v > 0 ? '+' : ''}${v.toLocaleString('es-ES', { maximumFractionDigits: 0 })} %`
  return (
    <Revela style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {servicios.map((s, i) => (
        <div key={s.nombre}>
          <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink)', marginBottom: 6 }}>
            {s.nombre} <span style={{ color: 'var(--ink50)' }}>· {s.tramo}</span>
          </div>
          {[
            { que: 'corrientes', v: s.nominal, color: 'var(--ink30)' },
            { que: 'constantes', v: s.real, color: 'var(--civic)' },
          ].map((fila, j) => (
            <div
              key={fila.que}
              style={{
                display: 'grid',
                gridTemplateColumns: '74px 1fr 56px',
                alignItems: 'center',
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>{fila.que}</span>
              <div style={{ height: 11, borderRadius: 'var(--r-input)', overflow: 'hidden' }}>
                <div
                  className="cp-crece-x"
                  style={{
                    '--i': 2 * i + j,
                    width: `${Math.max(1.5, (100 * fila.v) / max)}%`,
                    height: '100%',
                    background: fila.color,
                    borderRadius: 'var(--r-input)',
                  }}
                />
              </div>
              <span
                className="mono"
                style={{ fontSize: 'var(--fs-meta)', textAlign: 'right', color: 'var(--ink70)' }}
              >
                {fmt(fila.v)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </Revela>
  )
}

/** Euros redondeados al euro: los céntimos de un contrato de ocho cifras son ruido. */
const eur = (v) =>
  v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/* ---- La cronología del expediente. Siete años en una columna: lo que cuenta
        no es cada hito por separado sino el hueco entre febrero de 2021 y abril
        de 2026, que sólo se ve si están todos en fila. ---- */
/* ---- La tira: cada hito en la fecha de su acto y, encima, el mayor hueco entre
        dos publicaciones de la ficha del expediente. El hueco se calcula de las
        fechas `ficha` que la propia frase de cada hito da (src/lib/cronologia.js);
        un hito cuya publicación la pieza no fecha no cuenta. La lista de debajo
        sigue siendo la fuente: la tira sólo pone en fila lo que la lista dice, que
        es lo que el comentario de arriba pedía —«el hueco sólo se ve si están
        todos en fila»—. ---- */
function TiraCronologia({ hitos }) {
  const puntos = hitos.map((h) => ({ h, iso: isoDeFecha(h.f) }))
  // Un hito que no se sabe fechar deja la tira sin dibujar: mejor la lista sola
  // que una tira con un punto de menos.
  if (!puntos.length || puntos.some((p) => !p.iso)) return null
  const isos = puntos.map((p) => p.iso).sort()
  const [primero, ultimo] = [isos[0], isos[isos.length - 1]]
  const a0 = Number(primero.slice(0, 4))
  const a1 = Number(ultimo.slice(0, 4)) + 1
  const t0 = Date.UTC(a0, 0, 1)
  const t1 = Date.UTC(a1, 0, 1)
  const x = (iso) => ((msDeIso(iso) - t0) / (t1 - t0)) * 100
  const anios = Array.from({ length: a1 - a0 }, (_, i) => a0 + i)
  const silencio = silencioDeLaFicha(hitos)
  const cuanto = silencio && duracion(silencio.desde, silencio.hasta)
  const resumen =
    `${puntos.length} hitos, del ${enCastellano(primero)} al ${enCastellano(ultimo)}.` +
    (silencio
      ? ` Entre la entrada de la ficha del ${enCastellano(silencio.desde)} y la siguiente, la del ${enCastellano(silencio.hasta)}, pasan ${cuanto}.`
      : '')
  return (
    <div style={{ margin: '0 0 16px' }}>
      <Revela className="cp-tira" style={{ height: 94 }}>
        <div role="img" aria-label={resumen} style={{ position: 'absolute', inset: 0 }}>
          {silencio && (
            <>
              <div
                className="cp-tira-hueco cp-crece-x"
                style={{
                  '--dur': '1200ms',
                  '--ease': 'var(--ease-base)',
                  left: `${x(silencio.desde)}%`,
                  width: `${x(silencio.hasta) - x(silencio.desde)}%`,
                }}
              />
              <div
                className="mono cp-tira-rotulo"
                style={{
                  left: `${x(silencio.desde)}%`,
                  width: `${x(silencio.hasta) - x(silencio.desde)}%`,
                }}
              >
                <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{cuanto}</span>
                <span className="cp-tira-rotulo-mas">
                  {' '}
                  de una entrada de la ficha a la siguiente
                </span>
              </div>
            </>
          )}
          {puntos.map(({ h, iso }, i) => (
            <div
              key={h.f}
              className="cp-tira-punto cp-brota"
              title={`${h.f}: ${h.t}`}
              style={{ '--i': i, '--d': '300ms', '--paso': '45ms', left: `${x(iso)}%` }}
            />
          ))}
          <div className="cp-tira-eje" />
          {anios.map((a, i) => (
            <div key={a}>
              <div className="cp-tira-marca" style={{ left: `${x(`${a}-01-01`)}%` }} />
              <div
                className={`mono cp-tira-anio${i % 2 ? ' cp-tira-anio--alterno' : ''}`}
                style={{
                  left: `${x(`${a}-01-01`)}%`,
                  width: `${x(`${a + 1}-01-01`) - x(`${a}-01-01`)}%`,
                }}
              >
                {a}
              </div>
            </div>
          ))}
        </div>
      </Revela>
      {silencio && (
        <p
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            lineHeight: 1.5,
            margin: '8px 0 0',
          }}
        >
          Cada marca es un hito de la lista, en la fecha del acto. La banda va de la entrada de la
          ficha del {enCastellano(silencio.desde)} a la siguiente que recoge la cronología, la del{' '}
          {enCastellano(silencio.hasta)}.
        </p>
      )}
    </div>
  )
}

function Cronologia({ cronologia }) {
  if (!cronologia?.hitos?.length) return null
  return (
    <Figura titulo="El expediente, hito a hito" pie={cronologia.nota}>
      <TiraCronologia hitos={cronologia.hitos} />
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {cronologia.hitos.map((h) => (
          <li
            key={h.f}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(120px, 168px) 1fr',
              gap: 12,
              padding: '8px 0',
              borderTop: '1px solid var(--border)',
              alignItems: 'baseline',
            }}
          >
            <span className="mono" style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
              {h.f}
            </span>
            <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}>{h.t}</span>
          </li>
        ))}
      </ol>
    </Figura>
  )
}

/* ---- Los contratos de emergencia de la DANA. Se publican por lo que dicen del
        expediente parado, no por a quién se adjudicaron: por eso la nota de
        cómo se leen va debajo y no plegada. ---- */
function DuranteLaEspera({ bloque }) {
  const b = bloque
  return (
    <>
      <h3
        style={{
          fontFamily: SERIF,
          fontSize: 'var(--fs-head)',
          fontWeight: 600,
          margin: '26px 0 0',
        }}
      >
        {b.titulo}
      </h3>
      <P>{b.intro}</P>
      <Figura
        titulo={`Contratos de emergencia tras la DANA · publicados el ${b.fecha.split('-').reverse().join('-')}`}
        pie={b.importeNota}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {b.contratos.map((c) => (
            <div
              key={c.objeto}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 10,
                alignItems: 'baseline',
                padding: '6px 0',
                borderTop: '1px solid var(--border)',
                fontSize: 'var(--fs-meta)',
              }}
            >
              <span>{c.objeto}</span>
              <span className="mono">{eur(c.importe)}</span>
            </div>
          ))}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 10,
              alignItems: 'baseline',
              paddingTop: 7,
              borderTop: '2px solid var(--border)',
              fontSize: 'var(--fs-meta)',
              fontWeight: 650,
            }}
          >
            <span>Total</span>
            <span className="mono">{eur(b.total)}</span>
          </div>
        </div>
      </Figura>
      <P>{b.comoSeLee}</P>
      <p style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', margin: '8px 0 0' }}>
        Expediente {b.expediente} ·{' '}
        <a href={b.url} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--civic)' }}>
          ficha en la Plataforma de Contratación ↗
        </a>
      </p>
    </>
  )
}

/* ---- La tarifa: dónde está publicada y qué dice cada sitio. Hasta el
        2026-09-17 este bloque contaba un hueco que no existía —la tarifa está
        en el DOGV de 2013 y en el estudio de viabilidad del expediente—, porque
        la búsqueda no miró el DOGV y dio por caducados unos enlaces que sólo
        fallaban truncados. Cada sitio lleva su enlace para que el lector lo
        compruebe sin fiarse de nosotros. ---- */
function LaTarifa({ bloque }) {
  const b = bloque
  // Sin título propio: va plegada, y el título es el rótulo del pliegue.
  return (
    <>
      <P>{b.cuerpo}</P>
      <div className="cp-texto" style={{ margin: '12px 0' }}>
        {b.buscadoEn.map((x) => (
          <div
            key={x.donde}
            style={{
              padding: '10px 0',
              borderTop: '1px solid var(--border)',
              fontSize: 'var(--fs-meta)',
              color: 'var(--ink70)',
            }}
          >
            <a
              href={x.url}
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: 'var(--civic)', fontWeight: 550 }}
            >
              {x.donde} ↗
            </a>
            <div style={{ marginTop: 3 }}>{x.resultado}</div>
          </div>
        ))}
      </div>
      <P>{b.cierre}</P>
    </>
  )
}

/* ---- Quién remite el coste efectivo, según la norma que lo regula.
        Hasta el 2026-09-17 aquí iba el nombre del concejal con la Hacienda
        delegada en 2019, con una salvedad delante. Se retiró: la Orden
        HAP/2105/2012 (art. 4.1.b) centraliza la remisión en la Intervención, y
        el decreto citado ya no estaba en vigor cuando venció la entrega. Una
        salvedad no arregla un nombre que ningún documento liga al hecho; lo
        arregla no ponerlo. Lo que se publica es la norma, con su cita. ---- */
function QuienRemite({ bloque }) {
  const b = bloque
  return (
    <>
      <h3
        style={{
          fontFamily: SERIF,
          fontSize: 'var(--fs-head)',
          fontWeight: 600,
          margin: '26px 0 0',
        }}
      >
        {b.titulo}
      </h3>
      <P>{b.cuerpo}</P>
      <figure
        style={{
          margin: '14px 0',
          padding: '12px 14px',
          borderLeft: '3px solid var(--border)',
          background: 'var(--soft)',
        }}
      >
        <blockquote
          style={{
            margin: 0,
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            lineHeight: 1.55,
          }}
        >
          «{b.cita}»
        </blockquote>
        <figcaption style={{ marginTop: 8, fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          {b.fuente} ·{' '}
          <a
            href={b.url}
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: 'var(--civic)' }}
          >
            texto consolidado en el BOE ↗
          </a>
        </figcaption>
      </figure>
    </>
  )
}

export default function CosteEfectivo() {
  const { loading, error, data } = useReportaje('coste-efectivo')
  const { data: sociedades } = useSociedades()

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

  const m = data.meta
  const c = data.concesion
  const ficha = indexarSociedades(sociedades).get('hidraqua')
  const cong = data.congelados
  const inf = data.inflacion

  /**
   * Las entregas que superaron a la que el ayuntamiento no rindió.
   *
   * Se DERIVA de `rendicionCV.porAnio` en vez de recitarse. La frase que
   * descarta la pandemia se publicó el 16-08 con dos cifras a mano —«503; sólo
   * 2017, con 513, rindió más»— calculadas sobre un gráfico recortado en 2017,
   * y con las once entregas delante era falsa: 2014 (517) y 2016 (515) también
   * superan a 2020. Derivarla es lo que impide que vuelva a quedarse vieja si
   * el ministerio revisa una entrega o se añade otra.
   */
  const rc = data.rendicionCV.porAnio
  const entregaAusente = data.entregas.noPresentadas[0]
  const nAusente = rc.find((r) => r.anio === entregaAusente)?.n
  const superaron = rc.filter((r) => r.n > nAusente).sort((a, b) => a.anio - b.anio)

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
      <CabeceraPieza
        slug="coste-efectivo"
        data={data}
        borrador={{
          titulo: 'Borrador editorial · pendiente de revisión afirmación por afirmación.',
          texto:
            'Esta pieza aún no es una publicación definitiva. El derecho de réplica del Ayuntamiento queda abierto desde su publicación.',
        }}
        nota={
          <>
            {/* Esta pieza se publicó el 16 de agosto y se amplió el 23. Decirlo en la
                propia pieza, y decir que no se ha retirado ni corregido nada, es la
                diferencia entre ampliar y reescribir en silencio: quien la leyó la
                primera vez tiene derecho a saber qué ha cambiado desde entonces. */}
            {m.notaAmpliacion && (
              <p
                className="cp-ancho"
                style={{
                  fontSize: 'var(--fs-aux)',
                  color: 'var(--ink70, var(--ink50))',
                  background: 'var(--soft)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-card)',
                  padding: '12px 14px',
                  margin: '0 0 22px',
                  lineHeight: 1.55,
                }}
              >
                <strong>Ampliada el {m.ampliadoEl}.</strong> {m.notaAmpliacion}
              </p>
            )}
          </>
        }
      />

      {/* 01-04: el eje nuevo. Las tres secciones de la primera versión pasan a
          ser 05-07 sin tocar una cifra: lo que se añade es lo que faltaba —qué
          hay detrás de las dos casillas que el panel deja en blanco—. */}

      <SecHead
        num="01"
        kicker="Lo que se adjudicó"
        title="Diecisiete años de agua, en un expediente de siete"
      />
      {/* Las dos fechas salen del snapshot y se dicen las dos. Decía «El 6 de
          agosto… adjudicó», y el 6 de agosto es cuando la ficha PUBLICÓ la
          adjudicación: el acuerdo es del 27 de julio. Y decía «hasta 2043»,
          una fecha de fin que la fuente no da —dice «17 Año(s)»— para un
          contrato que aún no se ha formalizado. */}
      <P>
        El {enCastellano(c.adjudicadaEl)} el Ayuntamiento acordó adjudicar a{' '}
        <strong>{c.adjudicataria}</strong> la concesión del {c.objeto.toLowerCase()}, por un valor
        estimado de <strong className="mono">{eur(c.importe)}</strong> y{' '}
        <span className="mono">{c.anios}</span> años de plazo. Concurrieron{' '}
        <span className="mono">{c.ofertas}</span> ofertas en un procedimiento {c.procedimiento}. La
        adjudicación se publicó el {enCastellano(c.publicadaEl)}, diez días antes de la primera
        versión de este reportaje, que no la mencionaba.
      </P>
      <P>{c.importeQue}</P>
      <Cronologia cronologia={data.cronologia} />
      <P>
        {data.cronologia.loQueNoConsta} {c.formalizacion}
      </P>

      {/* Qué pasaba mientras el expediente estaba parado. Va DENTRO de la
          sección de la cronología porque es lo que la cronología significa en
          la práctica, no un hecho suelto sobre la empresa — y va con el
          artículo 120 explicado, para que la vecindad entre «emergencia sin
          concurso» y «concesión de 55,7 M€» no construya sola una frase que la
          fuente no sostiene. */}
      {data.duranteLaEspera && <DuranteLaEspera bloque={data.duranteLaEspera} />}

      {/* Y quién es la empresa. Va aquí, cerrando la sección de la
          adjudicación, porque la pregunta «¿a quién se le ha dado esto?» nace
          justo de haber leído por cuánto y hasta cuándo. Cada dato lleva el
          anuncio del BORME que lo sostiene: el precedente es el bloque de
          basuras, y el motivo es que una respuesta documentada es la que el
          lector puede ir a comprobar sin fiarse de nosotros. */}
      {/* Plegada, como la tarifa de abajo: las dos amplían la sección y no son
          su hilo, y abiertas ponían 1.450 px más entre el lector y §02 —2.550
          a 375—, que es lo que promete el título (medido el 19-10-2026). Plegar no mueve nada de sitio ni de
          número. El rótulo nombra a la empresa: lo que se pliega es su ficha. */}
      {ficha && (
        <Pliegue kicker="Quién es la empresa" titulo={ficha.denominacion}>
          <FichaSociedad sociedad={ficha} />
        </Pliegue>
      )}

      {/* La tarifa va detrás de la ficha societaria y antes de la sección 02:
          cierra «quién cobra» con «cuánto cobra», que es la pregunta que un
          vecino hace a continuación. El rótulo es su título, que ya afirma lo
          que el bloque sostiene —que está publicada, y dónde—: plegada, la
          afirmación sigue a la vista y el detalle, a un clic. §02 la cita como
          «el apartado de la tarifa, más arriba», y ahí sigue. */}
      {data.laTarifa && (
        <Pliegue kicker="La tarifa" titulo={data.laTarifa.titulo}>
          <LaTarifa bloque={data.laTarifa} />
        </Pliegue>
      )}

      {/* «El coste oficial del agua es cero», decía este titular, y la
          declaración ministerial lo desmiente en la mitad de sus entregas: el
          a161 trae 1.861.058,09 € en 2014, 1.804.949,27 € en 2015,
          1.928.056,75 € en 2016, 1.965.811,90 € en 2017 y 1.898.034,08 € en
          2024 — la más reciente y la que /eficiencia usa de año base—, y cero
          en las cinco de en medio. Corregido el 29-08-2026; el porqué, en la
          nota de corrección de arriba. */}
      <SecHead
        num="02"
        kicker="Lo que no se ve"
        title="El coste oficial del agua es cero la mitad de los años"
      />
      <P>
        El panel del coste efectivo publica lo que cuesta cada servicio municipal. Para estos dos
        publica una serie que se enciende y se apaga:
      </P>
      <Figura
        titulo="Las dos fichas que el panel sólo calcula la mitad de los años"
        pie={data.panelCiego.nota}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.panelCiego.servicios.map((sv) => (
            <div
              key={sv.programa}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 10,
                alignItems: 'baseline',
                padding: '8px 10px',
                borderRadius: 'var(--r-input)',
                // Petróleo, lo que la pieza mira. En ámbar parecían una alerta
                // del sitio, y el emblema pinta esos ceros en gris, no en color.
                border: '1px solid var(--civic)',
                background: 'var(--civic-soft)',
              }}
            >
              <span style={{ fontSize: 'var(--fs-meta)' }}>
                <span className="mono" style={{ color: 'var(--ink50)' }}>
                  {sv.programa}
                </span>{' '}
                · {sv.label}
              </span>
              <span
                className="mono"
                style={{ fontSize: 'var(--fs-meta)', color: 'var(--civic-ink)' }}
              >
                {sv.coste} · {sv.motivo}
              </span>
            </div>
          ))}
        </div>
      </Figura>
      <P>{data.panelCiego.porQue}</P>

      <SecHead
        num="03"
        kicker="Quién tiene los euros"
        title="Cinco proveedores, dos tercios del importe"
      />
      <Figura
        titulo={`Contratación municipal · ${data.dinero.contratos.toLocaleString('es-ES')} contratos adjudicados`}
        pie={data.dinero.nota}
      >
        <Revela style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.dinero.filas.map((f, i) => (
            <div key={f.que}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontSize: 'var(--fs-meta)',
                  marginBottom: 4,
                }}
              >
                <span>
                  {f.que}
                  {f.detalle && <span style={{ color: 'var(--ink50)' }}> · {f.detalle}</span>}
                </span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {f.pct.toLocaleString('es-ES', { minimumFractionDigits: 1 })} %
                </span>
              </div>
              <div
                style={{
                  height: 10,
                  background: 'var(--border)',
                  borderRadius: 'var(--r-input)',
                  overflow: 'hidden',
                }}
              >
                <div
                  className="cp-crece-x"
                  style={{
                    '--i': i,
                    width: `${f.pct}%`,
                    height: '100%',
                    background: 'var(--civic)',
                  }}
                />
              </div>
            </div>
          ))}
        </Revela>
      </Figura>
      <P>{data.dinero.cautela}</P>

      <SecHead num="04" kicker="Lo que el panel sí ve" title="Quince cifras, y cómo se leen" />
      <P>{data.panel.comoSeLee}</P>
      {/* El recuento va DERIVADO del bloque, no escrito en la frase: decía «y
          {'{'}bloqueados{'}'} no —los dos del agua—» y esos dos dejaron de estar
          bloqueados el 2026-09-02, así que la aposición se quedó describiendo un
          conjunto vacío. Una frase que sólo es cierta mientras una cifra no se
          mueva es la que este repo ya ha pagado tres veces. */}
      <P>
        {data.panel.bloqueados > 0 ? (
          <>
            De los quince servicios del registro,{' '}
            <strong className="mono">{data.panel.conCociente}</strong> tienen coste unitario y{' '}
            <strong className="mono">{data.panel.bloqueados}</strong> no.
          </>
        ) : (
          <>
            Los <strong className="mono">{data.panel.conCociente}</strong> servicios del registro
            tienen coste unitario.
          </>
        )}{' '}
        Dos quedan por encima de tres de cada cuatro municipios comparables:{' '}
        {data.panel.posiciones.map((pos, i) => (
          <span key={pos.servicio}>
            {i > 0 && ' y '}
            {pos.servicio.toLowerCase()} (<span className="mono">percentil {pos.percentil}</span>,{' '}
            {pos.unidad})
          </span>
        ))}
        . El de policía es un precio por efectivo, no una medida de cómo funciona el servicio.
      </P>
      <P>{data.panel.transporte}</P>
      <P>
        Cada ficha, con su serie, su banda de comparación y el concejal que tiene delegada esa área,
        está en{' '}
        <a href="/eficiencia" style={{ color: 'var(--civic)' }}>
          /eficiencia
        </a>
        .
      </P>

      <SecHead
        num="05"
        kicker="Y por qué hay que leerlo con pinzas"
        title="De once entregas, una sin rendir"
      />
      {/* Donde empiezan las tres secciones que resume. Iba al final, debajo del
          método, donde sólo la encontraba quien ya había leído las tres. */}
      {data.infografia && (
        <p style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', margin: '0 0 12px' }}>
          Las secciones 05 a 07 —los tres defectos de la declaración— existen también como{' '}
          <a href={data.infografia.url} style={{ color: 'var(--civic)' }}>
            «{data.infografia.titulo}», una infografía en una sola página
          </a>
          , pensada para compartir o imprimir. {data.infografia.que}
        </p>
      )}
      <P>
        Calcular el coste efectivo de los servicios antes del 1 de noviembre de cada año, y
        comunicarlo al ministerio para su publicación, es una obligación del artículo 116 ter de la
        Ley de Bases de Régimen Local. El ministerio ha publicado once ejercicios. En el libro de la
        Comunitat Valenciana de 2020, Riba-roja no aparece en ninguna de las tablas de coste, de
        modo de gestión ni de unidades físicas; en 2019 y en 2021 declara sus cuarenta y tres filas
        completas. El Ministerio de Hacienda lo registra como incumplimiento.
      </P>
      <Figura titulo="Entregas rendidas por el ayuntamiento · 2014–2024" pie={data.entregas.nota}>
        <CasillasEntregas
          publicadas={data.entregas.publicadas}
          noPresentadas={data.entregas.noPresentadas}
        />
      </Figura>

      {data.quienRemite && <QuienRemite bloque={data.quienRemite} />}
      <P>
        La explicación cómoda sería la pandemia. No se sostiene: en {entregaAusente} rindieron{' '}
        <strong className="mono">{nAusente.toLocaleString('es-ES')}</strong> ayuntamientos
        valencianos, y sólo {superaron.length} de las {rc.length} entregas publicadas superan esa
        cifra:{' '}
        {superaron.map((r, i) => (
          <span key={r.anio}>
            {i > 0 && (i === superaron.length - 1 ? ' y ' : ', ')}
            {r.anio} con <span className="mono">{r.n.toLocaleString('es-ES')}</span>
          </span>
        ))}
        .
      </P>
      <Figura
        titulo="Ayuntamientos de la Comunitat que rindieron cada entrega"
        pie={data.rendicionCV.nota}
      >
        <BarrasRendicion porAnio={data.rendicionCV.porAnio} anioPropio={2020} />
      </Figura>

      <SecHead
        num="06"
        kicker="Lo que no se vuelve a medir"
        title="Trece de los quince costes unitarios dividen entre una cantidad congelada"
      />
      <P>
        Un coste unitario es una división: lo que costó un servicio, entre la cantidad de servicio
        prestado. El ayuntamiento actualiza el numerador cada entrega. El denominador lo copia:{' '}
        {cong.ejemplos.map((e, i) => (
          <span key={e.que}>
            {i > 0 && (i === cong.ejemplos.length - 1 ? ' y ' : ', ')}
            <strong className="mono">{e.valor}</strong> {e.que}
          </span>
        ))}
        , repetidos sin variar desde {cong.desdeMin} o {cong.desdeMax}, según el servicio. La
        consecuencia es aritmética, no interpretativa: si el numerador se actualiza y el denominador
        se copia, el cociente sólo puede moverse por el numerador.
      </P>
      <Figura
        titulo={`Denominadores que se repiten entrega tras entrega · ${cong.banda.n} comparables`}
        pie={cong.bandaNota}
      >
        <FranjaComparables banda={cong.banda} />
      </Figura>
      <P>
        No es una rareza local, y tampoco es lo normal: la mediana de sus comparables repite el{' '}
        <span className="mono">{cong.banda.mediana.toLocaleString('es-ES')} %</span> de sus
        denominadores; Riba-roja repite el{' '}
        <span className="mono">{cong.banda.propio.toLocaleString('es-ES')} %</span>, {cong.propios}{' '}
        de sus {cong.medibles}.
      </P>

      <SecHead
        num="07"
        kicker="Lo que sube solo"
        title="Buena parte del encarecimiento era el nivel de precios"
      />
      <P>
        Entre 2014 y 2024 el nivel de precios subió un{' '}
        <strong className="mono">{inf.acumulada.toLocaleString('es-ES')} %</strong>. Una serie de
        coste en euros corrientes se lee como si el servicio se encareciera cuando lo que sube es el
        euro. Puestas en euros constantes, tres de las subidas se encogen así:
      </P>
      <Figura titulo="Variación del coste unitario, primera → última entrega" pie={inf.nota}>
        <ParNominalReal servicios={inf.servicios} />
      </Figura>
      {/* Deflactar separa el nivel de precios, pero no el denominador. En
          pavimentación la superficie declarada bajó más que el coste, así que
          el +29 % por m² ni siquiera es un encarecimiento: se decía sin esto
          hasta el 2026-09-17. */}
      {inf.denominador && <P>{inf.denominador}</P>}

      {/* Lo preguntado va DESPUÉS de los tres hallazgos y antes de los límites:
          es lo que se ha hecho con ellos. Y va en la pieza, no sólo en una
          libreta, porque un plazo que corre sin que el lector lo vea es un plazo
          que sólo existe para nosotros. */}
      {data.solicitudes && (
        <>
          <SecHead num="08" kicker="Lo que hemos preguntado" title="Tres escritos, y sus relojes" />
          <SolicitudesEnviadas bloque={data.solicitudes} />
        </>
      )}

      <div
        style={{
          background: 'var(--soft)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-card)',
          padding: '18px 20px',
          margin: '26px 0',
        }}
      >
        <h3
          style={{
            fontSize: 'var(--fs-meta)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            color: 'var(--ink50)',
            margin: '0 0 10px',
          }}
        >
          Lo que esta pieza no dice
        </h3>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 'var(--fs-body)',
            color: 'var(--ink70)',
            lineHeight: 1.55,
          }}
        >
          {data.queNoDice.map((t) => (
            <li key={t} style={{ marginBottom: 6 }}>
              {t}
            </li>
          ))}
        </ul>
      </div>

      {/* Fuentes y método, el cierre de todas las piezas: una caja debajo de la
          otra, con el texto a la medida de lectura. Iban en dos columnas, y el
          método —el doble de largo— se leía en media columna a --fs-aux, con un
          hueco vacío al lado de las fuentes. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          marginTop: 30,
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
          <h3
            style={{
              fontSize: 'var(--fs-meta)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              color: 'var(--ink50)',
              margin: '0 0 10px',
            }}
          >
            Fuentes primarias
          </h3>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 'var(--fs-aux)',
              lineHeight: 1.6,
              maxWidth: 'var(--medida)',
            }}
          >
            {data.fuentes.map((f) => (
              <li key={f.url} style={{ marginBottom: 5 }}>
                <a
                  href={f.url}
                  target={f.url.startsWith('/') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  style={{ color: 'var(--civic)' }}
                >
                  {f.label}
                </a>
              </li>
            ))}
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
          <h3
            style={{
              fontSize: 'var(--fs-meta)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              color: 'var(--ink50)',
              margin: '0 0 10px',
            }}
          >
            Método y cautelas
          </h3>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70)',
              lineHeight: 1.6,
              maxWidth: 'var(--medida)',
            }}
          >
            {data.metodo.map((t) => (
              <li key={t} style={{ marginBottom: 5 }}>
                {t}
              </li>
            ))}
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
        {/* «Datos a <fecha>» se contradecía con el apartado de solicitudes, que
            cuenta un escrito del 18 de septiembre y una comunicación del 21 bajo
            una pieza que declara el 17. Lo congelado son las CIFRAS de la
            investigación; el registro de escritos no lo está ni puede estarlo —su
            estado se calcula con el «hoy» de quien lee—. La palabra estrecha lo
            arregla, y es la que ya usa la pieza hermana del conteo. Lo que sí se
            actualiza lo dice el propio apartado, que es donde el lector se topa
            con las fechas. */}
        Cifras a {m.fechaDatos}. El derecho de réplica está abierto para el Ayuntamiento: cualquier
        respuesta se publicará íntegra. Contacto y correcciones:{' '}
        <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
          aviso legal
        </a>
        .
      </p>

      <CorrectionNote correcciones={m.correcciones} />
    </div>
  )
}
