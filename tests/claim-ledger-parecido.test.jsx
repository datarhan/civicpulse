import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import { ClaimLedger } from '../src/components/ClaimLedger'
import { gateForDisplay } from '../src/lib/claim-ledger'
import { evidenciaSegunFuentes, rotuloDeParecido } from '../src/lib/claim-provenance.js'

/**
 * La puntuación de parecido de una fila de evidencia no se lee como grado de
 * confirmación.
 *
 * La tarjeta de /plenos/:id y /departamentos/:slug imprimía, al final de cada
 * fila, «sim 1.00» y nada más. El número es lo que el verificador midió entre
 * la fila y lo citado —solapamiento de palabras del objeto con el título del
 * expediente y, cuando las hay, cercanía de cifras (claim-verifier.ts)—; un
 * 1,00 dice que la fila trata de lo mismo, no que confirme lo dicho. Pero junto
 * a la pastilla «Parcial» se leía como una contradicción: coincidencia perfecta
 * y, aun así, sólo parcial. La revisión lectora lo señaló el 11-10-2026 en
 * /departamentos/urbanismo, sobre la calle Joan Martorell (19gax3o-034-cit-8174e3)
 * y Santa Rosa II (rx4hb4-009-cit-44807a): las dos «Parcial» del verificador
 * determinista, por el camino que sólo compara títulos y que nunca funda un
 * «Verificado».
 *
 * El dato es cierto y no se toca; lo que cambia es el rótulo: dice qué mide y
 * qué no mide, en la propia fila, que es donde se lee.
 */

const TROZOS = join(__dirname, '..', 'public/data/pleno-claims')
const servidas = readdirSync(TROZOS)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .flatMap((f) => JSON.parse(readFileSync(join(TROZOS, f), 'utf8')).items)

const visibles = gateForDisplay(servidas)
const conParecido = visibles.filter((it) =>
  evidenciaSegunFuentes(it.verification).some((e) => typeof e.similarity === 'number'),
)

function pintar(it) {
  // El puente de importes pide tenders.json; aquí no se mide: un 404 lo calla.
  installFetchMock({})
  return render(
    <MemoryRouter>
      <ClaimLedger items={[it]} />
    </MemoryRouter>,
  )
}

describe('rotuloDeParecido', () => {
  it('dice qué mide y que no es confirmación, con coma decimal', () => {
    expect(rotuloDeParecido(1)).toBe('parecido con lo citado 1,00 · no mide si lo confirma')
    expect(rotuloDeParecido(0.375)).toBe('parecido con lo citado 0,38 · no mide si lo confirma')
  })

  it('sin número no hay rótulo', () => {
    expect(rotuloDeParecido(undefined)).toBeNull()
    expect(rotuloDeParecido(null)).toBeNull()
    expect(rotuloDeParecido(Number.NaN)).toBeNull()
  })
})

describe('la tarjeta', () => {
  it('ninguna fila servida imprime un «sim» suelto', () => {
    // Lo positivo primero: sin filas con parecido, la guarda pasaría sin mirar.
    expect(conParecido.length).toBeGreaterThan(0)
    const sueltas = []
    for (const it of conParecido) {
      const { container, unmount } = pintar(it)
      if (/\bsim \d/.test(container.textContent)) sueltas.push(it.claim.id)
      unmount()
    }
    expect(sueltas).toEqual([])
  })

  it('una «Parcial» con parecido 1 dice que el parecido no la confirma', () => {
    // La servida si sigue habiéndola; si una re-verificación la mueve, la
    // misma forma sobre otra fila servida, para que la prueba no dependa de
    // que el dato siga diciendo lo mismo.
    const base =
      conParecido.find(
        (it) =>
          it.verification.verdict === 'parcial' &&
          evidenciaSegunFuentes(it.verification).some((e) => e.similarity === 1),
      ) ?? conParecido[0]
    const parcialPerfecta = {
      ...base,
      verification: {
        ...base.verification,
        verdict: 'parcial',
        evidence: base.verification.evidence.map((e) =>
          typeof e.similarity === 'number' ? { ...e, similarity: 1 } : e,
        ),
      },
    }
    const { container } = pintar(parcialPerfecta)
    expect(container.textContent).toContain('Parcial')
    expect(container.textContent).toContain('parecido con lo citado 1,00 · no mide si lo confirma')
  })
})
