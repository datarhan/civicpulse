/**
 * La copia de `pleno-findings.json` que sirve el sitio, sin la versión de una
 * fila de bitácora que nombraba a un grupo de un solo escaño.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE
 *
 * Un grupo con un solo concejal nombra a esa persona (`singleSeatBlocs`,
 * corporation-seats.ts): en Riba-roja, tres de los cinco. El 29 y el 30-09-2026
 * el operador firmó la retirada de cada etiqueta de uno de esos grupos que nadie
 * había firmado (`correct-pleno-finding --field quote.<i>.speakerGroup --new
 * ""`) y reescribió los sumarios y el titular que los nombraban; #172 ya lo
 * había hecho con 431140. Pero cada fila de la bitácora guarda su `original`, y
 * la bitácora lo imprime: la ficha seguía enseñando «Compromís» tachado junto a
 * «sin identificar», y «Compromís afirma…» o «VOX manifestó…» como texto
 * retirado. Lo que una persona firmó que no se sabe, la misma página lo seguía
 * diciendo, en la línea de debajo.
 *
 * Medido el 30-09-2026 sobre la copia servida: 14 etiquetas retiradas y 53
 * versiones de sumario o titular en 34 filas, en 14 de las 40 fichas. Es el
 * mismo defecto que los bloques REMOVAL y REDACTION de pleno-finding.ts
 * describen para la cita y el sumario —un tachado es un estilo, no una
 * redacción—, esta vez con un nombre de grupo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UNA MARCA Y NO UNA HUELLA
 *
 * `literales-retenidos.ts` sustituye el literal por su huella, que no revela
 * nada y confirma todo a quien tenga el texto. Aquí no serviría: la huella de
 * una etiqueta tiene cinco entradas posibles —los grupos de la corporación—, y
 * probar las cinco la deshace. Y los sumarios se reescribieron cambiando el
 * grupo por una fórmula neutra («Por su parte, Compromís destaca» → «En otra
 * intervención se destacan»), así que con el sumario vigente y pocas conjeturas
 * se rehace también la del anterior. Una huella diría que se retiene algo que
 * cualquiera recupera; la marca (`MARCA_GRUPO_RETENIDO`) dice lo que hay.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ AL COMPILAR, Y NO EN EL FICHERO
 *
 * El fichero del repositorio es el registro: lo escribe sólo la CLI de
 * correcciones, y la fila entera —qué decía, quién lo cambió y por qué— tiene
 * que seguir en él. Esto deja de SERVIRLA en el sitio, en el mismo paso de la
 * compilación que ya retira los literales retenidos (`publication-denylist.js`).
 * El repositorio es público desde el 8-09-2026, así que la versión sigue en su
 * `public/data/pleno-findings.json` y en su historia: no se retira del mundo, y
 * ni la página, ni la nota de la copia servida, ni /metodologia dicen otra cosa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ HACE, Y QUÉ NO
 *
 *   · Mira las filas de titular, sumario y grupo de una cita: los campos que el
 *     validador exporta como prosa redactable (`REDACTION_LABELS`) y como
 *     atribución (`isSpeakerGroupField`). Cada lado se juzga solo, con la tabla
 *     de alias de siempre (`findPartiesInText`: «Esquerra Unida» es EU-Podem).
 *   · El lado que nombra a un grupo de un escaño pasa a la marca, y la fila gana
 *     `grupoRetenido: true`. Conserva campo, motivo, firma, fecha y enmiendas, y
 *     el otro lado, si no lo nombra: una etiqueta retirada sigue diciendo que
 *     ahora es «sin identificar».
 *   · NO toca las filas de texto de una cita. Una cita es lo que se dijo, no una
 *     atribución nuestra, y la ficha enseña la vigente: en una intervención
 *     publicada quien habla dice de qué grupo es, y «podem» es también un verbo.
 *   · NO toca el motivo. Es prosa, y nada automático la reescribe (CLAUDE.md,
 *     regla 4): un motivo que nombra al grupo lo enmienda una persona con
 *     `correct-pleno-finding --amend-reason`, y `tests/grupos-retenidos.test.ts`
 *     lleva los que esperan con su plazo.
 *   · Sólo grupos de UN escaño. Una etiqueta retirada de PP o PSOE es de bloque,
 *     y se sigue sirviendo. Esconder unas y no otras le dice al lector que la
 *     escondida era de uno de los grupos de un escaño: tres concejales, ninguno
 *     nombrado. Lo decidió el operador el 30-09-2026.
 *   · Falla cerrado sin la composición: `null` no es «ningún grupo».
 *
 * Límite conocido: la composición es la de HOY (`officials.json`). Si en el
 * mandato de 2027 un grupo que tenía un escaño pasa a tener varios, sus filas
 * viejas volverían a servirse. Lo comparte con cada llamada a
 * `singleSeatBlocs`; el día que cambie la corporación hay que mirarlo.
 */
import { findPartiesInText } from '../lib/party-alias.js'
import { MARCA_GRUPO_RETENIDO } from '../lib/grupo-retenido.js'
import { REDACTION_LABELS, isSpeakerGroupField } from './pleno-finding'

const LADOS = ['original', 'corrected'] as const
export type Lado = (typeof LADOS)[number]

export interface FilaLike {
  field: string
  original: string
  corrected: string
  grupoRetenido?: boolean
  [k: string]: unknown
}

