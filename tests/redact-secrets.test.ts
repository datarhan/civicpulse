import { describe, it, expect } from 'vitest'
import { redactSecrets } from '../src/scraper/redact-secrets'

/**
 * El 1-sep-2026 la clave de Gemini se comiteó a git, dos veces, dentro de un
 * mapa de voces.
 *
 * `extract-speaker-map.ts` guarda el MOTIVO de un trozo fallido en el manifiesto
 * —«un fallo sin nombre se lee igual que un atraso terminado», y eso está
 * bien—. Pero el motivo es el `err.message` de `execFileSync`, y ese mensaje
 * lleva el argv completo del curl: `…/upload/v1beta/files?key=AQ.FAKEKE…`. Así
 * que la clave viajó al fichero, al commit `5233bc9a`, y al remoto en tres
 * ramas. El repositorio es privado, que es la única razón por la que esto no
 * fue peor.
 *
 * La lección no es «no registres el error». Es que **un secreto no puede
 * sobrevivir a un mensaje de error**, y eso se arregla en un sitio, no en cada
 * sitio donde alguien escriba un log.
 */
describe('scraper/redact-secrets', () => {
  it('tapa el parámetro key= de una URL, que es como se filtró de verdad', () => {
    const real =
      'Command failed: curl -s -X POST ' +
      'https://generativelanguage.googleapis.com/upload/v1beta/files?key=AQ.FAKEKEYFORTESTSONLY_00000000 ' +
      '-H X-Goog-Upload-Protocol: resumable'
    const out = redactSecrets(real)
    expect(out).not.toContain('AQ.FAKEKEYFORTESTSONLY_00000000')
    expect(out).toContain('key=REDACTED')
    // El resto del mensaje tiene que sobrevivir: sin él el motivo deja de ser
    // un motivo, y un fallo sin nombre es el defecto que abrió este agujero.
    expect(out).toContain('upload/v1beta/files')
    expect(out).toContain('X-Goog-Upload-Protocol')
  })

  it('tapa la clave aunque lleve más parámetros detrás', () => {
    const out = redactSecrets('GET /v1beta/files?key=AQ.SECRETVALUE123&alt=sse&pageSize=10')
    expect(out).not.toContain('AQ.SECRETVALUE123')
    expect(out).toContain('key=REDACTED')
    // Lo que va después del & no es secreto y hace falta para depurar.
    expect(out).toContain('alt=sse')
    expect(out).toContain('pageSize=10')
  })

  it('tapa una cabecera Authorization: Bearer', () => {
    const out = redactSecrets(
      'curl -H "Authorization: Bearer sk-proj-abc123DEF456" https://api.openai.com',
    )
    expect(out).not.toContain('sk-proj-abc123DEF456')
    expect(out).toContain('api.openai.com')
  })

  it('tapa claves por su forma, aunque nadie las nombre', () => {
    // Por si una clave aparece sola, sin `key=` y sin cabecera.
    for (const k of [
      'AQ.FAKEKEYFORTESTSONLY_0000000000',
      'sk-proj-AAAABBBBCCCCDDDDEEEE',
      'AIzaSyA1234567890abcdefghijklmnopqrs',
    ]) {
      const out = redactSecrets(`falló con la clave ${k} puesta`)
      expect(out, `no tapó ${k.slice(0, 6)}…`).not.toContain(k)
    }
  })

  // El token de Telegram NO estaba cubierto, y es el único secreto de esta casa
  // que YA se filtró por su forma: el 3-09-2026 apareció escrito en
  // `bot/DEPLOY.md`. Una lista de formas que no incluye el secreto que ya se te
  // escapó una vez no es una lista, es un recuerdo.
  //
  // Entra ahora porque el registro de prompts de NLnet se SUBE a un tercero, y
  // sale de transcripciones de sesiones en las que se rotaron tokens.
  it('tapa un token de bot de Telegram por su forma', () => {
    const t = '123456789:AAHfakefaketokenfaketokenfaketoken123'
    const out = redactSecrets(`BOT_TOKEN=${t} y sigue`)
    expect(out).not.toContain(t)
    expect(out).toContain('REDACTED')
  })

  it('tapa un token de GitHub por su forma', () => {
    for (const t of ['ghp_' + 'a'.repeat(36), 'github_pat_' + 'b'.repeat(30)]) {
      const out = redactSecrets(`token: ${t}`)
      expect(out, t).not.toContain(t)
    }
  })

  // Un número con dos puntos no es un token: si esto tapara una hora o un id,
  // el registro saldría ilegible y nadie lo volvería a generar.
  it('no confunde una hora ni un identificador con un token', () => {
    const texto = 'a las 11:03:16 el turno 782818609 del pleno 2026:01'
    expect(redactSecrets(texto)).toBe(texto)
  })

  it('no toca un texto sin secretos', () => {
    const clean = 'chunk 4/29 (600s) — 0 hablantes resueltos, se reintenta mañana'
    expect(redactSecrets(clean)).toBe(clean)
  })

  it('tapa el valor exacto que se le pase, esté donde esté', () => {
    // La red de seguridad: el llamante conoce su propio secreto y puede
    // exigir que desaparezca, aunque no tenga una forma reconocible.
    const out = redactSecrets('token=zzz-lo-que-sea y otra vez zzz-lo-que-sea', ['zzz-lo-que-sea'])
    expect(out).not.toContain('zzz-lo-que-sea')
    expect(out.match(/REDACTED/g)?.length).toBe(2)
  })

  it('no revienta con entradas vacías o no-cadena', () => {
    expect(redactSecrets('')).toBe('')
    expect(redactSecrets(undefined as unknown as string)).toBe('')
    expect(redactSecrets(null as unknown as string)).toBe('')
  })

  it('un secreto vacío no convierte cada hueco en REDACTED', () => {
    // Si `GEMINI_API_KEY` no está puesta, `redactSecrets(x, [''])` no debe
    // destrozar el mensaje — el caso se da en cuanto alguien pasa el env sin
    // comprobarlo.
    const out = redactSecrets('un mensaje normal', ['', undefined as unknown as string])
    expect(out).toBe('un mensaje normal')
  })
})
