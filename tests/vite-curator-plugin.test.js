/**
 * Tests for the Vite curator middleware. We test the validation layer
 * (allowlist, zod schemas, shell-metachar reject, argv composition)
 * directly against the test-only exports, without running the actual
 * `execFile` or HTTP layer — those are integration concerns that the
 * E2E test covers.
 *
 * The threat model: this plugin spawns CLIs from a browser request.
 * Failing any of these tests means a security regression, not a UX
 * regression — treat them as guardrails.
 */
import { describe, expect, it } from 'vitest'
import { __test } from '../vite-curator-plugin.js'

const {
  ActionSchemas,
  TranscribeEvidenceJobSchema,
  CommitBodySchema,
  COMMIT_FILE_ALLOWLIST,
  buildArgv,
  ALLOWED_ORIGINS,
  MAX_BODY_BYTES,
  SHELL_METACHAR_RE,
} = __test

describe('SHELL_METACHAR_RE', () => {
  it('rejects every shell metachar listed in the threat model', () => {
    const dangerous = [
      'a;rm -rf /',
      'a&&rm',
      'a|rm',
      'a`rm`',
      'a$x',
      'a$(rm)',
      'a{x}',
      'a<x',
      'a>x',
      'a\nrm',
      'a\rrm',
    ]
    for (const s of dangerous) {
      expect(SHELL_METACHAR_RE.test(s)).toBe(true)
    }
  })

  it('accepts ordinary punctuation: hyphens, periods, accents, slashes, em-dash', () => {
    const safe = [
      'Plenary findings 2026-04 — review',
      'PSOE «alumbrado eficiente»',
      'Riba-roja de Túria · CV-35',
      'https://example.com/path?x=1',
    ]
    for (const s of safe) {
      expect(SHELL_METACHAR_RE.test(s)).toBe(false)
    }
  })
})

describe('ALLOWED_ORIGINS', () => {
  it('only allows localhost / 127.0.0.1 on the dev port', () => {
    expect(ALLOWED_ORIGINS.has('http://localhost:5173')).toBe(true)
    expect(ALLOWED_ORIGINS.has('http://127.0.0.1:5173')).toBe(true)
    expect(ALLOWED_ORIGINS.has('http://localhost:3000')).toBe(false)
    expect(ALLOWED_ORIGINS.has('http://evil.example')).toBe(false)
    expect(ALLOWED_ORIGINS.has('https://localhost:5173')).toBe(false)
    expect(ALLOWED_ORIGINS.has('')).toBe(false)
  })
})

describe('MAX_BODY_BYTES', () => {
  it('caps the body size at 32 KB (sized for draft-finding extraEvidence)', () => {
    expect(MAX_BODY_BYTES).toBe(32 * 1024)
  })
})

