/**
 * El vídeo de una sesión de pleno, de dos fuentes que no se miden igual:
 *
 *   · `canal`   — el canal de YouTube del Ayuntamiento (`pleno-videos.json`). Ata
 *                 un vídeo a la FECHA que su título escribe, y sólo mientras quepa
 *                 en la ventana que lee `scrape-pleno-videos.ts`.
 *   · `regmeet` — la página de la sesión en regmeet (`pleno-videos-regmeet.json`).
 *                 Ata un vídeo a la SESIÓN, porque es el reproductor de su página.
 *
 * Cuando las dos hablan de una sesión y no dicen lo mismo, ninguna gana: la sesión
 * queda `discrepan`, sin vídeo, y la discrepancia se devuelve para que alguien la
 * lea (`check:relations`, `video-fuentes`). Un vídeo atado a la sesión equivocada
 * es una transcripción, y unas citas, atribuidas a otro pleno.
 *
 * Lo que ese alguien decide vive en `pleno-video-decisiones.json`
 * (`pleno-video-decisiones.ts`): con una decisión vigente la sesión queda
 * `decidido`, con el vídeo elegido y sin discrepancia. Una decisión deja de valer
 * en cuanto cualquiera de las dos fuentes cambia, y la discrepancia vuelve.
 *
 * Lo que este módulo NO decide: qué se transcribe. La cola de transcripción
 * (`hallazgos-pipeline.sh`, `transcribe-pleno-batch-list.mjs`,
 * `resolve-pleno-video.ts`) sigue leyendo sólo el canal; un vídeo que sólo da
 * regmeet no entra en ella sin que el operador lo decida, porque transcribir una
 * sesión más publica afirmaciones nuevas (docs/TRANSCRIPTION.md).
 *
 * Puro — sin red, sin fs.
 */
import { urlDeVideo, type LecturaVideoRegmeet } from './regmeet-video'
import { decisionVigente, type DecisionVideo } from './pleno-video-decisiones'

export const FUENTES_VIDEO = ['canal', 'regmeet'] as const
export type FuenteVideo = (typeof FUENTES_VIDEO)[number]

export const ESTADOS_VIDEO_SESION = [
  'coinciden',
  'solo-canal',
  'solo-regmeet',
  'discrepan',
  // Discrepaban, y una persona eligió uno con su razón (`pleno-video-decisiones.ts`).
  'decidido',
  'sin-video',
] as const
export type EstadoVideoSesion = (typeof ESTADOS_VIDEO_SESION)[number]

/**
 * `otro-video`  — el canal tiene vídeo para la fecha y regmeet incrusta otro.
 * `otra-fecha`  — regmeet incrusta un vídeo que el canal titula con otra fecha.
 * `otra-sesion` — el vídeo que una fuente da a esta sesión, regmeet se lo da a otra.
 */
export const TIPOS_DISCREPANCIA = ['otro-video', 'otra-fecha', 'otra-sesion'] as const
export type TipoDiscrepancia = (typeof TIPOS_DISCREPANCIA)[number]

export interface SesionLite {
  id: string
  date: string
}

export interface VideoCanal {
  ytId: string
  url: string
  plenoDate: string
  title?: string
}

/** Una fila de `pleno-videos-regmeet.json`. */
export interface FilaRegmeet {
  plenoId: string
  fecha: string
  lectura: LecturaVideoRegmeet
  ytId: string | null
  url: string | null
}

export interface VideoResuelto {
  ytId: string
  url: string
  /** El título del canal; null cuando el vídeo sólo lo da regmeet. */
  title: string | null
  fuentes: FuenteVideo[]
}

export interface Discrepancia {
  plenoId: string
  fecha: string
  tipo: TipoDiscrepancia
  /** Ids que el canal da a la fecha de la sesión. */
  canal: string[]
  /** Id que la página de la sesión incrusta, o null. */
  regmeet: string | null
  detalle: string
}

export interface VideoDeSesion {
  estado: EstadoVideoSesion
  video: VideoResuelto | null
  discrepancias: Discrepancia[]
  /** La decisión que zanja la discrepancia, sólo con estado `decidido`. */
  decision: DecisionVideo | null
}

const idDeRegmeet = (f: FilaRegmeet | undefined): string | null =>
  f?.lectura === 'con-video' && f.ytId ? f.ytId : null

/**
 * El vídeo de `sesion`. `canal` y `regmeet` son las listas enteras, no las de la
 * sesión: una discrepancia puede venir de otra fecha o de otra sesión.
 */
