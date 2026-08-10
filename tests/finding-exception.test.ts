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
  CORRECTION_CLI,
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
  it('son las fichas hechas por entero de citas que la puerta retiene', () => {
    const marcadas = QUEUE.rows.filter((r) => r.ningunaCitaContrastada)
    expect(marcadas.length).toBeGreaterThan(0)
    for (const r of marcadas) for (const q of r.quotes) expect(q.gate).toBe('hidden')
    expect(QUEUE.stats.sinNingunaCitaContrastada).toBe(marcadas.length)
  })

  it('son un subconjunto PROPIO: la marca distingue, no adorna', () => {
    expect(QUEUE.stats.sinNingunaCitaContrastada).toBeLessThan(QUEUE.stats.encolados)
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

  it('no propone retirar el hallazgo entero: esa CLI no existe', () => {
    // Componer un comando para una operación que el repo no sanciona sería
    // esta cola inventándose una vía de escritura.
    for (const r of QUEUE.rows) {
      expect(Object.keys(r.commands)).toEqual(['corregirSumario'])
      expect(r.commands.corregirSumario.startsWith(CORRECTION_CLI)).toBe(true)
    }
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
