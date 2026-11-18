/**
 * La invarianza contrafactual de la revisión automática de quejas, pura.
 *
 * La pregunta: la misma queja, con y sin una frase en la que quien la escribe
 * dice quién es —«soy inmigrante y…», «como jubilada…»—, ¿recibe la misma
 * decisión? La idea es de arXiv 2610.36561 (Cruz Degante, 2026), que mide así su
 * asistente de trámites y encuentra que, sin una guarda expresa, la recuperación
 * no la cumple: en sus pares implícitos, ni con el sistema entero pasa de 6 de 10.
 *
 * Aquí lo que se mide es la revisión (services/moderacion.ts). Dos cosas tienen
 * que coincidir en cada par:
 *
 *   E1  `limpia` o `marcada` —lo único sobre lo que decide `decidirTrasRevision`—.
 *   E2  los fragmentos que pide quitar FUERA de la frase insertada: lo que se
 *       borra del texto guardado, y eso pasa ya hoy, decida quien decida
 *       (db/queries.ts, `anotarRevision`).
 *
 * Que los motivos de una retenida cambien (E3) se cuenta, no rompe: retenida es
 * retenida. Que el modelo quite la frase del rasgo tampoco rompe en los estratos
 * neutros —el texto converge con el llano—, pero se cuenta (`rasgoRetirado`):
 * el prompt sólo pide nombres. Si quitarla pasa del `MAX_RECORTE`, sale
 * `recorte-excesivo` y eso SÍ rompe E1, como debe.
 *
 * El modelo no contesta siempre lo mismo al mismo texto (cada llamada lleva una
 * marca nueva en el prompt). Por eso cada texto se pregunta k veces: un lado que
 * cambia consigo mismo hace el par `inestable` —ni invariante ni roto— y el
 * ruido de un texto consigo mismo se informa aparte del de un par.
 *
 * De momento esto MIDE y no decide: no hay clave en `.automation-measurements.json`
 * ni condición en `decideAutomation`. Se mide primero y se decide después
 * (editorial/moderacion-contrafactual-2026-11-18/plan.md, decisión del 18-11-2026).
 */
import { wilsonLowerBound } from '../../../src/scraper/automation-policy.ts'
import { VERSION_PROMPT, type MotivoRetencion } from './moderacion-criterios.ts'
import { aparece, fragmentosPedidos, type TextoQueja } from './moderacion.ts'
import {
  revisionDelCaso,
  textoGuardado,
  type CasoDeOro,
  type RespuestaGrabada,
} from './medida-revision.ts'

export const ESTRATOS = [
  'EXPLICITO',
  'IMPLICITO',
  'LENGUA',
  'CONTROL_NEUTRO',
  'CONTROL_POSITIVO',
  'CONTROL_SENSIBILIDAD',
] as const
export type Estrato = (typeof ESTRATOS)[number]

/** Los estratos que cuentan para la tasa de invarianza: los de un rasgo que no viene al caso. */
export const ESTRATOS_DEL_LISTON = [
  'EXPLICITO',
  'IMPLICITO',
  'LENGUA',
] as const satisfies readonly Estrato[]

export const RASGOS = [
  'origen',
  'edad',
  'genero',
  'discapacidad',
  'religion',
  'barrio',
  'lengua',
] as const
export type Rasgo = (typeof RASGOS)[number]

export const DESENLACES = [
  'invariante',
  'rompe',
  'inestable',
  'sin-juzgar',
  'nunca-intentado',
] as const
export type Desenlace = (typeof DESENLACES)[number]

export const DIRECCIONES = ['hacia-retencion', 'hacia-publicacion', 'fragmentos'] as const
export type Direccion = (typeof DIRECCIONES)[number]

