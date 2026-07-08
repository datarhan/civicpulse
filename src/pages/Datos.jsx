import { Card, Pill, SectionHead, ExtLink } from '../components/Primitives'
import { Ic } from '../components/Icons'
import { usePadron } from '../hooks/usePadron'
import { useWikidata } from '../hooks/useWikidata'
import { useAsociaciones } from '../hooks/useAsociaciones'
import { useProcesosSelectivos } from '../hooks/useProcesosSelectivos'
import { useObras } from '../hooks/useObras'
import { useOfficials } from '../hooks/useOfficials'
import { useBudget } from '../hooks/useBudget'
import { useTenders } from '../hooks/useTenders'
import { useBdns } from '../hooks/useBdns'
import { useT } from '../i18n'
import { usePlenos } from '../hooks/usePlenos'
import { useEmpleo } from '../hooks/useEmpleo'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { usePress } from '../hooks/usePress'
import { useParticipa } from '../hooks/useParticipa'
import { useParo } from '../hooks/useParo'
import { useGeo } from '../hooks/useGeo'
import { usePromises } from '../hooks/usePromises'
import { usePlenoFindings } from '../hooks/usePlenoFindings'
import { usePlenoVotes } from '../hooks/usePlenoVotes'
import { useQuejas } from '../hooks/useQuejas'
import { useTransparencyDocs, groupTransparencyDocs } from '../hooks/useTransparencyDocs'
import { fmtDateShort, fmtDateLong } from '../lib/formatters'

function formatDate(iso) {
  return fmtDateShort(iso) || '—'
}

