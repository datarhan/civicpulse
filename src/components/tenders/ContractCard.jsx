// @ts-check
import { ExtLink, Pill } from '../Primitives'
import { STATUS_LABEL, STATUS_TONE } from '../../hooks/useTenders'
import { fmtDateShort } from '../../lib/formatters'
import { PROCESS_TYPE_LABEL, CONTRACT_TYPE_LABEL, bajaPct } from '../../lib/tenders'
import { uniqueCpvLabels } from '../../lib/cpv'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n || 0)

// Fixed light-theme palette: this card renders both inside always-white Leaflet
// popups AND on the theme-aware /presupuesto panel, so it carries its own light
// surface (readable as a "note card" even over a dark panel) rather than
// inheriting --ink, which would vanish on a white popup in dark mode.
const INK = '#0B0F19'
const INK70 = 'rgba(11,15,25,.7)'
const INK55 = 'rgba(11,15,25,.55)'
const INK45 = 'rgba(11,15,25,.45)'

/**
 * One awarded contract as a compact "obra" card — the shared detail surface for
 * the landing money popup and the /presupuesto zone drill-down. Surfaces the
 * detail/target/result the raw row already carries: adjudicatario (winner),
 * importe licitación→adjudicación (the baja), CPV target labels, procedimiento,
 * nº de licitadores, plazo — plus the honest "situado por «…»" provenance.
 *
 * Props: contract (full Contract row · required), amount, amountKind
 * ('final'|'initial'), date, dana, provenance (matched place-name), cpvDict
 * (codes map from useCpvLabels).
 * @param {any} props
 */
export function ContractCard(props) {
  const { contract: c, amount, amountKind, date, dana, provenance, cpvDict, relatedQuejas } = props
  if (!c) return null
  const shown = typeof amount === 'number' ? amount : c.finalAmountNoTaxes || c.finalAmount || 0
  const baja = bajaPct(c)
  const cpvLabels = uniqueCpvLabels(c.cpvs, cpvDict, 3)
  const tipo = CONTRACT_TYPE_LABEL[c.contractType]
  const proc = PROCESS_TYPE_LABEL[c.processType]
  const nBids = Number(c.numberOfProposals) || 0
  const dias = Number(c.duration) || 0

  return (
    <div
      style={{
        background: '#FBFAF7',
        border: '1px solid #E6E1D4',
        borderRadius: 'var(--r-input)',
        padding: '8px 9px',
        marginBottom: 6,
        color: INK,
      }}
    >
      {/* Title + located amount */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>
          <ExtLink href={c.permalink} style={{ color: 'inherit', textDecoration: 'none' }}>
            {c.title}
          </ExtLink>
          {dana && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 9,
                fontWeight: 700,
                color: '#A85F00',
                background: 'rgba(224,134,0,.16)',
                padding: '1px 5px',
                borderRadius: 'var(--r-input)',
                whiteSpace: 'nowrap',
              }}
            >
              DANA
            </span>
          )}
        </div>
        <span className="mono" style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {fmtEur(shown)}
        </span>
      </div>

      {/* Adjudicatario (winner) + baja */}
      {c.assignee && (
        <div
          style={{
            marginTop: 4,
            fontSize: 11.5,
            color: INK70,
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            alignItems: 'baseline',
          }}
        >
          <span style={{ color: INK45 }}>Adjudicatario:</span>
          <strong style={{ color: INK, fontWeight: 600 }}>{c.assignee}</strong>
          {baja !== null && (
            <span
              className="mono"
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 'var(--r-input)',
                color: baja >= 0 ? '#0F7B3E' : '#B4232A',
                background: baja >= 0 ? 'rgba(22,163,74,.14)' : 'rgba(220,38,38,.12)',
              }}
              title="Baja de adjudicación (adjudicación vs licitación)"
            >
              {baja >= 0 ? '−' : '+'}
              {Math.abs(baja)}%
            </span>
          )}
        </div>
      )}

      {/* CPV target labels */}
      {cpvLabels.length > 0 && (
        <div style={{ marginTop: 3, fontSize: 10.5, color: INK55, lineHeight: 1.3 }}>
          {cpvLabels.join(' · ')}
        </div>
      )}

      {/* Meta: date · status · tipo · procedimiento · nº licitadores · plazo · provenance */}
      <div
        style={{
          fontSize: 10,
          color: INK45,
          marginTop: 4,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span>{fmtDateShort(date) || 'sin fecha'}</span>
        <Pill tone={STATUS_TONE[c.status] || 'ghost'} size="xs">
          {STATUS_LABEL[c.status] || c.status}
        </Pill>
        {tipo && <span>· {tipo}</span>}
        {proc && <span>· {proc}</span>}
        {nBids > 0 && (
          <span>
            · {nBids} licitador{nBids === 1 ? '' : 'es'}
          </span>
        )}
        {dias > 0 && <span>· {dias} días</span>}
        {amountKind === 'initial' && <span>· importe de licitación</span>}
        {provenance && <span>· situado por «{provenance}»</span>}
      </div>

      {/* Contract-side reverse view: citizen complaints related by zone/materia
          (Tier A / curator-approved only). Neutral — never asserts the contract
          resolves the complaint. */}
      {relatedQuejas && relatedQuejas.length > 0 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #E6E1D4' }}>
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              color: INK45,
              marginBottom: 3,
            }}
          >
            Quejas ciudadanas relacionadas
          </div>
          {relatedQuejas.map((r) => (
            <a
              key={r.quejaId}
              href={`/quejas/${r.quejaId}`}
              style={{
                display: 'block',
                fontSize: 11,
                color: INK70,
                textDecoration: 'none',
                marginBottom: 2,
                lineHeight: 1.35,
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '0 4px',
                  borderRadius: 'var(--r-input)',
                  background: 'rgba(22,163,74,.12)',
                  color: '#0F7B3E',
                  marginRight: 5,
                }}
              >
                {r.relationLabel}
              </span>
              {r.description ? r.description.slice(0, 60) : r.quejaId}
              {r.description && r.description.length > 60 ? '…' : ''}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