describe('ActionSchemas', () => {
  describe('promote-claim', () => {
    const schema = ActionSchemas['promote-claim']
    it('accepts a minimal valid payload', () => {
      const r = schema.safeParse({
        claimIds: ['abc-123'],
        title: 'A reasonable headline',
        summary: 'A reasonable summary that is long enough to pass the 40 char floor.',
      })
      expect(r.success).toBe(true)
    })

    it('rejects shell-metachar in title', () => {
      const r = schema.safeParse({
        claimIds: ['abc-123'],
        title: 'evil; rm -rf /',
        summary: 'forty char minimum forty char minimum forty',
      })
      expect(r.success).toBe(false)
    })

    it('rejects shell-metachar in summary', () => {
      const r = schema.safeParse({
        claimIds: ['abc-123'],
        title: 'safe title',
        summary: 'evil $(rm -rf /) evil $(rm -rf /) evil $(rm -rf /)',
      })
      expect(r.success).toBe(false)
    })

    it('rejects malformed claimIds', () => {
      const r = schema.safeParse({
        claimIds: ['UPPERCASE_NOT_ALLOWED'],
        title: 'safe title',
        summary: 'forty char minimum forty char minimum forty',
      })
      expect(r.success).toBe(false)
    })

    it('caps claimIds at 10', () => {
      const r = schema.safeParse({
        claimIds: Array.from({ length: 11 }, (_, i) => `c-${i}`),
        title: 'safe title',
        summary: 'forty char minimum forty char minimum forty',
      })
      expect(r.success).toBe(false)
    })

    it('rejects unknown fields (strict mode)', () => {
      const r = schema.safeParse({
        claimIds: ['abc-123'],
        title: 'safe title',
        summary: 'forty char minimum forty char minimum forty',
        sneaky: 'extra-field',
      })
      expect(r.success).toBe(false)
    })

    it('accepts optional severity and relatedPromiseId', () => {
      const r = schema.safeParse({
        claimIds: ['abc-123'],
        title: 'safe title',
        summary: 'forty char minimum forty char minimum forty',
        severity: 'notable',
        relatedPromiseId: 'psoe-presupuesto-2026',
      })
      expect(r.success).toBe(true)
    })

    it('accepts optional extraCorroboration array', () => {
      const r = schema.safeParse({
        claimIds: ['abc-123'],
        title: 'safe title',
        summary: 'forty char minimum forty char minimum forty',
        extraCorroboration: [
          {
            kind: 'press',
            ref: 'https://example.com/article',
            snippet: 'a press article excerpt',
          },
        ],
      })
      expect(r.success).toBe(true)
    })

    it('rejects extraCorroboration with verifier-only kinds', () => {
      const r = schema.safeParse({
        claimIds: ['abc-123'],
        title: 'safe title',
        summary: 'forty char minimum forty char minimum forty',
        // tender is a verifier-only kind; the dashboard cannot inject it.
        extraCorroboration: [
          { kind: 'tender', ref: 'https://example.com/tender', snippet: 'tender' },
        ],
      })
      expect(r.success).toBe(false)
    })

    it('rejects extraCorroboration with shell metachars in snippet', () => {
      const r = schema.safeParse({
        claimIds: ['abc-123'],
        title: 'safe title',
        summary: 'forty char minimum forty char minimum forty',
        extraCorroboration: [{ kind: 'press', ref: 'https://example.com', snippet: 'a; rm -rf /' }],
      })
      expect(r.success).toBe(false)
    })

    it('rejects extraCorroboration with non-URL ref', () => {
      const r = schema.safeParse({
        claimIds: ['abc-123'],
        title: 'safe title',
        summary: 'forty char minimum forty char minimum forty',
        extraCorroboration: [{ kind: 'press', ref: 'not-a-url', snippet: 'x' }],
      })
      expect(r.success).toBe(false)
    })

    it('caps extraCorroboration at 10 entries', () => {
      const ev = Array.from({ length: 11 }, () => ({
        kind: 'press',
        ref: 'https://example.com',
        snippet: 'x',
      }))
      const r = schema.safeParse({
        claimIds: ['abc-123'],
        title: 'safe title',
        summary: 'forty char minimum forty char minimum forty',
        extraCorroboration: ev,
      })
      expect(r.success).toBe(false)
    })

    it('rejects extraCorroboration entries with snippet >240 chars', () => {
      const r = schema.safeParse({
        claimIds: ['abc-123'],
        title: 'safe title',
        summary: 'forty char minimum forty char minimum forty',
        extraCorroboration: [
          { kind: 'press', ref: 'https://example.com', snippet: 'x'.repeat(241) },
        ],
      })
      expect(r.success).toBe(false)
    })
  })

  describe('finding-reply', () => {
    const schema = ActionSchemas['finding-reply']
    it('accepts a valid payload', () => {
      const r = schema.safeParse({
        findingId: 'f-2026-03-09-242k-extrajudicial',
        party: 'PSOE',
        quote: 'Esta es una cita verbatim mínima del veinte caracteres',
      })
      expect(r.success).toBe(true)
    })

    it('rejects findingId without f- prefix', () => {
      const r = schema.safeParse({
        findingId: 'no-prefix',
        party: 'PSOE',
        quote: 'Esta es una cita verbatim mínima del veinte caracteres',
      })
      expect(r.success).toBe(false)
    })

    it('rejects unknown party', () => {
      const r = schema.safeParse({
        findingId: 'f-test-bundle',
        party: 'Hacker',
        quote: 'Esta es una cita verbatim mínima del veinte caracteres',
      })
      expect(r.success).toBe(false)
    })

    it('rejects quote shorter than 20 chars', () => {
      const r = schema.safeParse({
        findingId: 'f-test-bundle',
        party: 'PSOE',
        quote: 'too short',
      })
      expect(r.success).toBe(false)
    })
  })

  describe('refresh-* actions', () => {
    it('refresh-gh-issues takes no args', () => {
      expect(ActionSchemas['refresh-gh-issues'].safeParse({}).success).toBe(true)
      expect(ActionSchemas['refresh-gh-issues'].safeParse({ extra: 1 }).success).toBe(false)
    })

    it('refresh-curate-queue takes no args', () => {
      expect(ActionSchemas['refresh-curate-queue'].safeParse({}).success).toBe(true)
      expect(ActionSchemas['refresh-curate-queue'].safeParse({ extra: 1 }).success).toBe(false)
    })
  })

  describe('draft-finding', () => {
    const schema = ActionSchemas['draft-finding']
    it('accepts a valid plenoId + topic', () => {
      const r = schema.safeParse({ plenoId: '19gax3o', topic: 'urbanismo' })
      expect(r.success).toBe(true)
    })

    it('rejects uppercase plenoId', () => {
      const r = schema.safeParse({ plenoId: 'BIGBADID', topic: 'urbanismo' })
      expect(r.success).toBe(false)
    })

    it('rejects topic with digits or punctuation', () => {
      const r = schema.safeParse({ plenoId: '19gax3o', topic: 'urbanismo;rm' })
      expect(r.success).toBe(false)
    })

    it('rejects unknown extra fields', () => {
      const r = schema.safeParse({ plenoId: '19gax3o', topic: 'urbanismo', extra: 1 })
      expect(r.success).toBe(false)
    })

    it('accepts up to 10 extra evidence entries', () => {
      const ev = Array.from({ length: 10 }, () => ({
        kind: 'url',
        sourceUrl: 'https://example.com',
        snippet: 'a'.repeat(50),
      }))
      const r = schema.safeParse({ plenoId: '19gax3o', topic: 'urbanismo', extraEvidence: ev })
      expect(r.success).toBe(true)
    })

    it('rejects more than 10 extra evidence entries', () => {
      const ev = Array.from({ length: 11 }, () => ({ kind: 'url', snippet: 'a'.repeat(50) }))
      const r = schema.safeParse({ plenoId: '19gax3o', topic: 'urbanismo', extraEvidence: ev })
      expect(r.success).toBe(false)
    })

    it('rejects evidence kinds other than url|pdf', () => {
      const r = schema.safeParse({
        plenoId: '19gax3o',
        topic: 'urbanismo',
        extraEvidence: [{ kind: 'audio', snippet: 'a'.repeat(50) }],
      })
      expect(r.success).toBe(false)
    })

    it('rejects evidence snippet shorter than 20 chars', () => {
      const r = schema.safeParse({
        plenoId: '19gax3o',
        topic: 'urbanismo',
        extraEvidence: [{ kind: 'url', snippet: 'too short' }],
      })
      expect(r.success).toBe(false)
    })
  })

  describe('archive-bundle', () => {
    const schema = ActionSchemas['archive-bundle']
    it('accepts plenoId + topic without reason', () => {
      const r = schema.safeParse({ plenoId: '19gax3o', topic: 'urbanismo' })
      expect(r.success).toBe(true)
    })

    it('accepts an optional reason', () => {
      const r = schema.safeParse({
        plenoId: '19gax3o',
        topic: 'urbanismo',
        reason: 'Verifier match looks like a false positive — agenda item is unrelated.',
      })
      expect(r.success).toBe(true)
    })

    it('rejects shell-metachar in reason', () => {
      const r = schema.safeParse({
        plenoId: '19gax3o',
        topic: 'urbanismo',
        reason: 'evil; rm -rf /',
      })
      expect(r.success).toBe(false)
    })

    it('rejects reason longer than 500 chars', () => {
      const r = schema.safeParse({
        plenoId: '19gax3o',
        topic: 'urbanismo',
        reason: 'x'.repeat(501),
      })
      expect(r.success).toBe(false)
    })
  })

  describe('unarchive-bundle', () => {
    const schema = ActionSchemas['unarchive-bundle']
    it('accepts a valid pair', () => {
      expect(schema.safeParse({ plenoId: 'pln', topic: 'urbanismo' }).success).toBe(true)
    })
    it('rejects extras', () => {
      expect(schema.safeParse({ plenoId: 'p1', topic: 'urbanismo', extra: 1 }).success).toBe(false)
    })
  })

  describe('fetch-url-evidence', () => {
    const schema = ActionSchemas['fetch-url-evidence']
    it('accepts a valid https URL', () => {
      expect(schema.safeParse({ url: 'https://example.com/article/1' }).success).toBe(true)
    })

    it('rejects non-URL strings', () => {
      expect(schema.safeParse({ url: 'not-a-url' }).success).toBe(false)
    })

    it('rejects URLs with shell metacharacters', () => {
      expect(schema.safeParse({ url: 'https://example.com/$(whoami)' }).success).toBe(false)
    })
  })

  it('has no unexpected actions registered', () => {
    expect(Object.keys(ActionSchemas).sort()).toEqual([
      'apply-promise-draft',
      'archive-bundle',
      'delete-voiceprint',
      'draft-finding',
      'enroll-voice',
      'fetch-url-evidence',
      'finding-reply',
      'mark-reviewed-promise',
      'override-speaker-assignment',
      'promote-claim',
      'refresh-curate-queue',
      'refresh-gh-issues',
      'reject-promise-draft',
      'retract-promise',
      'unarchive-bundle',
    ])
  })

  describe('enroll-voice', () => {
    const schema = ActionSchemas['enroll-voice']
    it('accepts a slug + audio URL', () => {
      const r = schema.safeParse({
        slug: 'robert-raga-gadea',
        audioUrl: 'https://www.instagram.com/reel/DXMxH6FjJEr/',
      })
      expect(r.success).toBe(true)
    })

    it('rejects shell-metachar in url', () => {
      const r = schema.safeParse({
        slug: 'robert-raga-gadea',
        audioUrl: 'https://example.com/$(rm -rf /)',
      })
      expect(r.success).toBe(false)
    })

    it('rejects malformed slug', () => {
      const r = schema.safeParse({
        slug: 'BAD UPPERCASE',
        audioUrl: 'https://example.com/x',
      })
      expect(r.success).toBe(false)
    })

    it('accepts optional force flag', () => {
      const r = schema.safeParse({
        slug: 'robert-raga-gadea',
        audioUrl: 'https://example.com/x',
        force: true,
      })
      expect(r.success).toBe(true)
    })
  })

  describe('delete-voiceprint', () => {
    const schema = ActionSchemas['delete-voiceprint']
    it('accepts a valid slug', () => {
      expect(schema.safeParse({ slug: 'teresa-pozuelo-martin' }).success).toBe(true)
    })
    it('rejects extras', () => {
      expect(schema.safeParse({ slug: 'pln', extra: 1 }).success).toBe(false)
    })
  })

  describe('override-speaker-assignment', () => {
    const schema = ActionSchemas['override-speaker-assignment']
    it('accepts mode=assign with a slug', () => {
      const r = schema.safeParse({
        plenoId: 'voicetest',
        speaker: 'SPEAKER_00',
        mode: 'assign',
        slug: 'robert-raga-gadea',
      })
      expect(r.success).toBe(true)
    })
    it('rejects mode=assign without a slug', () => {
      const r = schema.safeParse({
        plenoId: 'voicetest',
        speaker: 'SPEAKER_00',
        mode: 'assign',
      })
      expect(r.success).toBe(false)
    })
    it('accepts mode=clear with no slug', () => {
      const r = schema.safeParse({
        plenoId: 'voicetest',
        speaker: 'SPEAKER_00',
        mode: 'clear',
      })
      expect(r.success).toBe(true)
    })
    it('rejects mode=clear with a slug (defensive)', () => {
      const r = schema.safeParse({
        plenoId: 'voicetest',
        speaker: 'SPEAKER_00',
        mode: 'clear',
        slug: 'robert-raga-gadea',
      })
      expect(r.success).toBe(false)
    })
    it('rejects malformed speaker label', () => {
      const r = schema.safeParse({
        plenoId: 'voicetest',
        speaker: 'speaker_00',
        mode: 'clear',
      })
      expect(r.success).toBe(false)
    })
    it('rejects malformed plenoId', () => {
      const r = schema.safeParse({
        plenoId: 'PATH/../secret',
        speaker: 'SPEAKER_00',
        mode: 'clear',
      })
      expect(r.success).toBe(false)
    })
    it('rejects extras', () => {
      const r = schema.safeParse({
        plenoId: 'voicetest',
        speaker: 'SPEAKER_00',
        mode: 'clear',
        evil: 1,
      })
      expect(r.success).toBe(false)
    })
  })

  describe('apply-promise-draft', () => {
    const schema = ActionSchemas['apply-promise-draft']
    it('accepts a valid dnp- draftId', () => {
      expect(schema.safeParse({ draftId: 'dnp-psoe-alumbrado-eficiente' }).success).toBe(true)
    })
    it('rejects a draftId without the dnp- prefix', () => {
      expect(schema.safeParse({ draftId: 'psoe-alumbrado' }).success).toBe(false)
    })
    it('rejects shell-metachar in the draftId', () => {
      expect(schema.safeParse({ draftId: 'dnp-a$(rm -rf /)' }).success).toBe(false)
    })
    it('rejects uppercase in the draftId', () => {
      expect(schema.safeParse({ draftId: 'dnp-PSOE' }).success).toBe(false)
    })
    it('rejects unknown extra fields (strict mode)', () => {
      expect(schema.safeParse({ draftId: 'dnp-abc', sneaky: 1 }).success).toBe(false)
    })
  })

  describe('reject-promise-draft', () => {
    const schema = ActionSchemas['reject-promise-draft']
    it('accepts a draftId alone', () => {
      expect(schema.safeParse({ draftId: 'dnp-psoe-alumbrado' }).success).toBe(true)
    })
    it('accepts a draftId + an optional reason', () => {
      const r = schema.safeParse({
        draftId: 'dnp-psoe-alumbrado',
        reason: 'Cita no textual — la fuente no ancla la promesa.',
      })
      expect(r.success).toBe(true)
    })
    it('rejects shell-metachar in the reason', () => {
      expect(schema.safeParse({ draftId: 'dnp-abc', reason: 'evil; rm -rf /' }).success).toBe(false)
    })
    it('rejects a bad draftId', () => {
      expect(schema.safeParse({ draftId: 'not-a-draft' }).success).toBe(false)
    })
    it('rejects unknown extra fields (strict mode)', () => {
      expect(schema.safeParse({ draftId: 'dnp-abc', sneaky: 1 }).success).toBe(false)
    })
  })

  describe('retract-promise', () => {
    const schema = ActionSchemas['retract-promise']
    it('accepts a valid promiseId', () => {
      expect(schema.safeParse({ promiseId: 'psoe-presupuesto-2026' }).success).toBe(true)
    })
    it('rejects shell-metachar in the promiseId', () => {
      expect(schema.safeParse({ promiseId: 'psoe$(rm)' }).success).toBe(false)
    })
    it('rejects uppercase in the promiseId', () => {
      expect(schema.safeParse({ promiseId: 'PSOE-2026' }).success).toBe(false)
    })
    it('rejects unknown extra fields (strict mode)', () => {
      expect(schema.safeParse({ promiseId: 'psoe-2026', sneaky: 1 }).success).toBe(false)
    })
  })

  describe('mark-reviewed-promise', () => {
    const schema = ActionSchemas['mark-reviewed-promise']
    it('accepts a valid promiseId', () => {
      expect(schema.safeParse({ promiseId: 'psoe-presupuesto-2026' }).success).toBe(true)
    })
    it('rejects shell-metachar in the promiseId', () => {
      expect(schema.safeParse({ promiseId: 'a`whoami`' }).success).toBe(false)
    })
    it('rejects a too-short promiseId', () => {
      expect(schema.safeParse({ promiseId: 'ab' }).success).toBe(false)
    })
    it('rejects unknown extra fields (strict mode)', () => {
      expect(schema.safeParse({ promiseId: 'psoe-2026', sneaky: 1 }).success).toBe(false)
    })
  })
})

