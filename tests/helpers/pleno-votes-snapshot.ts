/**
 * Constructores de instantáneas de pleno-votes para las pruebas.
 *
 * Salieron de tests/retract-pleno-vote.test.ts cuando una segunda prueba
 * (tests/corregir-desglose-voto.test.ts) necesitó el mismo corpus. La regla que
 * los gobierna sigue siendo la suya: cada voto lo produce el `validateVote` de
 * producción y cada instantánea el `validateSnapshot` de producción, así que los
 * enums, la deduplicación de grupos, el centinela `Otro` retirado y el
 * emparejamiento votes/votesRetracted son los de verdad. Un fixture que se aparte
 * del esquema revienta al construirse en vez de medir nada en silencio
 * (docs/DATA_INTEGRITY.md, regla 1).
 */
import {
  validateVote,
  validateSnapshot,
  retractVoteBreakdown,
  type PlenoVote,
  type VoteRetraction,
  type VoteBreakdownCorrection,
  type PlenoVotesSnapshot,
} from '../../src/scraper/pleno-votes'

export const FIXTURE_URL = 'https://example.org/actas/fixture.pdf'

/** One citation per claim. `acta` because the fixture's source is an acta PDF,
 *  and an acta is the one kind that carries BOTH halves — so a fixture built on
 *  it keeps exercising the outcome and the breakdown together. */
export function fixtureProvenance(votes: unknown[]) {
  const ref = {
    kind: 'acta' as const,
    url: FIXTURE_URL,
    publisher: 'Fixture — Ayuntamiento de Riba-roja de Túria',
    retrievedAt: '2026-03-20',
    verification: 'sin-verificar' as const,
  }
  return { outcome: ref, breakdown: votes.length > 0 ? ref : null }
}

/**
 * Build one fixture vote THROUGH the production validator, so the fixture
 * cannot restate a shape the parser no longer accepts: an unknown bloc, a
 * duplicated group, a title under 20 chars or a `dueBy` without its verbatim
 * clause throws here, in the fixture, rather than passing silently.
 */
export function makeVote(id: string, over: Partial<PlenoVote> = {}): PlenoVote {
  const [plenoId, num] = id.split('-')
  const votes = over.votes ?? [
    { bloc: 'PSOE' as const, direction: 'a_favor' as const, seats: 11 },
    { bloc: 'PP' as const, direction: 'en_contra' as const, seats: 7 },
  ]
  return validateVote({
    id,
    plenoId,
    itemNumber: Number(num),
    plenoDate: '2026-03-12',
    title: 'Aprobación del expediente de contratación del banco de pruebas',
    outcome: 'aprobado',
    sourceUrl: FIXTURE_URL,
    sourcePublisher: 'Fixture — Ayuntamiento de Riba-roja de Túria',
    retrievedAt: '2026-03-20',
    provenance: fixtureProvenance(votes),
    ...over,
    votes,
  })
}

/** Same trick one level up: the snapshot invariants are the production ones. */
export function makeSnapshot(
  items: PlenoVote[],
  retractions: VoteRetraction[] = [],
  corrections: VoteBreakdownCorrection[] = [],
): PlenoVotesSnapshot {
  return validateSnapshot({
    generatedAt: '2026-08-05T00:00:00.000Z',
    source: { description: 'fixture', contract: 'fixture' },
    items,
    retractions,
    corrections,
  })
}

const PORTAL_RX4HB4 =
  'https://regmeet.com/aytoribarroja/participaciones/c5b270a763686e776039618cc709f3a6?idioma=castellano'

/**
 * `rx4hb4-11` tal como se publicaba el 13-10-2026: el resultado leído del portal
 * de regmeet y el desglose de la transcripción automática, con PP en
 * abstención y VOX en contra —lo contrario de lo que recoge el acta— y el escaño
 * de EU-Podem sin grupo. Sin el `dueByRetracted` del publicado: ese sello exige
 * su retirada en el libro, que este corpus no necesita.
 */
export function rx4hb4Item11(): PlenoVote {
  return validateVote({
    id: 'rx4hb4-11',
    plenoId: 'rx4hb4',
    plenoDate: '2026-02-09',
    itemNumber: 11,
    title:
      "Assumptes d'Urgència – Expedient 647/2026/GEN, “Aprovació PAI EDIL i sol·licitud de la convocatòria de senda financera”",
    outcome: 'aprobado',
    votes: [
      { bloc: 'PSOE', direction: 'a_favor', seats: 11 },
      { bloc: 'Compromís', direction: 'a_favor', seats: 1 },
      { bloc: 'PP', direction: 'abstencion', seats: 7 },
      { bloc: 'VOX', direction: 'en_contra', seats: 1 },
      { bloc: null, direction: 'a_favor', seats: 1 },
    ],
    provenance: {
      outcome: {
        kind: 'regmeet',
        url: PORTAL_RX4HB4,
        publisher: 'Ayuntamiento de Riba-roja de Túria',
        retrievedAt: '2026-06-24',
        verification: 'sin-verificar',
      },
      breakdown: {
        kind: 'transcripcion',
        url: '/data/pleno-transcripts/rx4hb4.txt',
        publisher: 'CivicPulse — transcripción automática (Whisper) de la sesión',
        retrievedAt: '2026-08-01',
        verification: 'sin-verificar',
      },
    },
    sourceUrl: PORTAL_RX4HB4,
    sourcePublisher: 'Ayuntamiento de Riba-roja de Túria',
    retrievedAt: '2026-06-24',
  })
}

/** Un corpus con `rx4hb4-11` y un voto ajeno, para que nada dependa de estar solo. */
export function buildSnapshot(): PlenoVotesSnapshot {
  return makeSnapshot([rx4hb4Item11(), makeVote('fixa-01')])
}

/**
 * El mismo corpus con el desglose de `voteId` retirado por el `retractVoteBreakdown`
 * de producción —nunca una entrada del libro escrita a mano— y revalidado.
 */
export function buildSnapshotWithBreakdownRetracted(voteId: string): PlenoVotesSnapshot {
  return validateSnapshot(
    retractVoteBreakdown(buildSnapshot(), voteId, {
      reason: 'la fuente citada no publica este desglose por grupos',
      editor: 'Test Curator',
      at: '2026-10-12T10:00:00.000Z',
    }),
  )
}
