/**
 * La copia de `pleno-findings.json` que sirve el sitio no lleva el literal de
 * ninguna cita que la puerta editorial retiene.
 *
 * Desde el 27-08-2026 una cita `hidden` se pinta como el hueco «Literal
 * retenido», y la nota de debajo decía «su literal no se publica: ni aquí … ni
 * en el registro de declaraciones del pleno». Medido el 28-09-2026 sobre el
 * artefacto construido, el literal de las 37 retenidas se servía entero en
 * `/data/pleno-findings.json`, y además la propia página lo imprimía por tres
 * caminos: la bitácora de correcciones (cada reanclaje publica su `original` y
 * su `corrected`, que son dos versiones del literal), el buscador Cmd+K (los 80
 * primeros caracteres de la primera cita de cada ficha) y un sumario firmado.
 * «No se imprime» era cierto del hueco y de nada más.
 *
 * El fichero del repositorio tiene que seguir llevándolo: la CLI de
 * correcciones, `check:citations`, el reanclaje y la propia puerta lo leen, y
 * una cita retenida hoy puede dejar de estarlo mañana. Así que lo que cambia es
 * la COPIA SERVIDA, al compilar (`publication-denylist.js`), y el repositorio,
 * que es público desde el 8-09-2026, lo sigue guardando. Esta prueba no puede
 * prometer más que eso, y la nota de la página tampoco.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  HUELLA_RE,
  PUERTA_QUE_RETIENE,
  TRAMO_MINIMO_EN_CARACTERES,
  huellaDeLiteral,
  rastrosDeLiterales,
  retenerLiterales,
  tramosDeLiterales,
  versionesDeCitas,
  type FilaLike,
} from '../src/scraper/literales-retenidos'
import { CLAIM_VISIBILITIES } from '../src/scraper/claim-public-gate'
import { citaRetenida, PUERTA_QUE_RETIENE as PUERTA_DE_LA_LIB } from '../src/lib/cita-retenida.js'
import { provenanceFor } from '../src/hooks/useFindingQuoteProvenance.js'
import { sha256Short } from '../src/scraper/hash'
import { normaliseForQuoteMatch } from '../src/scraper/quote-match'

const ROOT = join(__dirname, '..')
const leer = (rel: string) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))

// ── Una ficha de juguete con las tres salidas de la puerta ──────────────────

const MOSTRADA = 'el presupuesto de 2025 sube un tres por ciento respecto al anterior ejercicio'
const RETENIDA = 'ustedes adjudicaron el contrato a dedo a una empresa de un amigo del alcalde'
const RETENIDA_VIEJA = 'ustedes adjudicaron el contrato a dedo a una empresa amiga del alcalde'
const SIN_CONTRASTE = 'la obra de la piscina empezó en 2005 y se inauguró en diciembre de 2012'

function ficha(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f-prueba',
    plenoId: 'p1',
    plenoDate: '2026-01-01',
    title: 'Título de prueba',
    summary: 'Sumario de prueba sin ningún literal dentro.',
    severity: 'informational',
    sourceClaimIds: ['c0', 'c1', 'c2'],
    quotes: [
      { text: MOSTRADA, speakerGroup: 'PSOE', sourceClaimId: 'c0' },
      { text: RETENIDA, speakerGroup: 'PP', sourceClaimId: 'c1' },
      { text: SIN_CONTRASTE, speakerGroup: null, sourceClaimId: 'c2' },
    ],
    crossChecked: [],
    contradiction: [],
    corrections: [] as FilaLike[],
    ...overrides,
  }
}

const snapshotDe = (...items: Array<ReturnType<typeof ficha>>) => ({
  version: '1.0',
  generatedAt: '2026-09-28T00:00:00.000Z',
  legalNotice: 'x',
  contactUrl: 'x',
  methodologyUrl: '/metodologia',
  items,
  retractions: [],
})

const procedencia = (gates: Record<string, Array<string | null>>) => ({
  quotes: Object.fromEntries(
    Object.entries(gates).map(([id, gs]) => [
      id,
      gs.map((gate) => (gate == null ? null : { status: 'en-vigente', gate })),
    ]),
  ),
})

const fila = (field: string, original: string, corrected: string) => ({
  field,
  original,
  corrected,
  reason: 'Reanclaje a la transcripción vigente de la sesión, con el mismo pasaje.',
  editor: 'civicpulse-curator',
  correctedAt: '2026-08-10T12:00:00.000Z',
})

describe('la puerta que retiene sale del enum de la puerta', () => {
  it('es uno de sus resultados, no una cadena escrita aquí', () => {
    expect(CLAIM_VISIBILITIES).toContain(PUERTA_QUE_RETIENE)
    // La constante se define en src/lib/cita-retenida.js, con el predicado;
    // la de este módulo es la misma, tipada contra el enum.
    expect(PUERTA_QUE_RETIENE).toBe(PUERTA_DE_LA_LIB)
  })

  it('el predicado retiene exactamente ese resultado, y lo que la copia servida marca', () => {
    // Una sola definición para la página, la copia servida y las
    // comprobaciones: si el enum gana un estado, esto dice qué hace con él.
    for (const estado of CLAIM_VISIBILITIES) {
      expect(citaRetenida({ gate: estado }), estado).toBe(estado === PUERTA_QUE_RETIENE)
    }
    expect(citaRetenida(undefined, { literalRetenido: true })).toBe(true)
    expect(citaRetenida({ gate: null }, { text: 'una cita' })).toBe(false)
    expect(citaRetenida(undefined)).toBe(false)
  })
})

describe('retenerLiterales — la cita retenida pierde el literal y conserva su sitio', () => {
  const prov = procedencia({ 'f-prueba': ['shown', PUERTA_QUE_RETIENE, 'toggle'] })

  it('quita el texto de la retenida y deja su atribución, su afirmación y su posición', () => {
    const { snapshot } = retenerLiterales(snapshotDe(ficha()), prov)
    const quotes = snapshot.items[0].quotes
    // La posición importa: la procedencia se lee por índice (`prov[i]`), así
    // que borrar la fila desplazaría la marca de cada cita posterior.
    expect(quotes).toHaveLength(3)
    expect(quotes[1]).toEqual({ speakerGroup: 'PP', sourceClaimId: 'c1', literalRetenido: true })
    expect(quotes[1]).not.toHaveProperty('text')
  })

  it('las que la puerta enseña salen tal cual, sin marca', () => {
    const entrada = ficha()
    const { snapshot } = retenerLiterales(snapshotDe(entrada), prov)
    expect(snapshot.items[0].quotes[0]).toEqual(entrada.quotes[0])
    expect(snapshot.items[0].quotes[2]).toEqual(entrada.quotes[2])
  })

  it('no toca la entrada: el fichero del repositorio sigue llevando el literal', () => {
    const entrada = snapshotDe(ficha())
    const antes = JSON.stringify(entrada)
    retenerLiterales(entrada, prov)
    expect(JSON.stringify(entrada)).toBe(antes)
  })

  it('cuenta lo que hizo, y lo que no pudo juzgar aparte', () => {
    const otra = ficha({ id: 'f-sin-procedencia' })
    const { stats, retenidas } = retenerLiterales(snapshotDe(ficha(), otra), prov)
    expect(stats.citasRetenidas).toBe(1)
    expect(retenidas).toEqual([{ findingId: 'f-prueba', quoteIndex: 1 }])
    // Una cita sin fila de puerta se sirve como está —es lo que hace la página:
    // sin procedencia la pinta sin marca—, pero no se dobla con «juzgada».
    expect(stats.citasSinPuerta).toBe(3)
  })

  it('deja dicho en la copia servida qué falta, por qué y dónde sigue', () => {
    const { snapshot } = retenerLiterales(snapshotDe(ficha()), prov)
    const nota = snapshot.literalesRetenidos
    expect(nota.citas).toBe(1)
    expect(nota.metodologia).toBe('/metodologia#citas-contraste')
    // Quien descargue el JSON tiene que saber que el literal no ha desaparecido
    // del mundo: el repositorio lo guarda y la sesión tiene su transcripción.
    expect(nota.nota).toMatch(/repositorio/)
    expect(nota.nota).toMatch(/públic/)
    expect(nota.nota).toMatch(/transcripción/)
    expect(nota.nota).not.toMatch(/no (?:la |lo |las |los |se )?publica/i)
  })

  it('una procedencia sin tabla de citas no se toma por «nada que retener»', () => {
    // Fallar cerrado: sin puertas no se sabe qué retener, y servir el fichero
    // entero es exactamente lo que esto existe para impedir.
    expect(() => retenerLiterales(snapshotDe(ficha()), {} as never)).toThrow(/procedencia/)
  })
})

describe('retenerLiterales — la bitácora no reimprime lo que el hueco retiene', () => {
  const prov = procedencia({ 'f-prueba': ['shown', PUERTA_QUE_RETIENE, 'toggle'] })

  it('las dos versiones de un reanclaje pasan a huella; quién, cuándo y por qué se quedan', () => {
    const correccion = fila('quote.1.text', RETENIDA_VIEJA, RETENIDA)
    const { snapshot, stats } = retenerLiterales(
      snapshotDe(ficha({ corrections: [correccion] })),
      prov,
    )
    const servida = snapshot.items[0].corrections[0]
    expect(servida).toEqual({
      ...correccion,
      original: huellaDeLiteral(RETENIDA_VIEJA),
      corrected: huellaDeLiteral(RETENIDA),
      literalRetenido: true,
    })
    expect(stats.filasDeBitacora).toBe(1)
  })

  it('la huella es la receta de la CLI de correcciones: sha256Short del JSON del texto', () => {
    // La misma que `redactionDigest` en pleno-finding.ts, para que un auditor
    // con el texto del repositorio pueda rehacerla con la misma herramienta.
    expect(huellaDeLiteral(RETENIDA)).toBe(
      `cita retenida · sha256:${sha256Short(JSON.stringify(RETENIDA))}`,
    )
    expect(huellaDeLiteral(RETENIDA)).toMatch(HUELLA_RE)
  })

  it('sigue la cadena entera: A→B y B→C son tres versiones del mismo literal', () => {
    const a = 'primera versión del literal retenido con palabras del motor viejo'
    const corrs = [
      fila('quote.1.text', a, RETENIDA_VIEJA),
      fila('quote.1.text', RETENIDA_VIEJA, RETENIDA),
    ]
    const { snapshot } = retenerLiterales(snapshotDe(ficha({ corrections: corrs })), prov)
    for (const c of snapshot.items[0].corrections) {
      expect(c.original).toMatch(HUELLA_RE)
      expect(c.corrected).toMatch(HUELLA_RE)
    }
    expect(versionesDeCitas(ficha({ corrections: corrs }))[1]).toEqual(
      new Set([RETENIDA, RETENIDA_VIEJA, a]),
    )
  })

  it('los índices se mueven al retirar una cita: la fila se asigna por su texto', () => {
    // Pasa en los datos (f-2026-01-19-cit-3fd230): una fila `quote.2.text` y,
    // DESPUÉS, la retirada de otra cita, que renumera. El número de la fila ya
    // no señala la cita que corrigió; su texto sí.
    const retirada = {
      ...fila('quote.0', 'cita · sha256:0123456789ab', 'retirada del hallazgo'),
    }
    const vieja = fila('quote.2.text', RETENIDA_VIEJA, RETENIDA) // hoy es la 1
    const deLaMostrada = fila('quote.1.text', 'el presupuesto sube', MOSTRADA) // hoy es la 0
    const { snapshot } = retenerLiterales(
      snapshotDe(ficha({ corrections: [vieja, deLaMostrada, retirada] })),
      prov,
    )
    const [c0, c1, c2] = snapshot.items[0].corrections
    expect(c0.corrected).toMatch(HUELLA_RE) // su número decía 2, su texto es la retenida
    expect(c1).toEqual(deLaMostrada) // su número decía 1 (la retenida), su texto es la mostrada
    expect(c2).toEqual(retirada) // una retirada ya es una huella
  })

  it('una fila que no encadena con ninguna cita vigente se retiene si su número señala una retenida', () => {
    // Lo prudente cuando no se puede saber: la bitácora pierde un detalle; la
    // otra opción es volver a imprimir el literal.
    const huerfana = fila('quote.1.text', 'un texto que no casa', 'con ninguna versión vigente')
    const { snapshot, stats } = retenerLiterales(
      snapshotDe(ficha({ corrections: [huerfana] })),
      prov,
    )
    expect(snapshot.items[0].corrections[0].corrected).toMatch(HUELLA_RE)
    expect(stats.filasHuerfanas).toBe(1)
  })

  it('las filas sin literal de una retenida —atribución, afirmación— se quedan como están', () => {
    const atribucion = fila('quote.1.speakerGroup', 'PSOE', 'PP')
    const afirmacion = fila('quote.1.sourceClaimId', 'c9', 'c1')
    const { snapshot } = retenerLiterales(
      snapshotDe(ficha({ corrections: [atribucion, afirmacion] })),
      prov,
    )
    expect(snapshot.items[0].corrections).toEqual([atribucion, afirmacion])
  })

  it('no reescribe prosa: un sumario que copia el literal se queda como está', () => {
    // Nada automático reescribe prosa publicada (CLAUDE.md, regla 4). Un sumario
    // que cita el literal lo corrige una persona con `correct-pleno-finding
    // --field summary --redact`; la prueba de los datos de abajo lo señala.
    const sumario = fila('summary', 'Sumario viejo.', `El PP afirma que «${RETENIDA}».`)
    const entrada = ficha({ summary: `El PP afirma que «${RETENIDA}».`, corrections: [sumario] })
    const { snapshot } = retenerLiterales(snapshotDe(entrada), prov)
    expect(snapshot.items[0].summary).toBe(entrada.summary)
    expect(snapshot.items[0].corrections[0]).toEqual(sumario)
  })
})

describe('rastrosDeLiterales — dónde queda un tramo de un literal', () => {
  const literal = { id: 'f-prueba#1', versiones: [RETENIDA] }

  it('lo encuentra aunque cambien las mayúsculas, los acentos y la puntuación', () => {
    const { snapshot: servido } = retenerLiterales(
      snapshotDe(
        ficha({
          summary: 'Dijo: «Ustedes ADJUDICARON el contrato a dedó, a una empresa de un amigo».',
        }),
      ),
      procedencia({ 'f-prueba': ['shown', PUERTA_QUE_RETIENE, 'toggle'] }),
    )
    expect(rastrosDeLiterales(servido, [literal])).toEqual([
      { id: 'f-prueba#1', ruta: 'f-prueba:summary' },
    ])
  })

  it('un literal de menos de cinco palabras no se criba: se diría en cualquier sitio', () => {
    const corto = { id: 'f-prueba#9', versiones: ['vostés se la han'] }
    expect(rastrosDeLiterales(snapshotDe(ficha({ summary: 'vostés se la han' })), [corto])).toEqual(
      [],
    )
  })

  it('no confunde el literal con la huella que lo sustituye', () => {
    const { snapshot } = retenerLiterales(
      snapshotDe(ficha({ corrections: [fila('quote.1.text', RETENIDA_VIEJA, RETENIDA)] })),
      procedencia({ 'f-prueba': ['shown', PUERTA_QUE_RETIENE, 'toggle'] }),
    )
    expect(
      rastrosDeLiterales(snapshot, [{ id: 'f-prueba#1', versiones: [RETENIDA, RETENIDA_VIEJA] }]),
    ).toEqual([])
  })
})

describe('tramosDeLiterales — cuarenta caracteres de un literal, en cualquier versión', () => {
  const retenidaServida = (summary: string) =>
    retenerLiterales(
      snapshotDe(ficha({ summary })),
      procedencia({ 'f-prueba': ['shown', PUERTA_QUE_RETIENE, 'toggle'] }),
    ).snapshot

  it('lo encuentra aunque cambien las mayúsculas, los acentos y la puntuación, y dice cuánto', () => {
    const servido = retenidaServida(
      'Dijo: «Ustedes ADJUDICARON el contrato a dedó, a una empresa de un amigo».',
    )
    expect(tramosDeLiterales(servido, [{ id: 'f-prueba#1', versiones: [RETENIDA] }])).toEqual([
      {
        id: 'f-prueba#1',
        ruta: 'f-prueba:summary',
        caracteres: 'ustedes adjudicaron el contrato a dedo a una empresa de un amigo'.length,
      },
    ])
  })

  it('el umbral es el que dice su nombre: treinta y nueve caracteres no, cuarenta sí', () => {
    const literal = {
      id: 'f-prueba#1',
      versiones: ['uno dos tres cuatro cinco seis siete ocho nueve'],
    }
    const cuarenta = 'uno dos tres cuatro cinco seis siete och'
    expect(TRAMO_MINIMO_EN_CARACTERES).toBe(cuarenta.length)
    expect(tramosDeLiterales(snapshotDe(ficha({ summary: `${cuarenta}X` })), [literal])).toEqual([
      { id: 'f-prueba#1', ruta: 'f-prueba:summary', caracteres: 40 },
    ])
    expect(
      tramosDeLiterales(snapshotDe(ficha({ summary: `${cuarenta.slice(0, -1)}X` })), [literal]),
    ).toEqual([])
  })

  /**
   * La forma de f-2025-12-01-cit-bef239, con otras palabras: la cita se
   * reancló a la transcripción vigente, en valenciano, y el sumario seguía
   * contando en estilo indirecto la versión castellana que se había publicado
   * como literal. Contra el texto de hoy no comparte nada; contra la versión
   * anterior, cuarenta y ocho caracteres. Y la ventana de ocho palabras no lo
   * ve: pasar a estilo indirecto cambia la persona del verbo justo donde hacía
   * falta la octava.
   */
  it('mira todas las versiones que el repositorio guarda, no sólo la vigente', () => {
    const vigente = "vostés van votar contra l'ampliació del poliesportiu municipal"
    const anterior = 'ustedes votaron contra la ampliación del polideportivo municipal'
    const servido = retenidaServida(
      'El grupo A afirma que el grupo B votó contra la ampliación del polideportivo municipal.',
    )
    const soloVigente = [{ id: 'f-prueba#1', versiones: [vigente] }]
    const conAnterior = [{ id: 'f-prueba#1', versiones: [vigente, anterior] }]
    expect(tramosDeLiterales(servido, soloVigente)).toEqual([])
    expect(tramosDeLiterales(servido, conAnterior)).toEqual([
      {
        id: 'f-prueba#1',
        ruta: 'f-prueba:summary',
        caracteres: ' contra la ampliacion del polideportivo municipal'.length,
      },
    ])
    expect(rastrosDeLiterales(servido, conAnterior)).toEqual([])
  })

  it('no confunde el literal con la huella que lo sustituye', () => {
    const { snapshot } = retenerLiterales(
      snapshotDe(ficha({ corrections: [fila('quote.1.text', RETENIDA_VIEJA, RETENIDA)] })),
      procedencia({ 'f-prueba': ['shown', PUERTA_QUE_RETIENE, 'toggle'] }),
    )
    expect(
      tramosDeLiterales(snapshot, [{ id: 'f-prueba#1', versiones: [RETENIDA, RETENIDA_VIEJA] }]),
    ).toEqual([])
  })
})

