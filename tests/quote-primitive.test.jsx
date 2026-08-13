/**
 * Outfit no tiene cursiva. `index.html` la carga como `wght@400;500;600;700`,
 * sin eje `ital`, y el producto pedía `fontStyle: 'italic'` en treinta y cuatro
 * sitios — entre ellos las citas de /hallazgos, /promesas, /departamentos,
 * /cargos y el agente periodista. El navegador no falla: inclina la romana por
 * transformación geométrica y devuelve una oblicua falsa. Sobre la declaración
 * literal de un cargo público, eso es componer una prueba con una letra que no
 * existe.
 *
 * Ninguna prueba de datos podía verlo: el texto citado era correcto en todas.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Quote } from '../src/components/Primitives'

const ROOT = join(__dirname, '..')

describe('<Quote> compone la cita, no la inclina', () => {
  it('nunca emite font-style: italic', () => {
    const html = renderToStaticMarkup(<Quote text="el día 12 ya está otra empresa" />)
    expect(html).not.toMatch(/italic/)
  })

  it('pone las comillas latinas, para que no las escriba cada llamada', () => {
    const html = renderToStaticMarkup(<Quote text="funcionando que es FCC" />)
    expect(html).toContain('«funcionando que es FCC»')
    // Y no las duplica si alguien las trae ya puestas: eso es responsabilidad
    // de la llamada, así que se comprueba que el componente no añade otras.
    const comillas = (html.match(/«/g) || []).length
    expect(comillas).toBe(1)
  })

  it('marca la cita con el filete de petróleo y la medida de 68 caracteres', () => {
    const html = renderToStaticMarkup(<Quote text="x" />)
    expect(html).toMatch(/border-left:3px solid var\(--civic\)/)
    expect(html).toMatch(/max-width:68ch/)
  })

  it('usa marcado semántico de cita, no un div suelto', () => {
    const html = renderToStaticMarkup(<Quote text="x" source="Pleno 2026-07-03 · min 14:22" />)
    expect(html).toContain('<figure')
    expect(html).toContain('<blockquote')
    expect(html).toContain('<figcaption')
  })

  describe('la atribución distingue tres casos, y la diferencia es editorial', () => {
    it('nombra al bloc cuando se sabe', () => {
      const html = renderToStaticMarkup(<Quote text="x" attribution="PSOE" />)
      expect(html).toContain('PSOE')
      expect(html).not.toContain('sin atribuir')
    })

    it('dice «sin atribuir» cuando es habla y no se sabe de quién', () => {
      // §08: nunca un grupo de relleno. Un null tiene que verse en pantalla.
      const html = renderToStaticMarkup(<Quote text="x" attribution={null} />)
      expect(html).toContain('sin atribuir')
    })

    it('no atribuye nada cuando no es habla', () => {
      // Control: sin esto, las dos pruebas de arriba pasarían con un componente
      // que imprimiese «sin atribuir» siempre, incluso sobre el extracto de un
      // documento, que no tiene quien lo diga.
      const html = renderToStaticMarkup(<Quote text="extracto de un pliego" />)
      expect(html).not.toContain('sin atribuir')
      expect(html).not.toContain('figcaption')
    })
  })
})

describe('ninguna cita publicada se inclina', () => {
  // El barrido, sobre el código de verdad. Las colas del curador (/curator) son
  // locales y no se publican; el resto sí, y ahí una oblicua sintética sobre un
  // verbatim es la pieza peor compuesta del sitio.
  function ficheros(dir, acc = []) {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e.startsWith('.')) continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) ficheros(p, acc)
      else if (/\.jsx?$/.test(p)) acc.push(p)
    }
    return acc
  }

  const PUBLICOS = ficheros(join(ROOT, 'src')).filter((p) => !p.includes(join('pages', 'curator')))

  it('no hay un fontStyle italic pegado a un verbatim en superficie pública', () => {
    const culpables = []
    for (const p of PUBLICOS) {
      const txt = readFileSync(p, 'utf8')
      const lineas = txt.split('\n')
      lineas.forEach((l, i) => {
        if (!/fontStyle: *['"]italic/.test(l)) return
        // ¿hay un verbatim en las diez líneas siguientes? Es donde el JSX lo
        // pinta: el estilo va en el contenedor y el texto justo debajo.
        const ventana = lineas.slice(i, i + 10).join('\n')
        if (
          /\{[^}]*\.(verbatim|quote|text|excerpt|plenoQuote|verbatimRef|dueBySource)\b/.test(
            ventana,
          )
        )
          culpables.push(`${p.replace(ROOT + '/', '')}:${i + 1}`)
      })
    }
    expect(culpables, 'una cita literal compuesta en oblicua sintética').toEqual([])
  })

  it('el barrido miró ficheros de verdad', () => {
    // Sin esto, un glob roto dejaría la prueba de arriba verde sin abrir nada.
    expect(PUBLICOS.length).toBeGreaterThan(100)
    expect(PUBLICOS.some((p) => p.endsWith('Hallazgos.jsx'))).toBe(true)
  })
})
