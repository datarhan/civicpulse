import { useT } from '../../i18n'
import { useGlosario } from '../../hooks/useGlosario'
import { TERMINOS_DE_ACCESO } from '../../lib/empleo-publico'

/*
 * «¿Cómo se entra a trabajar en el Ayuntamiento?» (auditoría de las dos
 * lecturas, §21). La lista de abajo titula sus procesos con «oposición»,
 * «concurso», «bolsa» o «estabilización», y la página no explicaba ninguna.
 *
 * Las definiciones son las del glosario (`useGlosario`), no frases de esta
 * página: las mismas que da Cmd+K al buscar la palabra, para que las dos no
 * puedan decir cosas distintas.
 */
export default function ComoSeEntra() {
  const t = useT()
  const glosario = useGlosario()
  const entradas = TERMINOS_DE_ACCESO.map((clave) =>
    glosario.find((g) => g.clave === clave),
  ).filter(Boolean)
  return (
    <section
      id="como-se-entra"
      aria-labelledby="como-se-entra-titulo"
      style={{ marginTop: 28, scrollMarginTop: 16 }}
    >
      <h2
        id="como-se-entra-titulo"
        style={{ fontSize: 'var(--fs-head)', fontWeight: 700, margin: 0, lineHeight: 1.3 }}
      >
        {t('empleoPublico.comoSeEntra.titulo')}
      </h2>
      <p style={{ margin: '8px 0 0', color: 'var(--ink70)', lineHeight: 1.55, maxWidth: '64ch' }}>
        {t('empleoPublico.comoSeEntra.intro')}
      </p>
      <dl
        style={{
          display: 'grid',
          // Dos columnas cuando caben y una en el móvil, sin media query: el
          // `min(100%, …)` impide que la mínima desborde a 375 px.
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
          gap: 10,
          margin: '14px 0 0',
        }}
      >
        {entradas.map((e) => (
          <div
            key={e.clave}
            data-termino-acceso={e.clave}
            style={{
              background: 'var(--soft)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card)',
              padding: '14px 16px',
            }}
          >
            <dt style={{ fontWeight: 700 }}>{e.termino}</dt>
            <dd
              style={{
                margin: '4px 0 0',
                fontSize: 'var(--fs-aux)',
                color: 'var(--ink70)',
                lineHeight: 1.55,
              }}
            >
              {e.def}
            </dd>
          </div>
        ))}
      </dl>
      <p style={{ margin: '12px 0 0', color: 'var(--ink70)', lineHeight: 1.55, maxWidth: '64ch' }}>
        {t('empleoPublico.comoSeEntra.internos')}
      </p>
    </section>
  )
}
