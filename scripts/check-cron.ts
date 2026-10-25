#!/usr/bin/env tsx
/**
 * check:cron — ¿ha corrido hoy la flota local?
 *
 *   npm run check:cron
 *   npm run check:cron -- --json
 *
 * El parte de salud corre dieciséis guardas de integridad y NINGUNA preguntaba
 * esto. El 2026-08-29 se vio lo que cuesta: el cron de las 06:55 dejó un rebase
 * a medias, HEAD quedó desacoplado, y como `cron_require_main` exige estar en
 * `main`, los cuatro agentes siguientes —review-sweep 07:30,
 * auto-curate-promises 08:30, hallazgos 09:30, press-lab 10:15— se saltaron en
 * silencio. El parte de las 11:00 informó de cuatro problemas de DATOS mientras
 * la causa era que no se estaba ejecutando nada.
 *
 * ## Por qué no vale `check:runs`
 *
 * `check:runs` lee manifiestos, y un cron que muere en la guarda de rama no
 * escribe ninguno: su último manifiesto simplemente ENVEJECE. Detecta «hace 48 h
 * que no hay una pasada buena», no «hoy no arrancó». Y sólo cubre 2 de los 5
 * agentes, de rebote — a través de una pasada que la tubería resulta que
 * ejecuta. `press-lab` no instrumenta ninguna, y `assertExpectationsAreReal`
 * prohíbe listar un script sin instrumentar, así que ni podría entrar ahí.
 * Esto tiene que ser un mecanismo aparte, y lo es.
 *
 * ## De dónde sale la lista de agentes
 *
 * De los propios plists, nunca de una tabla a mano. Cada
 * `~/Library/LaunchAgents/com.civicpulse.*.plist` ya declara su `Label`, su
 * `StartCalendarInterval` y su `StandardOutPath`: la flota se describe sola. Una
 * tabla escrita a mano DENTRO de un control contra el descuido se queda vieja
 * ella misma, que es el chiste que este repositorio ya ha contado dos veces.
 *
 * ## Qué se mide, y por qué eso y no otra cosa
 *
 * · **Vivo**: la HORA DEL FICHERO de log. launchd añade en cada disparo, así que
 *   el mtime prueba que el agente arrancó. Medido el 2026-08-29: los cinco logs
 *   marcaban exactamente sus horas (06:58, 07:30, 08:30, 09:30, 10:15).
 *
 *   La primera versión de esto miraba la última línea con prefijo
 *   `[etiqueta] [fecha]`, que escribe `cron_git_log`. No sirve: en una pasada
 *   sana de `scrape-ci-blocked` esa función no imprime NADA —`cron_require_main`
 *   sólo habla cuando se niega—, así que su última línea con prefijo era del 26
 *   de agosto mientras el script había corrido esa misma mañana. Un indicador
 *   que sólo se mueve cuando hay problemas no puede medir normalidad.
 *
 * · **Desenlace**: la palabra `OMITIDO`, que sí lleva su propia marca de tiempo
 *   porque va por `cron_git_log`. Es la distinción que un manifiesto no puede
 *   hacer nunca: la guarda REGISTRA ANTES DE SALIR, así que «corrió y se negó»
 *   queda separado de «no arrancó». Sin ella, un agente que se salta cada día
 *   parece uno que trabaja cada día.
 *
 * ## Corrió, pero no publica
 *
 * El 2026-10-22 la flota corrió a su hora todos los días y no publicó nada en
 * tres: hallazgos dejó 862c98a4 en local, el push chocó con la nocturna en cinco
 * derivados, y cada pull inicial de cada agente chocó igual — el abort dejaba el
 * árbol utilizable y el reintento seguía siendo imposible. Esta guarda no lo
 * vio, porque los logs se movían y nadie decía OMITIDO. Dos señales lo cierran:
 *
 * · **`cron-sin-publicar`**: `main` local por delante de `origin/main` con un
 *   commit de más de {@link HORAS_SIN_PUBLICAR} h. Por la fecha de AUTOR: un
 *   rebase reescribe la del committer y la racha volvería a cero cada pasada.
 * · **`cron-pull-atascado`**: los últimos {@link PULLS_FALLIDOS_SEGUIDOS} pulls
 *   de toda la flota, por orden de hora, fallaron. Lo leen las marcas
 *   `pull-estado ok|FALLIDO` que `cron_git_pull_rebase` escribe en cada pull —
 *   también en el bueno, que es lo que corta la racha.
 *
 * ## Anti-hueco
 *
 * Sin un solo plist —CI, un clon fresco, otro sistema operativo— esto NO pasa en
 * verde: lo dice y sale distinto de cero. Un «toda la flota al día» sobre una
 * flota vacía es exactamente el gate que no mide nada.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  describirHorarios,
  horariosDe,
  ultimaProgramada,
  type Horario,
} from '../src/scraper/launchd-horario'

export { describirHorarios, horariosDe, ultimaProgramada, type Horario }

/** Dónde vive la flota. Se puede apuntar a otro sitio para ejercer la guarda. */
const DIR_AGENTES = process.env.CRON_AGENTS_DIR ?? join(homedir(), 'Library', 'LaunchAgents')

