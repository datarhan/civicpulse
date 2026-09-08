import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EncajeCard } from '../src/components/EncajeDeclarado'
import { installFetchMock } from './setup/mockFetch'

/**
 * El estado explícito «todavía sin revisar».
 *
 * El defecto que fija este fichero: `EncajeCard` devolvía `null` cuando alguien
 * con delegación no tenía fila firmada. Sus compañeros pintaban sus chips y esa
 * ficha no pintaba NADA, así que el silencio se leía como limpio cuando
 * significaba que no lo habíamos mirado. La asimetría quedaba al revés: al
 * revisado se le veían las costuras y al no revisado se le suponía bien.
 *
 * Hoy `check:area-fit` deja ese caso en cero —40 áreas, 40 firmas— y por eso
 * el estado se prueba con datos INYECTADOS: no hay ningún concejal real sin
 * firmar contra el que montarlo, y esperar a que lo haya sería exactamente
 * llegar tarde. Cuando la remodelación llegue antes que el curador, la ficha
 * ya lo dirá.
 */

const FIT = JSON.parse(readFileSync(resolve(__dirname, '../public/data/area-fit.json'), 'utf8'))

const SIN_CONGELAR = {
  generatedAt: '2026-09-08T00:00:00Z',
  frozenUntil: null,
  items: [],
}

/** LOREG: en ventana electoral la capa entera desaparece, y eso SÍ está firmado. */
const CONGELADO = {
  generatedAt: '2026-09-08T00:00:00Z',
  frozenUntil: '2027-05-30',
  items: [],
}

function mount(official, { promises = SIN_CONGELAR, fit = FIT } = {}) {
  installFetchMock({ '/data/area-fit.json': fit, '/data/promises.json': promises })
  return render(
    <MemoryRouter>
      <EncajeCard official={official} />
    </MemoryRouter>,
  )
}

/** Una concejala con área delegada a la que nadie ha firmado todavía. */
const RECIEN_LLEGADA = {
  slug: 'concejala-recien-llegada',
  name: 'Concejala Recién Llegada',
  portfolios: ['Movilidad'],
}

/** Alguien sin ninguna delegación: su silencio ya tenía estado propio. */
const SIN_DELEGACION = {
  slug: 'concejal-sin-delegacion',
  name: 'Concejal Sin Delegación',
  portfolios: [],
}

describe('EncajeCard — el hueco se dice, no se calla', () => {
  it('con área delegada y sin fila firmada, lo dice en voz alta', async () => {
    mount(RECIEN_LLEGADA)
    expect(await screen.findByText(/todav[ií]a sin revisar/i, {}, { timeout: 4000 })).toBeTruthy()
  })

  it('el texto habla de NOSOTROS, nunca de la persona', async () => {
    mount(RECIEN_LLEGADA)
    const nota = await screen.findByText(/el hueco es nuestro/i, {}, { timeout: 4000 })
    const texto = nota.textContent
    // Dice de quién es el hueco, y dice que no dice nada de nadie.
    expect(texto).toMatch(/no dice nada de esta persona/i)
    // Y no cuela ninguna palabra que suene a juicio sobre el cargo.
    expect(texto).not.toMatch(/no cualificad|sin formaci[óo]n|no apto|carece/i)
  })

  it('quien SÍ tiene firma no ve el aviso: el estado es para el hueco, no para todos', async () => {
    const conFirma = FIT.rows[0]
    const official = {
      slug: conFirma.officialSlug,
      name: conFirma.officialSlug,
      portfolios: [conFirma.portfolio],
    }
    mount(official)
    // Espera a que la tarjeta haya cargado de verdad antes de negar nada: un
    // «no está» sobre un componente que aún no ha pintado pasa siempre.
    await screen.findByText(/encaje declarado/i, {}, { timeout: 4000 })
    expect(screen.queryByText(/todav[ií]a sin revisar/i)).toBeNull()
  })

  it('sin delegación NO es lo mismo que sin revisar, y no se confunden', async () => {
    mount(SIN_DELEGACION)
    expect(
      await screen.findByText(/sin delegaci[óo]n de [áa]rea/i, {}, { timeout: 4000 }),
    ).toBeTruthy()
    expect(screen.queryByText(/todav[ií]a sin revisar/i)).toBeNull()
  })

  it('en congelación LOREG desaparece la capa entera, también este aviso', async () => {
    mount(RECIEN_LLEGADA, { promises: CONGELADO })
    // Ese silencio sí está decidido y firmado: no se sustituye por un estado.
    await waitFor(() => {
      expect(screen.queryByText(/todav[ií]a sin revisar/i)).toBeNull()
      expect(screen.queryByText(/encaje declarado/i)).toBeNull()
    })
  })
})
