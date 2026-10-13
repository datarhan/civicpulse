/**
 * Coteja un desglose por grupos publicado en `pleno-votes.json` contra la
 * votación de FONDO del acta de su sesión.
 *
 * Nace de rx4hb4-10/-11: el acta del 09-02-2026 da dos recuentos bajo el punto
 * 11 —la urgencia y el fondo— y lo publicado mezclaba PP y VOX con la urgencia.
 * Por eso sólo se mira `fase === 'fondo'`; «no es urgencia» no basta, porque
 * también existe la ratificación de un asunto sin dictaminar (`acta-votos.ts`).
 *
 * Cinco desenlaces, ninguno plegado en otro (DATA_INTEGRITY, reglas 2 y 3):
 *  - `coincide`: una sola votación de fondo y nada publicado la contradice.
 *  - `contradice`: un grupo que el acta nombra con otro sentido u otros escaños,
 *    o un sentido distinto de a favor/ausente frente a «por unanimidad».
 *  - `ambigua`: más de un fondo bajo el mismo número (las urgencias del 27-07
 *    van todas bajo «Asuntos de urgencia»), un grupo publicado que el acta no
 *    nombra, o un grupo que el acta parte en dos sentidos.
 *  - `no-encontrada`: el acta no tiene fondo para ese punto, o lo tiene sin
 *    desglose legible. Nunca `coincide`: «no lo leí» no es «cuadra».
 *  - `sin-acta`: la sesión no tiene acta indexada. No cuenta como evaluada.
 *
 * Puro: lo usa `scripts/check-votos-acta.ts`, que sólo informa y nunca escribe.
 */
import { SIN_DESGLOSE, type VotacionActa } from './acta-votos'
import type { VoteByBloc } from './pleno-votes'

export type ResultadoCotejo = 'coincide' | 'contradice' | 'ambigua' | 'no-encontrada' | 'sin-acta'

export const RESULTADOS_COTEJO: readonly ResultadoCotejo[] = [
  'coincide',
  'contradice',
  'ambigua',
  'no-encontrada',
  'sin-acta',
]

export interface Cotejo {
  voteId: string
  resultado: ResultadoCotejo
  detalle: string
}

