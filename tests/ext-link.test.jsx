import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ExtLink } from '../src/components/Primitives'

describe('ExtLink', () => {
  it('renders an anchor with target/rel for http/https URLs', () => {
    const html = renderToStaticMarkup(<ExtLink href="https://example.com/x">label</ExtLink>)
    expect(html).toContain('<a')
    expect(html).toContain('href="https://example.com/x"')
    expect(html).toContain('rel="noreferrer"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('label')
  })

  it('forwards style/title props onto the anchor', () => {
    const html = renderToStaticMarkup(
      <ExtLink href="https://example.com" title="t" style={{ color: 'red' }}>
        x
      </ExtLink>,
    )
    expect(html).toContain('title="t"')
    expect(html).toContain('color:red')
  })

  it('falls back to a span (no live href) for javascript:/data:/fragment/null', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>x</script>',
      '#frag',
      null,
      undefined,
      'not a url',
      // A protocol-relative REMOTE url. It is the one string that looks like a
      // local path and is not, so it stays blocked.
      '//evil.example/x',
    ]) {
      const html = renderToStaticMarkup(<ExtLink href={bad}>label</ExtLink>)
      expect(html).toContain('<span')
      expect(html).not.toContain('<a')
      expect(html).not.toContain('href=')
      expect(html).toContain('label')
    }
  })

  /**
   * `/internal` used to land in the list above, and that was a bug rather than
   * a policy: a vote's per-bloc breakdown cites the session transcript at
   * `/data/pleno-transcripts/<plenoId>.txt`, and turning that into an unlinked
   * <span> made the citation disappear from the page without anything failing.
   * A leading `/` cannot carry a scheme, so it is not the attack `safeHref`
   * exists to stop.
   */
  it('links a site-absolute path so an internal citation stays followable', () => {
    const html = renderToStaticMarkup(
      <ExtLink href="/data/pleno-transcripts/qz6weg.txt">label</ExtLink>,
    )
    expect(html).toContain('<a')
    expect(html).toContain('href="/data/pleno-transcripts/qz6weg.txt"')
  })
})
