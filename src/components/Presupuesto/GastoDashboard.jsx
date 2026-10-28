import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, SectionHead, Pill } from '../Primitives'
import { contractTypeTotals, obrasSharePct } from '../../lib/tender-geo'
import { isCommittedContract, isConcession, importeAdjudicado } from '../../lib/contract-status'
import { useTenders } from '../../hooks/useTenders'
import { agrupaPorExpediente } from '../../lib/tender-lotes'
import { useTenderGeo } from '../../hooks/useTenderGeo'
import { useCpvLabels } from '../../hooks/useCpvLabels'
import GastoMap from './GastoMap'
import CoverageMeter from './CoverageMeter'
import ZoneDrilldown from './ZoneDrilldown'
import TimeSlider from './TimeSlider'
import ContractsExplorer from './ContractsExplorer'
import ContractorLeaderboard from './ContractorLeaderboard'
import SpendingTypeBreakdown from './SpendingTypeBreakdown'
import { eurosBreves, rellena } from '../../lib/formatters'
import { conHuecos } from '../../lib/huecos'
import { useT } from '../../i18n'

/** Las pestañas; su rótulo es `presupuesto.gasto.pestana.<id>`, detrás del icono. */
const TABS = [
  { id: 'explorar', icono: '🔎' },
  { id: 'contratistas', icono: '🏗️' },
  { id: 'tipos', icono: '📊' },
]

