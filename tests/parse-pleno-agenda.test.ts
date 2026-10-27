import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parsePlenoAgenda,
  reclasificaSecciones,
  tallyDepartments,
  type EnrichedPleno,
  type PlenoAgendaItem,
} from '../src/scraper/pleno-agenda'

const FIXTURE = join(__dirname, 'fixtures', 'rr_pleno_20_abril_2026.html')

describe('scraper/pleno-agenda — parsePlenoAgenda', () => {
  let result: ReturnType<typeof parsePlenoAgenda>

  beforeAll(() => {
    // HTML is latin-1 encoded on ribarroja.es; readFileSync returns a Buffer
    // that the parser normalises internally.
    const buf = readFileSync(FIXTURE)
    result = parsePlenoAgenda(buf)
  })

  it('returns a non-null agenda', () => {
    expect(result).not.toBeNull()
  })

  it('extracts the full agenda (at least 8 items for this fixture)', () => {
    expect(result!.items.length).toBeGreaterThanOrEqual(8)
  })

  it('every agenda item has a number, title, and optional dept/expediente', () => {
    for (const it of result!.items) {
      expect(typeof it.number).toBe('number')
      expect(it.number).toBeGreaterThan(0)
      expect(it.title.length).toBeGreaterThan(3)
      if (it.expediente) expect(it.expediente).toMatch(/\d+\/\d{4}/)
    }
  })

  it('recognises the classic pleno sections (resolutiva, informativa, ruegos)', () => {
    const sections = new Set(result!.items.map((i) => i.section))
    // At least one of these three known sections should appear
    expect(
      sections.has('resolutiva') || sections.has('informativa') || sections.has('ruegos'),
    ).toBe(true)
  })

  it('captures the "Ruegos y preguntas" item when present', () => {
    const has = result!.items.some((i) => /ruegos y preguntas/i.test(i.title))
    expect(has).toBe(true)
  })

  it('numbers are strictly increasing and unique', () => {
    const nums = result!.items.map((i) => i.number)
    const sorted = [...nums].sort((a, b) => a - b)
    expect(nums).toEqual(sorted)
    expect(new Set(nums).size).toBe(nums.length)
  })

  it('extracts at least one department label (TRANSPARENCIA / URBANISMO / INTEGRIDAD / ...)', () => {
    const withDept = result!.items.filter((i) => i.department)
    expect(withDept.length).toBeGreaterThanOrEqual(1)
    for (const it of withDept) {
      expect(it.department!.length).toBeGreaterThan(2)
      // Department is uppercase in source HTML; parser should preserve or normalise consistently.
      expect(it.department).toMatch(/^[A-ZÁÉÍÓÚÑ\s]+$/i)
    }
  })

  it('resolves a canonical departmentSlug for every recognised raw department', () => {
    const withDept = result!.items.filter((i) => i.department)
    for (const it of withDept) {
      // Every recognised uppercase department in the acta should map to a
      // canonical slug. If a new department appears on the fixture that
      // canonicalizeDepartment doesn't know about, extend departments.ts —
      // don't silently drop it.
      expect(it.departmentSlug, `no canonical slug for ${it.department}`).not.toBeNull()
      expect(it.departmentSlug).toMatch(/^[a-z-]+$/)
    }
  })

  it('items without a raw department leave departmentSlug null (never fabricated)', () => {
    const withoutDept = result!.items.filter((i) => !i.department)
    for (const it of withoutDept) {
      expect(it.departmentSlug).toBeNull()
    }
  })
})

