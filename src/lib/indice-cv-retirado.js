// @ts-check
/**
 * La página de currículos que el portal retiró, tal como la leyó este sitio.
 *
 * Hasta la mudanza del portal (septiembre de 2026) los currículos de la
 * corporación colgaban de UNA página del portal de transparencia, «Datos
 * biográficos del alcalde/sa y concejales» (`RETIRED_CV_INDEX_RE`, en
 * `journalist-facts.js`), que hoy contesta 403. `scrape:transparency` la leía
 * cada noche y publicaba lo leído en `transparency-docs.json`, fuente `cv`. La
 * historia de ese fichero es el único registro de qué enlazaba: **67 lecturas
 * buenas entre el 19-06 y el 1-09-2026, las 67 con los mismos 17 PDF**. De
 * antes del 19-06 no hay copia: la página no está en el Internet Archive.
 *
 * Se congela aquí porque ya no se puede volver a leer: la página no existe, el
 * fichero publicado ya no trae la fuente `cv`, y la CI clona sin historia. Se
 * sacó el 28-09-2026 recorriendo `git log -- public/data/transparency-docs.json`
 * con un script de usar y tirar; la misma cuenta está escrita en /metodologia.
 *
 * `presentes` y `ausentes` son slugs de quien ocupaba cada escaño durante esas
 * lecturas. Quien llegó después, o se fue antes —Soraya Trejo Delgado renunció
 * en 2025—, no está en ninguna de las dos listas, y de ellos el registro no
 * dice nada. `pedro-tortajada-raga`, su relevo, sí ocupaba el escaño aunque el
 * padrón publicado aún no lo recogiera (la web iba con retraso hasta el 8-09).
 *
 * El cruce título → persona se hizo con `titleNamesOfficial` y se revisó a
 * mano, y por eso no se recalcula en el navegador: «Dades biogràfiques Rafa
 * Folgado Navarro» no casa con «Rafael Folgado Navarro», y el cruce automático
 * le habría negado a un concejal un currículo que sí estaba.
 *
 * Lo que se publica con esto, en `/cargos/:slug`, es un hecho sobre lo que
 * publicaba el Ayuntamiento, nunca sobre la persona: una ausencia en la página
 * vieja no dice por qué faltaba.
 */
export const INDICE_CV_RETIRADO = Object.freeze({
  lecturas: 67,
  primera: '2026-06-19',
  ultima: '2026-09-01',
  documentos: 17,
  /** Escaños cuyo currículo figuró en las 67 lecturas. */
  presentes: Object.freeze([
    'alberto-gimeno-calvo',
    'alfredo-pla-gimenez',
    'david-barbancho-martinez',
    'eva-lara-catala',
    'jose-angel-hernandez-carrizosa',
    'jose-luis-fernandez-santamaria',
    'jose-luis-ramos-march',
    'jose-manuel-gallardo-martinez',
    'jose-manuel-vila-oltra',
    'maria-esther-gomez-laredo',
    'maria-jose-pradas-ramo',
    'rafael-folgado-navarro',
    'rafael-gomez-sanchez',
    'raquel-pamblanco-paredes',
    'robert-raga-gadea',
    'salvador-evaristo-ferrer-cortina',
    'teresa-pozuelo-martin',
  ]),
  /** Escaños ocupados durante las lecturas cuyo currículo no figuró en NINGUNA. */
  ausentes: Object.freeze([
    'juan-boix-martinez',
    'laura-guzman-bruno',
    'paula-navarro-sanfeliu',
    'pedro-tortajada-raga',
  ]),
})

/**
 * Qué dice el registro de la página retirada sobre el currículo de este
 * escaño: `'presente'`, `'ausente'`, o `null` si el registro no lo alcanza.
 * `null` no es «ausente»: es que no hay nada que decir.
 *
 * @param {string | null | undefined} slug
 * @returns {'presente' | 'ausente' | null}
 */
export function enIndiceRetirado(slug) {
  if (!slug) return null
  if (INDICE_CV_RETIRADO.presentes.includes(slug)) return 'presente'
  if (INDICE_CV_RETIRADO.ausentes.includes(slug)) return 'ausente'
  return null
}