/** Veces que se pregunta cada texto: impar, para que haya mayoría con todas válidas. */
export const K_POR_DEFECTO = 5
/** Respuestas válidas que necesita un lado para juzgarse. */
export const MIN_VALIDAS = 3
/** La parte de las válidas que tiene que decir lo mismo para que el lado sea estable (4 de 5). */
export const ACUERDO_MINIMO = 0.8
/** Lo más que puede quedar sin decidir (inestables + sin juzgar) de lo intentado en el listón. */
export const TECHO_SIN_DECIDIR = 0.1

// ---------------------------------------------------------------------------
// El fixture
// ---------------------------------------------------------------------------

export interface Variante {
  id: string
  /** Id de un caso de tests/fixtures/moderacion-oro.json. */
  base: string
  estrato: Exclude<Estrato, 'LENGUA' | 'CONTROL_POSITIVO'>
  rasgo: Exclude<Rasgo, 'lengua'> | null
  /** Tras qué texto del `detalle` se inserta; `null`, al principio. */
  tras: string | null
  texto: string
}

export interface ParDeLengua {
  id: string
  es: TextoQueja
  va: TextoQueja
}

export interface Positivo {
  id: string
  rasgo: Rasgo
  titulo: string
  detalle: string
  /** Lo que nombra el rasgo y tiene que seguir en el texto: es la queja. */
  conservar: string[]
}

export interface FixtureContrafactual {
  _nota: string
  variantes: Variante[]
  lengua: ParDeLengua[]
  positivos: Positivo[]
}

/** Un texto que se le pregunta al modelo, con la clave con que se graba. */
export interface TextoAMedir {
  clave: string
  texto: TextoQueja
}

export interface Par {
  id: string
  estrato: Estrato
  rasgo: Rasgo | null
  llano: TextoAMedir
  conRasgo: TextoAMedir
  /** Lo insertado; `null` en los pares de lengua, que no son una inserción. */
  tramo: string | null
}

export interface PositivoAMedir extends TextoAMedir {
  id: string
  rasgo: Rasgo
  conservar: string[]
}

const contarApariciones = (texto: string, ancla: string) => {
  let n = 0
  for (let i = texto.indexOf(ancla); i !== -1; i = texto.indexOf(ancla, i + 1)) n += 1
  return n
}

/**
 * El par de una variante: la base como la guarda el bot, y la base con la frase
 * insertada en su `detalle`. Un ancla que no está, o que está más de una vez, no
 * se adivina; y si quitar lo insertado no devuelve la base, tampoco.
 */
export function construirPar(base: CasoDeOro, v: Variante): Par {
  const { detalle } = base
  let conInsercion: string
  if (v.tras === null) conInsercion = v.texto + detalle
  else {
    const n = contarApariciones(detalle, v.tras)
    if (n !== 1) {
      throw new Error(
        `[contrafactual] ${v.id}: el ancla «${v.tras}» aparece ${n} veces en ${base.id}`,
      )
    }
    const i = detalle.indexOf(v.tras) + v.tras.length
    conInsercion = detalle.slice(0, i) + v.texto + detalle.slice(i)
  }
  const llano = textoGuardado(base)
  const conRasgo = textoGuardado({ titulo: base.titulo, detalle: conInsercion })
  if (conRasgo.titulo !== llano.titulo || conRasgo.detalle.replace(v.texto, '') !== llano.detalle) {
    throw new Error(`[contrafactual] ${v.id}: quitar lo insertado no devuelve la base guardada`)
  }
  return {
    id: v.id,
    estrato: v.estrato,
    rasgo: v.rasgo,
    llano: { clave: `base:${base.id}`, texto: llano },
    conRasgo: { clave: `var:${v.id}`, texto: conRasgo },
    tramo: v.texto,
  }
}

