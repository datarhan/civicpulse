#!/usr/bin/env tsx
/**
 * ¿Está el `yt-dlp` de esta máquina lo bastante fresco para que YouTube le hable?
 *
 * Avisa, nunca bloquea, y **siempre sale 0**. Un binario viejo suele funcionar;
 * lo que no puede pasar es que, cuando deje de funcionar, nadie sepa mirarlo. El
 * 23-ago-2026 el barrido de mapas de voces llevaba cuatro noches gastando 0 de
 * sus 20 peticiones porque el binario tenía 46 días, y el diagnóstico —403 en el
 * medio mientras los metadatos resuelven— costó veinte minutos a mano.
 *
 * Toda la lógica vive en `src/scraper/ytdlp-age.ts`; esto es la entrada/salida.
 *
 *   npx tsx scripts/check-ytdlp-age.ts
 */
import { spawnSync } from 'node:child_process'
import { staleYtDlpNote, ytDlpAgeDays } from '../src/scraper/ytdlp-age'

const r = spawnSync('yt-dlp', ['--version'], { encoding: 'utf8' })
if (r.status !== 0) {
  // No estar instalado es un problema de otro (la descarga fallará y lo dirá con
  // su propio error). Aquí sólo se mide la edad de lo que hay.
  process.stdout.write('[ytdlp-age] yt-dlp no responde a --version — no se puede medir su edad\n')
  process.exit(0)
}

const version = r.stdout.trim()
const note = staleYtDlpNote(version, new Date())
process.stdout.write(
  note
    ? `[ytdlp-age] ⚠ ${note}\n`
    : `[ytdlp-age] yt-dlp ${version} (${ytDlpAgeDays(version, new Date()) ?? '?'} días) — al día\n`,
)
