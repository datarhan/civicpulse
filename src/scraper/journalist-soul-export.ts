/**
 * soul.md exporter — deterministic JournalistReport → markdown.
 *
 * Maps a curator-promoted JournalistReport into the canonical "soul"
 * dossier format: a portable, diff-friendly markdown file with
 * footnote-cited sources. Same input → same output (sources are
 * auto-numbered in order of first reference; empty sections are
 * omitted rather than padded).
 *
 * Pure function — no disk I/O. The CLI at
 * `scripts/journalist-export-soul.ts` does the read/write and decides
 * the output path (default `public/data/souls/<subject.slug>.md`).
 */

import type { JournalistReport, ReportSection, SourceCitation } from './journalist'

export interface SoulExportOptions {
  /** Display name of the subject (usually the assignment's subject.name). */
  subjectName: string
  /** kebab-case slug for the file path (caller decides). */
  subjectSlug?: string
}

const LEGAL_LABEL: Record<string, string> = {
  low: 'baja',
  medium: 'media',
  high: 'alta',
}

const METRIC_LABEL: Record<string, string> = {
  salary: 'Salario público',
  'declared-assets': 'Bienes declarados',
  business: 'Actividad empresarial',
}

const RELATIONSHIP_NODE_LABEL: Record<string, string> = {
  person: 'persona',
  party: 'partido',
  entity: 'entidad',
}

export function exportSoulMarkdown(report: JournalistReport, opts: SoulExportOptions): string {
  // ─── Footnote engine ────────────────────────────────────────────────────
  // Auto-number sources in order of first reference. Render once; if a
  // citation never gets referenced inline, omit it from the footer (the
  // raw source ledger lives in the JSON; the markdown is the digest).
  const sourceById = new Map(report.sources.map((s) => [s.id, s]))
  const footnoteOrder: string[] = []
  const footnoteIndex = new Map<string, number>()
  const cite = (ids: ReadonlyArray<string> | undefined): string => {
    if (!ids || ids.length === 0) return ''
    const nums: number[] = []
    for (const id of ids) {
      if (!sourceById.has(id)) continue
      let n = footnoteIndex.get(id)
      if (n === undefined) {
        footnoteOrder.push(id)
        n = footnoteOrder.length
        footnoteIndex.set(id, n)
      }
      nums.push(n)
    }
    if (nums.length === 0) return ''
    return ' ' + nums.map((n) => `[^${n}]`).join('')
  }

  const out: string[] = []

  // ─── Header ─────────────────────────────────────────────────────────────
  const generated = report.generatedAt.slice(0, 10)
  const promoted = report.promotedAt.slice(0, 10)
  out.push(`# ${opts.subjectName} — vida pública`)
  out.push(`> Documento generado por el agente periodista de CivicPulse (${report.agentVersion}).`)
  out.push(
    `> Generado: ${generated} · Publicado: ${promoted} · Sensibilidad legal: **${LEGAL_LABEL[report.legalSensitivity] ?? report.legalSensitivity}**`,
  )
  out.push('')

  if (report.legalSensitivity === 'high') {
    out.push('> ⚠ **Sensibilidad legal alta.** Este informe trata sobre figuras vivas o asuntos')
    out.push('> legalmente sensibles. Las afirmaciones se publican con derecho de réplica abierto.')
    out.push('')
  }

  // ─── Section dispatch ───────────────────────────────────────────────────
  for (const section of report.sections) {
    const block = renderSection(section, cite, report.sources)
    if (block && block.trim().length > 0) {
      out.push(block)
      out.push('')
    }
  }

  // ─── Réplica + correcciones + curator notes ────────────────────────────
  if (report.response) {
    out.push('## Réplica registrada')
    out.push(`**${report.response.from}** (${report.response.respondedAt}):`)
    out.push('')
    out.push(`> ${report.response.quote.split('\n').join('\n> ')}`)
    if (report.response.sourceUrl) {
      out.push('')
      out.push(`Fuente: <${report.response.sourceUrl}>`)
    }
    out.push('')
  }
  if (report.corrections.length > 0) {
    out.push('## Bitácora de correcciones')
    for (const c of report.corrections) {
      out.push(`- **${c.correctedAt}** · ${c.editor} · \`${c.field}\``)
      out.push(`  - antes: «${truncate(c.original, 240)}»`)
      out.push(`  - después: «${truncate(c.corrected, 240)}»`)
      out.push(`  - motivo: ${c.reason}`)
    }
    out.push('')
  }
  if (report.curatorNotes) {
    out.push('## Notas de curaduría')
    out.push(report.curatorNotes)
    out.push('')
  }
  if (report.warnings.length > 0) {
    out.push('## Advertencias del agente')
    for (const w of report.warnings) out.push(`- ${w}`)
    out.push('')
  }

  // ─── Footnotes ─────────────────────────────────────────────────────────
  if (footnoteOrder.length > 0) {
    out.push('## Fuentes consultadas')
    for (let i = 0; i < footnoteOrder.length; i++) {
      const src = sourceById.get(footnoteOrder[i])
      if (!src) continue
      out.push(formatFootnote(i + 1, src))
    }
    out.push('')
  }

  // ─── Footer ────────────────────────────────────────────────────────────
  out.push('---')
  out.push(
    `> _Asignación: \`${report.assignmentId}\` · Informe: \`${report.id}\` · ${report.sources.length} fuente${report.sources.length === 1 ? '' : 's'} consultadas en total. Para correcciones o derecho de réplica, abrir una issue en github.com/datarhan/civicpulse._`,
  )

  // Join with explicit \n so the markdown is deterministic across
  // platforms (Windows line endings would otherwise drift through git).
  return out.join('\n') + '\n'
}

