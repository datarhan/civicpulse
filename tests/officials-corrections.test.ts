import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateOfficialsCorrections,
  applyOfficialsCorrections,
  rawFromPublished,
  arrastraCesados,
  composeOfficialsSnapshot,
  upsertCorrection,
  retireCorrection,
  OfficialsCorrectionsError,
  MOTIVOS_BAJA,
  type OfficialsCorrections,
} from '../src/scraper/officials-corrections'
import { quoteAppearsIn } from '../src/scraper/quote-match'
import { parseCorporacion, type Official } from '../src/scraper/corporacion'

/**
 * El padrón de `officials.json` se raspa cada noche de la web del ayuntamiento,
 * y esa web puede ir con retraso respecto a lo que el propio Pleno ya acordó:
 * el 05-09-2026 seguía listando a una concejala que renunció en mayo de 2025 y
 * no listaba a quien tomó posesión en julio. Una corrección curada tiene que
 * sobrevivir al raspado siguiente, citar el acta literal y dejar rastro.
 *
 * La fixture es el texto del acta (pdftotext) del Pleno del 07-07-2025: cada
 * cita de las correcciones publicadas ha de estar en ella, literal.
 */
const ROOT = join(__dirname, '..')
const FIXTURE = join(__dirname, 'fixtures', 'acta_pleno_ribarroja_2025-07-07.txt')
const CORRECTIONS = join(ROOT, 'public', 'data', 'officials-corrections.json')
const OFFICIALS = join(ROOT, 'public', 'data', 'officials.json')

const acta = readFileSync(FIXTURE, 'utf8')
/** El fichero curado TAL COMO ESTÁ HOY. Sólo para comprobar que valida. */
const publicadas = JSON.parse(readFileSync(CORRECTIONS, 'utf8')) as OfficialsCorrections
/**
 * El estado con UNA baja y UN alta, congelado el 5-09-2026.
 *
 * El comportamiento se prueba contra esto y no contra el fichero vivo. El
 * 8-09-2026 la web se puso al día, el alta quedó absorbida y se retiró — y a la
 * vez se cayeron ocho pruebas que daban por hecho un `altas[0]`. Una suite que
 * lee el fichero curado se rompe cada vez que un curador hace su trabajo, que
 * es exactamente al revés de lo que tiene que pasar.
 *
 * Lo que sí sigue leyendo el fichero vivo es lo único que le corresponde: que
 * valide, y que sus citas estén en el acta.
 */
const corrections = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'officials-corrections_2026-09-05.json'), 'utf8'),
) as OfficialsCorrections
/**
 * El padrón publicado del 5-09-2026, congelado: el ÚLTIMO en el que la web iba
 * con retraso. Deshecha la mezcla da el raspado que las correcciones corrigen —
 * con la cesada dentro y sin el relevo—, que es el escenario que este bloque
 * describe y que ya no se puede sacar del fichero vivo, porque la web se puso
 * al día. Congelarlo es lo que hace que la suite siga probando lo que dice
 * probar en vez de lo que haya hoy.
 */
const published = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'officials_2026-09-05.json'), 'utf8'),
) as Parameters<typeof rawFromPublished>[0]
/** Y el fichero vivo, sólo para lo que le toca: que siga siendo coherente. */
const publicadoHoy = JSON.parse(readFileSync(OFFICIALS, 'utf8')) as Parameters<
  typeof rawFromPublished
>[0]

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))
/** El padrón tal como lo raspó el scraper, con las correcciones deshechas. */
const scraped = (): Official[] => rawFromPublished(clone(published))
const byParty = (list: Array<{ party: string }>) =>
  list.reduce<Record<string, number>>((acc, o) => {
    acc[o.party] = (acc[o.party] || 0) + 1
    return acc
  }, {})

describe('officials-corrections — la fixture del acta', () => {
  it('es el acta del Pleno del 07-07-2025 y no está vacía', () => {
    expect(acta.length).toBeGreaterThan(10_000)
    expect(acta).toContain('Expediente 3400/2025/GEN')
  })

  it('contiene literal cada cita de las correcciones publicadas', () => {
    const entries = [...publicadas.bajas, ...publicadas.altas, ...corrections.altas]
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) {
      expect(quoteAppearsIn(e.source.quote, acta), `${e.slug}: «${e.source.quote}»`).toBe(true)
    }
  })
})

