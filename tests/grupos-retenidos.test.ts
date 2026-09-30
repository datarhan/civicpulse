/**
 * La bitácora que sirve el sitio no reproduce a qué grupo de un solo escaño se
 * atribuyó algo que después se retiró.
 *
 * El 29 y el 30-09-2026 el operador firmó la retirada de cada etiqueta de grupo
 * de un solo escaño que nadie había firmado (`correct-pleno-finding --field
 * quote.<i>.speakerGroup --new ""`) y reescribió los sumarios que los nombraban.
 * Cada fila de la bitácora guarda su `original`, y la bitácora lo imprime: la
 * ficha seguía enseñando «Compromís» tachado junto a «sin identificar», y
 * «Compromís afirma…» o «VOX manifestó…» como «texto retirado». Un grupo con un
 * solo concejal nombra a esa persona (`singleSeatBlocs`, corporation-seats.ts),
 * así que la página seguía diciendo a quién había atribuido la máquina la cita
 * después de que una persona firmara que no se sabe.
 *
 * Medido ese día sobre la copia servida: 14 etiquetas retiradas y 53 versiones
 * de sumario o titular en 34 filas, en 14 de las 40 fichas; y 3 motivos.
 *
 * Por qué una marca fija y no una huella como la de `cita retenida · sha256:…`:
 * la huella de un literal no revela nada, pero la de una etiqueta tiene cinco
 * entradas posibles —los grupos de la corporación—, y cinco intentos la
 * deshacen. Los sumarios se reescribieron cambiando el grupo por una fórmula
 * neutra («Por su parte, Compromís destaca» → «En otra intervención se
 * destacan»), así que con el sumario vigente y pocas conjeturas se rehace
 * también la huella del anterior. Una huella ahí diría que se retiene algo que
 * cualquiera recupera.
 *
 * Lo que esto no hace, y la página lo dice: el repositorio es público desde el
 * 8-09-2026 y su `public/data/pleno-findings.json` y su historia conservan la
 * fila entera. Tampoco toca el MOTIVO de una fila: es prosa, y la reescribe una
 * persona con `correct-pleno-finding --amend-reason` (CLAUDE.md, regla 4).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { retenerGruposDeUnEscano, filasQueNombranUnEscano } from '../src/scraper/grupos-retenidos'
import { MARCA_GRUPO_RETENIDO } from '../src/lib/grupo-retenido.js'
import { findPartiesInText } from '../src/lib/party-alias.js'
import { oneSeatBlocsOf } from '../src/scraper/corporation-seats'
import { REDACTION_LABELS, isSpeakerGroupField } from '../src/scraper/pleno-finding'
import { copiaServidaDeHallazgos } from '../publication-denylist.js'

const ROOT = join(__dirname, '..')
const leer = (rel: string) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))

// ── Fichas de juguete ────────────────────────────────────────────────────────

/** Los de hoy en Riba-roja; en las pruebas de juguete va escrito a mano a propósito. */
const UN_ESCANO = ['VOX', 'EU-Podem', 'Compromís']

const fila = (field: string, original: string, corrected: string) => ({
  field,
  original,
  corrected,
  reason: 'Motivo de prueba de más de veinte caracteres.',
  editor: 'civicpulse-curator',
  correctedAt: '2026-09-30T10:00:00.000Z',
})

function ficha(id: string, corrections: Array<ReturnType<typeof fila>>) {
  return {
    id,
    title: 'Titular de prueba',
    summary: 'Sumario de prueba sin ningún grupo.',
    quotes: [{ text: 'una cita cualquiera de la sesión', speakerGroup: null }],
    corrections,
  }
}

const snapshotDe = (...items: Array<ReturnType<typeof ficha>>) => ({
  version: '1.0',
  generatedAt: '2026-09-30T00:00:00.000Z',
  items,
})

const servir = (...items: Array<ReturnType<typeof ficha>>) =>
  retenerGruposDeUnEscano(snapshotDe(...items), UN_ESCANO)

// ── La etiqueta retirada ─────────────────────────────────────────────────────

describe('retenerGruposDeUnEscano — la etiqueta retirada', () => {
  it('no sirve el grupo de un escaño que una corrección retiró; conserva campo, fecha, firma y motivo', () => {
    const entrada = fila('quote.2.speakerGroup', 'Compromís', 'sin identificar')
    const { snapshot } = servir(ficha('f-a', [entrada]))
    expect(snapshot.items[0].corrections[0]).toEqual({
      ...entrada,
      original: MARCA_GRUPO_RETENIDO,
      grupoRetenido: true,
    })
  })

  it('una etiqueta de un grupo con varios escaños se sirve tal cual', () => {
    const entrada = fila('quote.1.speakerGroup', 'PSOE', 'sin identificar')
    const { snapshot } = servir(ficha('f-a', [entrada]))
    expect(snapshot.items[0].corrections[0]).toEqual(entrada)
  })

  it('también cuando una corrección PUSO ese grupo: esa versión tampoco se sirve', () => {
    const entrada = fila('quote.0.speakerGroup', 'PP', 'VOX')
    const { snapshot } = servir(ficha('f-a', [entrada]))
    expect(snapshot.items[0].corrections[0]).toMatchObject({
      original: 'PP',
      corrected: MARCA_GRUPO_RETENIDO,
      grupoRetenido: true,
    })
  })
})