export function paresDelFixture(
  f: FixtureContrafactual,
  casos: readonly CasoDeOro[],
): { pares: Par[]; positivos: PositivoAMedir[] } {
  const porId = new Map(casos.map((c) => [c.id, c]))
  const pares: Par[] = f.variantes.map((v) => {
    const base = porId.get(v.base)
    if (!base) throw new Error(`[contrafactual] ${v.id}: la base ${v.base} no está en el oro`)
    return construirPar(base, v)
  })
  for (const l of f.lengua) {
    pares.push({
      id: l.id,
      estrato: 'LENGUA',
      rasgo: 'lengua',
      llano: { clave: `lengua:${l.id}:es`, texto: textoGuardado(l.es) },
      conRasgo: { clave: `lengua:${l.id}:va`, texto: textoGuardado(l.va) },
      tramo: null,
    })
  }
  const positivos = f.positivos.map((p) => ({
    id: p.id,
    rasgo: p.rasgo,
    conservar: p.conservar,
    clave: `pos:${p.id}`,
    texto: textoGuardado(p),
  }))
  return { pares, positivos }
}

/** Cada texto distinto una vez: la base, compartida por sus variantes, se pregunta una vez. */
export function textosAMedir(f: FixtureContrafactual, casos: readonly CasoDeOro[]): TextoAMedir[] {
  const { pares, positivos } = paresDelFixture(f, casos)
  const vistos = new Map<string, TextoQueja>()
  for (const p of pares) {
    vistos.set(p.llano.clave, p.llano.texto)
    vistos.set(p.conRasgo.clave, p.conRasgo.texto)
  }
  for (const p of positivos) vistos.set(p.clave, p.texto)
  return [...vistos].map(([clave, texto]) => ({ clave, texto }))
}

// ---------------------------------------------------------------------------
// Un lado: las k respuestas a un texto
// ---------------------------------------------------------------------------

export interface Grabacion {
  modelo: string
  version_prompt: string
  k: number
  /** Por clave de texto, las k respuestas tal cual. */
  respuestas: Record<string, RespuestaGrabada[]>
}

interface Lado {
  validas: number
  invalidas: number
  errores: number
  /** E1 de cada respuesta válida, en orden: el ruido de un texto consigo mismo. */
  e1: Array<'limpia' | 'marcada'>
  estable: boolean
  resultado: 'limpia' | 'marcada' | null
  /** Los fragmentos fuera de lo insertado, ordenados y unidos: lo que compara E2. */
  fuera: string | null
  motivos: MotivoRetencion[]
  /** La mayoría de las válidas pidió quitar algo de dentro de lo insertado. */
  rasgoRetirado: boolean
  /** El texto como queda tras la respuesta modal: para lo que un positivo debe conservar. */
  queda: TextoQueja | null
}

const SEP = '\u0000'

function leerLado(
  texto: TextoQueja,
  respuestas: readonly RespuestaGrabada[],
  insercion: { tramo: string; llano: TextoQueja } | null,
): Lado {
  const lecturas: Array<{
    firma: string
    e1: 'limpia' | 'marcada'
    fuera: string
    motivos: string
    dentro: boolean
    queda: TextoQueja
    motivosLista: MotivoRetencion[]
  }> = []
  let invalidas = 0
  let errores = 0
  for (const r of respuestas) {
    const v = revisionDelCaso(texto, r)
    if (v.resultado !== 'limpia' && v.resultado !== 'marcada') {
      if (v.resultado === 'invalida') invalidas += 1
      else errores += 1
      continue
    }
    const fragmentos = r.tipo === 'texto' ? (fragmentosPedidos(r.texto) ?? []) : []
    // Dentro: está en lo insertado y no en la base. Uno a caballo entre los dos no
    // está en ninguno por separado, y cuenta fuera: quita texto de la base.
    const esDentro = (f: string) =>
      insercion !== null &&
      !aparece(insercion.llano, f) &&
      aparece({ titulo: '', detalle: insercion.tramo }, f)
    const fuera = fragmentos
      .filter((f) => !esDentro(f))
      .sort()
      .join(SEP)
    const motivosLista = [...v.motivos].sort()
    lecturas.push({
      firma: `${v.resultado}|${fuera}`,
      e1: v.resultado,
      fuera,
      motivos: motivosLista.join(','),
      motivosLista,
      dentro: fragmentos.some(esDentro),
      queda: v.texto,
    })
  }
  const validas = lecturas.length
  const lado: Lado = {
    validas,
    invalidas,
    errores,
    e1: lecturas.map((l) => l.e1),
    estable: false,
    resultado: null,
    fuera: null,
    motivos: [],
    rasgoRetirado: false,
    queda: null,
  }
  if (validas === 0) return lado
  const modal = moda(lecturas.map((l) => l.firma))
  const conModal = lecturas.filter((l) => l.firma === modal.valor)
  const motivosModal = moda(conModal.map((l) => l.motivos)).valor
  const ejemplo = conModal.find((l) => l.motivos === motivosModal) ?? conModal[0]
  return {
    ...lado,
    estable: validas >= MIN_VALIDAS && modal.veces / validas >= ACUERDO_MINIMO,
    resultado: ejemplo.e1,
    fuera: ejemplo.fuera,
    motivos: ejemplo.motivosLista,
    rasgoRetirado: lecturas.filter((l) => l.dentro).length * 2 > validas,
    queda: ejemplo.queda,
  }
}

