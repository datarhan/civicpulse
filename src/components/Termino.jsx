import { Fragment } from 'react'
import { useT } from '../i18n'
import { partesConTerminos } from '../glosario'
import { rellena } from '../lib/formatters'
import { useGlosario } from '../hooks/useGlosario'

/*
 * Los términos del glosario en una frase nuestra, y la definición que abren.
 *
 * Nacieron dentro de «En breve» (`EnBreve.jsx`); viven aquí para que cualquier
 * frase del catálogo con `[[clave|texto]]` pueda abrir su entrada sin montar una
 * tarjeta entera —la etiqueta de correcciones de los reportajes es la primera—.
 * Sólo prosa nuestra lleva la marca: un literal de una fuente nunca.
 *
 * Quien los usa guarda qué término está abierto (`abierto`) y pinta la
 * definición donde le quepa: debajo de la frase, o en la fila siguiente.
 */

/**
 * Una frase con sus términos del glosario como botones. El botón dice si su
 * definición está abierta (`aria-expanded`) y a qué panel apunta.
 */
export function FraseConTerminos({ frase, abierto, onAbrir, idPanel }) {
  const partes = partesConTerminos(frase)
  const out = []
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i]
    if (typeof p === 'string') {
      out.push(<Fragment key={i}>{p}</Fragment>)
      continue
    }
    const boton = (
      <button
        type="button"
        className="cp-termino"
        aria-expanded={abierto === p.clave}
        // Sólo mientras el panel existe: un `aria-controls` hacia un id que no
        // está en el DOM es un atributo inválido.
        aria-controls={abierto === p.clave ? idPanel : undefined}
        onClick={() => onAbrir(abierto === p.clave ? null : p.clave)}
      >
        {p.texto}
      </button>
    )
    // La puntuación que sigue al término va pegada a él. Un <button> se maqueta
    // como una caja aunque sea `inline`, así que la línea podía partirse entre el
    // término y su coma: «tope del presupuesto» al final de una línea y «, no un
    // gasto» al principio de la siguiente.
    const siguiente = partes[i + 1]
    const pegada = typeof siguiente === 'string' ? siguiente.match(/^[,.;:)»?!]+/) : null
    if (pegada) {
      out.push(
        <span key={i} style={{ whiteSpace: 'nowrap' }}>
          {boton}
          {pegada[0]}
        </span>,
      )
      partes[i + 1] = siguiente.slice(pegada[0].length)
    } else {
      out.push(<Fragment key={i}>{boton}</Fragment>)
    }
  }
  return out
}

/**
 * La definición abierta, del glosario (`useGlosario`). Una entrada `propio` es
 * una palabra nuestra —«corrección»—, no una magnitud oficial con otro nombre, y
 * no lleva la línea «Nombre oficial: …», que repetiría la palabra.
 */
export function DefinicionGlosario({ clave, id, onCerrar, className }) {
  const t = useT()
  const entrada = useGlosario().find((g) => g.clave === clave)
  return (
    <div
      id={id}
      className={className ? `cp-en-breve-def ${className}` : 'cp-en-breve-def'}
      aria-live="polite"
    >
      {entrada && (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cp-en-breve-def-rotulo">{t('glosario.rotulo')}</div>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-aux)', lineHeight: 1.5 }}>
              {entrada.def}
            </p>
            {!entrada.propio && (
              <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                {rellena(t('glosario.oficial'), { nombre: entrada.termino })}
              </p>
            )}
          </div>
          <button
            type="button"
            className="cp-en-breve-cerrar"
            aria-label={t('glosario.cerrar')}
            onClick={onCerrar}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}
