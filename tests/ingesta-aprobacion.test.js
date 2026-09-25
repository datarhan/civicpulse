import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ficheros, leer, sinComentarios, empujaAMain } from './setup/workflows.js'

/**
 * Una réplica —o un voto de pleno— no se publica sin que un mantenedor lo
 * apruebe.
 *
 * EL FALLO, medido el 2026-09-25: las plantillas de issue ponen ELLAS MISMAS la
 * etiqueta que dispara la ingesta (`labels: [derecho-replica, hallazgo]`), y la
 * ingesta comiteaba en `main` y desplegaba sin mirar quién había abierto el
 * issue. Cualquiera con cuenta de GitHub podía elegir «PSOE» en el desplegable
 * y publicar en el sitio un texto como «Réplica del grupo PSOE». Las plantillas
 * prometían lo contrario —«Plazo de revisión: 24 h hábiles», «se publica tras
 * revisión humana»— y ningún paso lo cumplía. Y como la ingesta también
 * escuchaba `edited`, cada edición volvía a publicar.
 *
 * LA REGLA: publica la etiqueta `publicar`, que NINGUNA plantilla pone y que
 * sólo puede aplicar quien tiene permiso de escritura; y el workflow lo
 * comprueba antes de empujar, porque «sólo un mantenedor puede etiquetar» es
 * una propiedad de la configuración de GitHub que nadie de aquí controla.
 *
 * La lista de ingestas se DERIVA del disco —workflow que escucha issues y
 * empuja a main—, no se escribe a mano.
 */

const APROBACION = 'publicar'
const PLANTILLAS = resolve('.github/ISSUE_TEMPLATE')

/** ¿Lo dispara un issue? Un bloque `issues:` bajo `on:`. */
const escuchaIssues = (texto) => /^ {2}issues:\s*$/m.test(texto)

const ingestas = () =>
  ficheros()
    .map((f) => ({ fichero: f, texto: sinComentarios(leer(f)) }))
    .filter((w) => escuchaIssues(w.texto) && empujaAMain(w.texto))

/** Los `types:` del disparador `issues:`. */
const tiposDeIssue = (texto) => {
  const m = texto.match(/^ {2}issues:\s*\n {4}types:\s*\[([^\]]*)\]/m)
  return m ? m[1].split(',').map((s) => s.trim()) : null
}

/** El `if:` de trabajo (cuatro espacios), hasta `steps:`. */
const ifDeTrabajo = (texto) => (texto.match(/^ {4}if:([\s\S]*?)^ {4}steps:/m) ?? [])[1] ?? ''

/** Las etiquetas que pone cada plantilla de issue. */
const etiquetasDePlantillas = () =>
  readdirSync(PLANTILLAS)
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((f) => {
      const m = readFileSync(join(PLANTILLAS, f), 'utf8').match(/^labels:\s*\[([^\]]*)\]/m)
      return m ? m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')) : []
    })

describe('ingestas · nada se publica sin aprobación de un mantenedor', () => {
  const todas = ingestas()

  // Regla 2 de DATA_INTEGRITY: si el detector dejara de encontrar ingestas,
  // todo lo de abajo aprobaría sin haber mirado nada.
  it('encuentra las ingestas y las plantillas', () => {
    expect(todas.length).toBeGreaterThanOrEqual(5)
    expect(etiquetasDePlantillas().length).toBeGreaterThanOrEqual(5)
  })

  it('sólo se disparan al etiquetar, nunca al editar ni al abrir', () => {
    const mal = todas
      .filter((w) => JSON.stringify(tiposDeIssue(w.texto)) !== JSON.stringify(['labeled']))
      .map((w) => `${w.fichero}: ${JSON.stringify(tiposDeIssue(w.texto))}`)
    expect(mal, 'una edición del issue no puede volver a publicar').toEqual([])
  })

  it(`el trabajo exige que la etiqueta que llega sea «${APROBACION}»`, () => {
    const mal = todas
      .filter((w) => !ifDeTrabajo(w.texto).includes(`github.event.label.name == '${APROBACION}'`))
      .map((w) => w.fichero)
    expect(mal, 'publican con una etiqueta que pone la propia plantilla').toEqual([])
  })

  it('comprueba el permiso de quien etiqueta ANTES de empujar', () => {
    const mal = todas
      .filter((w) => {
        const permiso = w.texto.search(/collaborators\/[^\n]*\/permission/)
        const empujon = w.texto.search(/\bgit push\b/)
        return permiso < 0 || permiso > empujon
      })
      .map((w) => w.fichero)
    expect(mal).toEqual([])
  })

  it(`ninguna plantilla pone «${APROBACION}»: aprobar no puede ser parte de pedir`, () => {
    expect(etiquetasDePlantillas()).not.toContain(APROBACION)
  })

  it('los comentarios del bot enlazan al dominio del sitio, no a un alias de Vercel', () => {
    const mal = todas.filter((w) => /vercel\.app/.test(w.texto)).map((w) => w.fichero)
    expect(mal).toEqual([])
  })
})