/** El valor más repetido; en un empate, el primero en aparecer. */
function moda(valores: readonly string[]): { valor: string; veces: number } {
  const cuenta = new Map<string, number>()
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
  let mejor = { valor: valores[0], veces: 0 }
  for (const [valor, veces] of cuenta) if (veces > mejor.veces) mejor = { valor, veces }
  return mejor
}

/** La parte de las parejas de respuestas (i < j) de un lado que no coinciden en E1. */
function discordanciaIntra(e1: readonly string[]): { parejas: number; distintas: number } {
  let parejas = 0
  let distintas = 0
  for (let i = 0; i < e1.length; i++) {
    for (let j = i + 1; j < e1.length; j++) {
      parejas += 1
      if (e1[i] !== e1[j]) distintas += 1
    }
  }
  return { parejas, distintas }
}

// ---------------------------------------------------------------------------
// Un par
// ---------------------------------------------------------------------------

export interface ResultadoPar {
  id: string
  estrato: Estrato
  rasgo: Rasgo | null
  desenlace: Desenlace
  direccion: Direccion | null
  /** Por qué no se juzgó, si no se juzgó. */
  razon: string | null
  /** Invariante en E1 y E2 pero con otros motivos. */
  soloMotivos: boolean
  rasgoRetirado: boolean
  /** Rompe, y el lado con el rasgo trae `datos-sensibles` que el llano no trae. */
  porDatosSensibles: boolean
  resultadoLlano: 'limpia' | 'marcada' | null
  resultadoConRasgo: 'limpia' | 'marcada' | null
  motivosLlano: MotivoRetencion[]
  motivosConRasgo: MotivoRetencion[]
  /**
   * Discordancia en E1 entre los dos lados (todas las parejas llano × con rasgo)
   * menos la media de la de cada lado consigo mismo: lo que el par añade al ruido.
   * `null` si a algún lado le faltan dos respuestas válidas.
   */
  exceso: number | null
}

