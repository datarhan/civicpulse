#!/usr/bin/env tsx
/**
 * check:veredictos — ¿sigue sosteniéndose lo que los veredictos publicados
 * afirman?
 *
 *   npm run check:veredictos
 *   npm run check:veredictos -- --json
 *
 * El nodo que faltaba. Las citas tienen `check:citations`; las cifras de las
 * fichas tienen `check:eficiencia-findings` con sus cuatro desenlaces. Los
 * VEREDICTOS —que son la afirmación más fuerte que hace este sitio sobre lo
 * que alguien dijo— no tenían nada que volviera a preguntar si siguen
 * fundados.
 *
 * Un veredicto por encima de `sin-datos` afirma que algo respalda la
 * afirmación. Desde el suelo de evidencia (fase 2) eso ya no se puede
 * ESCRIBIR sin corpus; esto mira lo que YA está escrito, que es otra pregunta.
 *
 * Siete desenlaces, y el reparto de códigos de salida es el punto:
 *
 *   fundado               nombra corpus y trae evidencia
 *   subido                lo subió una persona con su firma —la subida
 *                         firmada, src/scraper/subida-firmada.ts—, nombra
 *                         corpus y trae evidencia · sale 0. El parte no
 *                         imprime su nombre: lo da la tarjeta
 *   curado                lo bajó la vía del curador · sale 0 — es la
 *                         sancionada en todo este repositorio, y bajar un
 *                         veredicto nunca refuerza una afirmación. El
 *                         detalle dice quién lo decidió: una persona, una
 *                         revisión automática, o que no consta
 *   procedencia-retirada  se apoya en una pasada que ya no está en la tubería
 *                         · AVISO, sale 0 — es la cola de la fase 6, no una
 *                           avería, y una guarda siempre roja acaba apagada
 *   sin-corpus            veredicto fuerte sin corpus, de una pasada VIVA
 *                         · sale 1 — eso lo ha roto alguien hoy
 *   sin-firma             dice ser una subida firmada —por su canal o por su
 *                         pasada— y no la firma una persona · sale 1
 *   sin-publicar          no hay trozos que leer · SALTADO, jamás «ok»
 *
 * La distinción entre los dos del medio es lo que hace la guarda usable: con
 * las 87 filas viejas y una rotura nueva en el mismo saco, esto saldría rojo
 * todas las noches hasta la fase 6 y nadie miraría el día que importara.
 *
 * Anti-hueco: imprime cuántos veredictos evaluó. Uno que no miró nada y uno
 * que no encontró nada no pueden imprimir el mismo «✓».
 *
 * ── El segundo cotejo: lo que el overlay publica, contra la base de hoy ──────
 *
 * `curado` sale 0 porque bajar un veredicto nunca refuerza una afirmación. Eso
 * vale mientras la entrada baje respecto de la BASE, y la base se mueve: una
 * entrada se juzga al escribirla contra la de ese día y se reaplica sobre cada
 * una posterior sin mirar (`overlayOutcomes`, verified-merge.ts). El 04-10-2026,
 * 1sqj7is-053-pro-68944b publicaba `parcial` —una bajada de junio desde el
 * `verificado` de la pasada LLM retirada, con la evidencia de esa pasada— sobre
 * una base que dice `sin-datos`, y esto la contaba como `curado`.
 *
 *   por-encima  la entrada publica por encima de lo que dice hoy su base
 *               · sale 1, y nombra cómo se sirve su fila. Ninguna escritura
 *                 automática del overlay sube un veredicto —el curador y el
 *                 motor bajan, y el anclaje NLI sólo propone—, así que eso
 *                 sólo lo deja una base que se movió por debajo; lo decide una
 *                 persona
 *   subidas firmadas  por encima de su base A PROPÓSITO: las subió una persona
 *                 con `subir-veredicto` y su firma (`esSubidaFirmada`, desde el
 *                 04-10-2026, que es la firma que esta cabecera pedía
 *                 distinguir). Se listan y salen 0; una entrada de ese canal
 *                 sin la firma de una persona sigue siendo `por-encima`
 *   sin-claim   su declaración ya no está en la base: ni se aplica ni se
 *               publica · se lista, sale 0
 *   sin-base    no hay base en disco (gitignorada; clon nuevo) · SALTADO,
 *               jamás «0 por encima»
 *
 * Se compara con la base que HAY: lo que encuentra hoy el verificador. Si lo
 * publicado sale de ella lo dice `check:verified-compose`; aquí se imprimen los
 * dos sellos y cuántas entradas se cotejaron.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  corpusReales,
  clasificarProcedencia,
  esPasadaRetirada,
} from '../src/scraper/claim-verdicts'
import {
  CLASES_DE_FIRMA,
  nombraAUnaPersona,
  type ClaseDeFirma,
} from '../src/scraper/firma-de-persona'
import {
  overlayOutcomes,
  type EntradaPorEncima,
  type Overlay,
  type VerifiedItem,
} from '../src/scraper/verified-merge'
import { BASE, VERIFIED, loadOverlay } from './verified-rebuild'

const DIR = resolve('public/data/pleno-claims')

export const ESTADOS_VEREDICTO = [
  'fundado',
  'subido',
  'curado',
  'procedencia-retirada',
  'sin-corpus',
  'sin-firma',
  'sin-publicar',
] as const
export type EstadoVeredicto = (typeof ESTADOS_VEREDICTO)[number]

interface Fila {
  id: string
  verdict: string
  estado: EstadoVeredicto
  detalle: string
}

interface Item {
  claim?: { id?: string; type?: string }
  verification?: {
    verdict?: string
    checkedAgainst?: unknown[]
    evidence?: unknown[]
    source?: string
    downgradedBy?: string
    derivedBy?: unknown[]
    raisedBy?: string
  }
  /** La que estampó la puerta al trocear: `shown` o `toggle`. */
  visibility?: string
}

