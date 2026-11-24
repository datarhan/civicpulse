/**
 * Re-apply Gate 2b (`respuestaBreve`) to a speaker map stored before it
 * existed. No model is called: the map carries its own segments, so the rule
 * the validator applies today can be applied to yesterday's rows.
 *
 * Only ever weakening. A row the rule rejects moves from `rows` to `rejected`
 * with the same reason and detail a fresh run would give, and nothing else in
 * the map changes: no row is added, no bloc changes, no other gate is re-run.
 * Re-running the whole validator would also drop rows for unrelated reasons
 * (a citation that crosses a chunk seam), and each of those needs its own look.
 *
 * Per CHUNK, as the validator saw it. Labels and times are global in a stored
 * map (`c03/SPEAKER_01`, seconds into the session); the rule only compares
 * neighbouring segments, so filtering a chunk's segments by its label prefix
 * reproduces what the validator saw.
 *
 * A row whose cited segment is no longer in the map moves too, under its own
 * `evidence-segment-missing` (see the 15uvjew note below): without its segment
 * the row stands on nothing.
 *
 * Three outcomes per row, kept apart (DATA_INTEGRITY rule 2): kept, moved, and
 * not evaluated — a back-reference (the gate does not apply), a row with no
 * evidence, no chunk prefix or no own line next to the evidence is kept and
 * counted, never folded into «kept because clean».
 */
import type { SpeakerMap, SpeakerMapRow } from './speaker-map'
import { respuestaBreve, rejectionTally, segmentAt } from './speaker-map-validate'

export const REGLA_REVALIDACION = 'respuesta-breve-y-prueba-perdida'

export interface ResultadoRevalidacion {
  map: SpeakerMap
  /** Kept AND evaluated clean. Rows kept unevaluated are in `noEvaluadas`. */
  conservadas: number
  retiradas: Array<{ label: string; bloc: string | null; reason: string; detail: string }>
  noEvaluadas: Array<{ label: string; why: string }>
}

const prefijo = (label: string) => label.slice(0, label.indexOf('/') + 1)

export function revalidarMapa(map: SpeakerMap, fecha: string): ResultadoRevalidacion {
  const keep: SpeakerMapRow[] = []
  const retiradas: ResultadoRevalidacion['retiradas'] = []
  const noEvaluadas: ResultadoRevalidacion['noEvaluadas'] = []
  for (const r of map.rows) {
    const ev = r.evidence[0]
    const pre = prefijo(r.label)
    if (!ev || !pre) {
      noEvaluadas.push({
        label: r.label,
        why: !ev ? 'row carries no evidence' : 'label has no chunk prefix',
      })
      keep.push(r)
      continue
    }
    const segs = map.segments.filter((s) => s.speaker.startsWith(pre))
    const i = segmentAt(segs, ev.at)
    if (i < 0) {
      // The cited segment is no longer in the stored map. Not the model's
      // citation failing: on 15uvjew (c02 @1857 and @1860, c07 @4900) the
      // evidence WAS in the map until a resume dropped chunk 2's and chunk 7's
      // overshooting tail by time while keeping their rows by label (fixed in
      // `conservarAlReanudar`). The map's own text can no longer show the grant,
      // so the row cannot stand — under its own reason, not Gate 1's.
      retiradas.push({
        label: r.label,
        bloc: r.bloc,
        reason: 'evidence-segment-missing',
        detail: `no segment of ${pre.slice(0, -1)} contains ${ev.at}s any more`,
      })
      continue
    }
    // Gate 2b looks at the identified label's own line next to the evidence.
    // A back-reference has none by design, and a missing or foreign neighbour
    // means the rule could not look: kept, and counted as not evaluated, never
    // folded into «kept because clean».
    const propia = ev.relation === 'turn-grant' ? i + 1 : ev.relation === 'reply' ? i - 1 : -1
    if (propia < 0) {
      noEvaluadas.push({ label: r.label, why: `${ev.relation}: Gate 2b does not apply` })
      keep.push(r)
      continue
    }
    if (segs[propia]?.speaker !== r.label) {
      noEvaluadas.push({
        label: r.label,
        why: `${ev.relation} at ${ev.at}s: the label's own line next to it is not in the map`,
      })
      keep.push(r)
      continue
    }
    const breve = respuestaBreve(segs, i, r.label, ev)
    if (breve) retiradas.push({ label: r.label, bloc: r.bloc, ...breve })
    else keep.push(r)
  }
  // Idempotent: a second pass of the same rule that finds nothing leaves the
  // map byte-identical. A FIRST pass always leaves its record, clean or not —
  // otherwise a clean map would read as one the rule never looked at.
  const yaPasada = (map.revalidaciones ?? []).some((x) => x.regla === REGLA_REVALIDACION)
  if (retiradas.length === 0 && yaPasada) {
    return { map, conservadas: keep.length - noEvaluadas.length, retiradas, noEvaluadas }
  }
  const rejected = [
    ...map.rejected,
    ...retiradas.map(({ label, reason, detail }) => ({ label, reason, detail })),
  ]
  return {
    map: {
      ...map,
      rows: keep,
      rejected,
      stats: {
        ...map.stats,
        rowsAccepted: keep.length,
        rowsRejected: rejected.length,
        rejectedBy: rejectionTally(rejected as Parameters<typeof rejectionTally>[0]),
      },
      revalidaciones: [
        ...(map.revalidaciones ?? []),
        {
          fecha,
          regla: REGLA_REVALIDACION,
          retiradas: retiradas.length,
          noEvaluadas: noEvaluadas.length,
        },
      ],
    },
    conservadas: keep.length - noEvaluadas.length,
    retiradas,
    noEvaluadas,
  }
}
