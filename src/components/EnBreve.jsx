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
 *   salvedades a quien lo eligiera. Lo que sí hay es un pliegue de la lectura
 *   experta que elige el lector (`Lecturas.jsx`, salvaguarda 4 del diseño):
 *   este bloque no se pliega nunca, y sus enlaces abren lo que esté plegado.
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
 *   detalle?: import('react').ReactNode,
 *   pie?: string,
 *   salvedad?: string,
 *   ancla?: string,
 *   anclaTexto?: string,
 * }} props
 *
 * `detalle` va detrás de la frase: lo que la frase resume, cuando cabe en la
 * tarjeta (los puntos del último pleno en /plenos). `figura` va delante. `pie`
 * es una frase con términos del glosario que habla del `detalle` —las palabras
 * de un orden del día— y abre su definición debajo de ella, no encima de la
 * lista. Sin `ancla`, la tarjeta no enlaza: no hay sección que lo demuestre
 * mejor que ella.
 */
export function TarjetaEnBreve({
  id,
  pregunta,
  cifra,
  cifraNota,
  figura,
  frases,
  nota,
  detalle,
  pie,
  salvedad,
  ancla,
  anclaTexto,
}) {
  const [abierto, setAbierto] = useState(null)
  const [enElPie, setEnElPie] = useState(false)
  const idPanel = `${useId()}-def`
  const frase = frases.filter(Boolean).join(' ')
  const abreArriba = (clave) => {
    setAbierto(clave)
    setEnElPie(false)
  }
  const abreEnElPie = (clave) => {
    setAbierto(clave)
    setEnElPie(true)
  }
  const definicion = abierto && (
    <DefinicionGlosario clave={abierto} id={idPanel} onCerrar={() => setAbierto(null)} />
  )
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
        <FraseConTerminos frase={frase} abierto={abierto} onAbrir={abreArriba} idPanel={idPanel} />
      </p>
      {nota && (
        <p className="cp-en-breve-nota">
          <FraseConTerminos frase={nota} abierto={abierto} onAbrir={abreArriba} idPanel={idPanel} />
        </p>
      )}
      {!enElPie && definicion}
      {detalle}
      {pie && (
        <p className="cp-en-breve-nota">
          <FraseConTerminos frase={pie} abierto={abierto} onAbrir={abreEnElPie} idPanel={idPanel} />
        </p>
      )}
      {enElPie && definicion}
      {salvedad && <p className="cp-en-breve-salvedad">{salvedad}</p>}
      {/* Un <a> también para otra ruta (/datos): es lo que usan las páginas que
          lo montan, y así el bloque no exige un router a quien lo pinta. */}
      {ancla && (
        <a href={ancla} className="cp-en-breve-ancla">
          {anclaTexto}
        </a>
      )}
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
        {/* «Todos los datos»: con la lectura experta plegada, las abre todas. */}
        <a href={saltarA} className="cp-en-breve-saltar" data-abre-todo="">
          {saltarTexto}
        </a>
      </div>
      {figura}
      <div className="cp-en-breve-rejilla">{children}</div>
      {pie}
    </section>
  )
}
