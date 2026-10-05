/**
 * /metodologia tiene que decir quién etiquetó la muestra de control de los
 * veredictos, y no darle a su cifra un valor que no tiene.
 *
 * Hasta el 4-10-2026 el apartado «Motor de veredictos» decía «En una muestra de
 * control etiquetada a mano, su veredicto sin-datos acierta ~92 %», y del
 * comparador determinista, «acierta un 33 % en verificado y un 22 % en
 * parcial». La muestra es tests/fixtures/verifier-gold.json: sus etiquetas las
 * puso un modelo (Claude Opus 4.8, 23 y 24-06-2026), su propia cabecera pedía
 * revisarlas antes de tratarlas como patrón, y no consta que ninguna persona lo
 * haya hecho. Las tres cifras eran coincidencia con esas etiquetas —36 de 39,
 * 1 de 3 y 4 de 18—, medida con gpt-5.4-mini, y la pasada de agosto de 2026 se
 * configuró con Claude Code (y en parte la contestó gpt-4o-mini, por el
 * respaldo: tests/llm/procedencia-del-respaldo.test.ts). Ningún dato podía
 * verlo: el dato estaba bien y la frase, mal.
 *
 * Por eso lo que esta prueba exige no está escrito aquí: sale de la firma de
 * cada fila de la muestra (`claseDeFirma`, la misma que rotula las bajadas), y
 * el día que una persona firme filas se pone roja hasta que la página diga lo
 * que esa persona revisó.
 *
 * Se lee el texto RENDERIZADO, no el JSX, como en
 * metodologia-citas-contraste.test.jsx: el comentario «Decía …» guarda a
 * propósito la redacción vieja.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import Metodologia from '../src/pages/Metodologia'
import { claseDeFirma } from '../src/scraper/firma-de-persona'
import { invalidateSnapshots } from '../src/lib/snapshot-store'

const ROOT = join(__dirname, '..')
const MUESTRA = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/verifier-gold.json'), 'utf8'))
const REGISTRO = JSON.parse(readFileSync(join(ROOT, '.automation-measurements.json'), 'utf8'))

/** Las filas que puntúa `eval:verifier`: sólo las `reviewed`. */
const PUNTUADAS = MUESTRA.rows.filter((r) => r.reviewed)
const CLASES = PUNTUADAS.map((r) => claseDeFirma(r.reviewer))
const TODA_DE_UN_MODELO = CLASES.length > 0 && CLASES.every((c) => c === 'automatica')

/** Las mediciones del registro que se tomaron contra esta muestra. */
const CONTRA_LA_MUESTRA = REGISTRO.measurements.filter((m) =>
  /verifier-gold\.json/.test(m.method ?? ''),
)

const realFetch = globalThis.fetch

beforeAll(() => {
  globalThis.fetch = async () => new Response('not found', { status: 404 })
  invalidateSnapshots()
})

afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

/** El apartado del motor, leído como lo lee un visitante. */
function apartadoDelMotor() {
  const { container } = render(<Metodologia />)
  const seccion = container.querySelector('#verificacion-declaraciones')
  expect(seccion, 'falta la sección #verificacion-declaraciones').not.toBeNull()
  const apartado = [...seccion.querySelectorAll('li')].find((li) =>
    li.textContent.trim().startsWith('Motor de veredictos'),
  )
  expect(apartado, 'falta el apartado «Motor de veredictos»: esto no mediría nada').toBeTruthy()
  return apartado.textContent.replace(/\s+/g, ' ')
}

/**
 * «ai-opus-4.8» → /opus[\s-]4\.8/i: la página escribe el modelo en prosa
 * («Claude Opus 4.8») y la firma lo escribe como identificador.
 */
function modeloDeLaFirma(firma) {
  const partes = firma.replace(/^ai-/, '').split('-')
  return new RegExp(partes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s-]'), 'i')
}

describe('/metodologia dice quién etiquetó la muestra de control', () => {
  it('la muestra tiene filas puntuadas', () => {
    expect(PUNTUADAS.length, 'sin filas puntuadas esto no mediría nada').toBeGreaterThan(0)
  })

  it('no la llama hecha a mano ni de etiquetas humanas', () => {
    const texto = apartadoDelMotor()
    expect(texto).not.toMatch(/a mano/i)
    expect(texto).not.toMatch(/etiquetas humanas/i)
  })

  it('dice lo que dicen las firmas de sus filas', () => {
    const texto = apartadoDelMotor()
    if (TODA_DE_UN_MODELO) {
      expect(texto).toMatch(/la etiquetó un modelo/)
      expect(texto).toMatch(/no consta que ninguna persona haya revisado/)
    } else {
      // Una persona ha firmado filas: la frase dejó de ser cierta. Hay que
      // reescribirla con lo que esa persona revisó, y esta prueba con ella.
      expect(texto).not.toMatch(/no consta que ninguna persona/)
    }
  })

  it('nombra el modelo que la etiquetó', () => {
    const texto = apartadoDelMotor()
    const modelos = new Set(
      PUNTUADAS.filter((r) => claseDeFirma(r.reviewer) === 'automatica').map((r) => r.reviewer),
    )
    for (const firma of modelos) expect(texto).toMatch(modeloDeLaFirma(firma))
  })

  it('no da la coincidencia como un porcentaje de acierto', () => {
    // Contra etiquetas de un modelo, la cifra es coincidencia con ese modelo.
    // Vive, con su muestra, en el registro público, no en esta prosa.
    expect(apartadoDelMotor()).not.toMatch(/\d\s*%/)
  })

  it('remite al registro público de mediciones, que las guarda', () => {
    expect(apartadoDelMotor()).toMatch(/\.automation-measurements\.json/)
    expect(CONTRA_LA_MUESTRA.map((m) => m.key).sort()).toEqual([
      'verdict.deterministic.parcial',
      'verdict.deterministic.verificado',
      'verdict.engine.sin-datos',
    ])
  })
})

describe('el registro público dice contra qué etiquetas se midió', () => {
  it('cada medición contra la muestra dice quién la etiquetó', () => {
    for (const m of CONTRA_LA_MUESTRA) {
      if (TODA_DE_UN_MODELO) {
        expect(m.method, m.key).toMatch(/sin revisión humana registrada/)
        expect(m.method, m.key).toMatch(/coincidencia con esas etiquetas/)
        for (const firma of new Set(PUNTUADAS.map((r) => r.reviewer))) {
          expect(m.method, m.key).toMatch(modeloDeLaFirma(firma))
        }
      } else {
        expect(m.method, m.key).not.toMatch(/sin revisión humana registrada/)
      }
    }
  })
})
