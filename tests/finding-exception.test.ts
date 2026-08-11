/**
 * ¿Encola exactamente los hallazgos que no citan ni un literal que la puerta
 * mostraría, y no decide ninguno?
 *
 * Las dos mitades importan lo mismo. Una cola que encolara de más pondría a un
 * curador a releer 52 fichas para encontrar 39, y una que encolara de menos
 * dejaría publicada la que nadie va a mirar. Y una cola que llegara con una
 * respuesta sería la máquina tomándose la excepción por segunda vez, que es el
 * problema que esta cola existe para no repetir.
 *
 * Contra los ficheros REALES, y con el recuento hecho por un camino distinto al
 * del constructor: si los dos usaran la misma travesía, coincidirían aunque los
 * dos estuvieran mal.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { classifyClaimVisibility } from '../src/scraper/claim-public-gate'
import {
  buildExceptionQueue,
  marcaNingunaContrastada,
  CORRECTION_CLI,
  RETRACTION_CLI,
  EXCEPTION_QUEUE_VERSION,
  type ExceptionClaimFacts,
} from '../src/scraper/finding-exception'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import type { QuoteProvenanceSnapshot } from '../src/scraper/quote-provenance'
import { loadVerifiedCorpus } from '../scripts/lib/verified-corpus'

const ROOT = join(__dirname, '..')
const FINDINGS = validateFindingsSnapshot(
  readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'),
)
const PROVENANCE = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
) as QuoteProvenanceSnapshot
const CORPUS = loadVerifiedCorpus({
  basePath: join(ROOT, 'public/data/pleno-claims-verified-base.json'),
  overlayPath: join(ROOT, 'public/data/pleno-claims-overlay.json'),
})

const FACTS = new Map<string, ExceptionClaimFacts>()
for (const [id, item] of CORPUS.merged) {
  const claim = (item.claim ?? {}) as { type?: string; accusationSubtype?: string }
  FACTS.set(id, {
    verdict: (item.verification?.verdict as string) ?? null,
    claimType: claim.type ?? null,
    accusationSubtype: claim.accusationSubtype ?? null,
  })
}

const QUEUE = buildExceptionQueue(
  FINDINGS.items,
  { gates: PROVENANCE.quotes, facts: FACTS },
  {
    generatedAt: '2026-08-10T00:00:00.000Z',
    findingsGeneratedAt: FINDINGS.generatedAt,
    provenanceGeneratedAt: PROVENANCE.generatedAt,
  },
)

/** El recuento por otro camino: se vuelve a preguntar a la puerta, aquí. */
const SIN_CITA_MOSTRABLE = FINDINGS.items.filter((f) => {
  const quotes = f.quotes ?? []
  if (quotes.length === 0) return false
  return !quotes.some(
    (q) => classifyClaimVisibility(CORPUS.merged.get(q.sourceClaimId ?? '')!) === 'shown',
  )
})

describe('la cola tiene exactamente los hallazgos sin ninguna cita mostrable', () => {
  it('encola los mismos ids que un recuento directo, ni uno más', () => {
    // Que la comprobación mide algo: con la cola vacía pasaría comparando dos
    // conjuntos vacíos sin haber preguntado nada.
    expect(SIN_CITA_MOSTRABLE.length).toBeGreaterThan(0)
    expect(QUEUE.rows.map((r) => r.findingId).sort()).toEqual(
      SIN_CITA_MOSTRABLE.map((f) => f.id).sort(),
    )
    expect(QUEUE.stats.encolados).toBe(SIN_CITA_MOSTRABLE.length)
  })

  it('coincide con la cifra que el snapshot publicado calculó por su cuenta', () => {
    expect(QUEUE.stats.encolados).toBe(PROVENANCE.contraste.stats.hallazgosSinCitaMostrable)
  })

  it('NO encola las fichas que sí citan algo contrastado — el control positivo', () => {
    const conMostrable = FINDINGS.items.filter(
      (f) =>
        (f.quotes ?? []).length > 0 &&
        (f.quotes ?? []).some(
          (q) => classifyClaimVisibility(CORPUS.merged.get(q.sourceClaimId ?? '')!) === 'shown',
        ),
    )
    expect(conMostrable.length).toBeGreaterThan(0)
    const encolados = new Set(QUEUE.rows.map((r) => r.findingId))
    for (const f of conMostrable) expect(encolados.has(f.id)).toBe(false)
  })

  it('ninguna fila trae una cita que la puerta publicaría', () => {
    for (const r of QUEUE.rows) {
      expect(r.citasMostrables).toBe(0)
      for (const q of r.quotes) expect(q.gate).not.toBe('shown')
    }
  })
})

