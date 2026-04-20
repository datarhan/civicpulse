/**
 * Síndic de Greuges de la Comunitat Valenciana — escalation template.
 *
 * Generates a pre-filled queja al Síndic for a single queja that has
 * hit silencio negativo. The Síndic has statutory authority under Ley
 * 11/1988 to investigate administrations and publish resoluciones
 * naming the non-cooperative entity — i.e. the sanction is theirs,
 * not ours.
 *
 * Pure function. Same pattern as services/batch.ts.
 */

import type { QuejaRow } from '../db/queries.ts'
import type { QuejaRouting } from '../../../src/scraper/queja-router.ts'

const SINDIC_PORTAL = 'https://www.elsindic.com/es/presenta-una-queja'

export interface SindicTemplate {
  queja: QuejaRow
  routing: QuejaRouting
  diasTranscurridos: number
  generatedAt: string
}

export function buildSindicTemplate(
  queja: QuejaRow,
  routing: QuejaRouting,
  now: Date = new Date()
): SindicTemplate {
  const registered = queja.registered_at ? new Date(queja.registered_at) : null
  const diasTranscurridos = registered
    ? Math.floor((now.getTime() - registered.getTime()) / (1000 * 60 * 60 * 24))
    : 0
  return { queja, routing, diasTranscurridos, generatedAt: now.toISOString() }
}

export function renderSindicMarkdown(t: SindicTemplate): string {
  const { queja: q, routing, diasTranscurridos } = t
  const plazo = routing.timeLimits.find((tl) => tl.kind === 'resolucion')?.days ?? 90
  const today = new Date(t.generatedAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const responsible = routing.concejalia.responsible

  const lines: string[] = []
  lines.push('# QUEJA ANTE EL SÍNDIC DE GREUGES DE LA COMUNITAT VALENCIANA')
  lines.push('')
  lines.push('**Administración afectada:** Ayuntamiento de Riba-roja de Túria')
  lines.push(`**Portal:** ${SINDIC_PORTAL}`)
  lines.push(`**Base legal:** Ley 11/1988, de 26 de diciembre, del Síndic de Greuges`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Hechos')
  lines.push('')
  lines.push(
    `1. El/la reclamante, vecino/a de Riba-roja de Túria, presentó la siguiente solicitud ante el Registro Electrónico General del Ayuntamiento:`
  )
  lines.push('')
  lines.push(`   - **Expediente interno (CivicPulse):** \`${q.id}\``)
  if (q.registro_entry_number) {
    lines.push(`   - **Número de asiento en sede:** \`${q.registro_entry_number}\``)
  }
  if (q.registro_csv) {
    lines.push(`   - **CSV acreditativo:** \`${q.registro_csv}\``)
  }
  lines.push(`   - **Fecha de registro:** ${q.registered_at ?? '(sin fecha)'}`)
  lines.push(`   - **Materia:** ${q.category}`)
  lines.push(`   - **Área municipal competente:** ${routing.concejalia.area}`)
  if (responsible) {
    lines.push(`   - **Responsable político:** ${responsible.name} (${responsible.party})`)
  }
  lines.push('')
  lines.push('2. El contenido de la solicitud, en los términos en que fue registrada, fue:')
  lines.push('')
  lines.push(`   > ${q.detail.replace(/\n+/g, '\n   > ')}`)
  lines.push('')
  lines.push(
    `3. Conforme al artículo 21.3 de la Ley 39/2015 (LPACAP), el plazo máximo para dictar y notificar resolución expresa era de **${plazo} días naturales** desde la entrada en registro. A fecha de hoy (${today}), han transcurrido **${diasTranscurridos} días** sin que la Administración haya dictado resolución expresa ni haya sido notificado el plazo máximo en los términos del art. 21.4 LPACAP.`
  )
  lines.push('')
  lines.push(
    `4. Ha operado el silencio administrativo ${routing.silencio} previsto en el artículo 24 de la LPACAP, sin que ello libere a la Administración de su obligación de resolver expresamente (art. 21.6).`
  )
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Solicitud al Síndic')
  lines.push('')
  lines.push(
    'Al amparo de lo dispuesto en la Ley 11/1988 del Síndic de Greuges, se solicita:'
  )
  lines.push('')
  lines.push(
    `1. Que el Síndic admita a trámite la presente queja frente al Ayuntamiento de Riba-roja de Túria por **inactividad administrativa** en el expediente referido.`
  )
  lines.push(
    `2. Que el Síndic requiera al Ayuntamiento un informe sobre las causas de la falta de resolución expresa dentro del plazo legal (art. 18 Ley 11/1988).`
  )
  lines.push(
    `3. Que, tras las actuaciones oportunas, se dicte resolución pública que establezca las recomendaciones, sugerencias o recordatorios de deberes legales que procedan (art. 29 Ley 11/1988), y que dicha resolución quede publicada en el registro de resoluciones del Síndic.`
  )
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Base legal citada')
  lines.push('')
  for (const l of routing.legalBasis) {
    lines.push(`- ${l.law} ${l.article} — ${l.url}`)
  }
  lines.push(`- Ley 11/1988, del Síndic de Greuges — https://www.elsindic.com`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`Riba-roja de Túria, ${today}.`)
  lines.push('')
  lines.push(
    `*Documento generado por CivicPulse a partir del seguimiento público del expediente ${q.id}. El reclamante puede añadir, modificar o retirar cualquier parte de este texto antes de presentarlo en ${SINDIC_PORTAL}.*`
  )
  return lines.join('\n')
}

export function renderSindicHtml(t: SindicTemplate): string {
  const md = renderSindicMarkdown(t)
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = md
    .split('\n')
    .map((line) => {
      if (line.startsWith('### ')) return `<h3>${escape(line.slice(4))}</h3>`
      if (line.startsWith('## ')) return `<h2>${escape(line.slice(3))}</h2>`
      if (line.startsWith('# ')) return `<h1>${escape(line.slice(2))}</h1>`
      if (line.startsWith('> ') || line.startsWith('   > '))
        return `<blockquote>${escape(line.replace(/^(\s*)> /, ''))}</blockquote>`
      if (line.match(/^\s*- /)) return `<li>${escape(line.replace(/^\s*- /, ''))}</li>`
      if (line.match(/^\s*\d+\. /)) return `<li>${escape(line.replace(/^\s*\d+\. /, ''))}</li>`
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
<title>Queja al Síndic · ${t.queja.id}</title>
<style>
  body { font-family: Georgia, serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; color: #111; line-height: 1.55; }
  h1 { font-size: 20px; }
  h2 { font-size: 16px; margin-top: 1.5rem; border-bottom: 2px solid #111; padding-bottom: .3rem; }
  blockquote { border-left: 3px solid #999; margin: .5rem 0; padding-left: .8rem; color: #444; }
  code { background: #f4f4f0; padding: 1px 4px; border-radius: 3px; font-family: 'DM Mono', ui-monospace, monospace; font-size: 12px; }
  hr { border: 0; border-top: 1px dashed #bbb; margin: 1.3rem 0; }
  @media print { body { max-width: none; } }
</style>
</head>
<body>
${html}
</body>
</html>`
}