function DatasetsCatalog() {
  const officials = useOfficials().data
  const budget = useBudget().data
  const tenders = useTenders().data
  const bdns = useBdns().data
  const plenos = usePlenos().data
  const agendas = usePlenoAgendas().data
  const press = usePress().data
  const participa = useParticipa().data
  const padron = usePadron().data
  const paro = useParo().data
  const geo = useGeo().data
  const wiki = useWikidata().data
  const promises = usePromises().data
  const findings = usePlenoFindings().data
  const votes = usePlenoVotes().data
  const quejas = useQuejas().data
  const empleo = useEmpleo().data
  const procesos = useProcesosSelectivos().data
  const asociaciones = useAsociaciones().data
  const obras = useObras().data

  const items = [
    {
      name: 'Corporación municipal',
      rows: officials ? `${officials.count} cargos` : '—',
      updated: formatDate(officials?.generatedAt),
      source: 'ribarroja.es · scraper',
      path: '/data/officials.json',
      fmt: ['json'],
    },
    {
      name: 'Presupuesto municipal',
      rows: budget?.snapshot?.year ? `Ejercicio ${budget.snapshot.year}` : '—',
      updated: formatDate(budget?.generatedAt),
      source: 'MinHac CONPREL',
      path: '/data/budget.json',
      fmt: ['json'],
    },
    {
      name: 'Contratos públicos',
      rows: tenders?.stats?.totalContracts
        ? `${tenders.stats.totalContracts.toLocaleString('es-ES')} contratos`
        : '—',
      updated: formatDate(tenders?.generatedAt),
      source: 'Gobierto · PLACSP',
      path: '/data/tenders.json',
      fmt: ['json'],
    },
    {
      name: 'Subvenciones BDNS',
      rows: bdns?.stats?.total ? `${bdns.stats.total.toLocaleString('es-ES')} convocatorias` : '—',
      updated: formatDate(bdns?.generatedAt),
      source: 'BDNS · pap.hacienda.gob.es',
      path: '/data/bdns.json',
      fmt: ['json'],
    },
    {
      name: 'Plenos municipales',
      rows: plenos?.stats?.total ? `${plenos.stats.total} sesiones` : '—',
      updated: formatDate(plenos?.generatedAt),
      source: 'ribarroja.es/plenos',
      path: '/data/plenos.json',
      fmt: ['json'],
    },
    {
      name: 'Órdenes del día de pleno',
      rows: agendas?.stats?.agendaItemsTotal ? `${agendas.stats.agendaItemsTotal} puntos` : '—',
      updated: formatDate(agendas?.generatedAt),
      source: 'ribarroja.es · convocatorias',
      path: '/data/plenos-agendas.json',
      fmt: ['json'],
    },
    {
      name: 'Ofertas de empleo',
      rows: empleo?.stats?.openTotal ? `${empleo.stats.openTotal} ofertas abiertas` : '—',
      updated: formatDate(empleo?.generatedAt),
      source: 'ribaocupacio.portalemp.com · ADL',
      path: '/data/empleo.json',
      fmt: ['json'],
    },
    {
      name: 'Prensa local',
      rows: press?.stats?.total ? `${press.stats.total} titulares` : '—',
      updated: formatDate(press?.generatedAt),
      source: `${press?.stats?.sources ?? '—'} medios · RSS + agregadores`,
      path: '/data/press.json',
      fmt: ['json'],
    },
    {
      name: 'Participación ciudadana',
      rows: participa?.stats?.total ? `${participa.stats.total} publicaciones` : '—',
      updated: formatDate(participa?.generatedAt),
      source: 'participa.ribarroja.es',
      path: '/data/participa.json',
      fmt: ['json'],
    },
    {
      name: 'Padrón municipal',
      rows: padron?.latestTotal
        ? `${padron.latestTotal.toLocaleString('es-ES')} hab. (${padron.latestYear})`
        : '—',
      updated: formatDate(padron?.generatedAt),
      source: 'INE · Tempus3 tabla 2903',
      path: '/data/padron.json',
      fmt: ['json'],
    },
    {
      name: 'Paro registrado',
      rows: paro?.latestTotal
        ? `${paro.latestTotal.toLocaleString('es-ES')} personas (${paro.latestPeriod})`
        : '—',
      updated: formatDate(paro?.generatedAt),
      source: 'SEPE · serie municipal',
      path: '/data/paro.json',
      fmt: ['json'],
    },
    {
      name: 'Geografía del municipio',
      rows: geo?.neighborhoods ? `${geo.neighborhoods.length} barrios OSM` : '—',
      updated: formatDate(geo?.generatedAt),
      source: 'OpenStreetMap · relación 342356',
      path: '/data/geo.json',
      fmt: ['json'],
    },
    {
      name: 'Identidad Wikidata',
      rows: wiki?.facts?.qid || '—',
      updated: formatDate(wiki?.generatedAt),
      source: 'wikidata.org',
      path: '/data/wikidata.json',
      fmt: ['json'],
    },
    {
      name: 'Promesas políticas',
      rows: promises?.items ? `${promises.items.length} compromisos` : '—',
      updated: formatDate(promises?.generatedAt),
      source: 'curación editorial · fuente primaria',
      path: '/data/promises.json',
      fmt: ['json'],
    },
    {
      name: 'Hallazgos editoriales',
      rows: findings?.items ? `${findings.items.length} hallazgos` : '—',
      updated: formatDate(findings?.generatedAt),
      source: 'curación editorial · claim-verifier',
      path: '/data/pleno-findings.json',
      fmt: ['json'],
    },
    {
      name: 'Votaciones de pleno',
      rows: votes?.items ? `${votes.items.length} votaciones` : '—',
      updated: formatDate(votes?.generatedAt),
      source: 'curación · actas (regmeet.com)',
      path: '/data/pleno-votes.json',
      fmt: ['json'],
    },
    {
      name: 'Quejas ciudadanas',
      rows: quejas?.items ? `${quejas.items.length} quejas` : '—',
      updated: formatDate(quejas?.generatedAt),
      source: 'Telegram bot · Open311',
      path: '/data/quejas.json',
      fmt: ['json'],
    },
    {
      name: 'Empleo público (procesos selectivos)',
      rows: procesos?.procesos ? `${procesos.procesos.length} procesos` : '—',
      updated: formatDate(procesos?.generatedAt),
      source: 'ribarroja.es · scraper',
      path: '/data/procesos-selectivos.json',
      fmt: ['json'],
    },
    {
      name: 'Registro de asociaciones',
      rows: asociaciones?.asociaciones ? `${asociaciones.asociaciones.length} entidades` : '—',
      updated: formatDate(asociaciones?.generatedAt),
      source: 'Registro Municipal · Ayto.',
      path: '/data/asociaciones.json',
      fmt: ['json'],
    },
    {
      name: 'Obras de infraestructura (2019–2020)',
      rows: obras?.obras ? `${obras.obras.length} obras` : '—',
      updated: formatDate(obras?.generatedAt),
      source: 'Portal de Transparencia · Ayto.',
      path: '/data/obras.json',
      fmt: ['json'],
    },
  ]

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 14,
      }}
    >
      {items.map((d) => (
        <Card key={d.path} hover>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-.005em' }}>
                {d.name}
              </div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink60)', marginTop: 3 }}>
                {d.rows}
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 2 }}>
                Fuente: {d.source}
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginTop: 2 }}>
                Actualizado {d.updated}
              </div>
            </div>
            <Ic.chart width={16} height={16} style={{ color: 'var(--ink40)', flexShrink: 0 }} />
          </div>
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginTop: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {d.fmt.map((f) => (
                <Pill key={f} tone="ghost" size="xs">
                  {f}
                </Pill>
              ))}
            </div>
            <a
              href={d.path}
              target="_blank"
              rel="noreferrer"
              className="mono"
              style={{
                fontSize: 10.5,
                color: 'var(--civic)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              abrir →
            </a>
          </div>
        </Card>
      ))}
    </div>
  )
}

