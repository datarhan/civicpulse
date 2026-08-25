import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { ParticipaBlock } from '../components/plenos/ParticipaBlock'
import { usePlenos, PLENO_TONE, PLENO_LABEL } from '../hooks/usePlenos'
import { usePlenoClaimsManifest } from '../hooks/usePlenoClaims'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { usePlenoFindings } from '../hooks/usePlenoFindings'
import { usePlenoVotes } from '../hooks/usePlenoVotes'
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
        // "Plenos analizados · 37 sesiones" read, right under the page title, as
        // if the town had held 37 — while the list below says 61. The 377 points
        // come from the 37 whose orden del día we could extract; the other 24
        // happened and are simply not broken down. Naming the denominator is the
        // difference between a coverage figure and a 40% undercount of plenary
        // activity.
        eyebrow={`Orden del día extraído de ${agendas.stats.sessionsWithAgenda ?? agendas.stats.plenosFetched} de ${agendas.stats.sessionsTotal ?? '—'} sesiones · ${agendas.stats.agendaItemsTotal} puntos`}
        title="Departamentos con más puntos en el orden del día"
        right={
          <Link
            to="/departamentos"
            style={{ fontSize: 'var(--fs-meta)', color: 'var(--civic)', textDecoration: 'none' }}
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
              fontSize: 'var(--fs-micro)',
              padding: '3px 8px',
              background: 'var(--civic-soft)',
              color: 'var(--civic)',
              borderRadius: 'var(--r-input)',
              letterSpacing: '.05em',
              textDecoration: 'none',
            }}
          >
            {deptName(d)}
            <span style={{ marginLeft: 5, color: 'var(--ink50)' }}>· {d.count}</span>
          </Link>
        ))}
      </div>
    </Card>
  )
}

// `title` y `aria-label` porque dos de estas marcas son un GLIFO SUELTO.
//
// «18 puntos» y «5 hallazgos» se explican solos; «7 ✓» no. La revisión de
// superficies lo leyó como «votaciones registradas» —lo son sólo 7 sesiones de
// 61— cuando en realidad cuenta declaraciones verificadas. Da igual cuál de las
// dos lecturas: un contador sin rótulo, en fila con otros que sí lo llevan,
// invita a suponer, y aquí suponer sale caro.
function Count({ n, label, tone, titulo }) {
  if (!n) return null
  return (
    <span
      className="mono"
      style={{ fontSize: 'var(--fs-micro)', color: tone, marginLeft: 8 }}
      title={titulo ? `${n} ${titulo}` : undefined}
      aria-label={titulo ? `${n} ${titulo}` : undefined}
    >
      {n} {label}
    </span>
  )
}

/**
 * Qué significan las marcas de cada fila, dicho UNA vez y para quien mira.
 *
 * `Count` ya lleva `title` y `aria-label`, pero los dos sólo alcanzan a quien
 * pasa el ratón o usa lector de pantalla. Un lector que simplemente mira ve
 * «18 puntos · 9 ✓ · 5 hallazgos», dos de los tres rotulados y uno no, y
 * supone. La revisión de superficies lo leyó como «votaciones registradas» en
 * dos barridos seguidos, que es exactamente la suposición que invita.
 *
 * Y de paso dice lo que el revisor echaba en falta y la página no contaba en
 * ningún sitio: cuántas sesiones tienen votaciones transcritas. Son muchas
 * menos que las que llevan ✓, y que no las haya NO significa que no se votara.
 *
 * Las cifras salen del snapshot, no de una frase escrita a mano: es lo único
 * que impide que este párrafo se quede rancio cuando los datos se muevan.
 */
function Leyenda({ total, conVerificada, conVotos }) {
  if (!total) return null
  return (
    <div
      style={{
        fontSize: 'var(--fs-aux)',
        color: 'var(--ink70)',
        lineHeight: 1.5,
        margin: '0 0 8px',
        paddingLeft: 10,
        borderLeft: '2px solid var(--border2)',
      }}
    >
      <span className="mono" style={{ color: 'var(--ok-ink)' }}>
        ✓
      </span>{' '}
      son <strong style={{ color: 'var(--ink)' }}>declaraciones verificadas</strong> contra los
      datos abiertos, y{' '}
      <span className="mono" style={{ color: 'var(--crit-ink)' }}>
        ✗
      </span>{' '}
      las contradichas — no votos. Llevan ✓ {conVerificada} de las {total} sesiones.
      {typeof conVotos === 'number' && (
        <>
          {' '}
          Con <strong style={{ color: 'var(--ink)' }}>votaciones transcritas</strong> hay {conVotos}
          : que una sesión no las tenga no significa que no se votara, sino que aún no hemos
          transcrito el acta.
        </>
      )}
    </div>
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
      <span className="mono" style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
        {fmtDateLong(row.date)}
      </span>
      <span style={{ minWidth: 0 }}>
        <Pill tone={PLENO_TONE[row.kind] || 'ghost'} size="xs">
          {PLENO_LABEL[row.kind] || row.kind}
        </Pill>
        <Count n={row.agendaCount} label={t('plenosIndex.points')} tone="var(--ink50)" />
        <Count
          n={row.verificado}
          label="✓"
          tone="var(--ok-ink)"
          titulo={t('plenosIndex.verificadas')}
        />
        <Count
          n={row.contradicho}
          label="✗"
          tone="var(--crit-ink)"
          titulo={t('plenosIndex.contradichas')}
        />
        <Count n={row.findings} label={t('plenosIndex.findings')} tone="var(--intel-ink)" />
      </span>
      <span className="mono" style={{ fontSize: 'var(--fs-body)', color: 'var(--ink50)' }}>
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
  const { data: votesData } = usePlenoVotes()

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

  const conVerificada = useMemo(() => rows.filter((r) => r.verificado > 0).length, [rows])
  const conVotos = useMemo(
    () => (votesData ? new Set((votesData.items ?? []).map((v) => v.plenoId)).size : null),
    [votesData],
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
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {t('plenos.eyebrow')}
        </div>
        <div
          style={{
            fontSize: 'var(--fs-page)',
            fontWeight: 700,
            letterSpacing: '-.015em',
            marginTop: 2,
          }}
        >
          {t('plenos.title')}
        </div>
      </div>

      <TopDepartmentsCard agendas={agendasData} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Sesiones · {plenosData?.stats?.total ?? rows.length}
        </div>
        {plenosData?.generatedAt && <DataAsOf iso={plenosData.generatedAt} label="Plenos" />}
      </div>
      <Leyenda
        total={plenosData?.stats?.total ?? rows.length}
        conVerificada={conVerificada}
        conVotos={conVotos}
      />
      <Card>
        {loading && (
          <div style={{ padding: 12, fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>…</div>
        )}
        {rows.map((row) => (
          <SessionRow key={row.id} row={row} t={t} />
        ))}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Link
          to="/declaraciones"
          style={{ fontSize: 'var(--fs-aux)', color: 'var(--civic)', textDecoration: 'none' }}
        >
          {t('plenosIndex.crossSession')}
        </Link>
      </div>

      <ParticipaBlock />
    </div>
  )
}
