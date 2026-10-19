import { lazy, Suspense } from 'react'
import { useReportaje } from '../../hooks/useReportaje'
import CabeceraPieza from '../../components/reportajes/CabeceraPieza'
import { Card } from '../../components/Primitives'
import { CorrectionNote } from '../../components/reportajes/CorrectionNote'
import { SecHead } from '../../components/reportajes/Pieza'
import { fmtDateHuman } from '../../lib/formatters'
import { trozosResaltados } from '../../lib/resaltar'
import {
  Cita,
  CitaEnLinea,
  P,
  Lista,
  Tabla,
  SolicitudesEnviadas,
  etiquetaDeCita,
} from './ConteoVisitantes'

const SERIF = "'Fraunces', Georgia, serif"
// Leaflet, perezoso: sólo esta pieza lo usa, y a media página.
const MapaPliego = lazy(() => import('../../components/reportajes/MapaPliego'))
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

/**
 * El hallazgo de la pieza, en un pliego: lo que promete y, en el párrafo
 * siguiente, lo que describe. Lado a lado donde caben (`.cp-frente`, index.css),
 * una encima de otra donde no. Las frases que chocan van subrayadas: énfasis
 * NUESTRO sobre palabras del pliego, que no cambia ni una (`trozosResaltados`
 * lanza si una frase no está tal cual) y que el pie declara. En `--civic` y no
 * en rojo: la pieza enseña la distancia entre las dos, no dice que sea un
 * incumplimiento.
 *
 * @param {{ an: { promesa: string, metodo: string, citaFuente: string, resaltes: { promesa: string[], metodo: string[] } } }} props
 */
function PrometeYDescribe({ an }) {
  const columnas = [
    { rotulo: 'Promete', texto: an.promesa, frases: an.resaltes.promesa },
    { rotulo: 'Describe', texto: an.metodo, frases: an.resaltes.metodo },
  ]
  return (
    <figure className="cp-ancho" style={{ margin: '18px 0' }}>
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
        {etiquetaDeCita('pliego', 'exp. 98/2025')}
      </div>
      <div className="cp-frente">
        {columnas.map((c) => (
          <div key={c.rotulo}>
            <div
              className="mono"
              style={{
                fontSize: 'var(--fs-meta)',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'var(--civic)',
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              {c.rotulo}
            </div>
            <blockquote
              style={{
                margin: 0,
                padding: '12px 16px',
                borderLeft: '3px solid var(--civic)',
                background: 'var(--soft)',
                fontFamily: SERIF,
                fontSize: 'var(--fs-head)',
                lineHeight: 1.5,
                color: 'var(--ink)',
              }}
            >
              «
              {trozosResaltados(c.texto, c.frases).map((t, i) =>
                t.resalte ? (
                  <mark key={i} className="cp-subrayado">
                    {t.t}
                  </mark>
                ) : (
                  <span key={i}>{t.t}</span>
                ),
              )}
              »
            </blockquote>
          </div>
        ))}
      </div>
      <figcaption
        style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', marginTop: 6, lineHeight: 1.4 }}
      >
        {an.citaFuente} Subrayado nuestro.
      </figcaption>
    </figure>
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
      {/* La cabecera es la común (CabeceraPieza). Sus tarjetas: «61.050 €» y
          «≥5» están en `meta.kpisEnTexto` —la entradilla las da con su
          contexto—, así que sólo queda «0 de 2», que la figura escribe: se ve
          donde la figura no cabe, para sustituirla. */}
      <CabeceraPieza slug={SLUG} data={data} />

      {/* 1 · lo que compra el pliego */}
      <SecHead num="01" kicker="El pliego" title={data.compra.titulo} />
      <P>{data.compra.texto}</P>
      <Cita tipo="pliego" de="exp. 98/2025" fuente={data.compra.citaFuente}>
        {data.compra.cita}
      </Cita>
      {data.compra.remate.map((t, i) => (
        <P key={i}>{t}</P>
      ))}

      {/* 2 · los móviles: la promesa y el párrafo siguiente, frente a frente */}
      <SecHead num="02" kicker="Los móviles" title={an.titulo} />
      <PrometeYDescribe an={an} />
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
      {/* «Ninguno de los tres aparcamientos está en el Parque Natural», dicho en
          la frase de arriba, a la vista. Sin bloque `mapa` no se pinta nada:
          la frase se sostiene sola. */}
      {data.mapa && (
        <Suspense
          fallback={<div className="cp-ancho cp-mapa-pliego" style={{ margin: '18px 0' }} />}
        >
          <MapaPliego mapa={data.mapa} />
        </Suspense>
      )}
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