// ── Regmeet upstream (post-2026-05 migration) ──────────────────────────────
// The Ayuntamiento moved its plenos to regmeet.com, which publishes the orden
// del día in <table id="tableOrdenDia"> instead of the old <div class="cuerpo">.
describe('scraper/pleno-agenda — parsePlenoAgenda (regmeet format)', () => {
  const FIXTURE = join(__dirname, 'fixtures', 'regmeet_pleno_sample.html')
  let result: ReturnType<typeof parsePlenoAgenda>

  beforeAll(() => {
    result = parsePlenoAgenda(readFileSync(FIXTURE))
  })

  it('parses the #tableOrdenDia agenda', () => {
    expect(result).not.toBeNull()
    // 5 numbered items (1, 2, 5, 10, 11); the bare speaker row is filtered out.
    expect(result!.items.map((i) => i.number)).toEqual([1, 2, 5, 10, 11])
  })

  it('filters out speaker rows (Cargo / Pertenece a) — agenda items only', () => {
    for (const it of result!.items) {
      expect(it.title).not.toMatch(/Cargo:|Pertenece a:/)
    }
  })

  it('strips the audio-player timestamp, outcome and inline CSS/JS from titles', () => {
    for (const it of result!.items) {
      expect(it.title).not.toMatch(/\(\d{2}:\d{2}:\d{2}\)/) // no timestamp
      expect(it.title).not.toMatch(/[{}]/) // no leaked CSS/JS braces
      expect(it.title).not.toMatch(/\bAprobada\b/) // outcome dropped
    }
  })

  it('extracts expedientes (labelled and leading moción codes)', () => {
    const byNum = Object.fromEntries(result!.items.map((i) => [i.number, i]))
    expect(byNum[2].expediente).toBe('717/2026/GEN')
    expect(byNum[5].expediente).toBe('13/2026/PGRU') // leading moción code
    expect(byNum[1].expediente).toBeNull()
  })

  it('infers the department from the item title (regmeet does not tag it)', () => {
    const byNum = Object.fromEntries(result!.items.map((i) => [i.number, i]))
    expect(byNum[2].departmentSlug).toBe('urbanismo')
    expect(byNum[5].departmentSlug).toBe('vivienda')
    expect(byNum[10].departmentSlug).toBe('hacienda')
    expect(byNum[1].departmentSlug).toBeNull() // "Aprobación Acta anterior" — no dept keyword
  })

  it('classifies sections (resolutiva / informativa / ruegos)', () => {
    const byNum = Object.fromEntries(result!.items.map((i) => [i.number, i]))
    expect(byNum[2].section).toBe('resolutiva')
    expect(byNum[10].section).toBe('informativa') // "Dación cuenta …"
    expect(byNum[11].section).toBe('ruegos') // "Ruegos y preguntas"
  })
})

// ── La parte de un punto, en valenciano ────────────────────────────────────
/**
 * regmeet no marca la parte de cada punto, como hacía la sede vieja con «PARTE
 * RESOLUTIVA»: se deduce del título, y la regla sólo sabía castellano. La sesión
 * del 20-04-2026 se convocó en valenciano, y en la pestaña del orden del día sus
 * tres informes («Dació compte…», «Donar compte…») y «Precs i preguntes» salían
 * «Resolutiva»: un informe que no se vota, rotulado como un punto que se decide.
 */
