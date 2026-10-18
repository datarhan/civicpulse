import { useReportaje } from '../../hooks/useReportaje'
import CabeceraPieza from '../../components/reportajes/CabeceraPieza'
import { Card, Pill } from '../../components/Primitives'
import { CorrectionNote } from '../../components/reportajes/CorrectionNote'
import { SecHead } from '../../components/reportajes/Pieza'
import {
  estadoDeEnvio,
  fraseDeCalendarios,
  fraseDeEnvio,
  resumirEnvios,
  ESTADO_ENVIO_ETIQUETA,
  ESTADO_ENVIO_TONO,
} from '../../scraper/solicitud-enviada'

const SERIF = "'Fraunces', Georgia, serif"

/**
 * La voz de cada cita: QUÉ documento habla. La pieza tiene tres voces y cada una
 * su letra —el documento en Fraunces, la redacción en Outfit, el registro en DM
 * Mono—, y la etiqueta, en mono encima de la cita, dice cuál de los documentos
 * es antes de leerla. Un `tipo` que no está aquí no se pinta: lanza.
 */
export const TIPOS_CITA = {
  pliego: 'Pliego técnico',
  memoria: 'Memoria justificativa',
  'nota-municipal': 'Nota municipal',
  respuesta: 'Respuesta',
}

/** @param {string} tipo @param {string} [de] */
function etiquetaDeCita(tipo, de) {
  const nombre = TIPOS_CITA[/** @type {keyof typeof TIPOS_CITA} */ (tipo)]
  if (!nombre) throw new Error(`Cita: tipo desconocido «${tipo}»`)
  return de ? `${nombre} · ${de}` : nombre
}

const ETIQUETA = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-micro)',
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--ink50)',
}

/**
 * Cita literal de un documento. Lleva SIEMPRE su procedencia: la etiqueta de
 * arriba (`tipo` y `de`, obligatoria) y, si hace falta más, el pie (`fuente`).
 * Una cita sin fuente en una superficie legalmente material es exactamente lo
 * que este sitio no publica.
 *
 * @param {{ children: import('react').ReactNode, tipo: string, de?: string, fuente?: string }} props
 */
export function Cita({ children, tipo, de, fuente }) {
  return (
    <figure style={{ margin: '18px 0' }}>
      <div style={{ ...ETIQUETA, marginBottom: 5 }}>{etiquetaDeCita(tipo, de)}</div>
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
        «{children}»
      </blockquote>
      {fuente && (
        <figcaption
          style={{
            fontSize: 'var(--fs-meta)',
            color: 'var(--ink50)',
            marginTop: 6,
            lineHeight: 1.4,
          }}
        >
          {fuente}
        </figcaption>
      )}
    </figure>
  )
}

/**
 * Una cita de una línea, dentro de la frase que la presenta. En caja, un
 * fragmento de cinco palabras pesaba lo mismo que dos párrafos del pliego, y la
 * página iba caja, texto, caja. Sigue en la letra del documento, y su
 * procedencia va detrás, en la del registro: dentro de la frase tampoco se cita
 * sin fuente.
 *
 * @param {{ children: import('react').ReactNode, tipo: string, de?: string }} props
 */
export function CitaEnLinea({ children, tipo, de }) {
  return (
    <>
      <span style={{ fontFamily: SERIF, color: 'var(--ink)' }}>«{children}»</span>{' '}
      <span style={{ ...ETIQUETA, display: 'inline', whiteSpace: 'nowrap' }}>
        ({etiquetaDeCita(tipo, de)})
      </span>
    </>
  )
}

export const P = ({ children }) => (
  <p style={{ color: 'var(--ink70)', margin: '0 0 14px' }}>{children}</p>
)

/* Las viñetas van al cuerpo del párrafo, no a --fs-aux: en estas piezas una
   lista no es un aparte, es el argumento —las garantías que el pliego no
   exige, lo que la pieza no afirma, el método—, y a 13px lo más serio de la
   pieza era lo que menos se leía. */
export function Lista({ items }) {
  return (
    <ul style={{ margin: '0 0 14px', paddingLeft: 18 }}>
      {items.map((t, i) => (
        <li
          key={i}
          style={{
            color: 'var(--ink70)',
            marginBottom: 10,
          }}
        >
          {t}
        </li>
      ))}
    </ul>
  )
}

const eur = (n) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

/* ---- Tabla con scroll propio: nunca desborda la página ----
   Por debajo de 600px no se desplaza: cada fila se apila en pares etiqueta ·
   valor (`.cp-tabla` en index.css). Con scroll, a 375px la segunda columna —en
   «lo que exige / lo observado», la que trae el hallazgo— quedaba fuera de la
   pantalla, y el pie, dentro del mismo scroll, cortado a media frase. La
   etiqueta sale de `data-label`, el mismo texto que la cabecera de la columna. */