describe('officials-corrections — validador', () => {
  it('acepta el fichero curado que hay publicado AHORA', () => {
    // Contra el fichero vivo, que es lo que se despliega. No exige un alta: el
    // 8-09-2026 la web se puso al día y la absorbida se retiró, y quedarse sin
    // altas es un estado legítimo, no un fallo.
    const v = validateOfficialsCorrections(publicadas)
    expect(v.bajas.length + v.altas.length).toBeGreaterThanOrEqual(1)
    expect(MOTIVOS_BAJA).toContain('renuncia')
  })

  it('acepta el estado congelado de dos entradas', () => {
    const v = validateOfficialsCorrections(corrections)
    expect(v.bajas).toHaveLength(1)
    expect(v.altas).toHaveLength(1)
  })

  it('rechaza una cita de menos de 20 caracteres', () => {
    const bad = clone(corrections)
    bad.bajas[0].source.quote = 'corta'
    expect(() => validateOfficialsCorrections(bad)).toThrow(OfficialsCorrectionsError)
  })

  it('rechaza una fecha que no sea ISO', () => {
    const bad = clone(corrections)
    bad.bajas[0].until = '2 de junio de 2025'
    expect(() => validateOfficialsCorrections(bad)).toThrow(/until/)
  })

  it('rechaza una URL de fuente relativa', () => {
    const bad = clone(corrections)
    bad.altas[0].source.url = '/files/acta.pdf'
    expect(() => validateOfficialsCorrections(bad)).toThrow(/source\.url/)
  })

  it('rechaza un motivo de baja fuera del enum', () => {
    const bad = clone(corrections)
    ;(bad.bajas[0] as { reason: string }).reason = 'dimision'
    expect(() => validateOfficialsCorrections(bad)).toThrow(/reason/)
  })

  it('rechaza una réplica sin texto', () => {
    const bad = clone(corrections)
    bad.replicas.push({ oficial: bad.bajas[0].slug, recibidaEl: '2026-09-05', texto: '' })
    expect(() => validateOfficialsCorrections(bad)).toThrow(/replicas\[0\]\.texto/)
  })

  it('rechaza un campo con forma de juicio a cualquier profundidad', () => {
    const bad = clone(corrections)
    ;(bad.altas[0].photo as Record<string, unknown>).valoracion = 'x'
    expect(() => validateOfficialsCorrections(bad)).toThrow(/valoracion/)
  })

  it('rechaza un slug que no salga del nombre', () => {
    const bad = clone(corrections)
    bad.altas[0].slug = 'otro-slug'
    expect(() => validateOfficialsCorrections(bad)).toThrow(/slug/)
  })

  it('rechaza el mismo slug en bajas y altas', () => {
    const bad = clone(corrections)
    bad.altas[0].slug = bad.bajas[0].slug
    bad.altas[0].name = bad.bajas[0].name
    expect(() => validateOfficialsCorrections(bad)).toThrow(/duplicad/)
  })

  it('rechaza un replacedBy que no tenga forma de slug', () => {
    // La regla cambió el 8-09-2026 y el motivo está en el módulo: exigir que
    // fuese un alta DE ESTE FICHERO se rompía en cuanto la web se ponía al día
    // y había que retirar el alta absorbida. Aquí se valida la FORMA; que el
    // relevo ocupe escaño se comprueba al componer, contra el padrón de verdad,
    // que es una comprobación más fuerte y no una más floja.
    const bad = clone(corrections)
    bad.bajas[0].replacedBy = 'Nadie Conocido'
    expect(() => validateOfficialsCorrections(bad)).toThrow(/replacedBy/)
  })

  it('acepta un replacedBy con forma de slug aunque su alta ya no esté en el fichero', () => {
    const ok = clone(corrections)
    ok.altas = []
    expect(() => validateOfficialsCorrections(ok)).not.toThrow()
  })
})

