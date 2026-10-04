import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { verifyClaim } from '../src/scraper/claim-verifier'
import {
  RESUMEN_CASI_FIJO,
  corpusReales,
  resumenCasi,
  resumenSinRegistro,
} from '../src/scraper/claim-verdicts'

/**
 * El expediente «que se parece» sólo se enseña si el camino del importe miró
 * los contratos.
 *
 * `mejorCasiPorObjeto` nació para UNA frase: la de un `sin-datos` cuya cifra no
 * es la del contrato que el emparejador tuvo delante —15uvjew-015-cit-c4edb0
 * cita el canon del agua, 3,5 M€, y la concesión vale 55,69 M€—. El camino del
 * importe había leído el expediente y lo había descartado por la cifra; la fila
 * se enseñaba para no decir «no se encontró registro» de algo que se leyó
 * (tests/claim-verifier-sin-datos-dice-que-miro.test.ts).
 *
 * Pero el barrido no miraba si ese camino había corrido. Corría también para
 * citas SIN cifra —una promesa, una afirmación sin importe—, sobre las que el
 * emparejador del importe no se ejecuta, y sin anotar `tenders`: la tarjeta
 * enseñaba una fila CONTRATO encima de «Fuentes comprobadas: ninguna» o
 * «promises», con una frase sobre «la cifra del claim» que la cita no trae, y
 * que terminaba insinuando un desmentido: «No es que no haya registro: es que el
 * que hay no dice eso.».
 *
 * Medido el 30-09-2026 sobre los trozos servidos: 61 tarjetas llevaban esa
 * frase, 47 de ellas sin cifra —34 sobre «ninguna» y 13 sobre «promises»—. Y lo
 * que enseñaban era, casi siempre, ruido léxico: «la Comunidad Valenciana cuenta
 * con una población superior de 5 millones de personas» colgaba del contrato del
 * Plan de Movilidad; «el contrato de gestión de residuos», de la cubierta de las
 * pistas de pádel.
 *
 * Decisión del 30-09-2026 (opción B): el barrido sólo corre cuando el camino del
 * importe consultó los contratos. `checkedAgainst` no cambia de significado —ni
 * se anota lo que no se cotejó, ni se infla el reparto de «sin datos» de
 * /declaraciones—; lo que desaparece es una fila de evidencia que no funda
 * nada, que es una retirada (nivel A de `decideAutomation`).
 *
 * Las filas no se escriben aquí: salen de los trozos servidos y se vuelven a
 * pasar por el verificador con los datos publicados.
 *
 * 04-10-2026: la re-verificación del paso 0 de #218 (`verify:pleno-claims`)
 * quitó del dato las 47 filas del defecto y reescribió con `resumenCasi` las 14
 * del caso de control. La premisa «el caso existe» pasa a ser la guarda que es
 * —lo servido no vuelve a llevar ninguna—, el control se busca por la frase
 * nueva, y las 47 de antes viven congeladas en
 * tests/fixtures/casi-antes-de-reverificar_2026-10-04.json para seguir pasando
 * por el verificador.
 */

const ROOT = join(__dirname, '..')
const leer = (p: string) => JSON.parse(readFileSync(join(ROOT, 'public/data', p), 'utf8'))

const DATOS = {
  tenders: leer('tenders.json'),
  tendersTed: leer('tenders-ted.json'),
  bdns: leer('bdns.json'),
  budget: leer('budget.json'),
  promises: leer('promises.json'),
}

interface Evidencia {
  kind: string
  snippet?: string
}
interface Item {
  claim: Parameters<typeof verifyClaim>[0]['claim']
  verification: {
    verdict: string
    summary?: string
    evidence: Evidencia[]
    checkedAgainst?: unknown[]
  }
}

const TROZOS = join(ROOT, 'public/data/pleno-claims')
const servidos: Item[] = readdirSync(TROZOS)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .flatMap((f) => JSON.parse(readFileSync(join(TROZOS, f), 'utf8')).items as Item[])

/** ¿Anota la verificación algún corpus de contratos? */
const leyoContratos = (v: Item['verification']) =>
  corpusReales(v.checkedAgainst).some((c) => c === 'tenders' || c === 'tenders-ted')
const conContrato = (v: { evidence: Evidencia[] }) => v.evidence.some((e) => e.kind === 'tender')

/**
 * Las filas del defecto, reconocidas por su forma y no por su frase: un
 * `sin-datos` que enseña un contrato sin haber anotado ningún corpus de
 * contratos. Sólo el barrido del expediente parecido las producía.
 */
const sinCotejo = servidos.filter(
  (it) =>
    it.verification.verdict === 'sin-datos' &&
    conContrato(it.verification) &&
    !leyoContratos(it.verification),
)

/**
 * Las que sí tenían cifra y un camino del importe que leyó los contratos,
 * reconocidas por la frase que les escribe el verificador de hoy.
 */