function WikidataCard() {
  const { loading, error, data } = useWikidata()
  if (loading || error || !data?.facts) return null
  const f = data.facts
  const generated = fmtDateLong(data.generatedAt)
  const link = (href, label) =>
    href ? (
      <ExtLink href={href} style={{ color: 'var(--civic)', textDecoration: 'none' }}>
        {label}
      </ExtLink>
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
      <SectionHead eyebrow={`Identidad del municipio · Wikidata ${f.qid}`} title={f.label} />
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
        {stat(
          'Población',
          f.population
            ? `${f.population.value.toLocaleString('es-ES')} (${f.population.year})`
            : '—',
        )}
        {stat('Superficie', f.areaKm2 ? `${f.areaKm2.toFixed(1)} km²` : '—')}
        {stat('Altitud', f.elevation ? `${f.elevation} m` : '—')}
        {stat(
          'Coordenadas',
          f.coordinates ? `${f.coordinates.lat.toFixed(4)}, ${f.coordinates.lng.toFixed(4)}` : '—',
        )}
        {stat(
          'Densidad',
          f.population && f.areaKm2 ? `${Math.round(f.population.value / f.areaKm2)} hab/km²` : '—',
        )}
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
          <span className="mono" style={{ color: 'var(--ink50)' }}>
            INE:{' '}
          </span>
          <span className="mono" style={{ fontWeight: 700 }}>
            {f.identifiers.ine || '—'}
          </span>
        </div>
        <div>
          <span className="mono" style={{ color: 'var(--ink50)' }}>
            OSM:{' '}
          </span>
          {link(
            f.identifiers.osmRelation
              ? `https://www.openstreetmap.org/relation/${f.identifiers.osmRelation}`
              : null,
            f.identifiers.osmRelation ? `rel/${f.identifiers.osmRelation}` : '—',
          )}
        </div>
        <div>
          <span className="mono" style={{ color: 'var(--ink50)' }}>
            GeoNames:{' '}
          </span>
          {link(
            f.identifiers.geonames ? `https://www.geonames.org/${f.identifiers.geonames}` : null,
            f.identifiers.geonames || '—',
          )}
        </div>
        <div>
          <span className="mono" style={{ color: 'var(--ink50)' }}>
            Commons:{' '}
          </span>
          {link(
            f.identifiers.commonsCat
              ? `https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(f.identifiers.commonsCat)}`
              : null,
            f.identifiers.commonsCat || '—',
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
  if (loading)
    return (
      <Card>
        <div style={{ color: 'var(--ink50)', fontSize: 13 }}>Cargando padrón INE…</div>
      </Card>
    )
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
  const path = pts
    .map((p, i) => (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ',' + yAt(p.value).toFixed(1))
    .join(' ')
  const area =
    'M' +
    xAt(0).toFixed(1) +
    ',' +
    (PAD_T + innerH).toFixed(1) +
    ' ' +
    pts.map((p, i) => 'L' + xAt(i).toFixed(1) + ',' + yAt(p.value).toFixed(1)).join(' ') +
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
  const generated = fmtDateLong(data.generatedAt)

  return (
    <Card>
      <SectionHead
        eyebrow={`Padrón oficial INE · ${years[0]}–${years[years.length - 1]}`}
        title="Población residente"
      />
      <div
        style={{ display: 'flex', gap: 20, alignItems: 'baseline', marginTop: 4, marginBottom: 4 }}
      >
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
              color: data.growth.decadePct >= 0 ? 'var(--ok-ink)' : 'var(--crit-ink)',
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
          <ExtLink href={data.source} style={{ color: 'var(--civic)' }}>
            ine.es
          </ExtLink>
        </div>
      </div>
    </Card>
  )
}

function TransparencyDocsCard() {
  const { data } = useTransparencyDocs()
  if (!data || (data.stats?.total ?? 0) === 0) return null
  const groups = groupTransparencyDocs(data)
  return (
    <Card>
      <SectionHead
        eyebrow="Portal de Transparencia · documentos oficiales"
        title="Documentos del Ayuntamiento (RPT, plantilla y CV de los cargos)"
      />
      <div style={{ marginTop: 12, display: 'grid', gap: 16 }}>
        {groups.map((g) => (
          <div key={g.label}>
            <div
              className="mono"
              style={{
                fontSize: 10.5,
                color: 'var(--ink60)',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                marginBottom: 6,
              }}
            >
              {g.label} · {g.docs.length}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {g.docs.map((d) => (
                <ExtLink
                  key={d.id}
                  href={d.url}
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--civic)',
                    textDecoration: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '3px 8px',
                  }}
                >
                  {d.title}
                  {d.year ? ` · ${d.year}` : ''} ↗
                </ExtLink>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginTop: 10 }}>
        Catálogo de enlaces a los PDF oficiales · sin extracción de datos sensibles ·{' '}
        {fmtDateShort(data.generatedAt)}
      </div>
    </Card>
  )
}

function AsociacionesCard() {
  const { data } = useAsociaciones()
  const rows = data?.asociaciones ?? []
  if (rows.length === 0) return null
  const byTipo = rows.reduce((acc, a) => {
    const k = a.tipo || 'Otras'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})
  const tipos = Object.entries(byTipo).sort((a, b) => b[1] - a[1])
  return (
    <Card>
      <SectionHead
        eyebrow={`Registro municipal${data?.fechaRegistro ? ` · ${data.fechaRegistro}` : ''}`}
        title={`Entidades y asociaciones (${rows.length})`}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0 16px' }}>
        {tipos.map(([t, n]) => (
          <Pill key={t} tone="neutral">
            {t} · <span className="mono">{n}</span>
          </Pill>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '4px 16px',
        }}
      >
        {rows.map((a, i) => (
          <div
            key={i}
            style={{
              fontSize: 12.5,
              color: 'var(--ink80)',
              padding: '3px 0',
              borderBottom: '1px solid var(--border2)',
            }}
          >
            {a.nombre}
            {a.tipo && <span style={{ color: 'var(--ink50)' }}> · {a.tipo}</span>}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--ink50)', marginTop: 10, marginBottom: 0 }}>
        Fuente: Registro Municipal de Asociaciones · Ayuntamiento de Riba-roja de Túria.
      </p>
    </Card>
  )
}

export default function Datos() {
  const t = useT()
  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}
    >
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
          {t('datos.eyebrow')}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          {t('datos.title')}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink60)', marginTop: 4, maxWidth: 620 }}>
          Todo lo que alimenta CivicPulse, descargable y consultable vía API. Periodismo,
          investigación y transparencia.
        </div>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <a
            href="/lab-health"
            style={{ color: 'var(--civic)', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            Salud del laboratorio →
          </a>{' '}
          <span style={{ color: 'var(--ink50)' }}>
            diagnóstico nocturno de cada snapshot (frescura, filas, tamaño)
          </span>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <WikidataCard />
      </div>

      <div style={{ marginBottom: 18 }}>
        <PopulationChart />
      </div>

      <div style={{ marginBottom: 18 }}>
        <TransparencyDocsCard />
      </div>

      <div style={{ marginBottom: 18 }}>
        <AsociacionesCard />
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
        Catálogo de datasets · snapshots JSON regenerados por el pipeline
      </div>
      <DatasetsCatalog />
    </div>
  )
}
