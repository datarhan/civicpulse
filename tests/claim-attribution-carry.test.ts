import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  arrastrarAtribucion,
  MOTIVOS_DE_DESCARTE,
  type CriterioDeArrastre,
} from '../src/scraper/claim-attribution-carry'
import { resolverDeGrupo } from '../src/scraper/claim-provenance'
import {
  oneSeatBlocsOf,
  seatsFromOfficials,
  singleSeatBlocs,
} from '../src/scraper/corporation-seats'
import {
  etiquetaDeUnEscano,
  etiquetaSinMapa,
  plenosConMapa,
} from '../src/scraper/etiqueta-de-grupo'
import { SPEAKER_GROUPS } from '../src/scraper/pleno-votes'

/**
 * Recuperar la atribución de bloc que una re-extracción tiró, sin inventar ni
 * una.
 *
 * El 2026-08-13 la extracción volvió a correr sobre todos los plenos con UN
 * solo mapa de voces en disco (`pleno-speaker-map/15uvjew.json`, el único que
 * había existido nunca en git). El propio extractor avisa de lo que pasa
 * entonces —«NO speaker map … every claim will carry speakerGroup:null»— y eso
 * hizo: `pleno-claims-suggestions.json` pasó a tener 7.098 citas y 101
 * atribuciones, todas del mismo pleno.
 *
 * El corpus PUBLICADO, más viejo, traía 1.362. Como la base sale de las
 * sugerencias, cualquier rebuild publicaba 1.261 atribuciones menos — lo que
 * dejó `downgrade-verdict` inutilizable en cuanto la guarda de
 * `verified-rebuild` empezó a fallar cerrado.
 *
 * Esto NO reconstruye atribución: la copia de lo que ya está publicado a la
 * cita que le corresponde, y sólo cuando se puede demostrar que son la misma
 * cita. Medido antes de escribir una línea: de las 1.362 publicadas, 1.341
 * casaban por id y las 1.341 tenían el verbatim idéntico.
 *
 * Y sólo lo que hoy se podría publicar. Las 1.341 eran la adivinanza del
 * extractor retirado el 10-08 (3f37f5c8), que la migración había quitado de las
 * sugerencias y no del fichero publicado: el arrastre del 15-08 (472064bd) la
 * devolvió entera, grupos de un escaño incluidos. La PR #218 retiró después,
 * con firma, 292 etiquetas de un escaño y 1.007 adivinanzas que el mapa de
 * voces no sostiene; desde entonces el arrastre se niega a devolver ni unas ni
 * otras, con las mismas reglas que la prueba de corpus de #218
 * (tests/declaraciones-escano-unico.test.ts) y que `check:claim-provenance`.
 */

/**
 * Una composición de mentira, para que estas pruebas no dependan de cuántos
 * escaños tiene hoy cada grupo: todos tienen varios menos el último del enum.
 */
const UNO = SPEAKER_GROUPS[SPEAKER_GROUPS.length - 1]
const UN_ESCANO = singleSeatBlocs(
  seatsFromOfficials({
    composition: Object.fromEntries(SPEAKER_GROUPS.map((g) => [g, g === UNO ? 1 : 5])),
  }),
)
const [VARIOS, OTRO] = SPEAKER_GROUPS.filter((g) => !UN_ESCANO.includes(g))

/**
 * Un mapa de voces de mentira: por sesión, el grupo que da a cada literal. Una
 * sesión que no está aquí no tiene mapa.
 */
function criterio(
  mapas: Record<string, Record<string, string | null>> = {},
  unEscano: readonly string[] = UN_ESCANO,
): CriterioDeArrastre {
  return {
    unEscano,
    conMapa: new Set(Object.keys(mapas)),
    resolverDe: (pleno) => (pleno in mapas ? (v: string) => mapas[pleno][v] ?? null : null),
  }
}

