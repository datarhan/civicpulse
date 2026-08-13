/**
 * ¿Ha leído alguien estas páginas, y hace cuánto?
 *
 * La revisión de superficies es el único control de este repo que responde «¿la
 * página dice algo verdadero?» en vez de «¿el dato cuadra?». Las dos preguntas
 * divergen: los cuatro defectos corregidos el 2026-08-12 tenían todos su dato
 * bien y su frase mal, y ninguna comprobación determinista podía verlos.
 *
 * Corría sólo en el gancho de pre-push, y los ganchos de git NO corren en
 * GitHub Actions — así que el nightly commitea datos frescos cada madrugada y
 * nadie lee esas páginas, que es justo donde las cifras se mueven de verdad.
 *
 * Este módulo es la mitad barata y determinista del arreglo: no llama a ningún
 * modelo, sólo mira lo que la caché de revisión ya guarda por ruta —hash,
 * señalamientos y fecha— y responde dos cosas que un digest puede entregar:
 * qué páginas arrastran un señalamiento vivo, y cuáles llevan demasiado sin
 * leerse.
 *
 * PURO: recibe la caché ya leída. No toca disco ni red.
 */
import { readCacheEntry, type ReviewCacheEntry, type ReaderFinding } from './reader-review'

/** Días tras los cuales una página cuenta como no leída. */
export const DIAS_FRESCURA = 3

export interface EstadoRuta {
  route: string
  /** Señalamientos vivos de la última revisión. */
  findings: ReaderFinding[]
  /** ISO de la última revisión real, o `null` si nunca. */
  at: string | null
  diasDesde: number | null
}

export interface FrescuraSuperficies {
  /** Una entrada por ruta pedida, en el orden pedido. */
  rutas: EstadoRuta[]
  /** Las que arrastran algún señalamiento vivo. */
  conSenalamientos: EstadoRuta[]
  /** Las que nunca se han leído. */
  sinLeer: EstadoRuta[]
  /** Las leídas, pero hace más de `DIAS_FRESCURA`. */
  rancias: EstadoRuta[]
  /** Total de señalamientos vivos en todas las rutas. */
  senalamientos: number
}

/**
 * Estado de frescura de un conjunto de rutas contra la caché de revisión.
 *
 * `at` ausente cuenta como NUNCA LEÍDA, no como recién leída. La caché tiene un
 * formato viejo —una cadena suelta con el hash— que `readCacheEntry` sigue
 * aceptando y que no trae fecha; darlo por fresco convertiría una caché
 * heredada en un parte de todo-en-orden sobre páginas que nadie ha mirado.
 */
export function medirFrescura(
  rutas: string[],
  cache: Record<string, string | ReviewCacheEntry>,
  ahora: Date,
): FrescuraSuperficies {
  const estados: EstadoRuta[] = rutas.map((route) => {
    const e = readCacheEntry(cache[route])
    const at = e?.at ?? null
    const t = at ? Date.parse(at) : NaN
    return {
      route,
      findings: e?.findings ?? [],
      at,
      diasDesde: Number.isFinite(t) ? (ahora.getTime() - t) / 86_400_000 : null,
    }
  })
  return {
    rutas: estados,
    conSenalamientos: estados.filter((e) => e.findings.length > 0),
    sinLeer: estados.filter((e) => e.diasDesde === null),
    rancias: estados.filter((e) => e.diasDesde !== null && e.diasDesde > DIAS_FRESCURA),
    senalamientos: estados.reduce((n, e) => n + e.findings.length, 0),
  }
}

/**
 * El parte, en una línea, o `null` si de verdad no hay nada que decir.
 *
 * `null` SÓLO cuando cada ruta pedida se ha leído dentro del plazo y ninguna
 * arrastra señalamientos. Una caché vacía —o borrada— produce «ninguna de las N
 * se ha leído», nunca silencio: el silencio aquí se lee como «todo limpio», que
 * es el modo de fallo que este repositorio ya ha pagado tres veces y el motivo
 * entero de que este fichero exista.
 */
export function parteFrescura(f: FrescuraSuperficies): string | null {
  if (f.rutas.length === 0) return 'no se ha pedido ninguna ruta: no se ha medido nada'
  const partes: string[] = []
  if (f.senalamientos > 0) {
    partes.push(
      `${f.senalamientos} señalamiento(s) vivo(s) en ${f.conSenalamientos.length} ruta(s): ` +
        f.conSenalamientos
          .slice(0, 4)
          .map((e) => e.route)
          .join(', ') +
        (f.conSenalamientos.length > 4 ? '…' : ''),
    )
  }
  const nunca = f.sinLeer.length
  if (nunca > 0) {
    partes.push(
      nunca === f.rutas.length
        ? `NINGUNA de las ${f.rutas.length} rutas se ha revisado nunca`
        : `${nunca} ruta(s) sin revisar nunca: ${f.sinLeer
            .slice(0, 4)
            .map((e) => e.route)
            .join(', ')}${nunca > 4 ? '…' : ''}`,
    )
  }
  if (f.rancias.length > 0) {
    partes.push(
      `${f.rancias.length} ruta(s) sin leer desde hace más de ${DIAS_FRESCURA} días: ` +
        f.rancias
          .slice(0, 4)
          .map((e) => `${e.route} (${Math.floor(e.diasDesde!)}d)`)
          .join(', ') +
        (f.rancias.length > 4 ? '…' : ''),
    )
  }
  return partes.length ? partes.join(' · ') : null
}
