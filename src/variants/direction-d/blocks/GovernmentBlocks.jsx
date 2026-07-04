import { useOfficials, partyColor } from '../../../hooks/useOfficials'
import { usePromises, isPromiseFrozen } from '../../../hooks/usePromises'
import { usePlenoAgendas } from '../../../hooks/usePlenoAgendas'
import { PALETTE, MONO } from '../tokens'
import { SectionHeader } from '../SectionHeader'

export function CoalitionRing() {
  const { loading, error, data } = useOfficials()
  if (loading || error || !data) return null
  const order = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'Otro']
  const items = order.filter((p) => data.composition[p]).map((p) => ({ p, n: data.composition[p] }))
  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHeader tone="pleno" title="Pleno municipal" meta={`${data.count} escaños`} />
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 12,
          borderRadius: 6,
          overflow: 'hidden',
          border: `1px solid ${PALETTE.hair}`,
        }}
      >
        {items.map(({ p, n }) => (
          <div
            key={p}
            title={`${p}: ${n}`}
            style={{
              flex: n,
              background: partyColor(p),
              display: 'grid',
              placeItems: 'center',
              color: 'white',
              fontFamily: MONO,
              fontSize: 8.5,
              fontWeight: 700,
            }}
          >
            {n}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', fontSize: 10.5 }}>
        {items.map(({ p, n }) => (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: partyColor(p),
                display: 'inline-block',
              }}
            />
            <span style={{ fontWeight: 600 }}>{p}</span>
            <span className="mono" style={{ color: PALETTE.ink60 }}>
              {n}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function PromesasBlockD() {
  const { loading, error, data } = usePromises()
  if (loading || error || !data) return null
  const frozen = isPromiseFrozen(data)
  const total = data.items?.length ?? 0
  if (total === 0) return null
  const byParty = (data.items || []).reduce((acc, p) => {
    acc[p.party] = (acc[p.party] || 0) + 1
    return acc
  }, {})
  const parties = Object.entries(byParty).sort((a, b) => b[1] - a[1])
  return (
    <div style={{ marginBottom: 18 }}>
      <SectionHeader
        tone="promesas"
        title="Seguimiento de promesas"
        meta={total}
        badge={
          frozen && (
            <span
              className="mono"
              style={{
                fontSize: 9,
                color: PALETTE.crit,
                background: 'rgba(220,38,38,.08)',
                padding: '1px 6px',
                borderRadius: 3,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              LOREG · congelado
            </span>
          )
        }
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, marginBottom: 8 }}>
        {parties.map(([party, n]) => (
          <span
            key={party}
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              fontWeight: 700,
              color: 'white',
              background: partyColor(party),
              padding: '2px 7px',
              borderRadius: 3,
            }}
          >
            {party} · {n}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: PALETTE.ink80, lineHeight: 1.45, marginBottom: 6 }}>
        Compromisos públicos documentados con cita verbatim y fuente primaria. Sin juicios
        automáticos de cumplimiento.
      </div>
      <a
        href="/promesas"
        style={{ color: PALETTE.accent, textDecoration: 'none', fontSize: 11.5, fontWeight: 600 }}
      >
        Ver tracker completo →
      </a>
    </div>
  )
}

export function DepartamentosBlockD() {
  const { data: agendas } = usePlenoAgendas()
  const officialsSnap = useOfficials()
  const promisesSnap = usePromises()
  if (!agendas?.stats) return null
  const frozen = isPromiseFrozen(promisesSnap.data)
  const vencidos = frozen ? 0 : (agendas.stats.plazosVencidosCount ?? 0)
  const coverage = agendas.stats.deptCoverage ?? null
  const totalDepts = 28
  const totalOfficials = officialsSnap.data?.officials?.length ?? null
  return (
    <div style={{ marginBottom: 18 }}>
      <SectionHeader
        tone="rendicion"
        title="Rendición de cuentas por concejalía"
        badge={
          !frozen &&
          vencidos > 0 && (
            <span
              className="mono"
              style={{
                fontSize: 9.5,
                color: PALETTE.warn,
                background: 'rgba(217,119,6,.10)',
                padding: '1px 6px',
                borderRadius: 3,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              ⚠ {vencidos} plazos vencidos
            </span>
          )
        }
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div>
          <div
            className="mono"
            style={{
              fontSize: 9,
              color: PALETTE.ink50,
              textTransform: 'uppercase',
              letterSpacing: '.1em',
            }}
          >
            Concejalías
          </div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: PALETTE.ink }}>
            {totalDepts}
          </div>
        </div>
        {coverage !== null && (
          <div>
            <div
              className="mono"
              style={{
                fontSize: 9,
                color: PALETTE.ink50,
                textTransform: 'uppercase',
                letterSpacing: '.1em',
              }}
            >
              Con responsable
            </div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: PALETTE.ink }}>
              {coverage}/{totalDepts}
            </div>
          </div>
        )}
        {totalOfficials !== null && (
          <div>
            <div
              className="mono"
              style={{
                fontSize: 9,
                color: PALETTE.ink50,
                textTransform: 'uppercase',
                letterSpacing: '.1em',
              }}
            >
              Concejales
            </div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: PALETTE.ink }}>
              {totalOfficials}
            </div>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: PALETTE.ink80, lineHeight: 1.45, marginBottom: 6 }}>
        Cruza votos de pleno, promesas electorales y quejas ciudadanas por concejalía. Un plazo
        vencido se marca como aviso editorial — el estado nunca se modifica de forma automática.
      </div>
      <a
        href="/departamentos"
        style={{ color: PALETTE.accent, textDecoration: 'none', fontSize: 11.5, fontWeight: 600 }}
      >
        Ver dashboard por departamento →
      </a>
    </div>
  )
}
