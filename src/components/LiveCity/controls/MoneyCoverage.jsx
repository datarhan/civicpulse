// @ts-check
import { useT } from '../../../i18n'
import { yearSpan } from '../../../lib/year-span'
import { rellena, eurosBreves } from '../../../lib/formatters'

/**
 * Qué parte de la contratación municipal puede enseñar este mapa.
 *
 * La capa se llamaba «Gasto municipal» y pintaba un porcentaje de un solo dígito
 * de la contratación municipal sin decirlo en ningún sitio. Cada chincheta era
 * escrupulosa (las puertas del place-resolver se quedan cortas a propósito: un
 * fallo honrado gana a una chincheta falsa), pero el CONJUNTO se leía como si
 * fuera completo. En un proyecto cuya credibilidad descansa en sus puertas de
 * honradez, era la única superficie donde la disciplina se paraba en la chincheta.
 *
 * Y el hueco no es trabajo pendiente. Casi todo el dinero municipal son
 * servicios de ámbito municipal —la recogida de residuos, los parques, la
 * limpieza viaria, la ayuda a domicilio, los comedores— que no tienen un punto.
 * Pincharlos sería FALSO, así que el techo honrado de un mapa de puntos es una
 * fracción, no el 100 %. Decirlo convierte el límite en el hallazgo que es: casi
 * todo lo que el pueblo gasta no tiene dirección.
 *
 * El numerador es `situatedAmount`, el total de las asignaciones con `place`
 * —las mismas de las que salen las chinchetas (`placeAmountsAt`), con los
 * filtros apagados y el cursor al final—, y no
 * `locatedAmount`, que suma los contratos con ZONA y es el del medidor de
 * /presupuesto. Las cifras salen del bloque `universe` de `tender-geo.json`,
 * nunca escritas a mano, para que no se separen de las chinchetas de al lado.
 *
 * Con la pila plegada (a 375 px, DirectionD.jsx) la línea de las cifras es lo que
 * queda a la vista de toda la tarjeta, así que el botón de detalle va dentro de ella
 * (`accion`). El margen y el borde de arriba viven en la clase `cp-cobertura` y no en
 * el style: plegada, la línea pierde el borde, y un style gana a cualquier clase.
 */

// toFixed() would print "3.3%" — an English decimal point in a Spanish UI,
// sitting directly beside euro figures that Intl correctly renders as "2,2 M€".
const fmtPct = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n)

/**
 * Cuántos de cada 100 € contratados sitúa el mapa, con la regla de la tarjeta
 * del barrio (`en-breve-presupuesto`): redondeado, y «menos de 1» por debajo de
 * medio euro. null si la línea no se pinta. Exportado para que esa tarjeta, que
 * mide otra cosa a unos píxeles, cite la misma cifra que el lector ve aquí.
 *
 * @param {{ situatedAmount?: number, totalAmount?: number } | null | undefined} u
 * @returns {{ deCada100: number, menosDeUno: boolean } | null}
 */
export function deCada100DelMapa(u) {
  if (!u || !u.totalAmount || !u.situatedAmount) return null
  const pct = (100 * u.situatedAmount) / u.totalAmount
  return { deCada100: Math.round(pct), menosDeUno: pct < 0.5 }
}

/**
 * @param {{ snapshot?: { universe?: { situatedAmount?: number, totalAmount?: number,
 *   dateMin?: string|null, dateMax?: string|null, totalDateMin?: string|null,
 *   totalDateMax?: string|null } },
 *   accion?: import('react').ReactNode }} props
 */
export function MoneyCoverage({ snapshot, accion = null }) {
  const t = useT()
  const u = snapshot?.universe
  // Sin bloque `universe` no se dice nada, en vez de insinuar una cobertura que
  // no podemos respaldar.
  // Las chinchetas de la portada son las asignaciones con `place`
  // (placeAmountsAt), y su total es `situatedAmount`. Hasta el 15-10-2026 esta
  // línea imprimía `locatedAmount` —las ZONAS de /presupuesto— y declaraba un
  // tercio de lo que el mapa pintaba al lado.
  const cobertura = deCada100DelMapa(u)
  if (!cobertura || !u?.totalAmount || !u.situatedAmount) return null
  const pct = (100 * u.situatedAmount) / u.totalAmount
  // El periodo es el del DENOMINADOR: `totalDateMin`/`totalDateMax` abarcan todos
  // los contratos que suma `totalAmount`, y no sólo los que tienen sitio en el
  // mapa (eso es `dateMin`/`dateMax`, que mueve el deslizador). Así el periodo
  // nunca describe un conjunto distinto del de la cifra. La franja de KPIs de la
  // portada publica unos centenares de píxeles más abajo el presupuesto de un
  // solo año, y un acumulado de nueve cifras sin fecha al lado de un presupuesto
  // anual es justo la comparación que esta línea existe para impedir. Un
  // snapshot anterior a esos campos cae en `dateMin`/`dateMax`.
  const span = yearSpan([u.totalDateMin ?? u.dateMin, u.totalDateMax ?? u.dateMax])
  const HUECO = '\u0000'
  const [antes, despues = ''] = rellena(t('map.money.deCada100'), {
    periodo: HUECO,
    n: cobertura.menosDeUno ? t('map.money.menosDeUno') : cobertura.deCada100,
  }).split(HUECO)

  // La razón exacta, en euros, como la imprimía esta línea: va en el `title` de
  // la frase y no en una línea propia, porque la pila crece hacia arriba sobre el
  // mapa y cada línea de más tapaba una estación (landing.spec.ts).
  const exacta = rellena(t('map.money.exacta'), {
    situado: eurosBreves(u.situatedAmount),
    total: eurosBreves(u.totalAmount),
    periodo: span ? ` (${span})` : '',
    pct: pct < 1 ? '<1' : fmtPct(pct),
  })

  // La frase en palabras de vecino es lo que queda a la vista con la pila
  // plegada: la declaración de honestidad de la capa no se pliega nunca, y con
  // ella va su periodo. En el detalle, la nota de por qué el resto no tiene sitio
  // en un mapa.
  return (
    <div
      className="cp-cobertura"
      style={{
        fontFamily: "'Outfit', system-ui, sans-serif",
        fontSize: 'var(--fs-aux)',
        lineHeight: 1.4,
        color: 'rgba(11,15,25,.72)',
      }}
    >
      <div title={exacta} style={{ color: 'rgba(11,15,25,.86)', fontWeight: 600 }}>
        {antes}
        {/* El periodo, de una pieza: partido por el guion, «(2017–» acababa una
            línea y «2026)» empezaba la siguiente. */}
        {span ? (
          <>
            {' '}
            <span style={{ whiteSpace: 'nowrap' }}>({span})</span>
          </>
        ) : null}
        {despues}
        {accion}
      </div>
      <div id="cp-dinero-nota" className="cp-plegable" style={{ marginTop: 3 }}>
        {t('map.money.coverage')}
      </div>
    </div>
  )
}
