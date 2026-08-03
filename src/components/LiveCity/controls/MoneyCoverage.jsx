// @ts-check
import { useT } from '../../../i18n'

/**
 * What share of municipal contracting this map can actually show.
 *
 * The layer was labelled "Gasto municipal" and painted €2,2M of €68,0M — 3,3%,
 * 47 of 693 awarded contracts — with no statement of that anywhere. Every
 * individual pin was scrupulous (the place-resolver's gates deliberately
 * under-match, an honest miss beating a wrong pin) but the AGGREGATE read as
 * completeness. In a project whose credibility rests on honesty gates, that was
 * the one surface where the discipline stopped at the pin.
 *
 * And the gap is not a backlog. Most municipal money is town-wide service
 * contracts — waste collection €16,6M, parks €4,8M, street cleaning €3,9M, home
 * help, catering — that have no point. Pinning them would be FALSE, so the
 * honest ceiling for a point map is a fraction, not 100%. Saying so turns the
 * limit into the finding it actually is: most of what the town spends has no
 * address.
 *
 * Figures come from `tender-geo.json`'s own `universe` block, never hard-coded,
 * so they can't drift from the pins beside them.
 */

const fmtM = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: n >= 1e6 ? 1 : 0,
    notation: 'compact',
  }).format(n)

// toFixed() would print "3.3%" — an English decimal point in a Spanish UI,
// sitting directly beside euro figures that Intl correctly renders as "2,2 M€".
const fmtPct = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n)

/**
 * @param {{ snapshot?: { universe?: { locatedAmount?: number, totalAmount?: number,
 *   locatedContracts?: number, totalContracts?: number } } }} props
 */
export function MoneyCoverage({ snapshot }) {
  const t = useT()
  const u = snapshot?.universe
  // No universe block ⇒ say nothing rather than imply a coverage we can't back.
  if (!u || !u.totalAmount || !u.locatedAmount) return null
  const pct = (100 * u.locatedAmount) / u.totalAmount

  return (
    <div
      style={{
        marginTop: 6,
        paddingTop: 6,
        borderTop: '1px solid #E6E1D4',
        fontFamily: "'Outfit', system-ui, sans-serif",
        fontSize: 10.5,
        lineHeight: 1.4,
        color: 'rgba(11,15,25,.72)',
      }}
    >
      <div
        className="mono"
        style={{ fontSize: 10.5, color: 'rgba(11,15,25,.86)', fontWeight: 700 }}
      >
        {fmtM(u.locatedAmount)} {t('map.money.of')} {fmtM(u.totalAmount)} ·{' '}
        {pct < 1 ? '<1' : fmtPct(pct)}%
      </div>
      <div style={{ marginTop: 3 }}>{t('map.money.coverage')}</div>
    </div>
  )
}
