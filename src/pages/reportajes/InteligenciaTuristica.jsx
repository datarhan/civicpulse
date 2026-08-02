import { useReportaje } from '../../hooks/useReportaje'
import { Card } from '../../components/Primitives'
import { CorrectionNote } from '../../components/reportajes/CorrectionNote'

const SERIF = "'Fraunces', Georgia, serif"

/* ---- Encabezado de sección numerado (mismo patrón que ReconstruccionDana) ---- */
function SecHead({ num, kicker, title }) {
  return (
    <div style={{ margin: '34px 0 12px' }}>
      <div
        className="mono"
        style={{ fontSize: 11.5, color: 'var(--ink50)', letterSpacing: '.04em', marginBottom: 6 }}
      >
        {num} · {kicker}
      </div>
      <h2
        style={{
          fontFamily: SERIF,
          fontSize: 25,
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

/* ---- Tabla genérica con scroll horizontal propio ---- */
function Tabla({ cols, rows, caption }) {
  const th = {
    textAlign: 'left',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    color: 'var(--ink50)',
    fontWeight: 600,
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  }
  const td = {
    fontSize: 13,
    color: 'var(--ink80)',
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'top',
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
        {caption && (
          <caption
            style={{
              captionSide: 'top',
              textAlign: 'left',
              fontSize: 12,
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
                    ...(cols[j].strong && { color: 'var(--ink)', fontWeight: 500 }),
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

/* ---- Callout ámbar ---- */
function Callout({ title, children }) {
  return (
    <div
      style={{
        background: 'var(--warn-soft)',
        border: '1px solid var(--warn)',
        borderRadius: 12,
        padding: '16px 20px',
        margin: '16px 0 8px',
      }}
    >
      <div
        style={{
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '.1em',
          color: 'var(--warn-ink)',
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 14, color: 'var(--ink80)', lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}

function eur(n) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)
}

const cap = () => ({
  fontSize: 12.5,
  color: 'var(--ink50)',
  margin: '10px 0 4px',
  lineHeight: 1.45,
})
const boxH = () => ({
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '.1em',
  color: 'var(--ink50)',
  margin: '0 0 12px',
  fontWeight: 700,
})
const boxUl = () => ({ margin: 0, paddingLeft: 18 })
const boxLi = () => ({ fontSize: 13, color: 'var(--ink60)', marginBottom: 8, lineHeight: 1.45 })

export default function InteligenciaTuristica() {
  const { loading, error, data } = useReportaje('inteligencia-turistica')

  if (loading)
    return (
      <div className="cp-page" style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
        <p style={{ color: 'var(--ink60)' }}>Cargando reportaje…</p>
      </div>
    )
  if (error || !data)
    return (
      <div className="cp-page" style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
        <p style={{ color: 'var(--ink60)' }}>No se pudo cargar el reportaje.</p>
      </div>
    )

  const m = data.meta

  return (
    <div
      className="cp-page"
      style={{ padding: '24px', maxWidth: 760, margin: '0 auto', fontSize: 16, lineHeight: 1.62 }}
    >
      {m.estado !== 'publicado' && (
        <div
          style={{
            background: 'var(--warn-soft)',
            border: '1px solid var(--warn)',
            color: 'var(--warn-ink)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 12.5,
            marginBottom: 22,
          }}
        >
          <strong>Borrador editorial · pendiente de derecho de réplica.</strong> Esta pieza aún no
          es una publicación definitiva: se recabará la versión del Ayuntamiento de Riba-roja y de
          las empresas citadas, y se incorporará antes de darla por publicada.
        </div>
      )}

      <div
        className="mono"
        style={{
          fontSize: 10.5,
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
          fontSize: 'clamp(30px, 5vw, 42px)',
          fontWeight: 600,
          letterSpacing: '-.015em',
          lineHeight: 1.08,
          margin: '4px 0 14px',
        }}
      >
        {m.titulo}
      </h1>
      <p style={{ fontSize: 18, color: 'var(--ink60)', lineHeight: 1.5, margin: '0 0 26px' }}>
        {m.subtitulo}
      </p>

      <CorrectionNote correcciones={m.correcciones} />

      {/* KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 1,
          background: 'var(--border)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
          margin: '0 0 30px',
        }}
      >
        {data.kpis.map((s, i) => (
          <div key={i} style={{ background: 'var(--paper)', padding: '16px 14px' }}>
            <div
              className="mono"
              style={{ fontSize: 22, fontWeight: 500, color: 'var(--ink)', lineHeight: 1 }}
            >
              {s.n}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink60)', marginTop: 7, lineHeight: 1.3 }}>
              {s.l}
            </div>
          </div>
        ))}
      </div>

      <article style={{ color: 'var(--ink80)' }}>
        <SecHead num="01" kicker="El anuncio" title="«Un proyecto pionero»" />
        <p>
          El 7 de julio de 2026, la web del Ayuntamiento de Riba-roja de Túria publicó una nota sin
          firma: el municipio «impulsa la inteligencia turística con una innovadora plataforma de
          análisis de movilidad y comportamiento de visitantes». El texto anuncia la culminación de
          un proyecto desarrollado por Movea Consulting con fondos europeos Next Generation, y lo
          hace con el vocabulario de una capital turística:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '14px 0' }}>
          {data.claims.map((c, i) => (
            <div
              key={i}
              style={{
                borderLeft: '3px solid var(--civic)',
                padding: '6px 14px',
                fontSize: 14.5,
                color: 'var(--ink80)',
                fontStyle: 'italic',
                background: 'var(--soft)',
                borderRadius: '0 8px 8px 0',
              }}
            >
              {c}
            </div>
          ))}
        </div>
        <p>
          {data.claimsOmitido} {data.notaLinkSense}
        </p>
        <p>
          Detrás de la nota hay un contrato concreto — el expediente 101/2025, adjudicado por 31.339
          euros (IVA incluido) — y detrás del contrato, un plan mucho mayor. Este reportaje
          reconstruye ambos a partir del registro público de contratación, los pliegos firmados y
          las actas de la mesa de contratación.
        </p>

        <SecHead num="02" kicker="El plan" title="De un barranco a un cuadro de mando" />
        <p>
          En diciembre de 2022, Riba-roja obtuvo un{' '}
          <b>Plan de Sostenibilidad Turística en Destino (PSTD)</b> de {data.plan.total}, financiado
          al 100 % por los fondos europeos Next Generation dentro del Plan de Recuperación. Su
          objetivo declarado: {data.plan.objetivo}. El plan se despliega en {data.plan.actuaciones}{' '}
          — la mayor parte del dinero es obra física (el itinerario del Barranc dels Moros), y a su
          alrededor creció una constelación de contratos tecnológicos y de consultoría.
        </p>
        <p>
          El calendario no lo fijó el municipio: el {data.plan.deadline}. Esa fecha explica el
          esprint final: cinco adjudicaciones entre el 16 de diciembre de 2025 y el 2 de enero de
          2026, las pérgolas en febrero, el carril bici a finales de mayo — y los últimos menores,
          incluido el asesoramiento de la sociedad estatal SEGITTUR (32 días de contrato) y el
          estudio que evalúa el propio plan, firmados también en mayo de 2026, a semanas del cierre.
        </p>
        <Card style={{ margin: '18px 0 8px' }}>
          <Tabla
            caption="Actuaciones del PSTD localizadas en el registro de contratación (importes de adjudicación sin IVA)"
            cols={[
              { label: 'Año' },
              { label: 'Objeto' },
              { label: 'Adjudicatario' },
              { label: '€ sin IVA', right: true, mono: true, strong: true },
              { label: 'Ofertas', right: true, mono: true },
              { label: 'Proc.' },
            ]}
            rows={data.cluster
              .filter((r) => r.pstd)
              .map((r) => [
                r.ano,
                r.objeto,
                r.empresa,
                eur(r.importe),
                String(r.licitadores),
                r.proc,
              ])}
          />
        </Card>
        <p style={cap()}>{data.clusterNota}</p>
        <p>
          Tres nombres se repiten. <b>Sien Planificación Inteligente S.L.</b> dirigió el Plan
          Director de Destino Turístico Inteligente en 2021 (contrato menor, 14.650 €), ganó en 2024
          — como única licitadora — la «Smart Office» del PSTD (64.960 €) y en 2026 el Estudio de
          Repercusiones que evalúa el plan (14.100 €): la misma consultora diseña la estrategia,
          opera su oficina técnica y evalúa sus resultados. <b>Auren</b> ejerce la gerencia del plan
          (45.250 €). Y la concurrencia fue desigual:{' '}
          <b>cuatro de los once procedimientos abiertos del plan recibieron una única oferta</b> —
          la Smart Office, las campañas de promoción, el suministro de accesibilidad y las pérgolas
          del Barranc, esta última adjudicada además por el 100 % del presupuesto base, sin baja.
        </p>

        <SecHead num="03" kicker="Los contratos" title="Cómo se adjudicó la «inteligencia»" />
        <p>
          Los dos contratos que la nota municipal celebra — el Panel de Inteligencia (97/2025) y los
          informes de movilidad (101/2025) — se licitaron por procedimiento abierto, con 15 días
          naturales para presentar ofertas, y se resolvieron el mismo día. Los expedientes
          documentan competencia real, pero también decisiones de diseño que merecen explicación.
        </p>
        <p>
          <b>El panel ({data.panel.expediente})</b>, con base de {data.panel.base}, recibió 6
          ofertas. {data.panel.criteriosNota} La mesa necesitó nueve actas: dos licitadoras fueron
          excluidas por «contaminación de sobres» — según el acta, «vulneración del principio de
          secreto de las proposiciones» —, y un error aritmético en la baremación obligó a
          rectificar el informe técnico. El resultado final:
        </p>
        <Card style={{ margin: '18px 0 8px' }}>
          <Tabla
            caption={`Panel de Inteligencia · criterios: juicio de valor 49 · precio 40 · equipo 7 · mejoras 4`}
            cols={[
              { label: 'Licitador' },
              { label: 'Precio (IVA inc.)', right: true, mono: true },
              { label: 'Sobre B (49)', right: true, mono: true },
              { label: 'Sobre C (51)', right: true, mono: true },
              { label: 'Total', right: true, mono: true, strong: true },
              { label: 'Resultado' },
            ]}
            rows={data.panel.ofertas.map((o) => [
              o.empresa,
              o.precio,
              o.sobreB,
              o.sobreC,
              o.total,
              o.resultado,
            ])}
          />
        </Card>
        <p style={cap()}>
          Excluidas antes de la valoración: {data.panel.excluidas.map((e) => e.empresa).join(' y ')}{' '}
          ({data.panel.excluidas[0].motivo}).
        </p>
        <p>
          Deepsense ganó con la oferta más barata — un 43 % por debajo del presupuesto base — y
          pleno en los criterios automáticos, pese a que la mejor propuesta técnica fue la de Gimeno
          Digital (40,25 frente a 35,75). {data.panel.anormalidad}
        </p>
        <p>{data.panel.erratas}</p>
        <p>
          <b>Los informes de movilidad ({data.movea.expediente})</b>, base de {data.movea.base},
          atrajeron solo dos ofertas — y aquí el orden se invirtió: ganó la más cara.
        </p>
        <Card style={{ margin: '18px 0 8px' }}>
          <Tabla
            caption="Informes de movilidad · criterios: juicio de valor 40 · precio 40 · indicadores adicionales 15 · jefe de proyecto 5"
            cols={[
              { label: 'Licitador' },
              { label: 'Precio (sin IVA)', right: true, mono: true },
              { label: 'Sobre B (40)', right: true, mono: true },
              { label: 'Sobre C (60)', right: true, mono: true },
              { label: 'Total', right: true, mono: true, strong: true },
              { label: 'Resultado' },
            ]}
            rows={data.movea.ofertas.map((o) => [
              o.empresa,
              o.precio,
              o.sobreB,
              o.sobreC,
              o.total,
              o.resultado,
            ])}
          />
        </Card>
        <p>{data.movea.ofertasNota}</p>
        <p style={cap()}>
          Cronologías completas — panel: {data.panel.hitos} · movilidad: {data.movea.hitos}
        </p>

        <SecHead num="04" kicker="Quién cobra" title="Los adjudicatarios" />
        <p>
          Los describimos por lo que consta en registros y documentos públicos — objeto social,
          producto, otros contratos —, sin atribuir irregularidad alguna.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 14,
            margin: '16px 0',
          }}
        >
          {[data.empresas.deepsense, data.empresas.movea].map((e, i) => (
            <div
              key={i}
              style={{
                background: 'var(--soft)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '16px 18px',
              }}
            >
              <h3 style={{ fontSize: 14.5, margin: '0 0 10px', color: 'var(--ink)' }}>
                {e.titulo}
              </h3>
              <ul style={boxUl()}>
                {e.bullets.map((b, j) => (
                  <li key={j} style={boxLi()}>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p>{data.empresas.vinculos}</p>
        <p>{data.comparables.parrafo1}</p>
        <p>{data.comparables.parrafo2}</p>

        <SecHead num="05" kicker="La letra pequeña" title="Qué compró exactamente el pueblo" />
        <p>
          Los pliegos técnicos — 24 y 23 páginas — describen lo contratado. Del panel de
          inteligencia:
        </p>
        <ul>
          {data.compra.panel.map((b, i) => (
            <li key={i} style={{ marginBottom: 7, fontSize: 15 }}>
              {b}
            </li>
          ))}
        </ul>
        <p>
          Para un plazo de seis meses y 25.887 euros, ese catálogo de exigencias — certificación del
          Esquema Nacional de Seguridad incluida — es difícilmente alcanzable para quien parta de
          cero: en la práctica, el pliego describe un producto que ya existe, y la adjudicataria
          ofertó el suyo.
        </p>
        <p>De los informes de movilidad:</p>
        <ul>
          {data.compra.movilidad.map((b, i) => (
            <li key={i} style={{ marginBottom: 7, fontSize: 15 }}>
              {b}
            </li>
          ))}
        </ul>
        <p>{data.compra.campanas}</p>
        <Callout title="Lo que caduca con el contrato">{data.compra.caducidad}</Callout>
        <Callout title="La promesa de datos abiertos">
          {data.compra.openData.promesa}
          <div style={{ marginTop: 8, fontWeight: 600 }}>{data.compra.openData.estado}</div>
        </Callout>

        <SecHead num="06" kicker="La escala" title="El turismo que se quiere medir" />
        <ul>
          {data.baseline.bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: 7, fontSize: 15 }}>
              {b}
            </li>
          ))}
        </ul>
        <blockquote
          style={{
            margin: '16px 0',
            padding: '12px 18px',
            borderLeft: '3px solid var(--border2, var(--border))',
            background: 'var(--soft)',
            borderRadius: '0 8px 8px 0',
            fontSize: 14.5,
            fontStyle: 'italic',
            color: 'var(--ink80)',
          }}
        >
          {data.baseline.plenoQuote}
          <div style={{ fontSize: 12, color: 'var(--ink50)', marginTop: 8, fontStyle: 'normal' }}>
            {data.baseline.plenoQuoteFuente}
          </div>
        </blockquote>

        <SecHead num="07" kicker="El contexto" title="Un plan turístico atravesado por la DANA" />
        <ul>
          {data.dana.bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: 7, fontSize: 15 }}>
              {b}
            </li>
          ))}
        </ul>

        <SecHead num="08" kicker="Lo que falta" title="Preguntas abiertas" />
        <p>
          Estas son las preguntas que este reportaje deja planteadas al Ayuntamiento de Riba-roja de
          Túria y, en lo que les afecta, a las empresas citadas:
        </p>
        <ol>
          {data.preguntas.map((q, i) => (
            <li key={i} style={{ marginBottom: 8, fontSize: 15 }}>
              {q}
            </li>
          ))}
        </ol>
      </article>

      {/* Fuentes + método */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 14,
          margin: '32px 0 0',
        }}
      >
        <div
          style={{
            background: 'var(--soft)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '18px 20px',
          }}
        >
          <h3 style={boxH()}>Fuentes primarias</h3>
          <ul style={boxUl()}>
            {data.fuentes.map((f, i) => (
              <li key={i} style={boxLi()}>
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
            borderRadius: 12,
            padding: '18px 20px',
          }}
        >
          <h3 style={boxH()}>Método y cautelas</h3>
          <ul style={boxUl()}>
            {data.metodo.map((t, i) => (
              <li key={i} style={boxLi()}>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p style={{ fontSize: 13, color: 'var(--ink60)', margin: '16px 0 0', lineHeight: 1.5 }}>
        Datos a {m.fechaDatos}. El derecho de réplica está abierto para el Ayuntamiento y las
        empresas citadas: cualquier respuesta se publicará íntegra. Contacto y correcciones:{' '}
        <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
          aviso legal
        </a>
        .
      </p>
    </div>
  )
}
