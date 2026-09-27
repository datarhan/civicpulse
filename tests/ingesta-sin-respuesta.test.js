import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { ficheros, leer, sinComentarios, empujaAMain } from './setup/workflows.js'

/**
 * Un campo opcional vacío no es un valor.
 *
 * EL FALLO, medido el 2026-09-27: un formulario de issue de GitHub escribe
 * «_No response_» bajo cada campo opcional que se deja en blanco, y las
 * ingestas lo leían como si fuera lo que escribió quien replica. Con la URL de
 * la fuente vacía —es opcional—, `indicador-reply`, `journalist-reply` y
 * `queja-reply` recibían «_No response_» por URL y rechazaban la réplica entera,
 * con un comentario que culpaba a la longitud de la cita; y un voto de pleno sin
 * plazo llevaba `dueBy: "_No response_"` al validador. El derecho de réplica
 * fallaba justo en el caso más corriente.
 *
 * Se prueba el `field()` DE CADA WORKFLOW, sacado del YAML y ejecutado con bash
 * sobre un cuerpo de issue como el que escribe GitHub: una copia de la función
 * aquí sería otra lista a mano que se quedaría atrás.
 */

const escuchaIssues = (texto) => /^ {2}issues:\s*$/m.test(texto)
const ingestas = ficheros()
  .map((f) => ({ fichero: f, texto: leer(f) }))
  .filter((w) => escuchaIssues(w.texto) && empujaAMain(sinComentarios(w.texto)))

/** La función `field()` tal como la define el workflow, o null. */
const funcionField = (texto) => (texto.match(/^( *)field\(\) \{\n[\s\S]*?\n\1\}/m) ?? [])[0] ?? null

const CUERPO = [
  '### Cita literal de la réplica (verbatim, ≥20 caracteres)',
  '',
  'Reafirmamos lo dicho en sede municipal, con todas sus letras.',
  '',
  '### URL de la fuente (opcional)',
  '',
  '_No response_',
  '',
  '### Otro campo',
  '',
  'valor',
].join('\n')

const ejecutaField = (definicion, campo) =>
  execFileSync('bash', ['-c', `set -euo pipefail\nBODY="$CUERPO"\n${definicion}\nfield "$CAMPO"`], {
    encoding: 'utf8',
    env: { ...process.env, CUERPO, CAMPO: campo },
  })

describe('ingestas · un opcional en blanco llega vacío, no como «_No response_»', () => {
  it('encuentra las ingestas', () => {
    expect(ingestas.length).toBeGreaterThanOrEqual(5)
  })

  const conField = ingestas.filter((w) => funcionField(w.texto))

  it('y la mayoría leen el cuerpo con un `field()` que se puede ejecutar', () => {
    // Que el extractor haya encontrado algo que probar: si todos cambiaran de
    // forma, lo de abajo pasaría sin ejecutar nada.
    expect(conField.length).toBeGreaterThanOrEqual(4)
  })

  it.each(conField.map((w) => [w.fichero, w.texto]))(
    '%s: un opcional en blanco sale vacío y uno escrito sale entero',
    (_fichero, texto) => {
      const definicion = funcionField(texto)
      expect(ejecutaField(definicion, 'URL de la fuente (opcional)').trim()).toBe('')
      expect(ejecutaField(definicion, 'Otro campo').trim()).toBe('valor')
      expect(
        ejecutaField(definicion, 'Cita literal de la réplica (verbatim, ≥20 caracteres)'),
      ).toMatch(/Reafirmamos lo dicho/)
    },
  )

  it.each(ingestas.filter((w) => !funcionField(w.texto)).map((w) => [w.fichero, w.texto]))(
    '%s, que no usa `field()`, también descarta «_No response_»',
    (_fichero, texto) => {
      expect(sinComentarios(texto)).toMatch(/_No response_/)
    },
  )
})
