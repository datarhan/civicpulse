/**
 * El rótulo de «N plazos vencidos», en singular o en plural y en el idioma de
 * la página.
 *
 * Lo piden el bloque de la portada, el chip del tícker y /departamentos. Hasta
 * ahora cada uno lo escribía a su manera, y dos de los tres lo tenían en
 * castellano y en plural fijo: «⚠ 1 plazos vencidos», también en valencià.
 *
 * @param {number} n  cuántos plazos vencidos hay
 * @param {(key: string) => string} t  la función de traducción de la página
 */
export function rotuloPlazosVencidos(n, t) {
  return n === 1 ? t('departamentos.plazoVencido') : t('liveTicker.plazosVencidos')
}
