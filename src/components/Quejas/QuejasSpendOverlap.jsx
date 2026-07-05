// @ts-check
import { Fragment } from 'react'
import { Card, SectionHead } from '../Primitives'
import { useGeo } from '../../hooks/useGeo'
import { useTenderGeo } from '../../hooks/useTenderGeo'
import { useQuejas } from '../../hooks/useQuejas'
import { computeOverlapRows } from '../../lib/neighborhood-aggregate'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n || 0)

const HEAD = {
  fontWeight: 700,
  fontSize: 10.5,
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
  return (
    <Card style={{ marginTop: 14 }}>
      <SectionHead
        eyebrow="Cruce de datos · sin causalidad"
        title="Quejas y gasto situado por barrio"
      />
      <div
        style={{
          fontSize: 12,
          color: 'var(--ink60)',
          marginTop: 6,
          marginBottom: 10,
          lineHeight: 1.5,
        }}
      >
        Por barrio: número de quejas ciudadanas frente al gasto municipal ya situado en obras allí.
        Son cifras de contexto — la ausencia de gasto situado <strong>no</strong> implica
        desatención: muchas actuaciones no nombran el lugar en el título y por eso no se sitúan (ver{' '}
        <a href="/metodologia#relacion-quejas-contratos" style={{ color: 'var(--civic)' }}>
          metodología
        </a>
        ).
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: '7px 16px',
          fontSize: 13,
          alignItems: 'baseline',
        }}
      >
        <div style={HEAD}>Barrio</div>
        <div style={{ ...HEAD, textAlign: 'right' }}>Quejas</div>
        <div style={{ ...HEAD, textAlign: 'right' }}>Gasto situado</div>
        {rows.map((r) => (
          <Fragment key={r.slug}>
            <div>
              {r.name}
              {r.gap && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--ink50)',
                    background: 'var(--soft)',
                    padding: '1px 5px',
                    borderRadius: 3,
                  }}
                >
                  sin gasto situado
                </span>
              )}
            </div>
            <div className="mono" style={{ textAlign: 'right', color: 'var(--ink80)' }}>
              {r.quejas || '—'}
            </div>
            <div className="mono" style={{ textAlign: 'right', color: 'var(--ink80)' }}>
              {r.amount ? fmtEur(r.amount) : '—'}
            </div>
          </Fragment>
        ))}
      </div>
    </Card>
  )
}
