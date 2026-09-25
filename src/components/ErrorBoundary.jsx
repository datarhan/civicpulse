import { Component } from 'react'
import { useT } from '../i18n'
import { Button } from './Primitives'

/**
 * Lo que ve quien lee cuando una página revienta: una salida, no una pantalla
 * en blanco.
 *
 * Hasta el 2026-09-25 el sitio no tenía ningún límite de error fuera del panel
 * de curación, así que cualquier excepción al pintar desmontaba la aplicación
 * entera. La más común no es un fallo del código: con unos diez despliegues al
 * día, una pestaña abierta pide un trozo de JS que ya no existe, el `rewrite`
 * de Vercel le devuelve `index.html` en su lugar, el `import()` falla y la
 * página se queda en blanco sin que nadie se entere.
 * `src/lib/preload-recovery.js` recarga una vez; esto es lo que queda si ni
 * eso basta.
 *
 * `resetKey` (la ruta) lo rearma al navegar: un fallo en una página no puede
 * dejar inservibles las demás.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[ErrorBoundary]', error)
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    return this.state.error ? <Fallo /> : this.props.children
  }
}

function Fallo() {
  const t = useT()
  return (
    <div role="alert" style={{ padding: '40px 24px', maxWidth: 640 }}>
      <h1 style={{ fontSize: 'var(--fs-page)', fontWeight: 700, color: 'var(--ink)' }}>
        {t('fallo.titulo')}
      </h1>
      <p style={{ color: 'var(--ink70)', fontSize: 'var(--fs-body)', lineHeight: 1.6 }}>
        {t('fallo.texto')}
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="solid" type="button" onClick={() => window.location.reload()}>
          {t('fallo.recargar')}
        </Button>
        <a href="/" style={{ color: 'var(--civic)', fontSize: 'var(--fs-body)' }}>
          {t('fallo.portada')}
        </a>
      </div>
    </div>
  )
}
