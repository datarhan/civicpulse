#!/usr/bin/env tsx
/**
 * Registro de procedencia de prompts — lo que la política de IA generativa de
 * NLnet exige y la solicitud todavía no traía.
 *
 *   npm run build:prompt-log
 *
 * NLnet lo pide en cuatro puntos (política v1.1, en vigor desde el 8-12-2025):
 * el MODELO usado, las FECHAS Y HORAS de los prompts, LOS PROMPTS y la SALIDA
 * SIN EDITAR. El formulario da 8.000 caracteres o tres huecos de fichero; esto
 * genera el fichero.
 *
 * DE DÓNDE SALE. De las transcripciones de sesión en
 * `~/.claude/projects/<proyecto>/<sesión>.jsonl`, que es el único registro
 * literal que existe: reconstruirlo de memoria sería inventarlo, y un registro
 * de procedencia inventado es peor que no tenerlo.
 *
 * QUÉ CUENTA COMO PROMPT. Sólo el turno humano de verdad. En este formato los
 * `tool_result` viajan como mensajes de tipo `user`, y contarlos hincharía el
 * registro con salida de herramientas haciéndola pasar por lo que escribió una
 * persona. Se descartan, y se dice cuántos se descartaron.
 *
 * REDACCIÓN, Y NO ES OPCIONAL. La sesión del 8-09-2026 incluye el alta de cinco
 * secretos y la rotación de un token. Este fichero se SUBE a un tercero, así
 * que pasa entero por `redactSecrets` antes de escribirse y `check:secrets`
 * vuelve a leerlo después. Un registro de honestidad que filtra una credencial
 * no es honesto, es sólo caro.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { redactSecrets } from '../src/scraper/redact-secrets'

const RAIZ = join(homedir(), '.claude', 'projects')
const SALIDA = 'editorial/campana/09-REGISTRO-PROMPTS.md'

/** Las sesiones que redactaron o auditaron la solicitud, y nada más. */
const SESIONES = [
  {
    id: '03a7148a-c33d-4c71-9a6d-99d1d07fa7b1',
    proyecto: '-Users-sergeilutchenko-dev-CivicPulse--claude-worktrees-presupuesto-5b',
    papel: 'Redacción de la solicitud, del kit de premios y apertura del repositorio',
  },
  {
    id: '3dd9ad10-2e24-4dfa-bdd1-cd1b37b8d49d',
    proyecto: '-Users-sergeilutchenko-dev-CivicPulse--claude-worktrees-campana-bios',
    papel: 'Auditoría de la solicitud contra el formulario vivo y contra las cifras',
  },
]

interface Turno {
  ts: string
  quien: 'humano' | 'modelo'
  texto: string
}

function leerSesion(proyecto: string, id: string) {
  const p = join(RAIZ, proyecto, `${id}.jsonl`)
  if (!existsSync(p)) return null
  const turnos: Turno[] = []
  const modelos = new Set<string>()
  let descartadosToolResult = 0

  for (const linea of readFileSync(p, 'utf8').split('\n')) {
    if (!linea.trim()) continue
    let d: Record<string, unknown>
    try {
      d = JSON.parse(linea)
    } catch {
      continue
    }
    const ts = String(d.timestamp ?? '')
    const msg = (d.message ?? {}) as { content?: unknown; model?: string }

    if (d.type === 'user') {
      const c = msg.content
      let texto = ''
      if (typeof c === 'string') texto = c
      else if (Array.isArray(c)) {
        if (c.some((b) => (b as { type?: string })?.type === 'tool_result')) {
          descartadosToolResult += 1
          continue
        }
        texto = c
          .filter((b) => (b as { type?: string })?.type === 'text')
          .map((b) => (b as { text?: string }).text ?? '')
          .join(' ')
      }
      texto = texto.trim()
      // Los bloques inyectados por el propio arnés (<system-reminder>, el
      // preámbulo de una skill) no los escribió una persona.
      if (!texto || texto.startsWith('<') || texto.startsWith('Base directory for this skill'))
        continue
      turnos.push({ ts, quien: 'humano', texto })
    } else if (d.type === 'assistant') {
      if (msg.model) modelos.add(msg.model)
      const c = msg.content
      if (!Array.isArray(c)) continue
      const texto = c
        .filter((b) => (b as { type?: string })?.type === 'text')
        .map((b) => (b as { text?: string }).text ?? '')
        .join('\n')
        .trim()
      if (texto) turnos.push({ ts, quien: 'modelo', texto })
    }
  }
  return { turnos, modelos: [...modelos], descartadosToolResult }
}

