import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { verifyClaim } from '../src/scraper/claim-verifier'

/**
 * Una cifra no se verifica contra un registro que no trae cifra — ni contra el
 * convenio de OTRA fundación.
 *
 * El 20-09-2026 (4c92cf31) el verificador determinista subió
 * `ma87e0-111-afi-083d71` de `sin-datos` a **`verificado`**: «con 70.000 euros, el
 * presupuesto para este 2026 de las actividades que se van a realizar allí»,
 * atribuida a PSOE, sobre la **Fundación ECA**. Evidencia única: el convenio BDNS
 * con la **Fundación Padre Juan Schenk** («Biblioteca Solidaria Misionera»),
 * similitud 1, «importe no publicado», ref `bdns:` vacía. `/declaraciones` lo
 * enseñó con el sello «Verificado» hasta que la revisión lectora lo señaló a la
 * mañana siguiente. Se bajó por `downgrade-verdict` (PR #77); esto es la causa.
 *
 * Son tres defectos en el mismo tramo, el de BDNS para afirmaciones numéricas, y
 * cada uno bastaba para que no ocurriera:
 *
 *  1. **El emparejado.** `overlapScore` descarta los tokens de menos de cuatro
 *     letras, así que «fundación eca» se queda en «fundación» — y esa palabra,
 *     sola, contra cualquier fundación, da 1,0. El fichero ya describe el defecto
 *     («deja que dos palabras genéricas saturen el umbral») y ya tiene el remedio,
 *     `solapamientoMutuo`, que el tramo de contratos aplica y éste no.
 *  2. **La puerta.** El propio fichero dice que «un parecido de título sostiene
 *     `parcial` pero nunca `verificado`: esa vía no comprueba el importe». Una
 *     fila de BDNS sin importe es justo eso, y no se marcaba `noFundante`.
 *  3. **Los nombres de campo.** `BdnsRow` declara `importe`, `url` y
 *     `convocatoriaId`; las 177 filas de `bdns.json` traen `sourceUrl` y
 *     `bdnsCode`, y ninguna trae importe. TODO cruce con BDNS es sólo de título, y
 *     toda cita salía `bdns:` — la clase nº 2 de DATA_INTEGRITY.
 *
 * Las filas son las de producción (fixture); los controles de abajo existen para
 * que ningún caso salga verde por no haber llegado a emparejar nada.
 */
const FX = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/verificado_sin_importe_2026-09-21.json'), 'utf8'),
)
const BDNS = { items: FX.bdns }
const claim = (overrides: Record<string, unknown> = {}) => ({ ...FX.claim, ...overrides }) as never
const filaBdns = (v: { evidence: { kind: string }[] }) =>
  v.evidence.filter((e) => e.kind === 'bdns')

describe('el reproductor se da', () => {
  it('la afirmación es numérica y habla de OTRA fundación que la fila', () => {
    expect(FX.claim.type).toBe('afirmacion_numerica')
    expect(FX.claim.entities.referencedEntity).toBe('fundación eca')
    expect(FX.bdns).toHaveLength(1)
    expect(FX.bdns[0].description).toMatch(/FUNDACIÓN PADRE JUAN SCHENK/)
    expect(FX.bdns[0].description).not.toMatch(/\bECA\b/)
  })

  it('la fila no trae importe, y su enlace va en `sourceUrl`', () => {
    const f = FX.bdns[0]
    expect(f.importe ?? f.amount).toBeUndefined()
    expect(f.url).toBeUndefined()
    expect(f.sourceUrl).toMatch(/^https:\/\/www\.pap\.hacienda\.gob\.es\//)
  })
})

describe('el caso de producción', () => {
  it('NO es verificado', () => {
    expect(verifyClaim({ claim: claim(), bdns: BDNS }).verdict).not.toBe('verificado')
  })

  it('ni parcial: el convenio de otra fundación no es «un dato relacionado»', () => {
    // «fundación» sola no nombra a nadie. Publicar este convenio como pista bajo
    // una frase sobre la Fundación ECA sería la misma afirmación falsa, un
    // escalón más abajo.
    const v = verifyClaim({ claim: claim(), bdns: BDNS })
    expect(v.verdict).toBe('sin-datos')
    expect(filaBdns(v)).toEqual([])
  })

  it('y dice que miró en BDNS — sin-datos no es «no miré»', () => {
    expect(verifyClaim({ claim: claim(), bdns: BDNS }).checkedAgainst).toContain('bdns')
  })
})

describe('una fila de BDNS sin importe no funda «verificado»', () => {
  // Aquí la entidad SÍ nombra el convenio, con tokens distintivos de sobra.
  const nombrada = () =>
    claim({
      entities: { ...FX.claim.entities, referencedEntity: 'biblioteca solidaria misionera' },
    })

  it('el emparejador engancha la fila — si no, lo de abajo no mide nada', () => {
    expect(filaBdns(verifyClaim({ claim: nombrada(), bdns: BDNS }))).toHaveLength(1)
  })

  it('sostiene `parcial`, que es lo que es: mismo objeto, cifra sin cotejar', () => {
    expect(verifyClaim({ claim: nombrada(), bdns: BDNS }).verdict).toBe('parcial')
  })

  it('la cita resuelve: es el `sourceUrl` de la fila, no `bdns:`', () => {
    const [e] = filaBdns(verifyClaim({ claim: nombrada(), bdns: BDNS })) as unknown as {
      ref: string
    }[]
    expect(e.ref).toBe(FX.bdns[0].sourceUrl)
    expect(e.ref).not.toBe('bdns:')
  })

  it('sin `sourceUrl`, cita el código BDNS — nunca la ref vacía', () => {
    const { sourceUrl: _omit, ...sinEnlace } = FX.bdns[0]
    const [e] = filaBdns(
      verifyClaim({ claim: nombrada(), bdns: { items: [sinEnlace] } }),
    ) as unknown as { ref: string }[]
    expect(e.ref).toBe(`bdns:${FX.bdns[0].bdnsCode}`)
  })
})

describe('control: el camino bueno sigue verificando', () => {
  it('misma entidad E importe que cuadra → verificado', () => {
    // SINTÉTICO y dicho: ninguna fila publicada de BDNS trae importe hoy. Si
    // algún día el raspador lo trae, este es el caso que tiene que seguir vivo.
    const conImporte = { items: [{ ...FX.bdns[0], importe: 70000 }] }
    const v = verifyClaim({
      claim: claim({
        entities: { ...FX.claim.entities, referencedEntity: 'biblioteca solidaria misionera' },
      }),
      bdns: conImporte,
    })
    expect(v.verdict).toBe('verificado')
    expect(filaBdns(v)).toHaveLength(1)
  })

  it('y con importe, una entidad de UNA palabra genérica sigue sin bastar', () => {
    // «fundación eca» → «fundación». Con un importe parecido al lado, el tramo de
    // contratos exige que sea prácticamente exacto; aquí 70.000 contra 45.000.
    const otroImporte = { items: [{ ...FX.bdns[0], importe: 45000 }] }
    const v = verifyClaim({ claim: claim(), bdns: otroImporte })
    expect(v.verdict).toBe('sin-datos')
  })
})
