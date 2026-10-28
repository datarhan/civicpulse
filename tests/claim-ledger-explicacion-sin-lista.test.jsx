import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import { ClaimLedger } from '../src/components/ClaimLedger'
import {
  CLAVE_RESUMEN_SIN_LISTA,
  explicacionSinLista,
  resumenSegunFuentes,
} from '../src/lib/claim-provenance.js'
import { ROTULO_RESUMEN_RETIRADO, resumenPublicable } from '../src/lib/resumenes-retirados.js'
import { esResumenCasi, esResumenSinRegistro } from '../src/scraper/claim-verdicts'
import { CATALOGUE } from '../src/i18n'

/**
 * La explicación de una retractación del motor habla de una lista que el lector
 * no ve, y la tarjeta deja de imprimirla.
 *
 * El motor juzga una declaración contra los candidatos de una lista corta y su
 * razonamiento es la explicación que se guarda. Una retractación no lleva filas
 * de evidencia, y la tarjeta dice debajo «Fuentes comprobadas: no constan»; pero
 * la explicación seguía contando qué había en esa lista —«los contratos listados
 * tienen montos significativamente inferiores», «ninguno de los candidatos trata
 * de un centro de salud»—, y el lector no tenía cómo comprobarlo.
 *
 * Tampoco nosotros: la lista no se guardó. Medido el 27-10-2026 sobre las 465 que
 * nombran «candidatos» o «listados», 452 eran de la pasada del 02-08-2026, cuya
 * clave de caché sólo lleva el id de la declaración. Y donde se pudo cotejar con
 * el registro que el verificador determinista emparejaba con la misma
 * declaración, tres lo contradecían: c8kr44-148-cit-2fadb2 decía que ningún
 * candidato trataba de obras en la plaza de la Estación, y el registro era la
 * reurbanización de esa plaza. Antes, rmtyr-033-afi-219148 decía «montos
 * significativamente inferiores» a 25.000 € con uno de 24.975 € (#461).
 *
 * La regla va por la forma, no por las palabras: un `sin-datos` del motor, sin
 * filas de evidencia, sin pasada de una persona y sin explicación firmada. Una
 * expresión regular sobre el texto habría dejado fuera el singular —«Ningún
 * candidato respalda…»—, como dejó fuera 34 de las 101 charlas de
 * resumenes-retirados.js. Es una retirada (nivel A): no escribe otra explicación
 * del motor, dice por qué no la imprime, y el texto sigue en el overlay.
 */

const TROZOS = join(__dirname, '..', 'public/data/pleno-claims')
const servidas = readdirSync(TROZOS)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .flatMap((f) => JSON.parse(readFileSync(join(TROZOS, f), 'utf8')).items)
const porId = new Map(servidas.map((it) => [it.claim.id, it]))

const SIN_LISTA = CATALOGUE.es[CLAVE_RESUMEN_SIN_LISTA]
const SIN_LISTA_VA = CATALOGUE.ca[CLAVE_RESUMEN_SIN_LISTA]

/**
 * Una que cuenta la lista: «Los cuatro son expedientes de contratación…». No es
 * ninguna de las tres que se firmaron después (c8kr44-148, c8kr44-123,
 * qz6weg-249): firmadas, ya no caen en la regla.
 */
const SIN_FIRMA = '19gax3o-067-cit-dcdcf6'
/**
 * Del motor por la pasada, pero su resumen es el texto fijo del verificador
 * determinista, «No se encontró registro en tenders / BDNS / presupuesto…»: no
 * lo escribió el modelo y la tarjeta ya lo re-deriva (`resumenSegunFuentes`).
 * Eran 25 el 28-10-2026.
 */
const DE_PLANTILLA = '19gax3o-030-afi-8eff52'
/** El texto fijo del verificador determinista, no el del modelo. */
const esTextoFijo = (s) => esResumenSinRegistro(s) || esResumenCasi(s)
/** La explicación que una persona reescribió y firmó (#461). */
const FIRMADA = 'rmtyr-033-afi-219148'
/** Retirada por charla de la tarea: su propio aviso manda. */
const RETIRADA = 'c8kr44-089-cit-712906'
/** Una rebaja de curador: la explicación es de quien la decidió. */
const DE_CURADOR = '15000go-096-cit-e013c8'

const fila = (id) => {
  const it = porId.get(id)
  expect(it, `${id} no se sirve`).toBeDefined()
  return it
}

function pintar(it) {
  // La tarjeta pide tenders.json para el puente de importes; aquí no se mide.
  installFetchMock({})
  return render(
    <MemoryRouter>
      <ClaimLedger items={[it]} />
    </MemoryRouter>,
  )
}