export interface FichaLike {
  id: string
  corrections?: FilaLike[]
  [k: string]: unknown
}

export interface RetencionDeGruposStats {
  /** Filas de bitácora que la copia servida sirve con algún lado en marca. */
  filasDeBitacora: number
  /** Lados en marca: una fila puede llevar uno o los dos. */
  versiones: number
}

const NOTA_DE_LA_COPIA =
  'Esta es la copia que sirve el sitio. En la bitácora de correcciones de cada ficha, la ' +
  'versión de un titular, de un sumario o del grupo de una cita que nombraba a un grupo de un ' +
  'solo escaño —los de «grupos»— no se reproduce: nombrar un grupo con un solo concejal es ' +
  'nombrar a esa persona, y casi siempre lo que la fila corregía era una atribución que una ' +
  'persona retiró. Ese lado lleva «grupo de un solo escaño · no se reproduce», y la fila, ' +
  '«grupoRetenido: true»; conserva campo, motivo, firma y fecha. Es una marca y no una huella ' +
  'porque la huella de un nombre entre cinco se deshace probando los cinco. No es una retirada: ' +
  'el repositorio del proyecto, que es público, sigue llevando la fila entera en este mismo ' +
  'fichero y en su historia.'

/** ¿Es una fila de titular, de sumario o del grupo de una cita? Leído del validador. */
function conAtribucion(field: unknown): boolean {
  return typeof field === 'string' && (isSpeakerGroupField(field) || field in REDACTION_LABELS)
}

/** Los lados de esta fila que nombran a un grupo de un escaño; ninguno si la fila no es de las que se miran. */
export function ladosQueNombranUnEscano(
  fila: { field?: unknown; original?: unknown; corrected?: unknown } | null | undefined,
  unEscano: readonly string[],
): Lado[] {
  if (!fila || !conAtribucion(fila.field) || unEscano.length === 0) return []
  return LADOS.filter((lado) => {
    const texto = fila[lado]
    if (typeof texto !== 'string') return false
    return (findPartiesInText(texto) as string[]).some((g) => unEscano.includes(g))
  })
}

/**
 * Dónde nombra la bitácora a un grupo de un escaño: `<ficha>[<fila>].<lado>`.
 * Lo que relee la compilación sobre lo que acaba de escribir, y lo que las
 * pruebas comparan con su propio oráculo.
 */
export function filasQueNombranUnEscano(
  snapshot: { items?: ReadonlyArray<{ id: string; corrections?: ReadonlyArray<unknown> }> },
  unEscano: readonly string[],
): string[] {
  const out: string[] = []
  for (const f of snapshot.items ?? []) {
    ;(f.corrections ?? []).forEach((c, i) => {
      for (const lado of ladosQueNombranUnEscano(c as FilaLike, unEscano)) {
        out.push(`${f.id}[${i}].${lado}`)
      }
    })
  }
  return out
}

/**
 * La copia servida. Pura: no toca la entrada, que es el fichero del repositorio
 * y tiene que seguir llevando la fila entera.
 *
 * `unEscano` es lo que devuelve `oneSeatBlocsOf(officials.json)`: `null` quiere
 * decir que no se sabe, y entonces se niega; `[]`, que la corporación no tiene
 * grupos de un escaño, y entonces no hay nada que retener.
 */
export function retenerGruposDeUnEscano<S extends { items?: FichaLike[] }>(
  snapshot: S,
  unEscano: readonly string[] | null | undefined,
): {
  snapshot: S & {
    items: FichaLike[]
    gruposRetenidos: {
      grupos: string[]
      filasDeBitacora: number
      versiones: number
      nota: string
      metodologia: string
    }
  }
  stats: RetencionDeGruposStats
} {
  if (unEscano == null) {
    throw new Error(
      'retenerGruposDeUnEscano: sin la composición de la corporación no se sabe qué grupo tiene ' +
        'un solo escaño, y servir la bitácora entera es volver a nombrarlos',
    )
  }
  const copia = structuredClone(snapshot) as S & { items: FichaLike[] }
  const stats: RetencionDeGruposStats = { filasDeBitacora: 0, versiones: 0 }

  for (const f of copia.items ?? []) {
    if (!Array.isArray(f.corrections)) continue
    f.corrections = f.corrections.map((c) => {
      const lados = ladosQueNombranUnEscano(c, unEscano)
      if (lados.length === 0 && c?.grupoRetenido !== true) return c
      const servida: FilaLike = { ...c, grupoRetenido: true }
      for (const lado of lados) servida[lado] = MARCA_GRUPO_RETENIDO
      // Cuenta lo que la copia lleva en marca, no lo que tocó esta pasada: la
      // nota describe la copia, y aplicada dos veces tiene que decir lo mismo.
      stats.filasDeBitacora += 1
      stats.versiones += LADOS.filter((lado) => servida[lado] === MARCA_GRUPO_RETENIDO).length
      return servida
    })
  }

  const snapshotServido = Object.assign(copia, {
    gruposRetenidos: {
      grupos: [...unEscano],
      filasDeBitacora: stats.filasDeBitacora,
      versiones: stats.versiones,
      nota: NOTA_DE_LA_COPIA,
      metodologia: '/metodologia#bitacora-escano-unico',
    },
  })
  return { snapshot: snapshotServido, stats }
}