const publicado = (id: string, bloc: string | null, verbatim = 'lo dicho', plenoId = 'p1') => ({
  claim: { id, plenoId, speakerGroup: bloc, verbatim },
})
const sugerida = (
  id: string,
  verbatim = 'lo dicho',
  speakerGroup: string | null = null,
  plenoId = 'p1',
) => ({ id, plenoId, speakerGroup, verbatim })

/** El mapa de p1 da `bloc` a «lo dicho». */
const conMapa = (bloc: string | null) => criterio({ p1: { 'lo dicho': bloc } })

describe('las condiciones para arrastrar una atribución', () => {
  it('arrastra cuando todo cuadra', () => {
    const r = arrastrarAtribucion([publicado('a1', VARIOS)], [sugerida('a1')], conMapa(VARIOS))
    expect(r.items[0].speakerGroup).toBe(VARIOS)
    expect(r.stats.arrastradas).toBe(1)
  })

  it('NO arrastra si el verbatim se movió bajo el mismo id', () => {
    const r = arrastrarAtribucion(
      [publicado('a1', VARIOS, 'lo que dijo entonces')],
      [sugerida('a1', 'otra cosa distinta')],
      criterio({ p1: { 'lo que dijo entonces': VARIOS, 'otra cosa distinta': VARIOS } }),
    )
    expect(r.items[0].speakerGroup).toBeNull()
    expect(r.stats.arrastradas).toBe(0)
    expect(r.stats.descartes['verbatim-distinto']).toBe(1)
  })

  it('NO pisa una atribución que ya está viva', () => {
    const r = arrastrarAtribucion(
      [publicado('a1', VARIOS)],
      [sugerida('a1', 'lo dicho', OTRO)],
      conMapa(VARIOS),
    )
    expect(r.items[0].speakerGroup, 'sobrescribió una atribución existente').toBe(OTRO)
    expect(r.stats.descartes['destino-ya-atribuido']).toBe(1)
  })

  it('NO arrastra un bloc que no está en el enum', () => {
    // `Otro` es el centinela que significa «no se puede saber». Publicarlo como
    // bloc es la regla nº3 de DATA_INTEGRITY otra vez.
    for (const malo of ['Otro', 'otro partido', '']) {
      const r = arrastrarAtribucion([publicado('a1', malo)], [sugerida('a1')], conMapa(malo))
      expect(r.items[0].speakerGroup, malo).toBeNull()
    }
  })

  it('ignora lo publicado que ya no existe entre las sugerencias', () => {
    const r = arrastrarAtribucion([publicado('viejo', VARIOS)], [sugerida('a1')], conMapa(VARIOS))
    expect(r.stats.arrastradas).toBe(0)
    expect(r.stats.publicadasSinDestino).toBe(1)
  })

  it('el enum es el importado, no una copia', () => {
    // Si alguien añade un bloc a SPEAKER_GROUPS, esto lo acepta sin tocar nada.
    // Sin grupos de un escaño, para que ninguno se descarte por eso.
    for (const g of SPEAKER_GROUPS) {
      const r = arrastrarAtribucion(
        [publicado('a1', g)],
        [sugerida('a1')],
        criterio({ p1: { 'lo dicho': g } }, []),
      )
      expect(r.items[0].speakerGroup, g).toBe(g)
    }
  })

  it('cada descarte tiene un motivo con nombre', () => {
    // Regla nº2 de DATA_INTEGRITY: una pasada tiene que poder decir qué hizo y
    // qué no, por separado. Un total de «arrastradas» sin el desglose es
    // indistinguible de una pasada que no intentó nada.
    const r = arrastrarAtribucion([], [], criterio())
    for (const m of MOTIVOS_DE_DESCARTE) expect(r.stats.descartes).toHaveProperty(m)
  })
})

