import EnBreve, { TarjetaEnBreve } from '../EnBreve'
import { useT } from '../../i18n'

/*
 * «En breve» de /metodologia: cinco preguntas de confianza —de dónde sale el
 * dato, quién lo publica, cómo se comprueba, si ponemos nota, qué pasa si nos
 * equivocamos— encima del contrato editorial.
 *
 * Esta página ES el contrato editorial publicado (CLAUDE.md), así que el
 * resumen no puede decir nada que la regla de abajo no diga: cada respuesta es
 * una regla ya escrita en la página, dicha en corto, y enlaza a ella. No
 * resume plazos ni cifras: las cifras de una regla viven en la regla, y una
 * copia aquí se quedaría vieja el día que la regla cambie.
 *
 * El recorrido de arriba es la misma idea en dibujo: lo que le pasa a un dato
 * desde la fuente hasta que alguien puede pedir que se corrija.
 */

function Recorrido() {
  const t = useT()
  const pasos = [
    t('metodologia.enBreve.paso.1'),
    t('metodologia.enBreve.paso.2'),
    t('metodologia.enBreve.paso.3'),
    t('metodologia.enBreve.paso.4'),
    t('metodologia.enBreve.paso.5'),
  ]
  return (
    <div className="cp-en-breve-recorrido">
      <span className="cp-en-breve-recorrido-linea cp-crece-x" aria-hidden="true" />
      <ol aria-label={t('metodologia.enBreve.recorrido')}>
        {pasos.map((p, i) => (
          <li key={i}>
            <span className="cp-en-breve-recorrido-punto mono cp-brota" style={{ '--i': i * 2 }}>
              {i + 1}
            </span>
            <span className="cp-en-breve-recorrido-rotulo">{p}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function EnBreveMetodologia() {
  const t = useT()
  const leer = t('metodologia.enBreve.ver')
  return (
    <EnBreve
      titulo={t('metodologia.enBreve.titulo')}
      intro={t('metodologia.enBreve.intro')}
      saltarA="#principios"
      saltarTexto={t('metodologia.enBreve.saltar')}
      figura={<Recorrido />}
    >
      <TarjetaEnBreve
        id="fuentes"
        pregunta={t('metodologia.enBreve.fuentes.pregunta')}
        frases={[t('metodologia.enBreve.fuentes.frase')]}
        ancla="/datos"
        anclaTexto={t('metodologia.enBreve.fuentes.ver')}
      />
      <TarjetaEnBreve
        id="maquina"
        pregunta={t('metodologia.enBreve.maquina.pregunta')}
        frases={[t('metodologia.enBreve.maquina.frase')]}
        ancla="#politica-automatizacion"
        anclaTexto={leer}
      />
      <TarjetaEnBreve
        id="comprobar"
        pregunta={t('metodologia.enBreve.comprobar.pregunta')}
        frases={[t('metodologia.enBreve.comprobar.frase')]}
        ancla="#principios"
        anclaTexto={leer}
      />
      <TarjetaEnBreve
        id="nota"
        pregunta={t('metodologia.enBreve.nota.pregunta')}
        frases={[t('metodologia.enBreve.nota.frase')]}
        ancla="#frontera"
        anclaTexto={leer}
      />
      <TarjetaEnBreve
        id="error"
        pregunta={t('metodologia.enBreve.error.pregunta')}
        frases={[t('metodologia.enBreve.error.frase')]}
        ancla="#rectificacion"
        anclaTexto={leer}
      />
    </EnBreve>
  )
}