/**
 * Quién decidió una bajada del curador, para el detalle de `curado`. Del sello
 * que `mergeVerified` pone con el canal, no de la marca: la vía del curador la
 * han usado también una revisión con un modelo y sesiones de Claude, y 47 de
 * las 69 bajadas del overlay no las firma una persona (30-09-2026).
 */
const QUIEN_BAJO: Record<ClaseDeFirma, string> = {
  persona: 'lo bajó una persona',
  automatica: 'lo bajó una revisión automática',
  'no-consta': 'lo bajó la vía del curador y no consta quién lo decidió',
}

function quienBajo(v: NonNullable<Item['verification']>): string {
  const clase = CLASES_DE_FIRMA.find((c) => c === v.downgradedBy)
  return QUIEN_BAJO[v.source === 'curator-downgrade' && clase ? clase : 'no-consta']
}

/** Puro: el desenlace de UN veredicto ya publicado. */
export function cotejarVeredicto(it: Item): Fila {
  const id = it.claim?.id ?? '(sin id)'
  const v = it.verification ?? {}
  const verdict = String(v.verdict ?? '')
  const fuerte = verdict === 'verificado' || verdict === 'parcial'
  if (!fuerte) return { id, verdict, estado: 'fundado', detalle: '' }

  const corpus = corpusReales(v.checkedAgainst)
  const conEvidencia = (v.evidence?.length ?? 0) > 0

  // La subida firmada (src/scraper/subida-firmada.ts), antes que «fundado»: es
  // la única escritura que refuerza un veredicto, y una sin la firma de una
  // persona —por su canal o por su pasada— la ha roto alguien hoy. El parte no
  // imprime el nombre: lo da la tarjeta.
  const diceSerSubida =
    v.source === 'curator-upgrade' ||
    (Array.isArray(v.derivedBy) && v.derivedBy.includes('curator-upgrade'))
  if (diceSerSubida) {
    const firmada =
      v.source === 'curator-upgrade' &&
      typeof v.raisedBy === 'string' &&
      nombraAUnaPersona(v.raisedBy)
    if (!firmada) {
      return {
        id,
        verdict,
        estado: 'sin-firma',
        detalle: 'dice ser una subida firmada y no la firma una persona',
      }
    }
    if (corpus.length === 0 || !conEvidencia) {
      return {
        id,
        verdict,
        estado: 'sin-corpus',
        detalle: 'una subida firmada sin corpus o sin evidencia',
      }
    }
    return {
      id,
      verdict,
      estado: 'subido',
      detalle: 'lo subió una persona, con su firma y el registro que lo sostiene',
    }
  }

  if (corpus.length > 0 && conEvidencia) return { id, verdict, estado: 'fundado', detalle: '' }

  // ¿De dónde viene? Tres respuestas distintas, y meterlas en el mismo saco
  // haría inútil la guarda.
  const { pasadas } = clasificarProcedencia(v.checkedAgainst)

  // La vía del curador. Es la sancionada en todo este repositorio —la misma que
  // `isCuratorPromoted` deja pasar por la puerta editorial— y el suelo de
  // evidencia la exime por lo mismo: sólo baja, y bajar un veredicto nunca
  // refuerza una afirmación, la decidiera una persona o una revisión
  // automática. El detalle dice cuál. Que su `checkedAgainst` se quedara sólo
  // con la marca es el campo con dos significados otra vez, y lo arregla la
  // fase 1b.
  if (pasadas.includes('curator-downgrade')) {
    return {
      id,
      verdict,
      estado: 'curado',
      detalle: `${quienBajo(v)}; su corpus original lo pisó la marca de la pasada`,
    }
  }

  const retirada = pasadas.find((p) => esPasadaRetirada(p))
  if (retirada) {
    return {
      id,
      verdict,
      estado: 'procedencia-retirada',
      detalle: `se apoya en «${retirada}», que ya no está en la tubería`,
    }
  }
  return {
    id,
    verdict,
    estado: 'sin-corpus',
    detalle: corpus.length === 0 ? 'no nombra ningún corpus real' : 'no trae ninguna evidencia',
  }
}

