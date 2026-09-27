import { cardinalEn, cardinalEs, fmtTheta } from '../../scraper/dea-sensibilidad'

/**
 * Las frases que cuentan cuánto mueve la cesta la puntuación de Riba-roja: en
 * la advertencia de /laboratorio/frontera, en /metodologia, en /nosotros y en
 * /about.
 *
 * Viven juntas porque son la misma afirmación en cuatro registros, y cuatro
 * copias escritas a mano ya dijeron «media escala» durante seis semanas sobre
 * un dato que daba una décima (ver `src/scraper/dea-sensibilidad.ts`). Cada
 * una sale de `sensibilidadCestas` y cae a una frase sin cifras mientras el
 * snapshot no ha llegado, si falla, o si el dato no da para medir: nunca
 * afirma un movimiento que el fichero no trae.
 *
 * Las cestas sin puntuación se cuentan sin decir por qué. Hay dos motivos —no
 * llegan a grados de libertad, o Riba-roja no declara la cesta completa— y la
 * tarjeta de cada una en /laboratorio/frontera dice el suyo.
 */

const LABORATORIO = '/laboratorio/frontera'

const seMueve = (s) => (s.puestos?.movimiento ?? 0) > 0

/** «seis puestos», «un puesto»; «hasta» si hay más de una pareja de cestas comparable. */
const puestosEs = ({ movimiento, pares }) =>
  `${pares > 1 ? 'hasta ' : ''}${cardinalEs(movimiento, 'm')} ${movimiento === 1 ? 'puesto' : 'puestos'}`

const placesEn = ({ movimiento, pares }) =>
  `${pares > 1 ? 'up to ' : ''}${cardinalEn(movimiento)} ${movimiento === 1 ? 'place' : 'places'}`

/**
 * La cola de «Esta página publica el resultado de un modelo con decisiones
 * nuestras dentro», en la advertencia de /laboratorio/frontera.
 *
 * Va ANTES de la medición de la declaración, así que no lleva cifras —la regla
 * 1 de la página: ninguna puntuación antes que eso—. Dice QUÉ se mueve; cuánto
 * lo dicen las tarjetas de abajo.
 */
export function AvisoCestas({ s }) {
  const puntuacion = Boolean(s.theta?.cambia)
  const puesto = seMueve(s)
  if (!puntuacion && !puesto) return null
  const que =
    puntuacion && puesto
      ? 'la puntuación de Riba-roja y su puesto entre los comparables'
      : puntuacion
        ? 'la puntuación de Riba-roja'
        : 'el puesto de Riba-roja entre los comparables'
  return <>, y con la misma fuente otra cesta de servicios igual de defendible cambia {que}</>
}

/**
 * /metodologia, tarjeta #frontera: la medición entera, con sus cifras. Es el
 * contrato editorial, y aquí la precisión va antes que la brevedad.
 */
export function MedicionCestas({ s }) {
  const { probadas, conPuntuacion, theta, puestos } = s
  if (probadas === 0) return null
  const cestas = `Con la misma fuente probamos ${cardinalEs(probadas, 'f')} ${
    probadas === 1 ? 'cesta' : 'cestas'
  } de servicios`

  if (!theta) {
    // Con dos o más publicadas y sin θ el snapshot está roto: `check:dea` lo
    // caza antes del despliegue, y esta frase no afirma nada entretanto.
    if (conPuntuacion > 1) return null
    return (
      <>
        {cestas} y {conPuntuacion === 0 ? 'ninguna llega' : 'sólo una llega'} a dar puntuación, así
        que no hay dos que comparar.
      </>
    )
  }

  const sinPuntuacion = probadas - conPuntuacion
  const reparto =
    sinPuntuacion === 0
      ? ', y todas dan puntuación: entre ellas'
      : `: ${cardinalEs(sinPuntuacion, 'f')} no ${sinPuntuacion === 1 ? 'llega' : 'llegan'} a dar puntuación, y entre las ${cardinalEs(conPuntuacion, 'f')} que sí,`
  const distancia = theta.cambia
    ? `la distancia de Riba-roja a la frontera va de ${fmtTheta(theta.min)} a ${fmtTheta(theta.max)} según la cesta`
    : `la distancia de Riba-roja a la frontera es ${fmtTheta(theta.min)} en ${conPuntuacion === 2 ? 'las dos' : 'todas'}`
  const salto = seMueve(s)
    ? ` y el municipio se mueve ${puestosEs(puestos)} en una clasificación de ${puestos.de}`
    : ''
  return (
    <>
      {cestas}
      {reparto} {distancia}
      {salto}.
    </>
  )
}

/**
 * /nosotros: por qué aquí no hay notas. La cifra que se da es cuánto se MUEVE
 * Riba-roja, nunca dónde está: esta página dice que no publica una nota, y
 * decir «puntúa 0,53» o «va de las últimas» sería publicarla.
 */
export function ClasificacionSinNota({ s }) {
  const enlace = (
    <a href={LABORATORIO} style={{ color: 'var(--civic)' }}>
      el laboratorio
    </a>
  )
  if (!seMueve(s)) {
    return (
      <>
        Una puntuación así depende de decisiones nuestras, como qué servicios entran en la
        comparación, y en {enlace} publicamos cuánto.
      </>
    )
  }
  return (
    <>
      Lo hemos medido en {enlace}: con los mismos datos, basta cambiar qué servicios entran en la
      comparación para que Riba-roja se mueva {puestosEs(s.puestos)} en una clasificación de{' '}
      {s.puestos.de} municipios, así que una nota diría más de nuestras decisiones que de tu pueblo.
    </>
  )
}

/** /about, la misma frase para quien lee en inglés. */
export function RankingNoScore({ s }) {
  if (!seMueve(s)) {
    return (
      <>
        Such a score depends on choices we make, such as which services enter the comparison, and
        our lab publishes by how much.
      </>
    )
  }
  return (
    <>
      On the same data, changing which services enter the comparison moves Riba-roja{' '}
      {placesEn(s.puestos)} in a ranking of {s.puestos.de} municipalities, so a score would say more
      about our choices than about the town.
    </>
  )
}
