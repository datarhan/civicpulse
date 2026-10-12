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

/**
 * El nombre accesible del chip del tícker, con la misma distinción de número.
 *
 * El rótulo visible ya decía «1 plazo vencido» y el `aria-label` del mismo
 * botón seguía diciendo «1 compromisos municipales con plazo vencido»: la
 * frase que oye quien navega con lector de pantalla era justo la que este
 * módulo existe para arreglar.
 *
 * @param {number} n  cuántos plazos vencidos hay
 * @param {(key: string) => string} t  la función de traducción de la página
 */
export function ariaPlazosVencidos(n, t) {
  return n === 1
    ? t('liveTicker.plazosVencidos.aria.uno')
    : t('liveTicker.plazosVencidos.aria').replace('{n}', String(n))
}

/**
 * La celda «Plazos vencidos» de un área, en /departamentos y en su ficha.
 *
 * Sólo cuenta lo que lleva un `dueBy` curado, y la mayoría de las áreas no lleva
 * ninguno: las promesas casi nunca traen fecha en un campo, y los votos sólo la
 * traen con una cita literal del acta. Ahí «0» se leía «aquí no ha vencido
 * nada» cuando lo único sabido era que nada tenía fecha. El 2026-10-12
 * /departamentos/urbanismo decía «Plazos vencidos 0» con, en la misma página,
 * un anuncio «En progreso» que prometía la convocatoria «el próximo mes de
 * septiembre» —un plazo en la cita y en ningún campo—. Así que: sin ningún
 * compromiso fechado, «—» y el motivo; con alguno, la cifra con su denominador.
 *
 * Durante la veda electoral (`frozen`) no se da cifra ni motivo, como antes.
 *
 * @param {{ plenoVotes: { plazosVencidos: number, conPlazo: number },
 *           promesas: { plazosVencidos: number, conPlazo: number } }} bucket
 * @param {(key: string) => string} t  la función de traducción de la página
 * @param {{ frozen?: boolean }} [opts]
 * @returns {{ value: number | string, sub?: string, tone?: 'warn', muted: boolean }}
 */
export function celdaPlazosVencidos(bucket, t, { frozen = false } = {}) {
  if (frozen) return { value: '—', muted: true }
  const conPlazo = (bucket.plenoVotes.conPlazo ?? 0) + (bucket.promesas.conPlazo ?? 0)
  if (conPlazo === 0) {
    return { value: '—', sub: t('departamentos.card.sinPlazoFechado'), muted: true }
  }
  const vencidos = bucket.plenoVotes.plazosVencidos + bucket.promesas.plazosVencidos
  return {
    value: vencidos,
    sub: t('departamentos.card.deConPlazo').replace('{n}', String(conPlazo)),
    tone: vencidos > 0 ? 'warn' : undefined,
    muted: vencidos === 0,
  }
}
