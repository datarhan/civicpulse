import { Outlet, useLocation } from 'react-router-dom'
import Compartir from '../../components/Compartir'
import { MasReportajes, ProgresoLectura } from '../../components/reportajes/Pieza'
import { useReportaje } from '../../hooks/useReportaje'

/**
 * Lo que rodea a cada pieza y no es la pieza: la barra de lectura, compartirla y
 * el pie con las demás. Es una ruta de disposición (App.jsx) y no un añadido en
 * cada fichero: las piezas siguen siendo rutas explícitas, cada una con su
 * componente, y lo común vive en un sitio.
 *
 * Lo de compartir y el pie van DESPUÉS de la pieza y fuera de su contenedor: el
 * registro de correcciones es el último bloque de la pieza, y lo fija una prueba.
 */
export default function Armazon() {
  const { pathname } = useLocation()
  const actual = pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  return (
    <>
      <ProgresoLectura />
      <Outlet />
      <CompartirPieza slug={actual} />
      <MasReportajes actual={actual} />
    </>
  )
}

/**
 * Sólo una pieza publicada se ofrece para compartir, con su titular real. La
 * instantánea ya la pidió la propia pieza, así que el almacén la tiene.
 *
 * @param {{ slug: string }} props
 */
function CompartirPieza({ slug }) {
  const { data } = useReportaje(slug)
  const m = data?.meta
  if (!m || m.estado !== 'publicado' || !m.titulo) return null
  return (
    <div className="cp-compartir-pieza" data-print-hide>
      <Compartir titulo={m.titulo} ruta={`/reportajes/${m.slug || slug}`} />
    </div>
  )
}
