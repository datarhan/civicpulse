import { describe, it, expect } from 'vitest'
import { compararPublicado, resumirPublicado } from '../src/scraper/publicado'

/**
 * ¿Lee el lector lo que el repositorio cree haber publicado?
 *
 * Todo lo que mide frescura aquí mide el REPOSITORIO: `check:cadence` lee
 * `public/data` del disco, y `monitor:health` mira el `newestItemAt` del mismo
 * fichero local. Ninguno abre el sitio. Mientras el despliegue no falle eso da
 * igual, porque las dos cosas son la misma; el 8-09-2026 dejaron de serlo.
 *
 * Esa noche el raspado fue verde, los datos se comitearon —`press.json` con
 * titulares del día 8— y el despliegue NO corrió, porque la puerta de salud
 * mira `npm test` y una prueba se pasó de reloj por 463 ms. Resultado: el
 * repositorio con noticias de hoy y la portada con las de hace cuatro días,
 * las dos cosas a la vez, y ninguna guarda mirando el hueco entre ellas.
 *
 * El umbral de prensa de `monitor:health` es `expectDays: 5`. La portada llevaba
 * CUATRO. Ni siquiera estaba a punto de saltar.
 *
 * Cuatro desenlaces, y ninguno se pliega dentro de otro: «no se pudo leer» no
 * es «coincide», que es la regla 2 de DATA_INTEGRITY y el defecto
 * `r?.findings ?? []` otra vez.
 */
const REPO = { generatedAt: '2026-09-08T20:38:22.311Z' }
const VIEJO = { generatedAt: '2026-09-06T08:49:18.182Z' }

describe('compararPublicado', () => {
  it('coincide cuando el sitio sirve el mismo sello que el repositorio', () => {
    const r = compararPublicado('press.json', REPO, REPO)
    expect(r.desenlace).toBe('coincide')
  })

  // El caso real del 8-09-2026: los datos estaban en main y el lector no los veía.
  it('marca sitio-por-detras cuando el despliegue no llegó a correr', () => {
    const r = compararPublicado('press.json', REPO, VIEJO)
    expect(r.desenlace).toBe('sitio-por-detras')
    expect(r.atrasoMinutos).toBeGreaterThan(60 * 24 * 2)
  })

  // Un despliegue tarda un par de minutos: eso no es un defecto, es la cola.
  it('tolera el hueco de un despliegue en vuelo', () => {
    const hace5min = {
      generatedAt: new Date(Date.parse(REPO.generatedAt) - 5 * 60_000).toISOString(),
    }
    const r = compararPublicado('press.json', REPO, hace5min, { toleranciaMinutos: 120 })
    expect(r.desenlace).toBe('coincide')
  })

  // Un worktree viejo no es un fallo del sitio, y confundirlos manda a arreglar
  // lo que no está roto.
  it('distingue el repositorio atrasado del sitio atrasado', () => {
    const r = compararPublicado('press.json', VIEJO, REPO)
    expect(r.desenlace).toBe('repo-por-detras')
  })

  it('no llama coincidencia a lo que no pudo leer', () => {
    expect(compararPublicado('press.json', REPO, null).desenlace).toBe('ilegible')
    expect(compararPublicado('press.json', null, REPO).desenlace).toBe('ilegible')
    expect(compararPublicado('press.json', REPO, { generatedAt: 'no-es-fecha' }).desenlace).toBe(
      'ilegible',
    )
    expect(compararPublicado('press.json', REPO, {}).desenlace).toBe('ilegible')
  })
})

describe('resumirPublicado', () => {
  it('sólo el sitio atrasado bloquea; un repo atrasado o ilegible avisa', () => {
    const atrasado = compararPublicado('press.json', REPO, VIEJO)
    const repoViejo = compararPublicado('budget.json', VIEJO, REPO)
    const ilegible = compararPublicado('boe.json', REPO, null)

    expect(resumirPublicado([atrasado]).bloquea).toBe(true)
    expect(resumirPublicado([repoViejo, ilegible]).bloquea).toBe(false)
  })

  // Sin nada comparado no hay «todo bien» que dar: un resumen que sale verde
  // con cero filas es la puerta que se firma su propio visto bueno.
  it('no da por bueno un barrido que no comparó nada', () => {
    const vacio = resumirPublicado([])
    expect(vacio.comparados).toBe(0)
    expect(vacio.concluyente).toBe(false)
  })

  it('cuenta cada desenlace por separado', () => {
    const filas = [
      compararPublicado('press.json', REPO, VIEJO),
      compararPublicado('budget.json', REPO, REPO),
      compararPublicado('boe.json', REPO, null),
    ]
    const r = resumirPublicado(filas)
    expect(r.comparados).toBe(3)
    expect(r.porDesenlace['sitio-por-detras']).toBe(1)
    expect(r.porDesenlace.coincide).toBe(1)
    expect(r.porDesenlace.ilegible).toBe(1)
    expect(r.concluyente).toBe(true)
  })
})