const conCifra = servidos.filter(
  (it) =>
    it.verification.verdict === 'sin-datos' &&
    conContrato(it.verification) &&
    leyoContratos(it.verification) &&
    it.claim.entities.amountEuros != null &&
    it.verification.summary === resumenCasi(true),
)

/** Las filas tal como se servían hasta la re-verificación del 04-10-2026. */
const ANTES: { sinCotejo: Item[]; conCifra: Item[] } = JSON.parse(
  readFileSync(join(ROOT, 'tests/fixtures/casi-antes-de-reverificar_2026-10-04.json'), 'utf8'),
)

describe('lo servido: ninguna fila CONTRATO sin contratos cotejados (la premisa, hoy guarda)', () => {
  it('ninguna verificación servida enseña un contrato sin haber cotejado contratos', () => {
    // Medido sobre algo: sin «sin datos» servidos, el cero no diría nada.
    expect(servidos.filter((it) => it.verification.verdict === 'sin-datos').length).toBeGreaterThan(
      0,
    )
    expect(sinCotejo.map((it) => it.claim.id)).toEqual([])
  })

  it('y el caso para el que nació el barrido se sirve, con la frase nueva', () => {
    expect(conCifra.length).toBeGreaterThan(0)
    expect(conCifra.some((it) => it.claim.id === '15uvjew-015-cit-c4edb0')).toBe(true)
  })
})

describe('el fixture: las filas del defecto, como se servían', () => {
  it('sin cifra y sin contratos, sobre «ninguna» y «promises», con la frase fija', () => {
    // Sin ellas, lo de abajo pasaría sin haber mirado nada.
    expect(ANTES.sinCotejo.length).toBeGreaterThan(0)
    for (const it of ANTES.sinCotejo) {
      expect(it.verification.verdict, it.claim.id).toBe('sin-datos')
      expect(conContrato(it.verification), it.claim.id).toBe(true)
      expect(leyoContratos(it.verification), it.claim.id).toBe(false)
      expect(it.claim.entities.amountEuros ?? null, it.claim.id).toBeNull()
      // Y su frase habla de una cifra que la cita no trae.
      expect(it.verification.summary, it.claim.id).toBe(RESUMEN_CASI_FIJO)
    }
    // Las dos líneas que medimos: «ninguna» y «promises».
    const lineas = ANTES.sinCotejo.map((it) =>
      corpusReales(it.verification.checkedAgainst).join(' · '),
    )
    expect(lineas).toContain('')
    expect(lineas).toContain('promises')
  })
})

describe('sin cifra: el verificador no enseña el expediente que se parece', () => {
  it('re-verificadas, ninguna enseña un contrato, y su procedencia no cambia', () => {
    const malas = ANTES.sinCotejo
      .map((it) => ({ it, r: verifyClaim({ claim: it.claim, ...DATOS }) }))
      .filter(
        ({ it, r }) =>
          conContrato(r) ||
          JSON.stringify(r.checkedAgainst) !== JSON.stringify(it.verification.checkedAgainst),
      )
      .map(({ it, r }) => `${it.claim.id} [${r.checkedAgainst.join(', ')}] ${r.summary}`)
    expect(malas.slice(0, 5), `${malas.length} filas`).toEqual([])
  })

  it('y su explicación es la derivada de lo que consta como consultado', () => {
    const malas = ANTES.sinCotejo
      .map((it) => ({ it, r: verifyClaim({ claim: it.claim, ...DATOS }) }))
      .filter(
        ({ r }) => r.verdict !== 'sin-datos' || r.summary !== resumenSinRegistro(r.checkedAgainst),
      )
      .map(({ it, r }) => `${it.claim.id} ${r.verdict}: ${r.summary}`)
    expect(malas.slice(0, 5), `${malas.length} filas`).toEqual([])
  })
})

describe('con cifra: la fila se queda, y la frase ya no insinúa un desmentido', () => {
  it('el expediente se sigue enseñando, con los contratos anotados', () => {
    for (const it of conCifra) {
      const r = verifyClaim({ claim: it.claim, ...DATOS })
      expect(r.verdict, it.claim.id).toBe('sin-datos')
      expect(conContrato(r), it.claim.id).toBe(true)
      expect(leyoContratos(r), it.claim.id).toBe(true)
    }
  })

  it('dice que el importe no es la cifra citada, sin «claim» y sin «no dice eso»', () => {
    for (const it of conCifra) {
      const { summary } = verifyClaim({ claim: it.claim, ...DATOS })
      expect(summary, it.claim.id).toMatch(/no coincide con la cifra citada/)
      expect(summary, it.claim.id).not.toMatch(/no dice eso|\bclaim\b/)
      // Un «sin datos» no es un desmentido, y la frase lo dice como las demás.
      expect(summary, it.claim.id).toMatch(/no es un desmentido/)
    }
  })
})
