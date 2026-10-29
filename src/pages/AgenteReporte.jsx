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
import {
  ROTULO_ENMIENDA_ANTERIOR,
  ROTULO_MOTIVO_ENMENDADO,
  ROTULO_MOTIVO_ENMENDADO_EL,
  ROTULO_TEXTO_RETIRADO,
  huellaSinEtiqueta,
  rotuloTextoPuesto,
  sustitutas,
} from '../components/BitacoraCorrecciones'
import { rellena } from '../lib/formatters'
import { trozos } from '../lib/texto-negrita.js'
import { heroCvUrl } from '../lib/journalist-facts.js'
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
import { quienReplica } from '../scraper/journalist/replica'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

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

// Original and corrected texts carry the narratives' `**negrita**`; printed raw,
// the first corrections with bold (06-09-2026) showed their asterisks on the
// page — the same defect PR #104 removed from the narratives one component up.
// Inline, paragraphs joined by a space: the ledger shows a clipped window, not
// the prose. The window is cut AFTER `trozos`, on the text the reader sees: cut
// before, a bold run crossing character 200 lost its closing `**` and showed the
// opening one («devuelve **0 c», a-alberto-gimeno-bio-v2, 05-10-2026), and the
// paragraphs came out glued. Exported so the render is testable without
// mounting the page.
const VENTANA = 200
// The window starts where the two versions part. Anchored at character 0, a
// correction that replaces a whole section body to change its last sentence
// showed «retirado» and «vigente» with the same 200 characters and the change
// out of sight (three of seven signed on 2026-10-18; the first one differed at
// character 487). CONTEXTO keeps a few words of the shared text before it, cut
// at a space, and «…» says the window does not start the text.
const CONTEXTO = 60
const MARGEN = 20

function piezasVisibles(texto) {
  const piezas = []
  for (const [i, parrafo] of trozos(texto).entries()) {
    if (i > 0) piezas.push({ texto: ' ' })
    for (const t of parrafo) piezas.push(t)
  }
  return piezas
}

const plano = (texto) =>
  piezasVisibles(texto)
    .map((t) => t.negrita ?? t.texto)
    .join('')

/** Where both versions' windows start, in characters of the text the reader sees. */
export function inicioVentana(original, corregido) {
  const a = plano(original)
  const b = plano(corregido)
  let k = 0
  while (k < a.length && k < b.length && a[k] === b[k]) k += 1
  if (k + MARGEN <= VENTANA) return 0
  // Up to k the two are the same text, so one offset serves both.
  const d = k - CONTEXTO
  const espacio = a.lastIndexOf(' ', d)
  return espacio > 0 ? espacio + 1 : d
}

function Recorte({ texto, desde = 0 }) {
  const piezas = desde > 0 ? [{ texto: '…' }] : []
  let saltar = desde
  let resto = VENTANA
  for (const t of piezasVisibles(texto)) {
    if (resto <= 0) break
    let s = t.negrita ?? t.texto
    if (saltar > 0) {
      const n = Math.min(saltar, s.length)
      s = s.slice(n)
      saltar -= n
      if (!s) continue
    }
    s = s.slice(0, resto)
    resto -= s.length
    piezas.push(t.negrita !== undefined ? { negrita: s } : { texto: s })
  }
  return piezas.map((t, j) =>
    t.negrita !== undefined ? <strong key={j}>{t.negrita}</strong> : <span key={j}>{t.texto}</span>,
  )
}