describe('las que no tienen NADA contrastado van marcadas aparte', () => {
  /**
   * Esta clase está VACÍA desde el 2026-08-11, y por eso la comprobación se
   * escribe al revés que las demás.
   *
   * Eran once fichas hechas por entero de citas que la puerta retiene: el
   * sumario hablaba de grupos con nombre y la ficha no podía enseñar ni una
   * intervención. Se retiraron todas, y `check:summary-gate` ya bloquea la
   * forma, así que exigir `> 0` aquí sería exigir que el defecto vuelva.
   *
   * Lo que sí hay que seguir probando es que la marca FUNCIONA — si no, el
   * cero de arriba sería el de un clasificador muerto, que es exactamente la
   * trampa que documenta docs/DATA_INTEGRITY.md. De ahí las dos mitades: el
   * corpus vivo está limpio, y el clasificador sigue marcando cuando hay algo
   * que marcar.
   */
  it('el corpus publicado ya no tiene ninguna, que es el estado correcto', () => {
    const marcadas = QUEUE.rows.filter((r) => r.ningunaCitaContrastada)
    expect(marcadas).toEqual([])
    expect(QUEUE.stats.sinNingunaCitaContrastada).toBe(0)
  })

  it('y la marca no está muerta: sigue disparando sobre una ficha así', () => {
    // Control positivo. Sin él, «cero fichas marcadas» y «el clasificador no
    // mira» son indistinguibles.
    const row = QUEUE.rows.find((r) => r.quotes.length > 0)
    expect(row, 'la cola está vacía: nada de esto mide nada').toBeDefined()
    const todasOcultas = { ...row!, quotes: row!.quotes.map((q) => ({ ...q, gate: 'hidden' })) }
    expect(todasOcultas.quotes.every((q) => q.gate === 'hidden')).toBe(true)
    expect(marcaNingunaContrastada(todasOcultas.quotes)).toBe(true)
    // …y no dispara cuando una sola cita es publicable.
    expect(
      marcaNingunaContrastada([
        ...todasOcultas.quotes.slice(1),
        { ...row!.quotes[0], gate: 'toggle' },
      ]),
    ).toBe(false)
  })

  it('la marca, cuando la hay, es un subconjunto PROPIO: distingue, no adorna', () => {
    expect(QUEUE.stats.sinNingunaCitaContrastada).toBeLessThanOrEqual(QUEUE.stats.encolados)
  })

  it('coinciden con la cifra que el snapshot publicado calculó por su cuenta', () => {
    expect(QUEUE.stats.sinNingunaCitaContrastada).toBe(
      PROVENANCE.contraste.stats.hallazgosSoloConCitasOcultas,
    )
  })
})

describe('la cola presenta y no elige', () => {
  it('ninguna fila llega con decisión, y no hay rama que la ponga', () => {
    expect(QUEUE.rows.length).toBeGreaterThan(0)
    for (const r of QUEUE.rows) expect(r.decision).toBeNull()
    // Y no existe en el módulo: la única aparición de `decision` en el
    // constructor la fija a null.
    const src = readFileSync(join(ROOT, 'src/scraper/finding-exception.ts'), 'utf8')
    const asignaciones = src.match(/decision:\s*[^,\n]+/g) ?? []
    expect(asignaciones.length).toBeGreaterThan(0)
    for (const a of asignaciones) expect(a).toMatch(/decision:\s*(null|null,)$/)
  })

  it('no puntúa ni ordena por gravedad: el orden es cronológico', () => {
    const fechas = QUEUE.rows.map((r) => r.plenoDate)
    expect([...fechas].sort().reverse()).toEqual(fechas)
    // Y nada que se parezca a una nota.
    for (const r of QUEUE.rows) {
      expect(Object.keys(r)).not.toContain('score')
      expect(Object.keys(r)).not.toContain('recomendacion')
    }
  })

  it('sólo propone retirar el hallazgo donde retirar es el único remedio', () => {
    // Ofrecer los dos comandos no es elegir: la fila sigue llegando con
    // `decision: null`. Lo que no puede hacer la cola es proponer una retirada
    // en una ficha que SÍ tiene una cita publicable — ahí el remedio es
    // corregir la prosa, y sugerir la retirada sería la máquina empujando
    // hacia la operación irreversible.
    for (const r of QUEUE.rows) {
      expect(r.commands.corregirSumario.startsWith(CORRECTION_CLI)).toBe(true)
      if (r.ningunaCitaContrastada) {
        expect(r.commands.retirarHallazgo, `${r.findingId}: sin salida posible`).toBeDefined()
        expect(r.commands.retirarHallazgo!.startsWith(RETRACTION_CLI)).toBe(true)
      } else {
        expect(Object.keys(r.commands)).toEqual(['corregirSumario'])
      }
    }
  })

  it('y la rama de retirada se compone de verdad cuando toca', () => {
    // Control positivo: el corpus vivo no tiene ninguna fila hueca desde el
    // 2026-08-11, así que sin esto la rama de arriba nunca se ejecutaría y
    // «ninguna propone retirar» sería cierto por vacío.
    const hueca = buildExceptionQueue(
      FINDINGS.items.slice(0, 1).map((f) => ({ ...f })),
      {
        gates: {
          [FINDINGS.items[0].id]: (FINDINGS.items[0].quotes ?? []).map(() => ({
            status: 'en-vigente',
            gate: 'hidden',
          })),
        },
        facts: FACTS,
      },
      {
        generatedAt: '2026-08-11T00:00:00.000Z',
        findingsGeneratedAt: FINDINGS.generatedAt,
        provenanceGeneratedAt: PROVENANCE.generatedAt,
      },
    )
    expect(hueca.rows).toHaveLength(1)
    expect(hueca.rows[0].ningunaCitaContrastada).toBe(true)
    expect(hueca.rows[0].commands.retirarHallazgo).toContain(FINDINGS.items[0].id)
    expect(hueca.rows[0].decision).toBeNull()
  })
})

