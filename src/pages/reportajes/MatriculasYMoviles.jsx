import { useReportaje } from '../../hooks/useReportaje'
import Emblema, { cifrasDelEmblema } from '../../components/reportajes/Emblema'
import { Card } from '../../components/Primitives'
import { CorrectionNote, CorrectionNotice } from '../../components/reportajes/CorrectionNote'
import { SecHead, IndicePieza } from '../../components/reportajes/Pieza'
import { fmtDateHuman } from '../../lib/formatters'
import { Cita, CitaEnLinea, P, Lista, Tabla, SolicitudesEnviadas } from './ConteoVisitantes'

const SERIF = "'Fraunces', Georgia, serif"
const SLUG = 'matriculas-y-moviles'

/** El número de una foto en la hoja de contactos: F1, F2… por su orden. */
const numFoto = (/** @type {number} */ i) => `F${i + 1}`

/**
 * Las fotografías de la visita, como hoja de contactos. Cada una lleva su pie,
 * que dice QUÉ se vio y dónde: una foto sin sitio no sostiene nada.
 *
 * Todas en el mismo marco de 3:4, con la foto ENTERA dentro (`contain` sobre
 * `--soft`): recortarlas para igualarlas podía dejar fuera justo lo que la foto
 * enseña. Llevan número (F1…) para que la tabla de arriba las cite, y abren el
 * fichero a su tamaño. Van con `width`/`height` del fichero, para que la página
 * no salte al cargarlas, y con `loading="lazy"` porque están a media pieza. La
 * rejilla vive en `.cp-fotos` (index.css): tres columnas, dos en el móvil.
 */
