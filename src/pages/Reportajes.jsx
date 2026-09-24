import { Link } from 'react-router-dom'
import { useReportaje } from '../hooks/useReportaje'
import { REPORTAJE_SLUGS } from '../reportajes'
import Emblema from '../components/reportajes/Emblema'
import { Pill } from '../components/Primitives'
import { fmtDateHuman } from '../lib/formatters'
import { useT, useLocale } from '../i18n'

const SERIF = "'Fraunces', Georgia, serif"

/* Card for one pieza. Fetches its own frozen snapshot and renders ONLY when
 * meta.estado === 'publicado' (borradores pending right-of-reply never list).
 *
 * La ficha entera es el enlace: el titular lleva un `::after` que la cubre
 * (hoja `.cp-rj-*` en index.css), así que la figura —lo más grande de la ficha—
 * también lleva a la pieza, con un solo enlace para el lector de pantalla. El
 * «Leer el reportaje →» se queda como señal visual y no como segundo enlace. */
function ReportajeCard({ slug, readLabel }) {
  const { loading, error, data } = useReportaje(slug)
  // Antes de cualquier return: los hooks no se saltan.
  const { t, locale } = useLocale()
  if (loading || error || !data) return null
  const m = data.meta || {}
  if (m.estado !== 'publicado') return null
  const href = `/reportajes/${m.slug || slug}`
  // Las correcciones se dicen también aquí, no sólo dentro de la pieza: quien
  // no la abre tiene que saber que el registro se enmendó. La portada ya lo
  // hacía (ReportajeBlockD) con las mismas cadenas; el índice no.
  const correcciones = m.correcciones?.length ?? 0
  return (
    <article className="cp-rj-card">
      <div className="cp-rj-fig">
        <Emblema slug={slug} data={data} />
      </div>
      <div className="cp-rj-txt">
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {m.seccion}
          {/* Las dos son ISO desde el 16-09-2026: `publicadoEl` se guardaba
              escrito a mano en castellano —«15 de julio de 2026»— y
              `fmtDateHuman` pasa verbatim lo que no es ISO, así que la fecha se
              quedaba en castellano aunque la página estuviera en valencià. Con
              la fecha en ISO, el mismo formateador la escribe en su idioma. */}
          {(m.publicadoEl || m.fechaDatos) && (
            <span> · {fmtDateHuman(m.publicadoEl || m.fechaDatos, locale)}</span>
          )}
        </div>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: 'var(--fs-page)',
            fontWeight: 600,
            letterSpacing: '-.015em',
            lineHeight: 1.15,
            margin: '8px 0 10px',
          }}
        >
          <Link to={href} className="cp-rj-enlace">
            {m.titulo}
          </Link>
        </h2>
        <p
          style={{
            fontSize: 'var(--fs-body)',
            color: 'var(--ink50)',
            lineHeight: 1.5,
            margin: '0 0 14px',
          }}
        >
          {m.subtitulo}
        </p>
        <div className="cp-rj-pie">
          <span className="mono cp-rj-leer" aria-hidden="true">
            {readLabel}
          </span>
          {correcciones > 0 && (
            <Pill tone="crit" size="xs" style={{ fontSize: 'var(--fs-micro)' }}>
              {correcciones}{' '}
              {t(
                correcciones === 1
                  ? 'landing.reportajes.correction'
                  : 'landing.reportajes.corrections',
              )}
            </Pill>
          )}
        </div>
      </div>
    </article>
  )
}

export default function Reportajes() {
  const t = useT()
  return (
    // Más ancho que una pieza (760): cada ficha pone el texto y la figura lado a
    // lado cuando cabe, y a 760 la figura bajaba a un tamaño en que sus
    // etiquetas no se leen. Por debajo, la ficha se apila como antes.
    <div className="cp-page" style={{ padding: 24, maxWidth: 1040, margin: '0 auto' }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {t('reportajes.eyebrow')}
      </div>
      <h1
        style={{
          fontFamily: SERIF,
          fontSize: 'var(--type-display)',
          fontWeight: 600,
          letterSpacing: '-.015em',
          lineHeight: 1.1,
          margin: '4px 0 12px',
        }}
      >
        {t('reportajes.title')}
      </h1>
      <p
        style={{
          fontSize: 'var(--fs-head)',
          color: 'var(--ink50)',
          lineHeight: 1.55,
          margin: '0 0 24px',
          maxWidth: '62ch',
        }}
      >
        {t('reportajes.intro')}
      </p>
      <div className="cp-rj-lista">
        {REPORTAJE_SLUGS.map((s) => (
          <ReportajeCard key={s} slug={s} readLabel={t('reportajes.read')} />
        ))}
      </div>
    </div>
  )
}