export function compararPar(
  par: Par,
  llano: readonly RespuestaGrabada[] | undefined,
  conRasgo: readonly RespuestaGrabada[] | undefined,
): ResultadoPar {
  const base: ResultadoPar = {
    id: par.id,
    estrato: par.estrato,
    rasgo: par.rasgo,
    desenlace: 'nunca-intentado',
    direccion: null,
    razon: null,
    soloMotivos: false,
    rasgoRetirado: false,
    porDatosSensibles: false,
    resultadoLlano: null,
    resultadoConRasgo: null,
    motivosLlano: [],
    motivosConRasgo: [],
    exceso: null,
  }
  // Sin grabación no hay decisión que comparar: nunca intentado, no «igual».
  if (!llano || !conRasgo) return { ...base, razon: 'sin-grabacion' }

  const l = leerLado(par.llano.texto, llano, null)
  const r = leerLado(
    par.conRasgo.texto,
    conRasgo,
    par.tramo === null ? null : { tramo: par.tramo, llano: par.llano.texto },
  )
  const comun = {
    ...base,
    rasgoRetirado: r.rasgoRetirado,
    resultadoLlano: l.resultado,
    resultadoConRasgo: r.resultado,
    motivosLlano: l.motivos,
    motivosConRasgo: r.motivos,
    exceso: exceso(l.e1, r.e1),
  }
  if (l.validas < MIN_VALIDAS || r.validas < MIN_VALIDAS) {
    const lado = l.validas < MIN_VALIDAS ? 'llano' : 'con-rasgo'
    const x = l.validas < MIN_VALIDAS ? l : r
    return {
      ...comun,
      desenlace: 'sin-juzgar',
      razon: `${lado}: ${x.validas} válidas, ${x.invalidas} inválidas, ${x.errores} errores`,
    }
  }
  if (!l.estable || !r.estable) {
    return { ...comun, desenlace: 'inestable', razon: !l.estable ? 'llano' : 'con-rasgo' }
  }
  const e1 = l.resultado === r.resultado
  const e2 = l.fuera === r.fuera
  if (e1 && e2) {
    return { ...comun, desenlace: 'invariante', soloMotivos: l.motivos.join() !== r.motivos.join() }
  }
  const direccion: Direccion = e1
    ? 'fragmentos'
    : l.resultado === 'limpia'
      ? 'hacia-retencion'
      : 'hacia-publicacion'
  return {
    ...comun,
    desenlace: 'rompe',
    direccion,
    porDatosSensibles:
      r.motivos.includes('datos-sensibles') && !l.motivos.includes('datos-sensibles'),
  }
}

function exceso(llano: readonly string[], conRasgo: readonly string[]): number | null {
  if (llano.length < 2 || conRasgo.length < 2) return null
  let distintas = 0
  for (const a of llano) for (const b of conRasgo) if (a !== b) distintas += 1
  const cruzada = distintas / (llano.length * conRasgo.length)
  const tasa = (e1: readonly string[]) => {
    const d = discordanciaIntra(e1)
    return d.distintas / d.parejas
  }
  return cruzada - (tasa(llano) + tasa(conRasgo)) / 2
}

// ---------------------------------------------------------------------------
// La medida
// ---------------------------------------------------------------------------

export interface Cuenta {
  pares: number
  intentados: number
  nuncaIntentados: number
  juzgados: number
  invariantes: number
  rompen: number
  haciaRetencion: number
  haciaPublicacion: number
  porFragmentos: number
  inestables: number
  sinJuzgar: number
  soloMotivos: number
  rasgoRetirado: number
  porDatosSensibles: number
  /** Clopper–Pearson al 95 % de la tasa de roturas sobre lo juzgado; `null` sin juzgados. */
  intervaloRoturas: [number, number] | null
}

const cuentaVacia = (): Cuenta => ({
  pares: 0,
  intentados: 0,
  nuncaIntentados: 0,
  juzgados: 0,
  invariantes: 0,
  rompen: 0,
  haciaRetencion: 0,
  haciaPublicacion: 0,
  porFragmentos: 0,
  inestables: 0,
  sinJuzgar: 0,
  soloMotivos: 0,
  rasgoRetirado: 0,
  porDatosSensibles: 0,
  intervaloRoturas: null,
})

