import { Outlet, useLocation } from 'react-router-dom'
import { MasReportajes, ProgresoLectura } from '../../components/reportajes/Pieza'

/**
 * Lo que rodea a cada pieza y no es la pieza: la barra de lectura y el pie con
 * las demás. Es una ruta de disposición (App.jsx) y no un añadido en cada
 * fichero: las piezas siguen siendo rutas explícitas, cada una con su
 * componente, y lo común vive en un sitio.
 *
 * El pie va DESPUÉS de la pieza y fuera de su contenedor: el registro de
 * correcciones es el último bloque de la pieza, y lo fija una prueba.
 */
export default function Armazon() {
  const { pathname } = useLocation()
  const actual = pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  return (
    <>
      <ProgresoLectura />
      <Outlet />
      <MasReportajes actual={actual} />
    </>
  )
}
