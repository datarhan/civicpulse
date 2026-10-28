/**
 * «En una frase» de /cambios (auditoría de las dos lecturas, 25-10-2026, §2).
 *
 * La página pintaba una tarjeta por cada clase con algo en la ventana y nada
 * para las que no. Sin pleno, sin queja nueva y sin subvención, el vecino no
 * podía distinguir «no pasó nada» de «no lo miramos». Esto deriva la frase de
 * arriba: lo que hizo el Ayuntamiento, lo que no consta y lo que no se sabe.
 *
 * - **Ausencia no es cero** (la lección del índice de /plenos). Una clase sin
 *   nada sólo «no consta» si su fuente está al día: dentro de su plazo en el
 *   registro de cadencias (`expectationFor`, el mismo que usa `check:cadence`)
 *   y con una copia posterior al principio de la ventana. Si no, «sin datos
 *   desde» la fecha de la copia; y si no se pudo leer, sin fecha.
 * - **Lo del Ayuntamiento, en orden fijo**: pleno, contratos, subvenciones,
 *   participación. Las convocatorias de subvenciones cuentan sólo si las
 *   convoca él (`direction: 'granted'`); las de otras administraciones que lo
 *   nombran no son actos suyos.
 * - **Las quejas son del canal de CivicPulse, y la prensa no es el
 *   Ayuntamiento**: van aparte, y de las noticias se cuentan aparte las de su
 *   propia web.
 */
import { expectationFor } from './snapshot-cadence'

/** Las clases que son actos del Ayuntamiento, en el orden en que se dicen. */
export const CLASES_DEL_AYUNTAMIENTO = ['pleno', 'licitacion', 'subvencion', 'participa'] as const
export type ClaseDelAyuntamiento = (typeof CLASES_DEL_AYUNTAMIENTO)[number]
export type ClaseDeCambios = ClaseDelAyuntamiento | 'queja' | 'prensa'

/** Los anfitriones de la web de noticias del Ayuntamiento, en `press.json`. */
const WEB_MUNICIPAL = new Set(['ribarroja.es', 'www.ribarroja.es'])

export interface FuenteDeCambios {
  /** El fichero de `public/data/`, para buscar su plazo. */
  fichero: string
  /** `generatedAt` de la copia, o null si no lo trae. */
  generatedAt: string | null
  /** false si no se pudo leer. */
  leida: boolean
}

export interface EventoDeCambios {
  kind: string
  /** Sólo en subvenciones: quién convoca (`bdns.ts`). */
  direction?: string
  /** Sólo en prensa: el anfitrión de la noticia. */
  origen?: string | null
}

export interface FraseDeLaSemana {
  dias: number
  /** Lo que hizo el Ayuntamiento en la ventana, en orden fijo, sólo si hay algo. */
  hechos: { kind: ClaseDelAyuntamiento; n: number }[]
  /** Lo que no hizo, según una fuente al día. */
  noConsta: ClaseDelAyuntamiento[]
  /** Lo que no se sabe: fuente atrasada (con la fecha de su copia) o ilegible (null). */
  sinDatos: { kind: ClaseDeCambios; desde: string | null }[]
  /** Quejas del canal enviadas en la ventana; null si no se sabe. */
  quejas: number | null
  /** Noticias que mencionan Riba-roja, y cuántas de la web municipal; null si no se sabe. */
  prensa: { n: number; municipales: number } | null
}

const DIA = 864e5

/** El primer día de la ventana, como lo corta `useCambios`. */
function principioDeLaVentana(hoy: number, dias: number): string {
  return new Date(hoy - dias * DIA).toISOString().slice(0, 10)
}

/** null si la fuente cubre la ventana; si no, desde cuándo no hay datos. */
function sinCobertura(
  f: FuenteDeCambios | undefined,
  hoy: number,
  principio: string,
): { desde: string | null } | null {
  if (!f || !f.leida || !f.generatedAt) return { desde: f?.generatedAt ?? null }
  const t = Date.parse(f.generatedAt)
  if (!Number.isFinite(t)) return { desde: null }
  const plazo = expectationFor(f.fichero)?.maxAgeDays
  // Sin plazo registrado no hay con qué decir que está al día.
  if (plazo == null) return { desde: f.generatedAt }
  if ((hoy - t) / DIA > plazo) return { desde: f.generatedAt }
  if (f.generatedAt.slice(0, 10) < principio) return { desde: f.generatedAt }
  return null
}

export function fraseDeLaSemana(e: {
  byKind: Partial<Record<string, readonly EventoDeCambios[]>>
  fuentes: Partial<Record<ClaseDeCambios, FuenteDeCambios>>
  dias: number
  hoy: number
}): FraseDeLaSemana {
  const principio = principioDeLaVentana(e.hoy, e.dias)
  const cuantos = (kind: ClaseDeCambios) => {
    const items = e.byKind[kind] ?? []
    return kind === 'subvencion'
      ? items.filter((i) => i.direction === 'granted').length
      : items.length
  }

  const hechos: FraseDeLaSemana['hechos'] = []
  const noConsta: ClaseDelAyuntamiento[] = []
  const sinDatos: FraseDeLaSemana['sinDatos'] = []
  for (const kind of CLASES_DEL_AYUNTAMIENTO) {
    const n = cuantos(kind)
    if (n > 0) {
      hechos.push({ kind, n })
      continue
    }
    const falta = sinCobertura(e.fuentes[kind], e.hoy, principio)
    if (falta) sinDatos.push({ kind, ...falta })
    else noConsta.push(kind)
  }

  // Quejas y prensa: lo que haya se cuenta; un cero sólo con la fuente al día.
  const nQuejas = cuantos('queja')
  let quejas: number | null = nQuejas
  if (nQuejas === 0) {
    const falta = sinCobertura(e.fuentes.queja, e.hoy, principio)
    if (falta) {
      quejas = null
      sinDatos.push({ kind: 'queja', ...falta })
    }
  }
  const noticias = e.byKind.prensa ?? []
  let prensa: FraseDeLaSemana['prensa'] = {
    n: noticias.length,
    municipales: noticias.filter((i) => WEB_MUNICIPAL.has(String(i.origen ?? ''))).length,
  }
  if (noticias.length === 0) {
    const falta = sinCobertura(e.fuentes.prensa, e.hoy, principio)
    if (falta) {
      prensa = null
      sinDatos.push({ kind: 'prensa', ...falta })
    }
  }

  return { dias: e.dias, hechos, noConsta, sinDatos, quejas, prensa }
}
