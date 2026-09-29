import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClaimLedger } from '../src/components/ClaimLedger'
import { gateForDisplay } from '../src/lib/claim-ledger'
import {
  RESUMENES_RETIRADOS,
  ROTULO_RESUMEN_RETIRADO,
  resumenPublicable,
} from '../src/lib/resumenes-retirados'

/**
 * La tarjeta de declaraciones no imprime lo que el verificador dijo de su
 * propia tarea.
 *
 * `ClaimLedger` pinta `verification.summary` bajo la cita de cada concejal en
 * /plenos/:id y /departamentos/:slug. Para las retractaciones del motor de
 * veredictos ese resumen es `reasoning.slice(0, 300)`
 * (claim-verifier-engine.ts), y en la corrida del 02-08-2026 con claude-code el
 * campo `reasoning` recogió muchas veces el parte del modelo sobre su encargo
 * y no el razonamiento: «Task completed: reasoned in Spanish about candidate
 * support…», «no aplica ningún skill de "superpowers"…», «Se solicitó razonar
 * (no emitir veredicto)…», «Análisis completado en el texto de respuesta.».
 *
 * Medido el 29-09-2026 sobre los 4.964 trozos servidos: 878 llevan resumen del
 * motor y 101 de ellos hablan de la tarea. Una expresión regular de palabras
 * clave encontraba 67 y se dejaba 34; ensanchada con «tarea», «solicit…» o
 * «respuesta», atrapaba también resúmenes de verdad («la respuesta del
 * Ayuntamiento», «esta tarea en particular»). Por eso la lista de retirados se
 * leyó a mano, y aquí la expresión es sólo una alarma: si una marca
 * inconfundible llega a imprimirse, alguien tiene que leer esa fila.
 */

const TROZOS = join(__dirname, '..', 'public/data/pleno-claims')

const servidas = readdirSync(TROZOS)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .flatMap((f) => JSON.parse(readFileSync(join(TROZOS, f), 'utf8')).items)

const porId = new Map(servidas.map((it) => [it.claim.id, it]))

/** Lo que ningún resumen sobre una declaración dice: son partes de la tarea. */
const MARCAS_DE_CHARLA =
  /superpowers|\bskills?\b|Task (completed|was)|\breasoned in Spanish\b|Provided the requested|texto de respuesta|respuesta de texto|cuerpo de la respuesta|respuesta al usuario|Se (solicitó|pidió) razona|no emitir veredicto|sin emitir (un )?veredicto|razonamiento (escéptico )?solicitado|Tarea de (fact-checking|verificación|razonamiento)/i

/** Una fila de charla que la lista retira: la que habla de «superpowers». */
const CHARLA = '10yl550-323-cit-fb13f0'
/**
 * Un resumen del motor que se queda: dice «la respuesta del Ayuntamiento», que
 * es de lo que trata la cita, no de la tarea del modelo.
 */
const EXPLICACION = '1tgd1h4-308-cit-f9bd00'

function pintar(it) {
  return render(
    <MemoryRouter>
      <ClaimLedger items={[it]} />
    </MemoryRouter>,
  )
}

describe('lo servido', () => {
  it('cada entrada de la lista señala una fila servida que todavía dice lo retirado', () => {
    const entradas = Object.entries(RESUMENES_RETIRADOS)
    expect(entradas.length).toBeGreaterThan(0)
    for (const [id, inicio] of entradas) {
      const it = porId.get(id)
      expect(it, `${id} ya no se sirve: quítalo de la lista`).toBeDefined()
      expect(
        it.verification.summary.startsWith(inicio),
        `${id} ya no empieza por «${inicio}»: si se corrigió, quítalo de la lista`,
      ).toBe(true)
    }
  })

  it('ninguna tarjeta imprime una marca de charla', () => {
    const visibles = gateForDisplay(servidas)
    const conMarca = visibles.filter((it) => MARCAS_DE_CHARLA.test(it.verification.summary ?? ''))
    // Lo positivo primero: sin filas con marca, la guarda de abajo pasaría sin
    // haber mirado nada.
    expect(visibles.length).toBeGreaterThan(0)
    expect(conMarca.length).toBeGreaterThan(0)
    const impresas = conMarca
      .filter((it) => resumenPublicable(it.verification) !== null)
      .map((it) => `${it.claim.id} · ${it.verification.summary.slice(0, 80)}`)
    expect(impresas).toEqual([])
  })
})

describe('resumenPublicable', () => {
  it('retira el texto que la lista señala', () => {
    const { verification } = porId.get(CHARLA)
    expect(resumenPublicable(verification)).toBeNull()
  })

  it('la misma fila, ya corregida, vuelve a imprimirse', () => {
    const { verification } = porId.get(CHARLA)
    const corregida = { ...verification, summary: 'Ningún contrato cotejado trata del mercado.' }
    expect(resumenPublicable(corregida)).toBe(corregida.summary)
  })

  it('una fila que la lista no nombra no se toca', () => {
    const { verification } = porId.get(EXPLICACION)
    expect(verification.summary.length).toBeGreaterThan(0)
    expect(resumenPublicable(verification)).toBe(verification.summary)
  })
})

describe('la tarjeta', () => {
  it('dice que retiró la explicación y no imprime la charla', () => {
    const it = porId.get(CHARLA)
    const { container } = pintar(it)
    expect(container.textContent).toContain(ROTULO_RESUMEN_RETIRADO)
    expect(container.textContent).not.toContain(it.verification.summary.slice(0, 60))
    expect(container.textContent).not.toMatch(MARCAS_DE_CHARLA)
  })

  it('una explicación de verdad sigue saliendo, sin el rótulo', () => {
    const it = porId.get(EXPLICACION)
    const { container } = pintar(it)
    expect(container.textContent).toContain(it.verification.summary)
    expect(container.textContent).not.toContain(ROTULO_RESUMEN_RETIRADO)
  })
})
