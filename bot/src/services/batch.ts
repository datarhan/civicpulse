/**
 * Weekly batch registrar — the legal bridge.
 *
 * Spanish law won't let us file a queja on the citizen's behalf without
 * a REA poder. So instead we bundle N verified quejas into ONE solicitud
 * genérica that a single moderator (a vecino with Cl@ve) files at
 * sede.ribarroja.es. The moderator is the legal signer; each queja in
 * the bundle inherits that solicitud's entry number + CSV as its legal
 * handle. The 3-month clock starts from the batch asiento date.
 *
 * This module is a pure function library — no HTTP, no Telegram. The
 * command handler + the HTTP endpoint both import from here.
 */

import type { Db } from '../db/client.ts'
import {
  countApoyos,
  getQueja,
  setState,
  VERIFIED_THRESHOLD,
  type QuejaRow,
} from '../db/queries.ts'
import { routeUsingLocalOfficials } from './router.ts'

export interface BatchItem {
  queja: QuejaRow
  apoyos: number
  plazoDias: number
  baseLegal: string
  silencio: 'positivo' | 'negativo'
  area: string
  responsibleName: string | null
}

export interface Batch {
  generatedAt: string
  moderator: string
  items: BatchItem[]
  totalApoyos: number
}

export interface RegisterBatchInput {
  ids: string[]
  entry_number: string
  csv: string
  moderator_user_id: number
}

export interface RegisterBatchResult {
  registered: QuejaRow[]
  failed: Array<{ id: string; reason: string }>
}

/**
 * Pick the top N verified quejas ready to go to sede:
 *   state = apoyada_verificada
 *   ordered by apoyos desc (more votes → higher priority)
 *            · age asc  (older queja → breaks tie in favour of patience)
 */
export function selectBatch(db: Db, limit = 10): BatchItem[] {
  const rows = db
    .prepare(
      `SELECT q.*, COALESCE(a.n, 0) as apoyos_count
       FROM quejas q
       LEFT JOIN (
         SELECT queja_id, COUNT(*) as n FROM apoyos GROUP BY queja_id
       ) a ON a.queja_id = q.id
       WHERE q.state = 'apoyada_verificada'
       ORDER BY apoyos_count DESC, q.created_at ASC
       LIMIT ?`,
    )
    .all(limit) as Array<QuejaRow & { apoyos_count: number }>

  return rows.map((r) => {
    const routing = routeUsingLocalOfficials({
      title: r.title,
      detail: r.detail,
      category: r.category as never,
    })
    const plazo = routing.timeLimits.find((t) => t.kind === 'resolucion')?.days ?? 90
    return {
      queja: r,
      apoyos: r.apoyos_count,
      plazoDias: plazo,
      baseLegal:
        `${routing.legalBasis[0]?.law ?? ''} ${routing.legalBasis[0]?.article ?? ''}`.trim(),
      silencio: routing.silencio,
      area: routing.concejalia.area,
      responsibleName: routing.concejalia.responsible?.name ?? null,
    }
  })
}

export function buildBatch(db: Db, moderator: string, limit = 10): Batch {
  const items = selectBatch(db, limit)
  return {
    generatedAt: new Date().toISOString(),
    moderator,
    items,
    totalApoyos: items.reduce((s, it) => s + it.apoyos, 0),
  }
}

