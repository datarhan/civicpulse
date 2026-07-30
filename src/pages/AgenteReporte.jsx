// /laboratorio/agentes/:assignmentId — editorial-longform dossier page.
//
// Three-column grid (mobile collapses to one column):
//
//   ┌────────────────── HERO BAND ─────────────────────┐
//   │  Photo · name · party · quick facts · actions    │
//   ├──────────┬──────────────────────┬────────────────┤
//   │ STICKY   │     MAIN CONTENT     │ STICKY FACTS   │
//   │ TOC      │  (sections grid)     │ SIDEBAR        │
//   ├──────────┴──────────────────────┴────────────────┤
//   │              SOURCE LEDGER (table)               │
//   └──────────────────────────────────────────────────┘

import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, ExtLink, SectionHead } from '../components/Primitives'
import {
  FactsSidebar,
  HeroBand,
  LegalSensitivityBadge,
  ReportSectionRenderer,
  SOURCE_INDEX,
  SourceLedger,
  StickyToc,
} from '../components/journalist'
import { useJournalistAssignments } from '../hooks/useJournalistAssignments'
import { useJournalistReportById } from '../hooks/useJournalistReports'

const SECTION_LABEL = {
  identity: 'Identidad',
  narrative: 'Trayectoria',
  education: 'Formación',
  'career-political': 'Carrera política',
  'career-professional': 'Carrera profesional',
  'legal-record': 'Procesos judiciales',
  financial: 'Declaraciones financieras',
  'online-presence': 'Presencia online',
  awards: 'Reconocimientos',
  publications: 'Publicaciones',
  timeline: 'Cronología',
  relationships: 'Relaciones',
  'press-sparkline': 'Cobertura de prensa',
  'promise-board': 'Promesas',
  'quote-card': 'Citas literales',
  'gaps-detected': 'Lagunas detectadas',
}

function sectionsToToc(sections) {
  const seen = new Set()
  const toc = []
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]
    if (s.kind === 'portrait') continue // surfaced via HeroBand
    if (seen.has(s.kind)) continue
    seen.add(s.kind)
    toc.push({ id: `sec-${s.kind}`, label: SECTION_LABEL[s.kind] ?? s.kind })
  }
  return toc
}

function sectionAnchorId(section, alreadySeen) {
  const base = `sec-${section.kind}`
  const occurrence = alreadySeen.get(section.kind) ?? 0
  alreadySeen.set(section.kind, occurrence + 1)
  return occurrence === 0 ? base : `${base}-${occurrence}`
}

