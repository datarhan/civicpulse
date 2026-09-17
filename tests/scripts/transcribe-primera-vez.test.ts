import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * La PRIMERA transcripción de una sesión no puede morir antes de transcribir.
 *
 * El bloque que aparta la transcripción anterior (#96) inicializa
 * `INCUMBENTE=""` antes de su `if`, pero asigna `SUPERSEDED_MAIN` sólo DENTRO de
 * él —cuando ya existe una transcripción— y lo lee FUERA, en la línea que decide
 * el incumbente. Con `set -euo pipefail`, en una sesión que nunca se ha
 * transcrito eso es «unbound variable» y el guion muere antes del reparto de
 * motores: no escribe nada, y mañana vuelve a morir en el mismo sitio.
 *
 * Medido en el log de la tubería de /hallazgos: la sesión `1xmr0do` —la primera
 * de `plenos.json`, la más reciente— cayó así el 15, el 16 y el 17 de septiembre
 * de 2026, bajando cada mañana sus 34 MB de audio para nada.
 *
 * Se ejecuta el bloque DE VERDAD, recortado del guion por sus propias anclas y
 * con las mismas opciones de shell. Recitarlo aquí sería una copia que no se
 * rompe cuando el guion se rompe.
 */
const GUION = join(__dirname, '../../scripts/transcribe-pleno.sh')
const INICIO = 'INCUMBENTE=""'
const FIN = 'if [ -f "$SUPERSEDED_MAIN" ]; then INCUMBENTE="$SUPERSEDED_MAIN"; fi'

function bloque(): string {
  const t = readFileSync(GUION, 'utf8')
  const i = t.indexOf(INICIO)
  const j = t.indexOf(FIN)
  if (i < 0 || j < 0 || j < i) return ''
  return t.slice(i, j + FIN.length)
}

function corre(conTranscripcionPrevia: boolean): { rc: number; salida: string } {
  const dir = mkdtempSync(join(tmpdir(), 'transcribe-'))
  const out = join(dir, 'pleno.txt')
  if (conTranscripcionPrevia) writeFileSync(out, 'transcripción anterior\n')
  const arnes = join(dir, 'arnes.sh')
  writeFileSync(
    arnes,
    `set -euo pipefail\nOUT_PATH=${JSON.stringify(out)}\n${bloque()}\necho "INCUMBENTE=[$INCUMBENTE]"\n`,
  )
  try {
    const salida = execFileSync('/bin/bash', [arnes], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { rc: 0, salida }
  } catch (e) {
    const err = e as { status?: number; stderr?: string; stdout?: string }
    return { rc: err.status ?? 1, salida: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

describe('transcribe-pleno.sh · la primera vez también se transcribe', () => {
  it('mide algo: el bloque se encuentra en el guion y es el que aparta la anterior', () => {
    const b = bloque()
    expect(b, 'no encuentra el bloque por sus anclas').not.toBe('')
    expect(b).toContain('SUPERSEDED_MAIN=')
    expect(b).toContain('superseded')
  })

  it('una sesión sin transcripción previa no muere en el bloque', () => {
    const r = corre(false)
    expect(r.salida).not.toMatch(/unbound variable/)
    expect(r.rc, r.salida).toBe(0)
    // Sin anterior no hay incumbente: se transcribe desde cero.
    expect(r.salida).toContain('INCUMBENTE=[]')
  })

  it('con transcripción previa la aparta y la toma como incumbente (el control)', () => {
    const r = corre(true)
    expect(r.rc, r.salida).toBe(0)
    expect(r.salida).toMatch(/INCUMBENTE=\[.*superseded.*pleno\.txt\]/)
  })
})
