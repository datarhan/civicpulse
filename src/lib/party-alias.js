// @ts-check
/**
 * Reconcile the party label an election result uses with the label the
 * corporation roster uses.
 *
 * `elections.json` records the ballot name — PSPV-PSOE, EUPV, Podem — while
 * `officials.json` carries the group name the councillor sits under: PSOE,
 * Compromís, Otro. Without a bridge the two datasets never join, which is why
 * a councillor's own electoral mandate appeared nowhere in the app despite
 * twelve elections being scraped.
 *
 * Deliberately conservative: an unrecognised ballot label returns null rather
 * than being forced onto the nearest group. Attributing another party's vote
 * share to a councillor would be a factual error about their mandate.
 */
const ALIASES = {
  // The Valencian federation of the PSOE.
  'pspv-psoe': 'PSOE',
  pspv: 'PSOE',
  psoe: 'PSOE',
  pp: 'PP',
  'partido popular': 'PP',
  vox: 'VOX',
  compromis: 'Compromís',
  'coalicio compromis': 'Compromís',
  bloc: 'Compromís',
  // Grupo Municipal Esquerra Unida-Podem (acta de organización, 07-07-2023).
  podem: 'EU-Podem',
  'unides podem': 'EU-Podem',
  eupv: 'EU-Podem',
  'esquerra unida': 'EU-Podem',
  'eu-podem': 'EU-Podem',
  'izquierda unida': 'EU-Podem',
}

const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/** Roster party for a ballot label, or null when it maps to no current group. */
export function normalizeParty(ballotLabel) {
  if (!ballotLabel) return null
  return ALIASES[fold(ballotLabel)] ?? null
}

/**
 * Vote share for a roster party at the most recent municipal election.
 * Returns null when the party did not stand or cannot be reconciled.
 */
export function latestVoteShare(elections, rosterParty) {
  if (!elections?.elections?.length || !rosterParty) return null
  const latest = [...elections.elections].sort((a, b) => b.year - a.year)[0]
  if (!latest) return null
  for (const r of latest.results ?? []) {
    if (normalizeParty(r.party) === rosterParty) {
      return {
        year: latest.year,
        pct: r.pct,
        ballotLabel: r.party,
        abstencionPct: latest.abstencionPct,
      }
    }
  }
  return null
}