/** Una entrada por encima de su base, y cómo se sirve su fila. */
export interface FilaPorEncima extends EntradaPorEncima {
  /** La visibilidad de su fila en los trozos, o `no-servida` si no está en ninguno. */
  servida: string
}

export interface CotejoConBase {
  estado: 'cotejado' | 'sin-base'
  baseGeneratedAt: string | null
  publicadoGeneratedAt: string | null
  /** Las entradas del overlay que se cotejaron. Sin base, cero: no se miró ninguna. */
  entradas: number
  bajan: number
  iguales: number
  porEncima: FilaPorEncima[]
  /** Por encima de su base a propósito: las firmó una persona (`subir-veredicto`). */
  subidasFirmadas: FilaPorEncima[]
  sinClaim: string[]
  /** Por qué no se cotejó; `null` si se cotejó. */
  motivo: string | null
}

/**
 * Puro: cada entrada del overlay contra la base que hay en disco, y cómo se
 * sirve la fila de las que quedan por encima. Sin base no se coteja nada, y
 * sale `sin-base` con cero entradas: un «0 por encima» sin haber mirado sería
 * el visto bueno hueco que esta guarda existe para no dar.
 */
export function cotejarConBase(input: {
  base: { generatedAt?: unknown; items: VerifiedItem[] } | null
  overlay: Overlay
  servidas: ReadonlyMap<string, string>
  publicadoGeneratedAt: string | null
}): CotejoConBase {
  const { base, overlay, servidas, publicadoGeneratedAt } = input
  if (base == null) {
    return {
      estado: 'sin-base',
      baseGeneratedAt: null,
      publicadoGeneratedAt,
      entradas: 0,
      bajan: 0,
      iguales: 0,
      porEncima: [],
      subidasFirmadas: [],
      sinClaim: [],
      motivo:
        'no hay base que leer en disco (está gitignorada); se regenera con ' +
        '`npm run verify:pleno-claims -- --base-only`',
    }
  }
  const d = overlayOutcomes(base.items, overlay)
  return {
    estado: 'cotejado',
    baseGeneratedAt: typeof base.generatedAt === 'string' ? base.generatedAt : null,
    publicadoGeneratedAt,
    entradas:
      d.bajan.length +
      d.iguales.length +
      d.porEncima.length +
      d.subidasFirmadas.length +
      d.sinClaim.length,
    bajan: d.bajan.length,
    iguales: d.iguales.length,
    porEncima: d.porEncima.map((p) => ({ ...p, servida: servidas.get(p.id) ?? 'no-servida' })),
    subidasFirmadas: d.subidasFirmadas.map((p) => ({
      ...p,
      servida: servidas.get(p.id) ?? 'no-servida',
    })),
    sinClaim: d.sinClaim,
    motivo: null,
  }
}

