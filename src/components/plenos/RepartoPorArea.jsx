import { Link } from 'react-router-dom'
import { rellena } from '../../lib/formatters'
import { conHuecos } from '../../lib/huecos'
import { useLocale } from '../../i18n'
import { DEPARTMENT_LABEL } from '../../scraper/departments'

/**
 * Qué áreas llevan el orden del día — y sobre cuántas sesiones se dice.
 *
 * La tarjeta anterior era lo PRIMERO de la página: un agregado derivado por
 * delante del objeto que el lector vino a ver. Baja aquí, detrás de las
 * sesiones, y conserva lo único que la hacía imprescindible — era el único
 * sitio donde se decía que el orden del día sólo se extrajo de 39 de 61
 * sesiones. Ese denominador ya no depende de esta tarjeta: la escalera de
 * cobertura lo publica arriba del todo.
 *
 * Las barras van a escala del máximo, no del total: son un reparto entre
 * áreas, no una cobertura.
 */
export function RepartoPorArea({ departamentos, agenda, sesiones }) {
  const { locale, t } = useLocale()
  if (!departamentos?.length) return null
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 'var(--fs-meta)',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '.05em',
              color: 'var(--ink50)',
            }}
          >
            {rellena(t('plenos.indice.reparto.eyebrow'), {
              puntos: agenda.puntos,
              sesiones: agenda.sesiones,
            })}
          </div>
          <h2 style={{ fontSize: 'var(--fs-head)', fontWeight: 700, margin: '6px 0 0' }}>
            {t('plenos.indice.reparto.titulo')}
          </h2>
        </div>
        <Link to="/departamentos" style={{ fontSize: 'var(--fs-aux)', color: 'var(--civic)' }}>
          {t('plenos.indice.reparto.enlace')}
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 14 }}>
        {departamentos.map((d) => (
          <Link
            key={d.slug || d.nombre}
            to={d.slug ? `/departamentos/${d.slug}` : '/departamentos'}
            className="cp-plenos-area"
          >
            <span style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
              {(d.slug && DEPARTMENT_LABEL[d.slug]?.[locale]) || d.nombre}
            </span>
            <span
              className="cp-plenos-area-barra"
              aria-hidden="true"
              style={{
                height: 14,
                background: 'var(--soft)',
                borderRadius: 'var(--r-input)',
                overflow: 'hidden',
                display: 'block',
              }}
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${(d.cuota * 100).toFixed(1)}%`,
                  background: 'var(--civic)',
                  borderRadius: 'var(--r-input)',
                }}
              />
            </span>
            <span
              className="mono"
              style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)', textAlign: 'right' }}
            >
              {d.n}
            </span>
          </Link>
        ))}
      </div>

      {/* La misma regla que MoneyCoverage: una capa que enseña una fracción de
          su dominio tiene que decirlo, y con el denominador delante. */}
      <p
        style={{
          margin: '13px 0 0',
          fontSize: 'var(--fs-aux)',
          lineHeight: 1.55,
          color: 'var(--ink70)',
          maxWidth: '96ch',
        }}
      >
        {conHuecos(t('plenos.indice.reparto.nota'), {
          '{sesionesConOrden}': (
            <strong>
              {rellena(t('plenos.indice.reparto.sesionesConOrden'), { n: agenda.sesiones })}
            </strong>
          ),
          '{total}': sesiones,
          '{con}': agenda.conDepartamento,
          '{puntos}': agenda.puntos,
        })}
      </p>
    </div>
  )
}
