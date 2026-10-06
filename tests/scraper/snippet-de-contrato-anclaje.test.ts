import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  snippetDeContrato,
  partesDelSnippet,
  SNIPPET_MAXIMO,
  TITULO_MINIMO,
} from '../../src/scraper/snippet-de-contrato'
import { dondeAncla, verifyClaimWithEngine } from '../../src/scraper/claim-verifier-engine'
import type { EngineExtract } from '../../src/scraper/claim-verifier-engine'
import type { PlenoClaim } from '../../src/scraper/pleno-claim'

/**
 * El snippet de un contrato lleva sus hechos delante y su título detrás
 * (tests/scraper/snippet-de-contrato.test.ts dice por qué), y el motor tiene que
 * saber cuál es cuál: desde #249 un respaldo se ancla en un VALOR del registro,
 * nunca en su título (`dondeAncla`). Con los hechos delante, la regla de antes
 * —el título es el primer trozo— leería el título entero como un valor, que es
 * el agujero que #249 cerró: 61 de las 62 citas de las 52 eran el título.
 */
const F = JSON.parse(
  readFileSync(resolve('tests/fixtures/snippet-de-contrato_2026-10-06.json'), 'utf8'),
)
const fila = (id: string) =>
  (F.contracts as Record<string, unknown>[]).find((r) => r.id === id) as Record<string, unknown>
const espacios = (s: unknown) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()

/** Los tres registros de la lectura, y un valor de cada uno copiado a mano de la fila. */
const LOS_TRES = [
  { contrato: '4415701', importe: '35.252,87', adjudicataria: 'VODAFONE ESPANA SA' },
  {
    contrato: '5054473',
    importe: '325.662,55',
    adjudicataria: 'OBRA CIVIL Y EDIFICACION ESCRIMAR S.L.L.',
  },
  {
    contrato: '46717',
    importe: '55.685.178,79',
    adjudicataria: 'HIDRAQUA GESTIÓN INTEGRAL DE AGUAS DE LEVANTE, S.A.',
  },
]

describe('el motor sabe dónde está el título en el snippet de un contrato', () => {
  it('una cita del título ancla en el título, aunque el título vaya detrás de los hechos', () => {
    for (const t of LOS_TRES) {
      const s = snippetDeContrato(fila(t.contrato))
      const titulo = espacios(fila(t.contrato).title).slice(0, 40)
      expect(dondeAncla(s, titulo), `${t.contrato}: «${s}»`).toBe('titulo')
    }
  })

  it('una cita del importe o de la adjudicataria ancla en un valor', () => {
    for (const t of LOS_TRES) {
      const s = snippetDeContrato(fila(t.contrato))
      expect(dondeAncla(s, t.importe), `${t.contrato}: «${s}»`).toBe('valor')
      expect(dondeAncla(s, t.adjudicataria), `${t.contrato}: «${s}»`).toBe('valor')
    }
  })

  it('una cita que sólo copia nuestros rótulos no ancla nada: no son del registro', () => {
    const s = snippetDeContrato(fila('4415701'))
    for (const rotulo of ['con IVA', 'sin IVA', 'adjudicación:', 'licitación:', 'objeto:'])
      expect(dondeAncla(s, rotulo), rotulo).toBeNull()
  })

  it('un snippet de antes, sin marca de título, sigue leyéndose con el título delante', () => {
    // La forma de las 52 del 04-10-2026, que siguen en cachés y en pruebas.
    const antes =
      'Suministro con instalación de juegos infantiles en Parque Asunción · €40.727,1 · awarded'
    expect(dondeAncla(antes, 'juegos infantiles en Parque Asunción')).toBe('titulo')
    expect(dondeAncla(antes, '40.727,1')).toBe('valor')
    expect(partesDelSnippet(antes).titulo).toBe(
      'Suministro con instalación de juegos infantiles en Parque Asunción',
    )
  })
})

describe('lo único que se recorta es el título', () => {
  const T = JSON.parse(readFileSync(resolve('public/data/tenders.json'), 'utf8'))
  const filas = [...T.contracts, ...T.tenders] as Record<string, unknown>[]

  it('y se dice con «…»; el snippet cabe en el tope salvo que los hechos no dejen sitio al título', () => {
    let recortados = 0
    for (const r of filas) {
      const s = snippetDeContrato(r)
      const { titulo } = partesDelSnippet(s)
      const entero = espacios(r.title)
      if (titulo !== entero) {
        recortados++
        expect(titulo.endsWith('…'), `${r.id}: «${s}»`).toBe(true)
        expect(entero.startsWith(titulo.slice(0, -1)), `${r.id}: «${s}»`).toBe(true)
      }
      // Pasarse del tope sólo puede pasar con el título ya en su mínimo: los
      // hechos no se cortan nunca.
      if (s.length > SNIPPET_MAXIMO)
        expect(titulo.length, `${r.id}`).toBeLessThanOrEqual(TITULO_MINIMO)
    }
    expect(filas.length).toBeGreaterThan(1000)
    // Que el recorte se ejercitó: hay títulos de cientos de caracteres.
    expect(recortados).toBeGreaterThan(100)
  })
})

describe('k4olcs-018-afi-1077bc ante el motor, con el snippet que trae su importe', () => {
  const claim = (F.declaraciones as PlenoClaim[]).find(
    (d) => d.id === 'k4olcs-018-afi-1077bc',
  ) as PlenoClaim
  const r = fila('4415701')
  const candidatos = [
    {
      kind: 'tender' as const,
      ref: String(r.permalink),
      snippet: snippetDeContrato(r),
      similarity: 0.58,
    },
  ]
  const juzgar = (extraccion: EngineExtract) =>
    verifyClaimWithEngine(
      { claim, candidates: candidatos },
      {
        reasonFn: async () =>
          'El candidato [0] es el contrato de cartelería digital en sedes municipales, y su ' +
          'importe de adjudicación con IVA es la cifra citada.',
        extractFn: async () => extraccion,
      },
    )

  it('una cita del importe sostiene el veredicto, con el registro de evidencia', async () => {
    const v = await juzgar({
      verdict: 'verificado',
      cites: [
        { candidateIndex: 0, snippet: 'tender[0].adjudicacion=35.252,87 € · la cifra citada' },
      ],
    })
    expect(v!.verification.verdict).toBe('verificado')
    expect(v!.verification.evidence.map((e) => e.ref)).toEqual([String(r.permalink)])
  })

  it('una cita del título sola sigue sin sostener nada (#249)', async () => {
    const v = await juzgar({
      verdict: 'parcial',
      cites: [
        {
          candidateIndex: 0,
          snippet:
            'tender[0].objeto=Contrato mixto suministro y servicio de implantación de cartelería digital · mismo objeto',
        },
      ],
    })
    expect(v!.verification.verdict).toBe('sin-datos')
    expect(v!.sinDatosPorque).toBe('solo-el-titulo')
  })
})
