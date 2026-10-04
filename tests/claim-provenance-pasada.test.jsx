import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import { ClaimLedger } from '../src/components/ClaimLedger'
import Declaraciones from '../src/pages/Declaraciones'
import { CORPUS_IDS, PASADAS } from '../src/scraper/claim-verdicts'
import { TRINQUETE } from '../src/scraper/trinquete'
import { verifyClaimWithNli } from '../src/scraper/claim-verifier-nli'
import { verifyClaimWithEngine } from '../src/scraper/claim-verifier-engine'
import {
  applyOverlayEntries,
  mergeVerified,
  verificacionDeBajada,
} from '../src/scraper/verified-merge'
import { gateItemsForPublic } from '../src/scraper/claim-public-gate'
import { entradaDelMotor, sugerenciaDelAnclaje } from '../src/scraper/entrada-de-pasada'
import { rechazoDeFirma } from '../src/scraper/firma-de-persona'

/**
 * Quién dio el veredicto se lee de donde la pasada lo deja, no sólo de
 * `checkedAgainst`.
 *
 * `etiquetaVerificador` y `fuentesComprobadas` deducían la pasada de las marcas
 * que viajaban DENTRO de `checkedAgainst`. Desde la fase 1b (bfaf8b01) el motor
 * y el anclaje NLI escriben ahí los corpus de su evidencia y su nombre en
 * `derivedBy`; y desde #164 la verificación servida lleva además el `source` de
 * su entrada de overlay. Leyendo sólo `checkedAgainst`, la primera fila de esa
 * forma sale en /declaraciones y en /plenos:
 *
 *   · una subida de NLI, como «verificador determinista» — un modelo con el
 *     rótulo de un cotejo escrito a mano;
 *   · una retractación del motor sin evidencia, como «sin verificador anotado»
 *     y «Fuentes comprobadas: ninguna», cuando el motor sí buscó.
 *
 * Latente el 2026-09-29: ninguna de las 1.365 entradas de overlay lleva
 * `derivedBy`, porque los runners pisaban `checkedAgainst` con su marca. Desde
 * que dejaron de hacerlo (src/scraper/entrada-de-pasada.ts), cada retractación
 * nueva del motor llega con su `derivedBy`, y las páginas tienen que leerlo. Una
 * subida de NLI ya no llega sola —el anclaje sólo propone y el overlay la
 * rechaza—, pero si alguna vez se publicara con su forma, tendría que
 * rotularse bien.
 *
 * Las filas no se escriben a mano: salen de los verificadores reales, del
 * overlay, del merge y de la puerta pública, que es el camino por el que llegan
 * a un trozo servido. Una forma recitada es cómo una prueba sigue verde mientras
 * la página hace otra cosa (docs/DATA_INTEGRITY.md, regla 1).
 */

const STAMP = '2026-09-29T00:00:00.000Z'
const OVERLAY_VACIO = { version: 1, generatedAt: STAMP, entries: {} }

const CLAIM = {
  id: 'p1-001-cit-a1b2c3',
  plenoId: 'p1',
  plenoDate: '2026-01-19',
  segmentIndex: 1,
  type: 'cita_obra',
  speakerGroup: null,
  verbatim: 'se adjudicó el mantenimiento del complejo deportivo',
  context: '…se adjudicó el mantenimiento del complejo deportivo…',
  topic: 'urbanismo',
  entities: { referencedEntity: 'complejo deportivo' },
  confidence: 0.84,
  reasoning: 'Cita una obra concreta.',
  requiresHumanApproval: true,
}

const CANDIDATO = {
  kind: 'tender',
  ref: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=x',
  snippet: 'Servicio mantenimiento instalaciones en complejo deportivo.',
  similarity: 0.71,
}

/** Lo que deja el contraste determinista cuando consultó y no encontró. */
const BASE_SIN_DATOS = {
  claimId: CLAIM.id,
  verdict: 'sin-datos',
  summary: 'Sin coincidencias en los corpus consultados.',
  evidence: [],
  checkedAgainst: ['tenders', 'tenders-ted', 'bdns', 'budget'],
}

/** Una subida de la base, que es lo que el motor retracta. */
const BASE_PARCIAL = {
  claimId: CLAIM.id,
  verdict: 'parcial',
  summary: 'Coincidencia parcial con un contrato.',
  evidence: [{ ...CANDIDATO, stance: 'checked' }],
  checkedAgainst: ['tenders', 'tenders-ted', 'bdns', 'budget'],
}

