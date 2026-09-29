/**
 * Un motivo enmendado se dice en la bitácora, en texto.
 *
 * Desde `--amend-reason` (correct-pleno-finding), el motivo de una fila puede
 * no ser el que se publicó con ella: una persona lo sustituye y el anterior
 * queda sólo en huella. Si la bitácora pintara el motivo nuevo bajo la fecha y
 * la firma de la corrección original, atribuiría a quien corrigió el 9-08 una
 * explicación escrita el 29-09, y el lector no sabría que hubo otra. Es lo
 * mismo que la bitácora ya aprendió con el texto superado
 * (bitacora-texto-superado.test.jsx): lo que distingue una versión de otra
 * tiene que estar en `textContent`, que es lo que leen el rastreador, el lector
 * de pantalla, el copia-pega y la revisión lectora.
 *
 * La ficha es real y la enmienda la hace la función de verdad, sobre una copia:
 * el fichero publicado no lleva todavía ninguna.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  BitacoraCorrecciones,
  ROTULO_MOTIVO_ENMENDADO,
  ROTULO_TEXTO_RETIRADO,
} from '../../src/components/BitacoraCorrecciones'
import { FindingDetailCard } from '../../src/pages/Hallazgos'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'
import { applyReasonAmendment, validateFindingsSnapshot } from '../../src/scraper/pleno-finding'

const ROOT = join(__dirname, '..', '..')
const CRUDO = readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8')
const PROVENANCE = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
)

const realFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/data/finding-quote-provenance.json')) {
      return new Response(JSON.stringify(PROVENANCE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }
  invalidateSnapshots()
})

afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

/** Lo que lee quien no ve los estilos. */
const plano = (container) => container.textContent.replace(/\s+/g, ' ')

// Ninguna de las dos cadenas dice «enmendado»: si el rótulo aparece, lo ha
// puesto el componente, no los datos.
const MOTIVO_NUEVO =
  'La corrección cambió el sumario porque convertía un reproche en segunda persona en una afirmación de quien lo hacía.'
const ENMIENDA = {
  reason:
    'El motivo publicado daba por hecho un hablante que el cotejo con el vídeo de la sesión desmintió.',
  editor: 'María de la Fuente Llorens',
  amendedAt: '2026-09-29T10:00:00.000Z',
}

/**
 * Una ficha real con al menos dos filas, con el motivo de la primera enmendado.
 * Que ese motivo no lo repita otra fila: varias correcciones del mismo día
 * comparten motivo, y entonces el texto anterior sigue legítimamente en la
 * página, bajo la otra.
 */
function fichaEnmendada() {
  const f = validateFindingsSnapshot(CRUDO).items.find(
    (x) =>
      (x.corrections ?? []).length >= 2 &&
      !x.corrections.some((c) => c.reasonAmendments) &&
      x.corrections.slice(1).every((c) => c.reason !== x.corrections[0].reason),
  )
  const anterior = f.corrections[0].reason
  const { previous } = applyReasonAmendment(f, 0, MOTIVO_NUEVO, ENMIENDA)
  return { f, anterior, previous }
}

describe('la bitácora dice en texto que un motivo se enmendó', () => {
  it('los datos dan una ficha con dos filas o más que enmendar (el control de la medición)', () => {
    const { f, anterior } = fichaEnmendada()
    expect(f, 'ninguna ficha publicada tiene dos correcciones').toBeTruthy()
    expect(anterior.length).toBeGreaterThanOrEqual(40)
    expect(f.corrections[0].reason).toBe(MOTIVO_NUEVO)
  })

  it('dice quién la enmendó, cuándo y por qué, y deja la huella del motivo anterior', () => {
    const { f, previous } = fichaEnmendada()
    const texto = plano(render(<BitacoraCorrecciones correcciones={f.corrections} />).container)
    expect(texto).toContain(ROTULO_MOTIVO_ENMENDADO)
    expect(texto).toContain('2026-09-29')
    expect(texto).toContain(ENMIENDA.editor)
    expect(texto).toContain(ENMIENDA.reason)
    expect(texto).toContain(previous.split(' · ')[1])
  })

  it('el motivo vigente se lee como enmendado, no como el que se publicó con la corrección', () => {
    const { f } = fichaEnmendada()
    const texto = plano(render(<BitacoraCorrecciones correcciones={f.corrections} />).container)
    const i = texto.indexOf(MOTIVO_NUEVO)
    expect(i, 'el motivo vigente no se publica').toBeGreaterThan(0)
    // Lo que va justo delante del motivo es lo que un lector toma por su rótulo.
    expect(texto.slice(Math.max(0, i - 40), i)).toMatch(/enmendado el 2026-09-29/)
  })

  it('no reimprime el motivo anterior, ni en la bitácora ni en la ficha de /hallazgos', async () => {
    const { f, anterior } = fichaEnmendada()
    const suelta = plano(render(<BitacoraCorrecciones correcciones={f.corrections} />).container)
    expect(suelta).not.toContain(anterior.slice(0, 60))
    const { container } = render(<FindingDetailCard f={f} permalink={`#${f.id}`} />)
    await waitFor(() => expect(plano(container)).toContain(ROTULO_MOTIVO_ENMENDADO))
    expect(plano(container)).not.toContain(anterior.slice(0, 60))
  })

  it('una fila sin enmienda no dice que la tenga', () => {
    const { f } = fichaEnmendada()
    const texto = plano(
      render(<BitacoraCorrecciones correcciones={[f.corrections[1]]} />).container,
    )
    expect(texto).not.toContain(ROTULO_MOTIVO_ENMENDADO)
    // «enmienda» sola sale en los motivos de verdad —las enmiendas del pleno—;
    // lo que no puede salir es el rótulo del motivo.
    expect(texto).not.toMatch(/\(enmendado el/)
    expect(texto).not.toMatch(/motivos? enmendados?/)
  })

  it('la enmienda no añade un «texto retirado»: no tacha nada de la ficha', () => {
    const { f } = fichaEnmendada()
    const { container } = render(<BitacoraCorrecciones correcciones={f.corrections} />)
    const texto = plano(container)
    expect(texto.split(ROTULO_TEXTO_RETIRADO).length - 1).toBe(f.corrections.length)
    expect(container.querySelectorAll('del')).toHaveLength(f.corrections.length)
  })

  it('el resumen de la bitácora avisa antes de abrirla', () => {
    const { f } = fichaEnmendada()
    const { container } = render(<BitacoraCorrecciones correcciones={f.corrections} />)
    const resumen = container.querySelector('summary').textContent.replace(/\s+/g, ' ')
    expect(resumen).toContain(`Bitácora de correcciones · ${f.corrections.length}`)
    expect(resumen).toContain('1 motivo enmendado')
  })
})