function main() {
  const partes: string[] = []
  partes.push('# Registro de procedencia de prompts — solicitud NLnet 2026')
  partes.push('')
  partes.push(
    'Generado por `npm run build:prompt-log` a partir de las transcripciones de sesión,',
    'que son el único registro literal. Cumple los cuatro puntos que pide la política de',
    'IA generativa de NLnet (v1.1): modelo, fechas y horas, los prompts y la salida.',
    '',
    'Los `tool_result` NO se cuentan como prompts: en este formato viajan como mensajes',
    'de usuario, y contarlos haría pasar salida de herramientas por texto humano.',
    '',
    'Pasado entero por `redactSecrets` antes de escribirse.',
    '',
  )

  let totalHumanos = 0
  for (const s of SESIONES) {
    const r = leerSesion(s.proyecto, s.id)
    if (!r) {
      partes.push(`## Sesión ${s.id} — NO ENCONTRADA`, '')
      partes.push(
        'La transcripción no está en disco. Se hace constar en vez de omitirla:',
        'un hueco declarado es un hueco; uno callado es una afirmación falsa.',
        '',
      )
      continue
    }
    const humanos = r.turnos.filter((t) => t.quien === 'humano')
    totalHumanos += humanos.length
    const ts = r.turnos.map((t) => t.ts).filter(Boolean)

    partes.push(`## Sesión ${s.id}`, '')
    partes.push(`- **Papel:** ${s.papel}`)
    partes.push(`- **Modelo:** ${r.modelos.join(', ') || '(no consta en la transcripción)'}`)
    partes.push(`- **Rango:** ${ts[0] ?? '?'} → ${ts[ts.length - 1] ?? '?'} (UTC)`)
    partes.push(`- **Prompts humanos:** ${humanos.length}`)
    partes.push(`- **Turnos de herramienta descartados:** ${r.descartadosToolResult}`)
    partes.push('')
    partes.push('### Prompts y salida', '')

    for (const t of r.turnos) {
      if (t.quien === 'humano') {
        partes.push(`#### ${t.ts} · PROMPT`, '', '```', t.texto, '```', '')
      } else {
        partes.push(
          `<details><summary>${t.ts} · salida del modelo</summary>`,
          '',
          t.texto,
          '',
          '</details>',
          '',
        )
      }
    }
  }

  partes.push('---', '')
  partes.push(`**Total de prompts humanos: ${totalHumanos}** en ${SESIONES.length} sesión(es).`)

  const bruto = partes.join('\n')
  // Por FORMA no basta y la propia cabecera de `redactSecrets` lo dice: el
  // valor exacto es «el único modo de no depender de que esta lista esté al
  // día». Se leen de `.env` los valores vivos —nunca se imprimen— y se exige
  // que desaparezcan aunque su forma no la reconozca nadie.
  const valores: (string | undefined)[] = []
  for (const env of ['.env', 'bot/.env']) {
    if (!existsSync(env)) continue
    for (const linea of readFileSync(env, 'utf8').split('\n')) {
      const m = /^\s*(?:export\s+)?[A-Z0-9_]+\s*=\s*(.+)\s*$/.exec(linea)
      if (m) valores.push(m[1].trim().replace(/^["']|["']$/g, ''))
    }
  }
  const limpio = redactSecrets(bruto, valores)
  writeFileSync(SALIDA, limpio + '\n', 'utf8')

  const kb = (Buffer.byteLength(limpio) / 1024).toFixed(0)
  console.log(`[prompt-log] ${SALIDA} · ${totalHumanos} prompt(s) humanos · ${kb} KB`)
  if (limpio !== bruto) console.log('[prompt-log] se redactó al menos un secreto')
  else console.log('[prompt-log] redactSecrets no encontró nada que tapar')
}

main()
