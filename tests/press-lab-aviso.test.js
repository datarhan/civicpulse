import { describe, expect, it } from 'vitest'
import { avisoSinVeredicto, pressLabSummary } from '../src/lib/press-lab'

/**
 * El aviso de /laboratorio decía «Extracción pendiente … no se ha examinado nada»
 * con 58 afirmaciones extraídas de 11 artículos y contrastadas todas: habían vuelto
 * `sin-datos`, que es «mirado y sin nada con qué comparar», no «sin mirar». Y lo
 * decía al lado del KPI «11 artículos auditados». La revisión lectora lo señaló el
 * 23-09-2026 (por otro motivo: el cero de triangulación, que sí era cierto).
 */
const fila = (verdict, articleId = 'a1') => ({ claim: { articleId }, verification: { verdict } })
const resumen = (filas) => pressLabSummary({ press: [], verified: filas })
const varias = (n, verdict) => Array.from({ length: n }, (_, i) => fila(verdict, `a${i % 11}`))

describe('avisoSinVeredicto · qué dice el aviso de /laboratorio', () => {
  it('sin afirmaciones: la extracción está pendiente de verdad', () => {
    const aviso = avisoSinVeredicto(resumen([]))
    expect(aviso?.titulo).toMatch(/extracción pendiente/i)
  })

  it('extraídas y contrastadas, ninguna resuelta: NO dice «extracción pendiente» ni «no se ha examinado»', () => {
    const aviso = avisoSinVeredicto(resumen(varias(58, 'sin-datos')))
    expect(aviso).not.toBeNull()
    expect(aviso.titulo).not.toMatch(/extracción pendiente/i)
    expect(aviso.texto).not.toMatch(/no se ha examinado/i)
    // Las cifras salen del recuento, no de la prosa.
    expect(aviso.texto).toContain('58 afirmaciones')
    expect(aviso.texto).toContain('11 artículos')
  })

  it('«parcial» tampoco resuelve: sigue sin veredicto', () => {
    expect(avisoSinVeredicto(resumen(varias(3, 'parcial')))).not.toBeNull()
  })

  it('con una sola resuelta no hay aviso: las tasas ya tienen divisor', () => {
    expect(avisoSinVeredicto(resumen([...varias(10, 'sin-datos'), fila('verificado')]))).toBeNull()
  })

  it('una sola afirmación de un solo artículo se escribe en singular', () => {
    const aviso = avisoSinVeredicto(resumen([fila('sin-datos')]))
    expect(aviso.texto).toContain('1 afirmación de 1 artículo')
  })
})
