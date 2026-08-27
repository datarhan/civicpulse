import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLAIM_VERDICTS,
  resumirSinDatos,
  type ClaimVerification,
} from '../src/scraper/claim-verifier'

const ROOT = join(__dirname, '..')

/**
 * `sin-datos` estaba publicando dos hechos de tamaño muy distinto bajo un solo
 * número:
 *
 *   · se consultaron corpus y la afirmación no aparece en ninguno
 *   · no se consultó NADA, porque para ese tipo de afirmación no tenemos corpus
 *
 * El segundo no dice nada sobre la afirmación: dice algo sobre nosotros. El
 * verificador ya lo distingue —deja `checkedAgainst` vacío a propósito, y esa
 * puerta es la que frena las acusaciones léxicas— pero al publicar los dos
 * caían en la misma casilla, que es el mismo defecto que la agregación de
 * `falta` en DeclaracionEntregas («rindió pero no declaró este servicio» y «no
 * rindió» saliendo como la misma raya) y que el centinela `Otro`.
 *
 * El desglose se DERIVA de `checkedAgainst`; no se guarda un campo nuevo. El
 * enum de veredictos no se toca: alimenta `isDowngrade`, el validador del
 * overlay y las CLI de curación, y ampliarlo por esto sería mover media
 * tubería para nada.
 */
function v(
  verdict: ClaimVerification['verdict'],
  checkedAgainst: string[] | undefined,
): ClaimVerification {
  return {
    claimId: `c-${verdict}-${(checkedAgainst ?? []).join('+') || 'vacio'}`,
    verdict,
    summary: 'x',
    evidence: [],
    ...(checkedAgainst === undefined ? {} : { checkedAgainst }),
  } as ClaimVerification
}

describe('resumirSinDatos · dos desenlaces donde había uno', () => {
  it('separa «no se consultó nada» de «se consultó y no aparece»', () => {
    const r = resumirSinDatos([
      v('sin-datos', []), // nada consultado
      v('sin-datos', []), // nada consultado
      v('sin-datos', ['tenders', 'bdns']), // consultado, sin coincidencia
    ])
    expect(r.sinCorpus).toBe(2)
    expect(r.comprobadoSinHallar).toBe(1)
  })

  it('sólo mira las filas `sin-datos`', () => {
    // Un `verificado` con checkedAgainst vacío sería raro, pero contarlo aquí
    // inflaría el desglose con filas que no son sin-datos y rompería la suma.
    const r = resumirSinDatos([
      v('verificado', []),
      v('parcial', []),
      v('contradicho', ['tenders']),
      v('sin-datos', []),
    ])
    expect(r.sinCorpus).toBe(1)
    expect(r.comprobadoSinHallar).toBe(0)
  })

  it('un checkedAgainst ausente cuenta como «no se consultó nada»', () => {
    const r = resumirSinDatos([v('sin-datos', undefined)])
    expect(r.sinCorpus).toBe(1)
  })

  it('sin filas, dos ceros — y no revienta', () => {
    expect(resumirSinDatos([])).toEqual({ sinCorpus: 0, comprobadoSinHallar: 0 })
  })

  it('el enum se exporta, no se recita', () => {
    // Regla 1 de docs/DATA_INTEGRITY.md. Seis pruebas de este repositorio
    // copiaron una forma a mano y siguieron verdes mientras producción no
    // casaba con nada.
    expect([...CLAIM_VERDICTS].sort()).toEqual(
      ['contradicho', 'parcial', 'promesa-repetida', 'sin-datos', 'verificado'].sort(),
    )
  })
})

describe('resumirSinDatos · contra el volcado publicado', () => {
  const pub = JSON.parse(
    readFileSync(join(ROOT, 'public/data/pleno-claims-verified.json'), 'utf8'),
  ) as {
    stats: { total: number; byVerdict: Record<string, number> }
    items: Array<{ verification: ClaimVerification }>
  }

  it('las dos partes suman exactamente el sin-datos publicado', () => {
    const r = resumirSinDatos(pub.items.map((i) => i.verification))
    expect(r.sinCorpus + r.comprobadoSinHallar).toBe(pub.stats.byVerdict['sin-datos'])
  })

  /**
   * El techo de reserva que pide la regla 1: emparejar toda afirmación sobre un
   * enum con un tope que cace la degeneración. Si un fallo dejara
   * `checkedAgainst` vacío en todas las filas, la suma de arriba seguiría
   * cuadrando y el desglose sería una sola casilla con otro nombre.
   */
  it('el desglose no es degenerado: las dos casillas tienen filas de verdad', () => {
    const r = resumirSinDatos(pub.items.map((i) => i.verification))
    expect(r.sinCorpus).toBeGreaterThan(0)
    expect(r.comprobadoSinHallar).toBeGreaterThan(0)
  })

  it('el volcado publica el desglose, no sólo el total', () => {
    const stats = pub.stats as unknown as {
      sinDatosPorque?: { sinCorpus: number; comprobadoSinHallar: number }
    }
    expect(stats.sinDatosPorque).toBeDefined()
    expect(stats.sinDatosPorque!.sinCorpus + stats.sinDatosPorque!.comprobadoSinHallar).toBe(
      pub.stats.byVerdict['sin-datos'],
    )
  })
})
