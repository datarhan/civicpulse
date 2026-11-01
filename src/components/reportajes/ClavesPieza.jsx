// @ts-check
import { useT } from '../../i18n'
import { rellena } from '../../lib/formatters'
import { anclaSeccion } from './Pieza'

/**
 * «Lo que hemos encontrado» (auditoría de las dos lecturas, §16): entre tres y
 * cinco hallazgos de la pieza, numerados, cada uno con el enlace a la sección
 * que lo prueba. Va tras la entradilla y antes del cuerpo: quien sólo lee esto
 * se lleva lo que la pieza encontró, y quien quiere comprobarlo salta a su
 * apartado.
 *
 * El texto es de la instantánea (`claves`), escrito por la redacción; la forma
 * la vigila `problemasDeClaves` y que cada sección exista, reportajes.spec.ts.
 * Una pieza sin claves no pinta nada.
 *
 * Es una caja, así que va a todo el ancho de la columna (la medida de lectura
 * es para el texto sin caja, `.cp-pieza` en index.css).
 *
 * @param {{ claves?: Array<{ texto: string, seccion: string }> }} props
 */
export default function ClavesPieza({ claves }) {
  const t = useT()
  if (!claves?.length) return null
  return (
    <section
      aria-labelledby="claves-titulo"
      data-claves=""
      style={{
        background: 'var(--civic-soft)',
        border: '1px solid var(--civic)',
        borderRadius: 'var(--r-card)',
        padding: '16px 20px',
        margin: '26px 0 0',
      }}
    >
      <h2
        id="claves-titulo"
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--civic-ink)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          fontWeight: 700,
          margin: 0,
        }}
      >
        {t('reportajes.claves.titulo')}
      </h2>
      <ol style={{ margin: '10px 0 0', paddingLeft: '1.4em' }}>
        {claves.map((c) => (
          <li
            key={`${c.seccion}-${c.texto}`}
            data-clave={c.seccion}
            style={{ margin: '6px 0 0', lineHeight: 1.55, color: 'var(--ink)' }}
          >
            {c.texto}{' '}
            <a
              href={`#${anclaSeccion(c.seccion)}`}
              className="mono"
              aria-label={rellena(t('reportajes.claves.irA'), { num: c.seccion })}
              style={{
                fontSize: 'var(--fs-meta)',
                color: 'var(--civic-ink)',
                whiteSpace: 'nowrap',
              }}
            >
              §{c.seccion}&nbsp;↓
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}
