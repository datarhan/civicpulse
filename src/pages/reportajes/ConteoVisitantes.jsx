import { useReportaje } from '../../hooks/useReportaje'
import { Card } from '../../components/Primitives'
import { CorrectionNote } from '../../components/reportajes/CorrectionNote'

const SERIF = "'Fraunces', Georgia, serif"

/* ---- Encabezado de sección numerado (mismo patrón que los otros reportajes) ---- */
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

/**
 * Cita literal de un documento. Lleva SIEMPRE su procedencia debajo: una cita
 * sin fuente en una superficie legalmente material es exactamente lo que este
 * sitio no publica.
 */
function Cita({ children, fuente }) {
  return (
    <figure style={{ margin: '18px 0' }}>
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

const P = ({ children }) => <p style={{ color: 'var(--ink70)', margin: '0 0 14px' }}>{children}</p>

function Lista({ items }) {
  return (
    <ul style={{ margin: '0 0 14px', paddingLeft: 18 }}>
      {items.map((t, i) => (
        <li
          key={i}
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            marginBottom: 8,
            lineHeight: 1.5,
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

/* ---- Tabla con scroll propio: nunca desborda la página ---- */
function Tabla({ cols, rows, caption }) {
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
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
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
              <th key={i} scope="col" style={{ ...th, ...(c.right && { textAlign: 'right' }) }}>
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
                  className={cols[j].mono ? 'mono' : undefined}
                  style={{
                    ...td,
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
        className="mono"
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
        Publicado el {m.publicadoEl} · cifras congeladas a {m.fechaDatos}
      </div>

      <CorrectionNote correcciones={m.correcciones} />

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

      <p
        style={{
          fontFamily: SERIF,
          fontSize: 'var(--fs-page)',
          lineHeight: 1.5,
          color: 'var(--ink)',
          margin: '22px 0 0',
        }}
      >
        {data.entradilla}
      </p>

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
      <Cita fuente={data.hallazgo.citaFuente}>{data.hallazgo.cita}</Cita>
      {data.hallazgo.remate.map((t, i) => (
        <P key={i}>{t}</P>
      ))}

      {/* 4 · qué se compró */}
      <SecHead num="04" kicker="El objeto" title={data.compra.titulo} />
      <P>El objeto declarado del contrato de sensores es</P>
      <Cita fuente="Memoria justificativa del expediente 98/2025">{data.compra.objeto}</Cita>
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
      <Cita fuente={data.datos.citaFuente}>{data.datos.cita}</Cita>
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
    </div>
  )
}
