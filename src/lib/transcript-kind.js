// @ts-check
/**
 * Is this file a transcript of what was SAID, or the text of the official
 * minutes?
 *
 * Both live in `public/data/pleno-transcripts/*.txt`, share the same
 * extension, the same `[start → end] text` line shape, and the same
 * "Ver transcripción" tab. 23 of 42 files are actually acta text lifted from
 * the municipal PDF, written with synthetic `[0.0 → 0.0]` stamps because there
 * is no audio behind them — `1080zow.txt` opens «ACTA SESIÓN ORDINARIA
 * CELEBRADA POR EL / AYUNTAMIENTO PLENO EL DÍA 15 DE ABRIL DE 2024». One of
 * them alone supplies 1,027 published claims, 22% of the ledger.
 *
 * The difference matters to a reader: an acta is a secretary's summary, already
 * edited and condensed, so a "verbatim" drawn from it is a quote of the minutes,
 * not of a councillor's mouth.
 */

const STAMP = /^\[\s*([\d.]+)\s*→\s*([\d.]+)\s*\]/

/**
 * @param {string|null|undefined} text
 * @returns {'audio'|'acta'|'unknown'}
 */
export function transcriptKind(text) {
  if (!text) return 'unknown'
  let stamped = 0
  let moving = 0
  for (const line of text.split('\n')) {
    const m = line.match(STAMP)
    if (!m) continue
    stamped += 1
    if (Number(m[1]) !== 0 || Number(m[2]) !== 0) moving += 1
    // A handful of real stamps is already proof of audio; no need to read a
    // 200 KB file to the end.
    if (moving >= 3) return 'audio'
  }
  if (stamped === 0) return 'unknown'
  return 'acta'
}