/**
 * Margen sobre la hora programada antes de dar un agente por atrasado.
 *
 * No es holgura decorativa: un portátil dormido a las 09:30 ejecuta el trabajo
 * al despertar, y eso no es un fallo. Tres horas absorben ese caso y siguen
 * cazando una mañana entera perdida, que es lo que hay que ver.
 */
export const TOLERANCIA_HORAS = 3

export interface AgenteProgramado {
  label: string
  /** Vacío si el plist no declara un horario legible — se informa, no se salta. */
  horarios: Horario[]
  log: string
}

export interface EstadoAgente {
  label: string
  programado: string
  log: string
  /** Momento del último disparo, por la hora del fichero. */
  ultimo: Date | null
  /** La hora a la que le tocaba por última vez; null si no tiene horario. */
  tocaba: Date | null
  omitidoEn: Date | null
  /** Las marcas `pull-estado` de la cola del log, en orden. */
  pulls: EventoPull[]
}

export interface EventoPull {
  agente: string
  at: Date
  ok: boolean
}

/** Pulls fallidos seguidos, en toda la flota, a partir de los cuales es rojo. */
export const PULLS_FALLIDOS_SEGUIDOS = 3

/** Horas que puede esperar un commit local sin publicar antes de ser rojo. */
export const HORAS_SIN_PUBLICAR = 24

export interface Hallazgo {
  code: string
  message: string
}

/**
 * La marca de tiempo del último `OMITIDO` del log, o null.
 *
 * `cron_git_log` escribe `[etiqueta] [YYYY-MM-DD HH:MM:SS] …`, así que la línea
 * trae su propia hora y no hace falta suponer que es la última del fichero.
 */
export function ultimoOmitido(texto: string): Date | null {
  const re = /^\[[a-z0-9-]+\] \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\][^\n]*OMITIDO/gm
  let ultima: Date | null = null
  for (const m of texto.matchAll(re)) {
    const d = new Date(m[1].replace(' ', 'T'))
    if (!Number.isNaN(d.getTime())) ultima = d
  }
  return ultima
}

/**
 * Las marcas `pull-estado ok|FALLIDO` que `cron_git_pull_rebase` escribe por
 * `cron_git_log`, con su hora.
 */
export function pullsDelLog(texto: string, agente: string): EventoPull[] {
  const re =
    /^\[[a-z0-9-]+\] \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] pull-estado (ok|FALLIDO)\b/gm
  const out: EventoPull[] = []
  for (const m of texto.matchAll(re)) {
    const at = new Date(m[1].replace(' ', 'T'))
    if (!Number.isNaN(at.getTime())) out.push({ agente, at, ok: m[2] === 'ok' })
  }
  return out
}

/**
 * Rojo cuando los últimos `umbral` pulls de la flota, juntos y por hora,
 * fallaron. De la flota y no por agente: el 22-10 cada agente pullaba una vez
 * al día, y por agente la racha tardaba tres días en llegar a tres.
 */
export function juzgarPulls(eventos: EventoPull[], umbral = PULLS_FALLIDOS_SEGUIDOS): Hallazgo[] {
  const orden = [...eventos].sort((a, b) => a.at.getTime() - b.at.getTime())
  let racha = 0
  for (let i = orden.length - 1; i >= 0 && !orden[i].ok; i--) racha++
  if (racha < umbral) return []
  const fallidos = orden.slice(-racha)
  const agentes = [...new Set(fallidos.map((e) => e.agente))].join(', ')
  const desde = fallidos[0].at.toISOString().slice(0, 16).replace('T', ' ')
  return [
    {
      code: 'cron-pull-atascado',
      message: `los últimos ${racha} pulls de la flota fallaron (desde ${desde}; ${agentes}). Un reintento que choca igual cada vez no se arregla solo: mira «en conflicto:» en esos logs.`,
    },
  ]
}

