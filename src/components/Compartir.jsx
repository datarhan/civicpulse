import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useT } from '../i18n'

/**
 * La dirección que se comparte. Siempre la pública: un enlace copiado desde una
 * vista previa de Vercel o desde `localhost` no le sirve a nadie en un grupo de
 * WhatsApp.
 */
export const SITIO = 'https://www.civicpulse.es'

/**
 * Los enlaces para compartir una página, derivados y puros para poder probarlos
 * sin DOM.
 *
 * La ruta va sin consulta ni ancla: un enlace compartido no tiene que llevar el
 * filtro, la posición ni los parámetros de campaña de quien lo compartió. El
 * texto es el titular real de lo que se comparte, sin nada añadido: un mensaje
 * redactado aquí sería prosa sin firma circulando en nombre del sitio.
 *
 * @param {string | undefined} titulo
 * @param {string} ruta
 */
export function enlacesParaCompartir(titulo, ruta) {
  const limpia = (ruta || '/').split(/[?#]/)[0] || '/'
  const url = `${SITIO}${limpia}`
  const texto = titulo ? `${titulo}\n${url}` : url
  return {
    url,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(texto)}`,
    telegram:
      `https://t.me/share/url?url=${encodeURIComponent(url)}` +
      (titulo ? `&text=${encodeURIComponent(titulo)}` : ''),
  }
}

const BOTON = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 32,
  padding: '4px 12px',
  border: '1px solid var(--border2)',
  borderRadius: 'var(--r-pill)',
  background: 'transparent',
  color: 'var(--civic)',
  fontFamily: 'inherit',
  fontSize: 'var(--fs-meta)',
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer',
}

const OCULTO = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}

/**
 * Compartir una página por WhatsApp o Telegram, copiar su enlace o, donde el
 * sistema lo ofrece (el móvil), abrir su menú de compartir.
 *
 * Son enlaces normales, no un script de terceros: nada se carga hasta que
 * alguien pulsa, y no se cuenta quién comparte. `/aviso-legal` promete que la
 * analítica sólo cuenta visitas.
 *
 * @param {{ titulo?: string, ruta?: string }} props — `ruta` por defecto es la
 *   de la página en la que se está.
 */
export default function Compartir({ titulo, ruta }) {
  const t = useT()
  const { pathname } = useLocation()
  const { url, whatsapp, telegram } = enlacesParaCompartir(titulo, ruta ?? pathname)
  const [copiado, setCopiado] = useState(false)
  // Se decide al montar, no al renderizar: `navigator` sólo existe en el
  // navegador, y el menú del sistema sólo en algunos (el móvil, sobre todo).
  const [nativo, setNativo] = useState(false)
  useEffect(() => {
    setNativo(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])
  useEffect(() => {
    if (!copiado) return undefined
    const id = setTimeout(() => setCopiado(false), 2500)
    return () => clearTimeout(id)
  }, [copiado])

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
    } catch {
      // Sin portapapeles (permiso denegado, contexto inseguro): no se finge
      // que se copió. El enlace sigue en la barra de direcciones.
    }
  }
  const compartirNativo = async () => {
    try {
      await navigator.share({ title: titulo, url })
    } catch {
      // Cancelado por quien iba a compartir: no es un error.
    }
  }

  return (
    <div
      role="group"
      aria-label={t('compartir.etiqueta')}
      data-print-hide
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
    >
      <span
        className="mono"
        aria-hidden="true"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {t('compartir.etiqueta')}
      </span>
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('common.compartirWhatsApp')}
        style={BOTON}
      >
        WhatsApp
      </a>
      <a
        href={telegram}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('compartir.telegram')}
        style={BOTON}
      >
        Telegram
      </a>
      <button type="button" onClick={copiar} style={BOTON}>
        {copiado ? t('compartir.copiado') : t('compartir.copiar')}
      </button>
      {nativo && (
        <button type="button" onClick={compartirNativo} style={BOTON}>
          {t('compartir.mas')}
        </button>
      )}
      <span aria-live="polite" style={OCULTO}>
        {copiado ? t('compartir.copiado') : ''}
      </span>
    </div>
  )
}