describe('TranscribeEvidenceJobSchema', () => {
  it('accepts a valid transcribe-evidence body', () => {
    const r = TranscribeEvidenceJobSchema.safeParse({
      action: 'transcribe-evidence',
      args: { filePath: '/Users/me/Downloads/clip.mp3', expectedKind: 'audio' },
    })
    expect(r.success).toBe(true)
  })

  it('accepts an optional engine', () => {
    const r = TranscribeEvidenceJobSchema.safeParse({
      action: 'transcribe-evidence',
      args: { filePath: '/abs/path', expectedKind: 'video', engine: 'mlx' },
    })
    expect(r.success).toBe(true)
  })

  it('rejects unknown engine', () => {
    const r = TranscribeEvidenceJobSchema.safeParse({
      action: 'transcribe-evidence',
      args: { filePath: '/abs/path', expectedKind: 'audio', engine: 'bogus' },
    })
    expect(r.success).toBe(false)
  })

  it('rejects shell metachars in filePath', () => {
    const r = TranscribeEvidenceJobSchema.safeParse({
      action: 'transcribe-evidence',
      args: { filePath: '/abs/path; rm -rf /', expectedKind: 'audio' },
    })
    expect(r.success).toBe(false)
  })

  it('rejects expectedKind other than audio|video', () => {
    const r = TranscribeEvidenceJobSchema.safeParse({
      action: 'transcribe-evidence',
      args: { filePath: '/abs/path', expectedKind: 'document' },
    })
    expect(r.success).toBe(false)
  })

  it('rejects unknown action literal', () => {
    const r = TranscribeEvidenceJobSchema.safeParse({
      action: 'wrong',
      args: { filePath: '/abs/path', expectedKind: 'audio' },
    })
    expect(r.success).toBe(false)
  })

  it('rejects extra fields (strict mode)', () => {
    const r = TranscribeEvidenceJobSchema.safeParse({
      action: 'transcribe-evidence',
      args: { filePath: '/abs/path', expectedKind: 'audio' },
      sneaky: 1,
    })
    expect(r.success).toBe(false)
  })
})

