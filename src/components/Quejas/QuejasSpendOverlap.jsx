// @ts-check
import { Fragment } from 'react'
import { Card, SectionHead, Marcado } from '../Primitives'
import { useGeo } from '../../hooks/useGeo'
import { useTenderGeo } from '../../hooks/useTenderGeo'
import { useQuejas } from '../../hooks/useQuejas'
import { computeOverlapRows } from '../../lib/neighborhood-aggregate'
import { yearSpan } from '../../lib/year-span'
import { rellena } from '../../lib/formatters'
import { useT } from '../../i18n'

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
 * Town-wide overlap: per barrio, citizen quejas vs. the municipal contracts
 * already situated there. Strictly neutral — a barrio with quejas and nothing
 * situated shows a plain "sin contratos situados" tag, never a claim of
 * neglect (most municipal money simply isn't geolocatable from the contract
 * title). Reuses computeOverlapRows so the figures match the map + heatmap.
 * Renders nothing when there's no data.
 *
 * La columna de euros es ADJUDICADO, no gasto. Son las zonas de
 * `tender-geo.json`, o sea importe de adjudicación sin IVA: los mismos euros
 * que la portada rotula «adjudicado acumulado» y /presupuesto «adjudicado sin
 * IVA». Esta tarjeta los llamó «gasto situado» durante meses porque su prosa
 * estaba escrita aquí dentro, fuera del catálogo y por tanto fuera de la
 * guarda que vigila esa palabra (`tests/i18n-dinero-adjudicado.test.ts`).
 * Ahora vive en `quejas.cruce.*`, que además es lo que hacía falta para que la
 * tarjeta hable valencià.
 */
export default function QuejasSpendOverlap() {
  const t = useT()
  const { data: geo } = useGeo()
  const { data: tenderGeo } = useTenderGeo()
  const { data: quejas } = useQuejas()
  // Estas dos cifras NO se gatean por el registro: `quejas` es cuántas pusieron
  // los vecinos y lo adjudicado es del mapa. Ninguna afirma que el ayuntamiento
  // deba una respuesta, al contrario que ✓ ⏳ ⚠.
  const rows = computeOverlapRows({
    neighborhoods: geo?.neighborhoods,
    zones: tenderGeo?.zones,
    instantanea: quejas,
  })
  if (rows.length === 0) return null

  // The two columns do NOT cover the same window, and side by side they invite
  // exactly the reading they cannot support: that a barrio with one queja and
  // €344k, or none and €652k, says something about how the town responds.
  // The complaints channel is months old; the money is years of accumulated
  // awards.
  //
  // Both spans are measured over the rows actually shown. The awarded span comes
  // from the assignments that landed in a ZONE — the same subset the zone
  // amounts are summed from — and deliberately not from `universe.dateMin`,
  // which spans all 693 contracts including the ones no barrio ever gets
  // credited with. A period wider than the money it labels is the same defect
  // one level down.
  const spanContratos = yearSpan(
    (tenderGeo?.assignments ?? []).filter((a) => (a.zones?.length ?? 0) > 0).map((a) => a.date),
  )
  const spanQuejas = yearSpan((quejas?.items ?? []).map((q) => q.requested_datetime))

  return (
    <Card style={{ marginTop: 14 }}>
      <SectionHead
        eyebrow={t('quejas.cruce.eyebrow')}
        title={t('quejas.cruce.titulo')}
        right={null}
      />
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          marginTop: 6,
          marginBottom: 10,
          lineHeight: 1.5,
        }}
      >
        <Marcado texto={t('quejas.cruce.intro')} />
        {spanQuejas && spanContratos
          ? rellena(t('quejas.cruce.periodos'), {
              periodoQuejas: spanQuejas,
              periodoContratos: spanContratos,
            })
          : t('quejas.cruce.periodos.sinFechas')}
        <Marcado texto={t('quejas.cruce.cierre')} />{' '}
        <a
          href="/metodologia#relacion-quejas-contratos"
          style={{ color: 'var(--civic)', textDecoration: 'underline' }}
        >
          {t('quejas.cruce.metodologia')}
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
        <div style={HEAD}>{t('quejas.cruce.col.barrio')}</div>
        <div style={{ ...HEAD, textAlign: 'right' }}>
          {t('quejas.cruce.col.quejas')}
          {spanQuejas ? ` ${spanQuejas}` : ''}
        </div>
        <div style={{ ...HEAD, textAlign: 'right' }}>
          {t('quejas.cruce.col.adjudicado')}
          {spanContratos ? ` ${spanContratos}` : ''}
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
                  {t('quejas.cruce.sinSituado')}
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
