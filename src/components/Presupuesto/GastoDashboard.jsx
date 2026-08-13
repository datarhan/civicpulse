import { useEffect, useMemo, useState } from 'react'
import { Card, SectionHead, Pill } from '../Primitives'
import { contractTypeTotals, obrasSharePct } from '../../lib/tender-geo'
import { useTenders } from '../../hooks/useTenders'
import { useTenderGeo } from '../../hooks/useTenderGeo'
import { useCpvLabels } from '../../hooks/useCpvLabels'
import GastoMap from './GastoMap'
import CoverageMeter from './CoverageMeter'
import ZoneDrilldown from './ZoneDrilldown'
import TimeSlider from './TimeSlider'
import ContractsExplorer from './ContractsExplorer'
import ContractorLeaderboard from './ContractorLeaderboard'
import SpendingTypeBreakdown from './SpendingTypeBreakdown'

const TABS = [
  { id: 'explorar', label: '🔎 Explorar contratos' },
  { id: 'contratistas', label: '🏗️ ¿Quién recibe el dinero?' },
  { id: 'tipos', label: '📊 Tipos de gasto' },
]

export default function GastoDashboard() {
  const { data: tg } = useTenderGeo()
  const { data: tenders } = useTenders()
  const { data: cpv } = useCpvLabels()
  const contracts = useMemo(() => tenders?.contracts || [], [tenders])
  const contractsById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts])

  const dateMax = tg?.universe?.dateMax ? new Date(tg.universe.dateMax).getTime() : 0
  const dateMin = tg?.universe?.dateMin ? new Date(tg.universe.dateMin).getTime() : 0

  // What this section's own figure is actually made of.
  //
  // The heading used to read «¿A dónde va el dinero en obras?» directly above
  // «De 68 M€ adjudicados en contratos … 2,2 M€ se pueden situar en el mapa» —
  // so the reader took the whole 68 M€ for public works, when obras are about a
  // quarter of it and town-wide services are the majority. The section's own
  // small print said so ("servicios, suministros y obras sin lugar citado"); the
  // heading contradicted the body four lines above it.
  //
  // Both shares are MEASURED here, never typed: from the contracts for the
  // total, and from the zoned assignments for what the map paints. Computing
  // them also means the sentence can't survive a scraper run that changes the
  // mix — which a literal «26 %» silently would.
  const obrasPct = useMemo(() => obrasSharePct(contractTypeTotals(contracts)), [contracts])
  const obrasPctMapa = useMemo(() => {
    const located = (tg?.assignments ?? []).filter((a) => (a.zones ?? []).length > 0)
    const total = located.reduce((s, a) => s + (a.amount || 0), 0)
    if (!(total > 0)) return null
    const obras = located
      .filter((a) => a.contractType === 'construction')
      .reduce((s, a) => s + (a.amount || 0), 0)
    return (obras / total) * 100
  }, [tg])
  const pct0 = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n)

  const [selectedZone, setSelectedZone] = useState(null)
  const [sliderTime, setSliderTime] = useState(0)
  const [danaOnly, setDanaOnly] = useState(false)
  const [tab, setTab] = useState('explorar')

  // Pin the slider to the latest date once the snapshot loads.
  useEffect(() => {
    if (dateMax) setSliderTime(dateMax)
  }, [dateMax])

  if (!tg || (tg.zones || []).length === 0) return null

  return (
    <Card>
      <SectionHead
        eyebrow="Mapa del gasto · contratos situables"
        title="¿A dónde va el dinero en contratos?"
      />
      <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 10 }}>
        El total de abajo es <strong>todo el gasto en contratos, no solo obras</strong>:
        {obrasPct != null ? ` las obras son el ${pct0(obrasPct)} %` : ' el grueso'} y el resto son
        servicios de ámbito municipal, suministros y otros —el desglose completo está en «Tipos de
        gasto». Solo se sitúan los contratos cuyo título nombra una zona
        {obrasPctMapa != null ? `, y ahí sí predominan las obras (${pct0(obrasPctMapa)} %)` : ''}.
        Tamaño del círculo = € adjudicado en la zona · ámbar cuando la mitad o más es recuperación
        DANA.
      </div>
      <div style={{ marginBottom: 10 }}>
        <button
          onClick={() => setDanaOnly((v) => !v)}
          aria-pressed={danaOnly}
          style={{ all: 'unset', cursor: 'pointer' }}
        >
          <Pill tone={danaOnly ? 'warn' : 'ghost'} size="xs">
            {danaOnly ? '● Solo DANA' : '○ Solo DANA'}
          </Pill>
        </button>
      </div>

      <div
        className="cp-gasto-grid"
        style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14 }}
      >
        <div>
          <GastoMap
            snapshot={tg}
            sliderTime={sliderTime}
            danaOnly={danaOnly}
            selectedZone={selectedZone}
            onSelectZone={setSelectedZone}
          />
          <TimeSlider
            min={dateMin}
            max={dateMax}
            value={sliderTime || dateMax}
            onChange={setSliderTime}
          />
        </div>
        <div>
          {selectedZone ? (
            <ZoneDrilldown
              snapshot={tg}
              zoneSlug={selectedZone}
              contractsById={contractsById}
              danaOnly={danaOnly}
              onClear={() => setSelectedZone(null)}
              cpvDict={cpv?.codes}
            />
          ) : (
            <CoverageMeter universe={tg.universe} zones={tg.zones} onSelectZone={setSelectedZone} />
          )}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div
          role="tablist"
          aria-label="Vistas del gasto"
          style={{
            display: 'flex',
            gap: 6,
            borderBottom: '1px solid var(--border2)',
            flexWrap: 'wrap',
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                fontSize: 'var(--fs-meta)',
                padding: '8px 12px',
                borderBottom: tab === t.id ? '2px solid var(--civic)' : '2px solid transparent',
                color: tab === t.id ? 'var(--civic)' : 'var(--ink50)',
                fontWeight: tab === t.id ? 700 : 500,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" aria-labelledby={`tab-${tab}`} style={{ paddingTop: 12 }}>
          {tab === 'explorar' && <ContractsExplorer contracts={contracts} snapshot={tg} />}
          {tab === 'contratistas' && <ContractorLeaderboard contracts={contracts} />}
          {tab === 'tipos' && <SpendingTypeBreakdown contracts={contracts} snapshot={tg} />}
        </div>
      </div>
    </Card>
  )
}