/** Plain-text / Markdown rendering — this is what gets pasted into the sede's solicitud-genérica form. */
export function renderBatchMarkdown(batch: Batch): string {
  const date = new Date(batch.generatedAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const lines: string[] = []
  lines.push('# SOLICITUD GENÉRICA')
  lines.push('')
  lines.push('Ante el Registro Electrónico General del')
  lines.push('**Ayuntamiento de Riba-roja de Túria**')
  lines.push('')
  lines.push(
    `Presentada por **${batch.moderator}** (vecino/a de Riba-roja de Túria), en representación de sí mismo/a como ciudadano/a y trasladando las incidencias recopiladas por la plataforma pública CivicPulse.`,
  )
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Exposición')
  lines.push('')
  lines.push(
    'Al amparo de los artículos 18 de la Ley 7/1985, reguladora de las Bases del Régimen Local, y 16, 66 y 68 de la Ley 39/2015, del Procedimiento Administrativo Común de las Administraciones Públicas, traslado al Ayuntamiento de Riba-roja de Túria las siguientes incidencias detectadas por la ciudadanía, cada una de ellas avalada por un mínimo de diez apoyos vecinales verificados a través de la plataforma CivicPulse:',
  )
  lines.push('')

  batch.items.forEach((item, i) => {
    const q = item.queja
    lines.push(`### ${i + 1}. ${q.title}`)
    lines.push('')
    lines.push(`- **Expediente CivicPulse:** \`${q.id}\``)
    lines.push(`- **Categoría:** ${q.category}`)
    lines.push(`- **Área municipal competente:** ${item.area}`)
    if (item.responsibleName) lines.push(`- **Responsable político:** ${item.responsibleName}`)
    if (q.neighborhood) lines.push(`- **Barrio:** ${q.neighborhood}`)
    lines.push(`- **Fecha de captura:** ${q.created_at}`)
    lines.push(`- **Apoyos vecinales verificados:** ${item.apoyos}`)
    lines.push(`- **Base legal aplicable:** ${item.baseLegal}`)
    lines.push(`- **Plazo máximo de resolución:** ${item.plazoDias} días naturales`)
    lines.push(`- **Silencio administrativo:** ${item.silencio}`)
    lines.push('')
    lines.push('**Detalle ciudadano (verbatim):**')
    lines.push('')
    lines.push('> ' + q.detail.replace(/\n+/g, '\n> '))
    lines.push('')
  })

  lines.push('---')
  lines.push('')
  lines.push('## Solicita')
  lines.push('')
  lines.push(
    `1. Que se tenga por presentada esta solicitud con las **${batch.items.length} incidencias** anteriores, anotándose el correspondiente asiento en el Registro Electrónico General (art. 16 LPACAP) y emitiéndose recibo acreditativo con CSV.`,
  )
  lines.push(
    '2. Que, conforme al art. 21.4 LPACAP, se notifique en el plazo de diez días hábiles el plazo máximo aplicable y los efectos del silencio administrativo para cada una de las incidencias.',
  )
  lines.push(
    '3. Que se dicte resolución expresa sobre cada incidencia en los plazos legalmente previstos (art. 21.3 LPACAP).',
  )
  lines.push(
    '4. Que, de conformidad con el art. 132 de la Ley 7/1985, la información agregada sobre el tiempo medio de resolución por concejalía se incorpore al informe anual de la Comisión Especial de Sugerencias y Reclamaciones elevado al Pleno.',
  )
  lines.push('')
  lines.push(`Riba-roja de Túria, ${date}.`)
  lines.push('')
  lines.push(`**${batch.moderator}**`)
  lines.push('(firma electrónica mediante Cl@ve / Autofirma / DNIe)')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(
    `*Documento generado automáticamente por CivicPulse a partir de quejas ciudadanas públicas con apoyo vecinal verificado. Total de apoyos vecinales que respaldan esta solicitud: ${batch.totalApoyos}.*`,
  )
  return lines.join('\n')
}

/** Minimal HTML renderer for nicer printing / sede upload. */
export function renderBatchHtml(batch: Batch): string {
  const md = renderBatchMarkdown(batch)
  // Tiny markdown → HTML (headers + paragraphs + blockquote + lists only).
  // Intentional: no markdown lib dependency. Scope is bounded.
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = md
    .split('\n')
    .map((line) => {
      if (line.startsWith('### ')) return `<h3>${escape(line.slice(4))}</h3>`
      if (line.startsWith('## ')) return `<h2>${escape(line.slice(3))}</h2>`
      if (line.startsWith('# ')) return `<h1>${escape(line.slice(2))}</h1>`
      if (line.startsWith('> ')) return `<blockquote>${escape(line.slice(2))}</blockquote>`
      if (line.startsWith('- ')) return `<li>${escape(line.slice(2))}</li>`
      if (line.match(/^\d+\. /)) return `<li>${escape(line.replace(/^\d+\. /, ''))}</li>`
      if (line === '---') return '<hr/>'
      if (line === '') return ''
      return `<p>${escape(line)}</p>`
    })
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Solicitud CivicPulse · Riba-roja de Túria</title>
<style>
  body { font-family: Georgia, serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; color: #111; line-height: 1.55; }
  h1 { font-size: 22px; letter-spacing: -.01em; }
  h2 { font-size: 17px; margin-top: 1.8rem; border-bottom: 2px solid #111; padding-bottom: .3rem; }
  h3 { font-size: 14.5px; margin-top: 1.5rem; }
  blockquote { border-left: 3px solid #999; margin: .5rem 0; padding-left: .8rem; color: #444; font-style: italic; }
  code { background: #f4f4f0; padding: 1px 4px; border-radius: 3px; font-family: 'DM Mono', ui-monospace, monospace; font-size: 12px; }
  li { margin: .2rem 0; }
  hr { border: 0; border-top: 1px dashed #bbb; margin: 1.5rem 0; }
  em { color: #555; }
  @media print { body { max-width: none; } }
</style>
</head>
<body>
${html}
</body>
</html>`
}

/**
 * Commit a batch registration — the moderator has signed at sede.ribarroja.es
 * and returns with an entry number + CSV. Every queja in the batch gets the
 * same (entry_number, csv) and transitions to state='registrada'.
 */
export function registerBatch(db: Db, input: RegisterBatchInput): RegisterBatchResult {
  const registered: QuejaRow[] = []
  const failed: Array<{ id: string; reason: string }> = []

  const tx = db.transaction(() => {
    for (const id of input.ids) {
      const q = getQueja(db, id)
      if (!q) {
        failed.push({ id, reason: 'not found' })
        continue
      }
      if (q.state !== 'apoyada_verificada' && q.state !== 'capturada') {
        failed.push({ id, reason: `state is ${q.state}, expected apoyada_verificada` })
        continue
      }
      if (q.state === 'capturada' && countApoyos(db, id) < VERIFIED_THRESHOLD) {
        failed.push({ id, reason: 'insufficient apoyos' })
        continue
      }
      const updated = setState(db, id, 'registrada', {
        entry_number: input.entry_number,
        csv: input.csv,
      })
      if (updated) registered.push(updated)
    }
    db.prepare(`INSERT INTO events (queja_id, kind, payload) VALUES (?, 'batch_registered', ?)`)
    // Log the batch at each queja for audit
    for (const r of registered) {
      db.prepare(
        `INSERT INTO events (queja_id, kind, payload) VALUES (?, 'batch_registered', ?)`,
      ).run(
        r.id,
        JSON.stringify({
          batch_ids: input.ids,
          entry_number: input.entry_number,
          csv: input.csv,
          moderator_user_id: input.moderator_user_id,
        }),
      )
    }
  })
  tx()

  return { registered, failed }
}