// ── La prosa ─────────────────────────────────────────────────────────────────

describe('retenerGruposDeUnEscano — el sumario y el titular', () => {
  const NOMBRA = 'Compromís afirma que el Ayuntamiento dispone de herramientas para rescindir.'
  const NEUTRA =
    'En el debate se afirma que el Ayuntamiento dispone de herramientas para rescindir.'

  it('cada lado se juzga solo: se retiene el que nombra al grupo y se sirve el otro', () => {
    const { snapshot } = servir(
      ficha('f-a', [
        fila('summary', NOMBRA, NEUTRA),
        fila(
          'summary',
          NEUTRA,
          'Según la transcripción anterior, VOX manifestó que considera esencial.',
        ),
      ]),
    )
    expect(snapshot.items[0].corrections.map((c) => [c.original, c.corrected])).toEqual([
      [MARCA_GRUPO_RETENIDO, NEUTRA],
      [NEUTRA, MARCA_GRUPO_RETENIDO],
    ])
  })

  it('y las dos, si las dos lo nombran', () => {
    const { snapshot } = servir(
      ficha('f-a', [
        fila('title', 'Debate de los grupos PP y Compromís', 'Debate de PP, Compromís y otro'),
      ]),
    )
    expect(snapshot.items[0].corrections[0]).toMatchObject({
      original: MARCA_GRUPO_RETENIDO,
      corrected: MARCA_GRUPO_RETENIDO,
      grupoRetenido: true,
    })
  })

  it('lee la prosa con la tabla de alias: «Esquerra Unida» es EU-Podem, y sin acentos también', () => {
    const { snapshot } = servir(
      ficha('f-a', [
        fila('summary', "El grup d'Esquerra Unida demana un informe.", NEUTRA),
        fila('summary', 'El grupo compromis senala la existencia de un contrato.', NEUTRA),
      ]),
    )
    expect(snapshot.items[0].corrections.map((c) => c.original)).toEqual([
      MARCA_GRUPO_RETENIDO,
      MARCA_GRUPO_RETENIDO,
    ])
  })

  it('un sumario que sólo nombra grupos con varios escaños se sirve tal cual', () => {
    const entrada = fila('summary', 'El PP afirma una cosa y el PSOE otra distinta.', NEUTRA)
    const { snapshot } = servir(ficha('f-a', [entrada]))
    expect(snapshot.items[0].corrections[0]).toEqual(entrada)
  })
})

// ── Lo que no toca ───────────────────────────────────────────────────────────

describe('retenerGruposDeUnEscano — lo que no toca', () => {
  it('una cita es lo que se dijo, no una atribución nuestra: sus filas de texto se sirven tal cual', () => {
    // Real: f-2026-01-19-afi-5238db lleva una intervención que dice «des del grup
    // municipal de compromís», y la ficha la enseña. Y «podem» es también un verbo.
    const entradas = [
      fila(
        'quote.1.text',
        'anem a recolzar aquest pla',
        'Nosaltres des del grup municipal de compromís anem a recolzar aquest pla',
      ),
      fila(
        'quote.3.text',
        'no hem donat compte',
        "Nosaltres podem no haver donat compte d'aquest informe",
      ),
    ]
    const { snapshot } = servir(ficha('f-a', entradas))
    expect(snapshot.items[0].corrections).toEqual(entradas)
  })

  it('el motivo no se toca aunque nombre al grupo: es prosa, y la reescribe una persona', () => {
    const entrada = {
      ...fila('quote.0.speakerGroup', 'VOX', 'sin identificar'),
      reason: 'Esta ficha no lleva ninguna cita de VOX y se retira la atribución.',
    }
    const { snapshot } = servir(ficha('f-a', [entrada]))
    expect(snapshot.items[0].corrections[0].reason).toBe(entrada.reason)
    expect(snapshot.items[0].corrections[0].original).toBe(MARCA_GRUPO_RETENIDO)
  })

  it('ni la ficha: el titular, el sumario y las citas vigentes salen como estaban', () => {
    const f = ficha('f-a', [fila('quote.0.speakerGroup', 'VOX', 'sin identificar')])
    const { snapshot } = servir(f)
    const { corrections: _servidas, ...resto } = snapshot.items[0]
    const { corrections: _fuente, ...esperado } = f
    expect(resto).toEqual(esperado)
  })

  it('no toca la entrada: el fichero del repositorio sigue llevando la fila entera', () => {
    const entrada = snapshotDe(
      ficha('f-a', [fila('quote.2.speakerGroup', 'Compromís', 'sin identificar')]),
    )
    const antes = structuredClone(entrada)
    retenerGruposDeUnEscano(entrada, UN_ESCANO)
    expect(entrada).toEqual(antes)
  })

  it('aplicada dos veces da lo mismo: la marca no nombra a ningún grupo', () => {
    const una = servir(
      ficha('f-a', [
        fila('quote.2.speakerGroup', 'Compromís', 'sin identificar'),
        fila(
          'summary',
          'VOX afirma una cosa sobre los informes municipales.',
          'Se afirma una cosa.',
        ),
      ]),
    ).snapshot
    expect(retenerGruposDeUnEscano(una, UN_ESCANO).snapshot).toEqual(una)
  })
})