describe('officials-corrections — aplicadas sobre el padrón raspado', () => {
  const result = applyOfficialsCorrections(scraped(), corrections)

  it('deja la corporación en 21 escaños con la composición de 2023', () => {
    expect(result.officials.length).toBe(21)
    expect(byParty(result.officials)).toEqual({
      PSOE: 11,
      PP: 7,
      VOX: 1,
      'EU-Podem': 1,
      Compromís: 1,
    })
  })

  it('pasa a la concejala que renunció a formerOfficials, con su fecha de cese', () => {
    expect(result.officials.some((o) => o.slug === 'soraya-trejo-delgado')).toBe(false)
    const former = result.formerOfficials.find((o) => o.slug === 'soraya-trejo-delgado')
    expect(former?.estado).toBe('cesado')
    expect(former?.until).toBe('2025-06-02')
    expect(former?.reason).toBe('renuncia')
    expect(former?.replacedBy).toBe('pedro-tortajada-raga')
    expect(former?.source.url).toMatch(/^https:\/\//)
  })

  it('añade al sustituto con huecos honestos y una marca de procedencia', () => {
    const alta = result.officials.find((o) => o.slug === 'pedro-tortajada-raga')
    expect(alta).toBeDefined()
    expect(alta?.party).toBe('PP')
    expect(alta?.role).toBe('concejal')
    expect(alta?.portfolios).toEqual([])
    expect(alta?.email).toBeNull()
    expect(alta?.cvUrl).toBeNull()
    // Sin retrato en la fuente: cadena vacía MÁS el porqué, para que las
    // iniciales no se lean como una imagen que falló.
    expect(alta?.photoUrl).toBe('')
    expect(typeof alta?.photoNote).toBe('string')
    expect(alta?.photoNote?.length).toBeGreaterThan(20)
    expect(alta?.correccion?.tipo).toBe('alta')
    expect(alta?.correccion?.since).toBe('2025-07-07')
    // El logo es del partido, no de la persona: se copia del compañero de grupo.
    const pp = scraped().find((o) => o.party === 'PP')
    expect(alta?.partyLogoUrl).toBe(pp?.partyLogoUrl)
  })

  it('sienta al sustituto justo detrás del último raspado de su grupo', () => {
    const slugs = result.officials.map((o) => o.slug)
    const i = slugs.indexOf('pedro-tortajada-raga')
    expect(result.officials[i - 1].party).toBe('PP')
    expect(result.officials[i + 1]?.party ?? 'FIN').not.toBe('PP')
  })

  it('dice lo que hizo', () => {
    expect(result.applied).toEqual({ bajas: 1, altas: 1 })
  })

  it('es un punto fijo a través de rawFromPublished', () => {
    const again = applyOfficialsCorrections(rawFromPublished(result), corrections)
    expect(again).toEqual(result)
  })

  it('lanza si una baja nombra a alguien que el raspado no trae (corrección vieja o errónea)', () => {
    const c = clone(corrections)
    c.bajas[0].slug = 'alguien-que-no-existe'
    c.bajas[0].name = 'Alguien Que No Existe'
    expect(() => applyOfficialsCorrections(scraped(), c)).toThrow(/no está en el raspado/)
  })

  it('lanza si un alta ya figura en el raspado (la web se puso al día: retírala)', () => {
    const roster = scraped()
    const alta = corrections.altas[0]
    roster.push({
      slug: alta.slug,
      name: alta.name,
      honorific: alta.honorific,
      role: 'concejal',
      party: alta.party,
      portfolios: [],
      email: null,
      photoUrl: '',
      partyLogoUrl: '',
      cvUrl: null,
    })
    expect(() => applyOfficialsCorrections(roster, corrections)).toThrow(/ya figura en el raspado/)
  })

  it('sin fichero de correcciones deja el padrón intacto y lo dice', () => {
    const r = applyOfficialsCorrections(scraped(), null)
    expect(r.officials).toEqual(scraped())
    expect(r.formerOfficials).toEqual([])
    expect(r.applied).toEqual({ bajas: 0, altas: 0 })
  })

  it('composeOfficialsSnapshot deriva count y composition sólo de los vigentes', () => {
    const snap = composeOfficialsSnapshot(scraped(), corrections, {
      generatedAt: '2026-09-02T08:54:41.421Z',
      source: 'https://www.ribarroja.es/es/ayuntamiento/corporacion_municipal',
      correctionsFile: '/data/officials-corrections.json',
    })
    expect(snap.count).toBe(21)
    expect(snap.composition).toEqual(byParty(snap.officials))
    expect(snap.formerOfficials.length).toBe(corrections.bajas.length)
    expect(snap.corrections).toEqual({
      file: '/data/officials-corrections.json',
      generatedAt: corrections.generatedAt,
      bajas: corrections.bajas.length,
      altas: corrections.altas.length,
    })
    // El sello del padrón es el del RASPADO: recomponer no es volver a raspar.
    expect(snap.generatedAt).toBe('2026-09-02T08:54:41.421Z')
  })
})

describe('officials-corrections — la mitad pura del CLI', () => {
  it('upsertCorrection añade una entrada validada y mueve el sello', () => {
    const base = clone(corrections)
    const entry = clone(corrections.bajas[0])
    entry.slug = 'juan-boix-martinez'
    entry.name = 'Juan Boix Martínez'
    entry.replacedBy = null
    const next = upsertCorrection(base, 'baja', entry)
    expect(next.bajas.map((b) => b.slug)).toContain('juan-boix-martinez')
    expect(next.generatedAt > base.generatedAt).toBe(true)
    // El original no se toca: el CLI escribe lo que devuelve, no lo que recibió.
    expect(base.bajas.map((b) => b.slug)).not.toContain('juan-boix-martinez')
  })

  it('upsertCorrection rechaza un slug ya presente', () => {
    expect(() => upsertCorrection(clone(corrections), 'baja', clone(corrections.bajas[0]))).toThrow(
      /duplicad/,
    )
  })

  it('retireCorrection quita una entrada por slug y rechaza una desconocida', () => {
    const base = clone(corrections)
    const next = retireCorrection(base, corrections.bajas[0].slug)
    expect(next.bajas.map((b) => b.slug)).not.toContain(corrections.bajas[0].slug)
    expect(next.generatedAt > base.generatedAt).toBe(true)
    expect(() => retireCorrection(clone(corrections), 'nadie-conocido')).toThrow(/nadie-conocido/)
  })

  it('retireCorrection puede quitar un alta absorbida sin borrar el relevo que documenta', () => {
    // Antes esto reventaba: la baja dice «sustituida por X» y el validador
    // exigía que X fuese un alta del fichero, así que retirar el alta absorbida
    // era imposible sin borrar también el relevo — un hecho del acta.
    //
    // Ahora se puede, porque el relevo se comprueba contra el padrón compuesto.
    // Lo que NO se afloja: si nadie con ese slug ocupa escaño, `apply` revienta.
    const tras = retireCorrection(clone(corrections), corrections.altas[0].slug)
    expect(tras.altas).toHaveLength(0)
    expect(tras.bajas[0].replacedBy).toBe('pedro-tortajada-raga')
  })
})

/**
 * Cuando la web se pone al día, el cesado NO puede evaporarse.
 *
 * El 8-09-2026 el portal se mudó y la página nueva ya no lista a la concejala
 * que renunció. La baja curada exige que esté en el raspado —para eso es una
 * baja: la quita— así que `scrape:officials` se cayó entero con «no está en el
 * raspado … retírala». Y retirarla era la respuesta equivocada: la baja es lo
 * ÚNICO que construye `formerOfficials`, de modo que quitarla borraría del
 * padrón publicado a alguien que sí fue concejala, con su acta y su cita —y
 * `journalist-reports.json`, `journalist-assignments.json` y su `souls/…md`
 * siguen apuntando a ese slug.
 *
 * La pieza que faltaba ya existía para otra cosa: `rawFromPublished` devuelve
 * los cesados al padrón crudo, que es como `--apply` recompone sin raspar. Se
 * aplica lo mismo al raspado: se arrastran los cesados ya publicados, y la baja
 * vuelve a tener a quién dar de baja.
 */
describe('officials-corrections — el cesado sobrevive a que la web se ponga al día', () => {
  // El raspado REAL de la página mudada, no una imitación: ya no lista a la
  // cesada y sí lista al relevo, que es justo la combinación que rompía.
  const raspadoNuevo = (): Official[] =>
    parseCorporacion(
      readFileSync(join(__dirname, 'fixtures', 'corporacion_2026-09-08.html'), 'utf8'),
      { baseUrl: 'https://www.ribarroja.es' },
    )
  const sinLaCesada = raspadoNuevo

  it('sin arrastre, una baja ya absorbida por la web tumba el raspado', () => {
    expect(() => applyOfficialsCorrections(sinLaCesada(), corrections)).toThrow(
      OfficialsCorrectionsError,
    )
  })

  it('arrastrando los cesados publicados, la baja se aplica y el registro se conserva', () => {
    // Con el alta ya retirada, que es el estado al que lleva la mudanza: la
    // web lista al relevo, así que su alta sobra; la baja no, porque es lo
    // único que sostiene el registro de la cesada.
    const sinAlta = clone(corrections)
    sinAlta.altas = []
    const arrastrados = arrastraCesados(sinLaCesada(), publicadoHoy.formerOfficials ?? [])
    const { officials, formerOfficials } = applyOfficialsCorrections(arrastrados, sinAlta)

    expect(officials.some((o) => o.slug === 'soraya-trejo-delgado')).toBe(false)
    const cesada = formerOfficials.find((f) => f.slug === 'soraya-trejo-delgado')
    expect(cesada, 'la cesada sigue en el registro').toBeDefined()
    expect(cesada!.estado).toBe('cesado')
    expect(cesada!.until).toBe('2025-06-02')
    expect(cesada!.source?.url, 'con su acta detrás').toMatch(/^https?:\/\//)
  })

  it('no duplica a quien vuelve a estar en el raspado', () => {
    // Si la web volviera a listarla, el arrastre no puede meterla dos veces:
    // gana la fila raspada, que es la reciente.
    const conElla = [
      ...raspadoNuevo(),
      ...(publicadoHoy.formerOfficials ?? []).map((f) => ({ ...f }) as unknown as Official),
    ]
    const arrastrados = arrastraCesados(conElla, publicadoHoy.formerOfficials ?? [])
    expect(arrastrados.filter((o) => o.slug === 'soraya-trejo-delgado')).toHaveLength(1)
    expect(arrastrados).toHaveLength(conElla.length)
  })

  it('el arrastre no inventa nadie: sin cesados publicados devuelve el raspado tal cual', () => {
    const s = sinLaCesada()
    expect(arrastraCesados(s, [])).toEqual(s)
  })

  it('el relevo sobrevive a que su alta se retire: se comprueba contra el padrón, no contra el fichero', () => {
    // «A quién sustituyó» lo dice el acta, y sigue siendo verdad cuando la web
    // se pone al día. La regla vieja exigía que `replacedBy` fuese un alta DE
    // ESTE FICHERO, así que al retirar el alta absorbida el validador tumbaba
    // el fichero entero — y la salida era borrar el relevo, que es un hecho.
    // La comprobación se muda a donde se conoce el padrón de verdad.
    const sinAlta = clone(corrections)
    sinAlta.altas = []
    expect(() => validateOfficialsCorrections(sinAlta)).not.toThrow()

    const { officials, formerOfficials } = applyOfficialsCorrections(
      arrastraCesados(raspadoNuevo(), publicadoHoy.formerOfficials ?? []),
      sinAlta,
    )
    expect(officials.some((o) => o.slug === 'pedro-tortajada-raga')).toBe(true)
    expect(formerOfficials.find((f) => f.slug === 'soraya-trejo-delgado')!.replacedBy).toBe(
      'pedro-tortajada-raga',
    )
  })

  it('un replacedBy que no ocupa escaño revienta, aunque el fichero valide', () => {
    // La integridad referencial no se afloja, se traslada: apuntar a alguien
    // que no está en el padrón compuesto es exactamente el enlace colgando que
    // la regla vieja evitaba.
    const malRelevo = clone(corrections)
    malRelevo.altas = []
    malRelevo.bajas[0].replacedBy = 'quien-no-ocupa-ningun-escano'
    expect(() => validateOfficialsCorrections(malRelevo)).not.toThrow()
    expect(() =>
      applyOfficialsCorrections(
        arrastraCesados(raspadoNuevo(), publicadoHoy.formerOfficials ?? []),
        malRelevo,
      ),
    ).toThrow(OfficialsCorrectionsError)
  })

  it('una baja de alguien que NUNCA estuvo sigue siendo un error', () => {
    // La guarda no se afloja: arrastrar cesados conocidos no es lo mismo que
    // tolerar una corrección inventada, que es lo que venía a cazar.
    const inventada = clone(corrections)
    inventada.bajas = [{ ...inventada.bajas[0], slug: 'nadie-de-este-mundo' }]
    expect(() =>
      applyOfficialsCorrections(
        arrastraCesados(sinLaCesada(), publicadoHoy.formerOfficials ?? []),
        inventada,
      ),
    ).toThrow(OfficialsCorrectionsError)
  })
})
