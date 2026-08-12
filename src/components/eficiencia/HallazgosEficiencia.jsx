import { Card, Pill, ExtLink } from '../Primitives'

/**
 * Las fichas firmadas sobre desviaciones del panel.
 *
 * Tres cosas que esta sección hace distinto a /hallazgos, y las tres a
 * propósito:
 *
 *  · **No nombra a nadie.** El esquema no tiene dónde: habla de un servicio
 *    municipal, no de quién lo decidió. Ver src/scraper/eficiencia-finding.ts.
 *  · **Publica la medición congelada**, con su periodo, al lado del texto. Una
 *    cita de pleno se queda quieta; una cifra no, y el lector tiene que poder
 *    ver de qué entrega habla la ficha sin fiarse de la prosa.
 *  · **Marca la fiabilidad de la comparación.** Un plazo que la ley fija en 30
 *    días y una posición entre municipios que declaran la magnitud cada uno a
 *    su manera no valen lo mismo, y enterrar la diferencia sería la mentira por
 *    vecindad que el resto de la página existe para impedir.
 *
 * El estado vacío no es un hueco: dice que no hay ninguna ficha firmada
 * todavía y por qué eso no significa que no haya nada que mirar.
 */

const MOTIVO_ETIQUETA = {
  'umbral-legal': 'supera un límite legal',
  'posicion-alta': 'por encima de casi todos sus pares',
  'posicion-baja': 'por debajo de casi todos sus pares',
  movimiento: 'se aleja de sus pares con los años',
}

const num = (v, max = 2) => v.toLocaleString('es-ES', { maximumFractionDigits: max })

function Medicion({ medicion }) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: '8px 10px',
        background: 'var(--soft)',
        borderRadius: 4,
        fontSize: 12.5,
        color: 'var(--ink70, var(--ink60))',
      }}
    >
      <span className="mono" style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 600 }}>
        {num(medicion.valor)} {medicion.unidad}
      </span>{' '}
      en <strong>{medicion.periodo}</strong>
      {medicion.referencia && (
        <>
          {' · límite '}
          <span className="mono">{num(medicion.referencia.valor)}</span> (
          {medicion.referencia.etiqueta})
        </>
      )}
      {medicion.pares && (
        <>
          {' · mediana de '}
          <span className="mono">{num(medicion.pares.n, 0)}</span> comparables:{' '}
          <span className="mono">{num(medicion.pares.mediana)}</span>
        </>
      )}
    </div>
  )
}

function FichaEficiencia({ ficha }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {ficha.motivos.map((m) => (
          <Pill key={m} tone={m === 'umbral-legal' ? 'warn' : 'civic'}>
            {MOTIVO_ETIQUETA[m] ?? m}
          </Pill>
        ))}
        {/* Una comparación floja se dice en la ficha, no en otra página. */}
        {ficha.fiabilidad === 'debil' && <Pill tone="neutral">comparación con reservas</Pill>}
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 650, margin: '8px 0 0', letterSpacing: '-.01em' }}>
        {ficha.titulo}
      </h3>
      <Medicion medicion={ficha.medicion} />
      <p style={{ fontSize: 13.5, color: 'var(--ink)', margin: '10px 0 0', lineHeight: 1.55 }}>
        {ficha.cuerpo}
      </p>
      {ficha.caveats?.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--ink60)' }}>
          {ficha.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {ficha.response && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            borderLeft: '2px solid var(--ok)',
            background: 'var(--soft)',
            borderRadius: '0 4px 4px 0',
          }}
        >
          <div
            className="mono"
            style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--ink50)' }}
          >
            Réplica · {ficha.response.from}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>«{ficha.response.quote}»</p>
        </div>
      )}
      {ficha.corrections?.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink60)' }}>
          {ficha.corrections.map((c) => (
            <p key={`${c.field}-${c.correctedAt}`} style={{ margin: '4px 0 0' }}>
              <strong>Corregido el {c.correctedAt}</strong> ({c.field}):{' '}
              <span style={{ textDecoration: 'line-through' }}>{c.original}</span> → {c.corrected}.
              Motivo: {c.reason}
            </p>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ink50)' }}>
        {ficha.citas.map((c, i) => (
          <span key={c.url}>
            {i > 0 && ' · '}
            <ExtLink href={c.url}>{c.etiqueta}</ExtLink>
          </span>
        ))}
        {' · '}Publicado el {ficha.publishedAt} por {ficha.curatorName}
      </div>
    </Card>
  )
}

export function HallazgosEficiencia({ data }) {
  const items = data?.items ?? []
  const retiradas = data?.retractions ?? []

  return (
    <section id="hallazgos" style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 15, fontWeight: 650, margin: '0 0 4px', letterSpacing: '-.01em' }}>
        Hallazgos firmados
      </h2>
      <p style={{ fontSize: 12.5, color: 'var(--ink60)', maxWidth: '64ch', margin: '0 0 10px' }}>
        Una ficha por cifra, sobre un servicio y nunca sobre una persona. Cada una congela la
        medición de la que habla —valor, periodo y celda de origen— para que se pueda volver a
        comprobar contra la fuente cuando ésta se mueva.
      </p>

      {items.length === 0 ? (
        <Card>
          {/* Un hueco se lee como «no hay nada que contar». Esto dice qué
              significa el vacío, que es que nadie ha firmado todavía. */}
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink60)' }}>
            Todavía no hay ninguna ficha firmada. El panel de arriba señala por sí solo dónde se
            sale cada cifra; un hallazgo exige además que alguien haya comprobado el expediente y
            puesto su nombre, y eso no ha ocurrido aún.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((f) => (
            <FichaEficiencia key={f.id} ficha={f} />
          ))}
        </div>
      )}

      {retiradas.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink60)' }}>
          <strong>
            {retiradas.length} ficha{retiradas.length === 1 ? '' : 's'} retirada
            {retiradas.length === 1 ? '' : 's'}.
          </strong>{' '}
          El registro guarda el digesto de cada una, no su texto: quien tenga una versión anterior
          del repositorio —que es público— puede comprobar exactamente cuál se fue.
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {retiradas.map((r) => (
              <li key={r.findingId}>
                <span className="mono" style={{ fontSize: 11 }}>
                  {r.findingId}
                </span>{' '}
                — {r.reason} ({r.retractedAt})
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
