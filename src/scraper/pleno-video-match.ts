/**
 * Resolve which YouTube recording belongs to a pleno — the guard that keeps
 * the transcriber from fetching the WRONG video (which would attribute spoken
 * claims to the wrong session — a libel surface). Pure; the bash transcriber
 * calls it via scripts/resolve-pleno-video.ts.
 *
 * Matching is by date (the only shared key), disambiguated by `kind` when more
 * than one video shares a date. When it cannot pick safely, it THROWS rather
 * than guess — the caller aborts instead of transcribing an unverified video.
 *
 * La página de la sesión en regmeet es un segundo testigo (`pleno-video-fuentes.ts`).
 * Si se pasa y no dice lo mismo que el canal, también lanza: la discrepancia la
 * lee una persona, no la zanja el transcriptor. Un vídeo que sólo da regmeet NO
 * se resuelve aquí: la cola de transcripción lee sólo el canal hasta que el
 * operador decida otra cosa.
 *
 * Y regmeet tampoco desempata. Con dos grabaciones del canal para una fecha (el
 * directo y una subida del 23-12-2025; el «Part I» y el «Part II» del 13-02-2023),
 * que la página de la sesión incruste una no dice cuál se transcribió: el mapa de
 * hablantes y los recortes de voz cortan en los tiempos de ESA transcripción, y
 * la grabación de la que salió no consta en ningún fichero. Elegir la de regmeet
 * bajaría otra, con otros tiempos; por eso sigue lanzando «ambiguo».
 */
import { videoDeSesion, type FilaRegmeet } from './pleno-video-fuentes'

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
  regmeet?: readonly FilaRegmeet[],
): VideoMatch {
  const pleno = (plenos ?? []).find((p) => p.id === plenoId)
  if (!pleno) throw new Error(`pleno not found: ${plenoId}`)

  const testigo = regmeet?.length
    ? videoDeSesion(
        pleno,
        (videos ?? []).flatMap((v) => (v.ytId ? [{ ...v, ytId: v.ytId }] : [])),
        regmeet,
      )
    : null
  if (testigo?.estado === 'discrepan') {
    throw new Error(
      `discrepan el canal y regmeet para ${plenoId} (${pleno.date}): ` +
        testigo.discrepancias.map((d) => d.detalle).join('; '),
    )
  }

  const sameDate = (videos ?? []).filter((v) => v.plenoDate === pleno.date)
  if (sameDate.length === 0) {
    const soloRegmeet =
      testigo?.estado === 'solo-regmeet'
        ? ` — regmeet incrusta ${testigo.video?.ytId}, pero la cola de transcripción sólo lee el canal`
        : ''
    throw new Error(`no video matched for date ${pleno.date} (pleno ${plenoId})${soloRegmeet}`)
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