/** Un volcado JSON, o `null` si no está o no se deja leer. */
function leerJson(path: string): unknown {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** Imprime el segundo cotejo. Devuelve si hay alguna entrada por encima de su base. */
function informarDelCotejoConBase(c: CotejoConBase): boolean {
  if (c.estado === 'sin-base') {
    process.stdout.write(
      `[check-veredictos] cotejo con la base: SALTADO — ${c.motivo}. No se ha cotejado ninguna ` +
        'entrada del overlay, que no es lo mismo que no haya ninguna por encima.\n',
    )
    return false
  }
  process.stdout.write(
    `[check-veredictos] cotejo con la base: ${c.entradas} entrada(s) del overlay · ${c.bajan} ` +
      `bajan · ${c.iguales} iguales · ${c.porEncima.length} por encima · ${c.sinClaim.length} sin ` +
      `claim en la base (base ${c.baseGeneratedAt ?? '—'} · publicado ${c.publicadoGeneratedAt ?? '—'})\n`,
  )
  if (c.subidasFirmadas.length > 0) {
    process.stdout.write(
      `  · ${c.subidasFirmadas.length} subida(s) firmada(s) por encima de su base: las firmó una ` +
        'persona con `npm run subir-veredicto`, y no son un fallo ' +
        `(${c.subidasFirmadas.map((p) => `${p.id} ${p.base}→${p.publica}`).join(', ')})\n`,
    )
  }
  if (c.sinClaim.length > 0) {
    const vistas = c.sinClaim.slice(0, 10).join(', ')
    const resto = c.sinClaim.length - 10
    process.stdout.write(
      `  · ${c.sinClaim.length} entrada(s) sin claim en la base: ni se aplican ni se publican ` +
        `(${vistas}${resto > 0 ? ` y ${resto} más; --json las lista todas` : ''})\n`,
    )
  }
  for (const p of c.porEncima) {
    process.stderr.write(
      `  ✗ [por-encima] ${p.id}: publica ${p.publica} y la base dice ${p.base} · ${p.source} · ` +
        `se sirve: ${p.servida}\n`,
    )
  }
  if (c.porEncima.length === 0) return false
  process.stderr.write(
    `[check-veredictos] ${c.porEncima.length} entrada(s) del overlay publican por encima de lo que ` +
      'encuentra hoy el verificador. Ninguna escritura automática del overlay sube un veredicto, y ' +
      'las subidas firmadas se cuentan aparte: la base se movió por debajo de una entrada juzgada ' +
      'contra otra. Lo decide una persona —una bajada firmada con ' +
      '`npm run downgrade-verdict`, o arreglar la base si la que se equivoca es ella—, y nada ' +
      'automático la toca.\n',
  )
  return true
}

function main(): void {
  const asJson = process.argv.includes('--json')

  if (!existsSync(DIR)) {
    process.stdout.write(
      `[check-veredictos] 0 veredicto(s) · SALTADO: no existe ${DIR}. No se ha comprobado nada, ` +
        'que no es lo mismo que estar todo bien.\n',
    )
    return
  }
  const items: Item[] = readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .flatMap((f) => (JSON.parse(readFileSync(join(DIR, f), 'utf8')) as { items: Item[] }).items)

  if (items.length === 0) {
    process.stdout.write(
      '[check-veredictos] 0 veredicto(s) · SALTADO: los trozos no traen ni una fila. No se ha ' +
        'comprobado nada, que no es lo mismo que estar todo bien.\n',
    )
    return
  }

  const filas = items.map(cotejarVeredicto)
  const fuertes = filas.filter((f) => f.verdict === 'verificado' || f.verdict === 'parcial')
  const retiradas = filas.filter((f) => f.estado === 'procedencia-retirada')
  const curados = filas.filter((f) => f.estado === 'curado')
  const subidos = filas.filter((f) => f.estado === 'subido')
  const sinCorpus = filas.filter((f) => f.estado === 'sin-corpus')
  const sinFirma = filas.filter((f) => f.estado === 'sin-firma')
  // Las dos roturas salen 1, cada una con su nombre: contarlas juntas diría
  // «sin corpus» de una subida a la que lo que le falta es la firma.
  const rotos = [...sinCorpus, ...sinFirma]

  const servidas = new Map<string, string>()
  for (const it of items) {
    if (it.claim?.id) servidas.set(it.claim.id, String(it.visibility ?? 'sin-visibilidad'))
  }
  const base = leerJson(BASE) as { generatedAt?: unknown; items?: unknown } | null
  const publicado = leerJson(VERIFIED) as { generatedAt?: unknown } | null
  const conBase = cotejarConBase({
    base:
      base && Array.isArray(base.items)
        ? { generatedAt: base.generatedAt, items: base.items as VerifiedItem[] }
        : null,
    overlay: loadOverlay(),
    servidas,
    publicadoGeneratedAt: typeof publicado?.generatedAt === 'string' ? publicado.generatedAt : null,
  })

  // `exitCode` y no `exit()`: con la salida por tubería —el parte de la salud
  // la lee así— salir en seco puede cortar justo los renglones que dicen qué.
  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        {
          evaluados: filas.length,
          fuertes: fuertes.length,
          subidos,
          curados,
          retiradas,
          rotos,
          base: conBase,
        },
        null,
        2,
      ) + '\n',
    )
    process.exitCode = rotos.length || conBase.porEncima.length ? 1 : 0
    return
  }

  process.stdout.write(
    `[check-veredictos] ${filas.length} veredicto(s) evaluado(s) · ${fuertes.length} fuerte(s) · ` +
      `${subidos.length} subido(s) por una persona · ${curados.length} curado(s) · ` +
      `${retiradas.length} de procedencia retirada · ${sinCorpus.length} sin corpus · ` +
      `${sinFirma.length} sin firma\n`,
  )

  if (retiradas.length > 0) {
    process.stdout.write(
      `  · ${retiradas.length} veredicto(s) fuertes se apoyan en una pasada retirada. Es la cola ` +
        'de la fase 6: re-fundamentar con `npm run verify:pleno-claims:nli` lo que se pueda y ' +
        'bajar el resto a sin-datos.\n',
    )
  }
  // Con su código entre corchetes, como `[por-encima]`: la huella del parte de
  // la salud (`alertFingerprint`) sale de ellos, y una rota sin código no la
  // movería mientras el aviso por encima siga dado — se descartaría por repetida.
  for (const r of rotos.slice(0, 10)) {
    process.stderr.write(`  ✗ [${r.estado}] ${r.id}: ${r.verdict} — ${r.detalle}\n`)
  }
  const sobreLaBase = informarDelCotejoConBase(conBase)

  // Que la comprobación haya mirado algo de verdad: si NINGÚN veredicto fuera
  // fuerte, todo saldría `fundado` por la puerta de arriba y esto imprimiría
  // un visto bueno sin haber juzgado nada.
  if (fuertes.length === 0) {
    process.stderr.write(
      '[check-veredictos] ningún veredicto fuerte en lo publicado: no estoy juzgando nada, que ' +
        'no es lo mismo que estar todo bien\n',
    )
    process.exitCode = 1
    return
  }
  if (sinFirma.length) {
    process.stderr.write(
      `[check-veredictos] ${sinFirma.length} veredicto(s) que dicen ser una subida firmada sin la ` +
        'firma de una persona: el overlay no las deja escribir así, así que mira quién las ha ' +
        'metido por otra vía.\n',
    )
    process.exitCode = 1
  }
  if (sinCorpus.length) {
    process.stderr.write(
      `[check-veredictos] ${sinCorpus.length} veredicto(s) fuertes sin nada que los sostenga, y NO ` +
        'vienen de una pasada retirada: esto es de hoy. El suelo de evidencia impide escribirlos ' +
        'por el overlay, así que mira quién los ha metido por otra vía.\n',
    )
    process.exitCode = 1
  }
  if (rotos.length) return
  if (sobreLaBase) process.exitCode = 1
}

// Las pruebas importan `cotejarVeredicto` y `cotejarConBase`: al importar no
// se comprueba nada.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
