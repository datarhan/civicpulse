import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { horariosDePlistXml } from '../src/scraper/launchd-horario'

/**
 * El despiece lee los plists del repositorio como texto, sin `plutil`. La
 * versión anterior cogía la PRIMERA `<key>Hour</key>` del fichero, así que un
 * agente de lunes y jueves se pintaba como diario.
 */
const envuelve = (intervalo: string) =>
  `<plist version="1.0"><dict><key>Label</key><string>x</string>` +
  `<key>StartCalendarInterval</key>${intervalo}` +
  `<key>RunAtLoad</key><false/></dict></plist>`

describe('horariosDePlistXml', () => {
  it('un dict suelto sin Weekday es diario', () => {
    expect(
      horariosDePlistXml(
        envuelve(
          '<dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>45</integer></dict>',
        ),
      ),
    ).toEqual([{ dia: null, hora: 6, minuto: 45 }])
  })

  it('un array con Weekday da una entrada por día', () => {
    expect(
      horariosDePlistXml(
        envuelve(
          '<array>' +
            '<dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>30</integer></dict>' +
            '<dict><key>Weekday</key><integer>4</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>30</integer></dict>' +
            '</array>',
        ),
      ),
    ).toEqual([
      { dia: 1, hora: 9, minuto: 30 },
      { dia: 4, hora: 9, minuto: 30 },
    ])
  })

  it('sin StartCalendarInterval no inventa un horario', () => {
    expect(
      horariosDePlistXml('<plist><dict><key>Label</key><string>x</string></dict></plist>'),
    ).toEqual([])
  })

  // Anti-hueco: los plists versionados son los que se instalan. Si uno deja de
  // leerse, el despiece y `check:cron` pierden al agente sin decirlo.
  it('todos los plists activos del repositorio declaran un horario legible, o la ruta que los dispara', () => {
    const dir = resolve(__dirname, '../scripts')
    const plists = readdirSync(dir).filter((f) => /^com\.civicpulse\..*\.plist$/.test(f))
    expect(plists.length).toBeGreaterThan(0)
    let porMarca = 0
    for (const f of plists) {
      const xml = readFileSync(resolve(dir, f), 'utf8')
      // com.civicpulse.parte-tras-plenos (22-11-2026) no corre a una hora: lo
      // dispara la marca que deja la tubería de plenos (WatchPaths), y check:cron
      // lo juzga por esa marca. Uno sin ninguna de las dos cosas no lo vigila nadie.
      if (/<key>WatchPaths<\/key>\s*<array>\s*<string>[^<]+<\/string>/.test(xml)) {
        porMarca++
        continue
      }
      expect(horariosDePlistXml(xml), f).not.toEqual([])
    }
    // Que la excepción no se trague a todos.
    expect(porMarca).toBeLessThan(plists.length)
  })
})
