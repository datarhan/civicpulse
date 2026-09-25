// @ts-check
import { Analytics } from '@vercel/analytics/react'

/**
 * Recuento de visitas sin cookies: Vercel Web Analytics, del mismo alojamiento
 * que ya sirve la web (así que no entra ningún tercero nuevo), con el script
 * servido desde el propio dominio.
 *
 * Existe porque el sitio no sabía si alguien lo leía. Ocho meses antes de las
 * municipales de mayo de 2027, la pregunta «¿llega esto a los vecinos?» no
 * tenía respuesta: ni qué páginas se abren, ni desde dónde llegan los enlaces
 * que se comparten por WhatsApp o Telegram.
 *
 * Sólo se monta en el build de producción: `VITE_ANALYTICS=vercel` lo pone
 * `deploy-vercel.yml` y nadie más, así que ni el desarrollo ni las pruebas
 * mandan visitas. Contarlas exige además activar Web Analytics en el proyecto
 * de Vercel; sin eso el script responde 404 y no se cuenta nada. Lo declara
 * /aviso-legal («Qué pasa cuando visitas esta web»).
 */
export const ANALITICA_ACTIVA = import.meta.env.VITE_ANALYTICS === 'vercel'

/**
 * Lo único que sale del navegador es la ruta. Los parámetros de búsqueda y el
 * fragmento se quitan antes de enviar: aquí son filtros y anclas, no datos de
 * nadie, pero lo que no hace falta contar no se manda.
 *
 * @template {{ url: string }} E
 * @param {E} evento
 * @returns {E | null}
 */
export function soloLaRuta(evento) {
  try {
    const u = new URL(evento.url)
    u.search = ''
    u.hash = ''
    return { ...evento, url: u.toString() }
  } catch {
    return null
  }
}

/**
 * `mode="production"` explícito: el paquete adivina el entorno por
 * `process.env.NODE_ENV` y, fuera de producción, carga un script de depuración
 * de un dominio de Vercel. Este componente sólo se monta en el build de
 * producción, así que se le dice y no se le deja adivinar.
 *
 * @param {{ activa?: boolean }} props
 */
export default function Analitica({ activa = ANALITICA_ACTIVA }) {
  if (!activa) return null
  return <Analytics mode="production" beforeSend={soloLaRuta} />
}
