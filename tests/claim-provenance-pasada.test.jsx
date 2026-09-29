import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import { ClaimLedger } from '../src/components/ClaimLedger'
import Declaraciones from '../src/pages/Declaraciones'
import { CORPUS_IDS, PASADAS } from '../src/scraper/claim-verdicts'
import { TRINQUETE } from '../src/scraper/trinquete'
import { verifyClaimWithNli } from '../src/scraper/claim-verifier-nli'
import { verifyClaimWithEngine } from '../src/scraper/claim-verifier-engine'
import { applyOverlayEntries, mergeVerified } from '../src/scraper/verified-merge'
import { gateItemsForPublic } from '../src/scraper/claim-public-gate'

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
 * `derivedBy`, y los runners todavía pisan `checkedAgainst` con su marca. Pero
 * el día que el runner de NLI deje de hacerlo —tiene que dejar de hacerlo para
 * poder subir nada: con la marca, el suelo de evidencia rechaza la subida— las
 * dos páginas lo pintarían mal sin que nada se pusiera rojo.
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
  declarada(r.verification)
  const overlay = applyOverlayEntries(
    OVERLAY_VACIO,
    [{ claimId: CLAIM.id, verification: r.verification, source: 'nli' }],
    STAMP,
  )
  return servir(BASE_SIN_DATOS, overlay)
}

/**
 * Una retractación del motor sin evidencia. `pisada` reproduce lo que hace hoy
 * scripts/verify-pleno-claims-engine.ts al escribir la entrada: sustituir
 * `checkedAgainst` por su marca. Sin ella, es la forma que da el módulo.
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
  const verification = pisada
    ? { ...r.verification, checkedAgainst: ['verdict-engine'] }
    : r.verification
  const overlay = applyOverlayEntries(
    OVERLAY_VACIO,
    [
      {
        claimId: CLAIM.id,
        verification,
        source: 'verdict-engine',
        reason: 'verdict-engine re-judged parcial→sin-datos: ningún candidato la respalda',
        editor: 'verdict-engine:prueba',
      },
    ],
    STAMP,
  )
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

  it('con la marca que hoy escribe el runner, dice lo mismo', async () => {
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

  it('pero una corrección de curador se dice siempre', () => {
    pintarLedger(conEvidencia({ checkedAgainst: ['curator-downgrade'], source: 'verdict-engine' }))
    expect(veredicto()).toBe('corregido por un curador')
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
  const GRUPOS = [
    ['por el motor', (v) => v.source === 'verdict-engine', 'verificador LLM'],
    ['por un curador', (v) => v.source === 'curator-downgrade', 'corregido por un curador'],
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
