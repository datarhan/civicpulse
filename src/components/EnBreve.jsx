import { Fragment, useId, useState } from 'react'
import { useT } from '../i18n'
import { partesConTerminos } from '../glosario'
import { rellena } from '../lib/formatters'
import { useRevelado } from '../hooks/useRevelado'
import { useGlosario } from '../hooks/useGlosario'

/*
 * «En breve»: la primera capa de una página densa, para quien llega con una
 * pregunta y no con el vocabulario de la fuente.
 *
 * Cuatro reglas, del diseño (docs/superpowers/specs/2026-10-21-lectura-
 * vecinal-design.md):
 *
 * - No sustituye a la página: va encima y cada respuesta enlaza a la sección
 *   que la demuestra. Nada de un «modo fácil» aparte, que escondería las
 *   salvedades a quien lo eligiera.
 * - La salvedad va en la MISMA tarjeta que la cifra, como el aviso de tramo en
 *   /eficiencia: una cifra resumida sin su «pero» deja de ser cierta.
 * - Las frases no se escriben aquí: llegan ya derivadas del dato. Este
 *   componente sólo las pinta y abre sus términos del glosario.
 * - Sin nota ni semáforo. Responde «cuánto» y «dónde», nunca «¿lo hacen bien?»
 *   (docs/DESCRIPCION.md, «Lo que esta herramienta no te va a dar»).
 *
 * El movimiento es el de las figuras de los reportajes (`useRevelado`): crecen
 * las marcas, nunca el texto, y el reposo es la figura completa.
 */

/**
 * Una frase con sus términos del glosario como botones. El botón dice si su
 * definición está abierta (`aria-expanded`) y a qué panel apunta.
 */
function FraseConTerminos({ frase, abierto, onAbrir, idPanel }) {
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

/** La definición abierta, del glosario (`useGlosario`). */
function Definicion({ clave, id, onCerrar }) {
  const t = useT()
  const entrada = useGlosario().find((g) => g.clave === clave)
  const textos = entrada && [entrada.termino, entrada.def]
  return (
    <div id={id} className="cp-en-breve-def" aria-live="polite">
      {textos && (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cp-en-breve-def-rotulo">{t('glosario.rotulo')}</div>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-aux)', lineHeight: 1.5 }}>
              {textos[1]}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              {rellena(t('glosario.oficial'), { nombre: textos[0] })}
            </p>
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

/**
 * Una pregunta y su respuesta.
 *
 * @param {{
 *   id: string,
 *   pregunta: string,
 *   cifra?: string,
 *   cifraNota?: string,
 *   figura?: import('react').ReactNode,
 *   frases: string[],
 *   nota?: string,
 *   salvedad?: string,
 *   ancla: string,
 *   anclaTexto: string,
 * }} props
 */
export function TarjetaEnBreve({
  id,
  pregunta,
  cifra,
  cifraNota,
  figura,
  frases,
  nota,
  salvedad,
  ancla,
  anclaTexto,
}) {
  const [abierto, setAbierto] = useState(null)
  const idPanel = `${useId()}-def`
  const frase = frases.filter(Boolean).join(' ')
  return (
    <article className="cp-en-breve-tarjeta" data-en-breve={id}>
      <h3 className="cp-en-breve-pregunta">{pregunta}</h3>
      {cifra && (
        <div>
          <span className="mono cp-en-breve-cifra">{cifra}</span>
          {cifraNota && <span className="cp-en-breve-cifra-nota"> · {cifraNota}</span>}
        </div>
      )}
      {figura}
      <p className="cp-en-breve-frase">
        <FraseConTerminos frase={frase} abierto={abierto} onAbrir={setAbierto} idPanel={idPanel} />
      </p>
      {nota && (
        <p className="cp-en-breve-nota">
          <FraseConTerminos frase={nota} abierto={abierto} onAbrir={setAbierto} idPanel={idPanel} />
        </p>
      )}
      {abierto && <Definicion clave={abierto} id={idPanel} onCerrar={() => setAbierto(null)} />}
      {salvedad && <p className="cp-en-breve-salvedad">{salvedad}</p>}
      {/* Un <a> también para otra ruta (/datos): es lo que usan las páginas que
          lo montan, y así el bloque no exige un router a quien lo pinta. */}
      <a href={ancla} className="cp-en-breve-ancla">
        {anclaTexto}
      </a>
    </article>
  )
}

/**
 * El bloque entero. `children` son las tarjetas; `figura` va entre la cabecera
 * y la rejilla (el recorrido de un dato en /metodologia); `pie` va debajo de la
 * rejilla, a todo el ancho (la advertencia del mapa en /presupuesto).
 *
 * @param {{
 *   titulo: string,
 *   intro: string,
 *   saltarA: string,
 *   saltarTexto: string,
 *   children: import('react').ReactNode,
 *   figura?: import('react').ReactNode,
 *   pie?: import('react').ReactNode,
 * }} props
 */
export default function EnBreve({ titulo, intro, saltarA, saltarTexto, children, figura, pie }) {
  const idTitulo = `${useId()}-titulo`
  const { ref, marcas } = useRevelado({ umbral: 0.15 })
  return (
    <section
      ref={ref}
      {...marcas}
      className="cp-card cp-en-breve"
      aria-labelledby={idTitulo}
      data-en-breve-bloque=""
    >
      <div className="cp-en-breve-cabeza">
        <div>
          <h2 id={idTitulo} className="cp-en-breve-titulo">
            {titulo}
          </h2>
          <p className="cp-en-breve-intro">{intro}</p>
        </div>
        <a href={saltarA} className="cp-en-breve-saltar">
          {saltarTexto}
        </a>
      </div>
      {figura}
      <div className="cp-en-breve-rejilla">{children}</div>
      {pie}
    </section>
  )
}
