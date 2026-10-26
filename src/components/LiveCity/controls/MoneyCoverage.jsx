// @ts-check
import { useT } from '../../../i18n'
import { yearSpan } from '../../../lib/year-span'

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

const fmtM = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: n >= 1e6 ? 1 : 0,
    notation: 'compact',
  }).format(n)

// toFixed() would print "3.3%" — an English decimal point in a Spanish UI,
// sitting directly beside euro figures that Intl correctly renders as "2,2 M€".
const fmtPct = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n)

/**
 * El porcentaje tal como lo imprime esta línea («7», «7,4», «<1»), o null si no
 * se imprime. Exportado para que la tarjeta del barrio de la portada, que mide
 * otra cosa justo al lado, cite la misma cifra que el lector ve en el mapa.
 *
 * @param {{ situatedAmount?: number, totalAmount?: number } | null | undefined} u
 */
export function porcentajeDelMapa(u) {
  if (!u || !u.totalAmount || !u.situatedAmount) return null
  const pct = (100 * u.situatedAmount) / u.totalAmount
  return pct < 1 ? '<1' : fmtPct(pct)
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
  const pct = porcentajeDelMapa(u)
  if (pct == null) return null
  // El periodo es el del DENOMINADOR: `totalDateMin`/`totalDateMax` abarcan todos
  // los contratos que suma `totalAmount`, y no sólo los que tienen sitio en el
  // mapa (eso es `dateMin`/`dateMax`, que mueve el deslizador). Así el periodo
  // nunca describe un conjunto distinto del de la cifra. La franja de KPIs de la
  // portada publica unos centenares de píxeles más abajo el presupuesto de un
  // solo año, y un acumulado de nueve cifras sin fecha al lado de un presupuesto
  // anual es justo la comparación que esta línea existe para impedir. Un
  // snapshot anterior a esos campos cae en `dateMin`/`dateMax`.
  const span = yearSpan([u.totalDateMin ?? u.dateMin, u.totalDateMax ?? u.dateMax])

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
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-micro)', color: 'rgba(11,15,25,.86)', fontWeight: 700 }}
      >
        {fmtM(u.situatedAmount)} {t('map.money.of')} {fmtM(u.totalAmount)}
        {span ? ` (${span})` : ''} · {pct}%{accion}
      </div>
      <div id="cp-dinero-nota" className="cp-plegable" style={{ marginTop: 3 }}>
        {t('map.money.coverage')}
      </div>
    </div>
  )
}