describe('scraper/pleno-agenda — la parte de un punto en valenciano', () => {
  const FIXTURE = join(__dirname, 'fixtures', 'regmeet_sesion_2026-04-20.html')
  let porNumero: Record<number, PlenoAgendaItem>

  beforeAll(() => {
    const r = parsePlenoAgenda(readFileSync(FIXTURE))
    porNumero = Object.fromEntries((r?.items ?? []).map((i) => [i.number, i]))
  })

  it('lee los doce puntos de la convocatoria', () => {
    expect(Object.keys(porNumero).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('«Dació compte» y «Donar compte» son informes, no puntos que se deciden', () => {
    for (const n of [8, 9, 10, 11]) {
      expect(porNumero[n].section, porNumero[n].title).toBe('informativa')
    }
  })

  it('«Precs i preguntes» son los ruegos y preguntas', () => {
    expect(porNumero[12].section).toBe('ruegos')
  })

  it('lo que se vota sigue en la parte resolutiva, la moción incluida', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      expect(porNumero[n].section, porNumero[n].title).toBe('resolutiva')
    }
  })
})

/**
 * Lo ya guardado no vuelve a pasar por el parser: de las sesiones del
 * snapshot sólo las seis más recientes se vuelven a pedir cada noche, y las
 * convocadas en valenciano son anteriores. Arreglar la regla del parser sólo
 * habría corregido las sesiones que nadie iba a releer, así que la parte se
 * re-deriva del título guardado, como ya se hace con el departamento.
 */
describe('reclasificaSecciones — lo que el snapshot ya guarda', () => {
  const FIXTURE = join(__dirname, 'fixtures', 'plenos-agendas_2026-10-10.json')
  const guardadas = (): EnrichedPleno[] => JSON.parse(readFileSync(FIXTURE, 'utf8')).plenos

  it('saca de «resolutiva» los informes y los ruegos de una sesión en valenciano', () => {
    const { plenos } = reclasificaSecciones(guardadas())
    const sesion = plenos.find((p) => p.id === 'rx4hb4')!
    const parte = Object.fromEntries(sesion.agenda.map((i) => [i.number, i.section]))
    expect(parte[12]).toBe('informativa') // «Expedient 4959/2025/GEN, Donar compte de l'adhesió…»
    expect(parte[13]).toBe('informativa') // «Donar compte de les Resolucions…»
    expect(parte[14]).toBe('ruegos') // «Precs i preguntes»
    expect(parte[6]).toBe('resolutiva') // una moció es vota
    expect(sesion.hasRuegos).toBe(true)
  })

  it('dice cuántos puntos cambió, y una segunda pasada no cambia ninguno', () => {
    const primera = reclasificaSecciones(guardadas())
    expect(primera.reclasificados).toBe(3)
    expect(reclasificaSecciones(primera.plenos).reclasificados).toBe(0)
  })

  it('no toca las sesiones en castellano, que ya salían bien', () => {
    const antes = guardadas().find((p) => p.id === '1sqj7is')!
    const despues = reclasificaSecciones(guardadas()).plenos.find((p) => p.id === '1sqj7is')!
    expect(despues.agenda.map((i) => i.section)).toEqual(antes.agenda.map((i) => i.section))
  })

  it('nunca mete un punto en «resolutiva»: la parte que trajo la convocatoria manda', () => {
    // La sede vieja marcaba la parte con su cabecera, y en ella una moción iba
    // en la de información y control. Que el título no lo diga no la mueve.
    const fila: EnrichedPleno = {
      id: 'x',
      date: '2026-01-01',
      title: 'x',
      kind: 'ordinario',
      link: '',
      agenda: [
        {
          number: 1,
          title: 'Moción del Grupo Municipal X sobre Y',
          section: 'informativa',
          department: null,
          departmentSlug: null,
          expediente: null,
        },
      ],
      agendaCount: 1,
      departments: [],
      hasRuegos: false,
    }
    const { plenos, reclasificados } = reclasificaSecciones([fila])
    expect(plenos[0].agenda[0].section).toBe('informativa')
    expect(reclasificados).toBe(0)
  })

  it('no muta lo que recibe', () => {
    const entrada = guardadas()
    const copia = JSON.parse(JSON.stringify(entrada))
    reclasificaSecciones(entrada)
    expect(entrada).toEqual(copia)
  })
})

// ---------------------------------------------------------------------------
/**
 * El recuento de departamentos y, sobre todo, su DENOMINADOR.
 *
 * La tarjeta de `/plenos` pone «399 puntos» de rótulo y debajo una fila de
 * departamentos que suma 93. El comentario del propio guión guarda la versión
 * ANTERIOR de este fallo —«Contratación · 5» bajo «377 puntos» contando
 * sesiones en vez de puntos—; se arregló la unidad del numerador y nadie miró
 * el denominador. De los 399 puntos, 109 llevan departamento: el 73 % no lleva
 * ninguno, y la página no lo dice en ningún sitio.
 *
 * Por eso el recuento devuelve `itemsWithDepartment` junto a `itemsTotal`: sin
 * los dos no se puede escribir la frase honesta, y una capa que enseña una
 * fracción de su dominio tiene que decirlo.
 */
describe('tallyDepartments — el denominador de la tarjeta', () => {
  const item = (n: number, slug: string | null) => ({
    number: n,
    title: `Punto ${n}`,
    section: 'resolutiva' as const,
    department: slug,
    departmentSlug: slug as never,
    expediente: null,
  })
  const pleno = (id: string, items: ReturnType<typeof item>[]) => ({
    id,
    date: '2026-01-01',
    title: id,
    kind: 'ordinario',
    link: '',
    agenda: items,
    agendaCount: items.length,
    departments: [],
    hasRuegos: false,
  })

  it('separa los puntos con departamento de los puntos totales', () => {
    const t = tallyDepartments([
      pleno('a', [item(1, 'hacienda'), item(2, null), item(3, null)]),
      pleno('b', [item(1, 'hacienda'), item(2, 'cultura'), item(3, null)]),
    ])
    expect(t.itemsTotal).toBe(6)
    expect(t.itemsWithDepartment).toBe(3)
  })

  it('cuenta PUNTOS, no sesiones — el fallo que el guión ya documenta', () => {
    const t = tallyDepartments([
      pleno('a', [item(1, 'hacienda'), item(2, 'hacienda')]),
      pleno('b', [item(1, 'hacienda')]),
    ])
    expect(t.topDepartments[0]).toMatchObject({ department: 'hacienda', count: 3 })
  })

  it('ordena de mayor a menor y se queda con doce', () => {
    const muchos = Array.from({ length: 15 }, (_, i) =>
      pleno(
        `p${i}`,
        Array.from({ length: i + 1 }, (_, j) => item(j, `dep-${i}`)),
      ),
    )
    const t = tallyDepartments(muchos)
    expect(t.topDepartments).toHaveLength(12)
    expect(t.topDepartments[0].count).toBe(15)
    expect(t.topDepartments.map((d) => d.count)).toEqual(
      [...t.topDepartments.map((d) => d.count)].sort((a, b) => b - a),
    )
  })

  it('sin ningún departamento devuelve cero, no una lista inventada', () => {
    const t = tallyDepartments([pleno('a', [item(1, null), item(2, null)])])
    expect(t.itemsTotal).toBe(2)
    expect(t.itemsWithDepartment).toBe(0)
    expect(t.topDepartments).toEqual([])
  })
})
