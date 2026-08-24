import { Card, Pill } from '../Primitives'
import { Sparkline } from '../Charts'
import { leerIndicadorMunicipal, lecturaVisible } from '../../scraper/indicador-lectura'
import { Lectura } from './Lectura'
import { CompetenciaDelegada } from './CompetenciaDelegada'

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
 * Plazo de pago, fricción institucional (la X-ineficiencia de Leibenstein) y
 * salud fiscal.
 *
 * La comparación aparece SÓLO donde hay una fuente que la sostenga: el periodo
 * medio de pago y el gasto por habitante, que el ministerio calcula con la
 * misma norma para todos. No existe un conjunto equivalente de tasas de
 * licitador único, así que esas cifras se leen contra sí mismas y contra el
 * criterio del lector, nunca contra un percentil que no podríamos respaldar. Un
 * `pares` ausente no es un hueco pendiente: es la respuesta.
 *
 * Cada tarjeta lleva su PERIODO en la cabecera. Los contratos abarcan de 2017 a
 * 2026 y la ejecución es de un ejercicio: un porcentaje sin periodo se lee como
 * «este año», y eso bastaría para convertir una cifra correcta en una
 * afirmación falsa.
 *
 * `competencias` es el índice de `indexarCompetencias`, clave de indicador →
 * asignación firmada. Sin él la tarjeta no pinta ningún nombre, que es lo que
 * hacía hasta el 24-08-2026: las siete asignaciones firmadas de /gestion
 * —Compra Pública y Finanzas públicas y recaudación— estaban curadas, validadas
 * y vigiladas por `check:competencias`, y no llegaban a ningún lector, porque
 * este componente no tenía dónde recibirlas. La guarda las contaba como
 * «coincide»: sólo pregunta si la persona conserva el cargo, nunca si la fila
 * se pinta en alguna parte.
 */
export function PanelMunicipal({ municipales, titulo, intro, competencias }) {
  const items = (municipales ?? []).filter((m) => m.valor !== null)
  if (!items.length) return null
  // La frase de arriba SALE de los datos en vez de repetirlos. Escrita a mano
  // decía «sólo el periodo medio de pago lleva comparación» y dejó de ser
  // cierta en cuanto entró el gasto por habitante: una prosa que reafirma una
  // propiedad que el dato ya conoce sólo puede quedarse vieja.
  const conPares = items.filter((m) => m.pares)
  const sinPares = items.filter((m) => !m.pares)

  return (
    <>
      <h2
        style={{
          fontSize: 'var(--fs-body)',
          fontWeight: 650,
          margin: '28px 0 4px',
          letterSpacing: '-.01em',
        }}
      >
        {titulo}
      </h2>
      <p
        style={{
          margin: '0 0 12px',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          maxWidth: '64ch',
        }}
      >
        {intro}{' '}
        {/* Sólo con dos o más: con una sola tarjeta la frase se convierte en un
            preámbulo de su propio subtítulo, y el porqué de la comparación lo
            lleva ya cada banda en `pares.descripcion`. Ahí decía además «que el
            ministerio calcula igual para todos», que era cierto del plazo de
            pago y falso del recuento de denominadores —ése lo calculamos aquí—:
            la frase genérica se quedó vieja en cuanto el conjunto dejó de ser
            homogéneo, que es lo que pasa siempre con las frases genéricas. */}
        {items.length >= 2 && conPares.length > 0 && (
          <>
            Llevan comparación con otros municipios{' '}
            {conPares.map((m, idx) => (
              <span key={m.id}>
                {idx > 0 && (idx === conPares.length - 1 ? ' y ' : ', ')}
                <strong>{m.etiqueta.toLowerCase()}</strong>
              </span>
            ))}
            .{' '}
          </>
        )}
        {items.length >= 2 &&
          sinPares.length > 0 &&
          'El resto no la lleva: no existe una fuente que las mida del mismo modo en todas partes.'}
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
                <h3 style={{ fontSize: 'var(--fs-body)', fontWeight: 650, margin: 0 }}>
                  {m.etiqueta}
                </h3>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Pill tone={d.tone}>{d.label}</Pill>
                  <span
                    className="mono"
                    style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                  >
                    {m.periodo}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 10 }}>
                <span
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-page)',
                    fontWeight: 600,
                    letterSpacing: '-.02em',
                    color:
                      m.referencia && m.valor > m.referencia.valor ? 'var(--warn-ink)' : undefined,
                  }}
                >
                  {fmt(m.valor, m.formato)}
                </span>
                {m.formato === 'dias' ? (
                  m.referencia && (
                    // El umbral es de la norma, no nuestro: por eso se enseña
                    // junto a la cifra y con su enlace, en vez de convertirse en
                    // un semáforo que juzgue por el lector.
                    <span
                      className="mono"
                      style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}
                    >
                      {m.valor > m.referencia.valor ? '×' : ''}
                      {m.valor > m.referencia.valor
                        ? (m.valor / m.referencia.valor).toFixed(1)
                        : ''}{' '}
                      el límite de{' '}
                      <a
                        href={m.referencia.fuente}
                        style={{ color: 'var(--civic)' }}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {m.referencia.etiqueta}
                      </a>
                    </span>
                  )
                ) : (
                  <span
                    className="mono"
                    style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}
                  >
                    {crudo(m.numerador.valor, m.formato)} de{' '}
                    {m.denominadorUnidad
                      ? `${m.denominador.valor.toLocaleString('es-ES', { maximumFractionDigits: 0 })} ${m.denominadorUnidad}`
                      : crudo(m.denominador.valor, m.formato)}
                  </span>
                )}
              </div>

              {m.serie?.length >= 2 && (
                <div style={{ marginTop: 10 }}>
                  <Sparkline data={m.serie.map((p) => p.valor)} color="var(--warn-ink)" h={40} />
                  <div
                    className="mono"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 'var(--fs-micro)',
                      color: 'var(--ink50)',
                      marginTop: 3,
                    }}
                  >
                    <span>{m.serie[0].periodo}</span>
                    <span>{m.serie[m.serie.length - 1].periodo}</span>
                  </div>
                </div>
              )}

              {m.pares && (
                <p
                  className="mono"
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', margin: '8px 0 0' }}
                >
                  Mediana de {m.pares.n.toLocaleString('es-ES')} municipios:{' '}
                  {fmt(m.pares.mediana, m.formato)} · aquí, percentil {m.pares.percentil}
                </p>
              )}

              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: 'var(--fs-aux)',
                  color: 'var(--ink70, var(--ink50))',
                }}
              >
                {m.descripcion}
              </p>

              <Lectura
                lectura={lecturaVisible(leerIndicadorMunicipal(m), {
                  cifra: true,
                  banda: Boolean(m.pares),
                })}
              />

              {m.caveats?.length > 0 && (
                <ul
                  style={{
                    margin: '10px 0 0',
                    paddingLeft: 18,
                    color: 'var(--ink50)',
                    fontSize: 'var(--fs-meta)',
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
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', margin: '10px 0 0' }}
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

              {/* Al final, igual que en ServicioCard y por el mismo motivo: un
                  nombre propio arriba, pegado a la cifra, construiría «mira lo
                  que cuesta lo suyo» antes de que el lector llegue a la
                  advertencia que lo desarma. */}
              <CompetenciaDelegada asignacion={competencias?.get(m.id)} />
            </Card>
          )
        })}
      </div>
    </>
  )
}
