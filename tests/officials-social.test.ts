import { describe, it, expect } from 'vitest'
import {
  classifySocialUrl,
  isRoleEvidence,
  accountBelongsToPerson,
  SOCIAL_PLATFORMS,
  validateSocialSnapshot,
  validateSocialSuggestions,
  type SocialAccount,
} from '../src/scraper/officials-social'

/**
 * This registry names real, living, identified people, so it inherits the same
 * contract as the rest of the project: machine output is a suggestion, a
 * curator publishes, and the published shape cannot carry the approval flag.
 *
 * The specific hazard here is username enumeration. A tool like Sherlock finds
 * every platform where a handle exists — dating, fitness, adult sites — which
 * builds a personal-life dossier rather than a record of how someone
 * communicates as an elected official. Two rules keep that out: an allowlist of
 * platforms with civic relevance, and evidence that ties the account to the
 * ROLE rather than merely to a matching name.
 */

const OFFICIAL = { slug: 'robert-raga-gadea', name: 'Robert Raga Gadea', party: 'PSOE' }

describe('officials-social — classifySocialUrl', () => {
  it('recognises the civic platforms and extracts the handle', () => {
    expect(classifySocialUrl('https://www.instagram.com/robertalcalde/')).toEqual({
      platform: 'instagram',
      handle: 'robertalcalde',
      url: 'https://www.instagram.com/robertalcalde',
    })
    expect(classifySocialUrl('https://x.com/ayto_riba_roja')?.platform).toBe('x')
    expect(classifySocialUrl('https://twitter.com/ayto_riba_roja')?.platform).toBe('x')
    expect(classifySocialUrl('https://www.facebook.com/ambrobert/')?.handle).toBe('ambrobert')
    expect(classifySocialUrl('https://www.linkedin.com/in/someone-1234/')?.platform).toBe(
      'linkedin',
    )
  })

  it('rejects any platform outside the civic allowlist', () => {
    // The anti-Sherlock rule: enumerating a handle across unrelated platforms
    // profiles a person's private life, which is not what this project does.
    for (const url of [
      'https://tinder.com/@robert',
      'https://www.strava.com/athletes/robert',
      'https://onlyfans.com/robert',
      'https://steamcommunity.com/id/robert',
      'https://www.pinterest.com/robert',
    ]) {
      expect(classifySocialUrl(url)).toBeNull()
    }
  })

  it('rejects post and reel URLs — only profile roots identify an account', () => {
    expect(classifySocialUrl('https://www.instagram.com/reel/DXMxH6FjJEr/')).toBeNull()
    expect(
      classifySocialUrl('https://www.facebook.com/ribarroja.es/posts/1309300627898330/'),
    ).toBeNull()
    expect(classifySocialUrl('https://x.com/ayto_riba_roja/status/123456')).toBeNull()
  })

  it('normalises away tracking noise and trailing slashes', () => {
    expect(classifySocialUrl('https://instagram.com/robertalcalde/?hl=es&igshid=xyz')?.url).toBe(
      'https://www.instagram.com/robertalcalde',
    )
  })

  it('every allowlisted platform is classifiable from its own example', () => {
    for (const p of SOCIAL_PLATFORMS) {
      expect(classifySocialUrl(p.example)?.platform).toBe(p.id)
    }
  })
})

describe('officials-social — isRoleEvidence', () => {
  it('accepts text that ties the person to the office', () => {
    expect(
      isRoleEvidence('Robert Raga · Alcalde de Riba-roja de Túria · PSPV-PSOE', OFFICIAL),
    ).toBe(true)
    expect(isRoleEvidence('Regidor de l’Ajuntament de Riba-roja, Robert Raga', OFFICIAL)).toBe(true)
  })

  it('rejects a bare name match with no role or place', () => {
    // A matching name alone is exactly how you end up publishing a stranger's
    // account on a councillor's card.
    expect(isRoleEvidence('Robert Raga posted a photo', OFFICIAL)).toBe(false)
    expect(isRoleEvidence('fotos y vídeos de Robert Raga', OFFICIAL)).toBe(false)
  })

  it('rejects role wording when the name is absent', () => {
    expect(isRoleEvidence('Alcalde de Riba-roja de Túria', OFFICIAL)).toBe(false)
  })

  it('needs more than a shared surname', () => {
    const other = { slug: 'rafael-gomez-sanchez', name: 'Rafael Gómez Sánchez' }
    expect(isRoleEvidence('Concejal de Riba-roja, Gómez', other)).toBe(false)
  })
})

