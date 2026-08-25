import { EjePercentil } from './EjePercentil'
import { Sparkline } from '../Charts'
import { estiloLibro } from './libro.css.js'

const fmt = (v, formato) =>
  formato === 'porcentaje'
    ? `${(v * 100).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
    : formato === 'euros'
      ? `${v.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`
      : v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const SUFIJO = { dias: 'días', euros: '', porcentaje: '' }

/**
 * Frente a qué se mide cada indicador, en tres estados y ni uno más.
 *
 * 1. **Con comparables** → el mismo eje de percentil que el libro de servicios.
 * 2. **Un porcentaje sin comparables** → una barra de 0 a 100, que es una
 *    escala de verdad y no insinúa comparación con nadie.
 * 3. **Ni una cosa ni la otra** → se dice, en texto.
 *
 * Lo que NO se dibuja es el límite legal, y la razón importa. El plazo de 30
 * días es un umbral en DÍAS; el eje va en percentiles; y la fuente publica el
 * percentil de Riba-roja pero no el de los 30 días. Sé que cae entre el p75
 * (27,14 d) y el p94, y nada más. Pintar ahí una línea roja sería inventar
 * justo la cifra que la fuente no da, en el sitio donde más se nota. El hecho
 * legal va entero en la última columna, con su múltiplo y su norma enlazada,
 * que es donde se puede decir sin aproximar.
 */
function Referencia({ m }) {
  if (m.pares?.percentil !== undefined) {
    return (
      <>
        <EjePercentil
          percentil={m.pares.percentil}
          banda={null}
          descripcion={`${m.etiqueta}: percentil ${m.pares.percentil} entre ${m.pares.n} ${m.pares.descripcion ?? 'comparables'}; mediana ${fmt(m.pares.mediana, m.formato)}`}
        />
        <span className="cp-fila-meta mono">
          p{m.pares.percentil} · mediana {fmt(m.pares.mediana, m.formato)} {SUFIJO[m.formato] ?? ''}{' '}
          · n={m.pares.n.toLocaleString('es-ES')}
        </span>
      </>
    )
  }

  if (m.formato === 'porcentaje') {
    const pct = Math.max(0, Math.min(100, m.valor * 100))
    return (
      <>
        <span
          role="img"
          aria-label={`${fmt(m.valor, m.formato)} sobre el total; sin banda de municipios comparables en esta fuente`}
          style={{
            position: 'relative',
            display: 'block',
            height: 14,
            borderRadius: 'var(--r-pill)',
            background: 'var(--soft)',
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 0,
              width: `${pct}%`,
              top: 0,
              bottom: 0,
              background: 'var(--civic-band)',
              borderRadius: 'var(--r-pill)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: `${pct}%`,
              top: -2,
              bottom: -2,
              width: 3,
              marginLeft: -1.5,
              borderRadius: 'var(--r-pill)',
              background: 'var(--civic)',
            }}
          />
        </span>
        {/* La barra se rotula a sí misma. La frase «sin banda comparable en
            esta fuente» se imprimía IGUAL en cinco de las siete filas: medido,
            el 64 % de los caracteres de esta tabla eran cadenas repetidas tres
            veces o más, y ésta era la más larga. Sube a una nota bajo la tabla,
            visible y contada. Lo que queda aquí son los extremos del eje, que
            no se repiten: dicen qué escala es. */}
        <span className="cp-fila-meta mono cp-eje-extremos" aria-hidden="true">
          <span>0</span>
          <span>100 %</span>
        </span>
      </>
    )
  }

  return <span className="cp-fila-meta mono">sin escala publicada</span>
}

/**
 * El libro de /gestion — el mismo patrón, otra fuente.
 *
 * Comparte hoja de estilos con el libro de servicios a propósito: son la misma
 * página partida por FUENTE, y dos tablas que se parecen pero no se comportan
 * igual serían peor que una sola.
 *
 * Ninguna fila lleva punto hueco, y no es un olvido: estos indicadores no traen
 * banda plausible del percentil, así que aquí no hay ninguna posición de la que
 * se pueda decir que no se distingue. Decirlo sin banda sería afirmarlo a ojo.
 */
export function LibroGestion({ municipales = [], competencias, conNombres }) {
  if (municipales.length === 0) return null

  // Los tres hechos que se repetían fila a fila, contados una vez. Salen de
  // las propias filas: si una entrega trae serie para todas, la nota
  // desaparece sola en vez de mentir con un número escrito a mano.
  const sinBanda = municipales.filter((m) => m.pares?.percentil === undefined).length
  const sinSerie = municipales.filter((m) => !(m.serie?.length >= 2)).length
  const editoriales = conNombres
    ? municipales.filter((m) => competencias?.get(m.id)?.confianza === 'editorial').length
    : 0

  return (
    <div className="cp-libro-wrap">
      <style>{estiloLibro}</style>
      <div className="cp-libro-scroll">
        <table className="cp-libro cp-libro-gestion">
          <caption className="cp-libro-caption">
            Los {municipales.length} indicadores de gestión, cada uno con el periodo que le
            corresponde y frente a la referencia que su fuente permite: unos contra municipios
            comparables, otros contra la escala del propio indicador, y el plazo de pago contra la
            norma.
          </caption>
          <thead>
            <tr>
              <th className="cp-c-servicio" scope="col">
                Indicador
              </th>
              <th className="cp-c-unidad" scope="col">
                Valor
              </th>
              <th className="cp-c-posicion" scope="col">
                Frente a la referencia
              </th>
              <th className="cp-c-decada" scope="col">
                Serie
              </th>
              <th className="cp-c-decir" scope="col">
                Qué se puede decir
              </th>
              {conNombres && (
                <th className="cp-c-responde" scope="col">
                  Quién responde
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {municipales.map((m) => {
              const fuera = m.referencia && m.valor > m.referencia.valor
              const competencia = competencias?.get(m.id)
              return (
                <tr key={m.id} className="cp-fila">
                  <td className="cp-c-servicio">
                    <a href={`#m-${m.id}`}>{m.etiqueta}</a>
                    <span className="cp-fila-meta mono">{m.periodo}</span>
                  </td>
                  <td className="cp-c-unidad mono">
                    {fmt(m.valor, m.formato)}{' '}
                    <span style={{ color: 'var(--ink50)' }}>{SUFIJO[m.formato] ?? ''}</span>
                  </td>
                  <td className="cp-c-posicion">
                    <Referencia m={m} />
                  </td>
                  <td className="cp-c-decada">
                    {m.serie?.length >= 2 ? (
                      <>
                        <Sparkline data={m.serie.map((p) => p.valor)} h={24} fill={false} />
                        <span className="cp-fila-meta mono">
                          {m.serie[0].periodo} → {m.serie[m.serie.length - 1].periodo}
                        </span>
                      </>
                    ) : (
                      <span className="cp-fila-meta mono" title="sin serie en el volcado">
                        —
                      </span>
                    )}
                  </td>
                  <td className="cp-c-decir">
                    {fuera ? (
                      <>
                        <span className="cp-veredicto cp-veredicto-fuera">
                          ×{(m.valor / m.referencia.valor).toFixed(1)} el límite legal
                        </span>
                        <span className="cp-fila-meta mono">
                          <a href={m.referencia.fuente} target="_blank" rel="noreferrer noopener">
                            {m.referencia.etiqueta}
                          </a>
                        </span>
                      </>
                    ) : (
                      <span className="cp-veredicto cp-veredicto-discontinuo">
                        {m.dimension === 'friccion' ? 'mide un proceso' : 'mide una entrada'}
                      </span>
                    )}
                  </td>
                  {conNombres && (
                    <td className="cp-c-responde">
                      {competencia ? (
                        <>
                          <a href={`/cargos/${competencia.oficial}`}>{competencia.nombre}</a>
                          {competencia.confianza === 'editorial' && (
                            <a
                              href={`#m-${m.id}`}
                              className="cp-marca-editorial"
                              aria-label={`Atribución nuestra: por qué se asigna ${competencia.nombre} a este indicador`}
                            >
                              *
                            </a>
                          )}
                          <span className="cp-fila-meta mono">{competencia.cargo}</span>
                        </>
                      ) : (
                        <span className="cp-fila-meta mono">sin asignar</span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="cp-libro-leyenda mono">
        {sinBanda > 0 && (
          <>
            {sinBanda} de {municipales.length} indicadores no llevan banda de municipios
            comparables: la fuente no los publica del mismo modo en todas partes, así que su barra
            es la escala del propio indicador y no una posición frente a nadie.{' '}
          </>
        )}
        {sinSerie > 0 && (
          <>En {sinSerie} el volcado no trae serie —la casilla lleva una raya, no un cero—. </>
        )}
        {editoriales > 0 && (
          <>
            <span aria-hidden="true">*</span> atribución nuestra en {editoriales}: el reparto de esa
            competencia lo hicimos nosotros, no el portal de transparencia. El motivo, en la ficha
            del indicador.
          </>
        )}
      </p>
    </div>
  )
}
