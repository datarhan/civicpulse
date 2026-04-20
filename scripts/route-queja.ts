/**
 * CLI wrapper around src/scraper/queja-router.
 *
 * Usage:
 *   npm run route-queja -- "<title>" "<detail>" [category]
 *   npm run route-queja -- --json '{"title":"...","detail":"..."}'
 *   npm run route-queja -- --file path/to/queja.json
 *
 * Prints a pretty-formatted routing report to stdout; if --json is given,
 * prints the raw QuejaRouting object as JSON for piping into other tools.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  routeQueja,
  type QuejaInput,
  type QuejaRouting,
  type OfficialsSnapshot,
} from '../src/scraper/queja-router.ts'

function loadOfficials(): OfficialsSnapshot {
  const p = resolve(process.cwd(), 'public/data/officials.json')
  return JSON.parse(readFileSync(p, 'utf8'))
}

function parseArgs(argv: string[]): { queja: QuejaInput; raw: boolean } {
  const args = argv.slice(2)
  const rawFlag = args.includes('--raw')
  const filtered = args.filter((a) => a !== '--raw')

  if (filtered[0] === '--file') {
    const data = JSON.parse(readFileSync(resolve(filtered[1]), 'utf8'))
    return { queja: data, raw: rawFlag }
  }
  if (filtered[0] === '--json') {
    return { queja: JSON.parse(filtered[1]), raw: rawFlag }
  }
  if (filtered.length < 2) {
    console.error('Usage: route-queja "<title>" "<detail>" [category] [--raw]')
    console.error('       route-queja --file queja.json [--raw]')
    console.error('       route-queja --json \'{"title":"...","detail":"..."}\' [--raw]')
    process.exit(2)
  }
  return {
    queja: {
      title: filtered[0],
      detail: filtered[1],
      category: filtered[2] as QuejaInput['category'] | undefined,
    },
    raw: rawFlag,
  }
}

function formatReport(r: QuejaRouting): string {
  const lines: string[] = []
  lines.push('═══════════════════════════════════════════════════════════════')
  lines.push('  CLASIFICACIÓN DE QUEJA · CivicPulse · Riba-roja de Túria')
  lines.push('═══════════════════════════════════════════════════════════════')
  lines.push('')
  lines.push(`Título:    ${r.queja.title}`)
  lines.push(`Detalle:   ${r.queja.detail}`)
  lines.push('')
  lines.push(`Categoría: ${r.category}  (confianza ${r.confidence})`)
  lines.push(`Área:      ${r.concejalia.area}`)

  if (r.concejalia.responsible) {
    const o = r.concejalia.responsible
    lines.push('')
    lines.push('── Responsable político ────────────────────────────────────')
    lines.push(`${o.honorific ?? ''} ${o.name} (${o.party}) · ${o.role}`)
    lines.push(`Cartera coincidente: ${o.portfolioMatched}`)
    if (o.email) lines.push(`Contacto: ${o.email}`)
  }

  lines.push('')
  lines.push('── Silencio administrativo aplicable ───────────────────────')
  lines.push(`→ ${r.silencio.toUpperCase()}`)

  lines.push('')
  lines.push('── Plazos legales ──────────────────────────────────────────')
  for (const t of r.timeLimits) {
    const kindLabel = t.kind === 'acuse' ? 'Acuse de recibo' : 'Resolución expresa'
    lines.push(`${kindLabel.padEnd(22)} · ${t.days} días · ${t.basis.law} ${t.basis.article}`)
  }

  lines.push('')
  lines.push('── Base legal citada ───────────────────────────────────────')
  for (const l of r.legalBasis) {
    lines.push(`${l.law} ${l.article}`)
    lines.push(`  "${l.says}"`)
    lines.push(`  ${l.url}`)
  }

  lines.push('')
  lines.push('── Escalado si no hay respuesta ────────────────────────────')
  for (const s of r.escalation) {
    lines.push(`[T+${s.whenDays}d] paso ${s.step} · ${s.who}`)
    lines.push(`         ${s.action}`)
    lines.push(`         Base: ${s.basis.law} ${s.basis.article} — ${s.basis.url}`)
    if (s.template) lines.push(`         Plantilla: ${s.template}`)
  }

  lines.push('')
  lines.push('── Explicación para el ciudadano ───────────────────────────')
  lines.push(r.explanationEs)
  lines.push('')

  return lines.join('\n')
}

function main() {
  const { queja, raw } = parseArgs(process.argv)
  const officials = loadOfficials()
  const routing = routeQueja(queja, officials)
  if (raw) {
    process.stdout.write(JSON.stringify(routing, null, 2) + '\n')
  } else {
    process.stdout.write(formatReport(routing) + '\n')
  }
}

main()
