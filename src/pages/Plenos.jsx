import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { ParticipaBlock } from '../components/plenos/ParticipaBlock'
import { usePlenos, PLENO_TONE, PLENO_LABEL } from '../hooks/usePlenos'
import { usePlenoClaimsManifest } from '../hooks/usePlenoClaims'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { usePlenoFindings } from '../hooks/usePlenoFindings'
import { summarizeSessions } from '../lib/pleno-summary'
import { fmtDateLong } from '../lib/formatters'
import { useT } from '../i18n'
import { DEPARTMENT_LABEL } from '../scraper/departments'

/**
 * `department` now holds the canonical slug (the counts are keyed on it so the
 * 57 items with a slug but no raw department name are included), so render the
 * human label rather than the slug itself.
 */
function deptName(d) {
  const label = d.departmentSlug && DEPARTMENT_LABEL[d.departmentSlug]
  return label ? label.es : d.department
}

function TopDepartmentsCard({ agendas }) {
  if (!agendas?.topDepartments?.length) return null
  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionHead
        eyebrow={`Plenos analizados · ${agendas.stats.plenosFetched} sesiones · ${agendas.stats.agendaItemsTotal} puntos`}
        title="Departamentos con más puntos en el orden del día"
        right={
          <Link
            to="/departamentos"
            style={{ fontSize: 12, color: 'var(--civic)', textDecoration: 'none' }}
          >
            Ver dashboard por departamento →
          </Link>
        }
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {agendas.topDepartments.map((d) => (
          <Link
            key={d.department}
            to={d.departmentSlug ? `/departamentos/${d.departmentSlug}` : '/departamentos'}
            className="mono"
            style={{
              fontSize: 11,
              padding: '3px 8px',
              background: 'var(--civic-soft)',
              color: 'var(--civic)',
              borderRadius: 3,
              letterSpacing: '.05em',
              textDecoration: 'none',
            }}
          >
            {deptName(d)}
            <span style={{ marginLeft: 5, color: 'var(--ink60)' }}>· {d.count}</span>
          </Link>
        ))}
      </div>
    </Card>
  )
}

function Count({ n, label, tone }) {
  if (!n) return null
  return (
    <span className="mono" style={{ fontSize: 11, color: tone, marginLeft: 8 }}>
      {n} {label}
    </span>
  )
}

function SessionRow({ row, t }) {
  return (
    <Link
      to={`/plenos/${row.id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '130px 1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: '11px 6px',
        borderBottom: '1px solid var(--border2)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <span className="mono" style={{ fontSize: 12, color: 'var(--ink60)' }}>
        {fmtDateLong(row.date)}
      </span>
      <span style={{ minWidth: 0 }}>
        <Pill tone={PLENO_TONE[row.kind] || 'ghost'} size="xs">
          {PLENO_LABEL[row.kind] || row.kind}
        </Pill>
        <Count n={row.agendaCount} label={t('plenosIndex.points')} tone="var(--ink60)" />
        <Count n={row.verificado} label="✓" tone="var(--ok-ink)" />
        <Count n={row.contradicho} label="✗" tone="var(--crit-ink)" />
        <Count n={row.findings} label={t('plenosIndex.findings')} tone="var(--intel-ink)" />
      </span>
      <span className="mono" style={{ fontSize: 14, color: 'var(--ink40)' }}>
        →
      </span>
    </Link>
  )
}

export default function Plenos() {
  const t = useT()
  const { loading, data: plenosData } = usePlenos()
  const { data: manifest } = usePlenoClaimsManifest()
  const { data: agendasData } = usePlenoAgendas()
  const { data: findingsData } = usePlenoFindings()

  const rows = useMemo(
    () =>
      summarizeSessions({
        plenos: plenosData?.items ?? [],
        manifestPlenos: manifest?.plenos ?? [],
        findings: findingsData?.items ?? [],
        agendas: agendasData?.plenos ?? [],
      }),
    [plenosData, manifest, findingsData, agendasData],
  )

  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}
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
          {t('plenos.eyebrow')}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          {t('plenos.title')}
        </div>
      </div>

      <TopDepartmentsCard agendas={agendasData} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Sesiones · {plenosData?.stats?.total ?? rows.length}
        </div>
        {plenosData?.generatedAt && <DataAsOf iso={plenosData.generatedAt} label="Plenos" />}
      </div>
      <Card>
        {loading && <div style={{ padding: 12, fontSize: 12, color: 'var(--ink50)' }}>…</div>}
        {rows.map((row) => (
          <SessionRow key={row.id} row={row} t={t} />
        ))}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Link
          to="/declaraciones"
          style={{ fontSize: 13, color: 'var(--civic)', textDecoration: 'none' }}
        >
          {t('plenosIndex.crossSession')}
        </Link>
      </div>

      <ParticipaBlock />
    </div>
  )
}
