import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLASES_DE_CHARLA, charlaDeTarea } from '../../src/scraper/charla-de-tarea'

/**
 * El detector que guarda el camino de escritura, medido contra la lista que se
 * leyó a mano.
 *
 * El conjunto de oro son los 101 resúmenes servidos que hablan de la tarea del
 * modelo y no de la declaración, leídos uno a uno el 29-09-2026 (#180) y
 * congelados en tests/fixtures/charla-de-tarea_2026-09-29.json. El detector
 * tiene que reconocerlos TODOS y no tocar NINGÚN otro resumen servido hoy. Una
 * expresión regular de palabras clave se dejaba un tercio, y ensanchada a lo
 * bruto se llevaba resúmenes de verdad; por eso esto se mide contra textos
 * reales y no contra frases escritas para la prueba.
 *
 * Congelados, y no leídos de src/lib/resumenes-retirados.js: esa lista encoge
 * cada vez que una fila se corrige, y el conjunto de oro no puede encoger con
 * ella. Lo servido sí se lee en vivo, y cuenta como negativo todo texto que no
 * sea uno de los 101: una explicación re-derivada también tiene que pasar.
 */

const RAIZ = join(__dirname, '..', '..')
const TROZOS = join(RAIZ, 'public/data/pleno-claims')

type Fila = { id: string; summary: string }
type Servida = { claim: { id: string }; verification: { summary?: string } }

const oro: Fila[] = JSON.parse(
  readFileSync(join(RAIZ, 'tests/fixtures/charla-de-tarea_2026-09-29.json'), 'utf8'),
).filas

const servidas: Servida[] = readdirSync(TROZOS)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .flatMap((f) => JSON.parse(readFileSync(join(TROZOS, f), 'utf8')).items as Servida[])

const textosDeOro = new Set(oro.map((f) => f.summary))
const resto = servidas.filter((it) => !textosDeOro.has(it.verification.summary ?? ''))
const fila = (f: Fila) => `${f.id} · ${f.summary.slice(0, 90)}`

describe('medido contra la lista leída a mano', () => {
  it('reconoce los 101 del conjunto de oro', () => {
    expect(oro.length).toBe(101)
    const escapan = oro.filter((f) => charlaDeTarea(f.summary) === null)
    expect(escapan.map(fila)).toEqual([])
  })

  it('no toca ningún otro resumen servido', () => {
    expect(resto.length).toBeGreaterThan(0)
    const falsos = resto.filter((it) => charlaDeTarea(it.verification.summary ?? '') !== null)
    expect(
      falsos.map(
        (it) =>
          `${charlaDeTarea(it.verification.summary)} · ${fila({ id: it.claim.id, summary: it.verification.summary ?? '' })}`,
      ),
    ).toEqual([])
  })

  it('ninguna clase está muerta: cada una reconoce al menos uno del conjunto de oro', () => {
    for (const { nombre, patron } of CLASES_DE_CHARLA) {
      expect(oro.filter((f) => patron.test(f.summary)).length, nombre).toBeGreaterThan(0)
    }
  })
})

describe('los bordes', () => {
  it('las tildes cuentan: el \\b de JavaScript no ve «é» ni «í» como letras', () => {
    expect(charlaDeTarea('Expliqué en español por qué no hay respaldo genuino.')).not.toBeNull()
    expect(charlaDeTarea('Respondí directamente con el análisis de los candidatos.')).not.toBeNull()
  })

  it('lo que habla de la declaración no cuenta, aunque use las mismas palabras', () => {
    for (const texto of [
      'La cita trata de la presentación de quejas y la respuesta del Ayuntamiento.',
      'Ningún candidato menciona una brigada que realice esta tarea en particular.',
      'Analicé la afirmación (solicitud de auditoría a la Consejería de Sanidad).',
      'Análisis completado: ningún candidato respalda la cifra de 1,7 millones.',
      'El bono de comercio es una herramienta para fomentar el comercio local.',
      '',
    ]) {
      expect(charlaDeTarea(texto), texto).toBeNull()
    }
  })
})
