import { useT } from '../../i18n'
import { MARGEN_ANCLA } from '../SubnavSecciones'

/**
 * Las preguntas registradas al gobierno municipal, al pie del panel.
 *
 * El patrón es el del cuestionario del reportaje de basuras (Basuras.jsx):
 * numeración corrida entre bloques, cada pregunta con su «se pregunta porque»
 * — aquí además con el enlace a la superficie que publica esa base. El
 * contenido vive en `public/data/eficiencia-preguntas.json` (curado a mano,
 * validado por eficiencia-preguntas.ts, revisado en PR); este componente sólo
 * pinta el panel que le toca a su página.
 *
 * Destinatarios institucionales siempre — el esquema rechaza los campos que
 * podrían nombrar a una persona — y la sección cierra con la vía de réplica,
 * que aquí es parte del contenido y no letra pequeña.
 */
export function PreguntasRegistradas({ data, panel }) {
  const t = useT()
  const bloque = data?.panels?.[panel]
  if (!bloque || (bloque.bloques ?? []).length === 0) return null

  let numero = 0

  return (
    <section id="sec-preguntas" style={{ marginTop: 32, scrollMarginTop: MARGEN_ANCLA }}>
      <h2
        style={{
          fontSize: 'var(--fs-body)',
          fontWeight: 650,
          margin: '0 0 4px',
          letterSpacing: '-.01em',
        }}
      >
        {t('eficiencia.preguntas.titulo')}
      </h2>
      <p
        style={{
          fontSize: 'var(--fs-meta)',
          color: 'var(--ink50)',
          margin: '0 0 14px',
          maxWidth: '68ch',
          lineHeight: 1.5,
        }}
      >
        {bloque.intro}
      </p>

      {bloque.bloques.map((b) => (
        <div key={b.titulo} style={{ marginTop: 18 }}>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--ink50)',
            }}
          >
            {b.titulo} · {b.destinatario}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            {b.items.map((it) => {
              numero += 1
              return (
                <div key={it.q} data-pregunta style={{ display: 'flex', gap: 10 }}>
                  <span
                    className="mono"
                    style={{
                      fontSize: 'var(--fs-meta)',
                      color: 'var(--ink50)',
                      minWidth: 22,
                      textAlign: 'right',
                    }}
                  >
                    {numero}.
                  </span>
                  <div>
                    <p style={{ margin: 0, fontSize: 'var(--fs-aux)', lineHeight: 1.5 }}>{it.q}</p>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: 'var(--fs-meta)',
                        color: 'var(--ink50)',
                        lineHeight: 1.5,
                      }}
                    >
                      {t('eficiencia.preguntas.porque')} {it.base}
                      {it.href && (
                        <>
                          {' '}
                          <a href={it.href} style={{ color: 'var(--civic)' }}>
                            {t('eficiencia.preguntas.verBase')}
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {bloque.cierre && (
        <p
          style={{
            fontSize: 'var(--fs-meta)',
            color: 'var(--ink50)',
            margin: '16px 0 0',
            maxWidth: '68ch',
            lineHeight: 1.5,
          }}
        >
          {bloque.cierre}
        </p>
      )}

      <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', margin: '10px 0 0' }}>
        {t('eficiencia.preguntas.replica')}{' '}
        <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
          {t('eficiencia.preguntas.replicaLink')}
        </a>
        .
      </p>
    </section>
  )
}
