import { useReportaje } from '../../hooks/useReportaje'
import Emblema, { cifrasDelEmblema } from '../../components/reportajes/Emblema'
import { Card } from '../../components/Primitives'
import { CorrectionNote, CorrectionNotice } from '../../components/reportajes/CorrectionNote'
import { SecHead, IndicePieza } from '../../components/reportajes/Pieza'
import { fmtDateHuman } from '../../lib/formatters'
import { Cita, P, Lista, Tabla, SolicitudesEnviadas } from './ConteoVisitantes'

const SERIF = "'Fraunces', Georgia, serif"
const SLUG = 'matriculas-y-moviles'

/**
 * Las fotografías de la visita. Cada una lleva su pie, que dice QUÉ se vio y
 * dónde: una foto sin sitio no sostiene nada. Van con `width`/`height` del
 * fichero para que la página no salte al cargarlas, y con `loading="lazy"`
 * porque están a media pieza. La rejilla se resuelve con `auto-fit`, sin media
 * queries: en el móvil cae a una columna sola.
 */
function Fotos({ fotos }) {
  return (
    <div
      className="cp-ancho"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 14,
        margin: '18px 0',
      }}
    >
      {fotos.map((f) => (
        <figure key={f.src} style={{ margin: 0 }}>
          <img
            src={f.src}
            alt={f.alt}
            width={f.w}
            height={f.h}
            loading="lazy"
            style={{
              display: 'block',
              width: '100%',
              height: 'auto',
              borderRadius: 'var(--r-card)',
              background: 'var(--soft)',
            }}
          />
          <figcaption
            style={{
              fontSize: 'var(--fs-meta)',
              color: 'var(--ink50)',
              marginTop: 6,
              lineHeight: 1.4,
            }}
          >
            {f.pie}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

export default function MatriculasYMoviles() {
  const { loading, error, data } = useReportaje(SLUG)

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
  // Las tarjetas que la figura de cabecera ya imprime (ver cifrasDelEmblema).
  const enFigura = new Set(cifrasDelEmblema(SLUG, data))
  const { anonimizada: an, camaras: ca, observado: ob, version: ve } = data

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
      {m.estado !== 'publicado' && (
        <div
          style={{
            background: 'var(--warn-soft)',
            border: '1px solid var(--warn)',
            borderRadius: 'var(--r-card)',
            padding: '10px 12px',
            marginBottom: 16,
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink)',
          }}
        >
          Borrador · no publicado.
        </div>
      )}

      <div
        className="mono cp-texto"
        style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', letterSpacing: '.06em' }}
      >
        {m.seccion}
      </div>
      <h1
        style={{
          fontFamily: SERIF,
          fontSize: 'var(--fs-display)',
          fontWeight: 600,
          letterSpacing: '-.02em',
          lineHeight: 1.08,
          margin: '8px 0 10px',
        }}
      >
        {m.titulo}
      </h1>
      <p style={{ color: 'var(--ink70)', fontSize: 'var(--fs-head)', margin: '0 0 6px' }}>
        {m.subtitulo}
      </p>
      <div className="mono" style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
        Publicado el {fmtDateHuman(m.publicadoEl)} · cifras congeladas a {m.fechaDatos}
      </div>

      <Emblema slug={SLUG} data={data} style={{ margin: '22px 0 26px' }} />

      <CorrectionNotice correcciones={m.correcciones} style={{ marginTop: 22 }} />

      {/* KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 10,
          margin: '20px 0 6px',
        }}
      >
        {data.kpis.map((k, i) => (
          <Card
            key={i}
            className={enFigura.has(k.n) ? 'cp-kpi-en-figura' : undefined}
            style={{ padding: '12px 14px' }}
          >
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-page)', color: 'var(--ink)', fontWeight: 600 }}
            >
              {k.n}
            </div>
            <div
              style={{
                fontSize: 'var(--fs-meta)',
                color: 'var(--ink50)',
                marginTop: 4,
                lineHeight: 1.4,
              }}
            >
              {k.l}
            </div>
          </Card>
        ))}
      </div>

      <p
        className="cp-ancho"
        style={{
          fontFamily: SERIF,
          fontSize: 'clamp(var(--fs-card), 2.4vw, var(--fs-page))',
          lineHeight: 1.5,
          color: 'var(--ink)',
          margin: '22px 0 0',
        }}
      >
        {data.entradilla}
      </p>

      <IndicePieza />

      {/* 1 · lo que compra el pliego */}
      <SecHead num="01" kicker="El pliego" title={data.compra.titulo} />
      <P>{data.compra.texto}</P>
      <Cita fuente={data.compra.citaFuente}>{data.compra.cita}</Cita>
      {data.compra.remate.map((t, i) => (
        <P key={i}>{t}</P>
      ))}

      {/* 2 · los móviles: la promesa y el párrafo siguiente, uno detrás de otro */}
      <SecHead num="02" kicker="Los móviles" title={an.titulo} />
      <P>Primero, la promesa:</P>
      <Cita>{an.promesa}</Cita>
      <P>Y a continuación, el método:</P>
      <Cita fuente={an.citaFuente}>{an.metodo}</Cita>
      <P>{an.explicacion}</P>
      <P>{an.matiz}</P>
      {/* Dos viñetas del pliego, dos citas: unirlas en una frase pondría una
          conjunción que es nuestra. */}
      <Lista items={an.panel.map((t) => `«${t}»`)} />
      <P>{an.remate}</P>

      {/* 3 · las cámaras */}
      <SecHead num="03" kicker="Los aparcamientos" title={ca.titulo} />
      <P>{ca.finalidad}</P>
      <Cita fuente={ca.citaFuente}>{ca.cita}</Cita>
      <P>{ca.texto}</P>
      <Cita fuente="Pliego de prescripciones técnicas del expediente 98/2025">{ca.guardan}</Cita>
      <Lista items={ca.destino} />
      <P>{ca.remate}</P>

      {/* 4 · la visita */}
      <SecHead num="04" kicker="Sobre el terreno" title={ob.titulo} />
      <P>{ob.texto}</P>
      <Tabla
        cols={[{ label: 'Lo que exige el pliego' }, { label: 'Lo observado el 11-10-2026' }]}
        rows={ob.filas.map((f) => [f.exige, f.visto])}
        caption="Observación desde la vía pública. Lo que una fotografía sostiene es «se observó», no «no existe»."
      />
      <Fotos fotos={ob.fotos} />
      <Lista items={ob.limites} />

      {/* 5 · la versión pública */}
      {/* «En la prensa» y no «la versión municipal»: el artículo no atribuye
          nada al Ayuntamiento, y llamarlo su versión sería decir cómo trabajó
          el periódico. */}
      <SecHead num="05" kicker="En la prensa" title={ve.titulo} />
      <P>{ve.texto}</P>
      <Tabla
        cols={[{ label: 'Publicado el 19-09-2026' }, { label: 'Lo que exige el pliego' }]}
        rows={ve.filas.map((f) => [f.dijo, f.pliego])}
      />
      <P>{ve.remate}</P>

      {/* 6 · las garantías */}
      <SecHead num="06" kicker="Las garantías" title={data.garantias.titulo} />
      <Lista items={data.garantias.bullets} />

      {/* 7 · la promesa de publicar los datos */}
      <SecHead num="07" kicker="Comprobable" title={data.descargas.titulo} />
      <Cita fuente={data.descargas.citaFuente}>{data.descargas.cita}</Cita>
      <P>{data.descargas.texto}</P>

      {/* 8 · la campaña */}
      <SecHead num="08" kicker="El contrato hermano" title={data.campana.titulo} />
      <P>{data.campana.texto}</P>
      <Cita fuente={data.campana.citaFuente}>{data.campana.cita}</Cita>
      <P>{data.campana.remate}</P>

      {/* 9 · límites */}
      <SecHead num="09" kicker="Honestidad" title={data.limites.titulo} />
      <Lista items={data.limites.bullets} />

      {/* 10 · preguntas, solicitud y réplica */}
      <SecHead num="10" kicker="Sin responder" title="Las preguntas" />
      <ol style={{ margin: '0 0 14px', paddingLeft: 20 }}>
        {data.preguntas.map((q, i) => (
          <li
            key={i}
            style={{
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70)',
              marginBottom: 8,
              lineHeight: 1.5,
            }}
          >
            {q}
          </li>
        ))}
      </ol>
      <Card style={{ padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)', lineHeight: 1.5 }}>
          {data.preguntasNota}
        </div>
      </Card>

      <SolicitudesEnviadas bloque={data.solicitudes} />

      <Card style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)', lineHeight: 1.5 }}>
          {data.replica.texto}
        </div>
        {/* Las respuestas, íntegras y atribuidas. Sin respuestas no se pinta
            nada: el texto de arriba ya dice que se pidieron y hasta cuándo. */}
        {data.replica.respuestas.map((r) => (
          <div key={`${r.de}-${r.fecha}`} style={{ marginTop: 12 }}>
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 4 }}
            >
              {r.de} · {fmtDateHuman(r.fecha)}
            </div>
            <Cita>{r.texto}</Cita>
          </div>
        ))}
      </Card>

      {/* método y fuentes */}
      <SecHead num="11" kicker="Cómo se ha hecho" title="Método" />
      <Lista items={data.metodo} />

      <SecHead num="12" kicker="Comprobable" title="Fuentes" />
      <ul style={{ margin: '0 0 14px', paddingLeft: 18 }}>
        {data.fuentes.map((f, i) => (
          <li
            key={i}
            style={{
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70)',
              marginBottom: 8,
              lineHeight: 1.45,
            }}
          >
            <a href={f.url} target="_blank" rel="noopener noreferrer">
              {f.label}
            </a>
          </li>
        ))}
      </ul>

      <CorrectionNote correcciones={m.correcciones} />
    </div>
  )
}