// ───────────────────────────────────────────────────────────────────────────

type CiteFn = (ids: ReadonlyArray<string> | undefined) => string

function renderSection(section: ReportSection, cite: CiteFn, _sources: SourceCitation[]): string {
  switch (section.kind) {
    case 'portrait': {
      const p = section.payload
      const lines = ['## Cargo']
      lines.push(`- **Slug oficial:** \`${p.officialSlug}\``)
      if (p.portfolios.length > 0) lines.push(`- **Portafolios:** ${p.portfolios.join(', ')}`)
      if (p.cvUrl) lines.push(`- **CV oficial:** <${p.cvUrl}>`)
      return lines.join('\n')
    }
    case 'identity': {
      const p = section.payload
      const lines = ['## Identidad']
      const cId = cite(p.sourceIds)
      if (p.dateOfBirth) lines.push(`- **Fecha de nacimiento:** ${p.dateOfBirth}${cId}`)
      if (p.birthplace) lines.push(`- **Lugar de nacimiento:** ${p.birthplace}${cId}`)
      if (p.residence) lines.push(`- **Residencia:** ${p.residence}${cId}`)
      if (p.nationality) lines.push(`- **Nacionalidad:** ${p.nationality}${cId}`)
      if (p.family && p.family.length > 0) {
        lines.push('- **Familia:**')
        for (const f of p.family) {
          const namePart = f.name ? `: ${f.name}` : ''
          lines.push(`  - ${f.relation}${namePart}${cite(f.sourceIds)}`)
        }
      }
      return lines.length === 1 ? '' : lines.join('\n')
    }
    case 'education': {
      const items = section.payload.items
      if (items.length === 0) return ''
      const lines = ['## Formación']
      for (let i = 0; i < items.length; i++) {
        const e = items[i]
        const span = formatYearSpan(e.startYear, e.endYear)
        const inst = e.institution ? ` — ${e.institution}` : ''
        lines.push(`${i + 1}. ${e.degree}${inst}${span ? ` (${span})` : ''}${cite(e.sourceIds)}`)
      }
      return lines.join('\n')
    }
    case 'career-political': {
      const items = section.payload.items
      if (items.length === 0) return ''
      const lines = ['## Trayectoria política']
      for (const c of items) {
        const span = formatYearSpan(c.startYear, c.endYear ?? undefined, 'presente')
        lines.push(`- **${span}** — ${c.role} en ${c.org}${cite(c.sourceIds)}`)
      }
      return lines.join('\n')
    }
    case 'career-professional': {
      const items = section.payload.items
      if (items.length === 0) return ''
      const lines = ['## Trayectoria profesional']
      for (const c of items) {
        const span = formatYearSpan(c.startYear, c.endYear)
        const spanStr = span ? `**${span}** — ` : ''
        lines.push(`- ${spanStr}${c.role} en ${c.org}${cite(c.sourceIds)}`)
      }
      return lines.join('\n')
    }
    case 'legal-record': {
      const items = section.payload.items
      if (items.length === 0) return ''
      const lines = ['## Procesos judiciales']
      lines.push('> ⚠ Esta sección activa la sensibilidad legal alta.')
      lines.push('')
      for (const l of items) {
        const dateStr = l.date ? ` · ${l.date}` : ''
        const outcomeStr = l.outcome ? ` · **Resultado:** ${l.outcome}` : ''
        lines.push(`- **${l.caseRef}** — ${l.court}${dateStr}${outcomeStr}${cite(l.sourceIds)}`)
        lines.push(`  - Verbatim del acta: «${truncate(l.verbatimRef, 600)}»`)
      }
      return lines.join('\n')
    }
    case 'financial': {
      const items = section.payload.items
      if (items.length === 0) return ''
      const lines = ['## Declaraciones financieras']
      for (const f of items) {
        const metricLbl = METRIC_LABEL[f.metric] ?? f.metric
        const amount =
          f.amountEuros !== undefined ? ` · ${f.amountEuros.toLocaleString('es-ES')} €` : ''
        lines.push(`- **${f.year}** — ${metricLbl}${amount}${cite(f.sourceIds)}`)
        lines.push(`  - ${f.description}`)
      }
      return lines.join('\n')
    }
    case 'online-presence': {
      const accounts = section.payload.accounts
      if (accounts.length === 0) return ''
      const lines = ['## Presencia online']
      for (const a of accounts) {
        const verified = a.verifiedAt ? ` _(verificado ${a.verifiedAt})_` : ''
        lines.push(`- **${a.platform}** — [${a.handle}](${a.url})${verified}${cite(a.sourceIds)}`)
      }
      return lines.join('\n')
    }
    case 'awards': {
      const items = section.payload.items
      if (items.length === 0) return ''
      const lines = ['## Reconocimientos']
      for (const a of items) {
        const yearStr = a.year ? `**${a.year}** — ` : ''
        lines.push(`- ${yearStr}${a.name} _(${a.awardedBy})_${cite(a.sourceIds)}`)
      }
      return lines.join('\n')
    }
    case 'publications': {
      const items = section.payload.items
      if (items.length === 0) return ''
      const lines = ['## Publicaciones']
      for (const p of items) {
        const yearStr = p.year ? `**${p.year}** — ` : ''
        const venueLink = p.url ? `[${p.venue}](${p.url})` : p.venue
        lines.push(`- ${yearStr}«${p.title}» — ${venueLink}${cite(p.sourceIds)}`)
      }
      return lines.join('\n')
    }
    case 'gaps-detected': {
      const missing = section.payload.missing
      if (missing.length === 0) return ''
      const lines = ['## Lagunas detectadas']
      for (const g of missing) lines.push(`- **${g.field}:** ${g.reason}`)
      return lines.join('\n')
    }
    case 'narrative': {
      const p = section.payload
      const lines = [`## ${p.heading}`]
      lines.push(`${p.bodyMarkdown}${cite(p.sourceIds)}`)
      return lines.join('\n')
    }
    case 'timeline': {
      const events = section.payload.events
      if (events.length === 0) return ''
      const lines = ['## Cronología']
      const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date))
      for (const e of sorted) {
        lines.push(`- **${e.date}** — ${e.label}${cite(e.sourceIds)}`)
      }
      return lines.join('\n')
    }
    case 'relationships': {
      const { nodes, edges } = section.payload
      if (nodes.length === 0) return ''
      const lines = ['## Relaciones']
      const subjectNode = nodes[0]
      const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id
      const kindOf = (id: string) =>
        RELATIONSHIP_NODE_LABEL[nodes.find((n) => n.id === id)?.kind ?? ''] ?? ''
      for (const e of edges) {
        const fromLabel = labelOf(e.from)
        const toLabel = labelOf(e.to)
        const toKind = kindOf(e.to)
        const fromIsSubject = e.from === subjectNode.id
        const display = fromIsSubject
          ? `${e.relation} → **${toLabel}**${toKind ? ` _(${toKind})_` : ''}`
          : `**${fromLabel}** — ${e.relation} → **${toLabel}**`
        lines.push(`- ${display}${cite(e.sourceIds)}`)
      }
      return lines.join('\n')
    }
    case 'press-sparkline': {
      const { points, headlines } = section.payload
      if (points.length === 0 && headlines.length === 0) return ''
      const lines = ['## Cobertura de prensa']
      if (points.length > 0) {
        const total = points.reduce((acc, p) => acc + p.count, 0)
        const span =
          points.length > 0
            ? `${points[0].date.slice(0, 4)}–${points[points.length - 1].date.slice(0, 4)}`
            : ''
        lines.push(
          `_${total} mención${total === 1 ? '' : 'es'} registrada${total === 1 ? '' : 's'} (${span})._`,
        )
        lines.push('')
      }
      for (const h of headlines.slice(0, 20)) {
        lines.push(`- **${h.date}** — [${h.title}](${h.url})`)
      }
      return lines.join('\n')
    }
    case 'promise-board': {
      const ids = section.payload.promiseIds
      if (ids.length === 0) return ''
      const lines = ['## Promesas seguidas']
      for (const id of ids) lines.push(`- \`${id}\``)
      return lines.join('\n')
    }
    case 'quote-card': {
      const q = section.payload
      const dateStr = q.date ? ` _(${q.date})_` : ''
      const lines = ['## Cita literal']
      lines.push(`> «${q.verbatim}»`)
      lines.push(`> — **${q.attributedTo}**${dateStr}${cite([q.sourceId])}`)
      return lines.join('\n')
    }
  }
  // Unknown kinds are silently skipped (future-proofing — the SPA can
  // render new kinds before the exporter learns about them).
  return ''
}

function formatYearSpan(start?: number, end?: number, openLabel = ''): string {
  if (start === undefined && end === undefined) return ''
  if (start !== undefined && end === undefined)
    return openLabel ? `${start}–${openLabel}` : `${start}`
  if (start === undefined && end !== undefined) return `?–${end}`
  return `${start}–${end}`
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

function formatFootnote(n: number, src: SourceCitation): string {
  const parts: string[] = []
  parts.push(src.title.trim())
  if (src.publisher) parts.push(src.publisher)
  if (src.publishedAt) parts.push(`publicado ${src.publishedAt}`)
  if (src.retrievedAt) parts.push(`recuperado ${src.retrievedAt.slice(0, 10)}`)
  if (src.url) parts.push(`<${src.url}>`)
  if (src.archiveUrl) parts.push(`Wayback: <${src.archiveUrl}>`)
  if (src.localPath) parts.push(`local: \`${src.localPath}\``)
  const headline = parts.join(' · ')
  const excerpt = src.excerpt
    ? `\n    «${truncate(src.excerpt.replace(/\s+/g, ' ').trim(), 280)}»`
    : ''
  return `[^${n}]: ${headline}${excerpt}`
}