/**
 * La pasada que un verificador vivo escribe en `derivedBy` está declarada en
 * PASADAS. Si alguien la renombrara en el módulo, la página dejaría de
 * reconocerla sin que la prueba de la página lo notara: el `source` del
 * overlay seguiría rotulando bien.
 */
function declarada(verification) {
  expect(verification.derivedBy?.length, 'el verificador no declaró su pasada').toBeGreaterThan(0)
  for (const p of verification.derivedBy) expect(PASADAS, `«${p}» sin declarar`).toContain(p)
}

/** base ⊕ overlay → puerta pública: el ítem tal y como va a un trozo. */
function servir(base, overlay) {
  const servidos = gateItemsForPublic(
    mergeVerified([{ claim: CLAIM, verification: base }], overlay),
  )
  expect(servidos, 'la puerta pública no dejó pasar la fila').toHaveLength(1)
  return servidos[0]
}

/**
 * Una subida del anclaje NLI, con la verificación tal y como la da el módulo.
 * Entailment 0,7: por encima del umbral de `parcial`, por debajo del de
 * `verificado`.
 *
 * Desde el 29-09-2026 el overlay no la acepta: el anclaje sólo propone, y su
 * sugerencia va a la cola humana (tests/entrada-de-pasada.test.ts). Aquí se
 * comprueba que la rechaza y después se pone en el overlay A MANO —que es como
 * podría llegar hoy una fila `nli` a lo publicado: `validateOverlay` la acepta
 * al leer—, para saber que, si llegara, la página diría de dónde viene.
 */
async function subidaNli() {
  const puntua = async (pares) =>
    new Map(
      pares.map((p) => [
        p.id,
        { id: p.id, entailment: 0.7, neutral: 0.2, contradiction: 0.1, label: 'entailment' },
      ]),
    )
  const r = await verifyClaimWithNli({ claim: CLAIM, candidates: [CANDIDATO] }, puntua)
  expect(r?.upgraded, 'el anclaje no subió: la prueba no mediría nada').toBe(true)
  const s = sugerenciaDelAnclaje({ r, desde: 'sin-datos' })
  declarada(s.verification)
  expect(() => applyOverlayEntries(OVERLAY_VACIO, [s], STAMP)).toThrow(/requiresHumanApproval/)
  const overlay = {
    ...OVERLAY_VACIO,
    entries: { [CLAIM.id]: { verification: s.verification, source: 'nli', appliedAt: STAMP } },
  }
  return servir(BASE_SIN_DATOS, overlay)
}

/**
 * Una retractación del motor sin evidencia. Sin `pisada`, es la entrada que
 * construye `entradaDelMotor`, la que escribe hoy el runner; con ella, la forma
 * de las entradas ya publicadas, escritas cuando el runner sustituía
 * `checkedAgainst` por su marca.
 */
async function retractacionMotor({ pisada }) {
  const r = await verifyClaimWithEngine(
    { claim: CLAIM, candidates: [CANDIDATO] },
    {
      reasonFn: async () => 'Ningún candidato respalda la afirmación: es otro complejo.',
      extractFn: async () => ({ verdict: 'sin-datos', cites: [] }),
    },
  )
  expect(r?.verification.verdict).toBe('sin-datos')
  declarada(r.verification)
  const entrada = pisada
    ? {
        claimId: CLAIM.id,
        verification: { ...r.verification, checkedAgainst: ['verdict-engine'] },
        source: 'verdict-engine',
        reason: 'verdict-engine re-judged parcial→sin-datos: ningún candidato la respalda',
        editor: 'verdict-engine:prueba',
      }
    : entradaDelMotor({
        verification: r.verification,
        modelo: 'prueba',
        tipo: 'retractacion',
        desde: 'parcial',
      })
  const overlay = applyOverlayEntries(OVERLAY_VACIO, [entrada], STAMP)
  return servir(BASE_PARCIAL, overlay)
}

function pintarLedger(it) {
  return render(
    <MemoryRouter>
      <ClaimLedger items={[it]} />
    </MemoryRouter>,
  )
}

