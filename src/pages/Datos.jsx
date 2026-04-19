import { Card, Pill, SectionHead } from '../components/Primitives'
import { Ic } from '../components/Icons'
import { DATASETS } from '../data/mockData'
import { usePadron } from '../hooks/usePadron'
import { useWikidata } from '../hooks/useWikidata'

function WikidataCard() {
  const { loading, error, data } = useWikidata()
  if (loading || error || !data?.facts) return null
  const f = data.facts
  const generated = new Date(data.generatedAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const link = (href, label) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={{ color: 'var(--civic)', textDecoration: 'none' }}
      >
        {label}
      </a>
    ) : (
      <span style={{ color: 'var(--ink50)' }}>—</span>
    )
  const stat = (label, value) => (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <div className="mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>
        {value}
      </div>
    </div>
  )
  return (
    <Card>
      <SectionHead
        eyebrow={`Identidad del municipio · Wikidata ${f.qid}`}
        title={f.label}
      />
      <div style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 2, marginBottom: 12 }}>
        {f.description} · actualizado {generated}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 18,
          marginBottom: 14,
        }}
      >
        {stat('Población', f.population ? `${f.population.value.toLocaleString('es-ES')} (${f.population.year})` : '—')}
        {stat('Superficie', f.areaKm2 ? `${f.areaKm2.toFixed(1)} km²` : '—')}
        {stat('Altitud', f.elevation ? `${f.elevation} m` : '—')}
        {stat(
          'Coordenadas',
          f.coordinates ? `${f.coordinates.lat.toFixed(4)}, ${f.coordinates.lng.toFixed(4)}` : '—'
        )}
        {stat('Densidad', f.population && f.areaKm2 ? `${Math.round(f.population.value / f.areaKm2)} hab/km²` : '—')}
      </div>
      <div
        style={{
          borderTop: '1px solid var(--border2)',
          paddingTop: 12,
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          fontSize: 11.5,
        }}
      >
        <div>
          <span className="mono" style={{ color: 'var(--ink50)' }}>INE: </span>
          <span className="mono" style={{ fontWeight: 700 }}>{f.identifiers.ine || '—'}</span>
        </div>
        <div>
          <span className="mono" style={{ color: 'var(--ink50)' }}>OSM: </span>
          {link(
            f.identifiers.osmRelation
              ? `https://www.openstreetmap.org/relation/${f.identifiers.osmRelation}`
              : null,
            f.identifiers.osmRelation ? `rel/${f.identifiers.osmRelation}` : '—'
          )}
        </div>
        <div>
          <span className="mono" style={{ color: 'var(--ink50)' }}>GeoNames: </span>
          {link(
            f.identifiers.geonames
              ? `https://www.geonames.org/${f.identifiers.geonames}`
              : null,
            f.identifiers.geonames || '—'
          )}
        </div>
        <div>
          <span className="mono" style={{ color: 'var(--ink50)' }}>Commons: </span>
          {link(
            f.identifiers.commonsCat
              ? `https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(f.identifiers.commonsCat)}`
              : null,
            f.identifiers.commonsCat || '—'
          )}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          {link(`https://www.wikidata.org/wiki/${f.qid}`, 'Wikidata ' + f.qid)}
        </div>
      </div>
    </Card>
  )
}

