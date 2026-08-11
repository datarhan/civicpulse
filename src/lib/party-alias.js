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
  // Spoken forms. The chair announces groups aloud when granting the floor,
  // and does so in Valencian as often as in Castilian — «Teresa, sí, del
  // Partit Socialista», «com ha comentat el regidor del Partit Popular».
  // Those announcements are the evidence the speaker map rests on, so the
  // spoken label has to reconcile or the evidence is unreadable.
  'partido socialista': 'PSOE',
  'partit socialista': 'PSOE',
  pp: 'PP',
  'partido popular': 'PP',
  'partit popular': 'PP',
  vox: 'VOX',
  compromis: 'Compromís',
  'coalicio compromis': 'Compromís',
  bloc: 'Compromís',
  // Grupo Municipal Esquerra Unida-Podem (acta de organización, 07-07-2023).
  podem: 'EU-Podem',
  'unides podem': 'EU-Podem',
  eupv: 'EU-Podem',
  'esquerra unida': 'EU-Podem',
  'esquerra unida podem': 'EU-Podem',
  'esquerra unida unides podem': 'EU-Podem',
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
 * Every roster party NAMED INSIDE a sentence, in order of appearance.
 *
 * `normalizeParty` reconciles a whole label; this finds one mentioned in
 * running speech, which is what a turn-grant is: «Gràcies per la puntualitat.
 * Vox, José Luis.»
 *
 * Longest alias wins, so «esquerra unida podem» does not also fire the
 * `podem` rule, and matching is word-bounded — an unbounded `pp` would hit
 * «supposadament» and quietly certify the wrong group.
 *
 * Callers use this to check that a claimed party is actually *acredited* by
 * the audio. A model asked for a party will supply one whether the evidence
 * carries it or not: in the 2026-08-10 fixture it answered «Partido Popular»
 * citing a line that says only «Es paraules. Abert, Pep?».
 */
export function findPartiesInText(text) {
  const hay = ` ${fold(text)} `
  if (hay.trim() === '') return []
  const found = []
  const byLongest = Object.keys(ALIASES).sort((a, b) => b.length - a.length)
  const claimed = []
  for (const alias of byLongest) {
    let from = 0
    for (;;) {
      const at = hay.indexOf(alias, from)
      if (at < 0) break
      from = at + alias.length
      const before = hay[at - 1]
      const after = hay[at + alias.length]
      // Word boundary on both sides: letters and digits only, so a hyphen or
      // punctuation still counts as a boundary («eu-podem», «Vox,»).
      if (/[a-z0-9]/.test(before ?? '') || /[a-z0-9]/.test(after ?? '')) continue
      // A longer alias already claimed this span.
      if (claimed.some(([s, e]) => at < e && at + alias.length > s)) continue
      claimed.push([at, at + alias.length])
      found.push({ at, party: ALIASES[alias] })
    }
  }
  found.sort((a, b) => a.at - b.at)
  const out = []
  for (const f of found) if (!out.includes(f.party)) out.push(f.party)
  return out
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
