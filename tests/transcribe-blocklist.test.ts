import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  TRANSCRIBE_BLOCKLIST,
  TRANSCRIBE_BLOCKLIST_IDS,
  transcriptionPending,
} from '../src/scraper/transcribe-blocklist'

/**
 * Un aviso que no se puede apagar y cuyo remedio cuesta dinero y no arregla nada.
 *
 * Del 12 al 23-ago-2026 el parte repitió, cada dos días:
 *
 *     🟠 Transcripción sin avanzar
 *     1 pendiente(s) y sin avance desde hace 8.7 días.
 *     ↳ OpenAI sin saldo — añade fondos en https://platform.openai.com/…
 *
 * Las dos frases eran ciertas por separado: OpenAI **sí** está sin saldo
 * (429 `credit_balance_exhausted`, comprobado el 23-ago) y la última
 * transcripción **sí** es del 12 de agosto. Juntas mienten, porque la ÚNICA
 * sesión pendiente es `1l7hhu7`, que está en la lista negra del nocturno a
 * propósito: su único vídeo publicado es un «Part I» de 22:36 sin habla
 * inteligible, y transcribirlo publicaría un fragmento como si fuera el pleno
 * entero — el defecto del postmortem del 29-jul-2026.
 *
 * Pagar la factura de OpenAI no habría cambiado NADA. El propio nocturno lo dice
 * bien en su log («no transcribable backlog»); quien no lo sabía era el parte,
 * porque `monitor-health` contaba pendientes sin conocer la lista negra.
 *
 * Regla 3 de DATA_INTEGRITY, en su forma más cara: un centinela que nunca se
 * puede apagar deja de ser información y se convierte en ruido que se aprende a
 * ignorar — y el día que la transcripción se pare de verdad, dirá lo mismo.
 */

describe('la lista negra de transcripción es una sola', () => {
  // Regla 1 de DATA_INTEGRITY: el shell y el TypeScript no pueden llevar cada
  // uno su copia. Aquí se comparan, que es lo que `deploy-triggers.test.js` hace
  // con los dos workflows por el mismo motivo.
  it('el nocturno y el módulo nombran exactamente los mismos plenos', () => {
    const sh = readFileSync(resolve(__dirname, '../scripts/hallazgos-pipeline.sh'), 'utf8')
    const m = /TRANSCRIBE_BLOCKLIST="\$\{TRANSCRIBE_BLOCKLIST:-([^}"]*)\}"/.exec(sh)
    expect(m, 'no se encontró el valor por defecto en hallazgos-pipeline.sh').not.toBeNull()
    const enShell = (m![1] ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .sort()
    expect(enShell).toEqual([...TRANSCRIBE_BLOCKLIST_IDS].sort())
  })

  // Una lista negra sin motivo escrito es indistinguible de un descuido, y la
  // que la tiene se puede revisar el día que aparezca una grabación completa.
  it('cada entrada dice por qué y desde cuándo', () => {
    expect(TRANSCRIBE_BLOCKLIST.length).toBeGreaterThan(0)
    for (const b of TRANSCRIBE_BLOCKLIST) {
      expect(b.id, 'id vacío').toMatch(/\S/)
      expect(b.why.trim().length, `${b.id} sin motivo`).toBeGreaterThan(20)
      expect(b.since, `${b.id} sin fecha`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('transcriptionPending · lo bloqueado no está pendiente', () => {
  const transcritos = new Set(['a', 'b'])

  // El caso exacto de producción: sólo queda la sesión bloqueada.
  it('no cuenta una sesión de la lista negra', () => {
    const id = TRANSCRIBE_BLOCKLIST_IDS[0]
    expect(transcriptionPending(['a', 'b', id], transcritos)).toBe(0)
  })

  it('sí cuenta una sesión normal sin transcribir', () => {
    expect(transcriptionPending(['a', 'b', 'c'], transcritos)).toBe(1)
  })

  // Que no se pase de listo: una bloqueada que YA está transcrita tampoco suma,
  // y una normal transcrita tampoco.
  it('no resta dos veces ni inventa pendientes', () => {
    const id = TRANSCRIBE_BLOCKLIST_IDS[0]
    expect(transcriptionPending(['a', 'b', id, 'c'], new Set(['a', 'b', id]))).toBe(1)
    expect(transcriptionPending(['a', 'b'], transcritos)).toBe(0)
  })
})
