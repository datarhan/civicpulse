import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  ROTULO_NEUTRO,
  TIPO_NEUTRO,
  rotuloDeTipo,
  tipoAMostrar,
} from '../src/lib/claim-type-label.js'
import { CLAIM_TYPE_LABEL } from '../src/hooks/usePlenoClaims.js'

/**
 * El tipo que rotula una tarjeta no puede prometer lo que la cita no trae.
 *
 * La revisión lectora del 11-10-2026 señaló dos en /plenos/k4olcs: «Afirmación
 * numérica» encima de una lista de departamentos, y «Convenio citado» encima
 * de «esta carta es una rendición de cuentas…». El prompt define el primero
 * como «cifra citada como hecho» y el segundo como «subvención, convenio,
 * fondo europeo»; el extractor los usa además de cajón de sastre. Medido ese
 * día sobre los trozos servidos: ~385 de 2.167 «numéricas» sin una cifra en el
 * literal y 298 de 620 «convenios» sin nombrar convenio, ayuda ni fondo.
 *
 * El rótulo se DERIVA del literal y sólo puede bajar a uno neutro: una cifra
 * que el detector no ve deja la tarjeta en «Afirmación», que no afirma nada de
 * más. El tipo del dato no se toca — lo siguen leyendo el verificador y los
 * recuentos de /cobertura, que hablan del extractor.
 */
const TROZOS = 'public/data/pleno-claims'
type Item = {
  claim: { id: string; type: string; verbatim: string; entities?: Record<string, unknown> }
}
const servidos: Item[] = readdirSync(TROZOS)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .flatMap((f) => JSON.parse(readFileSync(join(TROZOS, f), 'utf8')).items)
const porId = (id: string) => servidos.find((it) => it.claim.id === id)!.claim

const c = (type: string, verbatim: string, entities: object = {}) =>
  ({ type, verbatim, entities }) as never

describe('los dos señalamientos de /plenos/k4olcs, tal como se sirven', () => {
  it('la lista de departamentos deja de rotularse «Afirmación numérica»', () => {
    const claim = porId('k4olcs-010-afi-d79ef3')
    expect(claim.type).toBe('afirmacion_numerica') // la premisa: el dato no cambia
    expect(tipoAMostrar(claim)).toBe(TIPO_NEUTRO)
    expect(rotuloDeTipo(claim)).toEqual({ texto: ROTULO_NEUTRO, tono: 'neutral' })
  })

  it('«esta carta es una rendición de cuentas…» deja de rotularse «Convenio citado»', () => {
    const claim = porId('k4olcs-013-cit-3334d5')
    expect(claim.type).toBe('cita_convenio')
    expect(tipoAMostrar(claim)).toBe(TIPO_NEUTRO)
  })
})

describe('afirmacion_numerica: el rótulo se queda si hay cifra', () => {
  it.each([
    ['hemos asignado 46 millones al presupuesto'],
    ['el paro bajó un doce por ciento'],
    ['entenc que falten cinc dies per a presentar-ho'],
    ['son doscientas viviendas'],
    ['la mitad del presupuesto se va en personal'],
    ['el 12% de las familias'],
    ['han costat dos-cents mil euros'],
  ])('«%s»', (verbatim) => {
    expect(tipoAMostrar(c('afirmacion_numerica', verbatim))).toBe('afirmacion_numerica')
  })

  it('la cifra que el extractor sacó a `entities` cuenta aunque el literal la escriba en letra rara', () => {
    expect(
      tipoAMostrar(c('afirmacion_numerica', 'lo que costó aquello', { amountEuros: 9000 })),
    ).toBe('afirmacion_numerica')
    expect(tipoAMostrar(c('afirmacion_numerica', 'tantos como el año pasado', { count: 40 }))).toBe(
      'afirmacion_numerica',
    )
  })

  it('«un contrato» no es una cifra: el artículo no cuenta', () => {
    expect(tipoAMostrar(c('afirmacion_numerica', 'yo todavía no he firmado un contrato'))).toBe(
      TIPO_NEUTRO,
    )
  })
})

describe('cita_convenio: el rótulo se queda si nombra convenio, ayuda o fondo', () => {
  it.each([
    ['firmamos convenio con la Generalitat', ''],
    ['recibimos los fondos europeos', ''],
    ['nos han desestimado en esta convocatoria', 'convocatoria casa 47'],
    ['la ayuda llegó tarde', ''],
    ["l'acord amb la Diputació", ''],
  ])('«%s»', (verbatim, ent) => {
    expect(tipoAMostrar(c('cita_convenio', verbatim, { referencedEntity: ent }))).toBe(
      'cita_convenio',
    )
  })

  it('la entidad también cuenta: «se aprobó ayer» sobre un convenio nombrado', () => {
    expect(
      tipoAMostrar(
        c('cita_convenio', 'se aprobó ayer', { referencedEntity: 'convenio de limpieza' }),
      ),
    ).toBe('cita_convenio')
  })
})

describe('el resto de tipos no se toca', () => {
  it.each(['promesa', 'cita_obra', 'acusacion_publica', 'valoracion_politica'])('%s', (type) => {
    expect(tipoAMostrar(c(type, 'algo sin cifra ni convenio'))).toBe(type)
    expect(rotuloDeTipo(c(type, 'x')).texto).toBe(CLAIM_TYPE_LABEL[type])
  })
})

describe('sobre lo servido: baja una parte, no todo (techo, regla 1 de DATA_INTEGRITY)', () => {
  const de = (type: string) => servidos.filter((it) => it.claim.type === type)
  const bajadas = (type: string) => de(type).filter((it) => tipoAMostrar(it.claim) === TIPO_NEUTRO)

  it('numéricas: alguna baja, y nunca más de un tercio', () => {
    const total = de('afirmacion_numerica').length
    expect(total).toBeGreaterThan(100)
    expect(bajadas('afirmacion_numerica').length).toBeGreaterThan(0)
    expect(bajadas('afirmacion_numerica').length / total).toBeLessThan(1 / 3)
  })

  it('convenios: alguno baja, y nunca más de tres cuartos', () => {
    const total = de('cita_convenio').length
    expect(total).toBeGreaterThan(100)
    expect(bajadas('cita_convenio').length).toBeGreaterThan(0)
    expect(bajadas('cita_convenio').length / total).toBeLessThan(3 / 4)
  })
})
