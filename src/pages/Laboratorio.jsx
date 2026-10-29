import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { entradasDeGrupo } from '../nav'
import { glyphFor } from '../components/SectionGlyph'

/**
 * /laboratorio — el índice de los experimentos (auditoría de las dos lecturas,
 * §23). Hasta el 29-10-2026 esta ruta era el laboratorio de prensa entero, y
 * quien entraba en «Laboratorio» no veía qué más había dentro; la frontera y el
 * coste esperado se alcanzaban por un párrafo al pie de la cabecera.
 *
 * Las tarjetas salen de la navegación (el grupo `laboratorio` de src/nav.js):
 * un experimento nuevo con su entrada de menú aparece aquí sin tocar esta
 * página, con la misma frase que ya lleva en la barra lateral. Lo único propio
 * de esta página es la PREGUNTA de cada uno, y una entrada del grupo sin
 * pregunta la detecta tests/laboratorio-indice.test.js. La bandera de los
 * periodistas manda igual que en el menú: sin ella, su tarjeta no existe.
 */

/** La pregunta que trae a un vecino a cada experimento. */
export const PREGUNTA_DE = {
  '/laboratorio/prensa': 'laboratorio.pregunta.prensa',
  '/laboratorio/frontera': 'laboratorio.pregunta.frontera',
  '/laboratorio/coste-esperado': 'laboratorio.pregunta.costeEsperado',
  '/laboratorio/cobertura': 'laboratorio.pregunta.cobertura',
  '/laboratorio/agentes': 'laboratorio.pregunta.agentes',
  '/datos': 'laboratorio.pregunta.datos',
  '/lab-health': 'laboratorio.pregunta.salud',
}

/** /lab-health no está en el menú: se enlaza desde /datos y desde aquí. */
const SALUD = {
  to: '/lab-health',
  labelKey: 'laboratorio.salud.nombre',
  descKey: 'laboratorio.salud.desc',
}

/**
 * Las tarjetas, en orden: primero los experimentos (las rutas bajo
 * /laboratorio/), luego los datos y su salud, que son la materia prima.
 */
export function tarjetasDelLaboratorio(entradas = entradasDeGrupo('laboratorio')) {
  // Sin el propio índice ni las herramientas del curador, que sólo existen en
  // `npm run dev` y no son experimentos.
  const otras = entradas.filter((n) => n.to !== '/laboratorio' && !n.soloDesarrollo)
  return [
    ...otras.filter((n) => n.to.startsWith('/laboratorio/')),
    ...otras.filter((n) => !n.to.startsWith('/laboratorio/')),
    SALUD,
  ]
}

export default function Laboratorio() {
  const t = useT()
  const tarjetas = tarjetasDelLaboratorio()
  return (
    <div className="cp-page" style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {t('nav.grupo.laboratorio.lede')}
      </div>
      <h1
        style={{
          fontSize: 'var(--fs-page)',
          fontWeight: 700,
          letterSpacing: '-.015em',
          margin: '2px 0 0',
        }}
      >
        {t('nav.laboratorio')}
      </h1>
      <p
        data-laboratorio-lede=""
        style={{
          fontSize: 'var(--fs-body)',
          color: 'var(--ink)',
          lineHeight: 1.6,
          margin: '8px 0 0',
          maxWidth: '66ch',
        }}
      >
        {t('laboratorio.indice.lede')}
      </p>

      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '20px 0 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: 12,
        }}
      >
        {tarjetas.map((n) => {
          const g = glyphFor(n.to)
          return (
            <li
              key={n.to}
              data-experimento={n.to}
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-card)',
                padding: '14px 16px',
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                }}
              >
                <span aria-hidden="true" style={{ color: `var(--${g.tone})` }}>
                  {g.glyph}
                </span>{' '}
                {t(n.labelKey)}
              </div>
              <h2
                style={{
                  fontSize: 'var(--fs-card)',
                  fontWeight: 650,
                  lineHeight: 1.3,
                  margin: '6px 0 0',
                }}
              >
                <Link to={n.to} style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                  {t(PREGUNTA_DE[n.to])} <span style={{ color: 'var(--civic)' }}>→</span>
                </Link>
              </h2>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 'var(--fs-aux)',
                  color: 'var(--ink70)',
                  lineHeight: 1.5,
                }}
              >
                {t(n.descKey)}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
