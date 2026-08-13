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

import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, ExtLink, SectionHead } from '../components/Primitives'
import { useOfficials } from '../hooks/useOfficials'
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
  // Anchor ids must mirror sectionAnchorId's occurrence counting (which
  // walks EVERY section, portrait included). Narratives get one TOC entry
  // per heading — a single collapsed «Trayectoria» hid 8 narratives from
  // navigation (2026-07-31 operator review). Other kinds dedupe by kind.
  const seen = new Set()
  const occ = new Map()
  const toc = []
  for (const s of sections) {
    const base = `sec-${s.kind}`
    const n = occ.get(s.kind) ?? 0
    occ.set(s.kind, n + 1)
    const anchor = n === 0 ? base : `${base}-${n}`
    if (s.kind === 'portrait') continue // surfaced via HeroBand
    if (s.kind === 'narrative') {
      const h = s.payload?.heading ?? 'Narrativa'
      toc.push({ id: anchor, label: h.length > 30 ? `${h.slice(0, 28).trimEnd()}…` : h })
      continue
    }
    if (seen.has(s.kind)) continue
    seen.add(s.kind)
    toc.push({ id: anchor, label: SECTION_LABEL[s.kind] ?? s.kind })
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
            <div style={{ marginTop: 4, color: 'var(--ink50)' }}>
              <s>{c.original.slice(0, 200)}</s> →{' '}
              <span style={{ color: 'var(--ink70)' }}>{c.corrected.slice(0, 200)}</span>
            </div>
            <div style={{ marginTop: 4, fontStyle: 'italic', color: 'var(--ink50)' }}>
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
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink50)', lineHeight: 1.5 }}>
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
            color: 'var(--ink70)',
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
          borderLeft: '3px solid var(--civic)',
          color: 'var(--ink)',
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 1.5,
          maxWidth: '68ch',
        }}
      >
        «{response.quote}»
      </blockquote>
      <div className="mono" style={{ marginTop: 8, fontSize: 10.5, color: 'var(--ink50)' }}>
        {response.respondedAt}
        {response.sourceUrl && (
          <ExtLink href={response.sourceUrl} style={{ marginLeft: 8, color: 'var(--ink50)' }}>
            Fuente ↗
          </ExtLink>
        )}
      </div>
    </Card>
  )
}

// The accumulated curator log is a public audit trail, but rendered raw it
// was a wall of text (2026-07-31 review). Split into dated entries by the
// editorial markers the CLIs/passes use, collapsed by default.
const NOTE_MARKER_RE =
  /(?=\b(?:RETRACTACIÓN|CORRECCIÓN|AMPLIACIÓN|REVISIÓN DE CURADURÍA|DECLARACIÓN OFICIAL|DEPURACIÓN EDITORIAL|VIGILANCIA)\b)/

function CuratorNotesBlock({ notes }) {
  const [open, setOpen] = useState(false)
  const entries = notes
    .split(NOTE_MARKER_RE)
    .map((s) => s.trim())
    .filter(Boolean)
  return (
    <Card>
      <SectionHead title="Notas de curaduría" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, flex: 1, fontSize: 12, color: 'var(--ink50)', fontStyle: 'italic' }}>
          Registro público del trabajo editorial sobre este informe: verificaciones, correcciones y
          señales en seguimiento.
        </p>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            fontSize: 11,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--ink50)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {open ? 'Ocultar' : `Ver ${entries.length} ${entries.length === 1 ? 'nota' : 'notas'}`}
        </button>
      </div>
      {open && (
        <ol
          style={{ margin: '12px 0 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}
        >
          {entries.map((e, i) => (
            <li
              key={i}
              style={{
                fontSize: 12,
                lineHeight: 1.55,
                color: 'var(--ink50)',
                paddingLeft: 10,
                borderLeft: '2px solid var(--border)',
              }}
            >
              {e}
            </li>
          ))}
        </ol>
      )}
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
  const officialsState = useOfficials()
  const party = officialsState.data?.officials?.find(
    (o) => o.slug === portraitPayload?.officialSlug,
  )?.party

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
        <p style={{ color: 'var(--ink50)' }}>
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
        party={party}
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

          {report.curatorNotes && <CuratorNotesBlock notes={report.curatorNotes} />}

          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--ink50)' }}>
            <Link to="/laboratorio/agentes" style={{ color: 'var(--ink50)' }}>
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
