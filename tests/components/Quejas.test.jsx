import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Quejas from '../../src/pages/Quejas'
import { installFetchMock } from '../setup/mockFetch'

function mountWith(data) {
  installFetchMock(data)
  return render(
    <MemoryRouter>
      <Quejas />
    </MemoryRouter>,
  )
}

describe('/quejas — empty state', () => {
  it('renders the Telegram CTA + pipeline explanation when no quejas exist', async () => {
    mountWith({
      '/data/quejas.json': {
        generatedAt: '2026-04-20T12:00:00Z',
        source: { platform: 'CivicPulse bot · Telegram capture', spec: 'Open311 GeoReport v2' },
        stats: { total: 0, byState: {}, byNeighborhood: {}, byCategory: {}, byConcejal: {} },
        items: [],
      },
      '/data/sindic.json': {
        generatedAt: '2026-04-20T12:00:00Z',
        source: { platform: 'Síndic de Greuges', portal: 'https://www.elsindic.com' },
        items: [],
      },
      '/data/ctbg.json': {
        generatedAt: '2026-04-20T12:00:00Z',
        source: {
          url: 'https://consejodetransparencia.es/x.xlsx',
          platform: 'CTBG',
          spec: 'XLSX oficial',
        },
        query: 'Riba-roja',
        stats: { totalEntries: 10551, matchedEntries: 0, years: [], bySentido: {} },
        matched: [],
      },
    })

    await waitFor(() => {
      expect(screen.getByText(/El canal de quejas ciudadanas ya está abierto/i)).toBeInTheDocument()
    })
    expect(screen.getAllByText(/@munigraph_bot/)[0]).toBeInTheDocument()
    // Legal-contract section mentions LPACAP — may appear in multiple cards.
    expect(screen.getAllByText(/LPACAP/).length).toBeGreaterThan(0)
  })
})

describe('/quejas — populated state', () => {
  it('renders KPI tiles + feed rows when stats.total > 0', async () => {
    mountWith({
      '/data/quejas.json': {
        generatedAt: '2026-04-20T12:00:00Z',
        source: { platform: 'CivicPulse bot · Telegram capture', spec: 'Open311 GeoReport v2' },
        stats: {
          total: 3,
          byState: { capturada: 2, resuelta: 1 },
          byNeighborhood: { 'santa-rosa': 2 },
          byCategory: { via_publica: 2, limpieza: 1 },
          byConcejal: {},
        },
        items: [
          {
            service_request_id: 'Q-ABC12301',
            status: 'capturada',
            service_code: 'via_publica',
            service_name: 'via_publica',
            description: 'Bache profundo en Av. Primera',
            requested_datetime: '2026-04-20T08:30:00Z',
            updated_datetime: '2026-04-20T08:30:00Z',
            lat: null,
            long: null,
            address_string: 'santa-rosa',
            apoyos: 3,
            concejalia_area: 'Obra Pública',
            concejal_slug: 'teresa-pozuelo-martin',
            registro_entry_number: null,
            registered_at: null,
          },
        ],
      },
      '/data/sindic.json': {
        generatedAt: '2026-04-20T00:00:00Z',
        source: { platform: 'S', portal: 'https://www.elsindic.com' },
        items: [],
      },
      '/data/ctbg.json': {
        generatedAt: '2026-04-20T00:00:00Z',
        source: { url: 'x', platform: 'p', spec: 's' },
        query: 'Riba-roja',
        stats: { totalEntries: 10, matchedEntries: 0, years: [], bySentido: {} },
        matched: [],
      },
      '/data/geo.json': { boundary: { polygon: [] }, neighborhoods: [] },
    })

    await waitFor(() => {
      expect(screen.getByText('Q-ABC12301')).toBeInTheDocument()
    })
    expect(screen.getByText(/Bache profundo/i)).toBeInTheDocument()
    // KPI tiles: Total quejas = 3, Resueltas = 1
    expect(screen.getByText(/Total quejas/i)).toBeInTheDocument()
  })
})

