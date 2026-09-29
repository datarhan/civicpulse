import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { notaAcusacionSinContrastar, ROTULO_CITA_RETENIDA } from '../src/components/PlenoFindings'
import { isMachineAuthored } from '../src/scraper/finding-authorship'

/** «No se publica», en cualquiera de sus formas — la misma guarda que #155 y #157. */
const NO_SE_PUBLICA = /no (?:la |lo |las |los |se )?publica/i

const ROOT = join(__dirname, '..')
const findings = JSON.parse(readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'))
const prov = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
)

describe('la nota de «acusación no contrastada» no inventa un editor humano', () => {
  // Decía: «Aquí aparece porque alguien promovió la ficha: el pie dice quién.»
  // Sobre una acusación pública sin contrastar contra la gestión municipal, eso
  // le dice al lector que una persona asumió esa responsabilidad editorial. Las
  // 19 fichas que llevan la marca las firma `auto-curation-v1`. Ninguna
  // persona decidió nada. Lo cazó la revisión de superficies; ninguna
  // comprobación de datos podía, porque el dato estaba bien.
  /**
   * La frase decía «Aquí aparece igualmente», que describía la política vieja:
   * marcar el literal y publicarlo de todos modos. Desde que las dos
   * superficies obedecen la misma puerta, el literal NO aparece — y la nota
   * que lo negaba se quedó rancia el mismo día que se escribió.
   *
   * Se fija por texto porque es prosa sobre grupos políticos con nombre: si
   * alguien vuelve a la política anterior, esto tiene que ponerse rojo antes de
   * que la página vuelva a afirmar lo contrario de lo que hace.
   */
  it('no dice que el literal aparezca aquí, porque ya no aparece', () => {
    for (const quien of ['auto-curation-v1', 'civicpulse-curator', '']) {
      const nota = notaAcusacionSinContrastar(quien)
      expect(nota, `curador «${quien}»`).not.toMatch(/aparece igualmente|aquí aparece/i)
      expect(nota, `curador «${quien}»`).toMatch(/no reproduce su literal/i)
    }
  })

  /**
   * Decía «su literal no se publica: ni aquí … ni en el registro de
   * declaraciones del pleno». El 28-09-2026 el literal de las 37 retenidas iba
   * entero en /data/pleno-findings.json y en la bitácora de la propia ficha.
   * Desde que la copia servida lo pierde al compilar, lo que la ficha cumple es
   * NO REPRODUCIRLO —ni en la cita, ni en su bitácora, ni en sus datos—; «no se
   * publica», no: sigue en el repositorio, que es público, y lo dicho consta en
   * la transcripción de la sesión.
   */
  it('no promete que no se publique: dice qué no reproduce la ficha y dónde siguen las palabras', () => {
    for (const quien of ['auto-curation-v1', 'civicpulse-curator', '']) {
      const nota = notaAcusacionSinContrastar(quien)
      expect(nota, `curador «${quien}»`).not.toMatch(NO_SE_PUBLICA)
      expect(nota, `curador «${quien}»`).toMatch(/bitácora/i)
      expect(nota, `curador «${quien}»`).toMatch(/datos de la ficha/i)
      expect(nota, `curador «${quien}»`).toMatch(/transcripción completa/i)
    }
  })

  it('dice cuál es el literal que no reproduce: el del hueco que la ficha deja a la vista', () => {
    // La revisión lectora leyó dos veces «su literal no se publica» como si hablara de
    // la cita impresa de al lado, cuando hablaba de la retenida: el 29-08-2026 sobre
    // f-2026-05-11-cit-a0a379 y el 15-09-2026 sobre f-2026-05-11-cit-7f7619. La nota
    // no decía cuál. Ahora nombra el hueco con el mismo rótulo que lo pinta.
    expect(ROTULO_CITA_RETENIDA, 'el rótulo del hueco no se exporta').toBeTruthy()
    for (const quien of ['auto-curation-v1', 'civicpulse-curator', '']) {
      expect(notaAcusacionSinContrastar(quien), `curador «${quien}»`).toContain(
        `«${ROTULO_CITA_RETENIDA}»`,
      )
    }
  })

  /**
   * Decía «es una acusación pública SOBRE LA GESTIÓN MUNICIPAL que el
   * verificador no ha podido contrastar», y la puerta no sabe a quién se
   * acusa: retiene una `acusacion_publica` sin datos que la respalden, sea de
   * quien sea el blanco. En f-2025-11-03-acu-431140 las dos retenidas hablan
   * de la Generalitat y de su presidente, y no es un caso raro: leídas a mano
   * las 37 retenidas del corpus el 28-09-2026, la mayoría tratan de otra
   * administración o de lo que votó o dijo otro grupo, no del gobierno
   * municipal. Señalado por la revisión lectora ese día.
   */
  it('no dice de quién es la acusación, porque la puerta no lo sabe', () => {
    for (const quien of ['auto-curation-v1', 'civicpulse-curator', '']) {
      expect(notaAcusacionSinContrastar(quien), `curador «${quien}»`).not.toMatch(
        /gesti[oó]n municipal/i,
      )
    }
  })

  it('nombra al proceso automático cuando lo editó una máquina', () => {
    const nota = notaAcusacionSinContrastar('auto-curation-v1')
    expect(nota).toContain('auto-curation-v1')
    expect(nota).toMatch(/no una persona|proceso automático/i)
    expect(nota).not.toMatch(/\balguien\b/i)
  })

  it('nombra a la persona cuando la editó una persona', () => {
    // Control: sin esto, una nota que dijera siempre «lo escribió una máquina»
    // pasaría la prueba de arriba mintiendo en el otro sentido.
    const nota = notaAcusacionSinContrastar('civicpulse-curator')
    expect(nota).toContain('civicpulse-curator')
    expect(nota).not.toMatch(/proceso automático/i)
  })

  it('no afirma nada cuando no sabe quién', () => {
    const nota = notaAcusacionSinContrastar(undefined)
    expect(nota).not.toMatch(/\balguien\b/i)
    expect(nota).not.toMatch(/proceso automático/i)
    expect(nota.length).toBeGreaterThan(40)
  })

  it('sobre lo publicado: ninguna ficha marcada se atribuye a una persona que no existe', () => {
    const byId = new Map(findings.items.map((f) => [f.id, f]))
    const marcadas = Object.entries(prov.quotes ?? {})
      .filter(([, entradas]) => entradas.some((e) => e.gate === 'hidden'))
      .map(([id]) => byId.get(id))
      .filter(Boolean)

    expect(
      marcadas.length,
      'ninguna ficha lleva la marca — la prueba no mide nada',
    ).toBeGreaterThan(0)
    for (const f of marcadas) {
      const nota = notaAcusacionSinContrastar(f.curatorName)
      if (isMachineAuthored(f.curatorName)) {
        expect(nota, `${f.id} presenta una decisión automática como humana`).not.toMatch(
          /\balguien\b/i,
        )
        expect(nota).toContain(f.curatorName)
      } else {
        expect(nota).toContain(f.curatorName)
      }
    }
  })
})
