import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { arrastrarAtribucion, MOTIVOS_DE_DESCARTE } from '../src/scraper/claim-attribution-carry'
import { SPEAKER_GROUPS } from '../src/scraper/pleno-votes'

/**
 * Recuperar la atribución de bloc que una re-extracción tiró, sin inventar ni
 * una.
 *
 * El 2026-08-13 la extracción volvió a correr sobre todos los plenos con UN
 * solo mapa de voces en disco (`pleno-speaker-map/15uvjew.json`, el único que
 * ha existido nunca en git). El propio extractor avisa de lo que pasa entonces
 * —«NO speaker map … every claim will carry speakerGroup:null»— y eso hizo:
 * `pleno-claims-suggestions.json` pasó a tener 7.098 citas y 101 atribuciones,
 * todas del mismo pleno.
 *
 * El corpus PUBLICADO, más viejo, traía 1.362. Como la base sale de las
 * sugerencias, cualquier rebuild publicaba 1.261 atribuciones menos — lo que
 * dejó `downgrade-verdict` inutilizable en cuanto la guarda de
 * `verified-rebuild` empezó a fallar cerrado.
 *
 * Esto NO reconstruye atribución: la copia de lo que ya está publicado a la
 * cita que le corresponde, y sólo cuando se puede demostrar que son la misma
 * cita. Cuatro condiciones, y las cuatro tienen que cumplirse:
 *
 *   · mismo id de claim
 *   · verbatim IDÉNTICO byte a byte — un id estable sobre un texto que se movió
 *     colgaría un bloc de otras palabras, que es precisamente la clase de
 *     defecto que las superficies legalmente materiales no pueden permitirse
 *   · el destino no tiene bloc — nunca se pisa una atribución viva
 *   · el bloc de origen está en SPEAKER_GROUPS, importado y no recopiado
 *
 * Medido antes de escribir una línea: de las 1.362 publicadas, 1.341 casan por
 * id y las 1.341 tienen el verbatim idéntico. Cero conflictos.
 */

describe('las cuatro condiciones para arrastrar una atribución', () => {
  const publicado = (id: string, bloc: string | null, verbatim = 'lo dicho') => ({
    claim: { id, speakerGroup: bloc, verbatim },
  })
  const sugerida = (id: string, verbatim = 'lo dicho', speakerGroup: string | null = null) => ({
    id,
    speakerGroup,
    verbatim,
  })

  it('arrastra cuando todo cuadra', () => {
    const r = arrastrarAtribucion([publicado('a1', 'PSOE')], [sugerida('a1')])
    expect(r.items[0].speakerGroup).toBe('PSOE')
    expect(r.stats.arrastradas).toBe(1)
  })

  it('NO arrastra si el verbatim se movió bajo el mismo id', () => {
    const r = arrastrarAtribucion(
      [publicado('a1', 'PSOE', 'lo que dijo entonces')],
      [sugerida('a1', 'otra cosa distinta')],
    )
    expect(r.items[0].speakerGroup).toBeNull()
    expect(r.stats.arrastradas).toBe(0)
    expect(r.stats.descartes['verbatim-distinto']).toBe(1)
  })

  it('NO pisa una atribución que ya está viva', () => {
    const r = arrastrarAtribucion([publicado('a1', 'PSOE')], [sugerida('a1', 'lo dicho', 'PP')])
    expect(r.items[0].speakerGroup, 'sobrescribió una atribución existente').toBe('PP')
    expect(r.stats.descartes['destino-ya-atribuido']).toBe(1)
  })

  it('NO arrastra un bloc que no está en el enum', () => {
    // `Otro` es el centinela que significa «no se puede saber». Publicarlo como
    // bloc es la regla nº3 de DATA_INTEGRITY otra vez.
    for (const malo of ['Otro', 'otro partido', '']) {
      const r = arrastrarAtribucion([publicado('a1', malo)], [sugerida('a1')])
      expect(r.items[0].speakerGroup, malo).toBeNull()
    }
  })

  it('ignora lo publicado que ya no existe entre las sugerencias', () => {
    const r = arrastrarAtribucion([publicado('viejo', 'PSOE')], [sugerida('a1')])
    expect(r.stats.arrastradas).toBe(0)
    expect(r.stats.publicadasSinDestino).toBe(1)
  })

  it('el enum es el importado, no una copia', () => {
    // Si alguien añade un bloc a SPEAKER_GROUPS, esto lo acepta sin tocar nada.
    for (const g of SPEAKER_GROUPS) {
      const r = arrastrarAtribucion([publicado('a1', g)], [sugerida('a1')])
      expect(r.items[0].speakerGroup, g).toBe(g)
    }
  })

  it('cada descarte tiene un motivo con nombre', () => {
    // Regla nº2 de DATA_INTEGRITY: una pasada tiene que poder decir qué hizo y
    // qué no, por separado. Un total de «arrastradas» sin el desglose es
    // indistinguible de una pasada que no intentó nada.
    const r = arrastrarAtribucion([], [])
    for (const m of MOTIVOS_DE_DESCARTE) expect(r.stats.descartes).toHaveProperty(m)
  })
})

describe('contra los ficheros reales', () => {
  const pub = JSON.parse(
    readFileSync(resolve('public/data/pleno-claims-verified.json'), 'utf8'),
  ).items
  const sug = JSON.parse(
    readFileSync(resolve('public/data/pleno-claims-suggestions.json'), 'utf8'),
  ).items

  it('el corpus publicado sigue teniendo atribución que arrastrar', () => {
    // Prueba de trabajo. Si esto llegara a cero —porque alguien regenerara las
    // sugerencias CON los mapas, que es el arreglo de fondo— lo de abajo pasaría
    // midiendo nada.
    const conBloc = pub.filter((i: { claim: { speakerGroup?: string } }) => i.claim.speakerGroup)
    expect(conBloc.length).toBeGreaterThan(0)
  })

  it('no arrastra ningún bloc fuera del enum ni cambia uno vivo', () => {
    // Idempotente a propósito: una vez aplicado, volver a correrlo tiene que
    // dejar el fichero igual. Se comprueba comparando bloc a bloc ANTES y
    // DESPUÉS, no mirando el contador de descartes — ese sube justamente porque
    // ya está aplicado, y afirmar que vale cero convertía este test en una foto
    // de un instante en vez de en una invariante.
    const copia = structuredClone(sug)
    const antes = copia.map((i: { speakerGroup?: string | null }) => i.speakerGroup ?? null)
    const r = arrastrarAtribucion(pub, copia)
    const despues = r.items.map((i: { speakerGroup?: string | null }) => i.speakerGroup ?? null)

    const pisadas = antes.filter((g, i) => g !== null && g !== despues[i])
    expect(pisadas, 'cambió una atribución que ya estaba viva').toEqual([])

    const fuera = despues.filter(
      (g): g is string => !!g && !(SPEAKER_GROUPS as readonly string[]).includes(g),
    )
    expect(fuera, 'apareció un bloc que no está en el enum').toEqual([])
  })
})
