import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLASES_DE_CHARLA, charlaDeTarea } from '../../src/scraper/charla-de-tarea'
import { RESUMENES_RETIRADOS } from '../../src/lib/resumenes-retirados.js'

/**
 * El detector que guarda el camino de escritura, medido contra la lista que se
 * leyó a mano.
 *
 * `src/lib/resumenes-retirados.js` son los resúmenes servidos que hablan de la
 * tarea del modelo y no de la declaración, leídos uno a uno el 29-09-2026
 * (#180). Son el conjunto de oro: el detector tiene que reconocerlos TODOS y no
 * tocar NINGÚN otro resumen servido. Una expresión regular de palabras clave se
 * dejaba un tercio, y ensanchada a lo bruto se llevaba resúmenes de verdad; por
 * eso esto se mide contra lo servido y no contra frases escritas para la
 * prueba.
 */

const TROZOS = join(__dirname, '..', '..', 'public/data/pleno-claims')

type Servida = { claim: { id: string }; verification: { summary?: string } }

const servidas: Servida[] = readdirSync(TROZOS)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .flatMap((f) => JSON.parse(readFileSync(join(TROZOS, f), 'utf8')).items as Servida[])

const listada = (it: Servida) =>
  Object.prototype.hasOwnProperty.call(RESUMENES_RETIRADOS, it.claim.id) &&
  (it.verification.summary ?? '').startsWith(RESUMENES_RETIRADOS[it.claim.id])

const retiradas = servidas.filter(listada)
const resto = servidas.filter((it) => !listada(it))
const fila = (it: Servida) => `${it.claim.id} · ${(it.verification.summary ?? '').slice(0, 90)}`

describe('medido contra la lista leída a mano', () => {
  it('reconoce todos los resúmenes retirados', () => {
    // Lo positivo primero: la lista entera está servida, así que se mide sobre
    // todas sus filas y no sobre las que quedaran.
    expect(retiradas.length).toBeGreaterThan(0)
    expect(retiradas.length).toBe(Object.keys(RESUMENES_RETIRADOS).length)
    const escapan = retiradas.filter((it) => charlaDeTarea(it.verification.summary) === null)
    expect(escapan.map(fila)).toEqual([])
  })

  it('no toca ningún otro resumen servido', () => {
    expect(resto.length).toBeGreaterThan(0)
    const falsos = resto.filter((it) => charlaDeTarea(it.verification.summary ?? '') !== null)
    expect(falsos.map((it) => `${charlaDeTarea(it.verification.summary)} · ${fila(it)}`)).toEqual(
      [],
    )
  })

  it('ninguna clase está muerta: cada una reconoce al menos un retirado', () => {
    for (const { nombre, patron } of CLASES_DE_CHARLA) {
      const suyas = retiradas.filter((it) => patron.test(it.verification.summary ?? ''))
      expect(suyas.length, nombre).toBeGreaterThan(0)
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
