import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Analitica, { ANALITICA_ACTIVA, soloLaRuta } from '../../src/components/Analitica'

/**
 * El recuento de visitas: apagado salvo en el build de producción, y sin
 * mandar más que la ruta.
 *
 * Lo que se promete en /aviso-legal —«para saber qué páginas se leen, no quién
 * las lee»— se sostiene aquí: el script sólo entra cuando `deploy-vercel.yml`
 * pone `VITE_ANALYTICS=vercel`, y cada evento sale sin parámetros ni fragmento.
 */

const scriptsDeAnalitica = () =>
  [...document.querySelectorAll('script')].filter((s) => /_vercel\/insights|va\.vercel/.test(s.src))

afterEach(() => {
  cleanup()
  for (const s of scriptsDeAnalitica()) s.remove()
})

describe('Analitica', () => {
  it('en pruebas (y en desarrollo y e2e) no hay bandera: no se monta', () => {
    expect(ANALITICA_ACTIVA).toBe(false)
    render(<Analitica />)
    expect(scriptsDeAnalitica()).toEqual([])
  })

  it('con la bandera puesta inyecta el script del propio dominio', () => {
    render(<Analitica activa />)
    const [script] = scriptsDeAnalitica()
    expect(script, 'se esperaba el script de Vercel Web Analytics').toBeTruthy()
    // Ruta relativa al propio dominio, no un tercero.
    expect(script.getAttribute('src')).toBe('/_vercel/insights/script.js')
  })

  it('sólo sale la ruta: sin parámetros de búsqueda ni fragmento', () => {
    expect(
      soloLaRuta({
        type: 'pageview',
        url: 'https://www.civicpulse.es/hallazgos?area=urbanismo#f-1',
      }),
    ).toEqual({ type: 'pageview', url: 'https://www.civicpulse.es/hallazgos' })
  })

  it('una URL que no se entiende no se manda', () => {
    expect(soloLaRuta({ type: 'pageview', url: 'no es una url' })).toBeNull()
  })
})
