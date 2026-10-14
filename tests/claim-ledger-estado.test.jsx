import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClaimLedger } from '../src/components/ClaimLedger'
import { snippetDeEvidencia } from '../src/lib/crosschecked-status.js'

/**
 * La tarjeta de `ClaimLedger` no imprime la cola «· estado: <palabra>».
 *
 * `claim-verifier.ts` añade `· estado: ${status}` a cada fragmento de contrato
 * que escribe, y el estado es la palabra cruda del registro, en inglés
 * —«formalized», «awarded», «revoked»— o el centinela «unknown», que significa
 * «no se sabe» y no un estado. /hallazgos ya lo quitaba con
 * `snippetDeEvidencia` (src/lib/crosschecked-status.js); las tarjetas de
 * /departamentos/:slug y de la pestaña de declaraciones de /plenos/:id lo
 * imprimían tal cual. Lo vio una revisión lectora el 2026-10-12.
 *
 * Se lee de los trozos servidos, no de una forma copiada: una forma recortada
 * es cómo una prueba sigue verde mientras la página real hace otra cosa.
 */

const DIR = join(process.cwd(), 'public/data/pleno-claims')
const CRUDO = /estado:\s*[a-z_]+/i

const conEstado = readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .flatMap((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')).items ?? [])
  .filter((it) => (it?.verification?.evidence ?? []).some((e) => /estado:/i.test(e?.snippet ?? '')))

describe('ClaimLedger — sin la palabra de estado cruda en la evidencia', () => {
  it('ninguna tarjeta servida imprime «estado: <palabra>» — y había filas que lo llevaban', () => {
    // Control positivo: el defecto está en los datos servidos.
    expect(conEstado.length).toBeGreaterThan(0)

    let pintadas = 0
    for (const it of conEstado) {
      const { container } = render(
        <MemoryRouter>
          <ClaimLedger items={[it]} />
        </MemoryRouter>,
      )
      const texto = container.textContent ?? ''
      const cabezas = it.verification.evidence
        .filter((e) => /estado:/i.test(e?.snippet ?? ''))
        .map((e) => snippetDeEvidencia(e))
      // Cuenta sólo las tarjetas que de verdad pintan el fragmento: una que la
      // compuerta oculta o cuya evidencia se descarta no prueba nada.
      if (cabezas.some((c) => c && texto.includes(c))) pintadas++
      expect(texto, it.claim.id).not.toMatch(CRUDO)
      cleanup()
    }
    // Y al menos una tarjeta pintó el fragmento sin su cola: la aserción de
    // arriba evaluó algo.
    expect(pintadas).toBeGreaterThan(0)
  })
})
