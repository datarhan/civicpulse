import { describe, it, expect } from 'vitest'
import {
  YTDLP_STALE_DAYS,
  ytDlpAgeDays,
  staleYtDlpNote,
  looksLikeClientRejection,
} from '../src/scraper/ytdlp-age'

/**
 * Lo que costó 20 minutos diagnosticar el 23-ago-2026, y que la propia
 * herramienta puede decir en una línea.
 *
 * El barrido de mapas de voces gastó **0 de sus 20 peticiones diarias** los días
 * 19, 22 y 23 de agosto. La causa no estaba en el modelo, ni en la cuota, ni en
 * el código: el `yt-dlp` de Homebrew era `2026.7.4`, instalado el 3 de agosto, y
 * YouTube había retirado la suplantación de cliente que esa versión usa.
 *
 * La firma es lo que engaña. `--simulate --print "%(duration)s"` respondía bien
 * —8265 s y el título correcto— y sólo la descarga del medio devolvía 403. Por
 * eso `scrape-pleno-videos.ts`, que sólo pide metadatos, siguió funcionando y
 * tapó la avería: la única pasada que aún tocaba YouTube «estaba verde».
 *
 * La versión de yt-dlp ES su fecha de publicación, así que la caducidad se
 * comprueba sin red y sin preguntarle a nadie.
 */

const NOW = new Date('2026-08-23T09:00:00.000Z')

describe('ytDlpAgeDays', () => {
  // `yt-dlp --version` imprime `2026.08.19`; `brew list --versions` dice
  // `2026.7.4` de la MISMA versión. Las dos formas tienen que leerse igual o la
  // comprobación depende de quién la llame.
  it('reads both the zero-padded and the bare form as the same release', () => {
    expect(ytDlpAgeDays('2026.07.04', NOW)).toBe(ytDlpAgeDays('2026.7.4', NOW))
  })

  it('measures the age of the version that actually broke', () => {
    expect(ytDlpAgeDays('2026.07.04', NOW)).toBe(50)
  })

  // Falla abierto: nunca inventa un diagnóstico a partir de algo que no entiende.
  it('returns null for anything it cannot parse', () => {
    for (const v of ['', 'nightly', '2026', 'x.y.z', '2026.13.99']) {
      expect(ytDlpAgeDays(v, NOW), v).toBeNull()
    }
  })
})

describe('looksLikeClientRejection', () => {
  // El 403 llega del host del medio, no de la página del vídeo.
  it('recognises the media-fetch refusal', () => {
    expect(
      looksLikeClientRejection('ERROR: unable to download video data: HTTP Error 403: Forbidden'),
    ).toBe(true)
  })

  it('does not claim a private video or a network drop is a stale binary', () => {
    expect(looksLikeClientRejection('ERROR: Private video. Sign in if you have been granted')).toBe(
      false,
    )
    expect(looksLikeClientRejection('ERROR: Unable to connect to proxy')).toBe(false)
  })
})

describe('staleYtDlpNote', () => {
  it('names the binary, its age and the one command that fixes it', () => {
    const note = staleYtDlpNote('2026.07.04', NOW)
    expect(note).toContain('2026.07.04')
    expect(note).toContain('50')
    expect(note).toContain('brew upgrade yt-dlp')
  })

  // Un aviso que salta siempre es un aviso que nadie lee. Una versión reciente
  // no es sospechosa, y decir que lo es enseñaría a ignorar la línea.
  it('says nothing about a binary that is not stale', () => {
    expect(staleYtDlpNote('2026.08.19', NOW)).toBeNull()
  })

  it('says nothing when the version is unreadable', () => {
    expect(staleYtDlpNote(null, NOW)).toBeNull()
    expect(staleYtDlpNote('nightly', NOW)).toBeNull()
  })

  // El umbral se importa; escribir «28» a mano aquí es la regla 1 otra vez.
  it('starts warning exactly at the documented threshold', () => {
    const justOver = new Date(NOW.getTime() + (YTDLP_STALE_DAYS + 1) * 86_400_000)
    const justUnder = new Date(NOW.getTime() + (YTDLP_STALE_DAYS - 1) * 86_400_000)
    expect(staleYtDlpNote('2026.08.23', justOver)).not.toBeNull()
    expect(staleYtDlpNote('2026.08.23', justUnder)).toBeNull()
  })
})