describe('/quejas — CtbgCard factual zero message', () => {
  it('surfaces the honest "0 matches" state', async () => {
    mountWith({
      '/data/quejas.json': {
        generatedAt: '2026-04-20T12:00:00Z',
        source: {},
        stats: { total: 0, byState: {}, byNeighborhood: {}, byCategory: {}, byConcejal: {} },
        items: [],
      },
      '/data/sindic.json': {
        generatedAt: '2026-04-20T00:00:00Z',
        source: { platform: 'S', portal: 'https://www.elsindic.com' },
        items: [],
      },
      '/data/ctbg.json': {
        generatedAt: '2026-04-20T00:00:00Z',
        source: { url: 'x', platform: 'CTBG', spec: 'XLSX' },
        query: 'Riba-roja',
        stats: { totalEntries: 10551, matchedEntries: 0, years: [2024, 2025, 2026], bySentido: {} },
        matched: [],
      },
    })
    await waitFor(() => {
      expect(screen.getByText(/10\.551/)).toBeInTheDocument()
    })
    expect(screen.getByText(/sin resoluciones \(ámbito estatal\)/i)).toBeInTheDocument()
  })
})

/**
 * La tarjeta del Síndic, y el todo-claro que publicaba.
 *
 * Con 0 filas en el registro curado, /quejas decía «aún no hay resoluciones del
 * Síndic registradas contra el Ayuntamiento» y enlazaba a /resolucions, que da
 * 404. El registro del propio Síndic tenía 38 expedientes desde 2013.
 *
 * Estas pruebas existen porque las de arriba NO la tocaban: mockean
 * /data/sindic.json y la tarjeta lee /data/sindic-expedientes.json, así que
 * devolvía null y pasaban sin comprobar nada — verde por no ejecutarse, que es
 * el defecto que este repositorio lleva todo el mes pagando.
 */
const EXPEDIENTES = {
  generatedAt: '2026-08-24T12:00:00Z',
  source: { platform: 'Síndic de Greuges CV', buscador: 'https://www.elsindic.com/actuaciones/' },
  cobertura: {
    contraAyuntamientoDesde: 2013,
    contraAyuntamientoHasta: 2026,
    vecinosDesde: 2023,
    vecinosHasta: 2025,
  },
  contraAyuntamiento: [
    {
      expediente: '202502231',
      anio: 2025,
      materia: 'Servicios públicos y medio ambiente',
      asunto: 'Inactividad del Ayuntamiento en el deber de limpieza de un terreno.',
      administracion: 'Ayuntamiento de Riba-roja de Túria',
      resoluciones: [
        {
          tipo: 'Resolución de consideraciones a la Administración',
          fecha: '2025-07-22',
          urlPdf: 'https://www.elsindic.com/resoluciones/expedientes/2025/202502231/12337532.pdf',
        },
      ],
    },
    {
      expediente: '202602608',
      anio: 2026,
      materia: 'Servicios públicos y medio ambiente',
      asunto: 'Molestias por ubicación de contenedores',
      administracion: 'Ayuntamiento de Riba-roja de Túria',
      resoluciones: [],
    },
  ],
  vecinosOtrasAdministraciones: [
    {
      expediente: '202402468',
      anio: 2024,
      materia: 'Sanidad',
      asunto: 'Lista de espera',
      administracion: 'Conselleria de Sanidad',
      resoluciones: [],
    },
  ],
  stats: {
    contraAyuntamiento: 2,
    conResolucionPublicada: 1,
    porTipoResolucion: { 'Resolución de consideraciones a la Administración': 1 },
  },
}

const SINDIC_VACIO = {
  generatedAt: '2026-04-20T12:00:00Z',
  source: { platform: 'Síndic de Greuges', portal: 'https://www.elsindic.com' },
  items: [],
}

const QUEJAS_VACIO = {
  generatedAt: '2026-08-24T12:00:00Z',
  source: { platform: 'CivicPulse bot · Telegram capture', spec: 'Open311 GeoReport v2' },
  stats: { total: 0, byState: {}, byNeighborhood: {}, byCategory: {}, byConcejal: {} },
  items: [],
}