describe('un grupo de un escaño no vuelve', () => {
  it('ni aunque el mapa de voces lo acredite', () => {
    // CLAUDE.md: «a one-seat bloc is not bloc-level». La etiqueta nombra a ese
    // concejal por eliminación, y eso lo firma una persona (nivel C).
    const r = arrastrarAtribucion([publicado('a1', UNO)], [sugerida('a1')], conMapa(UNO))
    expect(r.items[0].speakerGroup).toBeNull()
    expect(r.stats.arrastradas).toBe(0)
    expect(r.stats.descartes['grupo-de-un-escano']).toBe(1)
  })

  it('los de un escaño son los que diga la composición, no una lista escrita aquí', () => {
    // La misma cita, con la composición cambiada: con dos escaños, vuelve.
    const r = arrastrarAtribucion(
      [publicado('a1', UNO)],
      [sugerida('a1')],
      criterio({ p1: { 'lo dicho': UNO } }, []),
    )
    expect(r.items[0].speakerGroup).toBe(UNO)
  })
})

describe('lo que el mapa de voces de hoy no sostiene no vuelve', () => {
  it('sin mapa de la sesión', () => {
    const r = arrastrarAtribucion([publicado('a1', VARIOS)], [sugerida('a1')], criterio())
    expect(r.items[0].speakerGroup).toBeNull()
    expect(r.stats.descartes['sin-mapa']).toBe(1)
  })

  it('con un mapa en disco con el que no se puede cotejar', () => {
    // Sin transcripción, o ilegible: no hay acuerdo con nadie, y no se inventa.
    const r = arrastrarAtribucion([publicado('a1', VARIOS)], [sugerida('a1')], {
      unEscano: UN_ESCANO,
      conMapa: new Set(['p1']),
      resolverDe: () => null,
    })
    expect(r.items[0].speakerGroup).toBeNull()
    expect(r.stats.descartes['sin-mapa']).toBe(1)
  })

  it('el mapa no le da grupo', () => {
    const r = arrastrarAtribucion([publicado('a1', VARIOS)], [sugerida('a1')], conMapa(null))
    expect(r.items[0].speakerGroup).toBeNull()
    expect(r.stats.descartes['sin-sosten']).toBe(1)
  })

  it('el mapa le da otro grupo', () => {
    const r = arrastrarAtribucion([publicado('a1', VARIOS)], [sugerida('a1')], conMapa(OTRO))
    expect(r.items[0].speakerGroup).toBeNull()
    expect(r.stats.descartes['partido-distinto']).toBe(1)
  })

  it('el mapa se pide para la sesión de la declaración', () => {
    // La otra sesión tiene mapa y acredita el mismo literal: no cuenta.
    const r = arrastrarAtribucion(
      [publicado('a1', VARIOS, 'lo dicho', 'p2')],
      [sugerida('a1', 'lo dicho', null, 'p2')],
      conMapa(VARIOS),
    )
    expect(r.items[0].speakerGroup).toBeNull()
    expect(r.stats.descartes['sin-mapa']).toBe(1)
  })
})