/** El texto de la línea de la tarjeta que empieza por `rotulo`, sin él. */
function linea(rotulo) {
  const empieza = (el) => el?.textContent?.startsWith(rotulo) ?? false
  const el = screen.getByText((_, e) => empieza(e) && ![...(e?.children ?? [])].some(empieza), {
    selector: 'div, span, p',
  })
  return el.textContent.slice(rotulo.length).trim()
}

const veredicto = () => linea('Veredicto:')
const fuentes = () => linea('Fuentes comprobadas:')

describe('/plenos · la tarjeta lee la pasada de derivedBy y source', () => {
  it('una subida de NLI no se rotula «verificador determinista»', async () => {
    pintarLedger(await subidaNli())
    expect(veredicto()).toBe('verificador NLI')
    // El corpus de la evidencia sí es una fuente: sale, y sale solo.
    expect(fuentes()).toBe('tenders')
  })

  it('una retractación del motor dice quién la hizo y que no constan las fuentes', async () => {
    pintarLedger(await retractacionMotor({ pisada: false }))
    expect(veredicto()).toBe('verificador LLM')
    // El motor buscó entre candidatos de los corpus y no dejó anotado cuáles:
    // «ninguna» diría que no había dónde buscar.
    expect(fuentes()).toBe('no constan')
  })

  it('con la marca de las entradas ya publicadas, dice lo mismo', async () => {
    pintarLedger(await retractacionMotor({ pisada: true }))
    expect(veredicto()).toBe('verificador LLM')
    expect(fuentes()).toBe('no constan')
  })
})

describe('/declaraciones · la línea de evidencia lee la pasada de derivedBy y source', () => {
  it('una subida de NLI no se rotula «verificador determinista»', async () => {
    const it = await subidaNli()
    installFetchMock({
      '/data/pleno-claims/index.json': {
        plenos: [{ plenoId: 'p1', plenoDate: CLAIM.plenoDate, chunkPath: 'pleno-claims/p1.json' }],
        totals: { items: 1, byVerdict: { parcial: 1 } },
      },
      '/data/pleno-claims/p1.json': { items: [it] },
      '/data/plenos.json': { items: [] },
    })
    render(
      <MemoryRouter>
        <Declaraciones />
      </MemoryRouter>,
    )
    // «1 evidencia · <verificador>»: la línea sólo se pinta sobre una fila con
    // evidencia, así que encontrarla ya prueba que la fila llegó a la página.
    const cabecera = await screen.findByText(
      (_, e) => /^1 evidencia · /.test(e?.textContent ?? '') && e?.children.length === 0,
    )
    expect(cabecera.textContent).toBe('1 evidencia · verificador NLI')
  })
})

describe('ninguna pasada declarada se rotula como cotejo determinista ni como vacío', () => {
  // Contra los enums exportados, no contra una copia: `PASADAS` cubre los dos
  // esquemas de nombre (el del verificador y el del overlay) y las claves de
  // `TRINQUETE` son todas las fuentes de overlay, porque es un
  // `Record<OverlaySource, …>`. Una pasada nueva entra en la prueba sola.
  const PROHIBIDAS = ['verificador determinista', 'sin verificador anotado']

  function conEvidencia(verification) {
    return {
      claim: CLAIM,
      verification: {
        claimId: CLAIM.id,
        verdict: 'parcial',
        summary: 'Resumen neutro.',
        evidence: [{ ...CANDIDATO, stance: 'checked' }],
        ...verification,
      },
      visibility: 'shown',
    }
  }

  const casos = [
    ...PASADAS.map((p) => [`marca «${p}» en checkedAgainst`, { checkedAgainst: ['tenders', p] }]),
    ...PASADAS.map((p) => [`«${p}» en derivedBy`, { checkedAgainst: ['tenders'], derivedBy: [p] }]),
    ...Object.keys(TRINQUETE).map((s) => [
      `«${s}» como source`,
      { checkedAgainst: ['tenders'], source: s },
    ]),
  ]

  for (const [nombre, verification] of casos) {
    it(nombre, () => {
      pintarLedger(conEvidencia(verification))
      const rotulo = veredicto()
      expect(PROHIBIDAS, rotulo).not.toContain(rotulo)
      expect(rotulo.length).toBeGreaterThan(0)
    })
  }

  it('una pasada que nadie ha declarado tampoco pasa por determinista', () => {
    // Callar es el lado seguro; llamarla «determinista» sería el mismo defecto
    // con el nombre de la próxima pasada.
    pintarLedger(conEvidencia({ checkedAgainst: ['tenders'], derivedBy: ['pasada-nueva'] }))
    expect(veredicto()).not.toBe('verificador determinista')
  })

  it('un nombre sin declarar junto a un corpus tampoco', () => {
    // «Determinista» va por lista blanca, como el corpus: sólo corpus
    // declarados y ninguna pasada. Un nombre que no es ni lo uno ni lo otro
    // puede ser un corpus nuevo o una pasada nueva, y afirmar lo primero es
    // afirmar de más. check:cobertura lo reporta para que alguien lo declare.
    pintarLedger(conEvidencia({ checkedAgainst: ['tenders', 'corpus-nuevo'] }))
    expect(veredicto()).not.toBe('verificador determinista')
  })
})

