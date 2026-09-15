import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import PlenoDetalle from '../../src/pages/PlenoDetalle'
import { installFetchMock } from '../setup/mockFetch'
import { peekSnapshot } from '../../src/lib/snapshot-store'
import { CATALOGUE } from '../../src/i18n'

/**
 * Una cifra junto a «Votaciones» o «Hallazgos editoriales» afirma que se midió.
 *
 * Las votaciones se transcriben a mano desde el acta, y una sesión puede no tener
 * ninguna transcrita; las declaraciones sólo existen para las sesiones cuyo audio se
 * ha extraído. En esas sesiones la pestaña decía «Votaciones 0» y la ficha del
 * resumen «Hallazgos editoriales 0»: que un pleno ordinario no votó nada, o que se
 * leyó y no se encontró nada, cuando nadie lo ha mirado todavía. La ficha de
 * votaciones de al lado ya escribía «—» y «sin transcribir», y el índice de /plenos
 * «sin transcribir» y «sin extraer»: esto pide lo mismo a las pestañas y a las otras
 * dos fichas.
 *
 * La trampa que hay que medir: `usePlenoChunk` resuelve el 404 de una sesión sin
 * extraer a un fragmento vacío, así que «hay fragmento» es verdad también cuando no
 * hay fichero. Por eso cada caso espera a que las instantáneas hayan llegado —o
 * faltado— antes de leer una cifra: leída antes, una pestaña sin cifra pasaría por el
 * motivo equivocado.
 *
 * Los datos salen de las instantáneas publicadas (una sesión real con otro id, votos,
 * hallazgos y declaraciones reales), para que la forma no sea una copia a mano.
 */

const ID = 'p1'
const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const PLENOS = lee('plenos.json')
const VOTOS = lee('pleno-votes.json')
const HALLAZGOS = lee('pleno-findings.json')
const VIDEOS = lee('pleno-videos.json')
const AGENDAS = lee('plenos-agendas.json')
const CHUNK = lee(lee('pleno-claims/index.json').plenos[0].chunkPath)
const CHUNK_URL = `/data/pleno-claims/${ID}.json`

const es = CATALOGUE.es
const VOTACIONES = es['plenoDetail.votes']
const HALLAZGOS_ROTULO = es['plenoDetail.findings']
const DECLARACIONES = es['plenoDetail.declarations']

function monta({ votos = [], hallazgos = [], chunk = null } = {}) {
  const mapa = {
    '/data/plenos.json': { ...PLENOS, items: [{ ...PLENOS.items[0], id: ID }] },
    '/data/pleno-votes.json': { ...VOTOS, items: votos.map((v) => ({ ...v, plenoId: ID })) },
    '/data/pleno-findings.json': {
      ...HALLAZGOS,
      items: hallazgos.map((f) => ({ ...f, plenoId: ID })),
    },
    '/data/pleno-videos.json': { ...VIDEOS, items: [] },
    '/data/plenos-agendas.json': { ...AGENDAS, plenos: [] },
  }
  if (chunk) mapa[CHUNK_URL] = chunk
  installFetchMock(mapa)
  render(
    <MemoryRouter initialEntries={[`/plenos/${ID}`]}>
      <Routes>
        <Route path="/plenos/:id" element={<PlenoDetalle />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** La página ha pintado la sesión y han llegado los votos, los hallazgos y el fragmento (o su 404). */
async function asentada({ conFragmento }) {
  await waitFor(() => {
    expect(screen.getAllByRole('button').some((b) => b.textContent.startsWith(VOTACIONES))).toBe(
      true,
    )
    for (const p of ['/data/pleno-votes.json', '/data/pleno-findings.json'])
      expect(peekSnapshot(p)?.status, p).toBe('ready')
    expect(peekSnapshot(CHUNK_URL)?.status, CHUNK_URL).toBe(conFragmento ? 'ready' : 'missing')
  })
  // El aviso del almacén vuelve a pintar la página; se deja terminar antes de leer.
  await act(async () => {})
}

function pestaña(rotulo) {
  const botones = screen.getAllByRole('button').filter((b) => b.textContent.startsWith(rotulo))
  expect(botones, `pestañas «${rotulo}»`).toHaveLength(1)
  return botones[0]
}

/** Lo que la pestaña pinta después del rótulo: '' si no lleva cifra. */
const cifraDe = (rotulo) => pestaña(rotulo).textContent.slice(rotulo.length).trim()

/** La ficha del resumen con ese rótulo: su valor y su nota. */
function ficha(rotulo) {
  const rotulos = screen
    .getAllByText(rotulo, { selector: 'div' })
    .filter((d) => d.nextElementSibling?.classList.contains('mono'))
  expect(rotulos, `fichas «${rotulo}»`).toHaveLength(1)
  const valor = rotulos[0].nextElementSibling
  return { valor: valor.textContent, nota: valor.nextElementSibling?.textContent ?? null }
}

describe('las pestañas y las fichas de /plenos/:id no dicen 0 de lo que nadie ha medido', () => {
  it('mide algo: las instantáneas traen votos, hallazgos y declaraciones con que montar los controles', () => {
    expect(VOTOS.items.length).toBeGreaterThanOrEqual(2)
    expect(HALLAZGOS.items.length).toBeGreaterThan(0)
    expect(CHUNK.items.length).toBeGreaterThan(0)
  })

  it('sin votaciones transcritas, la pestaña Votaciones no lleva cifra', async () => {
    monta()
    await asentada({ conFragmento: false })
    expect(cifraDe(VOTACIONES)).toBe('')
    expect(ficha(VOTACIONES)).toEqual({ valor: '—', nota: es['plenoDetail.votesPending'] })
  })

  it('con dos votaciones transcritas, dice 2 (el control)', async () => {
    monta({ votos: VOTOS.items.slice(0, 2) })
    await asentada({ conFragmento: false })
    expect(cifraDe(VOTACIONES)).toBe('2')
  })

  it('sin declaraciones extraídas, ni la pestaña de hallazgos ni las fichas dicen 0', async () => {
    monta()
    await asentada({ conFragmento: false })
    expect(cifraDe(HALLAZGOS_ROTULO)).toBe('')
    const sinExtraer = { valor: '—', nota: es['plenoDetail.extractionPending'] }
    expect(ficha(HALLAZGOS_ROTULO)).toEqual(sinExtraer)
    expect(ficha(DECLARACIONES)).toEqual(sinExtraer)
  })

  it('con declaraciones extraídas y ningún hallazgo, dicen 0: ese cero sí se ha medido (el control)', async () => {
    monta({ chunk: CHUNK })
    await asentada({ conFragmento: true })
    expect(cifraDe(HALLAZGOS_ROTULO)).toBe('0')
    expect(ficha(HALLAZGOS_ROTULO)).toEqual({ valor: '0', nota: null })
    const declaraciones = ficha(DECLARACIONES)
    expect(declaraciones.valor).toMatch(/^\d+$/)
    expect(declaraciones.nota).toBeNull()
  })

  it('un hallazgo firmado se cuenta aunque la sesión no tenga declaraciones extraídas', async () => {
    monta({ hallazgos: HALLAZGOS.items.slice(0, 1) })
    await asentada({ conFragmento: false })
    expect(cifraDe(HALLAZGOS_ROTULO)).toBe('1')
    expect(ficha(HALLAZGOS_ROTULO)).toEqual({ valor: '1', nota: null })
  })
})
