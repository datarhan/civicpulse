/**
 * Hallazgos de eficiencia — la capa editorial firmada sobre los candidatos de
 * desviación.
 *
 * ## Por qué no reutiliza `pleno-finding.ts`
 *
 * Un hallazgo de pleno se ancla en una cita verbatim de una transcripción:
 * lleva `plenoId`, `sourceClaimIds`, `quotes[]` con su `speakerGroup`. Un
 * hallazgo de eficiencia no tiene nada de eso —no hay pleno, no hay
 * afirmación de nadie, no hay quien la dijera— y meterlo ahí obligaría a
 * rellenar la mitad del esquema con valores inventados sobre quién habló. El
 * precedente del repositorio es `press-finding.ts`: un esquema hermano con la
 * frontera de libelo movida. Aquí se mueve del todo:
 *
 *   **este esquema NO PUEDE nombrar a una persona.** No hay campo donde
 *   ponerla, y el validador rechaza los del hermano de pleno por si alguien
 *   copia una ficha de un sitio a otro.
 *
 * La razón está en el propio diseño: colgar un coste unitario de un cargo con
 * nombre es materialmente distinto de colgarlo de un servicio, y el segundo es
 * lo único que la fuente respalda. El ministerio publica lo que costó recoger
 * la basura, no quién lo decidió.
 *
 * ## La diferencia de verdad: una cita se queda quieta, un número no
 *
 * La cita de un pleno de marzo de 2026 dirá lo mismo dentro de diez años. La
 * cifra que dice «62,68 días en 2026-T1» puede dejar de ser cierta sin que
 * nadie toque la página: el ministerio revisa una entrega, el trimestre
 * siguiente publica otra cosa, y el hallazgo sigue afirmando la de antes.
 *
 * Así que cada ficha CONGELA su medición —valor, periodo, referencia, banda de
 * pares y las celdas exactas de las que salió— y `check:eficiencia-findings`
 * la vuelve a comparar contra el panel vivo. Que el snapshot avance a un
 * periodo nuevo no es un fallo: la ficha dice de qué periodo habla. Que el
 * MISMO periodo pase a valer otra cosa sí lo es, y ahí el gate para.
 *
 * ## Reglas encodadas, no sólo documentadas
 *
 *  · `requiresHumanApproval` está PROHIBIDO en el fichero publicado. Un
 *    borrador lo lleva siempre; que el esquema publicado lo rechace son las
 *    dos capas independientes.
 *  · Una ficha con `fiabilidad: 'debil'` necesita al menos una salvedad. Si la
 *    comparación depende de cómo rellene cada ayuntamiento su casilla, el
 *    lector tiene que enterarse en la misma ficha, no en otra página.
 *  · Toda ficha cita al menos una fuente resoluble y al menos una celda.
 *  · Derecho de réplica institucional: responde el ayuntamiento, la
 *    intervención, el concesionario o el ministerio. Nunca una persona.
 */
import { MOTIVOS_DESVIACION, FIABILIDADES } from './indicador-desviacion'
import type { MotivoDesviacion, Fiabilidad } from './indicador-desviacion'
import { sha256Short } from './hash'

/**
 * Quién puede replicar. Instituciones y roles, jamás un nombre propio.
 *
 * `pleno-finding.ts` permite responder a un grupo político porque allí el
 * hallazgo es sobre lo que dijo ese grupo. Aquí el hallazgo es sobre una cifra
 * que declaró el ayuntamiento como institución, y quien la explica es quien la
 * lleva: intervención, el área, el concesionario que presta el servicio o el
 * ministerio que la publica.
 */
export const RESPONDENTES = ['ayuntamiento', 'intervencion', 'concesionario', 'ministerio'] as const
export type Respondente = (typeof RESPONDENTES)[number]

/** La medición, congelada el día que se firmó la ficha. */
export interface MedicionCongelada {
  indicadorId: string
  /** El periodo del que habla la ficha. Nunca implícito. */
  periodo: string
  valor: number
  unidad: string
  /** El límite legal o la mediana contra la que se midió, cuando la hubo. */
  referencia?: { valor: number; etiqueta: string }
  pares?: { conjunto: string; n: number; percentil: number; mediana: number }
  /**
   * Las celdas exactas (`cesel:2024:CE2:a1621:Econ14`) de las que salió el
   * cociente. Es lo que hace la ficha comprobable en vez de creíble.
   */
  fuentes: string[]
}

