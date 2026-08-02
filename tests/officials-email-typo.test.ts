import { describe, it, expect } from 'vitest'
import { preferCorrectlySpelledEmail } from '../src/scraper/corporacion'

/**
 * A `mailto:` on a typosquat domain sends a citizen's message to a stranger.
 * The corporación page publishes `popularesribarroja@gmai.com` twice and
 * `popularesribarroja@gmail.com` twelve times — the same mailbox, and the
 * scraper picked the broken spelling for that councillor's contact link.
 */
describe('preferCorrectlySpelledEmail', () => {
  const page = 'contacto: popularesribarroja@gmail.com y tambien popularesribarroja@gmai.com'

  it('corrects the typo when the right spelling is on the same page', () => {
    expect(preferCorrectlySpelledEmail('popularesribarroja@gmai.com', page)).toBe(
      'popularesribarroja@gmail.com',
    )
  })

  it('does NOT invent an address when the corrected form is absent', () => {
    // Guessing at someone's contact details is worse than publishing what the
    // source actually says.
    expect(preferCorrectlySpelledEmail('alguien@gmai.com', 'sin ninguna otra pista')).toBe(
      'alguien@gmai.com',
    )
  })

  it('leaves a correct address alone', () => {
    expect(preferCorrectlySpelledEmail('concejal@ribarroja.es', page)).toBe('concejal@ribarroja.es')
  })

  it('handles null and malformed input', () => {
    expect(preferCorrectlySpelledEmail(null, page)).toBeNull()
    expect(preferCorrectlySpelledEmail('sin-arroba', page)).toBe('sin-arroba')
  })
})
