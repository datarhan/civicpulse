import { useT } from '../../i18n'
import { SectionHead } from '../Primitives'
import { MARGEN_ANCLA } from './anclas'

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
 * Los bloques van en COLUMNAS y la base de cada pregunta va PLEGADA. En una
 * sola columna, siete preguntas con su párrafo de base debajo eran unas
 * setecientas palabras al pie de la página: quien llegaba hasta aquí ya no
 * leía ninguna. Plegada, la pregunta —que es lo que se registra— se lee
 * entera, y su base está a un clic.
 *
 * `<details>` nativo, no un botón con estado: lo abre el teclado sin que
 * escribamos nada, lo anuncia un lector de pantalla sin `aria-expanded`, y el
 * bloque `@media print` de index.css fuerza todos los `<details>` abiertos, así
 * que en papel las siete preguntas salen con su base — §17, en papel no hay
 * acordeón que abrir.
 *
 * Destinatarios institucionales siempre — el esquema rechaza los campos que
 * podrían nombrar a una persona — y la sección cierra con la vía de réplica,
 * que aquí es parte del contenido y no letra pequeña.
 */
export function PreguntasRegistradas({ data, panel, sinAncla = false }) {
  const t = useT()
  const bloque = data?.panels?.[panel]
  if (!bloque || (bloque.bloques ?? []).length === 0) return null

  // Derivado, nunca escrito: el rótulo dice cuántas hay porque las cuenta.
  const total = bloque.bloques.reduce((n, b) => n + (b.items ?? []).length, 0)
  let numero = 0

  return (
    <section
      id={sinAncla ? undefined : 'sec-preguntas'}
      style={{ marginTop: sinAncla ? 0 : 32, scrollMarginTop: MARGEN_ANCLA }}
    >
      <SectionHead
        eyebrow={`${t('eficiencia.preguntas.titulo')} · ${total}`}
        title="Lo que este panel deja preguntado, con destinatario"
      />
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          margin: '0 0 16px',
          lineHeight: 1.55,
        }}
      >
        {bloque.intro}
      </p>

      {/* auto-fit y no tres columnas fijas: la rejilla colapsa sola cuando no
          caben 280px por bloque, sin necesitar una media query que un estilo
          inline no puede llevar. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
          alignItems: 'start',
        }}
      >
        {bloque.bloques.map((b) => (
          <div
            key={b.titulo}
            className="cp-card"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div>
              <div
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.07em',
                  color: 'var(--civic-ink)',
                  lineHeight: 1.4,
                }}
              >
                {b.destinatario} · {(b.items ?? []).length}
              </div>
              <div
                style={{
                  fontSize: 'var(--fs-body)',
                  fontWeight: 600,
                  lineHeight: 1.35,
                  marginTop: 5,
                }}
              >
                {b.titulo}
              </div>
            </div>

            {b.items.map((it) => {
              numero += 1
              return (
                <div
                  key={it.q}
                  data-pregunta
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 7,
                    paddingTop: 12,
                    borderTop: '1px solid var(--border2)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <span
                      className="mono"
                      style={{
                        fontSize: 'var(--fs-micro)',
                        color: 'var(--ink50)',
                        flex: 'none',
                        paddingTop: 2,
                      }}
                    >
                      {String(numero).padStart(2, '0')}
                    </span>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 'var(--fs-aux)',
                        lineHeight: 1.5,
                        color: 'var(--ink70)',
                        textWrap: 'pretty',
                      }}
                    >
                      {it.q}
                    </p>
                  </div>
                  <details style={{ marginLeft: 20 }}>
                    <summary
                      className="mono"
                      style={{
                        fontSize: 'var(--fs-micro)',
                        letterSpacing: '.04em',
                        color: 'var(--civic)',
                        cursor: 'pointer',
                      }}
                    >
                      {t('eficiencia.preguntas.porque')}
                    </summary>
                    <p
                      style={{
                        margin: '7px 0 0',
                        fontSize: 'var(--fs-micro)',
                        lineHeight: 1.55,
                        color: 'var(--ink50)',
                        borderLeft: '2px solid var(--border)',
                        paddingLeft: 10,
                        textWrap: 'pretty',
                      }}
                    >
                      {it.base}
                      {it.href && (
                        <>
                          {' '}
                          <a href={it.href} style={{ color: 'var(--civic)' }}>
                            {t('eficiencia.preguntas.verBase')}
                          </a>
                        </>
                      )}
                    </p>
                  </details>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {bloque.cierre && (
        <p
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            margin: '14px 0 0',
            lineHeight: 1.55,
          }}
        >
          {bloque.cierre}
        </p>
      )}

      <p style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', margin: '8px 0 0' }}>
        {t('eficiencia.preguntas.replica')}{' '}
        <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
          {t('eficiencia.preguntas.replicaLink')}
        </a>
        .
      </p>
    </section>
  )
}