describe('cuando las anotaciones discrepan, quién se nombra', () => {
  // Ningún escritor de hoy deja dos pasadas distintas en una fila; esto
  // decide qué dice la página si una entrada editada a mano lo hiciera.
  function conEvidencia(verification) {
    return {
      claim: CLAIM,
      verification: {
        claimId: CLAIM.id,
        verdict: 'sin-datos',
        summary: 'Resumen neutro.',
        evidence: [],
        ...verification,
      },
      visibility: 'toggle',
    }
  }

  it('manda el canal validado del overlay, como en mergeVerified', () => {
    // `mergeVerified` estampa el `source` de la ENTRADA, que es el que valida
    // `validateOverlay`, por encima de lo que la verificación traiga dentro.
    // Una marca vieja que discrepe no puede ganarle.
    pintarLedger(conEvidencia({ checkedAgainst: ['tenders', 'verdict-engine'], source: 'nli' }))
    expect(veredicto()).toBe('verificador NLI')
  })

  it('pero una bajada de curador se dice siempre, y sin su canal no se sabe de quién', () => {
    // Quién decidió la bajada lo estampa `mergeVerified` junto al `source` de
    // una entrada del curador. Aquí manda otro canal: la marca dice que hubo
    // una bajada, y nada dice que la decidiera una persona.
    pintarLedger(conEvidencia({ checkedAgainst: ['curator-downgrade'], source: 'verdict-engine' }))
    expect(veredicto()).toBe('rebajado; no consta quién lo decidió')
  })
})

