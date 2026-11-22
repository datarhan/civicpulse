// @ts-check
/**
 * Las líneas de una tarjeta de /cambios que pone la página y no los datos: el
 * subtítulo y el texto que se comparte por WhatsApp.
 *
 * Las armaba `useCambios` con las tablas en castellano de los hooks
 * (`STATE_LABEL`, `CATEGORY_LABEL`, `KIND_LABEL`), que dan el castellano a
 * propósito para las páginas aún sin traducir. Pero /cambios está traducida, y
 * en valencià la tarjeta decía «Queja RR-… · Limpieza», «Contrato adjudicado ·
 * …» o «Sesión ordinario» entre rótulos en valencià. Ahora el hook entrega los
 * códigos y esto los rotula en el idioma de la interfaz.
 *
 * Lo que viene de los datos —el título de un contrato, la descripción de una
 * queja, el órgano de una subvención, el nombre de un barrio— sigue en su
 * idioma de origen, como en el resto del sitio.
 *
 * El castellano es el de antes palabra por palabra, salvo la sesión de un
 * pleno: «Sesión ordinario» no concordaba, y «Sesión otro» no decía nada
 * (`tests/cambios-rotulos.test.js`).
 */
import { rotuloDe } from '../i18n'
import { estadoLlano } from './estado-llano'
import { euros, rellena } from './formatters'

/** @typedef {(clave: string) => string} T */

/** @param {T} t @param {string | null | undefined} codigo */
const categoriaDeQueja = (t, codigo) =>
  codigo ? rotuloDe(t, `quejas.categoria.${codigo}`, codigo) : null

/**
 * La clase de una entrada del portal de participación, o null si no tiene
 * rótulo: un código no se imprime (`estadoLlano`). Las tres que trae hoy el
 * portal lo tienen.
 *
 * @param {T} t @param {string | null | undefined} tipo
 */
const tipoDeParticipacion = (t, tipo) =>
  tipo ? (rotuloDe(t, `participa.tipo.${tipo}`, null) ?? null) : null

/**
 * El subtítulo de la tarjeta, o null si no tiene.
 *
 * @param {T} t
 * @param {any} it
 * @returns {string | null}
 */
export function subtituloDe(t, it) {
  switch (it.kind) {
    case 'queja':
      return (
        [categoriaDeQueja(t, it.categoria), it.barrio, estadoLlano(t, 'queja', it.estado)]
          .filter(Boolean)
          .join(' · ') || null
      )
    case 'pleno':
      // «otro» es lo que `classify` devuelve cuando el título no dice la clase:
      // no es una clase, y se rotula como una sesión sin ella.
      return it.tipoSesion && it.tipoSesion !== 'otro'
        ? rotuloDe(t, `cambios.sesion.${it.tipoSesion}`, t('cambios.sesion.municipal'))
        : t('cambios.sesion.municipal')
    case 'subvencion':
      return it.organo ?? null
    case 'participa':
      return tipoDeParticipacion(t, it.tipo)
    default:
      return it.subtitle ?? null
  }
}

/**
 * El texto que se comparte por WhatsApp.
 *
 * @param {T} t
 * @param {any} it
 * @returns {string}
 */
export function textoParaCompartir(t, it) {
  switch (it.kind) {
    case 'queja':
      return `${rellena(t('cambios.compartir.queja'), {
        id: it.id,
        categoria: categoriaDeQueja(t, it.categoria) ?? '',
      })}\n${(it.descripcion || '').slice(0, 160)}`
    case 'pleno':
      return `${it.title} — ${it.date}`
    case 'licitacion':
      return `${t('cambios.kind.licitacion')} · ${it.title}${
        it.importe != null
          ? ` · ${rellena(t('importe.sinIva'), { importe: euros(it.importe) })}`
          : ''
      }`
    case 'subvencion':
      return `${t('cambios.kind.subvencion')} · ${it.title}`
    case 'participa':
      return `${tipoDeParticipacion(t, it.tipo) || t('participa.tipo.desconocido')} · ${it.title}`
    default:
      return it.shareText ?? ''
  }
}
