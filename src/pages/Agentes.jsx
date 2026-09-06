// /laboratorio/agentes — index page listing every published journalist report.
// The path is deliberately plural so we can host multiple agent personas
// later (investigator, biographer, fact-checker). Today it lists every
// curator-promoted journalist report and exposes pending/failed assignments.

import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead } from '../components/Primitives'
import {
  useJournalistAssignments,
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_STATUS_TONE,
} from '../hooks/useJournalistAssignments'
import {
  useJournalistReports,
  LEGAL_SENSITIVITY_LABEL,
  LEGAL_SENSITIVITY_TONE,
} from '../hooks/useJournalistReports'

export default function Agentes() {
  const assignments = useJournalistAssignments()
  const reports = useJournalistReports()
  const loading = assignments.loading || reports.loading
  const reportsByAssignment = new Map((reports.data?.items ?? []).map((r) => [r.assignmentId, r]))
  // Archived = superseded/unpublished (report removed from the published
  // index). Hidden here; git history is the audit trail.
  const visibleAssignments = (assignments.data?.items ?? []).filter((a) => a.status !== 'archived')

  return (
    <div style={{ padding: '24px 0', display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 'var(--fs-card)', color: 'var(--ink)' }}>
          Periodistas IA
        </h1>
        <p style={{ margin: '6px 0 0 0', fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
          Cada informe nace de una asignación que un agente automático investiga, redacta y
          autoverifica. La curaduría humana revisa antes de publicar. Cada fuente citada conserva su
          extracto literal y, cuando existe, un enlace a su copia en Wayback.
        </p>
      </header>

      <Card>
        <SectionHead title="Asignaciones" />
        {loading ? (
          <div style={{ color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>Cargando…</div>
        ) : visibleAssignments.length === 0 ? (
          <div style={{ color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>
            Aún no hay asignaciones. Un curador puede crear la primera con{' '}
            <code>npm run journalist:assign</code>.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {visibleAssignments.map((a) => {
              const report = reportsByAssignment.get(a.id)
              return (
                <li
                  key={a.id}
                  style={{
                    padding: '14px 0',
                    borderBottom: '1px solid var(--border)',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {report ? (
                      <Link
                        to={`/laboratorio/agentes/${a.id}`}
                        style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--ink)' }}
                      >
                        {a.subject.name}
                      </Link>
                    ) : (
                      <span
                        style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--ink)' }}
                      >
                        {a.subject.name}
                      </span>
                    )}
                    <Pill tone={ASSIGNMENT_STATUS_TONE[a.status] || 'ghost'}>
                      {ASSIGNMENT_STATUS_LABEL[a.status] || a.status}
                    </Pill>
                    <span
                      className="mono"
                      style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                    >
                      {a.kind}
                    </span>
                    {report && report.legalSensitivity !== 'low' && (
                      <Pill tone={LEGAL_SENSITIVITY_TONE[report.legalSensitivity] || 'ghost'}>
                        {LEGAL_SENSITIVITY_LABEL[report.legalSensitivity] ||
                          report.legalSensitivity}
                      </Pill>
                    )}
                  </div>
                  <div
                    style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', lineHeight: 1.5 }}
                  >
                    {a.brief}
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                  >
                    creada {a.createdAt.slice(0, 10)}
                    {a.lastRunAt && <span> · última ejecución {a.lastRunAt.slice(0, 10)}</span>}
                    {report && (
                      <span>
                        {' '}
                        · {report.sections.length} secciones · {report.sources.length} fuentes
                      </span>
                    )}
                  </div>
                  {a.lastErrorMsg && (
                    <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--crit, #d92d20)' }}>
                      {a.lastErrorMsg}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHead title="Cómo funciona" />
        <ol
          style={{
            margin: 0,
            paddingLeft: 18,
            color: 'var(--ink70)',
            fontSize: 'var(--fs-aux)',
            lineHeight: 1.6,
          }}
        >
          <li>Un curador crea una asignación con un brief en lenguaje natural.</li>
          <li>
            El agente planifica preguntas, las contesta consultando datos locales y fuentes
            externas.
          </li>
          <li>Sintetiza un borrador con secciones, citas y un grafo de relaciones.</li>
          <li>Se autoverifica y eleva la sensibilidad legal cuando detecta tokens judiciales.</li>
          <li>El curador revisa el borrador y lo publica (o lo descarta) desde el dashboard.</li>
          <li>Cada informe publicado acepta derecho de réplica por formulario público.</li>
        </ol>
      </Card>
    </div>
  )
}
