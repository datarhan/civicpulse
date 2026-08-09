/**
 * The prompt's similarity annotation, and the strip that takes it back off.
 *
 * A published «Documentos cotejados» row on /hallazgos ended `· unknown ·
 * sim=0.50`: the model was shown the rendered candidate line, returned the
 * line, the runner stored it, and an auto-curator copied it into a curated
 * file. These tests pin the emitter and its inverse TOGETHER — the failure
 * mode this file exists for is not "the strip is wrong today", it is "the
 * prompt format moved and the strip silently stopped matching", which looks
 * exactly like nothing needing stripping.
 */
import { describe, it, expect } from 'vitest'

import {
  formatSimilarityAnnotation,
  stripSimilarityAnnotation,
  SIMILARITY_ANNOTATION_RE,
} from '../src/llm/candidate-annotation'
import { buildClaimVerifierUserPrompt } from '../src/llm/prompts'
import { toPublishedSnippet } from '../src/scraper/claim-verifier'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import { validatePressFindingsSnapshot } from '../src/scraper/press-finding'

const SNIPPET = 'Aplicativo área de policía local · Ayuntamiento de Riba-roja de Túria · unknown'

describe('candidate annotation — emitter and inverse', () => {
  it('round-trips: anything the emitter can add, the stripper removes', () => {
    // The anti-drift assertion. Change the format in one and this goes red,
    // instead of the strip quietly becoming a no-op.
    let checked = 0
    for (const sim of [0, 0.2, 0.22, 0.5, 0.499, 1]) {
      const rendered = `${SNIPPET}${formatSimilarityAnnotation(sim)}`
      expect(rendered).not.toBe(SNIPPET)
      expect(stripSimilarityAnnotation(rendered)).toBe(SNIPPET)
      checked += 1
    }
    expect(checked).toBe(6)
  })

  it('emits nothing for a candidate with no similarity, and strips nothing back', () => {
    expect(formatSimilarityAnnotation(null)).toBe('')
    expect(formatSimilarityAnnotation(undefined)).toBe('')
    expect(stripSimilarityAnnotation(SNIPPET)).toBe(SNIPPET)
  })

  it('is idempotent and clears a doubled annotation', () => {
    const twice = `${SNIPPET} · sim=0.50 · sim=0.22`
    expect(stripSimilarityAnnotation(twice)).toBe(SNIPPET)
    expect(stripSimilarityAnnotation(stripSimilarityAnnotation(twice))).toBe(SNIPPET)
  })

  it('leaves a document that merely contains "sim=" in its body alone', () => {
    // Anchored to the end. A title is not the pipeline's annotation just
    // because the three characters appear in it.
    const body = 'Estudio sim=0.50 en el título del expediente y algo más después'
    expect(stripSimilarityAnnotation(body)).toBe(body)
    expect(SIMILARITY_ANNOTATION_RE.test(body)).toBe(false)
  })

  it('the verifier prompt still shows the model the score', () => {
    // Stripping is a publishing concern, not a retrieval one: the model must
    // keep seeing how confident the shortlist was.
    const prompt = buildClaimVerifierUserPrompt({
      claim: {
        type: 'cita_dato',
        topic: 'seguridad',
        speakerGroup: 'PSOE',
        verbatim: 'una unidad de policía local que acompaña a todas las mujeres',
        context: 'debate sobre seguridad',
        entities: { amountEuros: null, count: null, date: null },
      },
      candidates: [
        { kind: 'tender', ref: 'https://example.test/a', snippet: SNIPPET, similarity: 0.5 },
      ],
    })
    expect(prompt).toContain('sim=0.50')
  })
})

describe('toPublishedSnippet — the one door from evidence to a published label', () => {
  it('drops the annotation the model copied back', () => {
    expect(toPublishedSnippet(`${SNIPPET} · sim=0.50`)).toBe(SNIPPET)
  })

  it('marks a truncation instead of cutting silently', () => {
    const long = 'x'.repeat(300)
    const out = toPublishedSnippet(long)
    expect(out.length).toBeLessThanOrEqual(240)
    expect(out.endsWith('…')).toBe(true)
  })

  it('leaves a snippet that already fits exactly as it is', () => {
    expect(toPublishedSnippet(SNIPPET)).toBe(SNIPPET)
  })

  it('strips before measuring, so the annotation cannot push a snippet over the cap', () => {
    const body = 'y'.repeat(238)
    expect(toPublishedSnippet(`${body} · sim=0.50`)).toBe(body)
  })
})

