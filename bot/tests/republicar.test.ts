import { describe, expect, it, vi } from 'vitest'
import { pedirRepublicacion } from '../src/services/republicar'
import { mensajeRetirada } from '../src/commands/olvidar'

/**
 * Al retirar una queja con /olvidar, el bot pide a GitHub que republique las quejas
 * en el momento en vez de dejarlo para la actualización diaria.
 *
 * Tres desenlaces y ninguno plegado dentro de otro. `pedida` sólo cuando GitHub
 * contesta 204, que es lo que devuelve la API al aceptar la petición: un 200 no es
 * aceptarla. Sin token no se llama a nada. Y lo que el bot le cuenta al vecino
 * depende de cuál fue: prometer «unos minutos» sin haber pedido nada sería otra vez
 * la promesa de un plazo que no se cumple.
 */

const TOKEN = 'github_pat_PRUEBA_nunca_en_un_log_0123456789'
const URL_DISPATCH =
  'https://api.github.com/repos/datarhan/civicpulse/actions/workflows/pull-quejas.yml/dispatches'

function registro() {
  const lineas: string[] = []
  return { lineas, log: (l: string) => void lineas.push(l) }
}

const responde = (status: number) =>
  vi.fn(async () => new Response(status === 204 ? null : '{}', { status }))

describe('pedirRepublicacion', () => {
  it('sin token no llama a GitHub, y lo dice', async () => {
    const fetchImpl = vi.fn()
    const { lineas, log } = registro()
    expect(await pedirRepublicacion({ token: '', fetchImpl, log })).toBe('sin-token')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(lineas.length, 'no deja rastro en el log').toBeGreaterThan(0)
  })

  it('con 204 queda pedida, con la llamada que la API espera', async () => {
    const fetchImpl = responde(204)
    expect(await pedirRepublicacion({ token: TOKEN, fetchImpl, log: () => {} })).toBe('pedida')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(URL_DISPATCH)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ ref: 'main' })
    const h = new Headers(init.headers)
    expect(h.get('accept')).toBe('application/vnd.github+json')
    expect(h.get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(h.get('x-github-api-version')).toBe('2022-11-28')
    expect(h.get('user-agent')).toMatch(/CivicPulse/)
  })

  it('el repositorio se puede cambiar, como en el aviso de eventos', async () => {
    const fetchImpl = responde(204)
    await pedirRepublicacion({ token: TOKEN, repo: 'otra/cosa', fetchImpl, log: () => {} })
    const [url] = fetchImpl.mock.calls[0] as unknown as [string]
    expect(url).toBe(
      'https://api.github.com/repos/otra/cosa/actions/workflows/pull-quejas.yml/dispatches',
    )
  })

  it.each([200, 403, 404, 422, 500])('un %i no es una petición aceptada', async (status) => {
    expect(
      await pedirRepublicacion({ token: TOKEN, fetchImpl: responde(status), log: () => {} }),
    ).toBe('fallo')
  })

  it('si la llamada lanza, es un fallo y no una excepción que tumbe /olvidar', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })
    expect(await pedirRepublicacion({ token: TOKEN, fetchImpl, log: () => {} })).toBe('fallo')
  })

  it('el token no sale en ningún renglón del log, ni cuando el error lo trae dentro', async () => {
    const { lineas, log } = registro()
    await pedirRepublicacion({ token: TOKEN, fetchImpl: responde(204), log })
    await pedirRepublicacion({ token: TOKEN, fetchImpl: responde(403), log })
    await pedirRepublicacion({
      token: TOKEN,
      fetchImpl: vi.fn(async () => {
        throw new Error(`rechazada con Bearer ${TOKEN}`)
      }),
      log,
    })
    expect(lineas.length, 'no escribió nada que comprobar').toBeGreaterThanOrEqual(3)
    for (const l of lineas) expect(l).not.toContain(TOKEN)
  })
})

describe('lo que el bot contesta al retirar una queja', () => {
  it('pedida: dice «unos minutos» y deja la actualización diaria como respaldo', () => {
    const m = mensajeRetirada('Q-ABC12345', 'pedida')
    expect(m).toContain('Q-ABC12345')
    expect(m).toContain('unos minutos')
    expect(m).toContain('diaria')
  })

  it.each(['sin-token', 'fallo'] as const)('%s: sólo promete la actualización diaria', (p) => {
    const m = mensajeRetirada('Q-ABC12345', p)
    expect(m).toContain('Q-ABC12345')
    expect(m).not.toContain('minutos')
    expect(m).toContain('siguiente actualización, que es diaria')
  })
})
