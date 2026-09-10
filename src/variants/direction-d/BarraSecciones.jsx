/**
 * La barra de secciones de la portada — lámina 1b de «Portada · Revisión».
 *
 * Sustituye al carril de iconos: una columna de glifos sin rótulo (◇ ▣ ▦ ▧ ❝
 * ◍ …) cuyo nombre sólo existía en un `title`, que no aparece en táctil y en
 * escritorio tarda un segundo de ratón quieto. Un índice cifrado en la
 * superficie más visitada del sitio. Ahora son cinco grupos que se leen; cada
 * uno se abre con una frase que dice para qué sirve lo que hay dentro, y cada
 * sección trae la suya. El mapa recupera el ancho del carril y la portada gana
 * una acción primaria a la vista.
 *
 * El patrón es la navegación con desplegables de la APG —un botón con
 * aria-expanded que controla una lista de enlaces—, NO role="menu": un menú
 * es para acciones de una aplicación, y aquí cada fila lleva a otra página.
 * Teclado: Intro o Espacio abre y cierra; ↓ y ↑ sobre un botón abren su panel
 * por el primer o el último enlace; dentro, ↓ ↑ Inicio y Fin lo recorren;
 * ← y → pasan de un grupo al de al lado; Escape cierra y devuelve el foco a
 * su botón. Tabular fuera de la barra, o pulsar fuera, también cierra.
 *
 * Los paneles cerrados siguen en el DOM con `hidden`: así cada aria-controls
 * apunta a algo que existe, y los enlaces siguen siendo enlaces para quien
 * rastrea la portada, como lo eran en el carril.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SectionGlyph } from '../../components/SectionGlyph'
import { GRUPO_PROYECTO, NAV_GROUPS, entradasDeGrupo } from '../../nav'
import { useT } from '../../i18n'
import { estiloBarraSecciones } from './barra-secciones.css.js'

// El mismo destino que la llamada «Denuncia un bache» de la columna, con el
// mismo parámetro de arranque: una sola puerta al bot, no dos que discrepen.
const BOT_QUEJAS = 'https://t.me/munigraph_bot?start=landing'

const INDICE = 'indice'
const idPanel = (id) => `d-sec-panel-${id}`

function enlacesDelPanel(id) {
  const panel = document.getElementById(idPanel(id))
  return panel ? [...panel.querySelectorAll('a[href]')] : []
}

function enfocar(enlaces, cual) {
  ;(cual === 'ultimo' ? enlaces.at(-1) : enlaces[0])?.focus()
}

/** El rótulo, con su ancho en negrita reservado (ver `.d-sec-rotulo`). */
function Rotulo({ texto }) {
  return (
    <span className="d-sec-rotulo">
      <span>{texto}</span>
      <span className="d-sec-rotulo-ancho" aria-hidden="true">
        {texto}
      </span>
    </span>
  )
}

/**
 * El ▾ de la lámina, dibujado en vez de escrito: como carácter depende de la
 * fuente de reserva de cada sistema y cambia de tamaño y de peso de uno a otro.
 * No gira al abrir, como en la lámina: el grupo abierto ya lo dicen el color,
 * la negrita y el subrayado.
 */
function Flecha() {
  return (
    <svg
      className="d-sec-flecha"
      width="8"
      height="8"
      viewBox="0 0 8 8"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M1 2.5h6L4 6.5z" fill="currentColor" />
    </svg>
  )
}