export function CorrectionLog({ corrections }) {
  if (!corrections || corrections.length === 0) return null
  // Un cuerpo que otra fila volvió a corregir ya no es el del informe: la regla
  // y el rótulo son los de BitacoraCorrecciones.jsx.
  const despues = sustitutas(corrections)
  // `overflowWrap: 'anywhere'`, como en BitacoraCorrecciones.jsx: la fila de una
  // fuente añadida lleva «título · URL», y una URL no tiene dónde partirse. Sin
  // él, la biografía de Rafael Gómez medía 480 px de ancho en un teléfono.
  return (
    <Card>
      <SectionHead title="Bitácora de correcciones" />
      <ol
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          fontSize: 'var(--fs-meta)',
          overflowWrap: 'anywhere',
        }}
      >
        {corrections.map((c, i) => {
          const desde = inicioVentana(c.original, c.corrected)
          return (
            <li
              key={`${c.field}-${i}`}
              style={{
                padding: '8px 0',
                borderBottom: i < corrections.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                {c.correctedAt} · {c.editor} · {c.field}
              </div>
              <div style={{ marginTop: 4, color: 'var(--ink50)' }}>
                {/* Rotulado, no sólo tachado: un estilo no viaja en `textContent`
                  y esta ficha nombra a personas. Ver BitacoraCorrecciones.jsx.
                  Una fuente añadida no retiró nada: sin texto que tachar, no hay
                  rótulo de texto retirado. */}
                {c.original ? (
                  <>
                    <span className="mono" style={{ fontSize: 'var(--fs-micro)' }}>
                      {ROTULO_TEXTO_RETIRADO}:{' '}
                    </span>
                    <del>
                      <Recorte texto={c.original} desde={desde} />
                    </del>{' '}
                  </>
                ) : null}
                <span className="mono" style={{ fontSize: 'var(--fs-micro)' }}>
                  {rotuloTextoPuesto(despues[i])}:{' '}
                </span>
                <span style={{ color: 'var(--ink70)' }}>
                  <Recorte texto={c.corrected} desde={desde} />
                </span>
              </div>
              {/* Un motivo enmendado lo dice delante, y cada enmienda lleva su
                  fecha, su firma, su porqué y la huella del motivo que sustituyó,
                  como en /hallazgos (bloque ENMIENDA DEL MOTIVO, pleno-finding.ts). */}
              <div style={{ marginTop: 4, color: 'var(--ink50)' }}>
                {c.reasonAmendments?.length > 0
                  ? `${rellena(ROTULO_MOTIVO_ENMENDADO_EL, {
                      fecha: String(c.reasonAmendments.at(-1).amendedAt).slice(0, 10),
                    })} `
                  : ''}
                {c.reason}
              </div>
              {(c.reasonAmendments ?? []).map((a, j) => (
                <div key={j} style={{ marginTop: 2, color: 'var(--ink50)' }}>
                  <span className="mono" style={{ fontSize: 'var(--fs-micro)' }}>
                    {ROTULO_MOTIVO_ENMENDADO}: {String(a.amendedAt).slice(0, 10)} · {a.editor}
                  </span>
                  . {a.reason} {ROTULO_ENMIENDA_ANTERIOR}{' '}
                  <span className="mono">{huellaSinEtiqueta(a.previous)}</span>.
                </div>
              ))}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function ResponseBlock({ response, reportId, nombreSujeto }) {
  const formUrl = `https://github.com/datarhan/civicpulse/issues/new?labels=derecho-replica&template=journalist-report-response.yml&title=${encodeURIComponent('Réplica al informe ' + reportId)}`
  if (!response) {
    return (
      <Card>
        <SectionHead title="Derecho de réplica" />
        <p style={{ margin: 0, fontSize: 'var(--fs-aux)', color: 'var(--ink50)', lineHeight: 1.5 }}>
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
            fontSize: 'var(--fs-meta)',
            padding: '6px 12px',
            borderRadius: 'var(--r-input)',
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
      <SectionHead title={`Réplica de ${quienReplica(response, nombreSujeto)}`} />
      <blockquote
        style={{
          margin: 0,
          padding: '4px 12px',
          borderLeft: '3px solid var(--civic)',
          color: 'var(--ink)',
          fontSize: 'var(--fs-body)',
          fontWeight: 500,
          lineHeight: 1.5,
          maxWidth: '68ch',
        }}
      >
        «{response.quote}»
      </blockquote>
      <div
        className="mono"
        style={{ marginTop: 8, fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
      >
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
        <p
          style={{
            margin: 0,
            flex: 1,
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
          }}
        >
          Registro público del trabajo editorial sobre este informe: verificaciones, correcciones y
          señales en seguimiento.
        </p>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            fontSize: 'var(--fs-micro)',
            padding: '4px 10px',
            borderRadius: 'var(--r-input)',
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
                fontSize: 'var(--fs-aux)',
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
  // No el nombre a secas: ése ya es el título de su ficha en /cargos.
  // Sólo con el nombre de la asignación: `subjectName` cae al `assignmentId`
  // («a-teresa-pozuelo-bio») mientras las asignaciones cargan, y un código
  // interno no va en la pestaña.
  const nombreAsignado = assignment?.subject?.name
  useDocumentTitle(
    report && nombreAsignado
      ? assignment.kind === 'biography'
        ? `Biografía de ${nombreAsignado}`
        : nombreAsignado
      : null,
  )
  const portraitPayload = report?.sections.find((s) => s.kind === 'portrait')?.payload
  const officialsState = useOfficials()
  const party = officialsState.data?.officials?.find(
    (o) => o.slug === portraitPayload?.officialSlug,
  )?.party
  // El CV vigente del padrón, no el enlace congelado del retrato (ver heroCvUrl).
  const cvUrl = heroCvUrl({
    portraitCvUrl: portraitPayload?.cvUrl,
    officialSlug: portraitPayload?.officialSlug,
    roster: officialsState.data,
  })

  if (loading) {
    return <div style={{ padding: '40px 24px', color: 'var(--ink50)' }}>Cargando informe…</div>
  }
  if (error) {
    return (
      <div data-no-resuelta style={{ padding: '40px 24px' }}>
        <p style={{ color: 'var(--crit, #d92d20)' }}>No se pudo cargar el informe.</p>
        <p>
          <Link to="/laboratorio/agentes">← volver al índice</Link>
        </p>
      </div>
    )
  }
  if (!report) {
    return (
      <div data-no-resuelta style={{ padding: '40px 24px' }}>
        <p style={{ color: 'var(--ink70)' }}>
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
        /* minmax(0, 1fr): the implicit auto column sized itself to the hero's
           max-content (the unwrapped subtitle) and the whole page scrolled
           sideways at phone widths — 810px in a 500px window (06-09-2026). */
        .cp-agente-page { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr auto; min-height: 100vh; }
        /* Grid items default to min-width:auto (= their min-content), which let
           the ledger item grow to its table's width and overrode the table's own
           overflow-x:auto wrapper. With 0, the wrapper scrolls instead. */
        .cp-agente-page > * { min-width: 0; }
        .cp-hero-grid { grid-template-columns: auto minmax(0, 1fr); }
        @media (max-width: 640px) {
          .cp-hero-grid { grid-template-columns: minmax(0, 1fr); justify-items: start; }
        }
        .cp-agente-shell {
          display: grid;
          grid-template-columns: 200px minmax(0, 1fr) 280px;
          gap: 32px;
          max-width: 1300px;
          margin: 0 auto;
          padding: 32px 24px;
          width: 100%;
          box-sizing: border-box;
        }
        .cp-toc { position: sticky; top: 80px; align-self: start; }
        .cp-facts { position: sticky; top: 80px; align-self: start; padding: 18px; border: 1px solid var(--border); border-radius: var(--r-card); background: var(--paper); }
        .cp-main { display: grid; gap: var(--gap-block); min-width: 0; max-width: var(--reading-w); margin: 0 auto; width: 100%; }
        /* La columna de arriba es una sola pista auto implícita: crece hasta el
           min-content más ancho de sus tarjetas y las arrastra a todas. La tabla
           de declaraciones financieras pide ~290 px, y a 320 px —y con la barra
           lateral, donde esta columna baja a 277— todas las tarjetas se salían
           de la columna, hasta 67 px (28-10-2026). Su Deslizable la desplaza
           dentro de la tarjeta, y la contención de ancho deja el de la tabla
           fuera de la pista: la tarjeta da el ancho al deslizador, nunca al
           revés. Sólo se excluye el deslizador; cualquier otra tarjeta que
           crezca sigue ensanchando la pista, que es donde la ve mobile.spec.ts. */
        .cp-main .cp-desliza { contain: inline-size; }
        /* width:100% + border-box: with only margin:0 auto, a grid item does not
           stretch — it sizes to its content, and the ledger table's 720px
           min-width pushed the whole page to 810px on a phone (06-09-2026). */
        .cp-ledger { max-width: 1300px; margin: 0 auto; padding: 0 24px 48px; width: 100%; box-sizing: border-box; }
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
        cvUrl={cvUrl}
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

          <ResponseBlock
            response={report.response}
            reportId={report.id}
            nombreSujeto={assignment?.subject.name}
          />
          <CorrectionLog corrections={report.corrections} />

          {report.curatorNotes && <CuratorNotesBlock notes={report.curatorNotes} />}

          <div style={{ marginTop: 12, fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
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
