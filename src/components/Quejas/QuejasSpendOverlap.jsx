// @ts-check
import { Fragment } from 'react'
import { Card, SectionHead } from '../Primitives'
import { useGeo } from '../../hooks/useGeo'
import { useTenderGeo } from '../../hooks/useTenderGeo'
import { useQuejas } from '../../hooks/useQuejas'
import { computeOverlapRows } from '../../lib/neighborhood-aggregate'
import { yearSpan } from '../../lib/year-span'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n || 0)

const HEAD = {
  fontWeight: 700,
  fontSize: 'var(--fs-micro)',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  color: 'var(--ink50)',
}

/**
 * Town-wide overlap: per barrio, citizen quejas vs. already-situated municipal
 * spend. Strictly neutral — a barrio with quejas but €0 situated shows a plain
 * "sin gasto situado" tag, never a claim of neglect (much spend simply isn't
 * geolocatable from the contract title). Reuses computeOverlapRows so the
 * figures match the map + heatmap. Renders nothing when there's no data.
 */
export default function QuejasSpendOverlap() {
  const { data: geo } = useGeo()
  const { data: tenderGeo } = useTenderGeo()
  const { data: quejas } = useQuejas()
  const rows = computeOverlapRows({
    neighborhoods: geo?.neighborhoods,
    zones: tenderGeo?.zones,
    quejaItems: quejas?.items,
  })
  if (rows.length === 0) return null

  // The two columns do NOT cover the same window, and side by side they invite
  // exactly the reading they cannot support: that a barrio with one queja and
  // €344k, or none and €652k, says something about how the town responds.
  // The complaints channel is months old; the money is years of accumulated
  // awards.
  //
  // Both spans are measured over the rows actually shown. The spend span comes
  // from the assignments that landed in a ZONE — the same subset the zone
  // amounts are summed from — and deliberately not from `universe.dateMin`,
  // which spans all 693 contracts including the ones no barrio ever gets
  // credited with. A period wider than the money it labels is the same defect
  // one level down.
  const spendSpan = yearSpan(
    (tenderGeo?.assignments ?? []).filter((a) => (a.zones?.length ?? 0) > 0).map((a) => a.date),
  )
  const quejaSpan = yearSpan((quejas?.items ?? []).map((q) => q.requested_datetime))

  return (
    <Card style={{ marginTop: 14 }}>
      <SectionHead
        eyebrow="Cruce de datos · sin causalidad"
        title="Quejas y gasto situado por barrio"
        right={null}
      />
      <div
        style={{
          fontSize: 'var(--fs-meta)',
          color: 'var(--ink50)',
          marginTop: 6,
          marginBottom: 10,
          lineHeight: 1.5,
        }}
      >
        Por barrio: número de quejas ciudadanas frente al gasto municipal ya situado en obras allí.{' '}
        <strong>Las dos columnas no cubren el mismo periodo</strong>
        {quejaSpan && spendSpan ? (
          <>
            : las quejas se recogen desde {quejaSpan} y el gasto situado acumula adjudicaciones de{' '}
            {spendSpan}
          </>
        ) : (
          ' — el canal de quejas es mucho más reciente que el registro de contratación'
        )}
        , así que comparar una columna con la otra no mide la respuesta municipal. Son cifras de
        contexto — la ausencia de gasto situado <strong>no</strong> implica desatención: muchas
        actuaciones no nombran el lugar en el título y por eso no se sitúan (ver{' '}
        <a
          href="/metodologia#relacion-quejas-contratos"
          style={{ color: 'var(--civic)', textDecoration: 'underline' }}
        >
          metodología
        </a>
        ).
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: '7px 16px',
          fontSize: 'var(--fs-aux)',
          alignItems: 'baseline',
        }}
      >
        <div style={HEAD}>Barrio</div>
        <div style={{ ...HEAD, textAlign: 'right' }}>Quejas{quejaSpan ? ` ${quejaSpan}` : ''}</div>
        <div style={{ ...HEAD, textAlign: 'right' }}>
          Gasto situado{spendSpan ? ` ${spendSpan}` : ''}
        </div>
        {rows.map((r) => (
          <Fragment key={r.slug}>
            <div>
              {r.name}
              {r.gap && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 'var(--fs-micro)',
                    fontWeight: 700,
                    color: 'var(--ink50)',
                    background: 'var(--soft)',
                    padding: '1px 5px',
                    borderRadius: 'var(--r-input)',
                  }}
                >
                  sin gasto situado
                </span>
              )}
            </div>
            <div className="mono" style={{ textAlign: 'right', color: 'var(--ink70)' }}>
              {r.quejas || '—'}
            </div>
            <div className="mono" style={{ textAlign: 'right', color: 'var(--ink70)' }}>
              {r.amount ? fmtEur(r.amount) : '—'}
            </div>
          </Fragment>
        ))}
      </div>
    </Card>
  )
}