function Fotos({ fotos }) {
  return (
    <div className="cp-ancho cp-fotos">
      {fotos.map((f, i) => (
        <figure key={f.src} id={`foto-${numFoto(i).toLowerCase()}`} style={{ margin: 0 }}>
          <a
            href={f.src}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: 'relative',
              display: 'block',
              aspectRatio: '3 / 4',
              background: 'var(--soft)',
              borderRadius: 'var(--r-card)',
              overflow: 'hidden',
            }}
          >
            {/* Clavada al marco: con `height: 100%` en flujo, una foto más
                estrecha que 3:4 tomaba el alto de sus atributos, desbordaba el
                marco y el `overflow` la recortaba —justo lo que no debe pasar—. */}
            <img
              src={f.src}
              alt={f.alt}
              width={f.w}
              height={f.h}
              loading="lazy"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </a>
          <figcaption
            style={{
              fontSize: 'var(--fs-meta)',
              color: 'var(--ink50)',
              marginTop: 6,
              lineHeight: 1.4,
            }}
          >
            <span className="mono" style={{ color: 'var(--ink)', fontWeight: 600 }}>
              {numFoto(i)}
            </span>{' '}
            · {f.pie}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

/**
 * La celda de lo observado, con las fotos que la muestran detrás. Qué foto va
 * con qué fila lo dice cada foto (`fila` en la instantánea), no la tabla: una
 * fila sin foto no cita ninguna. La de los carteles no lleva: una foto enseña
 * lo que se vio, y lo que esa fila dice es que no se vio nada.
 *
 * @param {{ texto: string, fila: number, fotos: Array<{ fila?: number }> }} props
 */
function Observado({ texto, fila, fotos }) {
  const suyas = fotos.flatMap((f, i) => (f.fila === fila ? [i] : []))
  return (
    <>
      {texto}
      {suyas.length > 0 && (
        <span className="mono" style={{ fontSize: 'var(--fs-micro)', whiteSpace: 'nowrap' }}>
          {' '}
          (
          {suyas.map((i, k) => (
            <span key={i}>
              {k > 0 && ' · '}
              <a href={`#foto-${numFoto(i).toLowerCase()}`}>{numFoto(i)}</a>
            </span>
          ))}
          )
        </span>
      )}
    </>
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

      {/* La apertura era cuatro resúmenes seguidos —subtítulo, figura, tarjetas y
          una entradilla en serifa de titular— que repetían las mismas cifras: en
          el móvil, tres pantallas antes del primer apartado. Ahora resumen el
          subtítulo y la figura, y la entradilla abre el texto.

          Tarjetas: sólo quedan las que la figura imprime, y sólo donde la figura
          no cabe (`cp-kpi-en-figura`, por debajo de 480px), para sustituirla.
          Las demás repetían, sin su contexto, una cifra que la entradilla da
          con él: «61.050 €» —ahí con y sin IVA— y «≥5» —«al menos cinco
          cámaras». Una tarjeta nueva en `kpis` cuya cifra no esté en la figura
          no se pinta: si hace falta, que vaya a la prosa. Por eso esto es de
          ESTA pieza y no del armazón: en «conteo-visitantes», «267» y «16/100»
          sólo están en sus tarjetas. */}
      {/* La clase va en un envoltorio sin `display` en línea: en la rejilla, el
          `display: grid` en línea ganaba a la regla que la esconde. */}
      <div className="cp-kpi-en-figura">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 10,
            margin: '20px 0 6px',
          }}
        >
          {data.kpis
            .filter((k) => enFigura.has(k.n))
            .map((k, i) => (
              <Card key={i} style={{ padding: '12px 14px' }}>
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
      </div>

      {/* La entradilla, en el cuerpo del texto y a la medida: es el primer
          párrafo de la pieza, no un segundo subtítulo. En tinta plena, que la
          distingue del gris de los párrafos que la siguen. */}
      <p style={{ color: 'var(--ink)', margin: '22px 0 0' }}>{data.entradilla}</p>

      <IndicePieza />

      {/* 1 · lo que compra el pliego */}
      <SecHead num="01" kicker="El pliego" title={data.compra.titulo} />
      <P>{data.compra.texto}</P>
      <Cita tipo="pliego" de="exp. 98/2025" fuente={data.compra.citaFuente}>
        {data.compra.cita}
      </Cita>
      {data.compra.remate.map((t, i) => (
        <P key={i}>{t}</P>
      ))}

      {/* 2 · los móviles: la promesa y el párrafo siguiente, uno detrás de otro */}
      <SecHead num="02" kicker="Los móviles" title={an.titulo} />
      <P>Primero, la promesa:</P>
      <Cita tipo="pliego" de="exp. 98/2025">
        {an.promesa}
      </Cita>
      <P>Y a continuación, el método:</P>
      <Cita tipo="pliego" de="exp. 98/2025" fuente={an.citaFuente}>
        {an.metodo}
      </Cita>
      <P>{an.explicacion}</P>
      <P>{an.matiz}</P>
      {/* Dos viñetas del pliego, dos citas: unirlas en una frase pondría una
          conjunción que es nuestra. */}
      <Lista items={an.panel.map((t) => `«${t}»`)} />
      <P>{an.remate}</P>

      {/* 3 · las cámaras */}
      <SecHead num="03" kicker="Los aparcamientos" title={ca.titulo} />
      <P>{ca.finalidad}</P>
      <Cita tipo="pliego" de="exp. 98/2025" fuente={ca.citaFuente}>
        {ca.cita}
      </Cita>
      {/* `ca.texto` acaba en «según el pliego:», que presenta la cita: va dentro
          de la frase, y no en una caja para cinco palabras. */}
      <P>
        {ca.texto}{' '}
        <CitaEnLinea tipo="pliego" de="exp. 98/2025">
          {ca.guardan}
        </CitaEnLinea>
      </P>
      <Lista items={ca.destino} />
      <P>{ca.remate}</P>

      {/* 4 · la visita */}
      <SecHead num="04" kicker="Sobre el terreno" title={ob.titulo} />
      <P>{ob.texto}</P>
      <Tabla
        cols={[{ label: 'Lo que exige el pliego' }, { label: 'Lo observado el 11-10-2026' }]}
        rows={ob.filas.map((f, i) => [
          f.exige,
          <Observado key={i} texto={f.visto} fila={i} fotos={ob.fotos} />,
        ])}
        caption="Observación desde la vía pública. Lo que una fotografía sostiene es «se observó», no «no existe»."
      />
      <Fotos fotos={ob.fotos} />
      <Lista items={ob.limites} />

      {/* 5 · la versión pública. Se cita la nota del propio Ayuntamiento
          (30-07-2026), no el periódico que la reprodujo: así cada frase de la
          columna izquierda es suya, sin atribuirle nada por inferencia. */}
      <SecHead num="05" kicker="La versión municipal" title={ve.titulo} />
      <P>{ve.texto}</P>
      <Tabla
        cols={[{ label: 'Nota municipal del 30-07-2026' }, { label: 'Lo que exige el pliego' }]}
        rows={ve.filas.map((f) => [f.dijo, f.pliego])}
      />
      <P>{ve.remate}</P>

      {/* 6 · las garantías */}
      <SecHead num="06" kicker="Las garantías" title={data.garantias.titulo} />
      <Lista items={data.garantias.bullets} />

      {/* 7 · la promesa de publicar los datos */}
      <SecHead num="07" kicker="Comprobable" title={data.descargas.titulo} />
      {/* El pie de estas dos decía sólo «Pliego de prescripciones técnicas del
          expediente N», que es lo que ya dice la etiqueta: no se repite. */}
      <Cita tipo="pliego" de="exp. 98/2025">
        {data.descargas.cita}
      </Cita>
      <P>{data.descargas.texto}</P>

      {/* 8 · la campaña */}
      <SecHead num="08" kicker="El contrato hermano" title={data.campana.titulo} />
      <P>{data.campana.texto}</P>
      <Cita tipo="pliego" de="exp. 100/2025">
        {data.campana.cita}
      </Cita>
      <P>{data.campana.remate}</P>

      {/* Lo que cierra la pieza no es más reportaje: es el registro —lo que no
          se afirma, lo preguntado y a quién, la réplica, el método, las fuentes y
          las correcciones—. Va en su banda para que se vea dónde acaba lo
          contado y empieza con qué se puede comprobar. Las correcciones siguen
          siendo lo último. */}
      <section className="cp-registro" aria-labelledby="cp-registro-titulo">
        <div id="cp-registro-titulo" className="cp-registro-titulo">
          Rendición de cuentas
        </div>

        {/* 9 · límites */}
        <SecHead num="09" kicker="Honestidad" title={data.limites.titulo} />
        <Lista items={data.limites.bullets} />

        {/* 10 · preguntas, solicitud y réplica */}
        <SecHead num="10" kicker="Sin responder" title="Las preguntas" />
        <ol style={{ margin: '0 0 14px', paddingLeft: 20 }}>
          {data.preguntas.map((q, i) => (
            <li key={i} style={{ color: 'var(--ink70)', marginBottom: 10 }}>
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
            <Cita
              key={`${r.de}-${r.fecha}`}
              tipo="respuesta"
              de={`${r.de} · ${fmtDateHuman(r.fecha)}`}
            >
              {r.texto}
            </Cita>
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
      </section>
    </div>
  )
}
