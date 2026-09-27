/**
 * El id de una queja: «Q-» y ocho caracteres de base32 de Crockford, el final de
 * un ULID. Un solo sitio para crearlo y para leerlo.
 *
 * Había cuatro copias del lector. Las de `/estado`, `/apoyar` y `/escalar`
 * quitaban una Q inicial y tomaban el resto como sufijo, pero el sufijo puede
 * empezar por Q —el alfabeto de Crockford la tiene— y el atajo que imprime el
 * propio bot, `/estado_qrst0123`, llevaba a `Q-RST0123`: a otra queja o a «no
 * encuentro», una de cada 32. La de `/olvidar` sólo aceptaba el id con su «Q-».
 */
import { monotonicFactory } from 'ulid'

const ulidMonotono = monotonicFactory()

/** Un id bien formado. Quien tenga que validar uno lo importa; no lo repite. */
export const ID_QUEJA = /^Q-[0-9A-HJKMNP-TV-Z]{8}$/

/**
 * Los ocho últimos caracteres de un ULID monótono: unos 40 bits de azar, de
 * sobra para un municipio. No son ordenables —el orden de inserción lo da
 * `rowid` (ver `listUserQuejas`)—.
 */
export function nuevoIdDeQueja(): string {
  return 'Q-' + ulidMonotono().slice(-8)
}

/**
 * Lee un id escrito por una persona: «Q-XXXXXXXX», «q-xxxxxxxx», «Q_…»,
 * «QXXXXXXXX» o el sufijo solo, que es lo que llega de `/estado_…`. Un sufijo
 * de ocho que empieza por Q es el sufijo entero: la Q sólo es prefijo cuando
 * sobra. Las letras que Crockford lee como cifras se corrigen (O → 0; I, L → 1).
 * Lo demás es null: nunca otro id.
 */
export function idDeQueja(texto: string | null | undefined): string | null {
  if (!texto) return null
  const m = /^(?:Q[-_]?)?([0-9A-Z]{8})$/.exec(texto.trim().toUpperCase())
  if (!m) return null
  const id = 'Q-' + m[1].replace(/O/g, '0').replace(/[IL]/g, '1')
  return ID_QUEJA.test(id) ? id : null
}
