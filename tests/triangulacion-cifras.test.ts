import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  computeTriangulation,
  type PressArticleLite,
  type TriangulationCluster,
  type VerifiedClaimRow,
} from '../src/scraper/press-analytics'

/**
 * «Cobertura comparada» dice qué medios contaron una historia. No compara sus
 * cifras: nada en los datos dice qué magnitud mide cada una.
 *
 * El 28-09-2026 la tarjeta de la nota municipal «Riba-roja de Túria impulsa la
 * sensorización de sus contenedores…» (`1lk4zls`) decía en /laboratorio, bajo
 * «Cobertura comparada · 2 medios: Ayuntamiento de Riba-roja de Túria · Valencia
 * Plaza», «· cifras divergen €45.000 (33 %)». Se lee «los dos medios no se ponen
 * de acuerdo en el importe», y no era eso: las dos cifras salen de la MISMA nota
 * —180.000 € es el importe total de la adjudicación y 135.000 € la parte que paga
 * el PSTD— y el artículo de Valencia Plaza (`11s7c3b`) no tiene ni una afirmación
 * extraída. `computeTriangulation` echaba en un saco las `amountEuros` de todas
 * las afirmaciones de todos los artículos del grupo y publicaba el máximo menos
 * el mínimo en cuanto había dos.
 *
 * Exigir dos medios no lo arregla, ni exigir además una sola cifra por medio.
 * Del 3 al 9 de septiembre la misma franja dijo «cifras divergen €40.000 (40 %)»
 * entre Levante-EMV —100.000 € «para la rehabilitación de las fachadas»— y el
 * Ayuntamiento —140.000 € para fachadas, evaluación de los edificios y
 * accesibilidad—: dos medios, una cifra cada uno. Y Levante acertaba: la nota
 * municipal reparte los 140.000 € y da a las fachadas 100.000. Otra vez una parte
 * contra su total, sólo que el reparto estaba en el cuerpo de la nota y el
 * extractor sacó una única afirmación, la del titular. «Una cifra por medio»
 * cuenta lo que se extrajo, no lo que dice el artículo.
 *
 * Medido el 28-09-2026 sobre todo el historial de press-triangulation.json: de
 * las siete historias a las que puso cifras desde mayo, las dos con diferencia
 * eran esas dos partes contra su total, y las otras cinco daban la MISMA cifra
 * en todos sus medios, que la franja pintaba «cifras divergen €0 (0 %)». Ninguna
 * fue una divergencia. Mientras ningún campo diga qué magnitud mide cada cifra
 * —el total o una parte, con IVA o sin él, un año o el periodo entero—,
 * compararlas es poner juntas dos cifras ciertas sin el puente que las cuadra,
 * así que el agrupado no publica ninguna. Una discrepancia real entre medios es
 * un hallazgo y la firma una persona curadora, con contexto y derecho de réplica
 * (press-findings.json); no la deduce esta franja.
 *
 * Las filas son las de producción (fixture). Los controles comprueban que cada
 * historia se sigue agrupando, para que ningún caso salga verde por no haber
 * agrupado nada.
 */

type Deriva = { min: number; max: number; spread: number; spreadPct: number } | null

interface Caso {
  origen: string
  now: string
  /** Lo que press-triangulation.json publicaba para el grupo en `origen`. */
  publicado: { outlets: string[]; amountDrift: Deriva }
  press: PressArticleLite[]
  verified: VerifiedClaimRow[]
}

const CASOS = ['sensorizacion', 'fachadas', 'auditorio'] as const
type Nombre = (typeof CASOS)[number]

const FX = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/triangulacion_cifras_2026-09-28.json'), 'utf8'),
) as Record<Nombre, Caso>

/** El grupo de la historia, localizado por sus artículos y no por su posición. */
function grupoDe(caso: Caso): TriangulationCluster | undefined {
  const ids = caso.press.map((a) => a.id).sort()
  const r = computeTriangulation({
    press: caso.press,
    verified: caso.verified,
    now: new Date(caso.now),
  })
  return r.clusters.find((c) => c.articleIds.join() === ids.join())
}

/** Todos los números que lleva un valor, en cualquier campo y a cualquier profundidad. */
function numerosDe(v: unknown): number[] {
  if (typeof v === 'number') return [v]
  if (Array.isArray(v)) return v.flatMap(numerosDe)
  if (v && typeof v === 'object') return Object.values(v).flatMap(numerosDe)
  return []
}

const conCifra = (caso: Caso) =>
  caso.verified
    .filter((r) => r.claim.entities.amountEuros !== undefined)
    .map((r) => [r.claim.articleId, r.claim.entities.amountEuros])

const medioDe = (caso: Caso, id: string) => caso.press.find((a) => a.id === id)?.source

describe('el reproductor se da', () => {
  it('sensorización: las dos cifras son de la misma nota municipal; Valencia Plaza no tiene ninguna', () => {
    const caso = FX.sensorizacion
    expect(conCifra(caso)).toEqual([
      ['1lk4zls', 180000],
      ['1lk4zls', 135000],
    ])
    expect(medioDe(caso, '1lk4zls')).toBe('Ayuntamiento de Riba-roja de Túria')
    expect(medioDe(caso, '11s7c3b')).toBe('Valencia Plaza')
    expect(caso.verified.filter((r) => r.claim.articleId === '11s7c3b')).toEqual([])
    expect(caso.publicado.amountDrift).toEqual({
      min: 135000,
      max: 180000,
      spread: 45000,
      spreadPct: 0.333,
    })
  })

  it('fachadas: dos medios con una cifra cada uno, y aun así una parte contra su total', () => {
    const caso = FX.fachadas
    expect(conCifra(caso)).toEqual([
      ['1ezylig', 100000],
      ['18imvfs', 140000],
    ])
    expect(medioDe(caso, '1ezylig')).toBe('Levante-EMV')
    expect(medioDe(caso, '18imvfs')).toBe('Ayuntamiento de Riba-roja de Túria')
    expect(caso.publicado.amountDrift).toEqual({
      min: 100000,
      max: 140000,
      spread: 40000,
      spreadPct: 0.4,
    })
  })

  it('auditorio: dos medios con la misma cifra, publicada como «divergen €0 (0 %)»', () => {
    const caso = FX.auditorio
    expect(conCifra(caso)).toEqual([
      ['1t1ctq4', 40000],
      ['1lnhg7g', 40000],
    ])
    expect(medioDe(caso, '1t1ctq4')).toBe('Ayuntamiento de Riba-roja de Túria')
    expect(medioDe(caso, '1lnhg7g')).toBe('levante-emv.com')
    expect(caso.publicado.amountDrift).toEqual({ min: 40000, max: 40000, spread: 0, spreadPct: 0 })
  })
})

describe('triangulación: agrupa la historia y no compara sus cifras', () => {
  it.each(CASOS)('%s: la historia se sigue agrupando con sus dos medios', (nombre) => {
    const caso = FX[nombre]
    expect(grupoDe(caso)?.outlets).toEqual(caso.publicado.outlets)
  })

  it.each([
    ['sensorizacion', [180000, 135000, 45000]],
    ['fachadas', [100000, 140000, 40000]],
    ['auditorio', [40000]],
  ] as const)(
    '%s: el grupo no publica ninguna de sus cifras ni su diferencia',
    (nombre, cifras) => {
      const grupo = grupoDe(FX[nombre])
      expect(grupo).toBeDefined()
      const publicados = numerosDe(grupo)
      for (const cifra of cifras) expect(publicados).not.toContain(cifra)
    },
  )
})