// ── Lo que cuenta, lo que dice y cuándo se niega ─────────────────────────────

describe('retenerGruposDeUnEscano — cuenta, lo dice y falla cerrado', () => {
  const dos = () =>
    servir(
      ficha('f-a', [
        fila('quote.2.speakerGroup', 'Compromís', 'sin identificar'),
        fila('quote.1.speakerGroup', 'PSOE', 'sin identificar'),
      ]),
      ficha('f-b', [fila('title', 'Debate de VOX y Compromís', 'Debate de Compromís y el PP')]),
    )

  it('cuenta filas y versiones por separado', () => {
    expect(dos().stats).toEqual({ filasDeBitacora: 2, versiones: 3 })
  })

  it('deja dicho en la copia servida qué falta, de qué grupos, por qué y dónde sigue', () => {
    const { gruposRetenidos } = dos().snapshot
    expect(gruposRetenidos).toMatchObject({
      grupos: UN_ESCANO,
      filasDeBitacora: 2,
      versiones: 3,
    })
    expect(gruposRetenidos.metodologia).toMatch(/^\/metodologia#/)
    // No es una retirada: el repositorio público la sigue llevando, y la nota lo dice.
    expect(gruposRetenidos.nota).toMatch(/repositorio/)
    expect(gruposRetenidos.nota).toMatch(/público/)
  })

  it('sin la composición de la corporación falla, en vez de concluir «ningún grupo»', () => {
    expect(() => retenerGruposDeUnEscano(snapshotDe(), null)).toThrow(/escaño/)
  })

  it('una corporación sin grupos de un escaño no retiene nada, y lo dice', () => {
    const entrada = fila('quote.2.speakerGroup', 'Compromís', 'sin identificar')
    const { snapshot, stats } = retenerGruposDeUnEscano(snapshotDe(ficha('f-a', [entrada])), [])
    expect(snapshot.items[0].corrections[0]).toEqual(entrada)
    expect(stats).toEqual({ filasDeBitacora: 0, versiones: 0 })
    expect(snapshot.gruposRetenidos.grupos).toEqual([])
  })
})

describe('filasQueNombranUnEscano — dónde queda un grupo de un escaño en la bitácora', () => {
  const f = ficha('f-a', [
    fila('quote.2.speakerGroup', 'Compromís', 'sin identificar'),
    fila('quote.1.text', 'dicho', 'des del grup municipal de compromís'),
    fila('summary', 'Un sumario neutro de prueba.', 'VOX afirma una cosa.'),
  ])

  it('señala cada lado por ficha, fila y lado; las citas no cuentan', () => {
    expect(filasQueNombranUnEscano(snapshotDe(f), UN_ESCANO)).toEqual([
      'f-a[0].original',
      'f-a[2].corrected',
    ])
  })

  it('en la copia servida no queda ninguno', () => {
    expect(filasQueNombranUnEscano(servir(f).snapshot, UN_ESCANO)).toEqual([])
  })
})

// ── Sobre los datos publicados ───────────────────────────────────────────────

const FUENTE = leer('public/data/pleno-findings.json')
const PROV = leer('public/data/finding-quote-provenance.json')
const OFFICIALS = leer('public/data/officials.json')
const UN_ESCANO_HOY = oneSeatBlocsOf(OFFICIALS)
const SERVIDA = copiaServidaDeHallazgos(FUENTE, PROV, OFFICIALS).snapshot

/**
 * El oráculo de estas pruebas, escrito aparte de la transformación: el alcance
 * sale de los campos que exporta el validador (`REDACTION_LABELS`,
 * `isSpeakerGroupField`), y el grupo, de la tabla de alias y de la composición.
 */
function ladosQueNombran(snapshot: {
  items: Array<{ id: string; corrections?: Array<Record<string, unknown>> }>
}) {
  const out: string[] = []
  for (const f of snapshot.items) {
    ;(f.corrections ?? []).forEach((c, i) => {
      const campo = String(c.field)
      if (!(isSpeakerGroupField(campo) || campo in REDACTION_LABELS)) return
      for (const lado of ['original', 'corrected']) {
        const grupos = findPartiesInText(String(c[lado] ?? '')) as string[]
        if (grupos.some((g) => UN_ESCANO_HOY?.includes(g))) out.push(`${f.id}[${i}].${lado}`)
      }
    })
  }
  return out
}

/**
 * Motivos publicados que nombran a un grupo de un escaño y que sólo puede
 * reescribir una persona (`correct-pleno-finding --amend-reason <i>`, firmado con
 * su nombre). Cada entrada dice hasta cuándo espera: pasado el plazo se pone
 * roja, y el día que se enmiende también, porque ya no se encuentra y hay que
 * quitarla de aquí.
 *
 * Los tres los midió la sesión del 30-09-2026. Los de c80e68 y cc8758 los firmó
 * un modelo el 21-09 a petición del editor, y además de nombrar a VOX dicen lo
 * que VOX sostiene en la transcripción vigente; el de c80e68 habla todavía de
 * «la única cita de VOX» de la ficha, cuya atribución se retiró el 30-09. Las
 * órdenes preparadas van en la descripción de la PR que añadió esta lista.
 */
const MOTIVOS_QUE_ESPERAN_A_UNA_PERSONA: Array<{ ruta: string; hasta: string }> = [
  { ruta: 'f-2026-01-19-cit-8b29a9[5].reason', hasta: '2026-10-14' },
  { ruta: 'f-2026-01-19-cit-c80e68[4].reason', hasta: '2026-10-14' },
  { ruta: 'f-2026-01-19-cit-cc8758[4].reason', hasta: '2026-10-14' },
]

describe('sobre los datos publicados', () => {
  it('la corporación de hoy tiene grupos de un escaño que buscar', () => {
    expect(UN_ESCANO_HOY, 'officials.json no da la composición').not.toBeNull()
    expect(UN_ESCANO_HOY?.length).toBeGreaterThan(0)
  })

  it('la criba mide algo: en el fichero del repositorio encuentra etiquetas y sumarios', () => {
    // Control. Sin él, un alias roto dejaría la prueba de abajo en verde sin
    // haber leído nada.
    const enLaFuente = ladosQueNombran(FUENTE)
    expect(enLaFuente.some((r) => /\.original$/.test(r))).toBe(true)
    expect(enLaFuente.length).toBeGreaterThan(10)
  })

  it('en la copia servida ninguna fila de la bitácora nombra a uno en lo que retiró o puso', () => {
    expect(ladosQueNombran(SERVIDA)).toEqual([])
  })

  it('la transformación señala lo mismo que el oráculo', () => {
    expect(filasQueNombranUnEscano(FUENTE, UN_ESCANO_HOY as string[])).toEqual(
      ladosQueNombran(FUENTE),
    )
  })

  it('ningún motivo servido nombra a uno, salvo los que esperan a una persona y dentro de su plazo', () => {
    const nombran: string[] = []
    for (const f of SERVIDA.items as Array<{
      id: string
      corrections?: Array<Record<string, unknown>>
    }>) {
      ;(f.corrections ?? []).forEach((c, i) => {
        const motivos: Array<[string, unknown]> = [
          [`${f.id}[${i}].reason`, c.reason],
          ...((c.reasonAmendments as Array<{ reason: string }> | undefined) ?? []).map(
            (a, j): [string, unknown] => [`${f.id}[${i}].reasonAmendments[${j}].reason`, a.reason],
          ),
        ]
        for (const [ruta, texto] of motivos) {
          const grupos = findPartiesInText(String(texto ?? '')) as string[]
          if (grupos.some((g) => UN_ESCANO_HOY?.includes(g))) nombran.push(ruta)
        }
      })
    }
    expect(nombran.sort()).toEqual(MOTIVOS_QUE_ESPERAN_A_UNA_PERSONA.map((e) => e.ruta).sort())
    const hoy = new Date().toISOString().slice(0, 10)
    const vencidos = MOTIVOS_QUE_ESPERAN_A_UNA_PERSONA.filter((e) => hoy > e.hasta)
    expect(
      vencidos.map((e) => e.ruta),
      'estos motivos siguen nombrando a un grupo de un escaño pasado su plazo: que los ' +
        'enmiende una persona (`correct-pleno-finding --amend-reason`) o que se renueve el plazo ' +
        'con su porqué',
    ).toEqual([])
  })
})
