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

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Db } from '../db/client.ts'
import { getQuejaPublica, type QuejaRow } from '../db/queries.ts'
import { routeUsingLocalOfficials } from './router.ts'
import type { QuejaRouting, RelojDelPlazo } from '../../../src/scraper/queja-router.ts'
import {
  diasTranscurridos,
  plazoHumano,
  relojDelPlazo,
  ZONA_DE_LA_SEDE,
} from '../../../src/scraper/queja-router.ts'
import { fechaHoraDeLaSede } from './recibo-sede.ts'

const SINDIC_PORTAL = 'https://www.elsindic.com/es/presenta-una-queja'

export interface SindicTemplate {
  queja: QuejaRow
  routing: QuejaRouting
  /** Días naturales del día de registro al de hoy, en el calendario de la sede; null sin fecha legible. */
  diasTranscurridos: number | null
  /**
   * El plazo de resolución el día del escrito, con la cuenta de `relojDelPlazo`:
   * la misma que decide el silencio en el bot y la que pintan las páginas. null
   * si la ruta no trae plazo de resolución.
   */
  plazo: RelojDelPlazo | null
  generatedAt: string
}

/** «lunes 16 de noviembre de 2026»: un día «AAAA-MM-DD», sin pasar por ningún reloj. */
function diaEnLetra(dia: string): string {
  const mediodia = new Date(`${dia}T12:00:00Z`)
  const semana = mediodia.toLocaleDateString('es-ES', { timeZone: 'UTC', weekday: 'long' })
  const fecha = mediodia.toLocaleDateString('es-ES', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return `${semana} ${fecha}`
}

export function buildSindicTemplate(
  queja: QuejaRow,
  routing: QuejaRouting,
  now: Date = new Date(),
): SindicTemplate {
  // En días del calendario de la sede, como el plazo del que habla el escrito.
  // Eran tandas de 24 horas desde la marca: registrada a las 18:00, a las 10:00
  // del día 92 decía 91 días, justo lo que dura el plazo entero.
  const limite = routing.timeLimits.find((tl) => tl.kind === 'resolucion')
  return {
    queja,
    routing,
    diasTranscurridos: diasTranscurridos(queja.registered_at, now),
    plazo: limite ? relojDelPlazo(limite, queja.registered_at, now) : null,
    generatedAt: now.toISOString(),
  }
}

/**
 * El último día del plazo dicho en el escrito, o nada si no se puede decir. Es
 * el prorrogado si caía en inhábil (art. 30.5): el escrito no puede fechar el
 * silencio un día antes que el bot que lo declaró.
 */
function fraseDelUltimoDia(plazo: RelojDelPlazo | null): string {
  if (plazo?.cuenta === 'calculada') {
    const verbo = plazo.quedan < 0 ? 'concluyó' : 'concluye'
    const prorroga =
      plazo.ultimoDia === plazo.nominal
        ? ''
        : ` —el ${diaEnLetra(plazo.nominal)} era inhábil, y el plazo se prorrogó al primer día hábil siguiente (art. 30.5 LPACAP)—`
    return `, y ${verbo} el ${diaEnLetra(plazo.ultimoDia)}${prorroga}`
  }
  if (plazo?.cuenta === 'sin-calendario') {
    return `, y concluye el ${diaEnLetra(plazo.nominal)} o, si ese día es inhábil, el primer día hábil siguiente (art. 30.5 LPACAP)`
  }
  return ''
}

/**
 * Por qué una queja NO puede escalarse al Síndic todavía; null si puede.
 *
 * El escrito afirma que «ha operado el silencio». Una queja en silencio lo tiene
 * declarado por el bot; una sólo `registrada` puede escalarse con el plazo ya
 * vencido —el bot lo declara en la vuelta siguiente, o no lo declara mientras
 * dura la suspensión electoral—, y hasta el 29-09-2026 nadie lo comprobaba,
 * aunque el mensaje de /escalar lo pedía.
 */
export function motivoParaNoEscalar(
  q: QuejaRow,
  routing: QuejaRouting,
  now: Date = new Date(),
): string | null {
  if (q.state === 'silencio_negativo') return null
  if (q.state !== 'registrada') {
    return `está en estado *${q.state}*: sólo se escalan quejas en silencio_negativo o registradas con el plazo vencido.`
  }
  const limite = routing.timeLimits.find((tl) => tl.kind === 'resolucion')
  const reloj = limite ? relojDelPlazo(limite, q.registered_at, now) : null
  if (reloj?.cuenta === 'calculada') {
    return reloj.quedan < 0
      ? null
      : `su plazo sigue abierto: el último día es el ${diaEnLetra(reloj.ultimoDia)}.`
  }
  if (reloj?.cuenta === 'sin-calendario') {
    return `falta el calendario de días inhábiles de ${reloj.anio}: su plazo acaba el ${diaEnLetra(reloj.nominal)} o el primer día hábil siguiente, y sin él no se puede afirmar que venció.`
  }
  if (reloj?.cuenta === 'sin-fecha') return 'su fecha de registro no se puede leer.'
  return 'su ruta no trae un plazo de resolución en meses.'
}

export function renderSindicMarkdown(t: SindicTemplate): string {
  const { queja: q, routing, diasTranscurridos: dias } = t
  const limite = routing.timeLimits.find((tl) => tl.kind === 'resolucion')
  // El escrito CITA el art. 21.3 en la misma frase, y el artículo dice «tres
  // meses»: traducirlo a «90 días naturales» contradecía la cita en el
  // documento que se presenta ante el Síndic.
  const plazo = limite ? plazoHumano(limite) : '—'
  // El día de la sede: en UTC, entre las 22:00 y la medianoche es todavía ayer.
  const today = new Date(t.generatedAt).toLocaleDateString('es-ES', {
    timeZone: ZONA_DE_LA_SEDE,
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
    `1. El/la reclamante, vecino/a de Riba-roja de Túria, presentó la siguiente solicitud ante el Registro Electrónico General del Ayuntamiento:`,
  )
  lines.push('')
  lines.push(`   - **Expediente interno (CivicPulse):** \`${q.id}\``)
  if (q.registro_entry_number) {
    lines.push(`   - **Número de asiento en sede:** \`${q.registro_entry_number}\``)
  }
  if (q.registro_csv) {
    lines.push(`   - **CSV acreditativo:** \`${q.registro_csv}\``)
  }
  // Como la escribe el recibo, que es lo que el Síndic puede cotejar. La marca
  // del bot es UTC: `2026-09-27 22:00:01` en crudo diría el día anterior.
  lines.push(`   - **Fecha de registro:** ${fechaHoraDeLaSede(q.registered_at) ?? '(sin fecha)'}`)
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
    `3. Conforme al artículo 21.3 de la Ley 39/2015 (LPACAP), el plazo máximo para dictar y notificar resolución expresa era de **${plazo}** desde la entrada en registro${fraseDelUltimoDia(t.plazo)}. A fecha de hoy (${today}), han transcurrido **${dias ?? '—'} días** sin que la Administración haya dictado resolución expresa ni haya sido notificado el plazo máximo en los términos del art. 21.4 LPACAP.`,
  )
  lines.push('')
  lines.push(
    `4. Ha operado el silencio administrativo ${routing.silencio} previsto en el artículo 24 de la LPACAP, sin que ello libere a la Administración de su obligación de resolver expresamente (art. 21.6).`,
  )
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Solicitud al Síndic')
  lines.push('')
  lines.push('Al amparo de lo dispuesto en la Ley 11/1988 del Síndic de Greuges, se solicita:')
  lines.push('')
  lines.push(
    `1. Que el Síndic admita a trámite la presente queja frente al Ayuntamiento de Riba-roja de Túria por **inactividad administrativa** en el expediente referido.`,
  )
  lines.push(
    `2. Que el Síndic requiera al Ayuntamiento un informe sobre las causas de la falta de resolución expresa dentro del plazo legal (art. 18 Ley 11/1988).`,
  )
  lines.push(
    `3. Que, tras las actuaciones oportunas, se dicte resolución pública que establezca las recomendaciones, sugerencias o recordatorios de deberes legales que procedan (art. 29 Ley 11/1988), y que dicha resolución quede publicada en el registro de resoluciones del Síndic.`,
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
    `*Documento generado por CivicPulse a partir del seguimiento público del expediente ${q.id}. El reclamante puede añadir, modificar o retirar cualquier parte de este texto antes de presentarlo en ${SINDIC_PORTAL}.*`,
  )
  return lines.join('\n')
}

export function renderSindicHtml(t: SindicTemplate): string {
  const md = renderSindicMarkdown(t)
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

const RUTA_SINDIC = /^\/sindic\/(q-[a-z0-9]+)\.(md|html)$/

/**
 * GET /sindic/<id>.md | .html — la plantilla para acudir al Síndic con una queja.
 *
 * Vivía dentro del servidor de index.ts, donde no había forma de probarla. Sirve
 * sólo una queja PUBLICADA (`getQuejaPublica`): una sin revisar, una descartada o
 * una que su autor retiró contestan igual que una que no existe. El token, como
 * antes: en la cabecera o en `?token=`, y sin `EXPORT_TOKEN` configurado, abierta.
 *
 * Devuelve true cuando la ruta era suya y ya está contestada.
 */
export function sirveSindic(
  req: IncomingMessage,
  res: ServerResponse,
  deps: { db: Db; exportToken?: string | null },
): boolean {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const m = RUTA_SINDIC.exec(url.pathname)
  if (req.method !== 'GET' || !m) return false
  const contesta = (status: number, texto: string) => {
    res.statusCode = status
    res.end(texto)
    return true
  }
  if (deps.exportToken) {
    const cabecera = req.headers.authorization ?? ''
    const enUrl = url.searchParams.get('token') ?? ''
    if (cabecera !== `Bearer ${deps.exportToken}` && enUrl !== deps.exportToken) {
      return contesta(401, 'unauthorized')
    }
  }
  const q = getQuejaPublica(deps.db, m[1].toUpperCase())
  if (!q) return contesta(404, 'not found')
  const routing = routeUsingLocalOfficials({
    title: q.title,
    detail: q.detail,
    category: q.category as never,
  })
  const plantilla = buildSindicTemplate(q, routing)
  const md = m[2] === 'md'
  res.statusCode = 200
  res.setHeader('Content-Type', md ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(md ? renderSindicMarkdown(plantilla) : renderSindicHtml(plantilla))
  return true
}