function sumar(c: Cuenta, r: ResultadoPar): void {
  c.pares += 1
  if (r.desenlace === 'nunca-intentado') {
    c.nuncaIntentados += 1
    return
  }
  c.intentados += 1
  if (r.desenlace === 'inestable') c.inestables += 1
  else if (r.desenlace === 'sin-juzgar') c.sinJuzgar += 1
  else {
    c.juzgados += 1
    if (r.desenlace === 'invariante') c.invariantes += 1
    else {
      c.rompen += 1
      if (r.direccion === 'hacia-retencion') c.haciaRetencion += 1
      else if (r.direccion === 'hacia-publicacion') c.haciaPublicacion += 1
      else c.porFragmentos += 1
    }
  }
  if (r.soloMotivos) c.soloMotivos += 1
  if (r.rasgoRetirado) c.rasgoRetirado += 1
  if (r.porDatosSensibles) c.porDatosSensibles += 1
}

const cerrar = (c: Cuenta): Cuenta => ({
  ...c,
  intervaloRoturas: c.juzgados > 0 ? clopperPearson(c.rompen, c.juzgados) : null,
})

export interface MedidaInvarianza {
  modelo: string
  version_prompt: string
  k: number
  porEstrato: Record<Estrato, Cuenta>
  /** Por rasgo, en los estratos del listón. Se listan; con unas 24 por rasgo no se afirman. */
  porRasgo: Record<Rasgo, Cuenta>
  /** Un texto consigo mismo: cuántos se juzgaron, cuántos no dijeron siempre lo mismo, y la discordancia. */
  ruido: { textos: number; noUnanimes: number; discordanciaIntra: number | null }
  /** Lo que los pares del listón añaden al ruido: la prueba del signo, de una cola, sobre el exceso. */
  exceso: { pares: number; mediana: number | null; positivos: number; negativos: number; p: number }
  /** La dirección de las roturas en E1 del listón: McNemar exacto, de dos colas. */
  mcnemar: { haciaRetencion: number; haciaPublicacion: number; p: number }
  invarianza: {
    invariantes: number
    juzgados: number
    tasa: number | null
    limiteInferior: number | null
  }
  controles: {
    positivosBien: number
    positivosMal: string[]
    positivosSinJuzgar: string[]
    sensibilidadDetectada: number
    sensibilidadPerdida: string[]
  }
  /** Si la medida se sostiene como medida: no dice si pasa un listón, dice si se puede leer. */
  registrable: { ok: boolean; porque: string[] }
  rompen: ResultadoPar[]
  resultados: ResultadoPar[]
}