export function Tabla({ cols, rows, caption }) {
  const th = {
    textAlign: 'left',
    fontSize: 'var(--fs-micro)',
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    color: 'var(--ink50)',
    fontWeight: 600,
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  }
  const td = {
    fontSize: 'var(--fs-aux)',
    color: 'var(--ink70)',
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'top',
  }
  // La primera y la última columna van a ras: la tabla arranca en el mismo borde
  // izquierdo que el texto que la presenta, y acaba en el de su filete.
  const aRas = (i) => ({
    ...(i === 0 && { paddingLeft: 0 }),
    ...(i === cols.length - 1 && { paddingRight: 0 }),
  })
  return (
    <div className="cp-tabla" style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        {caption && (
          <caption
            style={{
              captionSide: 'top',
              textAlign: 'left',
              fontSize: 'var(--fs-meta)',
              color: 'var(--ink50)',
              paddingBottom: 8,
            }}
          >
            {caption}
          </caption>
        )}
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th
                key={i}
                scope="col"
                style={{ ...th, ...aRas(i), ...(c.right && { textAlign: 'right' }) }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  data-label={cols[j].label}
                  className={cols[j].mono ? 'mono' : undefined}
                  style={{
                    ...td,
                    ...aRas(j),
                    ...(cols[j].right && { textAlign: 'right', whiteSpace: 'nowrap' }),
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * El estado de cada solicitud de acceso, CALCULADO el día que se lee.
 *
 * La fecha de envío está congelada en la instantánea, como cualquier otra cifra
 * del reportaje; el vencimiento y el estado NO se escriben ahí. Una frase como
 * «el plazo vence el 9 de octubre» redactada a mano sigue diciendo lo mismo el
 * 10 de noviembre, y esa es la prosa rancia que este repositorio ya ha pagado
 * tres veces. Aquí la calcula `solicitud-enviada.ts` con la fecha de hoy.
 *
 * Y una cosa que NO hace: dar el vencimiento como acreditado. Salieron por
 * correo, así que consta el envío y no la recepción por el órgano competente,
 * que es donde el art. 20.1 arranca el mes. Eso lo dice la nota, y la dice
 * siempre.
 */
export function SolicitudesEnviadas({ bloque }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const items = bloque?.items ?? []
  const resumen = resumirEnvios(items, hoy)
  // Sin solicitudes no se pinta una tarjeta vacía: un hueco se lee como limpio.
  // El reportaje ya dice arriba que las preguntas se remitieron, así que no
  // queda un silencio, queda una frase menos.
  if (!resumen.concluyente) return null

  // Cuerpos: la frase de cada solicitud a --fs-body y en tinta plena, lo pedido
  // a --fs-aux bajo su propia etiqueta, la nota a --fs-aux. Iba todo a 13px y la
  // nota a 11 —el suelo de las etiquetas, no de un párrafo—: el registro de lo
  // que se ha pedido y de cuándo vence se leía como letra pequeña. Cada texto va
  // a la medida de lectura; la tarjeta ocupa la columna. Las frases no se
  // parten en columnas: las escribe `fraseDeEnvio` con cada salvedad del plazo
  // en su sitio, y una tabla de fechas las perdería.
  const frase = {
    fontSize: 'var(--fs-body)',
    color: 'var(--ink)',
    lineHeight: 1.55,
    maxWidth: 'var(--medida)',
  }
  const aparte = {
    fontSize: 'var(--fs-aux)',
    color: 'var(--ink70)',
    lineHeight: 1.5,
    maxWidth: 'var(--medida)',
  }
  const etiqueta = {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--fs-micro)',
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: 'var(--ink50)',
    marginTop: 8,
    marginBottom: 2,
  }
  return (
    <Card style={{ padding: '14px 16px', marginBottom: 14 }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          letterSpacing: '.04em',
          marginBottom: 12,
        }}
      >
        {bloque.titulo}
      </div>

      {items.map((e, i) => {
        const estado = estadoDeEnvio(e, hoy)
        const ultima = i === items.length - 1
        return (
          <div
            key={`${e.organismo}-${e.enviadaEl}`}
            style={{
              marginBottom: ultima ? 0 : 14,
              paddingBottom: ultima ? 0 : 14,
              borderBottom: ultima ? 'none' : '1px solid var(--border)',
            }}
          >
            <div style={{ marginBottom: 6 }}>
              <Pill tone={ESTADO_ENVIO_TONO[estado]} size="xs">
                {ESTADO_ENVIO_ETIQUETA[estado]}
              </Pill>
            </div>
            <div style={frase}>{fraseDeEnvio(e, hoy)}</div>
            {/* Lo que dijeron, atribuido. Va con la tinta de la frase y no con la
                de lo pedido: es la respuesta, no el contexto. */}
            {e.respuesta?.resumen && (
              <div style={{ ...frase, marginTop: 4 }}>{e.respuesta.resumen}</div>
            )}
            {/* Lo que contestaron sin resolver. Va con la tinta de la frase, no
                con la de lo pedido: es algo que dijeron. Y va SIN pastilla de
                estado propia, porque el estado no ha cambiado — que es
                justamente lo que hay que enseñar. */}
            {(e.incidencias ?? []).map((inc) => (
              <div key={inc.fecha} style={{ ...frase, marginTop: 4 }}>
                {inc.texto}
              </div>
            ))}
            <div style={etiqueta}>Lo que se pidió</div>
            <div style={aparte}>{e.pide}</div>
          </div>
        )
      })}

      <div
        style={{
          ...aparte,
          color: 'var(--ink50)',
          marginTop: 14,
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
        }}
      >
        {bloque.nota}
        {/* Con qué calendario se contó el último día de cada fila (art. 30.5
            LPACAP): sale de las filas, así que no puede nombrar a quien no
            aparece en ellas. */}
        {` ${fraseDeCalendarios(items)}`}
      </div>
    </Card>
  )
}

export default function ConteoVisitantes() {
  const { loading, error, data } = useReportaje('conteo-visitantes')

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
      <CabeceraPieza slug="conteo-visitantes" data={data} />

      {/* 1 · los dos contratos */}
      <SecHead num="01" kicker="El expediente" title="Los dos contratos" />
      <Tabla
        cols={[
          { label: 'Expediente' },
          { label: 'Adjudicataria' },
          { label: 'Importe', right: true, mono: true },
          { label: 'Ofertas', right: true, mono: true },
        ]}
        rows={data.contratos.map((c) => [
          <a key={c.exp} href={c.url} target="_blank" rel="noopener noreferrer">
            {c.exp}
          </a>,
          `${c.empresa} — ${c.objeto}`,
          eur(c.importe),
          String(c.licitadores),
        ])}
        caption="Importes sin impuestos. Fuente: Plataforma de Contratación del Sector Público."
      />

      {/* 2 · baseline */}
      <SecHead num="02" kicker="El punto de partida" title={data.baseline.titulo} />
      <Lista items={data.baseline.bullets} />

      {/* 3 · el hallazgo */}
      <SecHead num="03" kicker="Las memorias" title={data.hallazgo.titulo} />
      <P>{data.hallazgo.texto}</P>
      <Cita tipo="memoria" de="exps. 98/2025 y 100/2025" fuente={data.hallazgo.citaFuente}>
        {data.hallazgo.cita}
      </Cita>
      {data.hallazgo.remate.map((t, i) => (
        <P key={i}>{t}</P>
      ))}

      {/* 4 · qué se compró */}
      <SecHead num="04" kicker="El objeto" title={data.compra.titulo} />
      <P>El objeto declarado del contrato de sensores es</P>
      <Cita tipo="memoria" de="exp. 98/2025">
        {data.compra.objeto}
      </Cita>
      <P>{data.compra.matiz}</P>
      <Lista items={data.compra.objetivos} />

      {/* 5 · el baremo */}
      <SecHead num="05" kicker="El concurso" title={data.baremo.titulo} />
      <Tabla
        cols={[
          { label: 'Criterio' },
          { label: 'Puntos', right: true, mono: true },
          { label: 'Tipo' },
        ]}
        rows={data.baremo.filas.map((f) => [f.criterio, String(f.puntos), f.tipo])}
        caption="Criterios de adjudicación del expediente 98/2025, sobre 100 puntos."
      />
      <P>{data.baremo.texto}</P>
      <P>{data.baremo.contrapunto}</P>

      {/* 6 · protección de datos */}
      <SecHead num="06" kicker="Los datos" title={data.datos.titulo} />
      <P>{data.datos.texto}</P>
      <Cita tipo="memoria" de="exps. 98/2025 y 100/2025" fuente={data.datos.citaFuente}>
        {data.datos.cita}
      </Cita>
      <P>{data.datos.remate}</P>

      {/* 7 · la DANA */}
      <SecHead num="07" kicker="El contexto" title={data.dana.titulo} />
      <Lista items={data.dana.bullets} />

      {/* 8 · el plazo */}
      <SecHead num="08" kicker="El hito europeo" title={data.plazo.titulo} />
      <P>{data.plazo.texto}</P>

      {/* 9 · límites */}
      <SecHead num="09" kicker="Honestidad" title={data.limites.titulo} />
      <Lista items={data.limites.bullets} />

      {/* 10 · preguntas */}
      <SecHead num="10" kicker="Sin responder" title="Las preguntas registradas" />
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

      {/* 10 bis · el reloj de cada solicitud, calculado, no escrito a mano */}
      <SolicitudesEnviadas bloque={data.solicitudes} />

      <Card style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)', lineHeight: 1.5 }}>
          {data.replica}
        </div>
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
