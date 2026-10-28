import { describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CorrectionLog } from '../src/pages/AgenteReporte'

/**
 * La Bitácora de correcciones pinta el texto original y el corregido tal cual
 * vienen del JSON. Las primeras correcciones con negrita (06-09-2026: cierre de
 * un mandato, un adorno retirado) enseñaron sus asteriscos en las dos páginas —
 * el mismo defecto que PR #104 quitó de los relatos, un componente más abajo.
 */
const corrections = [
  {
    field: 'narrative.Elección y toma de posesión.bodyMarkdown',
    original: 'queda como **n.º 1 y portavoz** (suplente: Soraya Trejo)',
    corrected: 'queda como **n.º 1 y portavoz** (suplente en 2023: Soraya Trejo, que renunció)',
    reason: 'La portavoz suplente nombrada renunció al acta en 2025.',
    editor: 'Sergei Lutchenko',
    correctedAt: '2026-09-06',
  },
]

describe('CorrectionLog: la bitácora se lee como se escribió', () => {
  it('pinta **negrita** como <strong> en el original y en el corregido, sin asteriscos', () => {
    const { container } = render(<CorrectionLog corrections={corrections} />)
    const strongs = [...container.querySelectorAll('strong')].map((n) => n.textContent)
    expect(strongs.filter((s) => s === 'n.º 1 y portavoz')).toHaveLength(2)
    expect(container.textContent).not.toContain('**')
    expect(container.textContent).toContain('suplente en 2023')
    expect(container.textContent).toContain('2026-09-06')
  })

  it('sin correcciones no pinta nada', () => {
    const { container } = render(<CorrectionLog corrections={[]} />)
    expect(container.textContent).toBe('')
  })
})

/**
 * La bitácora enseña una ventana de 200 caracteres de cada versión, y la
 * cortaba ANTES de trocear: una negrita que cruzaba el carácter 200 perdía su
 * cierre y dejaba a la vista el `**` de apertura. Medido el 05-10-2026 en
 * a-alberto-gimeno-bio-v2, donde la versión retirada acababa en «devuelve
 * **0 c». Y los párrafos de la ventana salían pegados («Uno.Dos.»): ninguna
 * fila publicada tiene hoy un salto en sus 200 primeros caracteres, pero el
 * comentario de `Recorte` prometía un espacio.
 */
describe('CorrectionLog: el recorte se hace sobre el texto que se lee', () => {
  const fila = (original, corrected) => ({
    field: 'narrative.Trayectoria.bodyMarkdown',
    original,
    corrected,
    reason: 'Motivo de prueba con la longitud de un motivo de verdad.',
    editor: 'civicpulse-curator',
    correctedAt: '2026-09-06',
  })

  it('una negrita que cruza el corte sigue en <strong>, sin su «**» de apertura', () => {
    const original = `${'a'.repeat(190)} **negrita partida** y después más texto`
    const { container } = render(<CorrectionLog corrections={[fila(original, 'Corregido.')]} />)
    expect(container.textContent).not.toContain('**')
    const tachadas = [...container.querySelectorAll('del strong')].map((n) => n.textContent)
    expect(tachadas).toHaveLength(1)
    expect(tachadas[0].length).toBeGreaterThan(0)
    expect('negrita partida'.startsWith(tachadas[0])).toBe(true)
  })

  it('los párrafos de la ventana se leen separados por un espacio', () => {
    const { container } = render(
      <CorrectionLog corrections={[fila('Uno.\n\nDos.', 'Tres.\n\nCuatro.')]} />,
    )
    expect(container.textContent).toContain('Uno. Dos.')
    expect(container.textContent).toContain('Tres. Cuatro.')
  })

  it('ninguna bitácora de un informe publicado enseña un asterisco de negrita', () => {
    const DIR = join(__dirname, '..', 'public/data/journalist-reports')
    const informes = readdirSync(DIR).map((n) => JSON.parse(readFileSync(join(DIR, n), 'utf8')))
    let filas = 0
    for (const r of informes.filter((x) => x.corrections?.length)) {
      filas += r.corrections.length
      const { container } = render(<CorrectionLog corrections={r.corrections} />)
      expect(container.textContent, r.id).not.toContain('**')
      cleanup()
    }
    expect(filas, 'ningún informe con bitácora: esto no mide nada').toBeGreaterThan(0)
  })
})

/**
 * La ventana empezaba siempre en el carácter 0. Una corrección que reemplaza
 * el cuerpo entero de una sección y cambia una frase del final enseñaba dos
 * versiones con los mismos 200 primeros caracteres: «retirado» y «vigente»
 * idénticos, y el cambio, que es lo único que la bitácora existe para mostrar,
 * fuera de la vista. Medido el 18-10-2026 en tres de las siete correcciones de
 * retribución (Gómez Sánchez, Hernández Carrizosa, Pozuelo): el cambio
 * empezaba en los caracteres 266, 487 y 308.
 */
