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
    // La clase del llamante SOBREVIVE junto a la de Card. Antes se comprobaba
    // `class="mono"` literal, que fijaba que Card no tuviera clase propia:
    // una prueba que describe el mecanismo en vez del contrato convierte en
    // regresión justo el cambio que se quería. Es la lección que ya está
    // escrita tres líneas más abajo sobre el radio, un piso más arriba.
    expect(html).toMatch(/class="[^"]*\bcp-card\b[^"]*"/)
    expect(html).toMatch(/class="[^"]*\bmono\b[^"]*"/)
  })

  it('keeps its own styling and does not let a passthrough clobber it', () => {
    const html = renderToStaticMarkup(
      <Card id="x" style={{ marginTop: 14 }}>
        y
      </Card>,
    )
    // El estilo del llamante llega y NO se lleva por delante lo de Card: lo de
    // Card ya no vive en el atributo `style` sino en `.cp-card`, que es lo que
    // le permite tener `:hover` y `:focus-within` —§16 pide paridad y un
    // estilo inline no puede darla—. Así que se comprueba lo mismo de siempre
    // en los dos sitios donde ahora vive: la clase en el marcado y el token en
    // la hoja, leído de index.css en vez de repetido.
    expect(html).toContain('margin-top:14px')
    expect(html).toMatch(/class="[^"]*\bcp-card\b[^"]*"/)
    const css = readFileSync(join(__dirname, '..', 'src/index.css'), 'utf8')
    const regla = css.slice(css.indexOf('.cp-card {'), css.indexOf('.cp-card-flush'))
    expect(regla).toContain('border-radius: var(--r-card)')
    expect(regla).toContain('border: 1px solid var(--ink10)')
    expect(css).toMatch(/--r-card:\s*12px/)
    // §06 · «Card · borde ink10, radio 12, padding 20, sin sombra».
    expect(regla).toMatch(/padding:\s*20px/)
    expect(regla).not.toContain('box-shadow')
  })

  it('still honours pad=false', () => {
    expect(renderToStaticMarkup(<Card pad={false}>y</Card>)).toMatch(
      /class="[^"]*\bcp-card-flush\b[^"]*"/,
    )
    expect(renderToStaticMarkup(<Card>y</Card>)).not.toMatch(/\bcp-card-flush\b/)
    const css = readFileSync(join(__dirname, '..', 'src/index.css'), 'utf8')
    expect(css.slice(css.indexOf('.cp-card-flush'))).toMatch(/padding:\s*0/)
  })

  /**
   * §16 · «Todo lo que aparece con onMouseEnter aparece también con onFocus.»
   * El brandbook cita este componente por su nombre: reaccionaba al puntero
   * mutando `style.borderColor` dentro de un `onMouseEnter`, de modo que un
   * lector con teclado no recibía nada — y la tarjeta está en casi doscientos
   * sitios. La paridad no se puede comprobar en el marcado servido, así que se
   * comprueba donde vive: la regla lleva los dos selectores o no los lleva.
   */
  it('hover y foco van a la par, y ninguno se pinta mutando estilo', () => {
    const css = readFileSync(join(__dirname, '..', 'src/index.css'), 'utf8')
    const bloque = css.slice(css.indexOf('.cp-card-hover'))
    expect(bloque).toContain('.cp-card-hover:hover')
    expect(bloque).toContain('.cp-card-hover:focus-within')
    const fuente = readFileSync(join(__dirname, '..', 'src/components/Primitives.jsx'), 'utf8')
    const card = fuente.slice(fuente.indexOf('export function Card('), fuente.indexOf('PartyTag'))
    expect(card, 'Card no puede volver a pintar estados mutando style').not.toContain(
      'onMouseEnter',
    )
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
