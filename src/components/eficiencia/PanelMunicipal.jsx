import { Card, Pill } from '../Primitives'

const DIMENSION = {
  friccion: { label: 'fricción institucional', tone: 'warn' },
  fiscal: { label: 'salud fiscal', tone: 'civic' },
  respuesta: { label: 'respuesta', tone: 'intel' },
}

const fmt = (v, formato) => {
  if (v === null || v === undefined) return '—'
  if (formato === 'porcentaje')
    return `${(v * 100).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
  if (formato === 'euros')
    return v.toLocaleString('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    })
  if (formato === 'dias') return `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} días`
  return v.toLocaleString('es-ES')
}

const crudo = (v, formato) =>
  formato === 'porcentaje' || formato === 'numero'
    ? v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
    : v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/**
 * La cuarta dimensión: X-ineficiencia de Leibenstein.
 *
 * No hay banda de pares aquí y no debe parecer que la hay. No existe un
 * conjunto nacional comparable de tasas de licitador único a escala municipal,
 * así que estas cifras se leen contra sí mismas en el tiempo y contra el
 * criterio del lector — no contra un percentil que no podríamos respaldar.
 *
 * Cada tarjeta lleva su PERIODO en la cabecera. Los contratos abarcan de 2017 a
 * 2026 y la ejecución es de un ejercicio: un porcentaje sin periodo se lee como
 * «este año», y eso bastaría para convertir una cifra correcta en una
 * afirmación falsa.
 */
export function PanelMunicipal({ municipales }) {
  const items = (municipales ?? []).filter((m) => m.valor !== null)
  if (!items.length) return null

  return (
    <>
      <h2 style={{ fontSize: 15, fontWeight: 650, margin: '28px 0 4px', letterSpacing: '-.01em' }}>
        Cómo funciona la casa por dentro
      </h2>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink60)', maxWidth: '64ch' }}>
        Competencia en la contratación, distancia entre el presupuesto aprobado y el ejecutado. Son
        medidas de fricción, no de coste, y no llevan comparación con otros municipios porque no
        existe una fuente que la respalde.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((m) => {
          const d = DIMENSION[m.dimension] ?? DIMENSION.friccion
          return (
            <Card key={m.id}>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                }}
              >
                <h3 style={{ fontSize: 15, fontWeight: 650, margin: 0 }}>{m.etiqueta}</h3>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Pill tone={d.tone}>{d.label}</Pill>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
                    {m.periodo}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 10 }}>
                <span
                  className="mono"
                  style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-.02em' }}
                >
                  {fmt(m.valor, m.formato)}
                </span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink60)' }}>
                  {crudo(m.numerador.valor, m.formato)} de {crudo(m.denominador.valor, m.formato)}
                </span>
              </div>

              <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink70, var(--ink60))' }}>
                {m.descripcion}
              </p>

              {m.caveats?.length > 0 && (
                <ul
                  style={{
                    margin: '10px 0 0',
                    paddingLeft: 18,
                    color: 'var(--ink60)',
                    fontSize: 12,
                  }}
                >
                  {m.caveats.map((c) => (
                    <li key={c} style={{ marginBottom: 3 }}>
                      {c}
                    </li>
                  ))}
                </ul>
              )}

              {m.citas?.length > 0 && (
                <p
                  className="mono"
                  style={{ fontSize: 10.5, color: 'var(--ink50)', margin: '10px 0 0' }}
                >
                  Fuente:{' '}
                  <a
                    href={m.citas[0].url}
                    style={{ color: 'var(--civic)' }}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {m.citas[0].etiqueta} ↗
                  </a>
                </p>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}