export function videoDeSesion(
  sesion: SesionLite,
  canal: readonly VideoCanal[],
  regmeet: readonly FilaRegmeet[],
  decisiones: readonly DecisionVideo[] = [],
): VideoDeSesion {
  const propia = idDeRegmeet(regmeet.find((f) => f.plenoId === sesion.id))
  const delCanal = canal.filter((v) => v.plenoDate === sesion.date)
  const idsCanal = delCanal.map((v) => v.ytId)
  const deOtraSesion = (ytId: string) =>
    regmeet.filter((f) => f.plenoId !== sesion.id && idDeRegmeet(f) === ytId)

  const discrepancias: Discrepancia[] = []
  const anota = (tipo: TipoDiscrepancia, detalle: string) => {
    if (discrepancias.some((d) => d.tipo === tipo)) return
    discrepancias.push({
      plenoId: sesion.id,
      fecha: sesion.date,
      tipo,
      canal: idsCanal,
      regmeet: propia,
      detalle,
    })
  }

  if (propia && idsCanal.length > 0 && !idsCanal.includes(propia)) {
    anota(
      'otro-video',
      `el canal da ${idsCanal.join(', ')} a ${sesion.date}; regmeet incrusta ${propia}`,
    )
  }
  if (propia) {
    for (const v of canal) {
      if (v.ytId === propia && v.plenoDate !== sesion.date) {
        anota(
          'otra-fecha',
          `regmeet incrusta ${propia}, que el canal titula como del ${v.plenoDate}`,
        )
      }
    }
  }
  // Sólo el vídeo que esta sesión enseñaría: con dos sesiones el mismo día, el
  // canal da a las dos los dos vídeos de la fecha, y el de la otra no es una
  // discrepancia de ésta.
  const mostrado = propia ?? delCanal[delCanal.length - 1]?.ytId ?? null
  const otras = mostrado ? deOtraSesion(mostrado) : []
  if (otras.length > 0) {
    anota(
      'otra-sesion',
      `${mostrado} es también el vídeo que regmeet incrusta en ${otras.map((f) => `${f.plenoId} (${f.fecha})`).join(', ')}`,
    )
  }

  if (discrepancias.length > 0) {
    const d = decisiones.find((x) => x.plenoId === sesion.id)
    if (d && decisionVigente(d, idsCanal, propia)) {
      const delCanalElegido = canal.find((v) => v.ytId === d.elegido)
      const fuentes: FuenteVideo[] = [
        ...(idsCanal.includes(d.elegido) ? (['canal'] as const) : []),
        ...(propia === d.elegido ? (['regmeet'] as const) : []),
      ]
      return {
        estado: 'decidido',
        video: {
          ytId: d.elegido,
          url: delCanalElegido?.url ?? urlDeVideo(d.elegido),
          title: delCanalElegido?.title ?? null,
          fuentes,
        },
        discrepancias: [],
        decision: d,
      }
    }
    // Una decisión tomada entre otros vídeos no zanja ésta: se dice, para que
    // quien lea la alerta sepa que ya se decidió una vez y qué ha cambiado.
    const caducada = d
      ? ` (la decisión del ${d.decididoEl} ya no vale: entonces el canal daba ${d.canal.join(', ') || '—'} y regmeet ${d.regmeet ?? '—'})`
      : ''
    return {
      estado: 'discrepan',
      video: null,
      discrepancias: discrepancias.map((x) => ({ ...x, detalle: x.detalle + caducada })),
      decision: null,
    }
  }
  if (propia) {
    const delMismo = delCanal.find((v) => v.ytId === propia)
    return delMismo
      ? {
          estado: 'coinciden',
          video: {
            ytId: propia,
            url: delMismo.url,
            title: delMismo.title ?? null,
            fuentes: ['canal', 'regmeet'],
          },
          discrepancias,
          decision: null,
        }
      : {
          estado: 'solo-regmeet',
          video: { ytId: propia, url: urlDeVideo(propia), title: null, fuentes: ['regmeet'] },
          discrepancias,
          decision: null,
        }
  }
  if (delCanal.length > 0) {
    // Con varios del canal para una fecha, el último: lo que hacía `indexVideosByPleno`
    // antes de que hubiera una segunda fuente. Hoy ninguna fecha tiene dos; el
    // transcriptor, que sí necesita elegir bien, se niega (`resolveVideoForPleno`).
    const v = delCanal[delCanal.length - 1]
    return {
      estado: 'solo-canal',
      video: { ytId: v.ytId, url: v.url, title: v.title ?? null, fuentes: ['canal'] },
      discrepancias,
      decision: null,
    }
  }
  return { estado: 'sin-video', video: null, discrepancias, decision: null }
}

/**
 * Todas las discrepancias entre las dos fuentes, sesión a sesión. Las que zanja
 * una decisión vigente no salen; las de una decisión caducada sí, y lo dicen.
 */
export function discrepanciasDeVideo(
  sesiones: readonly SesionLite[],
  canal: readonly VideoCanal[],
  regmeet: readonly FilaRegmeet[],
  decisiones: readonly DecisionVideo[] = [],
): Discrepancia[] {
  return sesiones.flatMap((s) => videoDeSesion(s, canal, regmeet, decisiones).discrepancias)
}
