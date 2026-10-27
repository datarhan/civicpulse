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
 * Lo que este módulo NO decide: qué se transcribe. La cola de transcripción
 * (`hallazgos-pipeline.sh`, `transcribe-pleno-batch-list.mjs`,
 * `resolve-pleno-video.ts`) sigue leyendo sólo el canal; un vídeo que sólo da
 * regmeet no entra en ella sin que el operador lo decida, porque transcribir una
 * sesión más publica afirmaciones nuevas (docs/TRANSCRIPTION.md).
 *
 * Puro — sin red, sin fs.
 */
import { urlDeVideo, type LecturaVideoRegmeet } from './regmeet-video'

export const FUENTES_VIDEO = ['canal', 'regmeet'] as const
export type FuenteVideo = (typeof FUENTES_VIDEO)[number]

export const ESTADOS_VIDEO_SESION = [
  'coinciden',
  'solo-canal',
  'solo-regmeet',
  'discrepan',
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

  if (discrepancias.length > 0) return { estado: 'discrepan', video: null, discrepancias }
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
        }
      : {
          estado: 'solo-regmeet',
          video: { ytId: propia, url: urlDeVideo(propia), title: null, fuentes: ['regmeet'] },
          discrepancias,
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
    }
  }
  return { estado: 'sin-video', video: null, discrepancias }
}

/** Todas las discrepancias entre las dos fuentes, sesión a sesión. */
export function discrepanciasDeVideo(
  sesiones: readonly SesionLite[],
  canal: readonly VideoCanal[],
  regmeet: readonly FilaRegmeet[],
): Discrepancia[] {
  return sesiones.flatMap((s) => videoDeSesion(s, canal, regmeet).discrepancias)
}