// ── Sobre los datos publicados ───────────────────────────────────────────────

const FUENTE = leer('public/data/pleno-findings.json')
const PROV = leer('public/data/finding-quote-provenance.json')

/** Las retenidas, con todas las versiones de su literal que el repositorio guarda. */
function retenidasDe(fuente: typeof FUENTE, prov: typeof PROV) {
  const out: Array<{ id: string; versiones: string[] }> = []
  for (const f of fuente.items) {
    const versiones = versionesDeCitas(f)
    // Con el predicado de la página, no con `gate === …` escrito aquí.
    ;(f.quotes ?? []).forEach((q: { literalRetenido?: boolean }, i: number) => {
      if (citaRetenida(provenanceFor(prov, f.id)[i], q))
        out.push({ id: `${f.id}#${i}`, versiones: [...versiones[i]] })
    })
  }
  return out
}

/** Las dos cribas que miran la copia servida: ocho palabras seguidas, o cuarenta caracteres. */
type Criba = 'palabras' | 'caracteres'

/**
 * Prosa firmada que copia un literal retenido y que sólo puede arreglar una
 * persona. La lista CADUCA sola: cada prueba exige que cada entrada de su criba
 * siga encontrándose, así que el día que se corrija hay que quitarla de aquí.
 */
const PROSA_QUE_ESPERA_A_UNA_PERSONA: Array<{ id: string; ruta: string; cribas: Criba[] }> = [
  // El sumario de f-2026-01-19-cit-543cc1 citaba entero el literal que la ficha
  // retiene; se firmó su redacción el 29-09-2026 (`--redact summary`, cuyo
  // barrido pasó a huella también la fila que copiaba el sumario), y sus dos
  // entradas salieron de esta lista en el mismo commit.
  {
    // El motivo de una corrección de atribución (09-08) cita el arranque del
    // literal para explicar de dónde salía el sumario. La CLI no reescribe
    // motivos: decidir qué hacer con éste es de una persona.
    id: 'f-2026-05-11-acu-7c65c5#3',
    ruta: 'f-2026-05-11-acu-7c65c5:corrections[1].reason',
    cribas: ['palabras', 'caracteres'],
  },
  {
    // El sumario cuenta en estilo indirecto la versión castellana que se
    // publicó como literal hasta el reanclaje del 10-08-2026: siete palabras
    // seguidas, así que sólo lo ve la criba de caracteres. Su redacción
    // (`correct-pleno-finding --redact summary`) espera firma; esta entrada
    // sale en el mismo commit que la aplique.
    id: 'f-2025-12-01-cit-bef239#2',
    ruta: 'f-2025-12-01-cit-bef239:summary',
    cribas: ['caracteres'],
  },
]