export function BarraSecciones() {
  const t = useT()
  const [abierto, setAbierto] = useState(null) // id de grupo, INDICE o null
  const raiz = useRef(null)
  const botones = useRef({})
  const focoPendiente = useRef(null) // 'primero' | 'ultimo' | null

  // Un grupo que las banderas dejan sin secciones no pinta botón: un
  // desplegable vacío promete algo que no hay.
  const grupos = NAV_GROUPS.map((g) => ({ ...g, entradas: entradasDeGrupo(g.id) })).filter(
    (g) => g.entradas.length > 0,
  )
  const proyecto = entradasDeGrupo(GRUPO_PROYECTO.id)
  const orden = [...grupos.map((g) => g.id), INDICE]

  // Abrir con una flecha deja pendiente a qué enlace va el foco; se cumple
  // cuando el panel ya se ve, porque a un elemento `hidden` no se le enfoca.
  useLayoutEffect(() => {
    const cual = focoPendiente.current
    if (!abierto || !cual) return
    focoPendiente.current = null
    enfocar(enlacesDelPanel(abierto), cual)
  }, [abierto])

  // Con un panel abierto, pulsar fuera lo cierra, y Escape también, esté
  // donde esté el foco. Si estaba dentro de la barra, vuelve a su botón.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => {
      if (!raiz.current?.contains(e.target)) setAbierto(null)
    }
    const escape = (e) => {
      if (e.key !== 'Escape') return
      if (raiz.current?.contains(document.activeElement)) botones.current[abierto]?.focus()
      setAbierto(null)
    }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto])

  const alternar = (id) => setAbierto((actual) => (actual === id ? null : id))
  const cerrar = () => setAbierto(null)

  const teclaEnBoton = (id) => (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const cual = e.key === 'ArrowDown' ? 'primero' : 'ultimo'
      if (abierto === id) {
        enfocar(enlacesDelPanel(id), cual)
      } else {
        focoPendiente.current = cual
        setAbierto(id)
      }
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const paso = e.key === 'ArrowRight' ? 1 : -1
      const siguiente = orden[(orden.indexOf(id) + paso + orden.length) % orden.length]
      // Un panel abierto bajo un botón que ya no tiene el foco es un panel
      // que nadie está mirando.
      setAbierto(null)
      botones.current[siguiente]?.focus()
    }
  }

  const teclaEnPanel = (e) => {
    const enlaces = [...e.currentTarget.querySelectorAll('a[href]')]
    if (!enlaces.length) return
    const i = enlaces.indexOf(document.activeElement)
    const ultimo = enlaces.length - 1
    const destino = {
      ArrowDown: i >= ultimo ? 0 : i + 1,
      ArrowUp: i <= 0 ? ultimo : i - 1,
      Home: 0,
      End: ultimo,
    }[e.key]
    if (destino === undefined) return
    e.preventDefault()
    enlaces[destino].focus()
  }

  // Sólo cuando el foco se va a OTRO sitio de la página. Un clic en el fondo
  // de un panel deja el foco en el body —relatedTarget nulo— y no debe cerrar
  // lo que el lector está mirando; de pulsar fuera se ocupa el pointerdown.
  const alSalirElFoco = (e) => {
    if (e.relatedTarget && !raiz.current?.contains(e.relatedTarget)) setAbierto(null)
  }

  const registrar = (id) => (el) => {
    botones.current[id] = el
  }

  return (
    <>
      <style>{estiloBarraSecciones}</style>
      <nav
        ref={raiz}
        className="d-sec"
        aria-label={t('a11y.secciones')}
        onBlur={alSalirElFoco}
        data-print-hide
      >
        <ul className="d-sec-fila">
          {grupos.map((g) => (
            <li key={g.id} className="d-sec-grupo">
              <button
                type="button"
                ref={registrar(g.id)}
                className="d-sec-boton"
                aria-expanded={abierto === g.id}
                aria-controls={idPanel(g.id)}
                onClick={() => alternar(g.id)}
                onKeyDown={teclaEnBoton(g.id)}
              >
                <Rotulo texto={t(g.labelKey)} />
                <Flecha />
              </button>
              <div
                id={idPanel(g.id)}
                className="d-sec-panel"
                hidden={abierto !== g.id}
                onKeyDown={teclaEnPanel}
              >
                <p className="d-sec-lema">
                  {t(g.labelKey)} · {t(g.ledeKey)}
                </p>
                <ul className="d-sec-lista">
                  {g.entradas.map((n) => (
                    <li key={n.to}>
                      <Link to={n.to} className="d-sec-enlace" onClick={cerrar}>
                        <SectionGlyph to={n.to} size={16} />
                        <span className="d-sec-textos">
                          <span className="d-sec-titulo">{t(n.labelKey)}</span>{' '}
                          <span className="d-sec-desc">{t(n.descKey)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}

          <li className="d-sec-grupo d-sec-grupo--indice">
            <button
              type="button"
              ref={registrar(INDICE)}
              className="d-sec-indice"
              aria-expanded={abierto === INDICE}
              aria-controls={idPanel(INDICE)}
              onClick={() => alternar(INDICE)}
              onKeyDown={teclaEnBoton(INDICE)}
            >
              {t('secciones.indice')}
            </button>
            <div
              id={idPanel(INDICE)}
              className="d-sec-panel d-sec-panel--indice"
              hidden={abierto !== INDICE}
              onKeyDown={teclaEnPanel}
            >
              <p className="d-sec-lema">{t('secciones.indice.titulo')}</p>
              <div className="d-sec-indice-rejilla">
                {grupos.map((g) => (
                  <div key={g.id}>
                    <p className="d-sec-indice-rotulo">{t(g.labelKey)}</p>
                    <ul className="d-sec-lista">
                      {g.entradas.map((n) => (
                        <li key={n.to}>
                          <Link
                            to={n.to}
                            className="d-sec-enlace d-sec-enlace--breve"
                            onClick={cerrar}
                          >
                            <SectionGlyph to={n.to} size={14} />
                            <span className="d-sec-titulo">{t(n.labelKey)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {/* Quiénes somos, Metodología y Aviso legal: el carril los
                  llevaba bajo su separador y la barra no tiene sitio para
                  ellos. Sin este pie, la portada dejaría de llevar al
                  contrato editorial. */}
              {proyecto.length > 0 && (
                <div className="d-sec-indice-pie">
                  <p className="d-sec-indice-rotulo">{t(GRUPO_PROYECTO.labelKey)}</p>
                  <ul>
                    {proyecto.map((n) => (
                      <li key={n.to}>
                        <Link to={n.to} onClick={cerrar}>
                          {t(n.labelKey)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </li>

          <li className="d-sec-accion">
            <a className="d-sec-queja" href={BOT_QUEJAS} target="_blank" rel="noreferrer">
              {t('secciones.queja')}
              <span className="d-sec-oculto"> {t('secciones.queja.nota')}</span>
            </a>
          </li>
        </ul>
      </nav>
    </>
  )
}
