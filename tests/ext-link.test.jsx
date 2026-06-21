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

  it('falls back to a span (no live href) for javascript:/data:/relative/null', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>x</script>', '/internal', '#frag', null, undefined, 'not a url']) {
      const html = renderToStaticMarkup(<ExtLink href={bad}>label</ExtLink>)
      expect(html).toContain('<span')
      expect(html).not.toContain('<a')
      expect(html).not.toContain('href=')
      expect(html).toContain('label')
    }
  })
})