describe('lo que sale del arrastre lo admite la prueba de corpus de #218', () => {
  // Una de cada: si el arrastre devolviera cualquiera de las retiradas, la
  // prueba de corpus se pondría roja con su siguiente commit. Se mira con SUS
  // predicados, importados, no con una copia.
  const pub = [
    publicado('bien', VARIOS),
    publicado('un-escano', UNO),
    publicado('sin-mapa', VARIOS, 'lo dicho', 'p9'),
    publicado('sin-sosten', VARIOS, 'nadie lo acredita'),
    publicado('otro-grupo', VARIOS, 'lo dijo otro'),
    publicado('sin-destino', VARIOS),
  ]
  const sug = [
    sugerida('bien'),
    sugerida('un-escano'),
    sugerida('sin-mapa', 'lo dicho', null, 'p9'),
    sugerida('sin-sosten', 'nadie lo acredita'),
    sugerida('otro-grupo', 'lo dijo otro'),
  ]
  const c = criterio({
    p1: { 'lo dicho': VARIOS, 'nadie lo acredita': null, 'lo dijo otro': OTRO },
  })
  const r = arrastrarAtribucion(pub, sug, c)

  it('sólo vuelve la que el mapa sostiene', () => {
    expect(r.items.filter((s) => s.speakerGroup).map((s) => s.id)).toEqual(['bien'])
  })

  it('ninguna con grupo de un escaño ni en una sesión sin mapa', () => {
    expect(r.items.filter((s) => etiquetaDeUnEscano(s, c.unEscano))).toEqual([])
    expect(r.items.filter((s) => etiquetaSinMapa(s, c.conMapa))).toEqual([])
  })

  it('cada publicada con grupo cae en un solo cubo', () => {
    // Regla nº2: intentadas = arrastradas + sin destino + cada descarte. Un
    // cubo que se quedara sin contar es una pasada que dice menos de lo que hizo.
    const descartadas = Object.values(r.stats.descartes).reduce((a, b) => a + b, 0)
    expect(r.stats.intentadas).toBe(pub.length)
    expect(r.stats.arrastradas + r.stats.publicadasSinDestino + descartadas).toBe(
      r.stats.intentadas,
    )
  })
})

describe('contra los ficheros reales', () => {
  const pub = JSON.parse(
    readFileSync(resolve('public/data/pleno-claims-verified.json'), 'utf8'),
  ).items
  const sug = JSON.parse(
    readFileSync(resolve('public/data/pleno-claims-suggestions.json'), 'utf8'),
  ).items
  const unEscano = oneSeatBlocsOf(
    JSON.parse(readFileSync(resolve('public/data/officials.json'), 'utf8')),
  )
  const real: CriterioDeArrastre = {
    unEscano: unEscano ?? [],
    conMapa: plenosConMapa(readdirSync(resolve('pleno-speaker-map'))),
    resolverDe: (pleno) => {
      const leer = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : null)
      return resolverDeGrupo(
        leer(join('public/data/pleno-transcripts', `${pleno}.txt`)),
        leer(join('pleno-speaker-map', `${pleno}.json`)),
      )
    },
  }

  it('el corpus publicado sigue teniendo atribución que arrastrar, y la composición se lee', () => {
    // Prueba de trabajo. Si esto llegara a cero —porque alguien regenerara las
    // sugerencias CON los mapas, que es el arreglo de fondo— lo de abajo pasaría
    // midiendo nada. Y sin grupos de un escaño derivados, la regla que los
    // retiene no estaría mirando nada.
    const conBloc = pub.filter((i: { claim: { speakerGroup?: string } }) => i.claim.speakerGroup)
    expect(conBloc.length).toBeGreaterThan(0)
    expect(unEscano?.length).toBeGreaterThan(0)
  })

  it('no arrastra ningún bloc fuera del enum ni cambia uno vivo', () => {
    // Idempotente a propósito: una vez aplicado, volver a correrlo tiene que
    // dejar el fichero igual. Se comprueba comparando bloc a bloc ANTES y
    // DESPUÉS, no mirando el contador de descartes — ese sube justamente porque
    // ya está aplicado, y afirmar que vale cero convertía este test en una foto
    // de un instante en vez de en una invariante.
    const copia = structuredClone(sug)
    const antes = copia.map((i: { speakerGroup?: string | null }) => i.speakerGroup ?? null)
    const r = arrastrarAtribucion(pub, copia, real)
    const despues = r.items.map((i: { speakerGroup?: string | null }) => i.speakerGroup ?? null)

    const pisadas = antes.filter((g, i) => g !== null && g !== despues[i])
    expect(pisadas, 'cambió una atribución que ya estaba viva').toEqual([])

    const fuera = despues.filter(
      (g): g is string => !!g && !(SPEAKER_GROUPS as readonly string[]).includes(g),
    )
    expect(fuera, 'apareció un bloc que no está en el enum').toEqual([])
  })
})
