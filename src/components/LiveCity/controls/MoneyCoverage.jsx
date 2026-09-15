// @ts-check
import { useT } from '../../../i18n'
import { yearSpan } from '../../../lib/year-span'

/**
 * What share of municipal contracting this map can actually show.
 *
 * The layer was labelled "Gasto municipal" and painted a low single-digit
 * percentage of municipal contracting — today €2,2M of €123,7M, 1,8%, 47 of
 * 696 contracts — with no statement of that anywhere. Every
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
 *
 * Con la pila plegada (a 375 px, DirectionD.jsx) la línea de las cifras es lo que
 * queda a la vista de toda la tarjeta, así que el botón de detalle va dentro de ella
 * (`accion`). El margen y el borde de arriba viven en la clase `cp-cobertura` y no en
 * el style: plegada, la línea pierde el borde, y un style gana a cualquier clase.
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
 *   locatedContracts?: number, totalContracts?: number, dateMin?: string|null,
 *   dateMax?: string|null } }, accion?: import('react').ReactNode }} props
 */
export function MoneyCoverage({ snapshot, accion = null }) {
  const t = useT()
  const u = snapshot?.universe
  // No universe block ⇒ say nothing rather than imply a coverage we can't back.
  if (!u || !u.totalAmount || !u.locatedAmount) return null
  const pct = (100 * u.locatedAmount) / u.totalAmount
  // `dateMin`/`dateMax` are the span of this exact universe — the same rows the
  // denominator sums — so the period can never describe a wider set than the
  // figure. The landing's KPI strip publishes «Presup. 2025 · €41,6M» a few
  // hundred pixels below, and an undated nine-figure cumulative beside a
  // one-year budget is the comparison this whole line exists to prevent.
  const span = yearSpan([u.dateMin, u.dateMax])

  return (
    <div
      className="cp-cobertura"
      style={{
        fontFamily: "'Outfit', system-ui, sans-serif",
        fontSize: 'var(--fs-aux)',
        lineHeight: 1.4,
        color: 'rgba(11,15,25,.72)',
      }}
    >
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-micro)', color: 'rgba(11,15,25,.86)', fontWeight: 700 }}
      >
        {fmtM(u.locatedAmount)} {t('map.money.of')} {fmtM(u.totalAmount)}
        {span ? ` (${span})` : ''} · {pct < 1 ? '<1' : fmtPct(pct)}%{accion}
      </div>
      <div id="cp-dinero-nota" className="cp-plegable" style={{ marginTop: 3 }}>
        {t('map.money.coverage')}
      </div>
    </div>
  )
}