export interface EficienciaFindingCorrection {
  field: 'titulo' | 'cuerpo' | 'medicion'
  original: string
  corrected: string
  /** Explicación en lenguaje llano, ≥20 caracteres. */
  reason: string
  editor: string
  correctedAt: string
}

export interface EficienciaFinding {
  id: string
  /** El candidato que lo levantó, con su versión de umbrales dentro. */
  candidatoId: string
  indicadorId: string
  familia: 'servicio' | 'municipal'
  titulo: string
  cuerpo: string
  motivos: MotivoDesviacion[]
  fiabilidad: Fiabilidad
  medicion: MedicionCongelada
  /** Lo que puede torcer la lectura. Obligatorio cuando la fiabilidad es débil. */
  caveats: string[]
  citas: { url: string; etiqueta: string }[]
  curatorName: string
  publishedAt: string
  response?: {
    from: Respondente
    quote: string
    sourceUrl?: string
    respondedAt: string
  } | null
  corrections?: EficienciaFindingCorrection[]
}

/** Fichas retiradas, como digestos. Mismo patrón que las de pleno. */
export interface EficienciaRetraction {
  findingId: string
  /** `hallazgo · sha256:…` de la ficha entera tal y como este validador la serializa. */
  digest: string
  reason: string
  editor: string
  retractedAt: string
}

export interface EficienciaFindingsSnapshot {
  version: string
  generatedAt: string
  legalNotice: string
  contactUrl: string
  methodologyUrl: string
  items: EficienciaFinding[]
  retractions?: EficienciaRetraction[]
}

