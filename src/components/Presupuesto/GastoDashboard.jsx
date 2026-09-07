import { useEffect, useMemo, useState } from 'react'
import { Card, SectionHead, Pill } from '../Primitives'
import { contractTypeTotals, obrasSharePct, contractAmount } from '../../lib/tender-geo'
import { isCommittedContract, isConcession } from '../../lib/contract-status'
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

  // «El resto son servicios, suministros y otros» invitaba a leer un remanente
  // repartido entre setecientos contratos, y UNO SOLO —la concesión del agua—
  // se lleva cerca de la mitad de todo lo adjudicado. La misma salvedad que
  // /gestion y el bloque TED ya publican, aquí también: una concesión se
  // adjudica por todo su plazo de una vez, así que el total no es un volumen
  // repartido. DERIVADA y condicional: si entra otro contrato grande y el
  // mayor deja de dominar, la frase desaparece sola. Escrita a mano seguiría
  // describiendo un reparto que ya no existe.
  const mayor = useMemo(() => {
    const comprometidos = contracts.filter(isCommittedContract)
    if (comprometidos.length === 0) return null
    const total = comprometidos.reduce((s2, c) => s2 + contractAmount(c), 0)
    if (!(total > 0)) return null
    const top = comprometidos.reduce((a2, b2) =>
      contractAmount(b2) > contractAmount(a2) ? b2 : a2,
    )
    const importe = contractAmount(top)
    // Se comprueba que el mayor SEA una concesión antes de llamarlo así. El
    // motivo de la salvedad —se adjudica por todo su plazo de una vez— sólo
    // vale para una concesión, y afirmar la categoría sin mirarla es el
    // centinela `Otro` otra vez: nombrar por eliminación.
    return { cuota: (importe / total) * 100, importe, esConcesion: isConcession(top) }
  }, [contracts])

  const [selectedZone, setSelectedZone] = useState(null)
  const [sliderTime, setSliderTime] = useState(0)
  const [danaOnly, setDanaOnly] = useState(false)
  const [tab, setTab] = useState('explorar')

  // Pin the slider to the latest date once the snapshot loads.
  useEffect(() => {
    if (dateMax) setSliderTime(dateMax)
  }, [dateMax])

  if (!tg || (tg.zones || []).length === 0) return null

  // El periodo, DERIVADO del universo y nunca escrito: «2017–2026» a mano es
  // verdad hasta la siguiente pasada del raspador. Y el total va rotulado
  // «adjudicado», no «gasto» —es importe de adjudicación sin IVA, no dinero
  // desembolsado—, que es la lección de la portada (`i18n-dinero-adjudicado`).
  const yearMin = (tg.universe?.dateMin || '').slice(0, 4)
  const yearMax = (tg.universe?.dateMax || '').slice(0, 4)
  const span = yearMin && yearMax ? `${yearMin}–${yearMax}` : null
  const nEjercicios = span ? Number(yearMax) - Number(yearMin) + 1 : null
  const totalUniverso = tg.universe?.totalAmount || 0
  const eurM = (n) =>
    `${(n / 1e6).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M€`

  return (
    <Card>
      {/* El rótulo dice de QUÉ habla la sección, de cuándo y de dónde sale; no
          que hay un mapa, que eso ya se ve. «Mapa de lo adjudicado» repetía el
          «adjudicado sin IVA» de la cifra de al lado y no añadía un solo dato.

          SIN recuento de contratos, y a propósito. Llevó uno —los 696 del
          universo del mapa— y la revisión lectora lo cazó: esta página ya dice
          «de 701 adjudicados» en la tarjeta de menores y «809 resultados» en el
          listado de aquí abajo, tres cifras de tres conjuntos distintos que un
          lector lee como tres versiones de lo mismo. Los 696 son los que el
          mapa puede sumar; los 701, los comprometidos. La diferencia no cabe
          en un rótulo, y un rótulo que la insinúa sin explicarla estorba más de
          lo que informa. */}
      <SectionHead
        eyebrow={`Contratación municipal · ${span ? `${span} · ` : ''}Gobierto/PLACSP`}
        title="¿A dónde va el dinero en contratos?"
        right={
          totalUniverso > 0 ? (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-card)', fontWeight: 500, letterSpacing: '-.02em' }}
              >
                {eurM(totalUniverso)}
              </div>
              <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
                adjudicado sin IVA
                {nEjercicios ? ` · ${nEjercicios} ejercicios, no un año` : ''}
              </div>
            </div>
          ) : null
        }
      />
      <div
        style={{
          fontSize: 'var(--fs-meta)',
          color: 'var(--ink70)',
          lineHeight: 1.55,
          margin: '4px 0 12px',
          padding: '11px 13px',
          background: 'var(--soft)',
          border: '1px solid var(--border2)',
          borderRadius: 'var(--r-input)',
        }}
      >
        {/* «lo adjudicado», no «el gasto». La cifra de arriba se rotula
            «adjudicado sin IVA» y el eyebrow dice «contratos comprometidos»,
            así que llamarla gasto contradecía a la tarjeta dentro de la misma
            tarjeta: un contrato adjudicado no es dinero desembolsado, y el
            mayor de todos —una concesión de 55,69 M€— se adjudica de una vez
            por todo su plazo. Es la misma corrección que ya se hizo en la
            portada (`tests/i18n-dinero-adjudicado.test.ts`), y la señaló la
            revisión lectora del push que renombró el rótulo. */}
        El total de arriba es <strong>todo lo adjudicado en contratos, no solo obras</strong>:
        {obrasPct != null ? ` las obras son el ${pct0(obrasPct)} %` : ' el grueso'} y el resto son
        servicios de ámbito municipal, suministros y otros —el desglose completo está en «Tipos de
        gasto».
        {span
          ? ` Y es de ${span}, no de un solo ejercicio: puesto sin periodo al lado de un presupuesto anual se lee mucho mayor de lo que es.`
          : ''}{' '}
        {mayor && mayor.cuota >= 25 ? (
          <>
            {' '}
            <strong>No es un volumen repartido:</strong> el mayor contrato{' '}
            {mayor.esConcesion ? '—una concesión de ' : '—'}
            {(mayor.importe / 1e6).toLocaleString('es-ES', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            M€— se lleva él solo el {pct0(mayor.cuota)} % del total
            {mayor.esConcesion
              ? ', porque una concesión se adjudica por todo su plazo de una vez'
              : ''}
            .
          </>
        ) : null}{' '}
        Solo se sitúan los contratos cuyo título nombra una zona
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
