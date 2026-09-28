/**
 * La medición de la revisión automática contra los casos de oro
 * (tests/fixtures/moderacion-oro.json), pura: con las respuestas del modelo ya
 * grabadas, dice cuántas de las quejas que la revisión dejaría publicar son
 * seguras. La usan el que pregunta al modelo (scripts/medir-revision.ts) y la
 * prueba que repite la cuenta con el código de hoy (tests/revision-oro.test.ts):
 * si el código cambia lo que decide, la cuenta grabada deja de cuadrar.
 *
 * Lo que se mide es lo que abre la publicación automática (`decideAutomation`,
 * clase `queja.publicacion-automatica`): de las que la revisión da por `limpia`,
 * cuántas no había que retener y ya no llevan nada de lo que había que quitar.
 * Una retenida de más no cuenta en contra —la ve una persona—, pero se dice.
 */
import { wilsonLowerBound } from '../../../src/scraper/automation-policy.ts'
import { LIMITE_DETALLE, LIMITE_TITULO } from '../db/queries.ts'
import { interpretarRevision, type Revision, type TextoQueja } from './moderacion.ts'
import { cortarLimpio, limpiarDatosPersonales } from './pii.ts'

export interface CasoDeOro {
  id: string
  titulo: string
  detalle: string
  /** Tiene que verla una persona. */
  retener: boolean
  /** Lo que, si se publica, no puede seguir en el texto. */
  quitar: string[]
  /** Lo que no es de una persona y no debe quitarse. */
  conservar?: string[]
  nota?: string
}

/** Lo que contestó el servicio a un caso, tal cual. */
export type RespuestaGrabada =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'bloqueada'; razon: string }
  | { tipo: 'error'; codigo: string }

export interface MedidaRevision {
  casos: number
  /** Las que la revisión da por limpias: las que publicaría sola si la medición lo permite. */
  publicaria: number
  /** De ésas, las que no había que retener y ya no llevan nada que quitar. */
  seguras: number
  /** Las que publicaría y no debía: una limpia que había que retener, o con un nombre dentro. */
  inseguras: string[]
  retenidasBien: number
  /** Limpias según el oro que la revisión retiene: no publican nada mal, pero cuestan una persona. */
  retenidasDeMas: string[]
  /** Donde quitó algo que había que conservar: una calle, un comercio. */
  quitadoDeMas: string[]
  invalidas: string[]
  errores: string[]
  /** `seguras / publicaria`, o null si no publicaría ninguna. */
  precision: number | null
  /** El límite inferior de Wilson al 95 %: lo que compara `decideAutomation` con su listón. */
  limiteInferior: number | null
}

/** El texto como lo guarda `createQueja`: sin lo que tiene forma de dato personal, y cortado. */
export function textoGuardado(c: Pick<CasoDeOro, 'titulo' | 'detalle'>): TextoQueja {
  return {
    titulo: cortarLimpio(limpiarDatosPersonales(c.titulo).texto, LIMITE_TITULO),
    detalle: cortarLimpio(limpiarDatosPersonales(c.detalle).texto, LIMITE_DETALLE),
  }
}

/** La revisión de un caso, como la haría el bot con esa respuesta. */
export function revisionDelCaso(texto: TextoQueja, r: RespuestaGrabada): Revision {
  if (r.tipo === 'bloqueada') {
    return { resultado: 'marcada', motivos: ['bloqueada'], retirados: 0, texto }
  }
  if (r.tipo === 'error') return { resultado: 'error', error: r.codigo }
  return interpretarRevision(r.texto, texto)
}

const contiene = (t: TextoQueja, fragmento: string) =>
  t.titulo.includes(fragmento) || t.detalle.includes(fragmento)

export function medirRevision(
  casos: readonly CasoDeOro[],
  respuestas: Readonly<Record<string, RespuestaGrabada>>,
): MedidaRevision {
  const m: MedidaRevision = {
    casos: casos.length,
    publicaria: 0,
    seguras: 0,
    inseguras: [],
    retenidasBien: 0,
    retenidasDeMas: [],
    quitadoDeMas: [],
    invalidas: [],
    errores: [],
    precision: null,
    limiteInferior: null,
  }
  for (const c of casos) {
    const r = respuestas[c.id]
    // Un caso sin respuesta no es un caso que salió bien: la grabación está incompleta.
    if (!r) throw new Error(`[medida-revision] el caso ${c.id} no tiene respuesta grabada`)
    const texto = textoGuardado(c)
    const v = revisionDelCaso(texto, r)
    if (v.resultado === 'invalida') m.invalidas.push(c.id)
    else if (v.resultado === 'error') m.errores.push(c.id)
    else {
      if ((c.conservar ?? []).some((f) => contiene(texto, f) && !contiene(v.texto, f))) {
        m.quitadoDeMas.push(c.id)
      }
      if (v.resultado === 'marcada') {
        if (c.retener) m.retenidasBien += 1
        else m.retenidasDeMas.push(c.id)
      } else {
        m.publicaria += 1
        if (!c.retener && c.quitar.every((f) => !contiene(v.texto, f))) m.seguras += 1
        else m.inseguras.push(c.id)
      }
    }
  }
  if (m.publicaria > 0) {
    m.precision = m.seguras / m.publicaria
    m.limiteInferior = wilsonLowerBound(m.seguras, m.publicaria)
  }
  return m
}