const corta = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function cotejarVoto(
  voto: { id: string; itemNumber: number; votes: VoteByBloc[] },
  votacionesActa: VotacionActa[] | null, // null = la sesión no tiene acta
): Cotejo {
  const de = (resultado: ResultadoCotejo, detalle: string): Cotejo => ({
    voteId: voto.id,
    resultado,
    detalle,
  })
  if (votacionesActa === null) return de('sin-acta', 'la sesión no tiene acta indexada')

  const fondo = votacionesActa.filter((v) => v.itemNumber === voto.itemNumber && v.fase === 'fondo')
  if (fondo.length === 0) {
    return de(
      'no-encontrada',
      `el acta no tiene votación de fondo bajo el punto ${voto.itemNumber}`,
    )
  }
  if (fondo.length > 1) {
    return de(
      'ambigua',
      `${fondo.length} votaciones de fondo bajo el punto ${voto.itemNumber}: ` +
        fondo.map((v) => `«${corta(v.literal)}»`).join(' · '),
    )
  }

  const acta = fondo[0]
  if (acta.unanimidad) {
    const fuera = voto.votes.filter((v) => v.direction !== 'a_favor' && v.direction !== 'ausente')
    if (fuera.length > 0) {
      return de(
        'contradice',
        fuera
          .map((v) => `${v.bloc ?? 'sin grupo'}: publicado ${v.direction}, acta (fondo) unanimidad`)
          .join('; '),
      )
    }
    return de('coincide', 'acta (fondo): por unanimidad')
  }

  // Una cláusula nominal de la que no se leyó ningún grupo no se puede cotejar.
  if (acta.blocs.length === 0 || acta.sinMapear.includes(SIN_DESGLOSE)) {
    return de('no-encontrada', `cláusula sin desglose legible: «${corta(acta.literal)}»`)
  }

  const contradicciones: string[] = []
  const dudas: string[] = []
  const notas: string[] = []
  for (const pub of voto.votes) {
    if (pub.bloc == null) continue
    const filas = acta.blocs.filter((b) => b.bloc === pub.bloc)
    if (filas.length === 0) {
      // Ausente y no nombrado en el recuento es coherente; cualquier otro sentido
      // no se puede confirmar ni negar con este acta.
      if (pub.direction !== 'ausente') {
        dudas.push(`${pub.bloc}: publicado ${pub.direction}, el acta (fondo) no nombra el grupo`)
      }
      continue
    }
    if (filas.length > 1) {
      dudas.push(
        `${pub.bloc}: el acta (fondo) parte el grupo en ` +
          filas.map((f) => `${f.seats} ${f.direction}`).join(' y '),
      )
      continue
    }
    const fila = filas[0]
    if (fila.direction !== pub.direction) {
      contradicciones.push(
        `${pub.bloc}: publicado ${pub.direction}, acta (fondo) ${fila.direction}`,
      )
    } else if (pub.seats != null && pub.seats !== fila.seats) {
      contradicciones.push(
        `${pub.bloc}: publicado ${pub.seats} escaños, acta (fondo) ${fila.seats} (${fila.direction})`,
      )
    }
  }

  // Lo que el acta nombra y lo publicado no: con un escaño sin grupo publicado es
  // el caso de EU-Podem en rx4hb4; nunca es contradicción, se deja dicho.
  const publicados = new Set(voto.votes.map((v) => v.bloc).filter((b) => b != null))
  const nombradosSoloEnActa = [
    ...new Set(acta.blocs.map((b) => b.bloc).filter((b): b is NonNullable<typeof b> => b != null)),
  ].filter((b) => !publicados.has(b))
  const sinGrupo = voto.votes.filter((v) => v.bloc == null).reduce((n, v) => n + (v.seats ?? 1), 0)
  if (nombradosSoloEnActa.length > 0) {
    if (sinGrupo > 0) {
      notas.push(
        `${sinGrupo} escaño${sinGrupo === 1 ? '' : 's'} sin grupo publicado; ` +
          `el acta lo nombra (${nombradosSoloEnActa.join(', ')})`,
      )
    } else {
      notas.push(`el acta (fondo) nombra ${nombradosSoloEnActa.join(', ')}; lo publicado no`)
    }
  }
  if (acta.sinMapear.length > 0) notas.push(`sin mapear en el acta: ${acta.sinMapear.join(', ')}`)

  if (contradicciones.length > 0) {
    return de('contradice', [...contradicciones, ...dudas, ...notas].join('; '))
  }
  if (dudas.length > 0) return de('ambigua', [...dudas, ...notas].join('; '))
  return de('coincide', ['acta (fondo) coincide', ...notas].join('; '))
}

export function resumenCotejo(c: Cotejo[]): {
  porResultado: Record<ResultadoCotejo, number>
  evaluados: number
  falla: boolean
  motivo: string | null
} {
  const porResultado = Object.fromEntries(RESULTADOS_COTEJO.map((r) => [r, 0])) as Record<
    ResultadoCotejo,
    number
  >
  for (const x of c) porResultado[x.resultado] += 1
  const evaluados = c.length - porResultado['sin-acta']
  const leidos = porResultado.coincide + porResultado.contradice + porResultado.ambigua

  let motivo: string | null = null
  if (porResultado.contradice > 0) {
    motivo = `${porResultado.contradice} desglose(s) que el acta contradice`
  } else if (c.length > 0 && evaluados === 0) {
    // Todo «sin-acta»: un índice de actas vacío o roto. Un cotejo que no comparó
    // nada no puede imprimir «ok» (regla 2). Sin desgloses publicados, no aplica.
    motivo = 'no se cotejó ningún desglose publicado'
  } else if (evaluados > 0 && leidos === 0) {
    motivo = `había ${evaluados} votación(es) con acta y no se pudo cotejar ninguna`
  } else if (evaluados > 0 && porResultado['no-encontrada'] / evaluados > 0.2) {
    motivo =
      `«no-encontrada» en ${porResultado['no-encontrada']} de ${evaluados} evaluadas ` +
      `(más del 20 %: el parser o la descarga se han roto)`
  }
  return { porResultado, evaluados, falla: motivo !== null, motivo }
}
