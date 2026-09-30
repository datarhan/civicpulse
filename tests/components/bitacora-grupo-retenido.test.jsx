/**
 * Lo que pinta la bitácora de una fila cuya copia servida no reproduce la
 * versión que nombraba a un grupo de un solo escaño
 * (`src/scraper/grupos-retenidos.ts`, aplicado al compilar por
 * `publication-denylist.js`).
 *
 * Hasta el 30-09-2026 la bitácora imprimía esa versión como cualquier otra:
 * «Compromís» tachado junto a «sin identificar», «VOX manifestó…» como texto
 * retirado. La copia servida ya no la trae; la fila tiene que decir en texto qué
 * falta y por qué, sin tachar la marca como si fuera lo retirado —un tachado es
 * un estilo, no una redacción, y aquí no hay nada debajo que tachar— y sin
 * rotular como «texto vigente» una versión que no se enseña.
 *
 * Todo se afirma sobre `textContent`, que es lo que leen el rastreador, el lector
 * de pantalla, el copia-pega y la revisión lectora, también con el `<details>`
 * cerrado.
 */
import { describe, expect, it, afterAll } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  BitacoraCorrecciones,
  ROTULO_TEXTO_RETIRADO,
  ROTULO_TEXTO_VIGENTE,
} from '../../src/components/BitacoraCorrecciones'
import { MARCA_GRUPO_RETENIDO, ROTULO_GRUPO_RETENIDO } from '../../src/lib/grupo-retenido'
import { findPartiesInText } from '../../src/lib/party-alias'
import { oneSeatBlocsOf } from '../../src/scraper/corporation-seats'
import { copiaServidaDeHallazgos } from '../../publication-denylist.js'

afterAll(() => cleanup())

const plano = (container) => container.textContent.replace(/\s+/g, ' ')

const base = {
  reason: 'Se retira la atribución de la cita: el mapa de hablantes no acredita quién habló.',
  editor: 'civicpulse-curator',
  correctedAt: '2026-09-30T08:00:00.000Z',
  grupoRetenido: true,
}

const ETIQUETA = {
  ...base,
  field: 'quote.2.speakerGroup',
  original: MARCA_GRUPO_RETENIDO,
  corrected: 'sin identificar',
}
const VIGENTE =
  'En otra intervención se destacan las actuaciones de mejora en los centros educativos.'
const RETIRADO =
  'En la sesión, un grupo no identificado señala la existencia de un contrato de residuos.'

