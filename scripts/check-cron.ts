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
  hora: number
  minuto: number
  log: string
}

export interface EstadoAgente {
  label: string
  programado: string
  log: string
  /** Momento del último disparo, por la hora del fichero. */
  ultimo: Date | null
  /** La hora a la que le tocaba por última vez. */
  tocaba: Date
  omitidoEn: Date | null
}

export interface Hallazgo {
  code: string
  message: string
}

/** La última vez que a este agente le tocaba correr, antes de `ahora`. */
export function ultimaProgramada(hora: number, minuto: number, ahora: Date): Date {
  const hoy = new Date(ahora)
  hoy.setHours(hora, minuto, 0, 0)
  if (hoy.getTime() <= ahora.getTime()) return hoy
  const ayer = new Date(hoy)
  ayer.setDate(ayer.getDate() - 1)
  return ayer
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
    let doc: {
      Label?: string
      StandardOutPath?: string
      StartCalendarInterval?: { Hour?: number; Minute?: number }
    }
    try {
      doc = JSON.parse(
        execFileSync('plutil', ['-convert', 'json', '-o', '-', join(dir, f)], {
          encoding: 'utf8',
        }),
      )
    } catch {
      continue
    }
    const cuando = doc.StartCalendarInterval
    if (!doc.Label || !doc.StandardOutPath || !cuando || typeof cuando.Hour !== 'number') continue
    flota.push({
      label: doc.Label,
      hora: cuando.Hour,
      minuto: cuando.Minute ?? 0,
      log: doc.StandardOutPath,
    })
  }
  return flota
}

export function medirAgente(a: AgenteProgramado, ahora: Date): EstadoAgente {
  const tocaba = ultimaProgramada(a.hora, a.minuto, ahora)
  let ultimo: Date | null = null
  let omitidoEn: Date | null = null
  try {
    ultimo = statSync(a.log).mtime
    // Sólo la cola: estos logs pasan de los 300 KB y lo único que se busca está
    // al final.
    const texto = readFileSync(a.log, 'utf8')
    omitidoEn = ultimoOmitido(texto.slice(-20_000))
  } catch {
    ultimo = null
  }
  return {
    label: a.label,
    programado: `${String(a.hora).padStart(2, '0')}:${String(a.minuto).padStart(2, '0')}`,
    log: a.log,
    ultimo,
    tocaba,
    omitidoEn,
  }
}

export function juzgar(estados: EstadoAgente[], toleranciaHoras = TOLERANCIA_HORAS): Hallazgo[] {
  const out: Hallazgo[] = []
  const margen = toleranciaHoras * 3_600_000
  for (const e of estados) {
    const corto = e.label.replace(/^com\.civicpulse\./, '')
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
        message: `${corto} (${e.programado}) no ha corrido desde hace ${horas} h — le tocaba a las ${e.programado} y su log no se ha movido.`,
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
  const hallazgos = juzgar(estados)

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
  process.exit(hallazgos.length > 0 ? 1 : 0)
}

if (process.argv[1] && process.argv[1].endsWith('check-cron.ts')) main()