export class EficienciaFindingValidationError extends Error {
  constructor(msg: string) {
    super(`eficiencia-findings.json: ${msg}`)
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/
const URL_RE = /^https?:\/\/\S+$/

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new EficienciaFindingValidationError(msg)
}

/**
 * Campos del esquema hermano que aquí nombran a una persona o a un grupo.
 *
 * Rechazarlos es la segunda capa de la frontera: no basta con no tener el
 * campo, porque una ficha copiada de `pleno-findings.json` traería el suyo y
 * un `JSON.parse` no se queja de una clave de más. Este fichero habla de
 * servicios; si alguien necesita atribuir una cifra a quien la decidió, ése es
 * otro hallazgo y va por el flujo de plenos, con su cita literal detrás.
 */
const CAMPOS_PROHIBIDOS = [
  'individualSpeaker',
  'speakerGroup',
  'quotes',
  'sourceClaimIds',
  'plenoId',
  'severity',
] as const

function validarMedicion(m: unknown, idx: number): MedicionCongelada {
  must(typeof m === 'object' && m !== null, `items[${idx}].medicion required`)
  const o = m as Record<string, unknown>
  must(
    typeof o.indicadorId === 'string' && o.indicadorId.length > 2,
    `items[${idx}].medicion.indicadorId required`,
  )
  must(
    typeof o.periodo === 'string' && o.periodo.trim().length > 0,
    `items[${idx}].medicion.periodo required — una cifra sin periodo no se puede volver a comprobar`,
  )
  must(
    typeof o.valor === 'number' && Number.isFinite(o.valor),
    `items[${idx}].medicion.valor must be a finite number`,
  )
  must(typeof o.unidad === 'string', `items[${idx}].medicion.unidad required`)
  must(
    Array.isArray(o.fuentes) && (o.fuentes as unknown[]).length >= 1,
    `items[${idx}].medicion.fuentes must name ≥1 cell — sin celda no hay nada que comprobar`,
  )
  const fuentes = (o.fuentes as unknown[]).map((f, i) => {
    must(typeof f === 'string' && f.length > 3, `items[${idx}].medicion.fuentes[${i}] invalid`)
    return f as string
  })
  let referencia: MedicionCongelada['referencia']
  if (o.referencia !== undefined && o.referencia !== null) {
    const r = o.referencia as Record<string, unknown>
    must(
      typeof r.valor === 'number' && Number.isFinite(r.valor),
      `items[${idx}].medicion.referencia.valor must be a finite number`,
    )
    must(
      typeof r.etiqueta === 'string' && r.etiqueta.length > 2,
      `items[${idx}].medicion.referencia.etiqueta required`,
    )
    referencia = { valor: r.valor as number, etiqueta: r.etiqueta as string }
  }
  let pares: MedicionCongelada['pares']
  if (o.pares !== undefined && o.pares !== null) {
    const p = o.pares as Record<string, unknown>
    for (const k of ['n', 'percentil', 'mediana'] as const) {
      must(
        typeof p[k] === 'number' && Number.isFinite(p[k] as number),
        `items[${idx}].medicion.pares.${k} must be a finite number`,
      )
    }
    must(typeof p.conjunto === 'string', `items[${idx}].medicion.pares.conjunto required`)
    pares = {
      conjunto: p.conjunto as string,
      n: p.n as number,
      percentil: p.percentil as number,
      mediana: p.mediana as number,
    }
  }
  return {
    indicadorId: o.indicadorId as string,
    periodo: (o.periodo as string).trim(),
    valor: o.valor as number,
    unidad: o.unidad as string,
    ...(referencia ? { referencia } : {}),
    ...(pares ? { pares } : {}),
    fuentes,
  }
}

function validarFinding(f: unknown, idx: number): EficienciaFinding {
  must(typeof f === 'object' && f !== null, `items[${idx}] must be object`)
  const o = f as Record<string, unknown>

  // Las dos capas independientes: el borrador lo lleva siempre, el publicado
  // lo rechaza. Un borrador no puede llegar aquí por descuido.
  must(
    o.requiresHumanApproval === undefined,
    `items[${idx}] carries requiresHumanApproval — eso es un BORRADOR, no una ficha publicada. ` +
      `Promociona con \`npm run promote-indicador\`, que es quien lo quita y deja firma.`,
  )
  for (const campo of CAMPOS_PROHIBIDOS) {
    must(
      o[campo] === undefined,
      `items[${idx}] carries \`${campo}\` — este esquema habla de servicios, no de personas ` +
        `ni de grupos. Un hallazgo que atribuye una cifra a quien la dijo va por pleno-findings, ` +
        `con su cita literal detrás.`,
    )
  }

  must(typeof o.id === 'string' && o.id.length >= 3, `items[${idx}].id required`)
  must(
    typeof o.candidatoId === 'string' && o.candidatoId.startsWith('cand-'),
    `items[${idx}].candidatoId must name the candidate that raised it`,
  )
  must(
    typeof o.indicadorId === 'string' && o.indicadorId.length > 2,
    `items[${idx}].indicadorId required`,
  )
  must(
    o.familia === 'servicio' || o.familia === 'municipal',
    `items[${idx}].familia must be servicio|municipal`,
  )
  must(
    typeof o.titulo === 'string' && o.titulo.trim().length >= 10 && o.titulo.length <= 200,
    `items[${idx}].titulo must be 10-200 chars`,
  )
  must(
    typeof o.cuerpo === 'string' && o.cuerpo.trim().length >= 120 && o.cuerpo.length <= 2500,
    `items[${idx}].cuerpo must be 120-2500 chars (la explicación editorial, no un reimpreso de la cifra)`,
  )
  must(
    Array.isArray(o.motivos) && (o.motivos as unknown[]).length >= 1,
    `items[${idx}].motivos must be non-empty`,
  )
  for (const m of o.motivos as unknown[]) {
    must(
      typeof m === 'string' && (MOTIVOS_DESVIACION as readonly string[]).includes(m),
      `items[${idx}].motivos has "${String(m)}" — must be one of ${MOTIVOS_DESVIACION.join(', ')}`,
    )
  }
  must(
    typeof o.fiabilidad === 'string' && (FIABILIDADES as readonly string[]).includes(o.fiabilidad),
    `items[${idx}].fiabilidad must be one of ${FIABILIDADES.join(', ')}`,
  )
  const medicion = validarMedicion(o.medicion, idx)
  const caveats = (Array.isArray(o.caveats) ? (o.caveats as unknown[]) : []).map((c, i) => {
    must(typeof c === 'string' && c.length > 10, `items[${idx}].caveats[${i}] must be prose`)
    return c as string
  })
  // Una comparación floja publicada sin decirlo es la mentira por vecindad otra
  // vez: el número es correcto y la conclusión que invita no lo es.
  must(
    o.fiabilidad !== 'debil' || caveats.length >= 1,
    `items[${idx}] es fiabilidad=debil y no lleva ninguna salvedad — si la comparación depende ` +
      `de cómo rellene cada ayuntamiento su casilla, el lector se entera en esta misma ficha.`,
  )
  const citas = (Array.isArray(o.citas) ? (o.citas as unknown[]) : []).map((c, i) => {
    must(typeof c === 'object' && c !== null, `items[${idx}].citas[${i}] must be object`)
    const co = c as Record<string, unknown>
    must(
      typeof co.url === 'string' && URL_RE.test(co.url),
      `items[${idx}].citas[${i}].url must be http(s)`,
    )
    must(
      typeof co.etiqueta === 'string' && co.etiqueta.length > 0,
      `items[${idx}].citas[${i}].etiqueta required`,
    )
    return { url: co.url as string, etiqueta: co.etiqueta as string }
  })
  must(
    citas.length >= 1,
    `items[${idx}].citas must be non-empty — toda afirmación de este sitio lleva enlace a su fuente`,
  )
  must(
    typeof o.curatorName === 'string' && o.curatorName.trim().length > 1,
    `items[${idx}].curatorName required — una ficha sobre gasto municipal lleva firma`,
  )
  must(
    typeof o.publishedAt === 'string' && ISO_DATE.test(o.publishedAt),
    `items[${idx}].publishedAt must be ISO`,
  )

  const response = (o.response ?? null) as EficienciaFinding['response']
  if (response) {
    must(
      typeof response.from === 'string' &&
        (RESPONDENTES as readonly string[]).includes(response.from),
      `items[${idx}].response.from must be one of ${RESPONDENTES.join(', ')} — instituciones, no personas`,
    )
    must(
      typeof response.quote === 'string' && response.quote.trim().length >= 20,
      `items[${idx}].response.quote must be verbatim ≥20 chars`,
    )
    must(
      typeof response.respondedAt === 'string' && ISO_DATE.test(response.respondedAt),
      `items[${idx}].response.respondedAt must be ISO`,
    )
    if (response.sourceUrl !== undefined) {
      must(
        typeof response.sourceUrl === 'string' && URL_RE.test(response.sourceUrl),
        `items[${idx}].response.sourceUrl must be http(s) URL`,
      )
    }
  }

  const corrections = (Array.isArray(o.corrections) ? (o.corrections as unknown[]) : []).map(
    (c, ci) => {
      must(typeof c === 'object' && c !== null, `items[${idx}].corrections[${ci}] must be object`)
      const co = c as Record<string, unknown>
      must(
        co.field === 'titulo' || co.field === 'cuerpo' || co.field === 'medicion',
        `items[${idx}].corrections[${ci}].field must be titulo|cuerpo|medicion`,
      )
      for (const k of ['original', 'corrected', 'editor'] as const) {
        must(
          typeof co[k] === 'string' && (co[k] as string).length > 0,
          `items[${idx}].corrections[${ci}].${k} required`,
        )
      }
      must(
        typeof co.reason === 'string' && (co.reason as string).trim().length >= 20,
        `items[${idx}].corrections[${ci}].reason must be ≥20 chars`,
      )
      must(
        typeof co.correctedAt === 'string' && ISO_DATE.test(co.correctedAt),
        `items[${idx}].corrections[${ci}].correctedAt must be ISO date`,
      )
      return {
        field: co.field as EficienciaFindingCorrection['field'],
        original: co.original as string,
        corrected: co.corrected as string,
        reason: (co.reason as string).trim(),
        editor: co.editor as string,
        correctedAt: co.correctedAt as string,
      }
    },
  )

  return {
    id: o.id as string,
    candidatoId: o.candidatoId as string,
    indicadorId: o.indicadorId as string,
    familia: o.familia as EficienciaFinding['familia'],
    titulo: (o.titulo as string).trim(),
    cuerpo: (o.cuerpo as string).trim(),
    motivos: o.motivos as MotivoDesviacion[],
    fiabilidad: o.fiabilidad as Fiabilidad,
    medicion,
    caveats,
    citas,
    curatorName: (o.curatorName as string).trim(),
    publishedAt: o.publishedAt as string,
    response: response ?? null,
    corrections,
  }
}

/**
 * El digesto de una ficha, para la lápida de una retirada.
 *
 * Igual que en los hallazgos de pleno: el registro tiene que ser
 * COMPROBABLE, no legible. Quien tenga una instantánea anterior puede
 * recalcular este hash y demostrar exactamente qué ficha se fue y que no se fue
 * ninguna otra; quien no la tenga no aprende de aquí el texto retirado.
 */
export function digestFinding(f: EficienciaFinding): string {
  return `hallazgo · sha256:${sha256Short(JSON.stringify(f))}`
}

export function validateEficienciaFindingsSnapshot(json: string): EficienciaFindingsSnapshot {
  const raw = JSON.parse(json) as Record<string, unknown>
  must(typeof raw.version === 'string', 'version required')
  must(typeof raw.generatedAt === 'string', 'generatedAt required')
  must(
    typeof raw.legalNotice === 'string' && raw.legalNotice.length >= 40,
    'legalNotice must be ≥40 chars',
  )
  must(typeof raw.contactUrl === 'string' && URL_RE.test(raw.contactUrl), 'contactUrl must be URL')
  must(typeof raw.methodologyUrl === 'string', 'methodologyUrl required')
  must(Array.isArray(raw.items), 'items must be array')
  const items = (raw.items as unknown[]).map((it, i) => validarFinding(it, i))

  const seen = new Set<string>()
  for (const it of items) {
    must(!seen.has(it.id), `duplicate finding id ${it.id}`)
    seen.add(it.id)
  }
  // Dos fichas vivas sobre el mismo indicador dicen dos veces lo mismo del
  // mismo número, y la segunda multiplica lo que afirme la primera. Corregir la
  // publicada o retirarla; nunca publicar otra al lado.
  const porIndicador = new Map<string, string[]>()
  for (const it of items) {
    porIndicador.set(it.indicadorId, [...(porIndicador.get(it.indicadorId) ?? []), it.id])
  }
  for (const [ind, ids] of porIndicador) {
    must(
      ids.length === 1,
      `${ind} tiene ${ids.length} fichas vivas (${ids.join(', ')}) — una cifra, un hallazgo. ` +
        `Corrige la publicada con \`npm run correct-indicador\` o retírala.`,
    )
  }

  let retractions: EficienciaRetraction[] | undefined
  if (raw.retractions !== undefined) {
    must(Array.isArray(raw.retractions), 'retractions must be array')
    retractions = (raw.retractions as unknown[]).map((r, i) => {
      must(typeof r === 'object' && r !== null, `retractions[${i}] must be object`)
      const o = r as Record<string, unknown>
      for (const k of ['findingId', 'digest', 'editor'] as const) {
        must(
          typeof o[k] === 'string' && (o[k] as string).length > 0,
          `retractions[${i}].${k} required`,
        )
      }
      must(
        typeof o.reason === 'string' && (o.reason as string).trim().length >= 20,
        `retractions[${i}].reason must be ≥20 chars`,
      )
      must(
        typeof o.retractedAt === 'string' && ISO_DATE.test(o.retractedAt),
        `retractions[${i}].retractedAt must be ISO date`,
      )
      return {
        findingId: o.findingId as string,
        digest: o.digest as string,
        reason: (o.reason as string).trim(),
        editor: o.editor as string,
        retractedAt: o.retractedAt as string,
      }
    })
    const withdrawn = new Set<string>()
    for (const r of retractions) {
      must(!withdrawn.has(r.findingId), `duplicate retraction for ${r.findingId}`)
      withdrawn.add(r.findingId)
      // Publicado Y retirado no es un estado: pintaría la ficha mientras el
      // registro dice que se fue.
      must(!seen.has(r.findingId), `${r.findingId} is both published and retracted`)
    }
  }

  return {
    version: raw.version as string,
    generatedAt: raw.generatedAt as string,
    legalNotice: raw.legalNotice as string,
    contactUrl: raw.contactUrl as string,
    methodologyUrl: raw.methodologyUrl as string,
    items,
    ...(retractions ? { retractions } : {}),
  }
}

/**
 * ¿Sigue diciendo el panel lo que esta ficha afirma?
 *
 * Tres desenlaces, nunca dos. Colapsar «no lo encontré» dentro de «coincide»
 * es exactamente el defecto que ya se pagó aquí con `r?.findings ?? []`: un
 * fallo silencioso que imprime su visto bueno.
 *
 *   · `coincide`   — el panel publica ese periodo con ese valor.
 *   · `movido`     — el panel avanzó a otro periodo. NO es un error: la ficha
 *                    dice de qué periodo habla. Es el aviso de que hay que
 *                    mirarla.
 *   · `contradice` — el MISMO periodo vale ahora otra cosa. La página está
 *                    afirmando algo que su propia fuente ya no dice.
 *   · `sin-indicador` — el indicador desapareció del panel. No se puede
 *                    comprobar, que no es lo mismo que estar bien.
 */
export type EstadoMedicion = 'coincide' | 'movido' | 'contradice' | 'sin-indicador'

export interface CotejoMedicion {
  findingId: string
  estado: EstadoMedicion
  publicado: number
  actual: number | null
  periodoPublicado: string
  periodoActual: string | null
  detalle: string
}

/** Tolerancia relativa: el snapshot redondea al serializar, la ficha no. */
const TOLERANCIA = 1e-6

/**
 * ¿Sigue el panel diciendo la COMPARACIÓN que la ficha congeló?
 *
 * La medición de una ficha no es sólo su cifra. `Medicion` renderiza además
 * «· mediana de 51 comparables: 57,14», y esa frase es tan pública y tan
 * legalmente material como el 100 %: es la que sostiene «no es una rareza
 * local, y tampoco es lo normal».
 *
 * Se comprobaba sólo `valor`. Bastó incorporar al registro dos servicios que el
 * ayuntamiento ya declaraba para que la banda pasara de repetir el 57 % de sus
 * denominadores al 62,5 % —la misma proporción propia, otro punto de
 * comparación— y el cotejo siguiera diciendo «coincide». Una guarda que
 * comprueba la mitad de lo que la ficha afirma da un visto bueno que la ficha
 * no tiene.
 *
 * Devuelve el detalle del desajuste, o `null` si la comparación sigue en pie.
 */
function cotejarPares(
  f: EficienciaFinding,
  m: { formato?: string; pares?: { n?: number; percentil?: number; mediana?: number } | null },
): string | null {
  const fijada = f.medicion.pares
  if (!fijada) return null
  const viva = m.pares
  if (!viva) {
    return `la ficha compara contra ${fijada.n} municipios y el panel ya no publica ninguna comparación`
  }
  // La mediana de pares vive en la misma unidad que el valor del indicador, así
  // que arrastra la misma trampa: el panel guarda 0,625 y la ficha publica
  // 62,5. Sin esta línea la guarda gritaría en cada indicador de porcentaje y
  // sería la primera que alguien apaga.
  const escala = m.formato === 'porcentaje' ? 100 : 1
  const medianaViva = viva.mediana === undefined ? undefined : viva.mediana * escala
  const desajustes: string[] = []
  const compara = (etiqueta: string, antes?: number, ahora?: number) => {
    if (antes === undefined || ahora === undefined) return
    if (Math.abs(ahora - antes) > Math.abs(antes || 1) * TOLERANCIA) {
      desajustes.push(
        `${etiqueta} ${antes.toLocaleString('es-ES', { maximumFractionDigits: 2 })} → ` +
          `${ahora.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`,
      )
    }
  }
  compara('n', fijada.n, viva.n)
  compara('percentil', fijada.percentil, viva.percentil)
  compara('mediana', fijada.mediana, medianaViva)
  if (!desajustes.length) return null
  return `la cifra coincide pero su comparación no: ${desajustes.join(' · ')} — refresca la medición o corrige el cuerpo`
}

export function cotejarMedicion(
  f: EficienciaFinding,
  panel: {
    indicadores: Array<{
      id: string
      valor: number | null
      citas?: Array<{ entrega: number }>
      // La banda del indicador, para que cotejarPares también corra en la
      // familia servicio (misma forma estructural que la rama municipal).
      pares?: { n?: number; percentil?: number; mediana?: number } | null
    }>
    municipales: Array<{
      id: string
      valor: number | null
      formato?: string
      periodo: string
      pares?: { n?: number; percentil?: number; mediana?: number } | null
    }>
  },
): CotejoMedicion {
  const base = {
    findingId: f.id,
    publicado: f.medicion.valor,
    periodoPublicado: f.medicion.periodo,
  }
  if (f.familia === 'municipal') {
    const m = panel.municipales.find((x) => x.id === f.medicion.indicadorId)
    if (!m || m.valor === null) {
      return {
        ...base,
        estado: 'sin-indicador',
        actual: null,
        periodoActual: null,
        detalle: `${f.medicion.indicadorId} ya no está en el panel — la ficha no se puede comprobar`,
      }
    }
    const actual = m.formato === 'porcentaje' ? m.valor * 100 : m.valor
    if (m.periodo !== f.medicion.periodo) {
      return {
        ...base,
        estado: 'movido',
        actual,
        periodoActual: m.periodo,
        detalle:
          `la ficha habla de ${f.medicion.periodo}; el panel publica ya ${m.periodo} ` +
          `(${actual.toLocaleString('es-ES', { maximumFractionDigits: 2 })}). Revisar si sigue vigente.`,
      }
    }
    const coincide = Math.abs(actual - f.medicion.valor) <= Math.abs(f.medicion.valor) * TOLERANCIA
    if (!coincide) {
      return {
        ...base,
        estado: 'contradice',
        actual,
        periodoActual: m.periodo,
        detalle: `${f.medicion.periodo} valía ${f.medicion.valor} y ahora vale ${actual} — la fuente se revisó`,
      }
    }
    const pares = cotejarPares(f, m)
    return {
      ...base,
      estado: pares ? 'contradice' : 'coincide',
      actual,
      periodoActual: m.periodo,
      detalle: pares ?? `${f.medicion.periodo} sigue valiendo lo publicado`,
    }
  }

  const i = panel.indicadores.find((x) => x.id === f.medicion.indicadorId)
  if (!i || i.valor === null) {
    return {
      ...base,
      estado: 'sin-indicador',
      actual: null,
      periodoActual: null,
      detalle: `${f.medicion.indicadorId} ya no publica cociente — la ficha no se puede comprobar`,
    }
  }
  const entrega = i.citas?.[0]?.entrega
  const periodoActual = entrega ? String(entrega) : null
  if (periodoActual && periodoActual !== f.medicion.periodo) {
    return {
      ...base,
      estado: 'movido',
      actual: i.valor,
      periodoActual,
      detalle:
        `la ficha habla de la entrega ${f.medicion.periodo}; el panel titula ya en ${periodoActual} ` +
        `(${i.valor.toLocaleString('es-ES', { maximumFractionDigits: 2 })}). Revisar si sigue vigente.`,
    }
  }
  const coincide = Math.abs(i.valor - f.medicion.valor) <= Math.abs(f.medicion.valor) * TOLERANCIA
  if (!coincide) {
    return {
      ...base,
      estado: 'contradice',
      actual: i.valor,
      periodoActual,
      detalle: `la entrega ${f.medicion.periodo} valía ${f.medicion.valor} y ahora vale ${i.valor} — la fuente se revisó`,
    }
  }
  // La misma media guarda que ya se pagó en municipales: una ficha que fija su
  // banda de pares y un cotejo que sólo mira el valor comprueba la mitad de lo
  // que la ficha afirma. Los 12 indicadores de servicio publican pares, así
  // que la primera ficha `servicio` con banda reactivaría el defecto. Latente
  // hasta la revisión pre-merge del 17-08: aquí no había instancia viva, y por
  // eso el test que lo fija es construido.
  const pares = cotejarPares(f, i)
  return {
    ...base,
    estado: pares ? 'contradice' : 'coincide',
    actual: i.valor,
    periodoActual,
    detalle: pares ?? `la entrega ${f.medicion.periodo} sigue valiendo lo publicado`,
  }
}
