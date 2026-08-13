import { Card, ExtLink } from '../Primitives'
import { useTendersTed } from '../../hooks/useTendersTed'
import { yearSpan } from '../../lib/year-span'
import { useT } from '../../i18n'

const eur = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2).replace('.', ',')} M€` : `${Math.round(n / 1e3)} k€`

/**
 * Contracts published above the EU threshold.
 *
 * Complements the Gobierto/PLACSP feed rather than duplicating it: these are
 * the biggest awards, and some appear here before the national platform
 * publishes them.
 *
 * Two honesty constraints shape the rendering. TED omits `publication-date` on
 * most of this buyer's notices, so the year is recovered from the publication
 * number and shown as a year, never a fabricated day (see resolveTedDate).
 * And TED gives no descriptive title for them either — the notice number IS
 * the identifier — so each row links out rather than pretending to summarise.
 */
export function TedNotices() {
  const t = useT()
  const { data } = useTendersTed()
  const items = data?.items ?? []
  if (items.length === 0) return null
  const valued = items.filter((i) => i.totalValueEur)
  const total = valued.reduce((s, i) => s + i.totalValueEur, 0)
  // This block sits on a page titled «Presupuesto municipal <año>», directly
  // above «Gastos <año> · clasificación económica». Without its own period the
  // euro total reads as one year's worth of EU-threshold contracting against a
  // one-year budget — several times larger. It is not: these notices span
  // nine exercises. Nor does every notice carry a figure, so the count behind
  // the euros is stated rather than left to be assumed as all of them.
  const span = yearSpan(items.map((i) => i.publicationDate))
  const rows = [...items]
    .sort((a, b) => (b.totalValueEur ?? 0) - (a.totalValueEur ?? 0))
    .slice(0, 10)

  return (
    <Card style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.07em',
          }}
        >
          {t('presupuesto.ted.eyebrow')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink70)' }}>
          {items.length} {t('presupuesto.ted.notices')}
          {span ? ` ${span}` : ''} · {valued.length} {t('presupuesto.ted.valued')} · {eur(total)}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink50)', margin: '8px 0 12px', lineHeight: 1.5 }}>
        {t('presupuesto.ted.intro')}
      </div>
      {rows.map((n) => (
        <div
          key={n.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 10,
            padding: '7px 0',
            borderTop: '1px solid var(--border2)',
            fontSize: 12.5,
          }}
        >
          <span style={{ minWidth: 0 }}>
            <ExtLink href={n.htmlUrl} style={{ color: 'var(--civic)', textDecoration: 'none' }}>
              {n.publicationNumber} ↗
            </ExtLink>
            <span style={{ color: 'var(--ink50)', marginLeft: 8 }}>
              {(n.contractNature ?? [])[0] ?? '—'}
            </span>
          </span>
          <span style={{ whiteSpace: 'nowrap' }}>
            <span className="mono" style={{ fontWeight: 600 }}>
              {n.totalValueEur ? eur(n.totalValueEur) : '—'}
            </span>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', marginLeft: 8 }}>
              {n.dateApproximate ? '≈' : ''}
              {String(n.publicationDate).slice(0, 4)}
            </span>
          </span>
        </div>
      ))}
      <div
        className="mono"
        style={{ fontSize: 10, color: 'var(--ink50)', marginTop: 10, lineHeight: 1.5 }}
      >
        {t('presupuesto.ted.note')}
      </div>
    </Card>
  )
}
