import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ErrorBoundary from '../../src/components/ErrorBoundary'
import { LocaleProvider } from '../../src/i18n'

/**
 * Una página que revienta enseña una salida, y navegar a otra la rearma.
 * Sin límite de error, una excepción al pintar desmontaba la aplicación
 * entera y dejaba la pestaña en blanco.
 */

function Revienta() {
  throw new Error('trozo de JS de un despliegue anterior')
}

const pintar = (resetKey, hijo) => (
  <LocaleProvider>
    <ErrorBoundary resetKey={resetKey}>{hijo}</ErrorBoundary>
  </LocaleProvider>
)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('sin error, pinta la página tal cual', () => {
    render(pintar('/a', <p>contenido</p>))
    expect(screen.getByText('contenido')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('con error, ofrece recargar y volver a la portada en vez de quedarse en blanco', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(pintar('/a', <Revienta />))
    const aviso = screen.getByRole('alert')
    expect(aviso.textContent).toContain('no se ha podido mostrar')
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ir a la portada' }).getAttribute('href')).toBe('/')
  })

  it('al navegar a otra ruta se rearma: un fallo no inutiliza las demás páginas', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(pintar('/a', <Revienta />))
    expect(screen.getByRole('alert')).toBeTruthy()
    rerender(pintar('/b', <p>otra página</p>))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('otra página')).toBeTruthy()
  })
})
