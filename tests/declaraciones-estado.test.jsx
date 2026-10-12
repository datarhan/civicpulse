import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import Declaraciones from '../src/pages/Declaraciones'
import { CATALOGUE } from '../src/i18n'
import { snippetWithoutStatus } from '../src/lib/crosschecked-status.js'

/**
 * La tarjeta de /declaraciones no imprime la cola «· estado: <palabra>».
 *
 * `claim-verifier.ts` añade `· estado: ${status}` a cada fragmento de contrato
 * que escribe, y el estado es la palabra cruda del registro, en inglés
 * —«formalized», «awarded», «revoked»— o el centinela «unknown», que significa
 * «no se sabe» y no un estado. /hallazgos y las tarjetas de `ClaimLedger` ya lo
 * quitan con `snippetWithoutStatus` (src/lib/crosschecked-status.js); la lista
 * de evidencias de /declaraciones lo imprimía tal cual.
 *
 * Se pinta la PÁGINA, con los trozos servidos, y no el componente de la fila:
 * la página sólo enseña las dos primeras evidencias de cada cita y descarta
 * las que `evidenciaSegunFuentes` no cuenta, y una prueba que se saltara eso
 * podría estar verde sobre filas que nadie ve.
 */

const DATA = join(__dirname, '..', 'public/data')
const leer = (p) => JSON.parse(readFileSync(join(DATA, p), 'utf8'))
const CRUDO = /estado:\s*[a-z_]+/i
const lleva = (e) => /estado:/i.test(e?.snippet ?? '')

const trozos = readdirSync(join(DATA, 'pleno-claims'))
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => ({ archivo: f, trozo: leer(join('pleno-claims', f)) }))
  .filter(({ trozo }) => (trozo.items ?? []).some((it) => it.verification?.evidence?.some(lleva)))

const conEstado = trozos.flatMap(({ trozo }) =>
  trozo.items.filter((it) => it.verification?.evidence?.some(lleva)),
)

describe('/declaraciones — sin la palabra de estado cruda en la evidencia', () => {
  it('ninguna tarjeta servida imprime «estado: <palabra>» — y había filas que lo llevaban', async () => {
    // Control positivo: el defecto está en los datos servidos.
    expect(conEstado.length).toBeGreaterThan(0)

    const mapa = {
      '/data/pleno-claims/index.json': {
        plenos: trozos.map(({ archivo, trozo }) => ({
          plenoId: trozo.plenoId,
          plenoDate: trozo.plenoDate,
          chunkPath: `pleno-claims/${archivo}`,
        })),
        totals: { items: conEstado.length },
      },
      '/data/plenos.json': { items: [] },
      '/data/tenders.json': leer('tenders.json'),
      '/data/tenders-ted.json': leer('tenders-ted.json'),
    }
    for (const { archivo, trozo } of trozos) mapa[`/data/pleno-claims/${archivo}`] = trozo
    installFetchMock(mapa)

    render(
      <MemoryRouter>
        <Declaraciones />
      </MemoryRouter>,
    )
    const buscador = await screen.findByPlaceholderText(
      CATALOGUE.es['declaraciones.search.placeholder'],
    )
    // «Todas»: el filtro por defecto esconde las «sin datos», y alguna lleva
    // evidencia con la cola.
    fireEvent.click(screen.getByText(CATALOGUE.es['declaraciones.filter.todas']))

    let pintadas = 0
    for (const it of conEstado) {
      fireEvent.change(buscador, { target: { value: it.claim.verbatim } })
      // Dos filas pueden repetir las mismas palabras —rx4hb4 las tiene en una
      // cita y en una afirmación—: se leen todas las tarjetas que la búsqueda
      // deja, que incluyen la suya.
      const tarjetas = (await screen.findAllByText(`«${it.claim.verbatim}»`)).map((n) =>
        n.closest('.cp-card'),
      )
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
      })
      const texto = tarjetas.map((c) => c?.textContent ?? '').join('\n')
      // Cuenta sólo las tarjetas que de verdad pintan el fragmento: una cuya
      // evidencia se descarta, o que queda tercera, no prueba nada.
      const cabezas = it.verification.evidence
        .filter(lleva)
        .map((e) => snippetWithoutStatus(e.snippet))
      if (cabezas.some((c) => c && texto.includes(c))) pintadas++
      expect(texto, it.claim.id).not.toMatch(CRUDO)
    }
    // Y al menos una tarjeta pintó el fragmento sin su cola: la aserción de
    // arriba evaluó algo.
    expect(pintadas).toBeGreaterThan(0)
  })
})
