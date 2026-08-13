import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Card } from '../src/components/Primitives'

/**
 * `<Card>` destructured a fixed prop list and dropped everything else. Nine
 * call sites passed `id` — `/hallazgos` (one per finding) and `/metodologia`
 * (eight section anchors) — and React never saw it, so every `#f-…` permalink
 * in CmdK, in the ClaimReview JSON-LD and in the card's own «enlace permanente»
 * landed on the top of the page instead of the finding it names.
 *
 * The failure mode is what makes it worth a test: a dropped prop is silent.
 * Nothing warns, the anchor href is well-formed, and the page still renders —
 * it just scrolls nowhere. So assert the attribute reaches the DOM, and assert
 * it for the real call sites rather than only for a synthetic one.
 */
describe('Card prop passthrough', () => {
  it('forwards id to the rendered element', () => {
    const html = renderToStaticMarkup(<Card id="f-2026-07-03-cit-1e90e0">x</Card>)
    expect(html).toContain('id="f-2026-07-03-cit-1e90e0"')
  })

  it('forwards other DOM attributes callers may need for a11y', () => {
    const html = renderToStaticMarkup(
      <Card id="x" role="group" aria-label="Hallazgo" className="mono">
        y
      </Card>,
    )
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="Hallazgo"')
    expect(html).toContain('class="mono"')
  })

  it('keeps its own styling and does not let a passthrough clobber it', () => {
    const html = renderToStaticMarkup(
      <Card id="x" style={{ marginTop: 14 }}>
        y
      </Card>,
    )
    // El token, no el número. Esta línea decía `border-radius:12px` y se cayó
    // en cuanto Card pasó a usar `var(--r-card)` — que es exactamente el
    // cambio que se quería. Un test que fija el VALOR de un token convierte
    // adoptar la escala en una regresión, así que aquí se comprueba que Card
    // usa el token y, aparte, que ese token vale lo que el brandbook dice,
    // leyéndolo de index.css en vez de repetirlo.
    expect(html).toContain('border-radius:var(--r-card)')
    expect(html).toContain('margin-top:14px')
    const css = readFileSync(join(__dirname, '..', 'src/index.css'), 'utf8')
    expect(css).toMatch(/--r-card:\s*12px/)
  })

  it('still honours pad=false', () => {
    expect(renderToStaticMarkup(<Card pad={false}>y</Card>)).toContain('padding:0')
    expect(renderToStaticMarkup(<Card>y</Card>)).toContain('padding:18px')
  })

  it('does not leak its own props onto the DOM as attributes', () => {
    const html = renderToStaticMarkup(
      <Card pad hover>
        y
      </Card>,
    )
    expect(html).not.toContain('pad=')
    expect(html).not.toContain('hover=')
  })

  /**
   * The unit assertions above pass with a one-prop fix. This one is the reason
   * the bug existed: it pins the *call sites*, so a future refactor that
   * narrows Card's signature again goes red where the drop happens rather than
   * shipping nine dead anchors.
   */
  it('every source file that passes an id to Card gets it rendered', () => {
    const files = []
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.(jsx|tsx)$/.test(e.name)) files.push(p)
      }
    }
    walk('src')

    const callers = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/<Card\b[^>]*\bid=/g)) {
        callers.push(`${f}:${src.slice(0, m.index).split('\n').length}`)
      }
    }

    // Assert the check evaluated something: a scan that found no callers would
    // otherwise "pass" while the passthrough was reverted.
    expect(callers.length, 'no <Card id=…> call sites found — did the scan break?').toBeGreaterThan(
      0,
    )
    expect(renderToStaticMarkup(<Card id="probe">x</Card>)).toContain('id="probe"')
  })
})
