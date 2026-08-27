import { describe, it, expect } from 'vitest'
import { cotejarCompose, ESTADOS_COMPOSE, type EstadoCompose } from '../src/scraper/verified-merge'

/**
 * El invariante que `verified-rebuild.ts` ya documenta en su cabecera:
 *
 *   > generatedAt is preserved from the base
 *
 * es decir, lo publicado lleva SIEMPRE el sello del base del que se compuso.
 * Si los dos sellos no coinciden, lo publicado no es la composición del base
 * que hay en disco.
 *
 * Y el desajuste NO es un fallo. La nocturna
 * (`.github/workflows/nightly-scrape.yml`) y `scrape-all.sh` corren
 * `verify:pleno-claims -- --base-only` a propósito —«CI necesita que el fichero
 * EXISTA, no republicar»—, porque republicar un veredicto es un acto humano.
 * Lo que faltaba no era la puerta: era el AVISO de que la puerta tiene cola.
 *
 * Por eso cuatro desenlaces y no dos. Con dos, «el base avanzó y nadie ha
 * republicado» —que es lo normal y lo correcto— saldría en rojo todas las
 * noches, y una guarda que grita cuando no pasa nada es una guarda que alguien
 * apaga. Es la misma lección de `check:eficiencia-findings`.
 */
describe('cotejarCompose · el sello de lo publicado contra el de su base', () => {
  const T1 = '2026-08-18T18:44:05.129Z'
  const T2 = '2026-08-24T13:54:07.361Z' // posterior a T1

  it('coincide cuando lo publicado lleva el sello de su base', () => {
    const c = cotejarCompose({ baseGeneratedAt: T1, publicadoGeneratedAt: T1 })
    expect(c.estado).toBe<EstadoCompose>('coincide')
    expect(c.motivo).toBeNull()
  })

  it('pendiente-de-republicar cuando el base es MÁS NUEVO — aviso, no fallo', () => {
    const c = cotejarCompose({ baseGeneratedAt: T2, publicadoGeneratedAt: T1 })
    expect(c.estado).toBe<EstadoCompose>('pendiente-de-republicar')
    // El motivo tiene que nombrar la causa esperada, o quien lo lea a las 3 de
    // la mañana creerá que algo se ha roto.
    expect(c.motivo).toMatch(/base-only|republicar/i)
  })

  it('contradice cuando lo publicado es MÁS NUEVO que su base — eso es imposible', () => {
    const c = cotejarCompose({ baseGeneratedAt: T1, publicadoGeneratedAt: T2 })
    expect(c.estado).toBe<EstadoCompose>('contradice')
  })

  it('sin-base cuando el base no está — clon nuevo o CI', () => {
    const c = cotejarCompose({ baseGeneratedAt: null, publicadoGeneratedAt: T1 })
    expect(c.estado).toBe<EstadoCompose>('sin-base')
  })

  it('contradice si falta lo publicado, que es el fichero que SÍ está comiteado', () => {
    const c = cotejarCompose({ baseGeneratedAt: T1, publicadoGeneratedAt: null })
    expect(c.estado).toBe<EstadoCompose>('contradice')
  })

  it('contradice ante un sello ilegible, en vez de tragárselo como que coincide', () => {
    const c = cotejarCompose({ baseGeneratedAt: 'ayer por la tarde', publicadoGeneratedAt: T1 })
    expect(c.estado).toBe<EstadoCompose>('contradice')
  })

  /**
   * La puerta que este repositorio ya pagó dos veces: `sin-base` NO es un
   * visto bueno. Un clon recién hecho no tiene base —está gitignorado— y una
   * guarda que devuelve «coincide» ahí imprime su propio todo-en-orden sin
   * haber comprobado nada. Tiene que quedar DISTINGUIBLE de `coincide`, y por
   * eso se comprueba aquí y no sólo en el guion.
   */
  it('sin-base es un desenlace propio, jamás un alias de coincide', () => {
    const sinBase = cotejarCompose({ baseGeneratedAt: null, publicadoGeneratedAt: T1 })
    const coincide = cotejarCompose({ baseGeneratedAt: T1, publicadoGeneratedAt: T1 })
    expect(sinBase.estado).not.toBe(coincide.estado)
  })

  it('el enum se exporta, no se recita', () => {
    // Regla 1 de docs/DATA_INTEGRITY.md. Si esta prueba escribiera la lista a
    // mano, podría seguir verde mientras producción emite otra cosa.
    expect([...ESTADOS_COMPOSE].sort()).toEqual(
      ['coincide', 'contradice', 'pendiente-de-republicar', 'sin-base'].sort(),
    )
    for (const entrada of [
      { baseGeneratedAt: T1, publicadoGeneratedAt: T1 },
      { baseGeneratedAt: T2, publicadoGeneratedAt: T1 },
      { baseGeneratedAt: T1, publicadoGeneratedAt: T2 },
      { baseGeneratedAt: null, publicadoGeneratedAt: T1 },
    ]) {
      expect(ESTADOS_COMPOSE).toContain(cotejarCompose(entrada).estado)
    }
  })

  it('lleva los dos sellos consigo, para que el parte pueda imprimirlos', () => {
    const c = cotejarCompose({ baseGeneratedAt: T2, publicadoGeneratedAt: T1 })
    expect(c.baseGeneratedAt).toBe(T2)
    expect(c.publicadoGeneratedAt).toBe(T1)
  })
})
