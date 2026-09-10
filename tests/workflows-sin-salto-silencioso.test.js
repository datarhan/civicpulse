import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Un workflow no puede quedarse VERDE por no haberse ejecutado.
 *
 * EL FALLO, medido el 2026-09-10: `batch-reminder.yml` —el puente legal del
 * bot, el que recuerda al moderador las quejas verificadas que esperan
 * registro— llevaba desde **abril** sin avisar de nada, y en verde. Tenía dos
 * capas independientes de no hacer nada en silencio:
 *
 *   1. El trabajo entero colgaba de
 *      `if: vars.BOT_EXPORT_URL != '' && vars.BATCH_REMINDER_CHAT_ID != ''`.
 *      La segunda variable no se definió nunca, así que GitHub **saltaba** el
 *      trabajo y daba el workflow por **correcto**.
 *   2. Y el paso del aviso hacía `exit 0` si faltaba el token.
 *
 * Con las dos, un lunes sin mensaje significaba a la vez «no hay nada que
 * registrar» y «esto lleva meses roto». El moderador no podía distinguirlo, y
 * nadie lo hizo durante cinco meses.
 *
 * `pull-quejas.yml` tenía la misma forma —heredada de un despliegue por fases
 * que ya terminó—, y ése comitea DATOS PUBLICADOS: si alguien borra la
 * variable, las quejas dejan de actualizarse y la web sigue enseñando las
 * viejas como si fueran de hoy.
 *
 * LA REGLA: la configuración que falta se comprueba **dentro de un paso**, que
 * falla diciendo qué falta. No en un `if:` de trabajo, que no deja rastro
 * legible y se lee como éxito. Saltar es para lo que de verdad no toca hacer
 * —`cesel-entrega` sólo instala el navegador si las entregas divergen—, no para
 * lo que no se puede hacer.
 *
 * La lista de workflows se DERIVA del disco: una lista escrita a mano dentro de
 * un control contra el olvido se olvida ella sola.
 */

const DIR = resolve('.github/workflows')

/** `if:` con EXACTAMENTE cuatro espacios = nivel de trabajo. Los de paso van a ocho. */
const IF_DE_TRABAJO = /^ {4}if:(.*)$/
const CONFIG = /(vars|secrets)\./

function workflows() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ nombre: f, texto: readFileSync(join(DIR, f), 'utf8') }))
}

describe('workflows · nada se salta en silencio', () => {
  const todos = workflows()

  // Regla 2 de DATA_INTEGRITY: una pasada tiene que demostrar que hizo algo.
  // Si el patrón dejara de casar —otra indentación, otro formateador— esta
  // prueba daría el visto bueno sin haber mirado nada.
  it('encuentra los workflows y sabe distinguir un `if:` de trabajo de uno de paso', () => {
    expect(todos.length).toBeGreaterThanOrEqual(10)
    const conIfDePaso = todos.filter((w) => w.texto.split('\n').some((l) => /^ {6,}if:/.test(l)))
    // Si esto llega a cero, el discriminador por indentación dejó de valer y
    // la prueba de abajo estaría aprobando por no ver nada.
    expect(conIfDePaso.length).toBeGreaterThan(0)
  })

  it('ningún trabajo se salta por configuración ausente', () => {
    const ofensores = []
    for (const { nombre, texto } of todos) {
      texto.split('\n').forEach((linea, i) => {
        const m = linea.match(IF_DE_TRABAJO)
        if (m && CONFIG.test(m[1])) ofensores.push(`${nombre}:${i + 1} →${m[1]}`)
      })
    }
    expect(
      ofensores,
      'Estos trabajos se SALTAN cuando falta una variable o un secreto, y el ' +
        'workflow sale VERDE:\n  ' +
        ofensores.join('\n  ') +
        '\n\nComprueba la configuración DENTRO de un paso y falla ahí diciendo qué falta.\n' +
        'Un workflow que finge estar bien es peor que uno que no existe.',
    ).toEqual([])
  })

  it('ningún paso hace `exit 0` porque falte un valor', () => {
    const ofensores = []
    for (const { nombre, texto } of todos) {
      // Un bloque `run:` que comprueba que una variable está vacía y sale con
      // éxito. Es la segunda capa que tenía batch-reminder.
      const bloques = texto.split(/^\s*- /m)
      for (const b of bloques) {
        if (/-z\s+"\$[A-Z_]+"/.test(b) && /\bexit 0\b/.test(b)) {
          const nom = b.match(/name:\s*(.+)/)?.[1]?.trim() ?? '(sin nombre)'
          ofensores.push(`${nombre} · paso «${nom}»`)
        }
      }
    }
    expect(
      ofensores,
      'Estos pasos salen con ÉXITO cuando les falta un valor:\n  ' +
        ofensores.join('\n  ') +
        '\n\nFalta de configuración es un fallo, no un «nada que hacer».',
    ).toEqual([])
  })
})
