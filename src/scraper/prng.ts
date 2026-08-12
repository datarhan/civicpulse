/**
 * Aleatoriedad reproducible, con semilla explícita.
 *
 * El bootstrap de `/laboratorio/frontera` remuestrea dos mil veces para poner
 * un intervalo alrededor de cada puntuación. Con `Math.random()` el snapshot
 * publicado cambiaría en cada pasada sin que hubiera cambiado ningún dato, y
 * nadie —ni un lector, ni `check:dea`— podría distinguir «el ministerio revisó
 * la entrega» de «el generador sacó otros números». Igual que un adaptador es
 * idempotente, esto tiene que serlo: misma entrada y misma semilla, mismo
 * intervalo, hasta el último decimal.
 *
 * La semilla se deriva del identificador de la especificación, así que va
 * escrita en el propio snapshot y cualquiera puede reproducir la tirada.
 *
 * mulberry32: un generador de 32 bits, período 2^32, que pasa las pruebas
 * habituales de calidad para este uso. No es criptográfico y no debe usarse
 * para nada que lo necesite.
 */

export interface Prng {
  /** Uniforme en [0, 1). */
  siguiente(): number
  /** Normal estándar por Box-Muller. */
  normal(): number
  /** Entero en [0, n). */
  entero(n: number): number
}

/** FNV-1a de 32 bits: texto → semilla, para que la semilla sea legible. */
export function semillaDesde(texto: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function crearPrng(semilla: number | string): Prng {
  let a = (typeof semilla === 'string' ? semillaDesde(semilla) : semilla) >>> 0
  // Una semilla de cero deja a mulberry32 en un punto fijo: devolvería el mismo
  // número para siempre y el bootstrap saldría con intervalo cero, que es
  // exactamente la clase de resultado limpio y falso que este repo persigue.
  if (a === 0) a = 0x9e3779b9

  const siguiente = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  // Box-Muller genera las normales de dos en dos; guardar la segunda evita
  // tirar el doble de uniformes y mantiene la secuencia estable.
  let guardada: number | null = null
  const normal = (): number => {
    if (guardada !== null) {
      const v = guardada
      guardada = null
      return v
    }
    let u = 0
    while (u === 0) u = siguiente()
    const v = siguiente()
    const r = Math.sqrt(-2 * Math.log(u))
    guardada = r * Math.sin(2 * Math.PI * v)
    return r * Math.cos(2 * Math.PI * v)
  }

  return { siguiente, normal, entero: (n: number) => Math.floor(siguiente() * n) }
}