describe('the findings validators are the door, so the strip is on the door', () => {
  // Both curated files are written by exactly one kind of process: a CLI that
  // re-serialises the whole snapshot through its validator (the PreToolUse
  // guard denies everything else). Stripping here is what makes "the file
  // cannot hold one" true, rather than "no current builder emits one" — which
  // was already true of two of the three builders on the day a row shipped
  // carrying `· sim=0.50`.

  const plenoSnapshot = (snippet: string) =>
    JSON.stringify({
      version: '1.0',
      generatedAt: '2026-08-09T00:00:00Z',
      legalNotice:
        'Registro editorial público con cita verbatim, contraste documental y derecho de réplica.',
      contactUrl: 'https://github.com/datarhan/civicpulse/issues/new/choose',
      methodologyUrl: '/metodologia',
      items: [
        {
          id: 'f-2026-01-01-tst-000001',
          plenoId: 'tst',
          plenoDate: '2026-01-01',
          title: 'Un hallazgo de prueba con título suficiente',
          summary:
            'Un resumen editorial de prueba, lo bastante largo para pasar el mínimo que impone el esquema.',
          severity: 'informational',
          sourceClaimIds: ['tst-001-afi-000001'],
          quotes: [
            {
              text: 'una cita verbatim de prueba con longitud suficiente',
              speakerGroup: 'PSOE',
              sourceClaimId: 'tst-001-afi-000001',
            },
          ],
          crossChecked: [{ kind: 'tender', ref: 'https://example.test/x', snippet }],
          contradiction: [],
          relatedPromiseIds: [],
          curatorName: 'test-suite',
          publishedAt: '2026-01-02',
        },
      ],
    })

  it('validateFindingsSnapshot strips it out of a crossChecked snippet', () => {
    const parsed = validateFindingsSnapshot(plenoSnapshot(`${SNIPPET} · sim=0.50`))
    expect(parsed.items[0].crossChecked[0].snippet).toBe(SNIPPET)
  })

  it('validateFindingsSnapshot leaves a clean snippet byte-identical', () => {
    const parsed = validateFindingsSnapshot(plenoSnapshot(SNIPPET))
    expect(parsed.items[0].crossChecked[0].snippet).toBe(SNIPPET)
  })

  it('validateFindingsSnapshot still refuses a snippet that is only an annotation', () => {
    // Stripping must not turn an empty label into a valid one.
    expect(() => validateFindingsSnapshot(plenoSnapshot(' · sim=0.50'))).toThrow(
      /snippet must be 1-240 chars/,
    )
  })

  it('validatePressFindingsSnapshot strips it too', () => {
    // press-findings.json carries none today. It is fed by the same evidence
    // path that put one on /hallazgos, so the guarantee belongs on both.
    const snap = JSON.stringify({
      version: '1',
      generatedAt: '2026-08-09',
      legalNotice:
        'Auditoría editorial. Las verificaciones contrastan datos municipales públicos con la prensa citada.',
      contactUrl: 'https://github.com/datarhan/civicpulse/issues/new/choose',
      methodologyUrl: '/metodologia',
      items: [
        {
          id: 'pf-test-001',
          sourceClaimIds: ['test-art-001-0-num'],
          articleIds: ['test-art-001'],
          articleFingerprints: ['fp-fake-001'],
          attributedOutlets: ['Test Outlet'],
          earliestArticleDate: '2026-05-19',
          latestArticleDate: '2026-05-20',
          title: 'Verificación: la cifra coincide con BDNS',
          summary:
            'El medio menciona 185.000 € destinados al parque del Túria. La convocatoria BDNS BDB-2026-001 registra una cifra equivalente.',
          severity: 'informational',
          quotes: [
            {
              text: 'Riba-roja invierte 185.000 € en el parque del Túria.',
              outlet: 'Test Outlet',
              articleUrl: 'https://example.test/articles/001',
              sourceClaimId: 'test-art-001-0-num',
            },
          ],
          crossChecked: [{ kind: 'bdns', ref: 'BDB-2026-001', snippet: `${SNIPPET} · sim=0.22` }],
          contradiction: [],
          relatedPromiseIds: [],
          relatedPlenoItems: [],
          curatorName: 'test-suite',
          publishedAt: '2026-05-20',
        },
      ],
    })
    expect(validatePressFindingsSnapshot(snap).items[0].crossChecked[0].snippet).toBe(SNIPPET)
  })
})
