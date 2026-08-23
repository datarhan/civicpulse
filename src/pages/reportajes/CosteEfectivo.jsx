import { useReportaje } from '../../hooks/useReportaje'
import { CorrectionNote } from '../../components/reportajes/CorrectionNote'
import { FichaSociedad } from '../../components/reportajes/FichaSociedad'
import { useSociedades, indexarSociedades } from '../../hooks/useSociedades'

const SERIF = "'Fraunces', Georgia, serif"

/* ---- Encabezado de sección numerado (mismo patrón que Basuras) ---- */
function SecHead({ num, kicker, title }) {
  return (
    <div style={{ margin: '34px 0 12px' }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          letterSpacing: '.04em',
          marginBottom: 6,
        }}
      >
        {num} · {kicker}
      </div>
      <h2
        style={{
          fontFamily: SERIF,
          fontSize: 'var(--fs-page)',
          fontWeight: 600,
          letterSpacing: '-.01em',
          lineHeight: 1.15,
          margin: 0,
        }}
      >
        {title}
      </h2>
    </div>
  )
}

const P = ({ children }) => (
  <p style={{ fontSize: 'var(--fs-body)', color: 'var(--ink70)', margin: '12px 0' }}>{children}</p>
)

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
            fontSize: 'var(--fs-meta)',
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
        casilla que no debe llamar la atención. ---- */
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
              border: falta ? '1px solid var(--warn)' : '1px solid var(--border)',
              color: falta ? 'var(--warn-ink)' : 'var(--ink70)',
              background: falta
                ? 'repeating-linear-gradient(45deg, var(--warn-soft) 0 5px, transparent 5px 10px)'
                : 'var(--paper)',
              fontSize: 'var(--fs-meta)',
            }}
          >
            {a}
            <div
              style={{
                fontSize: 'var(--fs-micro)',
                marginTop: 2,
                color: falta ? 'var(--warn-ink)' : 'var(--ok-ink)',
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
        rendir va en ámbar Y es la barra más larga: eso ES el argumento. ---- */
function BarrasRendicion({ porAnio, anioPropio }) {
  const max = Math.max(...porAnio.map((f) => f.n))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {porAnio.map((f) => {
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
                color: propio ? 'var(--warn-ink)' : 'var(--ink50)',
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
                style={{
                  width: `${(100 * f.n) / max}%`,
                  height: '100%',
                  background: propio ? 'var(--warn)' : 'var(--civic)',
                }}
              />
            </div>
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-meta)',
                textAlign: 'right',
                color: propio ? 'var(--warn-ink)' : 'var(--ink70)',
                fontWeight: propio ? 700 : 400,
              }}
            >
              {f.n}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ---- La franja de comparables: mitad central sombreada, mediana marcada,
        Riba-roja como punto en el 100. Misma gramática que BandaPares en
        /eficiencia, congelada a la cifra de esta pieza. ---- */
function FranjaComparables({ banda }) {
  return (
    <div
      role="img"
      aria-label={`Entre ${banda.n} municipios comparables, la mediana repite el ${banda.mediana} % de sus denominadores; el rango intercuartílico va del ${banda.p25} % al ${banda.p75} %. Riba-roja repite el ${banda.propio} %.`}
      style={{ position: 'relative', height: 64, margin: '6px 0 2px' }}
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
          background: 'var(--civic-soft)',
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
          background: 'var(--civic)',
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
        title={`Riba-roja: ${banda.propio} %`}
        style={{
          position: 'absolute',
          left: `${banda.propio}%`,
          top: 26,
          width: 12,
          height: 12,
          marginLeft: -6,
          borderRadius: 'var(--r-pill)',
          background: 'var(--warn)',
          boxShadow: '0 0 0 2px var(--paper)',
        }}
      />
      <span
        className="mono"
        style={{
          position: 'absolute',
          right: 0,
          top: 44,
          fontSize: 'var(--fs-micro)',
          color: 'var(--warn-ink)',
          fontWeight: 700,
        }}
      >
        Riba-roja · {banda.propio} %
      </span>
    </div>
  )
}

/* ---- Nominal contra real, por servicio ---- */
function ParNominalReal({ servicios }) {
  const max = Math.max(...servicios.map((s) => s.nominal))
  const fmt = (v) =>
    `${v > 0 ? '+' : ''}${v.toLocaleString('es-ES', { maximumFractionDigits: 0 })} %`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {servicios.map((s) => (
        <div key={s.nombre}>
          <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink)', marginBottom: 6 }}>
            {s.nombre} <span style={{ color: 'var(--ink50)' }}>· {s.tramo}</span>
          </div>
          {[
            { que: 'corrientes', v: s.nominal, color: 'var(--warn)' },
            { que: 'constantes', v: s.real, color: 'var(--civic)' },
          ].map((fila) => (
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
                  style={{
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
    </div>
  )
}

/** Euros redondeados al euro: los céntimos de un contrato de ocho cifras son ruido. */
const eur = (v) =>
  v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/* ---- La cronología del expediente. Siete años en una columna: lo que cuenta
        no es cada hito por separado sino el hueco entre febrero de 2021 y abril
        de 2026, que sólo se ve si están todos en fila. ---- */
function Cronologia({ cronologia }) {
  if (!cronologia?.hitos?.length) return null
  return (
    <Figura titulo="El expediente, hito a hito" pie={cronologia.nota}>
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
          fontSize: 'var(--fs-body)',
          fontWeight: 600,
          margin: '26px 0 0',
        }}
      >
        {b.titulo}
      </h3>
      <P>{b.intro}</P>
      <Figura
        titulo={`Contratos de emergencia tras la DANA · ${b.fecha.split('-').reverse().join('-')}`}
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
      <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', margin: '8px 0 0' }}>
        Expediente {b.expediente} ·{' '}
        <a href={b.url} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--civic)' }}>
          ficha en la Plataforma de Contratación ↗
        </a>
      </p>
    </>
  )
}

/* ---- El hueco de la tarifa. Se publica DÓNDE se buscó y qué respondió cada
        sitio, porque un hueco documentado es información y un hueco callado
        parece un descuido. ---- */
function LaTarifa({ bloque }) {
  const b = bloque
  return (
    <>
      <h3
        style={{
          fontFamily: SERIF,
          fontSize: 'var(--fs-body)',
          fontWeight: 600,
          margin: '26px 0 0',
        }}
      >
        {b.titulo}
      </h3>
      <P>{b.cuerpo}</P>
      <div style={{ margin: '12px 0' }}>
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

export default function CosteEfectivo() {
  const { loading, error, data } = useReportaje('coste-efectivo')
  const { data: sociedades } = useSociedades()

  if (loading)
    return (
      <div className="cp-page" style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
        <p style={{ color: 'var(--ink50)' }}>Cargando reportaje…</p>
      </div>
    )
  if (error || !data)
    return (
      <div className="cp-page" style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
        <p style={{ color: 'var(--ink50)' }}>No se pudo cargar el reportaje.</p>
      </div>
    )

  const m = data.meta
  const c = data.concesion
  const ficha = indexarSociedades(sociedades).get('hidraqua')
  const cong = data.congelados
  const inf = data.inflacion

  return (
    <div
      className="cp-page"
      style={{
        padding: '24px',
        maxWidth: 760,
        margin: '0 auto',
        fontSize: 'var(--fs-head)',
        lineHeight: 1.62,
      }}
    >
      {m.estado !== 'publicado' && (
        <div
          style={{
            background: 'var(--warn-soft)',
            border: '1px solid var(--warn)',
            color: 'var(--warn-ink)',
            borderRadius: 'var(--r-card)',
            padding: '10px 14px',
            fontSize: 'var(--fs-meta)',
            marginBottom: 22,
          }}
        >
          <strong>Borrador editorial · pendiente de revisión afirmación por afirmación.</strong>{' '}
          Esta pieza aún no es una publicación definitiva. El derecho de réplica del Ayuntamiento
          queda abierto desde su publicación.
        </div>
      )}

      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {m.seccion}
      </div>
      <h1
        style={{
          fontFamily: SERIF,
          fontSize: 'var(--type-display)',
          fontWeight: 600,
          letterSpacing: '-.015em',
          lineHeight: 1.08,
          margin: '4px 0 14px',
        }}
      >
        {m.titulo}
      </h1>
      <p
        style={{
          fontSize: 'var(--fs-head)',
          color: 'var(--ink50)',
          lineHeight: 1.5,
          margin: '0 0 26px',
        }}
      >
        {m.subtitulo}
      </p>

      <CorrectionNote correcciones={m.correcciones} />

      {/* Esta pieza se publicó el 16 de agosto y se amplió el 23. Decirlo en la
          propia pieza, y decir que no se ha retirado ni corregido nada, es la
          diferencia entre ampliar y reescribir en silencio: quien la leyó la
          primera vez tiene derecho a saber qué ha cambiado desde entonces. */}
      {m.notaAmpliacion && (
        <p
          style={{
            fontSize: 'var(--fs-meta)',
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

      {/* KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 1,
          background: 'var(--border)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-card)',
          overflow: 'hidden',
          margin: '0 0 30px',
        }}
      >
        {data.kpis.map((s, i) => (
          <div key={i} style={{ background: 'var(--paper)', padding: '16px 14px' }}>
            <div
              className="mono"
              style={{
                fontSize: 'var(--fs-card)',
                fontWeight: 500,
                color: 'var(--ink)',
                lineHeight: 1,
              }}
            >
              {s.n}
            </div>
            <div
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                marginTop: 6,
                lineHeight: 1.35,
              }}
            >
              {s.l}
            </div>
          </div>
        ))}
      </div>

      {/* 01-04: el eje nuevo. Las tres secciones de la primera versión pasan a
          ser 05-07 sin tocar una cifra: lo que se añade es lo que faltaba —qué
          hay detrás de las dos casillas que el panel deja en blanco—. */}
      <SecHead
        num="01"
        kicker="Lo que se adjudicó"
        title="Diecisiete años de agua, en un expediente de siete"
      />
      <P>
        El 6 de agosto de 2026 el Ayuntamiento adjudicó a <strong>{c.adjudicataria}</strong> la
        concesión del {c.objeto.toLowerCase()}, por un valor estimado de{' '}
        <strong className="mono">{eur(c.importe)}</strong> y hasta{' '}
        <span className="mono">{c.hasta.slice(0, 4)}</span>. Concurrieron{' '}
        <span className="mono">{c.ofertas}</span> ofertas en un procedimiento {c.procedimiento}.
        Diez días después se publicó la primera versión de este reportaje, que no lo mencionaba.
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
      <FichaSociedad sociedad={ficha} />

      {/* El hueco de la tarifa va detrás de la ficha societaria y antes de la
          sección 02: cierra «quién cobra» con «cuánto cobra», que es la
          pregunta que un vecino hace a continuación — y cuya respuesta es que
          no está publicada donde se pueda enlazar. */}
      {data.laTarifa && <LaTarifa bloque={data.laTarifa} />}

      <SecHead num="02" kicker="Lo que no se ve" title="El coste oficial del agua es cero" />
      <P>
        El panel del coste efectivo publica lo que cuesta cada servicio municipal. Para estos dos no
        publica nada:
      </P>
      <Figura titulo="Las dos fichas que el panel no puede calcular" pie={data.panelCiego.nota}>
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
                border: '1px solid var(--warn)',
                background: 'var(--warn-soft)',
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
                style={{ fontSize: 'var(--fs-meta)', color: 'var(--warn-ink)' }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.dinero.filas.map((f) => (
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
                <div style={{ width: `${f.pct}%`, height: '100%', background: 'var(--civic)' }} />
              </div>
            </div>
          ))}
        </div>
      </Figura>
      <P>{data.dinero.cautela}</P>

      <SecHead num="04" kicker="Lo que el panel sí ve" title="Trece cifras, y cómo se leen" />
      <P>{data.panel.comoSeLee}</P>
      <P>
        De los quince servicios del registro,{' '}
        <strong className="mono">{data.panel.conCociente}</strong> tienen coste unitario y{' '}
        <strong className="mono">{data.panel.bloqueados}</strong> no —los dos del agua—. Dos quedan
        por encima de tres de cada cuatro municipios comparables:{' '}
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
      <P>
        Calcular el coste efectivo de los servicios antes del 1 de noviembre de cada año, y
        comunicarlo al ministerio para su publicación, es una obligación del artículo 116 ter de la
        Ley de Bases de Régimen Local. El ministerio ha publicado once ejercicios. En el libro de la
        Comunitat Valenciana de 2020, Riba-roja no aparece en ninguna de las tablas de coste, de
        modo de gestión ni de unidades físicas; en 2019 y en 2021 declara sus cuarenta y tres filas
        completas.
      </P>
      <Figura titulo="Entregas rendidas por el ayuntamiento · 2014–2024" pie={data.entregas.nota}>
        <CasillasEntregas
          publicadas={data.entregas.publicadas}
          noPresentadas={data.entregas.noPresentadas}
        />
      </Figura>
      <P>
        La explicación cómoda sería la pandemia. No se sostiene: en 2020 rindieron{' '}
        <strong>más</strong> ayuntamientos valencianos que en cualquiera de los cuatro años
        siguientes — 503; sólo 2017, con 513, rindió más.
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
        title="Trece costes unitarios dividen entre una cantidad congelada"
      />
      <P>
        Un coste unitario es una división: lo que costó un servicio, entre la cantidad de servicio
        prestado. El ayuntamiento actualiza el numerador cada entrega. El denominador lo copia:{' '}
        {cong.ejemplos.map((e, i) => (
          <span key={e.que}>
            {i > 0 && (i === cong.ejemplos.length - 1 ? ' y ' : ', ')}
            <strong className="mono">{e.valor}</strong> de {e.que}
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
        <span className="mono">{cong.banda.propio.toLocaleString('es-ES')} %</span>, los{' '}
        {cong.propios} a la vez.
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

      {/* Fuentes y método, el cierre de todas las piezas */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
          alignItems: 'start',
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
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--fs-meta)', lineHeight: 1.6 }}>
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
            border: '1px solid var(--warn)',
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
              fontSize: 'var(--fs-meta)',
              color: 'var(--ink70)',
              lineHeight: 1.6,
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

      {data.infografia && (
        <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', margin: '18px 0 0' }}>
          Las secciones 05 a 07 —los tres defectos de la declaración— existen también como{' '}
          <a href={data.infografia.url} style={{ color: 'var(--civic)' }}>
            «{data.infografia.titulo}», una infografía en una sola página
          </a>
          , pensada para compartir o imprimir. {data.infografia.que}
        </p>
      )}

      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          margin: '16px 0 0',
          lineHeight: 1.5,
        }}
      >
        Datos a {m.fechaDatos}. El derecho de réplica está abierto para el Ayuntamiento: cualquier
        respuesta se publicará íntegra. Contacto y correcciones:{' '}
        <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
          aviso legal
        </a>
        .
      </p>
    </div>
  )
}