describe('las filas servidas hoy siguen diciendo lo que decían', () => {
  // Contra los trozos publicados: la forma vieja —marca en checkedAgainst,
  // `source` desde #164, sin `derivedBy`— no puede cambiar de rótulo con el
  // arreglo. La etiqueta esperada se deduce del `source`, un campo que el
  // arreglo no toca, y no del propio rótulo.
  const dir = resolve('public/data/pleno-claims')
  const items = readdirSync(dir)
    .filter((f) => f !== 'index.json')
    .flatMap((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')).items ?? [])

  const soloCorpus = (ca) => ca?.length > 0 && ca.every((c) => CORPUS_IDS.includes(c))
  // Una bajada del curador sólo es «corregido por un curador» si la firmó una
  // persona; las demás las cubre tests/rebaja-quien-decide.test.jsx. La firma
  // se lee del overlay, que el arreglo no toca.
  const overlay = JSON.parse(readFileSync(resolve('public/data/pleno-claims-overlay.json'), 'utf8'))
  const firmadaConNombre = (v) => rechazoDeFirma(overlay.entries[v.claimId]?.editor) === null
  const GRUPOS = [
    ['por el motor', (v) => v.source === 'verdict-engine', 'verificador LLM'],
    [
      'por un curador con nombre',
      (v) => v.source === 'curator-downgrade' && firmadaConNombre(v),
      'corregido por un curador',
    ],
    ['por el cotejo', (v) => !v.source && soloCorpus(v.checkedAgainst), 'verificador determinista'],
    ['sin nada anotado', (v) => !v.source && !v.checkedAgainst?.length, 'sin verificador anotado'],
  ]

  for (const [grupo, es, esperada] of GRUPOS) {
    it(`una fila servida ${grupo} se rotula «${esperada}»`, () => {
      const muestra = items.filter((i) => es(i.verification)).slice(0, 3)
      // Prueba de trabajo: sin esto, el bucle podría pasar recorriendo cero.
      expect(muestra.length, grupo).toBeGreaterThan(0)
      for (const it of muestra) {
        const { unmount } = pintarLedger(it)
        expect(veredicto(), it.claim.id).toBe(esperada)
        unmount()
      }
    })
  }
})

/**
 * El recuento de /declaraciones dice lo mismo que la tarjeta.
 *
 * La línea «Fuentes comprobadas» ya distinguía «ninguna» de «no constan», pero
 * el reparto de «sin datos» de la cabecera partía en dos: una retractación del
 * motor o una bajada de curador —que sustituyen la lista por su marca— salía
 * entre las que no tenían «corpus que consultar», justo encima de una tarjeta
 * que decía «no constan». Las cinco filas llegan por el camino real, y las del
 * motor en las dos formas: la que escribe hoy (`derivedBy`) y la de las
 * entradas ya publicadas (marca en `checkedAgainst`).
 */
describe('/declaraciones · el reparto de «sin datos» es el de las tarjetas', () => {
  /** Lo que publica una bajada de curador, por el mismo camino que la CLI. */
  function bajadaDeCurador() {
    const motivo = 'El contrato citado no es el de la obra que la cita afirma.'
    const overlay = applyOverlayEntries(
      OVERLAY_VACIO,
      [
        {
          claimId: CLAIM.id,
          verification: verificacionDeBajada(CLAIM.id, BASE_PARCIAL, 'sin-datos', motivo),
          source: 'curator-downgrade',
          reason: motivo,
          editor: 'curador',
        },
      ],
      STAMP,
      new Map([[CLAIM.id, BASE_PARCIAL.verdict]]),
    )
    return servir(BASE_PARCIAL, overlay)
  }

  /** Cada fila con su propio id, que la página usa de clave. */
  const conId = (it, n) => ({ ...it, claim: { ...it.claim, id: `${CLAIM.id}-${n}` } })

  async function pintarDeclaraciones() {
    const items = [
      servir({ ...BASE_SIN_DATOS, checkedAgainst: [] }, OVERLAY_VACIO),
      servir(BASE_SIN_DATOS, OVERLAY_VACIO),
      await retractacionMotor({ pisada: false }),
      await retractacionMotor({ pisada: true }),
      bajadaDeCurador(),
    ].map(conId)
    // Control: la tarjeta de cada una dice lo que el recuento tiene que repetir.
    const lineas = items.map((it) => {
      const { unmount } = pintarLedger(it)
      const f = fuentes()
      unmount()
      return f
    })
    expect(lineas).toEqual([
      'ninguna',
      'tenders · tenders-ted · bdns · budget',
      'no constan',
      'no constan',
      'no constan',
    ])
    installFetchMock({
      '/data/pleno-claims/index.json': {
        plenos: [{ plenoId: 'p1', plenoDate: CLAIM.plenoDate, chunkPath: 'pleno-claims/p1.json' }],
        totals: { items: items.length, byVerdict: { 'sin-datos': items.length } },
      },
      '/data/pleno-claims/p1.json': { items },
      '/data/plenos.json': { items: [] },
    })
    render(
      <MemoryRouter>
        <Declaraciones />
      </MemoryRouter>,
    )
    return screen.findByText((_, e) => /^Por qué «sin datos»/.test(e?.textContent ?? ''), {
      selector: 'p',
    })
  }

  it('la línea de reparto separa lo que no consta de lo que no tenía corpus', async () => {
    const reparto = (await pintarDeclaraciones()).textContent.replace(/\s+/g, ' ')
    expect(reparto).toMatch(/\b1 comprobadas, no aparecen\b/)
    expect(reparto).toMatch(/\b1 sin corpus que consultar\b/)
    // Sin `\b` al final: sin la bandera `u`, «ó» no es un carácter de palabra.
    expect(reparto).toMatch(/\b3 no consta qué se consultó/)
  })

  it('cada filtro deja exactamente las filas de su casilla', async () => {
    await pintarDeclaraciones()
    for (const [rotulo, n] of [
      [/^No consta qué se consultó/, 3],
      [/^Sin corpus que consultar/, 1],
      [/^Comprobada, no aparece/, 1],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: rotulo }))
      expect(
        await screen.findByText(new RegExp(`^${n} declaraciones coinciden`)),
        String(rotulo),
      ).toBeTruthy()
    }
  })
})
