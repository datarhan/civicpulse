/**
 * ops:alarm — las reglas de salud que NO pueden vivir en el portátil que vigilan.
 *
 * `monitor:health` decide bien (`health-monitor.ts`), pero corre en el Mac del
 * operador, por cron. Cuando el Mac está apagado, dormido o sin sesión, el
 * vigilante cae con lo vigilado y nada se pone rojo en ninguna parte:
 * OPERATIONS.md recoge dos apagones silenciosos de esa forma, de 49 y de 9 días.
 *
 * Este módulo reúne las observaciones que un runner de GitHub puede hacer por
 * su cuenta —nada aquí necesita el portátil, su llavero ni su IP residencial— y
 * se las pasa al MISMO `evaluateHealth`, para que los dos vigilantes no puedan
 * discrepar sobre qué merece un aviso. Lo que añade es lo que sólo se ve desde
 * fuera: que el portátil lleva días sin publicar su pasada, que la programación
 * de GitHub dejó de lanzar la nocturna, y que el bot responde pero degradado.
 *
 * Y una regla que el vigilante del portátil no tiene: lo que no se puede
 * comprobar es un AVISO, no un cero. `monitor-health.ts` devuelve una racha de
 * 0 cuando `gh` falla; aquí eso sería un verde por no haber mirado.
 *
 * Puro: observaciones dentro, avisos fuera. La red, `gh` y git los pone
 * `scripts/ops-alarm.ts`.
 */
import { contarNochesEnRojo, evaluateHealth, type Alert, type Observations } from './health-monitor'
import type { FreshnessRow } from './snapshot-cadence'

/**
 * El asunto del commit de la pasada diaria del portátil
 * (`scripts/scrape-ci-blocked.sh`). Es el latido: los adaptadores que CI no
 * alcanza sellan su volcado en cada pasada, así que hay commit todos los días.
 * Si algún día los volcados sólo se reescriben cuando cambia el contenido, el
 * latido tiene que pasar a otra señal. `tests/ops-alarm.test.ts` comprueba que
 * el script sigue comiteando con este asunto.
 */
export const LATIDO_DEL_PORTATIL = 'chore(data): refresh CI-unreachable adapters'

/** El portátil comitea a diario; dos días sin latido es un portátil que no corre. */
export const LATIDO_MAX_DIAS = 2

/**
 * La nocturna está programada a diario y GitHub la arranca horas tarde (medido:
 * de 4 h 15 min a 5 h 38 min tarde en septiembre de 2026). Treinta y seis horas
 * sin ninguna ejecución es una programación que dejó de dispararse.
 */
export const NOCTURNA_MAX_HORAS = 36

export interface EntradaAlarma {
  now: Date
  /** Salida de `check:cadence --json`, o null si no se pudo ejecutar. */
  cadencia: FreshnessRow[] | null
  /** Fecha del último commit-latido del portátil en main; null si no aparece. */
  ultimoLatido: Date | null
  /** Ejecuciones de la nocturna, de la más reciente a la más antigua; null si `gh` no contestó. */
  nocturnas: { conclusion: string | null; createdAt: string }[] | null
  /** La portada responde 200 y un volcado publicado se deja leer como JSON. */
  web: { portada: boolean; datos: boolean }
  /** `/health` del bot; null si no hay URL configurada a la que preguntar. */
  bot: null | { alcanzable: false } | { alcanzable: true; estado: string; degradado: string[] }
}

export function evaluarAlarma(e: EntradaAlarma): Alert[] {
  const integrity: Observations['integrity'] = []
  const pipelines: Observations['pipelines'] = []

  if (e.cadencia === null) {
    integrity.push({
      check: 'check:cadence',
      message: 'No se pudo ejecutar: la frescura de los volcados publicados queda sin mirar.',
    })
  } else {
    const rancios = e.cadencia.filter((r) => r.status === 'stale')
    if (rancios.length > 0) {
      integrity.push({
        check: 'check:cadence',
        message:
          `${rancios.length} volcado(s) fuera de su plazo: ` +
          rancios.map((r) => `${r.file} (${r.cls}, ${r.ageDays ?? '?'} d)`).join(', ') +
          '.',
      })
    }
  }

  pipelines.push({
    name: 'La pasada diaria del portátil',
    lastProgressAt: e.ultimoLatido,
    pending: 1,
    stallDays: LATIDO_MAX_DIAS,
    cause:
      'El portátil no ha publicado su pasada diaria (`scrape-ci-blocked.sh`): ¿apagado, dormido o ' +
      'sin sesión? De él dependen los adaptadores que CI no alcanza y todas las pasadas con LLM.',
  })

  let racha = 0
  if (e.nocturnas === null) {
    integrity.push({
      check: 'ops:alarm',
      message:
        'No se pudo preguntar a GitHub por la nocturna (`gh run list`): su racha queda sin medir.',
    })
  } else {
    racha = contarNochesEnRojo(e.nocturnas.map((r) => r.conclusion))
    const masReciente = e.nocturnas[0]?.createdAt ? new Date(e.nocturnas[0].createdAt) : null
    pipelines.push({
      name: 'La nocturna de GitHub',
      lastProgressAt: masReciente,
      pending: 1,
      stallDays: NOCTURNA_MAX_HORAS / 24,
      cause:
        'GitHub no ha lanzado la nocturna en el plazo: revisa que el workflow siga activo ' +
        '(GitHub desactiva las programaciones de repositorios sin actividad).',
    })
  }

  const obs: Observations = {
    now: e.now,
    pipelines,
    botHealthy: e.bot === null ? null : e.bot.alcanzable,
    siteHealthy: e.web.portada && e.web.datos,
    sources: [],
    nightlyFailStreak: racha,
    integrity,
  }
  const avisos = evaluateHealth(obs)

  if (e.bot === null) {
    avisos.push({
      code: 'bot-unconfigured',
      severity: 'critical',
      title: 'No hay a qué bot preguntar',
      detail:
        'Falta `vars.BOT_EXPORT_URL` en el repositorio, así que nadie comprueba desde fuera del ' +
        'portátil que el bot está vivo.',
      remedy: 'Define la variable en Settings → Secrets and variables → Actions → Variables.',
    })
  } else if (e.bot.alcanzable && e.bot.estado !== 'ok') {
    avisos.push({
      code: 'bot-degraded',
      severity: 'warning',
      title: 'El bot responde, pero degradado',
      detail:
        e.bot.degradado.length > 0
          ? e.bot.degradado.join(' · ')
          : `\`/health\` dice «${e.bot.estado}» sin decir qué falta.`,
      remedy: 'Revisa los secretos del bot en Fly (`fly secrets list`) y su `/health`.',
    })
  }

  return avisos
}
