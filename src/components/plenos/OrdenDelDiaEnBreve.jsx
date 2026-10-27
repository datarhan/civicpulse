import { TarjetaEnBreve } from '../EnBreve'
import { rellena } from '../../lib/formatters'
import { useLocale } from '../../i18n'

/*
 * El orden del día de una sesión en palabras llanas: la tarjeta que comparten
 * «El último pleno» de /plenos y el «Resumen» de /plenos/:id, para que las dos
 * capas cuenten las partes con las mismas palabras y la misma regla.
 *
 * «Para decidir» rotula lo que se llevó a votar, no lo que se aprobó: el
 * resultado de cada punto sólo consta en las votaciones que hemos transcrito.
 * Las palabras de las partes llevan su entrada del glosario en el catálogo
 * (`[[parteResolutiva|…]]`); las del título no pueden, porque el título es
 * literal, y la sesión las nombra aparte (`vocabulario`).
 */

export function lista(partes, locale) {
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(partes)
}

/** Los puntos de una parte, con su etiqueta llana; el título entero en `title`. */
function Puntos({ rotulo, puntos, urgente }) {
  if (puntos.length === 0) return null
  return (
    <div className="cp-plenos-puntos">
      <h4 className="cp-plenos-puntos-rotulo">{rotulo}</h4>
      <ol>
        {puntos.map((p) => (
          <li key={p.numero}>
            <span className="mono cp-plenos-puntos-numero">{p.numero}.</span>
            {/* La marca de urgencia va fuera del texto recortado: dentro, un
                título largo la escondía detrás de los puntos suspensivos. */}
            <span>
              <span className="cp-plenos-puntos-texto" title={p.titulo}>
                {p.texto}
              </span>
              {p.urgente && <span className="cp-plenos-puntos-urgente">{urgente}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Las claves literales de cada palabra: el guard del catálogo lee las llamadas. */
const PALABRA = {
  mocion: 'plenos.palabra.mocion',
  reconocimientoExtrajudicial: 'plenos.palabra.reconocimientoExtrajudicial',
  sinDictaminar: 'plenos.palabra.sinDictaminar',
  urgencia: 'plenos.palabra.urgencia',
}

/**
 * @param {{
 *   id: string,
 *   pregunta: string,
 *   ordenDelDia: import('../../scraper/en-breve-plenos').OrdenDelDiaEnBreve | null,
 *   cifra?: string,
 *   cifraNota?: string,
 *   vocabulario?: import('../../scraper/en-breve-plenos').PalabraDelPleno[],
 *   ancla?: string,
 *   anclaTexto?: string,
 * }} props
 */
export function TarjetaOrdenDelDia({
  id,
  pregunta,
  ordenDelDia: o,
  cifra,
  cifraNota,
  vocabulario = [],
  ancla,
  anclaTexto,
}) {
  const { t, locale } = useLocale()
  const partes = o
    ? [
        o.decidir.length > 0 && rellena(t('plenos.enBreve.parte.decidir'), { n: o.decidir.length }),
        o.informes.length > 0 &&
          rellena(
            t(
              o.informes.length === 1
                ? 'plenos.enBreve.parte.informes.uno'
                : 'plenos.enBreve.parte.informes',
            ),
            { n: o.informes.length },
          ),
        o.otros.length > 0 && rellena(t('plenos.enBreve.parte.otros'), { n: o.otros.length }),
        o.ruegos && t('plenos.enBreve.parte.ruegos'),
      ].filter(Boolean)
    : []
  const palabras =
    o && vocabulario.length > 0
      ? rellena(t('plenos.vocabulario'), {
          lista: lista(
            vocabulario.map((p) => `[[${p}|${t(PALABRA[p])}]]`),
            locale,
          ),
        })
      : undefined
  return (
    <TarjetaEnBreve
      id={id}
      pregunta={pregunta}
      cifra={cifra}
      cifraNota={cifraNota}
      frases={[
        o
          ? rellena(
              t(o.total === 1 ? 'plenos.enBreve.orden.total.uno' : 'plenos.enBreve.orden.total'),
              { n: o.total, partes: lista(partes, locale) },
            )
          : t('landing.enBreve.pleno.sinPuntos'),
      ]}
      detalle={
        o && (
          <>
            <Puntos
              rotulo={t('plenos.enBreve.orden.decidir')}
              puntos={o.decidir}
              urgente={t('plenos.enBreve.urgente')}
            />
            <Puntos
              rotulo={t('plenos.enBreve.orden.informes')}
              puntos={o.informes}
              urgente={t('plenos.enBreve.urgente')}
            />
            <Puntos
              rotulo={t('plenos.enBreve.orden.otros')}
              puntos={o.otros}
              urgente={t('plenos.enBreve.urgente')}
            />
          </>
        )
      }
      pie={palabras}
      ancla={ancla}
      anclaTexto={anclaTexto}
    />
  )
}