describe('una fila con una versión que no se reproduce', () => {
  it('la etiqueta retirada: lo dice en texto, no tacha nada y deja leer lo vigente', () => {
    const { container } = render(<BitacoraCorrecciones correcciones={[ETIQUETA]} />)
    const texto = plano(container)
    expect(texto).toContain(ROTULO_GRUPO_RETENIDO)
    expect(texto).toMatch(/un solo concejal/)
    expect(texto).toMatch(/no reproduce/)
    // La marca es para quien lee el JSON; en la página, la frase la explica.
    expect(texto).not.toContain(MARCA_GRUPO_RETENIDO)
    expect(container.querySelector('del')).toBeNull()
    expect(texto).toContain(`${ROTULO_TEXTO_VIGENTE}: sin identificar`)
  })

  it('la versión que retiró no se reproduce: se lee la vigente, sin tachar nada', () => {
    const f = { ...base, field: 'summary', original: MARCA_GRUPO_RETENIDO, corrected: VIGENTE }
    const { container } = render(<BitacoraCorrecciones correcciones={[f]} />)
    const texto = plano(container)
    expect(texto).toMatch(/la versión que retiró/)
    expect(texto).toContain(`${ROTULO_TEXTO_VIGENTE}: ${VIGENTE}`)
    expect(texto).not.toContain(ROTULO_TEXTO_RETIRADO)
    expect(container.querySelector('del')).toBeNull()
  })

  it('la versión que puso no se reproduce: se tacha la retirada y nada se rotula vigente', () => {
    const f = { ...base, field: 'summary', original: RETIRADO, corrected: MARCA_GRUPO_RETENIDO }
    const { container } = render(<BitacoraCorrecciones correcciones={[f]} />)
    const texto = plano(container)
    expect(texto).toMatch(/la versión que puso/)
    expect(container.querySelector('del')?.textContent).toBe(RETIRADO)
    expect(texto).toContain(ROTULO_TEXTO_RETIRADO)
    // Rotular «vigente» una versión que no se enseña diría que la ficha nombra
    // hoy a ese grupo.
    expect(texto).not.toContain(ROTULO_TEXTO_VIGENTE)
  })

  it('ninguna de las dos: ni retirado ni vigente', () => {
    const f = {
      ...base,
      field: 'title',
      original: MARCA_GRUPO_RETENIDO,
      corrected: MARCA_GRUPO_RETENIDO,
    }
    const { container } = render(<BitacoraCorrecciones correcciones={[f]} />)
    const texto = plano(container)
    expect(texto).toMatch(/ninguna de sus dos versiones/)
    expect(texto).not.toContain(ROTULO_TEXTO_RETIRADO)
    expect(texto).not.toContain(ROTULO_TEXTO_VIGENTE)
    expect(container.querySelector('del')).toBeNull()
  })

  it('conserva quién, cuándo y por qué', () => {
    const { container } = render(<BitacoraCorrecciones correcciones={[ETIQUETA]} />)
    const texto = plano(container)
    expect(texto).toContain(ETIQUETA.editor)
    expect(texto).toContain('2026-09-30')
    expect(texto).toContain(ETIQUETA.reason)
  })

  it('dice una vez, al pie, que no se sirve pero sigue en el repositorio público', () => {
    const ordinaria = {
      ...base,
      grupoRetenido: undefined,
      field: 'summary',
      original: RETIRADO,
      corrected: VIGENTE,
    }
    const conDos = plano(
      render(<BitacoraCorrecciones correcciones={[ETIQUETA, ETIQUETA, ordinaria]} />).container,
    )
    expect(conDos.match(/repositorio público/g)?.length).toBe(1)
    const sinNinguna = plano(render(<BitacoraCorrecciones correcciones={[ordinaria]} />).container)
    expect(sinNinguna).not.toMatch(/repositorio público/)
  })
})

describe('sobre los datos servidos', () => {
  const ROOT = join(__dirname, '..', '..')
  const leer = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
  const FUENTE = leer('public/data/pleno-findings.json')
  const OFFICIALS = leer('public/data/officials.json')
  const SERVIDA = copiaServidaDeHallazgos(
    FUENTE,
    leer('public/data/finding-quote-provenance.json'),
    OFFICIALS,
  ).snapshot
  const unEscano = oneSeatBlocsOf(OFFICIALS)
  const nombrados = (container) =>
    findPartiesInText(container.textContent).filter((g) => unEscano.includes(g))

  /** Etiquetas de VOX y de Compromís retiradas y sus sumarios reescritos, y ningún motivo que los nombre. */
  const ID = 'f-2025-12-23-afi-3eebaf'

  it('la bitácora del repositorio los nombraba (si no, lo de abajo no mide nada)', () => {
    const fuente = FUENTE.items.find((f) => f.id === ID)
    expect(fuente, `${ID} ya no está publicada: elige otra`).toBeTruthy()
    const { container } = render(<BitacoraCorrecciones correcciones={fuente.corrections} />)
    expect(nombrados(container).sort()).toEqual(['Compromís', 'VOX'])
  })

  it('la servida, entera, no nombra a ninguno', () => {
    const servida = SERVIDA.items.find((f) => f.id === ID)
    const { container } = render(<BitacoraCorrecciones correcciones={servida.corrections} />)
    expect(nombrados(container)).toEqual([])
    expect(plano(container)).toContain(ROTULO_GRUPO_RETENIDO)
  })
})
