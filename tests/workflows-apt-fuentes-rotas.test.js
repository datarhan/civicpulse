import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Ningún `playwright install` de CI se ejecuta sin sanear antes las fuentes apt.
 *
 * EL FALLO, medido el 2026-09-09: cuatro ejecuciones seguidas en rojo sin que
 * ninguna prueba llegara a correr. El paso moría así:
 *
 *   Run npx playwright install-deps chromium
 *   E: Failed to fetch https://dl.google.com/linux/chrome-stable/deb/…/Packages.gz
 *      Hash Sum mismatch
 *   Failed to install browser dependencies · exit code 100
 *
 * `playwright install-deps` hace `apt-get update`, y **apt sale en error en
 * bloque** si UNA sola fuente configurada sirve un índice con el hash cambiado.
 * La imagen del runner trae configurada la fuente de **Google Chrome**, que no
 * tiene nada que ver con las bibliotecas que chromium necesita —ésas salen de
 * los repositorios de Ubuntu—, y ese día su índice estaba mal. Un proveedor
 * ajeno al que no le pedimos nada dejaba el sitio sin poder desplegar.
 *
 * POR QUÉ ESTA PRUEBA Y NO SÓLO EL ARREGLO: hay TRES workflows que instalan
 * Chromium (`e2e`, `nightly-scrape`, `cesel-entrega`) y CUATRO puntos de
 * instalación entre ellos. Arreglar el que se vio en rojo y dejar los otros
 * tres habría dejado la nocturna —la que comitea datos— pisando la misma mina a
 * las 04:00. Es la lección de «una bandera de lanzamiento va en los dos
 * workflows o en ninguno», aplicada a otra cosa.
 *
 * La lista de workflows se DERIVA leyendo el directorio, nunca se escribe a
 * mano: una lista escrita a mano dentro de un control contra el olvido se
 * olvida ella sola, que es el chiste que este repositorio ya ha contado dos
 * veces.
 */

const DIR = resolve('.github/workflows')
const SANEADOR = 'scripts/ci-apt-fuentes-rotas.sh'
const INSTALA = /npx\s+playwright\s+install/

/** Todo workflow del repositorio, leído del disco. */
function workflows() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ nombre: f, texto: readFileSync(join(DIR, f), 'utf8') }))
}

/** Cada línea que instala Chromium, con su fichero y su número de línea. */
function puntosDeInstalacion() {
  const out = []
  for (const { nombre, texto } of workflows()) {
    texto.split('\n').forEach((linea, i) => {
      if (INSTALA.test(linea)) out.push({ nombre, i, linea: linea.trim(), texto })
    })
  }
  return out
}

describe('fuentes apt rotas · ningún playwright install queda desprotegido', () => {
  const puntos = puntosDeInstalacion()

  // Regla 2 de DATA_INTEGRITY: una pasada tiene que demostrar que hizo algo.
  // Cero puntos de instalación significaría que el patrón dejó de casar y esta
  // prueba estaría dando el visto bueno sin haber mirado nada.
  it('encuentra los puntos de instalación que dice vigilar', () => {
    expect(puntos.length).toBeGreaterThanOrEqual(4)
    const ficheros = [...new Set(puntos.map((p) => p.nombre))]
    expect(ficheros).toContain('e2e.yml')
    expect(ficheros).toContain('nightly-scrape.yml')
    expect(ficheros).toContain('cesel-entrega.yml')
  })

  it('el saneador existe y es ejecutable como script', () => {
    expect(existsSync(resolve(SANEADOR))).toBe(true)
    const s = readFileSync(resolve(SANEADOR), 'utf8')
    expect(s.startsWith('#!')).toBe(true)
    // Tiene que quitar la fuente de Google Chrome, que es la que rompe apt.
    expect(s).toMatch(/dl\\?\.google\\?\.com/)
  })

  // LO QUE DE VERDAD SE COMPRUEBA. El saneador va en el MISMO bloque `run:`
  // que la instalación y por delante de ella, no en un paso hermano: un paso
  // aparte puede quedarse sin la condición `if:` de la instalación que
  // protege —`cesel-entrega` instala sólo si las entregas divergen— y entonces
  // se separan sin que nadie lo note.
  it.each(puntosDeInstalacion())(
    'en $nombre, la instalación de la línea $i va precedida del saneador',
    ({ i, texto }) => {
      const lineas = texto.split('\n')
      const ventana = lineas.slice(Math.max(0, i - 6), i).join('\n')
      expect(ventana).toContain(SANEADOR)
    },
  )
})