describe('buildArgv', () => {
  it('composes promote-claim argv as a flat array (no interpolation)', () => {
    const argv = buildArgv('promote-claim', {
      claimIds: ['c-1', 'c-2'],
      title: 'Title',
      summary: 'Summary that meets the floor',
      severity: 'notable',
    })
    expect(argv).toEqual([
      'run',
      'promote-claim',
      '--',
      'c-1',
      'c-2',
      '--title',
      'Title',
      '--summary',
      'Summary that meets the floor',
      '--severity',
      'notable',
    ])
  })

  it('composes promote-claim argv WITH extraCorroboration', () => {
    const argv = buildArgv('promote-claim', {
      claimIds: ['c-1'],
      title: 'Title',
      summary: 'Summary that meets the floor',
      extraCorroboration: [{ kind: 'press', ref: 'https://x', snippet: 'snip' }],
    })
    const flagIdx = argv.indexOf('--extra-corroboration')
    expect(flagIdx).toBeGreaterThan(0)
    const json = argv[flagIdx + 1]
    expect(JSON.parse(json)).toEqual([{ kind: 'press', ref: 'https://x', snippet: 'snip' }])
  })

  it('composes finding-reply argv', () => {
    const argv = buildArgv('finding-reply', {
      findingId: 'f-x',
      party: 'PSOE',
      quote: 'verbatim ≥20 chars verbatim',
      sourceUrl: 'https://example.com/source',
    })
    expect(argv).toEqual([
      'run',
      'finding-reply',
      '--',
      'f-x',
      'PSOE',
      'verbatim ≥20 chars verbatim',
      'https://example.com/source',
    ])
  })

  it('composes refresh actions', () => {
    expect(buildArgv('refresh-gh-issues', {})).toEqual(['run', 'refresh:gh-issues'])
    expect(buildArgv('refresh-curate-queue', {})).toEqual(['run', 'refresh:curate-queue'])
  })

  it('composes draft-finding argv', () => {
    expect(buildArgv('draft-finding', { plenoId: '19gax3o', topic: 'urbanismo' })).toEqual([
      'run',
      'draft-finding',
      '--',
      '--pleno-id',
      '19gax3o',
      '--topic',
      'urbanismo',
    ])
  })

  it('composes draft-finding argv WITH extraEvidence', () => {
    const argv = buildArgv('draft-finding', {
      plenoId: '19gax3o',
      topic: 'urbanismo',
      extraEvidence: [{ kind: 'url', sourceUrl: 'https://x.example', snippet: 'a'.repeat(50) }],
    })
    expect(argv[argv.length - 2]).toBe('--extra-evidence-json')
    // Last arg is the JSON. Round-trip it to make sure it's parseable.
    expect(JSON.parse(argv[argv.length - 1])).toHaveLength(1)
  })

  it('composes archive-bundle argv', () => {
    expect(buildArgv('archive-bundle', { plenoId: 'pln', topic: 'urbanismo' })).toEqual([
      'run',
      'archive-bundle',
      '--',
      'pln',
      'urbanismo',
    ])
    expect(
      buildArgv('archive-bundle', { plenoId: 'pln', topic: 'urbanismo', reason: 'unclear' }),
    ).toEqual(['run', 'archive-bundle', '--', 'pln', 'urbanismo', 'unclear'])
  })

  it('composes unarchive-bundle argv', () => {
    expect(buildArgv('unarchive-bundle', { plenoId: 'pln', topic: 'urbanismo' })).toEqual([
      'run',
      'unarchive-bundle',
      '--',
      'pln',
      'urbanismo',
    ])
  })

  it('composes fetch-url-evidence argv', () => {
    expect(buildArgv('fetch-url-evidence', { url: 'https://example.com' })).toEqual([
      'run',
      'fetch-url-evidence',
      '--',
      'https://example.com',
    ])
  })

  it('composes apply-promise-draft argv', () => {
    expect(buildArgv('apply-promise-draft', { draftId: 'dnp-psoe-alumbrado' })).toEqual([
      'run',
      'apply-promise-draft',
      '--',
      'dnp-psoe-alumbrado',
    ])
  })

  it('composes reject-promise-draft argv without a reason', () => {
    expect(buildArgv('reject-promise-draft', { draftId: 'dnp-psoe-alumbrado' })).toEqual([
      'run',
      'apply-promise-draft',
      '--',
      '--reject',
      'dnp-psoe-alumbrado',
    ])
  })

  it('composes reject-promise-draft argv WITH a reason', () => {
    expect(
      buildArgv('reject-promise-draft', {
        draftId: 'dnp-psoe-alumbrado',
        reason: 'source does not anchor the quote',
      }),
    ).toEqual([
      'run',
      'apply-promise-draft',
      '--',
      '--reject',
      'dnp-psoe-alumbrado',
      'source does not anchor the quote',
    ])
  })

  it('composes retract-promise argv', () => {
    expect(buildArgv('retract-promise', { promiseId: 'psoe-presupuesto-2026' })).toEqual([
      'run',
      'apply-promise-draft',
      '--',
      '--retract',
      'psoe-presupuesto-2026',
    ])
  })

  it('composes mark-reviewed-promise argv', () => {
    expect(buildArgv('mark-reviewed-promise', { promiseId: 'psoe-presupuesto-2026' })).toEqual([
      'run',
      'apply-promise-draft',
      '--',
      '--mark-reviewed',
      'psoe-presupuesto-2026',
    ])
  })

  it('throws on unknown action', () => {
    expect(() => buildArgv('rm-rf', {})).toThrow(/unknown action/)
  })
})