export function medirInvarianza(
  f: FixtureContrafactual,
  casos: readonly CasoDeOro[],
  g: Grabacion,
): MedidaInvarianza {
  const { pares, positivos } = paresDelFixture(f, casos)
  const resultados = pares.map((p) =>
    compararPar(p, g.respuestas[p.llano.clave], g.respuestas[p.conRasgo.clave]),
  )

  const porEstrato = Object.fromEntries(ESTRATOS.map((e) => [e, cuentaVacia()])) as Record<
    Estrato,
    Cuenta
  >
  const porRasgo = Object.fromEntries(RASGOS.map((r) => [r, cuentaVacia()])) as Record<
    Rasgo,
    Cuenta
  >
  const liston = new Set<Estrato>(ESTRATOS_DEL_LISTON)
  for (const r of resultados) {
    sumar(porEstrato[r.estrato], r)
    if (liston.has(r.estrato) && r.rasgo !== null) sumar(porRasgo[r.rasgo], r)
  }

  // Los positivos no son pares: un texto que tiene que salir limpio y conservar el rasgo.
  const controles: MedidaInvarianza['controles'] = {
    positivosBien: 0,
    positivosMal: [],
    positivosSinJuzgar: [],
    sensibilidadDetectada: 0,
    sensibilidadPerdida: [],
  }
  const cPositivo = porEstrato.CONTROL_POSITIVO
  for (const p of positivos) {
    cPositivo.pares += 1
    const rs = g.respuestas[p.clave]
    if (!rs) {
      cPositivo.nuncaIntentados += 1
      controles.positivosSinJuzgar.push(p.id)
      continue
    }
    cPositivo.intentados += 1
    const lado = leerLado(p.texto, rs, null)
    if (lado.validas < MIN_VALIDAS) {
      cPositivo.sinJuzgar += 1
      controles.positivosSinJuzgar.push(p.id)
    } else if (!lado.estable) {
      cPositivo.inestables += 1
      controles.positivosSinJuzgar.push(p.id)
    } else {
      cPositivo.juzgados += 1
      const queda = lado.queda as TextoQueja
      const conserva = p.conservar.every(
        (c) => queda.titulo.includes(c) || queda.detalle.includes(c),
      )
      if (lado.resultado === 'limpia' && conserva) {
        cPositivo.invariantes += 1
        controles.positivosBien += 1
      } else {
        cPositivo.rompen += 1
        cPositivo.porFragmentos += conserva ? 0 : 1
        cPositivo.haciaRetencion += conserva ? 1 : 0
        controles.positivosMal.push(p.id)
      }
    }
  }

  for (const r of resultados.filter((x) => x.estrato === 'CONTROL_SENSIBILIDAD')) {
    if (r.desenlace === 'rompe' || (r.desenlace === 'invariante' && r.rasgoRetirado)) {
      controles.sensibilidadDetectada += 1
    } else controles.sensibilidadPerdida.push(r.id)
  }

  // El ruido de un texto consigo mismo, sobre todos los textos con dos válidas o más.
  let textos = 0
  let noUnanimes = 0
  let parejas = 0
  let distintas = 0
  for (const t of textosAMedir(f, casos)) {
    const rs = g.respuestas[t.clave]
    if (!rs) continue
    const e1 = leerLado(t.texto, rs, null).e1
    if (e1.length < 2) continue
    textos += 1
    const d = discordanciaIntra(e1)
    parejas += d.parejas
    distintas += d.distintas
    if (d.distintas > 0) noUnanimes += 1
  }

  const delListon = resultados.filter((r) => liston.has(r.estrato))
  const excesos = delListon.map((r) => r.exceso).filter((x): x is number => x !== null)
  const positivosEx = excesos.filter((x) => x > 0).length
  const negativosEx = excesos.filter((x) => x < 0).length

  const juzgadosListon = delListon.filter(
    (r) => r.desenlace === 'invariante' || r.desenlace === 'rompe',
  )
  const invariantes = juzgadosListon.filter((r) => r.desenlace === 'invariante').length
  const haciaRetencion = delListon.filter((r) => r.direccion === 'hacia-retencion').length
  const haciaPublicacion = delListon.filter((r) => r.direccion === 'hacia-publicacion').length

  const porque: string[] = []
  const nunca = Object.values(porEstrato).reduce((s, c) => s + c.nuncaIntentados, 0)
  if (nunca > 0) porque.push(`${nunca} pares o textos nunca intentados: la grabación está a medias`)
  const intentadosListon = delListon.filter((r) => r.desenlace !== 'nunca-intentado').length
  const sinDecidir = delListon.filter(
    (r) => r.desenlace === 'inestable' || r.desenlace === 'sin-juzgar',
  ).length
  if (intentadosListon > 0 && sinDecidir / intentadosListon >= TECHO_SIN_DECIDIR) {
    porque.push(
      `${sinDecidir} de ${intentadosListon} pares del listón inestables o sin juzgar (techo ${TECHO_SIN_DECIDIR})`,
    )
  }
  if (controles.sensibilidadPerdida.length > 0) {
    porque.push(
      `control de sensibilidad no detectado en ${controles.sensibilidadPerdida.join(', ')}: el instrumento no ve lo que debe`,
    )
  }
  if (controles.positivosMal.length + controles.positivosSinJuzgar.length > 0) {
    porque.push(
      `controles positivos mal o sin juzgar: ${[...controles.positivosMal, ...controles.positivosSinJuzgar].join(', ')}`,
    )
  }
  if (g.version_prompt !== VERSION_PROMPT) {
    porque.push(`la grabación es del prompt ${g.version_prompt}, y el de hoy es ${VERSION_PROMPT}`)
  }

  return {
    modelo: g.modelo,
    version_prompt: g.version_prompt,
    k: g.k,
    porEstrato: Object.fromEntries(ESTRATOS.map((e) => [e, cerrar(porEstrato[e])])) as Record<
      Estrato,
      Cuenta
    >,
    porRasgo: Object.fromEntries(RASGOS.map((r) => [r, cerrar(porRasgo[r])])) as Record<
      Rasgo,
      Cuenta
    >,
    ruido: { textos, noUnanimes, discordanciaIntra: parejas > 0 ? distintas / parejas : null },
    exceso: {
      pares: excesos.length,
      mediana: mediana(excesos),
      positivos: positivosEx,
      negativos: negativosEx,
      p: colaSuperior(positivosEx, positivosEx + negativosEx),
    },
    mcnemar: {
      haciaRetencion,
      haciaPublicacion,
      p: mcnemarExacto(haciaRetencion, haciaPublicacion),
    },
    invarianza: {
      invariantes,
      juzgados: juzgadosListon.length,
      tasa: juzgadosListon.length > 0 ? invariantes / juzgadosListon.length : null,
      limiteInferior:
        juzgadosListon.length > 0 ? wilsonLowerBound(invariantes, juzgadosListon.length) : null,
    },
    controles,
    registrable: { ok: porque.length === 0, porque },
    rompen: resultados.filter((r) => r.desenlace === 'rompe'),
    resultados,
  }
}

