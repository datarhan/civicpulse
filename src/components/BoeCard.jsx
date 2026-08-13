import { Card, ExtLink } from './Primitives'
import { useBoe } from '../hooks/useBoe'
import { fmtDateShort } from '../lib/formatters'
import { useT } from '../i18n'

/**
 * State-bulletin acts naming the municipality.
 *
 * Deliberately honest about scope: the scraper walks only the last 30 days of
 * BOE sumarios, so an empty list means "nothing published this month", not
 * "nothing ever". Saying which is the difference between a fact and a silence.
 */
export function BoeCard() {
  const t = useT()
  const { data } = useBoe()
  if (!data) return null
  const items = data.items ?? []
  return (
    <Card style={{ marginTop: 16 }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.07em',
        }}
      >
        {t('datos.boe.eyebrow')}
      </div>
      <div
        style={{
          fontSize: 'var(--fs-meta)',
          color: 'var(--ink50)',
          margin: '6px 0 12px',
          lineHeight: 1.5,
        }}
      >
        {t('datos.boe.intro')}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
          {t('datos.boe.empty')}
        </div>
      ) : (
        items.map((b) => (
          <div
            key={b.id}
            style={{
              padding: '8px 0',
              borderTop: '1px solid var(--border2)',
              fontSize: 'var(--fs-meta)',
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                {fmtDateShort(b.publicacionDate)}
              </span>
              <ExtLink href={b.urlHtml} style={{ color: 'var(--civic)', textDecoration: 'none' }}>
                {b.identificador} ↗
              </ExtLink>
            </div>
            <div style={{ color: 'var(--ink70)', marginTop: 3, lineHeight: 1.45 }}>
              {String(b.titulo || '').slice(0, 190)}
            </div>
            {b.departamento && (
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 3 }}
              >
                {b.departamento}
              </div>
            )}
          </div>
        ))
      )}
    </Card>
  )
}
