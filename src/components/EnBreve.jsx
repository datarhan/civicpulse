import { Fragment, useId, useState } from 'react'
import { useT } from '../i18n'
import { partesConTerminos } from '../glosario'
import { rellena } from '../lib/formatters'
import { useRevelado } from '../hooks/useRevelado'

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
  return partesConTerminos(frase).map((p, i) =>
    typeof p === 'string' ? (
      <Fragment key={i}>{p}</Fragment>
    ) : (
      <button
        key={i}
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
    ),
  )
}

/**
 * La definición abierta. Las tres claves van literales: el guard de
 * `i18n-catalogue` lee las llamadas, no las claves compuestas.
 */
function Definicion({ clave, id, onCerrar }) {
  const t = useT()
  const textos = {
    creditoDefinitivo: [
      t('glosario.creditoDefinitivo.termino'),
      t('glosario.creditoDefinitivo.def'),
    ],
    obligacionesReconocidas: [
      t('glosario.obligacionesReconocidas.termino'),
      t('glosario.obligacionesReconocidas.def'),
    ],
    deudaViva: [t('glosario.deudaViva.termino'), t('glosario.deudaViva.def')],
  }[clave]
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
      <a href={ancla} className="cp-en-breve-ancla">
        {anclaTexto}
      </a>
    </article>
  )
}

/**
 * El bloque entero. `children` son las tarjetas; `pie` va debajo de la
 * rejilla, a todo el ancho (la advertencia del mapa en /presupuesto).
 *
 * @param {{
 *   titulo: string,
 *   intro: string,
 *   saltarA: string,
 *   saltarTexto: string,
 *   children: import('react').ReactNode,
 *   pie?: import('react').ReactNode,
 * }} props
 */
export default function EnBreve({ titulo, intro, saltarA, saltarTexto, children, pie }) {
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
      <div className="cp-en-breve-rejilla">{children}</div>
      {pie}
    </section>
  )
}
