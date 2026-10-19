/**
 * Parte una cita en trozos, marcando los que la pieza subraya.
 *
 * Un subrayado es énfasis NUESTRO sobre palabras de otro: no cambia ni una, y
 * el pie lo dice («subrayado nuestro»). Por eso cada frase tiene que estar en
 * la cita tal cual, y una sola vez —si aparece dos, ¿cuál subrayamos?—, y dos
 * frases no pueden pisarse. Si no se cumple, lanza: un subrayado que no casa
 * con la cita no se pinta a medias, se arregla en la instantánea.
 *
 * @param {string} texto  la cita literal
 * @param {string[]} frases  trozos de `texto` que se subrayan
 * @returns {Array<{ t: string, resalte: boolean }>}  los trozos, en orden; unidos dan `texto`
 */
export function trozosResaltados(texto, frases) {
  const tramos = frases
    .map((f) => {
      const desde = texto.indexOf(f)
      if (!f || desde < 0) throw new Error(`resaltar: «${f}» no está en la cita`)
      if (texto.indexOf(f, desde + 1) >= 0)
        throw new Error(`resaltar: «${f}» aparece más de una vez en la cita`)
      return { desde, hasta: desde + f.length }
    })
    .sort((a, b) => a.desde - b.desde)
  for (let i = 1; i < tramos.length; i++) {
    if (tramos[i].desde < tramos[i - 1].hasta) throw new Error('resaltar: dos frases se pisan')
  }
  const out = []
  let cursor = 0
  for (const { desde, hasta } of tramos) {
    if (desde > cursor) out.push({ t: texto.slice(cursor, desde), resalte: false })
    out.push({ t: texto.slice(desde, hasta), resalte: true })
    cursor = hasta
  }
  if (cursor < texto.length) out.push({ t: texto.slice(cursor), resalte: false })
  return out
}

/**
 * Parte un texto en trozos, enlazando cada mención de otra pieza.
 *
 * A diferencia de `trozosResaltados`, aquí cero o varias apariciones son lo
 * normal: la instantánea declara los enlaces una vez y cada párrafo enlaza los
 * que nombra. Que el título siga siendo el de la otra pieza lo comprueba
 * `tests/resaltar.test.js`, que es donde un enlace roto se pone rojo.
 *
 * @param {string} texto
 * @param {Array<{ texto: string, a: string }> | undefined} enlaces
 * @returns {Array<{ t: string, a?: string }>}  los trozos, en orden; unidos dan `texto`
 */
export function trozosEnlazados(texto, enlaces) {
  const tramos = []
  for (const { texto: f, a } of enlaces ?? []) {
    for (let desde = texto.indexOf(f); f && desde >= 0; desde = texto.indexOf(f, desde + f.length))
      tramos.push({ desde, hasta: desde + f.length, a })
  }
  tramos.sort((x, y) => x.desde - y.desde)
  const out = []
  let cursor = 0
  for (const { desde, hasta, a } of tramos) {
    if (desde < cursor) continue
    if (desde > cursor) out.push({ t: texto.slice(cursor, desde) })
    out.push({ t: texto.slice(desde, hasta), a })
    cursor = hasta
  }
  if (cursor < texto.length || !out.length) out.push({ t: texto.slice(cursor) })
  return out
}