describe('CorrectionLog: la ventana enseña lo que cambió', () => {
  const fila = (original, corrected) => ({
    field: 'narrative.Retribución.bodyMarkdown',
    original,
    corrected,
    reason: 'Motivo de prueba con la longitud de un motivo de verdad.',
    editor: 'civicpulse-curator',
    correctedAt: '2026-10-18',
  })
  const versiones = (container) => ({
    retirado: container.querySelector('del').textContent,
    vigente: container.querySelector('del').nextElementSibling.nextElementSibling.textContent,
  })

  it('un cambio más allá del carácter 200 se ve en las dos versiones', () => {
    const comun = `${'Texto común de la sección que no cambia. '.repeat(8)}`
    const { container } = render(
      <CorrectionLog
        corrections={[fila(`${comun}Percibe 38.891,66 euros.`, `${comun}Fijó 38.891,66 euros.`)]}
      />,
    )
    const v = versiones(container)
    expect(v.retirado).toContain('Percibe 38.891,66')
    expect(v.vigente).toContain('Fijó 38.891,66')
    // Recortada por delante, y dicho: sin «…» parecería que el texto empieza ahí.
    expect(v.retirado.startsWith('…')).toBe(true)
    expect(v.vigente.startsWith('…')).toBe(true)
  })

  it('un cambio dentro de los primeros caracteres sigue empezando por el principio', () => {
    const { container } = render(<CorrectionLog corrections={[fila('Uno dos.', 'Uno tres.')]} />)
    const v = versiones(container)
    expect(v.retirado).toBe('Uno dos.')
    expect(v.vigente).toBe('Uno tres.')
  })

  it('en ninguna bitácora publicada «retirado» y «vigente» se leen iguales', () => {
    const DIR = join(__dirname, '..', 'public/data/journalist-reports')
    const informes = readdirSync(DIR).map((n) => JSON.parse(readFileSync(join(DIR, n), 'utf8')))
    let distintas = 0
    for (const r of informes.filter((x) => x.corrections?.length)) {
      for (const c of r.corrections) {
        if (c.original === c.corrected) continue
        distintas += 1
        const { container } = render(<CorrectionLog corrections={[c]} />)
        const v = versiones(container)
        expect(v.retirado, `${r.id} · ${c.field}`).not.toBe(v.vigente)
        cleanup()
      }
    }
    expect(distintas, 'ninguna corrección que cambie texto: esto no mide nada').toBeGreaterThan(0)
  })
})

/**
 * Las dos filas nuevas del 28-10-2026 (`correct-journalist-report`): un motivo
 * enmendado y una fuente añadida. La enmienda se pinta como en /hallazgos —el
 * motivo vigente rotulado «enmendado el …», y debajo la fecha, la firma, el
 * porqué y la huella del anterior, nunca su texto—, y una fuente añadida no
 * retiró nada, así que no lleva rótulo de texto retirado sobre un tachado vacío.
 */
describe('CorrectionLog: motivo enmendado y fuente añadida', () => {
  const enmendada = {
    field: 'warnings[1]',
    original: 'Las delegaciones han variado durante el mandato.',
    corrected: 'Las delegaciones han variado: Resolución 2513/2023 y Resolución 2639/2023.',
    reason:
      'El cambio de delegaciones lo dictó la Resolución 2639/2023, once días después del decreto original, y se publicó en el BOP el 10-07-2023.',
    editor: 'Sergei Lutchenko',
    correctedAt: '2026-09-05',
    reasonAmendments: [
      {
        previous: 'motivo · sha256:5f3a1c2e9b01',
        reason:
          'Once días median entre los dos decretos; el BOP publicó la modificación el 10-07-2023.',
        editor: 'Sergei Lutchenko',
        amendedAt: '2026-10-28',
      },
    ],
  }

  it('el motivo enmendado lo dice delante, con la enmienda y la huella debajo', () => {
    const { container } = render(<CorrectionLog corrections={[enmendada]} />)
    const t = container.textContent
    expect(t).toContain('Motivo (enmendado el 2026-10-28):')
    expect(t).toContain('Motivo enmendado: 2026-10-28 · Sergei Lutchenko')
    expect(t).toContain('5f3a1c2e9b01')
  })

  it('una fuente añadida no pinta «texto retirado» sobre nada', () => {
    const anadida = {
      field: 'sources.src-126',
      original: '',
      corrected: 'PLACSP · expediente 27/2018 · https://contrataciondelestado.es/…',
      reason: 'La frase corregida necesitaba la ficha de PLACSP que la sostiene.',
      editor: 'civicpulse-curator',
      correctedAt: '2026-10-28',
    }
    const { container } = render(<CorrectionLog corrections={[anadida]} />)
    expect(container.querySelector('del')).toBeNull()
    expect(container.textContent).toContain('PLACSP · expediente 27/2018')
  })
})