export default function GastoDashboard() {
  const t = useT()
  const { data: tg } = useTenderGeo()
  const { data: tenders } = useTenders()
  const { data: cpv } = useCpvLabels()
  const contracts = useMemo(() => tenders?.contracts || [], [tenders])
  const contractsById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts])
  // Sobre todos los contratos, no los de la zona: ver `ContractCard`.
  const grupos = useMemo(() => agrupaPorExpediente(contracts), [contracts])

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
    // El denominador de esta cuota es EL MISMO que la cifra que la tarjeta
    // enseña arriba. Se calculaba con una regla propia que caía al importe de
    // licitación, así que la cuota se dividía entre 309.855,55 € que el titular
    // de al lado no contaba: numerador, denominador y porcentaje tienen que
    // cuadrar entre sí o la frase no dice lo que parece.
    const total = comprometidos.reduce((s2, c) => s2 + (importeAdjudicado(c) ?? 0), 0)
    if (!(total > 0)) return null
    const top = comprometidos.reduce((a2, b2) =>
      (importeAdjudicado(b2) ?? 0) > (importeAdjudicado(a2) ?? 0) ? b2 : a2,
    )
    const importe = importeAdjudicado(top) ?? 0
    // Se comprueba que el mayor SEA una concesión antes de llamarlo así. El
    // motivo de la salvedad —se adjudica por todo su plazo de una vez— sólo
    // vale para una concesión, y afirmar la categoría sin mirarla es el
    // centinela `Otro` otra vez: nombrar por eliminación.
    return { cuota: (importe / total) * 100, importe, esConcesion: isConcession(top) }
  }, [contracts])

  // La zona vive en la URL (`?barrio=l-oliveral`), no en un estado local: así
  // el selector de «En breve» puede abrirla desde arriba, y un vecino puede
  // mandar el enlace de SU barrio. `replace`, porque pulsar zonas en el mapa no
  // es navegar, y el botón «atrás» no debería recorrerlas una a una.
  const [params, setParams] = useSearchParams()
  const barrioPedido = params.get('barrio')
  const selectedZone = (tg?.zones ?? []).some((z) => z.slug === barrioPedido) ? barrioPedido : null
  // Un enlace con un barrio que el mapa no conoce (un enlace viejo, una errata)
  // se dice, en vez de abrir el mapa como si nadie hubiera preguntado nada.
  const barrioDesconocido = barrioPedido && !selectedZone ? barrioPedido : null
  const setSelectedZone = (slug) =>
    setParams(
      (actual) => {
        const n = new URLSearchParams(actual)
        if (slug) n.set('barrio', slug)
        else n.delete('barrio')
        return n
      },
      { replace: true, preventScrollReset: true },
    )
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
  //
  // Y es el periodo del TOTAL (`totalDateMin`/`totalDateMax`), no el de las
  // filas del mapa (`dateMin`/`dateMax`, que mueven el deslizador): todo lo que
  // lo usa rotula `totalAmount`. Coincidían por suerte hasta el 17-10-2026.
  const yearMin = (tg.universe?.totalDateMin ?? tg.universe?.dateMin ?? '').slice(0, 4)
  const yearMax = (tg.universe?.totalDateMax ?? tg.universe?.dateMax ?? '').slice(0, 4)
  const span = yearMin && yearMax ? `${yearMin}–${yearMax}` : null
  const nEjercicios = span ? Number(yearMax) - Number(yearMin) + 1 : null
  const totalUniverso = tg.universe?.totalAmount || 0

  return (
    <Card id="mapa-gasto" style={{ scrollMarginTop: 24 }}>
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
        eyebrow={
          span
            ? rellena(t('presupuesto.gasto.eyebrow'), { periodo: span })
            : t('presupuesto.gasto.eyebrow.sinPeriodo')
        }
        title={t('presupuesto.gasto.titulo')}
        right={
          totalUniverso > 0 ? (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-card)', fontWeight: 500, letterSpacing: '-.02em' }}
              >
                {eurosBreves(totalUniverso)}
              </div>
              <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
                {t('presupuesto.gasto.adjudicadoSinIva')}
                {nEjercicios
                  ? ` · ${rellena(t('presupuesto.gasto.ejercicios'), { n: nEjercicios })}`
                  : ''}
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
        {conHuecos(t('presupuesto.gasto.intro.total'), {
          '{todo}': <strong>{t('presupuesto.gasto.intro.todo')}</strong>,
        })}
        {obrasPct != null
          ? ` ${rellena(t('presupuesto.gasto.intro.obrasPct'), { pct: pct0(obrasPct) })}`
          : ` ${t('presupuesto.gasto.intro.grueso')}`}{' '}
        {rellena(t('presupuesto.gasto.intro.resto'), {
          pestana: t('presupuesto.gasto.pestana.tipos'),
        })}
        {span ? ` ${rellena(t('presupuesto.gasto.intro.periodo'), { periodo: span })}` : ''}{' '}
        {mayor && mayor.cuota >= 25 ? (
          <>
            {' '}
            <strong>{t('presupuesto.gasto.intro.noRepartido')}</strong>{' '}
            {rellena(
              t(
                mayor.esConcesion
                  ? 'presupuesto.gasto.intro.mayorConcesion'
                  : 'presupuesto.gasto.intro.mayor',
              ),
              {
                importe: eurosBreves(mayor.importe),
                pct: pct0(mayor.cuota),
              },
            )}
          </>
        ) : null}{' '}
        {obrasPctMapa != null
          ? rellena(t('presupuesto.gasto.intro.situados'), { pct: pct0(obrasPctMapa) })
          : t('presupuesto.gasto.intro.situadosSinPct')}
      </div>
      <div style={{ marginBottom: 10 }}>
        <button
          onClick={() => setDanaOnly((v) => !v)}
          aria-pressed={danaOnly}
          style={{ all: 'unset', cursor: 'pointer' }}
        >
          <Pill tone={danaOnly ? 'warn' : 'ghost'} size="xs">
            {danaOnly ? '● ' : '○ '}
            {t('presupuesto.gasto.soloDana')}
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
        {/* Con una zona abierta, esta columna es la lista de sus contratos, y
            «Ver sus contratos» de «En breve» (BarrioPicker) aterriza AQUÍ y no
            en `#mapa-gasto`. A 375 px las dos columnas se apilan: el ancla de la
            sección dejaba al lector en su rótulo y su párrafo, con el mapa
            debajo y la lista, que es lo que había pedido, fuera de la pantalla. */}
        <div id={selectedZone ? 'mapa-gasto-barrio' : undefined} style={{ scrollMarginTop: 24 }}>
          {selectedZone ? (
            <ZoneDrilldown
              snapshot={tg}
              zoneSlug={selectedZone}
              contractsById={contractsById}
              grupos={grupos}
              tenders={tenders?.tenders}
              danaOnly={danaOnly}
              onClear={() => setSelectedZone(null)}
              cpvDict={cpv?.codes}
            />
          ) : (
            <>
              {barrioDesconocido && (
                <p
                  data-barrio-desconocido=""
                  style={{
                    margin: '0 0 12px',
                    fontSize: 'var(--fs-aux)',
                    lineHeight: 1.5,
                    color: 'var(--warn-ink)',
                  }}
                >
                  {rellena(t('presupuesto.gasto.zona.desconocida'), { barrio: barrioDesconocido })}
                </p>
              )}
              <CoverageMeter
                universe={tg.universe}
                zones={tg.zones}
                onSelectZone={setSelectedZone}
              />
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div
          role="tablist"
          aria-label={t('presupuesto.gasto.pestanas.aria')}
          style={{
            display: 'flex',
            gap: 6,
            borderBottom: '1px solid var(--border2)',
            flexWrap: 'wrap',
          }}
        >
          {TABS.map((pestana) => (
            <button
              key={pestana.id}
              id={`tab-${pestana.id}`}
              role="tab"
              aria-selected={tab === pestana.id}
              onClick={() => setTab(pestana.id)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                fontSize: 'var(--fs-meta)',
                padding: '8px 12px',
                borderBottom:
                  tab === pestana.id ? '2px solid var(--civic)' : '2px solid transparent',
                color: tab === pestana.id ? 'var(--civic)' : 'var(--ink50)',
                fontWeight: tab === pestana.id ? 700 : 500,
              }}
            >
              {pestana.icono} {t(`presupuesto.gasto.pestana.${pestana.id}`)}
            </button>
          ))}
        </div>
        <div role="tabpanel" aria-labelledby={`tab-${tab}`} style={{ paddingTop: 12 }}>
          {tab === 'explorar' && (
            <ContractsExplorer contracts={contracts} tenders={tenders?.tenders} snapshot={tg} />
          )}
          {tab === 'contratistas' && <ContractorLeaderboard contracts={contracts} />}
          {tab === 'tipos' && <SpendingTypeBreakdown contracts={contracts} snapshot={tg} />}
        </div>
      </div>
    </Card>
  )
}