const clave = (r: { id: string; ruta: string }) => `${r.id} @ ${r.ruta}`
const esperadas = (criba: Criba) =>
  PROSA_QUE_ESPERA_A_UNA_PERSONA.filter((e) => e.cribas.includes(criba))
    .map(clave)
    .sort()

describe('sobre los datos publicados', () => {
  const retenidas = retenidasDe(FUENTE, PROV)
  const { snapshot, stats } = retenerLiterales(FUENTE, PROV)

  it('hay citas retenidas que medir (si no, lo demás pasaría sin mirar nada)', () => {
    expect(retenidas.length).toBeGreaterThan(0)
    expect(stats.citasRetenidas).toBe(retenidas.length)
  })

  it('ninguna cita retenida conserva su texto en la copia servida', () => {
    for (const r of retenidas) {
      const [id, i] = r.id.split('#')
      const q = snapshot.items.find((f: { id: string }) => f.id === id).quotes[Number(i)]
      expect(q, r.id).not.toHaveProperty('text')
      expect(q.literalRetenido, r.id).toBe(true)
    }
  })

  it('la criba mide algo: sobre el fichero del repositorio encuentra cada literal medible', () => {
    // Control. Sin él, una normalización que vaciara el texto dejaría la prueba
    // de abajo en verde sin haber leído nada.
    const encontradas = new Set(rastrosDeLiterales(FUENTE, retenidas).map((r) => r.id))
    const medibles = retenidas.filter((r) => r.versiones.some((v) => v.split(/\s+/).length >= 5))
    expect(medibles.length).toBeGreaterThan(0)
    for (const r of medibles) expect(encontradas.has(r.id), r.id).toBe(true)
  })

  it('en la copia servida no queda ningún tramo de un literal retenido, salvo la prosa que espera a una persona', () => {
    const rastros = rastrosDeLiterales(snapshot, retenidas)
    expect(rastros.map(clave).sort()).toEqual(esperadas('palabras'))
  })

  it('la criba de caracteres mide algo: sobre el fichero del repositorio encuentra cada literal que la alcanza', () => {
    // El mismo control que el de ocho palabras: cada literal de al menos
    // cuarenta caracteres está entero en su propia cita del repositorio.
    const encontradas = new Set(tramosDeLiterales(FUENTE, retenidas).map((r) => r.id))
    const medibles = retenidas.filter((r) =>
      r.versiones.some((v) => normaliseForQuoteMatch(v).length >= TRAMO_MINIMO_EN_CARACTERES),
    )
    expect(medibles.length).toBeGreaterThan(0)
    for (const r of medibles) expect(encontradas.has(r.id), r.id).toBe(true)
  })

  it('en la copia servida ninguna prosa comparte cuarenta caracteres con un literal retenido, salvo la que espera a una persona', () => {
    // La ventana de ocho palabras no ve un literal contado en estilo indirecto
    // ni uno cuya versión anterior es la que copia el sumario. Medido el
    // 29-09-2026 sobre cinco instantáneas del 11-08 en adelante: por encima de
    // cuarenta caracteres sólo había copias de verdad; por debajo, nombres de
    // instituciones y de temas, que ningún umbral separa de una cita.
    const tramos = tramosDeLiterales(snapshot, retenidas)
    expect(tramos.map(clave).sort()).toEqual(esperadas('caracteres'))
  })
})