describe('/quejas — la tarjeta del Síndic', () => {
  it('mide algo: la tarjeta se pinta cuando existe el índice', async () => {
    mountWith({
      '/data/quejas.json': QUEJAS_VACIO,
      '/data/sindic.json': SINDIC_VACIO,
      '/data/sindic-expedientes.json': EXPEDIENTES,
    })
    await waitFor(() => {
      expect(screen.getByText(/Expedientes del Síndic sobre Riba-roja/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Expte 202502231/)).toBeInTheDocument()
  })

  it('dice cuántos expedientes registra el Síndic, derivado del snapshot', async () => {
    mountWith({
      '/data/quejas.json': QUEJAS_VACIO,
      '/data/sindic.json': SINDIC_VACIO,
      '/data/sindic-expedientes.json': EXPEDIENTES,
    })
    await waitFor(() => expect(screen.getByText('2 expedientes')).toBeInTheDocument())
    // El rango y el recuento de resoluciones salen de cobertura/stats, no de
    // una frase escrita a mano que se quedaría rancia al mover el dato.
    expect(screen.getByText(/entre 2013 y 2026/)).toBeInTheDocument()
    expect(screen.getByText(/1 con resolución publicada/)).toBeInTheDocument()
    // Aparece dos veces a propósito: en la frase de cabecera y como título de
    // la resolución enlazada.
    expect(screen.getAllByText(/consideraciones a la Administración/).length).toBeGreaterThan(1)
  })

  it('NO publica el todo-claro que publicaba antes', async () => {
    // La regresión concreta: con el registro curado a 0, la tarjeta afirmaba
    // que no había resoluciones contra el Ayuntamiento. Las hay.
    mountWith({
      '/data/quejas.json': QUEJAS_VACIO,
      '/data/sindic.json': SINDIC_VACIO,
      '/data/sindic-expedientes.json': EXPEDIENTES,
    })
    await waitFor(() => {
      expect(screen.getByText(/Expedientes del Síndic sobre Riba-roja/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Aún no hay resoluciones del Síndic/i)).not.toBeInTheDocument()
    // Y el enlace roto que la acompañaba.
    const rotos = screen
      .getAllByRole('link')
      .filter((a) => /elsindic\.com\/resolucions$/.test(a.getAttribute('href') || ''))
    expect(rotos).toEqual([])
  })

  it('separa las dos listas y avisa de que no se suman', async () => {
    mountWith({
      '/data/quejas.json': QUEJAS_VACIO,
      '/data/sindic.json': SINDIC_VACIO,
      '/data/sindic-expedientes.json': EXPEDIENTES,
    })
    await waitFor(() => {
      expect(screen.getByText(/vecinos de Riba-roja ante otras administraciones/i)).toBeVisible()
    })
    expect(screen.getByText(/No se suman con los de arriba/i)).toBeInTheDocument()
    expect(screen.getByText(/desde 2023/)).toBeInTheDocument()
  })

  it('distingue lo que el Síndic registra de lo que hemos firmado', async () => {
    mountWith({
      '/data/quejas.json': QUEJAS_VACIO,
      '/data/sindic.json': SINDIC_VACIO,
      '/data/sindic-expedientes.json': EXPEDIENTES,
    })
    await waitFor(() => {
      expect(screen.getByText(/No hemos firmado todavía ninguna ficha propia/i)).toBeInTheDocument()
    })
  })

  it('y cuando SÍ hay ficha firmada, lo dice en vez de repetir el cero', async () => {
    mountWith({
      '/data/quejas.json': QUEJAS_VACIO,
      '/data/sindic.json': { ...SINDIC_VACIO, items: [{ id: 'sindic-202502231-12337532' }] },
      '/data/sindic-expedientes.json': EXPEDIENTES,
    })
    await waitFor(() => {
      expect(screen.getByText(/tiene ficha firmada/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/No hemos firmado todavía/i)).not.toBeInTheDocument()
  })
})
