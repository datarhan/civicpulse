import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PALABRAS_DEL_PLENO,
  vocabularioDelOrdenDelDia,
  votosDeLaSesion,
  type VotoPublicado,
} from '../src/scraper/en-breve-plenos'
import { etiquetaDelPunto } from '../src/scraper/etiqueta-llana'
import { GLOSARIO } from '../src/glosario'
import type { EnrichedPleno, PlenoAgendaItem } from '../src/scraper/pleno-agenda'

/**
 * El «Resumen» de /plenos/:id en palabras llanas (auditoría de las dos lecturas,
 * §10): las palabras del orden del día que tienen entrada en el glosario, y las
 * votaciones transcritas de la sesión con su etiqueta llana.
 *
 * Los títulos de los casos son literales de plenos-agendas.json; el resto se
 * comprueba sobre lo que se publica. Ninguna cifra del snapshot está escrita aquí.
 */
const leer = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, '..', 'public', 'data', f), 'utf8'))
const agendas: { plenos: EnrichedPleno[] } = leer('plenos-agendas.json')
const votos: {
  items: (VotoPublicado & {
    id: string
    itemNumber: number
    title: string
    votes: unknown[]
    votesRetracted?: unknown
  })[]
} = leer('pleno-votes.json')

const punto = (title: string, number = 1): PlenoAgendaItem =>
  ({ number, title, section: 'resolutiva' }) as PlenoAgendaItem

describe('vocabularioDelOrdenDelDia — las palabras de la sede que el glosario explica', () => {
  it('cada palabra tiene su entrada en el glosario', () => {
    for (const p of PALABRAS_DEL_PLENO) expect(GLOSARIO, p).toContain(p)
  })

  it.each([
    ['mocion', 'Moción del Grupo Municipal Socialista de Riba-roja para la declaración'],
    ['mocion', 'Moció del Grup Municipal Popular Riba-roja de Túria en defensa dels treballadors'],
    ['mocion', 'Asuntos de Urgencia. 9.1. MOCIÒ'],
    ['mocion', 'Despatx d’Urgència. 11.1. 35/2023/PGRU Moción PSPV-PSOE, Compromís'],
    [
      'reconocimientoExtrajudicial',
      'Aprobación expediente Reconocimiento Extrajudicial nº 13/2026. Lista de facturas',
    ],
    [
      'reconocimientoExtrajudicial',
      'Expedient: 5854/2025/GEN, Aprovació Reconeixement Extrajudicial núm. 44/2025',
    ],
    [
      'sinDictaminar',
      'Rendición de cuentas al Pleno sobre la reinvención de la Feria del Comercio para mejorar (Sin dictaminar)',
    ],
    [
      'sinDictaminar',
      'Expedient: 2141/2025/GEN, Donar compte al Ple del Pla Anual de Control Financer 2025-2026 (sense dictaminar)',
    ],
    ['urgencia', 'Asunto de Urgencia. Acuerdo relativo a la resolución definitiva del contrato'],
    ['urgencia', 'Assumptes d’Urgència – Expedient 647/2026/GEN, “Aprovació PAI EDIL'],
  ])('«%s» en «%s»', (palabra, titulo) => {
    expect(vocabularioDelOrdenDelDia([punto(titulo)])).toContain(palabra)
  })

  it.each([
    'Aprobación de la promoción económica del comercio local',
    'Ratificación del convenio con la Mancomunitat',
    'Aprovació del Projecte CAP PENSANT després del Dictamen del Consell Jurídic Consultiu',
    'Donar compte de les Resolucions de la número 47/2026 a la 363/2026',
  ])('ninguna palabra en «%s»', (titulo) => {
    expect(vocabularioDelOrdenDelDia([punto(titulo)])).toEqual([])
  })

  it('una vez cada una, en el orden de PALABRAS_DEL_PLENO', () => {
    const agenda = [
      punto('Asuntos de Urgencia. 9.1. MOCIÒ', 3),
      punto('Moción del Grupo Municipal Popular', 1),
      punto('Aprobación Reconocimiento Extrajudicial nº 5/2026 (Sin dictaminar)', 2),
    ]
    expect(vocabularioDelOrdenDelDia(agenda)).toEqual([
      'mocion',
      'reconocimientoExtrajudicial',
      'sinDictaminar',
      'urgencia',
    ])
    expect(vocabularioDelOrdenDelDia([])).toEqual([])
  })

  it('sobre lo publicado: «urgencia» si y sólo si algún punto lleva la marca de urgencia', () => {
    let conUrgencia = 0
    for (const p of agendas.plenos) {
      const hay = p.agenda.some((a) => etiquetaDelPunto(a.title).urgente)
      if (hay) conUrgencia++
      expect(vocabularioDelOrdenDelDia(p.agenda).includes('urgencia'), p.id).toBe(hay)
    }
    expect(conUrgencia, 'alguna sesión con asuntos de urgencia').toBeGreaterThan(0)
  })

  it('sobre lo publicado: cada palabra sale en alguna sesión', () => {
    const vistas = new Set(agendas.plenos.flatMap((p) => vocabularioDelOrdenDelDia(p.agenda)))
    expect([...vistas].sort()).toEqual([...PALABRAS_DEL_PLENO].sort())
  })
})

describe('votosDeLaSesion — las votaciones transcritas, con su etiqueta llana', () => {
  it('lee votaciones de verdad', () => {
    expect(votos.items.length).toBeGreaterThan(0)
  })

  it('una fila por votación publicada de la sesión, en el orden del día', () => {
    for (const id of new Set(votos.items.map((v) => v.plenoId))) {
      const deLaSesion = votos.items.filter((v) => v.plenoId === id)
      const filas = votosDeLaSesion(deLaSesion)
      expect(
        filas.map((f) => f.numero),
        id,
      ).toEqual(deLaSesion.map((v) => v.itemNumber).sort((a, b) => a - b))
      for (const f of filas) {
        const v = deLaSesion.find((x) => x.itemNumber === f.numero)!
        expect(f.titulo, v.id).toBe(v.title)
        expect(f.texto, v.id).toBe(etiquetaDelPunto(v.title).texto)
        expect(f.outcome, v.id).toBe(v.outcome)
        expect(f.retirado, v.id).toBe(Boolean(v.votesRetracted))
      }
    }
  })

  it('una votación con el reparto retirado lo dice, y alguna publicada lo tiene', () => {
    const retirada = votos.items.find((v) => v.votesRetracted)
    expect(retirada, 'alguna votación con el reparto retirado').toBeTruthy()
    const [fila] = votosDeLaSesion([retirada!])
    expect(fila.retirado).toBe(true)
  })

  it('sin votaciones, ninguna fila', () => {
    expect(votosDeLaSesion([])).toEqual([])
  })
})