function CorrectionLog({ corrections }) {
  if (!corrections || corrections.length === 0) return null
  return (
    <Card>
      <SectionHead title="Bitácora de correcciones" />
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12.5 }}>
        {corrections.map((c, i) => (
          <li
            key={`${c.field}-${i}`}
            style={{
              padding: '8px 0',
              borderBottom: i < corrections.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
              {c.correctedAt} · {c.editor} · {c.field}
            </div>
            <div style={{ marginTop: 4, color: 'var(--ink60)' }}>
              <s>{c.original.slice(0, 200)}</s> →{' '}
              <span style={{ color: 'var(--ink80)' }}>{c.corrected.slice(0, 200)}</span>
            </div>
            <div style={{ marginTop: 4, fontStyle: 'italic', color: 'var(--ink60)' }}>
              {c.reason}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function ResponseBlock({ response, reportId }) {
  const formUrl = `https://github.com/datarhan/civicpulse/issues/new?labels=derecho-replica&template=journalist-report-response.yml&title=${encodeURIComponent('Réplica al informe ' + reportId)}`
  if (!response) {
    return (
      <Card>
        <SectionHead title="Derecho de réplica" />
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink60)', lineHeight: 1.5 }}>
          ¿Es persona o grupo aludido por este informe? Puede ejercer derecho de réplica enviando
          una cita literal por el formulario público; se publica sin edición editorial.
        </p>
        <a
          href={formUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            marginTop: 10,
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            color: 'var(--ink80)',
          }}
        >
          Responder como persona o grupo afectado →
        </a>
      </Card>
    )
  }
  return (
    <Card>
      <SectionHead title={`Réplica de ${response.from}`} />
      <blockquote
        style={{
          margin: 0,
          padding: '4px 12px',
          borderLeft: '3px solid var(--ok)',
          color: 'var(--ink)',
          fontStyle: 'italic',
        }}
      >
        “{response.quote}”
      </blockquote>
      <div className="mono" style={{ marginTop: 8, fontSize: 10.5, color: 'var(--ink50)' }}>
        {response.respondedAt}
        {response.sourceUrl && (
          <ExtLink href={response.sourceUrl} style={{ marginLeft: 8, color: 'var(--ink60)' }}>
            Fuente ↗
          </ExtLink>
        )}
      </div>
    </Card>
  )
}

export default function AgenteReporte() {
  const params = useParams()
  const id = params.assignmentId ?? ''
  const { loading, error, report } = useJournalistReportById(id)
  const assignmentsState = useJournalistAssignments()
  const assignment = (assignmentsState.data?.items ?? []).find(
    (a) => a.id === id || a.id === report?.assignmentId,
  )

  const sourceMap = useMemo(() => (report ? SOURCE_INDEX(report.sources) : new Map()), [report])
  const tocItems = useMemo(() => (report ? sectionsToToc(report.sections) : []), [report])
  const subjectName = assignment?.subject.name ?? report?.assignmentId ?? ''
  const portraitPayload = report?.sections.find((s) => s.kind === 'portrait')?.payload

  if (loading) {
    return <div style={{ padding: '40px 24px', color: 'var(--ink50)' }}>Cargando informe…</div>
  }
  if (error) {
    return (
      <div style={{ padding: '40px 24px' }}>
        <p style={{ color: 'var(--crit, #d92d20)' }}>No se pudo cargar el informe.</p>
        <p>
          <Link to="/laboratorio/agentes">← volver al índice</Link>
        </p>
      </div>
    )
  }
  if (!report) {
    return (
      <div style={{ padding: '40px 24px' }}>
        <p style={{ color: 'var(--ink60)' }}>
          No hay informe publicado para esta asignación todavía.
        </p>
        <p>
          <Link to="/laboratorio/agentes">← volver al índice</Link>
        </p>
      </div>
    )
  }

  const soulDownloadUrl = assignment?.subject.slug
    ? `/data/souls/${assignment.subject.slug}.md`
    : undefined

  // Assign anchor ids to every section as we render so the StickyToc's
  // scroll-spy IntersectionObserver can latch onto them.
  const occurrence = new Map()
  const renderedSections = report.sections.map((s) => ({
    section: s,
    anchorId: sectionAnchorId(s, occurrence),
  }))

  return (
    <div className="cp-agente-page">
      <style>{`
        .cp-agente-page { display: grid; grid-template-rows: auto 1fr auto; min-height: 100vh; }
        .cp-agente-shell {
          display: grid;
          grid-template-columns: 200px minmax(0, 1fr) 280px;
          gap: 32px;
          max-width: 1300px;
          margin: 0 auto;
          padding: 32px 24px;
        }
        .cp-toc { position: sticky; top: 80px; align-self: start; }
        .cp-facts { position: sticky; top: 80px; align-self: start; padding: 18px; border: 1px solid var(--border); border-radius: 10px; background: var(--paper); }
        .cp-main { display: grid; gap: var(--gap-block); min-width: 0; max-width: var(--reading-w); margin: 0 auto; width: 100%; }
        .cp-ledger { max-width: 1300px; margin: 0 auto; padding: 0 24px 48px; }
        @media (max-width: 1100px) {
          .cp-agente-shell { grid-template-columns: minmax(0, 1fr) 240px; gap: 24px; }
          .cp-toc { display: none; }
        }
        @media (max-width: 820px) {
          .cp-agente-shell { grid-template-columns: 1fr; gap: 20px; padding: 20px 16px; }
          .cp-facts { position: static; padding: 16px; }
          .cp-main { max-width: 100%; }
        }
      `}</style>

      <HeroBand
        subjectName={subjectName}
        portraitPayload={portraitPayload}
        report={report}
        soulDownloadUrl={soulDownloadUrl}
      />

      <div className="cp-agente-shell">
        <StickyToc items={tocItems} />

        <main className="cp-main">
          <LegalSensitivityBadge level={report.legalSensitivity} warnings={report.warnings} />

          {renderedSections.map(({ section, anchorId }, i) => (
            <section key={`${section.kind}-${i}`} id={anchorId} style={{ scrollMarginTop: 80 }}>
              <ReportSectionRenderer
                section={section}
                sourceMap={sourceMap}
                subjectName={subjectName}
                firstOfKind={anchorId === `sec-${section.kind}`}
              />
            </section>
          ))}

          <ResponseBlock response={report.response} reportId={report.id} />
          <CorrectionLog corrections={report.corrections} />

          {report.curatorNotes && (
            <Card>
              <SectionHead title="Notas de curaduría" />
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: 'var(--ink60)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {report.curatorNotes}
              </p>
            </Card>
          )}

          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--ink50)' }}>
            <Link to="/laboratorio/agentes" style={{ color: 'var(--ink60)' }}>
              ← volver al índice
            </Link>
            <span style={{ marginLeft: 12 }}>
              · generado {report.generatedAt.slice(0, 10)} · agente {report.agentVersion} ·
              publicado {report.promotedAt.slice(0, 10)}
            </span>
          </div>
        </main>

        <FactsSidebar report={report} subjectName={subjectName} assignment={assignment} />
      </div>

      <div className="cp-ledger">
        <SourceLedger sources={report.sources} />
      </div>
    </div>
  )
}