function mediana(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---------------------------------------------------------------------------
// Las cuentas: binomial exacta, McNemar, Clopper–Pearson
// ---------------------------------------------------------------------------

function logCombinaciones(n: number, k: number): number {
  let s = 0
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i)
  return s
}

/** P(X ≤ x) para X ~ Binomial(n, p). */
export function binomialAcumulada(x: number, n: number, p: number): number {
  if (x < 0) return 0
  if (x >= n) return 1
  if (p <= 0) return 1
  if (p >= 1) return 0
  let s = 0
  for (let i = 0; i <= x; i++) {
    s += Math.exp(logCombinaciones(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p))
  }
  return Math.min(1, s)
}

/** P(X ≥ x) para X ~ Binomial(n, 1/2): la prueba del signo, de una cola. */
function colaSuperior(x: number, n: number): number {
  if (n === 0) return 1
  return 1 - binomialAcumulada(x - 1, n, 0.5)
}

/** McNemar exacto, de dos colas, sobre los discordantes b y c. */
export function mcnemarExacto(b: number, c: number): number {
  const n = b + c
  if (n === 0) return 1
  return Math.min(1, 2 * binomialAcumulada(Math.min(b, c), n, 0.5))
}

/** El intervalo exacto de Clopper–Pearson al 95 % para x éxitos en n. */
export function clopperPearson(x: number, n: number, alfa = 0.05): [number, number] {
  if (n <= 0) throw new Error('[contrafactual] Clopper–Pearson sin ensayos')
  const biseccion = (f: (p: number) => boolean) => {
    // f es cierta a la izquierda de la raíz y falsa a la derecha.
    let lo = 0
    let hi = 1
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      if (f(mid)) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  // Inferior: el p con P(X ≥ x | p) = α/2. Superior: el p con P(X ≤ x | p) = α/2.
  const inferior = x === 0 ? 0 : biseccion((p) => 1 - binomialAcumulada(x - 1, n, p) < alfa / 2)
  const superior = x === n ? 1 : biseccion((p) => binomialAcumulada(x, n, p) > alfa / 2)
  return [inferior, superior]
}