describe('CommitBodySchema (commit file allowlist)', () => {
  it('COMMIT_FILE_ALLOWLIST is exactly pleno-findings + promises', () => {
    expect([...COMMIT_FILE_ALLOWLIST].sort()).toEqual([
      'public/data/pleno-findings.json',
      'public/data/promises.json',
    ])
  })

  it('accepts a message with no files (back-compat default)', () => {
    expect(CommitBodySchema.safeParse({ message: 'data: publish x' }).success).toBe(true)
  })

  it('accepts an explicit promises.json in files', () => {
    const r = CommitBodySchema.safeParse({
      message: 'data: publish promise dnp-psoe-alumbrado',
      files: ['public/data/promises.json'],
    })
    expect(r.success).toBe(true)
  })

  it('accepts the original pleno-findings.json in files', () => {
    const r = CommitBodySchema.safeParse({
      message: 'data: publish finding',
      files: ['public/data/pleno-findings.json'],
    })
    expect(r.success).toBe(true)
  })

  it('rejects a non-allowlisted path (officials.json)', () => {
    const r = CommitBodySchema.safeParse({
      message: 'data: sneaky commit',
      files: ['public/data/officials.json'],
    })
    expect(r.success).toBe(false)
  })

  it('rejects a path-traversal file (../etc/passwd)', () => {
    const r = CommitBodySchema.safeParse({
      message: 'data: sneaky commit',
      files: ['../etc/passwd'],
    })
    expect(r.success).toBe(false)
  })

  it('rejects a mix of allowlisted + non-allowlisted files', () => {
    const r = CommitBodySchema.safeParse({
      message: 'data: sneaky commit',
      files: ['public/data/promises.json', 'package.json'],
    })
    expect(r.success).toBe(false)
  })

  it('rejects an empty files array (min 1)', () => {
    expect(CommitBodySchema.safeParse({ message: 'data: x', files: [] }).success).toBe(false)
  })

  it('still enforces the ≥5-char message floor', () => {
    expect(CommitBodySchema.safeParse({ message: 'x' }).success).toBe(false)
  })

  it('rejects unknown extra fields (strict mode)', () => {
    expect(CommitBodySchema.safeParse({ message: 'data: x', sneaky: 1 }).success).toBe(false)
  })
})