function PopulationChart() {
  const { loading, error, data } = usePadron()
  if (loading) return <Card><div style={{ color: 'var(--ink50)', fontSize: 13 }}>Cargando padrón INE…</div></Card>
  if (error || !data) return null

  const pts = data.series.total
  const men = data.series.men
  const women = data.series.women
  const years = pts.map((p) => p.year)
  const values = pts.map((p) => p.value)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const W = 900
  const H = 220
  const PAD_L = 54
  const PAD_R = 16
  const PAD_T = 16
  const PAD_B = 28
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const xAt = (i) => PAD_L + (i / (pts.length - 1)) * innerW
  const yAt = (v) => PAD_T + innerH - ((v - minV) / (maxV - minV || 1)) * innerH
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ',' + yAt(p.value).toFixed(1)).join(' ')
  const area =
    'M' +
    xAt(0).toFixed(1) +
    ',' +
    (PAD_T + innerH).toFixed(1) +
    ' ' +
    pts
      .map((p, i) => 'L' + xAt(i).toFixed(1) + ',' + yAt(p.value).toFixed(1))
      .join(' ') +
    ' L' +
    xAt(pts.length - 1).toFixed(1) +
    ',' +
    (PAD_T + innerH).toFixed(1) +
    ' Z'

  // Axis ticks: 5 horizontal
  const ticks = []
  for (let i = 0; i <= 4; i++) {
    const v = minV + (i / 4) * (maxV - minV)
    ticks.push({ y: yAt(v), v: Math.round(v) })
  }
  // X axis: every 4 years
  const xTicks = []
  for (let i = 0; i < pts.length; i += Math.ceil(pts.length / 7)) {
    xTicks.push({ x: xAt(i), y: pts[i].year })
  }

  const latest = pts[pts.length - 1]
  const generated = new Date(data.generatedAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <Card>
      <SectionHead
        eyebrow={`Padrón oficial INE · ${years[0]}–${years[years.length - 1]}`}
        title="Población residente"
      />
      <div style={{ display: 'flex', gap: 20, alignItems: 'baseline', marginTop: 4, marginBottom: 4 }}>
        <div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.01em' }}>
            {latest.value.toLocaleString('es-ES')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink50)' }}>habitantes · {latest.year}</div>
        </div>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: data.growth.decadePct >= 0 ? 'var(--ok)' : 'var(--crit)',
            }}
          >
            {data.growth.decadePct >= 0 ? '+' : ''}
            {data.growth.decadePct.toFixed(1)}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink50)' }}>10 años</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink50)' }}>
          actualizado {generated} · INE Tempus3 tabla 2903
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={t.y}
              y2={t.y}
              stroke="var(--border2)"
              strokeWidth="0.5"
            />
            <text
              x={PAD_L - 6}
              y={t.y + 3}
              textAnchor="end"
              fontSize="10"
              fontFamily="DM Mono, monospace"
              fill="var(--ink50)"
            >
              {t.v.toLocaleString('es-ES')}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text
            key={i}
            x={t.x}
            y={H - 10}
            textAnchor="middle"
            fontSize="10"
            fontFamily="DM Mono, monospace"
            fill="var(--ink50)"
          >
            {t.y}
          </text>
        ))}
        <path d={area} fill="var(--civic)" opacity="0.08" />
        <path d={path} fill="none" stroke="var(--civic)" strokeWidth="2" />
        {pts.map((p, i) => (
          <circle key={i} cx={xAt(i)} cy={yAt(p.value)} r="2" fill="var(--civic)" />
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 20, marginTop: 14, fontSize: 12 }}>
        <div>
          <span className="mono" style={{ fontWeight: 700 }}>
            {men[men.length - 1]?.value.toLocaleString('es-ES')}
          </span>{' '}
          <span style={{ color: 'var(--ink50)' }}>hombres</span>
        </div>
        <div>
          <span className="mono" style={{ fontWeight: 700 }}>
            {women[women.length - 1]?.value.toLocaleString('es-ES')}
          </span>{' '}
          <span style={{ color: 'var(--ink50)' }}>mujeres</span>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink50)' }}>
          fuente:{' '}
          <a
            href={data.source}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--civic)' }}
          >
            ine.es
          </a>
        </div>
      </div>
    </Card>
  )
}

export default function Datos() {
  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Datos abiertos
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          Datasets y APIs
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink60)', marginTop: 4, maxWidth: 620 }}>
          Todo lo que alimenta CivicPulse, descargable y consultable vía API. Periodismo, investigación y
          transparencia.
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <WikidataCard />
      </div>

      <div style={{ marginBottom: 18 }}>
        <PopulationChart />
      </div>

      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          marginBottom: 8,
        }}
      >
        Catálogo de datasets
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {DATASETS.map((d, i) => (
          <Card key={i} hover>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-.005em' }}>{d.name}</div>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink50)', marginTop: 3 }}>
                  {d.rows} registros · {d.updated}
                </div>
              </div>
              <Ic.chart width={16} height={16} style={{ color: 'var(--ink40)', flexShrink: 0 }} />
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 14, flexWrap: 'wrap' }}>
              {d.fmt.map((f) => (
                <Pill key={f} tone="ghost" size="xs">
                  {f}
                </Pill>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
