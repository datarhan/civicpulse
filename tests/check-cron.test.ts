import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  TOLERANCIA_HORAS,
  juzgar,
  leerFlota,
  medirAgente,
  ultimaProgramada,
  ultimoOmitido,
} from '../scripts/check-cron'
import { pickCheckDiagnosis } from '../src/scraper/health-monitor'

/**
 * La guarda que le faltaba al parte: ¿ha corrido hoy la flota local?
 *
 * El 2026-08-29 un rebase a medias dejó HEAD desacoplado y los cuatro agentes
 * posteriores se saltaron en silencio, porque `cron_require_main` exige estar en
 * main. Dieciséis guardas de integridad y ninguna podía verlo.
 *
 * Se ejerce en los tres estados, no sólo en el bueno: se saltó, se atrasó, y no
 * hay flota que medir. El tercero es el anti-hueco — en CI no hay plists, y un
 * «todo al día» sobre cero agentes es el gate que no mide nada.
 */

// `plutil` es de macOS. Donde no está, `leerFlota` no puede leer un plist y lo
// dice saltando, no fingiendo.
const HAY_PLUTIL = (() => {
  try {
    execFileSync('plutil', ['-help'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()
if (!HAY_PLUTIL) {
  console.warn('[check-cron.test] sin `plutil` (no es macOS) — los casos con plist se saltan')
}

const PLIST = (label: string, log: string, hora: number, minuto: number) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hora}</integer><key>Minute</key><integer>${minuto}</integer></dict>
</dict>
</plist>
`

function escenario(opciones: { hora: number; minuto: number; contenido?: string; mtime?: Date }) {
  const dir = mkdtempSync(join(tmpdir(), 'check-cron-'))
  const log = join(dir, 'agente.log')
  writeFileSync(log, opciones.contenido ?? '[agente] arrancó y trabajó\n')
  if (opciones.mtime) utimesSync(log, opciones.mtime, opciones.mtime)
  writeFileSync(
    join(dir, 'com.civicpulse.agente.plist'),
    PLIST('com.civicpulse.agente', log, opciones.hora, opciones.minuto),
  )
  return { dir, log, limpiar: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('ultimaProgramada', () => {
  it('es hoy si la hora ya pasó', () => {
    const ahora = new Date('2026-08-29T11:00:00')
    expect(ultimaProgramada(9, 30, ahora).toISOString()).toBe(
      new Date('2026-08-29T09:30:00').toISOString(),
    )
  })

  it('es ayer si la hora aún no ha llegado', () => {
    const ahora = new Date('2026-08-29T08:00:00')
    expect(ultimaProgramada(9, 30, ahora).toISOString()).toBe(
      new Date('2026-08-28T09:30:00').toISOString(),
    )
  })
})

describe('ultimoOmitido', () => {
  it('coge el más reciente, no el primero', () => {
    const log = [
      '[review-sweep] [2026-08-26 07:30:00] review-sweep: OMITIDO — HEAD está en otra rama.',
      '[review-sweep] [2026-08-27 07:30:01] trabajando',
      '[review-sweep] [2026-08-29 07:30:02] review-sweep: OMITIDO — HEAD desacoplado.',
    ].join('\n')
    expect(ultimoOmitido(log)?.toISOString()).toBe(new Date('2026-08-29T07:30:02').toISOString())
  })

  it('no confunde la palabra suelta con una línea de la guarda', () => {
    // Sin la marca de tiempo con prefijo no es la guarda hablando: puede ser
    // prosa de cualquier paso. Se exige la forma que escribe `cron_git_log`.
    expect(ultimoOmitido('el paso anterior quedó OMITIDO por falta de cuota\n')).toBeNull()
  })

  it('devuelve null cuando no hay ninguno', () => {
    expect(ultimoOmitido('[a] [2026-08-29 07:30:00] todo bien\n')).toBeNull()
  })
})

describe.skipIf(!HAY_PLUTIL)('la flota sale de los plists, no de una tabla', () => {
  it('lee etiqueta, hora y log de cada agente', () => {
    const e = escenario({ hora: 9, minuto: 30 })
    try {
      const flota = leerFlota(e.dir)
      expect(flota).toHaveLength(1)
      expect(flota[0].label).toBe('com.civicpulse.agente')
      expect(flota[0].hora).toBe(9)
      expect(flota[0].minuto).toBe(30)
      expect(flota[0].log).toBe(e.log)
    } finally {
      e.limpiar()
    }
  })

  it('ignora los .plist.disabled', () => {
    const e = escenario({ hora: 9, minuto: 30 })
    try {
      writeFileSync(
        join(e.dir, 'com.civicpulse.apagado.plist.disabled'),
        PLIST('com.civicpulse.apagado', e.log, 9, 30),
      )
      expect(leerFlota(e.dir).map((a) => a.label)).toEqual(['com.civicpulse.agente'])
    } finally {
      e.limpiar()
    }
  })

  // ANTI-HUECO. Sin esto, todo lo de arriba pasaría igual de verde sobre una
  // carpeta vacía, que es el estado de CI.
  it('una carpeta sin agentes devuelve cero, y eso NO es «todo al día»', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-cron-vacio-'))
    try {
      expect(leerFlota(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe.skipIf(!HAY_PLUTIL)('los tres desenlaces', () => {
  const ahora = new Date('2026-08-29T11:00:00')

  it('corrió y trabajó: no dice nada', () => {
    const e = escenario({ hora: 9, minuto: 30, mtime: new Date('2026-08-29T09:30:05') })
    try {
      expect(juzgar([medirAgente(leerFlota(e.dir)[0], ahora)])).toEqual([])
    } finally {
      e.limpiar()
    }
  })

  it('corrió y SE NEGÓ: lo distingue de haber trabajado', () => {
    // La distinción que un manifiesto no puede hacer: un run que se salta no
    // escribe manifiesto, así que para `check:runs` es idéntico a no existir.
    const e = escenario({
      hora: 7,
      minuto: 30,
      mtime: new Date('2026-08-29T07:30:02'),
      contenido:
        '[agente] [2026-08-29 07:30:02] agente: OMITIDO — HEAD está en (HEAD desacoplado), no en main.\n',
    })
    try {
      const h = juzgar([medirAgente(leerFlota(e.dir)[0], ahora)])
      expect(h.map((x) => x.code)).toEqual(['cron-omitido'])
      expect(h[0].message).toContain('agente')
    } finally {
      e.limpiar()
    }
  })

  it('no corrió: el log no se ha movido desde ayer', () => {
    const e = escenario({ hora: 9, minuto: 30, mtime: new Date('2026-08-28T09:30:05') })
    try {
      const h = juzgar([medirAgente(leerFlota(e.dir)[0], ahora)])
      expect(h.map((x) => x.code)).toEqual(['cron-atrasado'])
    } finally {
      e.limpiar()
    }
  })

  it('la tolerancia absorbe un portátil dormido, no una mañana perdida', () => {
    // Se ejerce el umbral IMPORTADO, no un número copiado: si alguien sube la
    // constante, esta prueba lo sigue.
    const dentro = new Date(
      new Date('2026-08-29T09:30:00').getTime() - (TOLERANCIA_HORAS - 1) * 3_600_000,
    )
    const fuera = new Date(
      new Date('2026-08-29T09:30:00').getTime() - (TOLERANCIA_HORAS + 1) * 3_600_000,
    )

    const a = escenario({ hora: 9, minuto: 30, mtime: dentro })
    try {
      expect(juzgar([medirAgente(leerFlota(a.dir)[0], ahora)])).toEqual([])
    } finally {
      a.limpiar()
    }

    const b = escenario({ hora: 9, minuto: 30, mtime: fuera })
    try {
      expect(juzgar([medirAgente(leerFlota(b.dir)[0], ahora)]).map((x) => x.code)).toEqual([
        'cron-atrasado',
      ])
    } finally {
      b.limpiar()
    }
  })
})

describe('lo que imprime llega al parte de salud', () => {
  // No se recita la expresión regular del monitor: se le pasa la salida REAL a
  // la función real. Una guarda cuyo texto no case es una guarda invisible en el
  // digest, y eso no se ve mirando la guarda sola.
  it('la salida sin flota la recoge pickCheckDiagnosis', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-cron-vacio-'))
    let salida = ''
    try {
      execFileSync('npx', ['tsx', resolve('scripts/check-cron.ts')], {
        env: { ...process.env, CRON_AGENTS_DIR: dir },
        encoding: 'utf8',
      })
    } catch (err) {
      salida = String((err as { stdout?: string }).stdout ?? '')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    expect(salida, 'sin flota tiene que salir distinto de cero y decirlo').toContain('sin-flota')
    expect(pickCheckDiagnosis(salida), 'el parte no vería esta guarda').not.toBe('')
    expect(pickCheckDiagnosis(salida)).toContain('sin-flota')
  }, 60_000)
})