describe('explicacionSinLista', () => {
  const motor = {
    claimId: 'x',
    verdict: 'sin-datos',
    summary: 'Ningún candidato respalda la afirmación.',
    evidence: [],
    checkedAgainst: [],
    derivedBy: ['verdict-engine'],
    source: 'verdict-engine',
  }

  it('una retractación del motor sin evidencia y sin firma', () => {
    expect(explicacionSinLista(motor)).toBe(true)
    // La forma vieja: la pasada sólo en `checkedAgainst`.
    expect(explicacionSinLista({ verdict: 'sin-datos', checkedAgainst: ['verdict-engine'] })).toBe(
      true,
    )
  })

  it('una firma que no nombra a una persona no es una firma', () => {
    expect(explicacionSinLista({ ...motor, reasonSignedBy: 'ai-gold-review' })).toBe(true)
  })

  it.each([
    ['firmada por una persona', { ...motor, reasonSignedBy: 'Sergei Lutchenko' }],
    [
      'con filas de evidencia',
      { ...motor, evidence: [{ kind: 'tender', ref: 'r', snippet: 's' }] },
    ],
    ['que no es sin-datos', { ...motor, verdict: 'parcial' }],
    [
      'una rebaja de curador sobre la del motor',
      { ...motor, source: 'curator-downgrade', checkedAgainst: ['curator-downgrade'] },
    ],
    ['del verificador determinista', { verdict: 'sin-datos', checkedAgainst: ['tenders'] }],
    ['de la segunda pasada LLM', { ...motor, source: 'llm', derivedBy: [] }],
    [
      'con el texto fijo del verificador determinista',
      {
        ...motor,
        summary:
          'No se encontró registro en tenders / BDNS / presupuesto. El claim puede ser cierto pero no está atestiguado por los datos abiertos publicados.',
      },
    ],
    ['sin verificación', null],
  ])('no: %s', (_, v) => {
    expect(explicacionSinLista(v)).toBe(false)
  })
})

describe('lo servido', () => {
  const delMotor = servidas.filter((it) => it.verification.source === 'verdict-engine')

  it('mide algo: hay retractaciones del motor sin firma, y firmadas', () => {
    expect(delMotor.some((it) => explicacionSinLista(it.verification))).toBe(true)
    expect(delMotor.some((it) => it.verification.reasonSignedBy)).toBe(true)
  })

  it('ninguna con el texto fijo del verificador cae en la regla, y hay de ésas', () => {
    const fijas = delMotor.filter((it) => esTextoFijo(it.verification.summary))
    expect(fijas.length).toBeGreaterThan(0)
    expect(
      fijas.filter((it) => explicacionSinLista(it.verification)).map((it) => it.claim.id),
    ).toEqual([])
  })

  it('toda retractación del motor sin firma cae en la regla; las firmadas, no', () => {
    const fuera = delMotor
      .filter(
        (it) =>
          !it.verification.reasonSignedBy &&
          !esTextoFijo(it.verification.summary) &&
          !explicacionSinLista(it.verification),
      )
      .map((it) => it.claim.id)
    expect(fuera.slice(0, 5), `${fuera.length} sin firma fuera de la regla`).toEqual([])
    const firmadasDentro = delMotor
      .filter((it) => it.verification.reasonSignedBy && explicacionSinLista(it.verification))
      .map((it) => it.claim.id)
    expect(firmadasDentro).toEqual([])
  })
})

describe('la tarjeta', () => {
  it('sin firma: dice por qué no imprime la explicación, y no la imprime', () => {
    const it = fila(SIN_FIRMA)
    expect(explicacionSinLista(it.verification)).toBe(true)
    const { container } = pintar(it)
    expect(container.textContent).toContain(SIN_LISTA)
    expect(container.textContent).not.toContain(it.verification.summary.slice(0, 60))
    // El veredicto y la línea de fuentes no cambian: lo que se retira es la explicación.
    expect(container.textContent).toContain('Sin datos')
    expect(container.textContent).toContain('Fuentes comprobadas: no constan')
  })

  it('firmada por una persona: imprime su explicación y quién la firmó', () => {
    const it = fila(FIRMADA)
    const { container } = pintar(it)
    expect(container.textContent).toContain(it.verification.summary)
    expect(container.textContent).toContain('explicación firmada por Sergei Lutchenko')
    expect(container.textContent).not.toContain(SIN_LISTA)
  })

  it('retirada por charla: manda su propio aviso', () => {
    const it = fila(RETIRADA)
    expect(resumenPublicable(it.verification)).toBeNull()
    const { container } = pintar(it)
    expect(container.textContent).toContain(ROTULO_RESUMEN_RETIRADO)
    expect(container.textContent).not.toContain(SIN_LISTA)
  })

  it('una rebaja de curador sigue con la explicación de quien la decidió', () => {
    const it = fila(DE_CURADOR)
    const { container } = pintar(it)
    expect(container.textContent).toContain(it.verification.summary)
    expect(container.textContent).not.toContain(SIN_LISTA)
  })

  it('el texto fijo del verificador sigue re-derivado, sin el aviso', () => {
    const it = fila(DE_PLANTILLA)
    const { container } = pintar(it)
    const rederivado = resumenSegunFuentes(
      it.verification,
      resumenPublicable(it.verification),
      it.claim.verbatim,
    )
    expect(rederivado).toBeTruthy()
    expect(container.textContent).toContain(rederivado)
    expect(container.textContent).not.toContain(SIN_LISTA)
  })

  it('el aviso tiene su traducción y no la confunde con la de la charla', () => {
    expect(SIN_LISTA).toBeTruthy()
    expect(SIN_LISTA_VA).toBeTruthy()
    expect(SIN_LISTA_VA).not.toBe(SIN_LISTA)
    expect(SIN_LISTA).not.toBe(ROTULO_RESUMEN_RETIRADO)
  })
})
