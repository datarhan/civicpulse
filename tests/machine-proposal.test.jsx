/**
 * Brandbook §06b. La propuesta automática es el componente con más carga legal
 * del producto y no estaba en la biblioteca: se dibujaba a mano en /promesas.
 *
 * La arquitectura de dos ficheros —lo publicado y lo sugerido— no protege de
 * nada si en pantalla una inferencia de máquina se parece a un estado curado.
 * Por eso las reglas viven DENTRO del componente y no en cada llamada: una
 * llamada puede olvidarse de pasar la confianza, y lo que no puede es publicar
 * igualmente.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MachineProposal } from '../src/components/Primitives'

const ROOT = join(__dirname, '..')

describe('<MachineProposal> se anuncia como máquina', () => {
  it('declara que es automática, que está pendiente y cuánto se fía', () => {
    const html = renderToStaticMarkup(
      <MachineProposal confidence={0.78}>propone estado: Documentada</MachineProposal>,
    )
    expect(html).toMatch(/autom[áa]tica/i)
    expect(html).toMatch(/pendiente de revisi[óo]n humana/i)
    expect(html).toContain('78%')
  })

  it('dice a quién corresponde decidir, y que no está publicada', () => {
    const html = renderToStaticMarkup(<MachineProposal confidence={0.5}>x</MachineProposal>)
    expect(html).toMatch(/no est[áa] publicada/i)
    expect(html).toMatch(/un curador humano/i)
  })

  it('va en caja discontinua y en morado intel', () => {
    // La caja discontinua es lo que dice «esto no es una afirmación en firme».
    const html = renderToStaticMarkup(<MachineProposal confidence={0.5}>x</MachineProposal>)
    expect(html).toMatch(/border:1px dashed var\(--intel\)/)
    expect(html).toMatch(/var\(--intel-soft\)/)
  })

  describe('sin porcentaje no se publica', () => {
    // La regla que convierte esto en una regla y no en una decoración: es
    // preferible no enseñar nada a enseñar una propuesta que no declara cuánto
    // se fía de sí misma.
    for (const malo of [undefined, null, NaN, 0, -0.5, 1.5, '0.8']) {
      it(`no dibuja nada con confidence = ${JSON.stringify(malo)}`, () => {
        const html = renderToStaticMarkup(<MachineProposal confidence={malo}>x</MachineProposal>)
        expect(html).toBe('')
      })
    }

    it('control: con una confianza utilizable SÍ dibuja', () => {
      // Sin este control, un componente que devolviera null siempre pasaría
      // todas las pruebas de arriba.
      const html = renderToStaticMarkup(<MachineProposal confidence={0.01}>x</MachineProposal>)
      expect(html).not.toBe('')
      expect(html).toContain('1%')
    })
  })

  it('no pinta ni acepta un veredicto: no sustituye a la pastilla de estado', () => {
    // §06b. El componente no tiene ranura para un veredicto curado, así que no
    // puede ocupar su sitio por descuido de una llamada.
    const html = renderToStaticMarkup(
      <MachineProposal confidence={0.9} verdict="CORROBORADO" tone="ok">
        x
      </MachineProposal>,
    )
    expect(html).not.toContain('CORROBORADO')
  })
})

describe('la caja discontinua significa una sola cosa en todo el sitio', () => {
  // El brandbook dice «es la única línea discontinua del sistema». En este repo
  // eso es FALSO: hay dieciséis filetes discontinuos que sólo separan filas, y
  // perseguirlos no gana nada editorial. La regla verdadera es sobre la CAJA:
  // un contorno discontinuo completo marca lo que NO es una afirmación
  // publicada en firme — la fecha que no consta, el estado que no consta, la
  // votación retirada y la propuesta de máquina.
  function ficheros(dir, acc = []) {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e.startsWith('.')) continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) ficheros(p, acc)
      else if (/\.jsx?$/.test(p)) acc.push(p)
    }
    return acc
  }

  const ESPERADAS = {
    'src/components/Primitives.jsx': 'la propuesta de máquina',
    'src/components/PlenoFindings.jsx': 'fecha y estado que no constan',
    'src/components/plenos/VoteBreakdownRetracted.jsx': 'votación retirada',
    // La misma familia exacta, y en el índice de plenos es el tema de la
    // página: la caja discontinua marca la parte del acta que NO hemos
    // procesado —«sin extraer», «sin transcribir»—, que es lo que había que
    // separar del cero. Un cero es una afirmación en firme sobre el registro;
    // esto es la ausencia de una.
    'src/components/plenos/TablaSesiones.jsx': 'la parte del acta que no hemos procesado',
    'src/components/eficiencia/DeclaracionEntregas.jsx':
      'la entrega que el ayuntamiento no presentó',
    // La misma provisionalidad que la de arriba, a escala de panel: la rejilla
    // de la ficha dice qué falta en ESTE servicio y la figura del panel dice
    // qué entrega falta entera. Un hueco no se pinta como una barra vacía —eso
    // se lee como «cero»— sino como una caja sin cerrar.
    'src/components/eficiencia/EntregasBarras.jsx': 'la entrega que el ayuntamiento no presentó',
    'src/components/eficiencia/libro.css.js':
      'una posición que la muestra no sostiene: la banda plausible cruza la mediana',
    // Exactamente la misma familia: «no medido» es la AUSENCIA de una
    // afirmación, no un hallazgo y tampoco un visto bueno. Va en caja
    // discontinua para que no se pueda leer junto a los puntos débiles —que sí
    // son afirmaciones en firme— como si fuera uno más. La página es local y no
    // se despliega, pero la doctrina es semántica y aquí se cumple.
    'src/pages/Despiece.jsx': 'la comprobación que no se pudo hacer',
  }

  it('ninguna caja discontinua nueva aparece sin declarar qué provisionalidad marca', () => {
    const publicos = ficheros(join(ROOT, 'src')).filter(
      (p) => !p.includes(join('pages', 'curator')),
    )
    // Sólo la propiedad `border` —la caja entera—, nunca borderTop/Bottom/Left,
    // que son separadores. `\bborder:` no casa dentro de `borderTop:` porque
    // ahí tras «border» viene una T y no los dos puntos. Cubre además la forma
    // en ternario, `border: known ? 'none' : '1px dashed …'`.
    const CAJA = /\bborder:[^;\n]*1px dashed/
    const conCaja = publicos.filter((p) => CAJA.test(readFileSync(p, 'utf8')))
    const rel = conCaja.map((p) => p.replace(ROOT + '/', '')).sort()
    expect(rel).toEqual(Object.keys(ESPERADAS).sort())
  })

  it('el barrido miró ficheros de verdad', () => {
    const publicos = ficheros(join(ROOT, 'src')).filter(
      (p) => !p.includes(join('pages', 'curator')),
    )
    expect(publicos.length).toBeGreaterThan(100)
  })
})