describe('officials-social — accountBelongsToPerson', () => {
  it('accepts a profile whose own display name is the person', () => {
    expect(
      accountBelongsToPerson(
        {
          title: 'Robert Raga (@robertalcalde) • Instagram photos and videos',
          snippet: '4,383 Followers - Robert Raga on Instagram: "Alcalde de Riba-roja de Túria"',
        },
        OFFICIAL,
      ),
    ).toBe(true)
  })

  it('rejects the institution’s own account even though its bio names the mayor', () => {
    // Real false positive: @ajribarojadeturia is the town hall's account. Its
    // bio mentions Robert Raga, so evidence alone passes — but the account
    // belongs to the Ajuntament, and filing it under him would misattribute
    // every institutional post to the person.
    expect(
      accountBelongsToPerson(
        {
          title: 'Ajuntament de Riba-roja (@ajribarojadeturia) - Instagram',
          snippet:
            '10K Followers - Ajuntament de Riba-roja de Túria. Alcalde: Robert Raga Gadea. Organisme oficial',
        },
        OFFICIAL,
      ),
    ).toBe(false)
  })

  it('rejects a party or group account that merely mentions the person', () => {
    expect(
      accountBelongsToPerson(
        {
          title: 'PSPV-PSOE Riba-roja (@pspvribaroja) • Instagram',
          snippet: 'Agrupació local. Alcalde Robert Raga Gadea, Riba-roja de Túria',
        },
        OFFICIAL,
      ),
    ).toBe(false)
  })

  it('still requires the role to appear somewhere', () => {
    // Name in the title but nothing tying it to the office — could be a
    // namesake anywhere in the world.
    expect(
      accountBelongsToPerson(
        { title: 'Robert Raga (@robertraga99) • Instagram', snippet: 'Photographer, Berlin' },
        OFFICIAL,
      ),
    ).toBe(false)
  })
})

describe('officials-social — validators', () => {
  const good: SocialAccount = {
    slug: 'robert-raga-gadea',
    platform: 'instagram',
    handle: 'robertalcalde',
    url: 'https://www.instagram.com/robertalcalde',
    evidence: 'Robert Raga · Alcalde de Riba-roja de Túria',
    evidenceUrl: 'https://www.instagram.com/robertalcalde/',
    addedAt: '2026-08-01',
    curator: 'datarhan',
  }

  it('accepts a well-formed published account', () => {
    expect(() =>
      validateSocialSnapshot({ generatedAt: '2026-08-01T00:00:00Z', accounts: [good] }),
    ).not.toThrow()
  })

  it('refuses a published account that still carries the approval flag', () => {
    const bad = { ...good, requiresHumanApproval: true }
    expect(() =>
      validateSocialSnapshot({ generatedAt: '2026-08-01T00:00:00Z', accounts: [bad] }),
    ).toThrow(/requiresHumanApproval/i)
  })

  it('refuses an account with no evidence', () => {
    const bad = { ...good, evidence: '' }
    expect(() =>
      validateSocialSnapshot({ generatedAt: '2026-08-01T00:00:00Z', accounts: [bad] }),
    ).toThrow(/evidence/i)
  })

  it('refuses an account on a non-allowlisted platform', () => {
    const bad = { ...good, platform: 'tinder' as never, url: 'https://tinder.com/@x' }
    expect(() =>
      validateSocialSnapshot({ generatedAt: '2026-08-01T00:00:00Z', accounts: [bad] }),
    ).toThrow(/platform/i)
  })

  it('refuses duplicate platform entries for the same official', () => {
    expect(() =>
      validateSocialSnapshot({ generatedAt: '2026-08-01T00:00:00Z', accounts: [good, good] }),
    ).toThrow(/duplicate/i)
  })

  it('requires every suggestion to carry requiresHumanApproval', () => {
    const s = { ...good, confidence: 0.9 }
    expect(() =>
      validateSocialSuggestions({ generatedAt: '2026-08-01T00:00:00Z', suggestions: [s] }),
    ).toThrow(/requiresHumanApproval/i)
  })

  it('accepts a suggestion that is properly flagged', () => {
    const s = { ...good, confidence: 0.9, requiresHumanApproval: true as const }
    expect(() =>
      validateSocialSuggestions({ generatedAt: '2026-08-01T00:00:00Z', suggestions: [s] }),
    ).not.toThrow()
  })
})
