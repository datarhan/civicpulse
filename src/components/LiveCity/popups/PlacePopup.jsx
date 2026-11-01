// @ts-check
import { rotuloDe, useT } from '../../../i18n'
import { rellena, euros } from '../../../lib/formatters'
import { ContractCard } from '../../tenders/ContractCard'
import { EnlacesABarrio } from './EnlacesABarrio'

/**
 * Map popup for a precise "contrato situado" pin. Lists every located contract that
 * resolved to this place (via the multi-source resolver) using the shared
 * ContractCard. Honest by construction: a contract only appears here because its
 * title named this street / equipment / zone.
 *
 * La clase del lugar se rotula por su clave, `map.lugar.<clase>`, sobre el enum
 * `PLACE_KINDS` del resolutor. Una clase que no tenga clave se pinta con su token,
 * como se pintaba antes la que faltaba en la tabla escrita aquí.
 *
 * `grupos` y `tenders` vienen de TODO tenders.json, no de los contratos de este
 * lugar: ver `ContractCard`.
 *
 * `barriosDebajo` son los barrios cuyo punto tapa este pin y le cede el toque
 * (`lib/barrios-bajo-pines`): esta ficha es su puerta.
 */
export function PlacePopup({
  place,
  assignments,
  contractsById,
  grupos,
  tenders,
  danaOnly,
  obrasOnly,
  cpvDict,
  barriosDebajo = [],
  onAbrirBarrio = null,
}) {
  const t = useT()
  const works = (assignments || [])
    .filter(
      (a) =>
        a.place?.sourceId === place.sourceId &&
        a.point &&
        (!danaOnly || a.dana) &&
        (!obrasOnly || a.contractType === 'construction'),
    )
    .map((a) => ({ a, c: contractsById.get(a.id) }))
    .filter((w) => w.c)
    .sort((x, y) => (y.a.date || '').localeCompare(x.a.date || ''))
  const total = works.reduce((s, w) => s + w.a.amount, 0)
  return (
    <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 260, maxWidth: 320 }}>
      <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: '#0B0F19' }}>
        {place.name}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'baseline',
          flexWrap: 'wrap',
          marginTop: 1,
        }}
      >
        <span
          className="mono"
          style={{ fontSize: 'var(--fs-meta)', fontWeight: 700, color: 'var(--civic)' }}
        >
          {euros(total)} · {works.length}{' '}
          {t(works.length === 1 ? 'map.contratos.uno' : 'map.contratos.varios')}
        </span>
        <span
          style={{
            fontSize: 'var(--fs-micro)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.05em',
            color: 'rgba(11,15,25,.5)',
            border: '1px solid #DCD7C8',
            borderRadius: 'var(--r-input)',
            padding: '1px 5px',
          }}
        >
          {rotuloDe(t, `map.lugar.${place.kind}`, place.kind)}
        </span>
      </div>
      {/* Bajo la cabecera y no al pie: a 375 px la ficha llena el mapa y la pila de
          controles plegada tapa su última fila. Medido el 12-10-2026 con cada barrio
          que cede: aquí se alcanza en todos a 375 y a 1280; al pie fallaban 4 de 9 a
          375. */}
      <EnlacesABarrio barrios={barriosDebajo} onAbrir={onAbrirBarrio} />
      <div style={{ marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>
        {works.map(({ a, c }) => (
          <div key={a.id}>
            <ContractCard
              contract={c}
              amount={a.amount}
              amountKind={a.amountKind}
              date={a.date}
              dana={a.dana}
              cpvDict={cpvDict}
              grupos={grupos}
              tenders={tenders}
            />
            {a.parentTitle && (
              <div
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'rgba(11,15,25,.55)',
                  margin: '2px 2px 8px',
                }}
              >
                {rellena(t('map.lugar.lote'), { titulo: a.parentTitle })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 'var(--fs-micro)',
          color: 'rgba(11,15,25,.5)',
          fontFamily: 'DM Mono, monospace',
          letterSpacing: '.03em',
        }}
      >
        {t('map.lugar.pie')}
      </div>
    </div>
  )
}
