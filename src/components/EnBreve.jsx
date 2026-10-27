import { useId, useState } from 'react'
import { useRevelado } from '../hooks/useRevelado'
import { DefinicionGlosario, FraseConTerminos } from './Termino'

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
 *   componente sólo las pinta y abre sus términos del glosario (`Termino.jsx`).
 * - Sin nota ni semáforo. Responde «cuánto» y «dónde», nunca «¿lo hacen bien?»
 *   (docs/DESCRIPCION.md, «Lo que esta herramienta no te va a dar»).
 *
 * El movimiento es el de las figuras de los reportajes (`useRevelado`): crecen
 * las marcas, nunca el texto, y el reposo es la figura completa.
 */

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
      {abierto && (
        <DefinicionGlosario clave={abierto} id={idPanel} onCerrar={() => setAbierto(null)} />
      )}
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
      data-tarjeta=""
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
