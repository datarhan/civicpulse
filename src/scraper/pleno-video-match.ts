/**
 * Resolve which YouTube recording belongs to a pleno — the guard that keeps
 * the transcriber from fetching the WRONG video (which would attribute spoken
 * claims to the wrong session — a libel surface). Pure; the bash transcriber
 * calls it via scripts/resolve-pleno-video.ts.
 *
 * Matching is by date (the only shared key), disambiguated by `kind` when more
 * than one video shares a date. When it cannot pick safely, it THROWS rather
 * than guess — the caller aborts instead of transcribing an unverified video.
 */

export interface PlenoLite {
  id: string
  date: string
  kind?: string
}

export interface VideoLite {
  plenoDate: string
  kind?: string
  url: string
  title?: string
  ytId?: string
}

export interface VideoMatch {
  url: string
  video: VideoLite
  warnings: string[]
}

const idOf = (v: VideoLite): string => v.ytId ?? v.url

export function resolveVideoForPleno(
  plenoId: string,
  plenos: PlenoLite[],
  videos: VideoLite[],
): VideoMatch {
  const pleno = (plenos ?? []).find((p) => p.id === plenoId)
  if (!pleno) throw new Error(`pleno not found: ${plenoId}`)

  const sameDate = (videos ?? []).filter((v) => v.plenoDate === pleno.date)
  if (sameDate.length === 0) {
    throw new Error(`no video matched for date ${pleno.date} (pleno ${plenoId})`)
  }

  const warnings: string[] = []

  if (sameDate.length === 1) {
    const chosen = sameDate[0]
    if (pleno.kind && chosen.kind && pleno.kind !== chosen.kind) {
      warnings.push(
        `kind mismatch / tipo distinto: el pleno es "${pleno.kind}" pero el vídeo es "${chosen.kind}" — verifica que es la grabación correcta`,
      )
    }
    return { url: chosen.url, video: chosen, warnings }
  }

  // Multiple videos share this date — try to disambiguate by kind.
  const byKind = pleno.kind ? sameDate.filter((v) => v.kind === pleno.kind) : []
  if (byKind.length === 1) {
    warnings.push(
      `varios vídeos (${sameDate.length}) comparten la fecha ${pleno.date}; elegido el de tipo "${pleno.kind}"`,
    )
    return { url: byKind[0].url, video: byKind[0], warnings }
  }

  throw new Error(
    `ambiguo: ${sameDate.length} vídeos para la fecha ${pleno.date}` +
      (pleno.kind ? ` y tipo "${pleno.kind}"` : '') +
      ` — no se puede elegir con seguridad (${sameDate.map(idOf).join(', ')})`,
  )
}
