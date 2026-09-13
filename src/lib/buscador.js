// @ts-check
import { createContext, useContext } from 'react'

/**
 * Quién abre el buscador rápido, por contexto y no por prop.
 *
 * La portada es la única pantalla que se pinta FUERA del shell, así que su
 * cabecera no recibe el `onOpenCmdK` que `InnerShell` pasa a la suya. Y no
 * puede recibirlo: `tests/route-graph-portada.test.ts` lee de App.jsx cuál es el
 * módulo de la portada buscando la etiqueta sin atributos que la rama de `/`
 * pinta, y de ese módulo salen las rutas que alimentan la revisión lectora y el
 * recordatorio de prosa rancia. Pasarle una prop a `<DirectionD />` rompería esa
 * cadena por un sitio en el que nadie miraría.
 *
 * El valor por defecto es una función que no hace nada, para que un botón
 * montado sin proveedor —una prueba, una pantalla nueva— quede inerte en vez de
 * tirar la página.
 */
export const AbrirBuscador = createContext(() => {})

/** El abridor del buscador rápido. Nunca null: siempre se puede llamar. */
export function useAbrirBuscador() {
  return useContext(AbrirBuscador)
}
