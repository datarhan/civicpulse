/**
 * ¿Sirve el sitio lo que el repositorio cree haber publicado?
 *
 * Puro y sin red: la comparación vive aquí, el `fetch` vive en
 * `scripts/check-publicado.ts`. Todo lo demás que mide frescura en esta casa
 * lee `public/data` del disco —`check:cadence`, `monitor:health`—, así que
 * mide lo que el repositorio TIENE y no lo que el lector RECIBE. Mientras el
 * despliegue funcione son la misma cifra; el día que no, sólo esto lo ve.
 *
 * Cuatro desenlaces, ninguno plegado dentro de otro. «No se pudo leer» tiene
 * que doler distinto que «coincide», que es la regla 2 de DATA_INTEGRITY.
 */
export type DesenlacePublicado = 'coincide' | 'sitio-por-detras' | 'repo-por-detras' | 'ilegible'

export interface EstadoPublicado {
  fichero: string
  repoGeneratedAt: string | null
  sitioGeneratedAt: string | null
  desenlace: DesenlacePublicado
  detalle: string
  /** Minutos que el sitio va por detrás del repositorio; null si no se pudo medir. */
  atrasoMinutos: number | null
}

export interface ResumenPublicado {
  comparados: number
  porDesenlace: Record<DesenlacePublicado, number>
  /** Sólo el sitio atrasado bloquea: es el único desenlace que el lector sufre. */
  bloquea: boolean
  /** Un barrido que no comparó nada no puede firmar un visto bueno. */
  concluyente: boolean
}

/**
 * Un despliegue tarda un par de minutos en propagarse. Por debajo de esto el
 * hueco es la cola del despliegue y no un defecto.
 */
export const TOLERANCIA_MINUTOS = 120

const selloDe = (x: unknown): string | null => {
  if (!x || typeof x !== 'object') return null
  const bruto = (x as { generatedAt?: unknown }).generatedAt
  if (typeof bruto !== 'string') return null
  return Number.isNaN(Date.parse(bruto)) ? null : bruto
}

export function compararPublicado(
  fichero: string,
  repo: unknown,
  sitio: unknown,
  opciones: { toleranciaMinutos?: number } = {},
): EstadoPublicado {
  const tolerancia = opciones.toleranciaMinutos ?? TOLERANCIA_MINUTOS
  const selloRepo = selloDe(repo)
  const selloSitio = selloDe(sitio)

  if (selloRepo === null || selloSitio === null) {
    // La frase tiene que decir lo que pasó. Decía «el sitio DA un generatedAt
    // legible» justo cuando no lo daba: el dato bien clasificado y el renglón
    // diciendo lo contrario, que es el defecto que esta casa persigue en las
    // páginas y se le coló en su propia guarda.
    const cual =
      selloRepo === null && selloSitio === null
        ? 'ni el repositorio ni el sitio dan'
        : selloRepo === null
          ? 'el repositorio no da'
          : 'el sitio no da'
    return {
      fichero,
      repoGeneratedAt: selloRepo,
      sitioGeneratedAt: selloSitio,
      desenlace: 'ilegible',
      detalle: `${cual} un generatedAt legible — sin sello no hay comparación, y no tenerla no es coincidir`,
      atrasoMinutos: null,
    }
  }

  const atrasoMinutos = Math.round((Date.parse(selloRepo) - Date.parse(selloSitio)) / 60_000)
  const base = { fichero, repoGeneratedAt: selloRepo, sitioGeneratedAt: selloSitio, atrasoMinutos }

  if (Math.abs(atrasoMinutos) <= tolerancia) {
    return { ...base, desenlace: 'coincide', detalle: `el sitio sirve el sello del repositorio` }
  }

  if (atrasoMinutos > 0) {
    return {
      ...base,
      desenlace: 'sitio-por-detras',
      detalle: `el lector recibe datos ${atrasoMinutos} min más viejos que los de main: el despliegue no ha corrido`,
    }
  }

  return {
    ...base,
    desenlace: 'repo-por-detras',
    detalle: `el sitio va ${-atrasoMinutos} min por delante de este árbol — es el checkout el que está viejo, no la web`,
  }
}

export function resumirPublicado(filas: EstadoPublicado[]): ResumenPublicado {
  const porDesenlace: Record<DesenlacePublicado, number> = {
    coincide: 0,
    'sitio-por-detras': 0,
    'repo-por-detras': 0,
    ilegible: 0,
  }
  for (const f of filas) porDesenlace[f.desenlace] += 1

  return {
    comparados: filas.length,
    porDesenlace,
    bloquea: porDesenlace['sitio-por-detras'] > 0,
    concluyente: filas.length > 0,
  }
}