export interface SinPublicar {
  commits: number
  /** Fecha de AUTOR del commit sin publicar más antiguo. */
  masAntiguo: Date
}

/**
 * Lo que `main` local tiene y `origin/main` no, según las referencias del
 * repositorio en `cwd` (compartidas por todos sus worktrees). Sin red: mide la
 * última vez que alguien hizo fetch, que en esta flota es cada pull. `null` si
 * no hay `main` u `origin/main` que comparar — no es un «al día».
 */
export function leerSinPublicar(
  cwd = process.cwd(),
  rama = process.env.CRON_GIT_MAIN_BRANCH ?? 'main',
): SinPublicar | null {
  let salida: string
  try {
    salida = execFileSync(
      'git',
      ['log', '--format=%at', `refs/remotes/origin/${rama}..refs/heads/${rama}`],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
  } catch {
    return null
  }
  const tiempos = salida
    .split('\n')
    .map((l) => Number(l.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (tiempos.length === 0) return { commits: 0, masAntiguo: new Date(NaN) }
  return { commits: tiempos.length, masAntiguo: new Date(Math.min(...tiempos) * 1000) }
}

export function juzgarSinPublicar(
  s: SinPublicar,
  ahora: Date,
  umbralHoras = HORAS_SIN_PUBLICAR,
): Hallazgo[] {
  if (s.commits === 0) return []
  const horas = (ahora.getTime() - s.masAntiguo.getTime()) / 3_600_000
  if (!(horas > umbralHoras)) return []
  return [
    {
      code: 'cron-sin-publicar',
      message: `main local lleva ${s.commits} commit(s) por delante de origin/main, el más antiguo de hace ${Math.round(horas)} h. La flota corre pero no publica: lo normal es un pull que choca en cada pasada.`,
    },
  ]
}

/** Los agentes que la carpeta declara. Ignora los `.plist.disabled`. */
export function leerFlota(dir = DIR_AGENTES): AgenteProgramado[] {
  let ficheros: string[]
  try {
    ficheros = readdirSync(dir).filter(
      (f) => f.startsWith('com.civicpulse.') && f.endsWith('.plist'),
    )
  } catch {
    return []
  }
  const flota: AgenteProgramado[] = []
  for (const f of ficheros.sort()) {
    let doc: { Label?: string; StandardOutPath?: string; StartCalendarInterval?: unknown } = {}
    try {
      doc = JSON.parse(
        execFileSync('plutil', ['-convert', 'json', '-o', '-', join(dir, f)], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      )
    } catch {
      // Ilegible: entra con horarios vacíos y `juzgar` lo nombra. Saltarlo era
      // dejar de vigilarlo sin que el parte lo dijera.
    }
    flota.push({
      label: doc.Label ?? f.replace(/\.plist$/, ''),
      horarios: horariosDe(doc.StartCalendarInterval),
      log: doc.StandardOutPath ?? '',
    })
  }
  return flota
}

export function medirAgente(a: AgenteProgramado, ahora: Date): EstadoAgente {
  const tocaba = ultimaProgramada(a.horarios, ahora)
  let ultimo: Date | null = null
  let omitidoEn: Date | null = null
  let pulls: EventoPull[] = []
  if (a.log)
    try {
      ultimo = statSync(a.log).mtime
      // Sólo la cola: estos logs pasan de los 300 KB y lo único que se busca está
      // al final.
      const cola = readFileSync(a.log, 'utf8').slice(-20_000)
      omitidoEn = ultimoOmitido(cola)
      pulls = pullsDelLog(cola, a.label.replace(/^com\.civicpulse\./, ''))
    } catch {
      ultimo = null
    }
  return {
    label: a.label,
    programado: describirHorarios(a.horarios),
    log: a.log,
    ultimo,
    tocaba,
    omitidoEn,
    pulls,
  }
}

export function juzgar(estados: EstadoAgente[], toleranciaHoras = TOLERANCIA_HORAS): Hallazgo[] {
  const out: Hallazgo[] = []
  const margen = toleranciaHoras * 3_600_000
  for (const e of estados) {
    const corto = e.label.replace(/^com\.civicpulse\./, '')
    if (!e.tocaba) {
      out.push({
        code: 'cron-sin-horario',
        message: `${corto} no declara un StartCalendarInterval legible — no se puede decir cuándo le tocaba, así que nadie lo está vigilando.`,
      })
      continue
    }
    if (!e.ultimo) {
      out.push({
        code: 'cron-sin-log',
        message: `${corto} (${e.programado}) no tiene log legible en ${e.log} — no se puede decir si corrió.`,
      })
      continue
    }
    if (e.ultimo.getTime() < e.tocaba.getTime() - margen) {
      const horas = Math.round((Date.now() - e.ultimo.getTime()) / 3_600_000)
      out.push({
        code: 'cron-atrasado',
        message: `${corto} (${e.programado}) no ha corrido desde hace ${horas} h — le tocaba el ${e.tocaba.toISOString().slice(0, 16).replace('T', ' ')} y su log no se ha movido.`,
      })
      continue
    }
    // Corrió, pero se negó. Es el caso que ningún manifiesto puede contar,
    // porque un run que se salta no escribe manifiesto.
    if (e.omitidoEn && e.omitidoEn.getTime() >= e.tocaba.getTime() - margen) {
      out.push({
        code: 'cron-omitido',
        message: `${corto} (${e.programado}) arrancó y se NEGÓ a trabajar (OMITIDO): normalmente HEAD no está en main. Los demás agentes se saltarán igual hasta que alguien lo arregle.`,
      })
    }
  }
  return out
}

function main(): void {
  const asJson = process.argv.includes('--json')
  const flota = leerFlota()

  // Anti-hueco, y va primero: sin flota no hay nada que afirmar.
  if (flota.length === 0) {
    if (asJson) {
      process.stdout.write(JSON.stringify({ agentes: 0, hallazgos: [] }, null, 2) + '\n')
    } else {
      process.stdout.write(
        `[check-cron] ✗ ERROR [sin-flota] no hay ningún com.civicpulse.*.plist en ${DIR_AGENTES}.\n` +
          `  Esta guarda mide la flota LOCAL: en CI o en un clon fresco no hay nada que medir, y\n` +
          `  decirlo es lo correcto. Un «toda la flota al día» sobre cero agentes no mide nada.\n`,
      )
    }
    process.exit(1)
  }

  const ahora = new Date()
  const estados = flota.map((a) => medirAgente(a, ahora))
  const sinPublicar = leerSinPublicar()
  const hallazgos = [
    ...juzgar(estados),
    ...juzgarPulls(estados.flatMap((e) => e.pulls)),
    ...(sinPublicar ? juzgarSinPublicar(sinPublicar, ahora) : []),
  ]

  if (asJson) {
    process.stdout.write(JSON.stringify({ agentes: flota.length, hallazgos }, null, 2) + '\n')
    process.exit(hallazgos.length > 0 ? 1 : 0)
  }

  process.stdout.write(`[check-cron] ${flota.length} agente(s) declarado(s) en la flota local\n`)
  for (const h of hallazgos) {
    process.stdout.write(`  ✗ [${h.code}] ${h.message}\n`)
  }
  if (hallazgos.length === 0) {
    for (const e of estados) {
      const corto = e.label.replace(/^com\.civicpulse\./, '')
      process.stdout.write(
        `  ✓ ${corto} (${e.programado}) · última señal ${e.ultimo?.toISOString().slice(0, 16).replace('T', ' ')}\n`,
      )
    }
    process.stdout.write('[check-cron] todos han corrido desde su última hora programada\n')
  }
  if (!sinPublicar) {
    process.stdout.write(
      `  · main frente a origin/main: NO COMPROBADO, que no es un visto bueno — no hay main u origin/main que comparar en ${process.cwd()}\n`,
    )
  } else if (sinPublicar.commits === 0) {
    process.stdout.write('  ✓ main local no tiene nada sin publicar\n')
  } else if (!hallazgos.some((h) => h.code === 'cron-sin-publicar')) {
    process.stdout.write(
      `  · main local lleva ${sinPublicar.commits} commit(s) sin publicar, dentro de las ${HORAS_SIN_PUBLICAR} h de margen\n`,
    )
  }
  process.exit(hallazgos.length > 0 ? 1 : 0)
}

if (process.argv[1] && process.argv[1].endsWith('check-cron.ts')) main()