describe('cada fila trae lo que hace falta para responder la pregunta', () => {
  it('el sumario publicado, que es lo que se juzga', () => {
    for (const r of QUEUE.rows) {
      const f = FINDINGS.items.find((x) => x.id === r.findingId)!
      expect(r.summary).toBe(f.summary)
      expect(r.title).toBe(f.title)
    }
  })

  it('cada cita con el veredicto de la puerta Y el del verificador', () => {
    let conVeredicto = 0
    for (const r of QUEUE.rows) {
      for (const q of r.quotes) {
        expect(q.gate).toBeTruthy()
        expect(q.claimId).toBeTruthy()
        if (q.verdict) conVeredicto += 1
      }
    }
    // Sin esto, «trae el veredicto» pasaría con las 131 filas a null.
    expect(conVeredicto).toBe(QUEUE.stats.citasEnCola)
    expect(QUEUE.stats.citasEnCola).toBeGreaterThan(0)
  })

  it('quién la firmó — que es el motivo entero de la cola', () => {
    for (const r of QUEUE.rows) {
      const f = FINDINGS.items.find((x) => x.id === r.findingId)!
      expect(r.curatorName).toBe(f.curatorName)
    }
    const firmas = Object.values(QUEUE.stats.porCurador).reduce((a, b) => a + b, 0)
    expect(firmas).toBe(QUEUE.stats.encolados)
    // El hallazgo medido: la mayoría las firma un proceso automático.
    const auto = Object.entries(QUEUE.stats.porCurador)
      .filter(([k]) => k.startsWith('auto') || k.includes('auto'))
      .reduce((n, [, v]) => n + v, 0)
    expect(auto).toBeGreaterThan(QUEUE.stats.encolados / 2)
  })

  it('y el otro eje de la misma cita, para no tener que abrir otra pantalla', () => {
    const conTranscripcion = QUEUE.rows.flatMap((r) =>
      r.quotes.filter((q) => q.transcriptStatus != null),
    )
    expect(conTranscripcion.length).toBe(QUEUE.stats.citasEnCola)
  })
})

describe('la cabecera del fichero dice lo que es', () => {
  it('se declara no publicable y nombra al único escritor', () => {
    expect(QUEUE.queueVersion).toBe(EXCEPTION_QUEUE_VERSION)
    expect(QUEUE._comment).toMatch(/editorial\//)
    expect(QUEUE._comment).toMatch(/no debe publicarse/)
    expect(QUEUE._comment).toContain(CORRECTION_CLI)
  })

  it('apunta a los dos snapshots de los que sale', () => {
    expect(QUEUE.sourceSnapshot.findings).toBe('public/data/pleno-findings.json')
    expect(QUEUE.sourceSnapshot.provenance).toBe('public/data/finding-quote-provenance.json')
    expect(QUEUE.sourceSnapshot.provenanceGeneratedAt).toBe(PROVENANCE.generatedAt)
  })
})
