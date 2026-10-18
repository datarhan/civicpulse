// @ts-check
/**
 * «Pídelo tú»: el escrito de acceso con las preguntas de la pieza, para que
 * quien lee lo presente con su nombre. El texto lo redacta
 * `textoSolicitudLector` (src/lib/solicitud-lector.js), y su cabecera explica
 * por qué sólo aparece donde el proyecto no ha registrado ya esas preguntas y
 * por qué no hay formulario ni sitio donde subir nada.
 *
 * La pieza lo pide explícitamente, pasándole sus preguntas: no se cuelga solo
 * del armazón, porque sólo la página sabe qué preguntas suyas son información
 * que el Ayuntamiento tiene y cuáles piden una valoración. Debajo va el texto
 * entero en un `<details>`: donde el portapapeles está bloqueado —un permiso
 * denegado, un navegador sin él— se selecciona a mano, y si la copia falla se
 * abre solo, en vez de fingir que se copió.
 *
 * Va a la medida de lectura (`.cp-texto`): es texto de cuerpo con un botón, y su
 * borde izquierdo es el de los párrafos que tiene encima.
 */
import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { partePorHueco, rellena } from '../../lib/formatters'
import { CORREO, esFechaIso, textoSolicitudLector } from '../../lib/solicitud-lector'
import { SITIO } from '../Compartir'

const BOTON = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 36,
  padding: '6px 14px',
  border: '1px solid var(--civic)',
  borderRadius: 'var(--r-pill)',
  background: 'transparent',
  color: 'var(--civic)',
  fontFamily: 'inherit',
  fontSize: 'var(--fs-meta)',
  fontWeight: 600,
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
 * @param {{
 *   meta: { titulo: string, publicadoEl: string },
 *   ruta: string,
 *   preguntas: string[],
 *   total?: number,
 *   clases?: string[],
 * }} props — `meta` es el de la pieza: su título se cita y su `publicadoEl`
 *   fecha lo que las preguntas dan por sentado. `ruta` es la de la pieza
 *   (`/reportajes/<slug>`), que se cita con la dirección pública; `total`,
 *   cuántas preguntas hace la pieza, cuando el escrito no lleva todas: entonces
 *   se dice cuántas lleva, y `clases` —las de `clasesApartadas`— dice por qué:
 *   sólo se nombran los motivos que se dan de verdad en esa pieza.
 */
export default function SolicitudLector({ meta, ruta, preguntas, total, clases = [] }) {
  const t = useT()
  // Sin fecha válida o sin preguntas, nada: la página ya lo filtra con
  // `debeOfrecerSolicitud`, y esto es la segunda puerta, para que un dato mal
  // formado no tumbe la pieza con la excepción del escrito.
  const redactable =
    esFechaIso(meta?.publicadoEl) && Array.isArray(preguntas) && preguntas.length > 0
  const texto = redactable
    ? textoSolicitudLector({
        titulo: meta.titulo,
        url: `${SITIO}${ruta}`,
        publicadoEl: meta.publicadoEl,
        preguntas,
      })
    : ''
  const [estado, setEstado] = useState(/** @type {'' | 'copiado' | 'fallo'} */ (''))
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (estado !== 'copiado') return undefined
    const id = setTimeout(() => setEstado(''), 2500)
    return () => clearTimeout(id)
  }, [estado])

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
      setEstado('copiado')
    } catch {
      // Sin portapapeles no se finge la copia: se abre el texto para
      // seleccionarlo a mano y se dice por qué.
      setEstado('fallo')
      setAbierto(true)
    }
  }

  if (!redactable) return null

  const [antes, despues] = partePorHueco(t('reportajes.solicitud.explica'), '{correo}')
  /** Una frase por clase de motivo presente, en el orden de `CLASES`. */
  const FRASE_DE_CLASE = {
    'no-informativa': 'reportajes.solicitud.parcial.noInformativa',
    'ya-pedida': 'reportajes.solicitud.parcial.yaPedida',
  }
  const parcial =
    total != null && total > preguntas.length
      ? [
          rellena(t('reportajes.solicitud.parcial'), { n: preguntas.length, total }),
          ...clases.filter((c) => c in FRASE_DE_CLASE).map((c) => t(FRASE_DE_CLASE[c])),
        ].join(' ')
      : null

  return (
    <section
      className="cp-texto"
      data-solicitud-lector
      aria-labelledby="solicitud-lector-titulo"
      data-print-hide
      style={{
        margin: '26px 0 0',
        paddingTop: 16,
        borderTop: '1px solid var(--border)',
      }}
    >
      <h3
        id="solicitud-lector-titulo"
        style={{
          margin: '0 0 8px',
          fontSize: 'var(--fs-body)',
          fontWeight: 600,
          color: 'var(--ink)',
        }}
      >
        {t('reportajes.solicitud.titulo')}
      </h3>
      <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-body)', color: 'var(--ink70)' }}>
        {antes}
        <a href={`mailto:${CORREO}`} style={{ color: 'var(--civic)' }}>
          {CORREO}
        </a>
        {despues}
      </p>
      {parcial && (
        <p
          data-solicitud-parcial
          style={{ margin: '0 0 10px', fontSize: 'var(--fs-body)', color: 'var(--ink70)' }}
        >
          {parcial}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={copiar} style={BOTON}>
          {estado === 'copiado'
            ? t('reportajes.solicitud.copiado')
            : t('reportajes.solicitud.copiar')}
        </button>
        {estado === 'fallo' && (
          <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}>
            {t('reportajes.solicitud.noCopiado')}
          </span>
        )}
      </div>
      <span aria-live="polite" style={OCULTO}>
        {estado === 'copiado' ? t('reportajes.solicitud.copiado') : ''}
      </span>
      <details
        open={abierto}
        onToggle={(e) => setAbierto(/** @type {HTMLDetailsElement} */ (e.currentTarget).open)}
        style={{ margin: '12px 0 0' }}
      >
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-meta)', color: 'var(--civic)' }}>
          {t('reportajes.solicitud.ver')}
        </summary>
        <pre
          data-solicitud-texto
          style={{
            margin: '10px 0 0',
            padding: '12px 14px',
            background: 'var(--soft)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            color: 'var(--ink)',
            fontFamily: 'inherit',
            fontSize: 'var(--fs-aux)',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {texto}
        </pre>
      </details>
    </section>
  )
}
