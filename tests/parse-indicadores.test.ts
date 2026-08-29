import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCeselWorkbook } from '../src/scraper/coste-efectivo'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import {
  construirIndicadores,
  resolverCoste,
  resolverUnidad,
  MIN_PARES,
  situacion,
  DIVERGENCIA_EXTREMA,
} from '../src/scraper/indicadores'

const FIXTURE = join(__dirname, 'fixtures', 'cesel_2021_cv_slice.xlsx')
const CITA = 'https://www.hacienda.gob.es/cdi/power%20bi/cesel-2021.xlsx'

const rows = parseCeselWorkbook(readFileSync(FIXTURE), { anio: 2021 })
const mias = rows.filter((r) => r.ine === '46214')
const miembros = [...new Set(rows.map((r) => r.ine))].map((ine) => ({
  ine,
  nombre: rows.find((r) => r.ine === ine)!.nombre,
  poblacion: 0,
}))

const snap = construirIndicadores({
  municipio: { ine: '46214', nombre: 'Riba-roja de Túria', filas: mias },
  pares: { conjunto: 'cv-15k-40k', anios: [2021], miembros, filas: rows },
  anioBase: 2021,
  citaUrl: CITA,
})
const byId = (id: string) => snap.indicadores.find((i) => i.id === id)!

describe('scraper/indicadores', () => {
  it('evaluated something — every registry service produced an indicator', () => {
    expect(snap.indicadores.length).toBe(Object.keys(SERVICIOS).length)
    expect(snap.universe.serviciosEnRegistro).toBe(Object.keys(SERVICIOS).length)
    expect(snap.universe.conRatio).toBeGreaterThan(3)
  })

  it('computes the residuos ratio from the real cells', () => {
    const i = byId('a1621-coste-unitario')
    expect(i.numerador.valor).toBe(801040.17)
    expect(i.denominador.valor).toBe(11059.41)
    expect(i.valor).toBeCloseTo(801040.17 / 11059.41, 6)
    expect(i.unidad).toBe('€/t')
    // Tonnage is demand, not achievement — the card must not read as a score.
    expect(i.tier).toBe('carga')
  })

  // ── THE reproducer ────────────────────────────────────────────────────────
  // Without this rule the page publishes «Riba-roja suministra agua gratis, el
  // más barato del grupo», because the concessionaire's cost never touches the
  // council's books while the metres of network sit right there as a divisor.
  it('never turns a concession into a ratio or a peer position', () => {
    for (const id of ['a161-coste-unitario', 'a160-coste-unitario']) {
      const i = byId(id)
      expect(i.modoGestion).toBe('concesion')
      expect(i.numerador.estado).toBe('no-declarado')
      expect(i.numerador.motivo).toBe('concesion')
      expect(i.numerador.valor).toBeNull()
      expect(i.valor).toBeNull()
      expect(i.comparable).toBe(false)
      expect(i.pares).toBeNull()
      // The denominator is genuinely there; that is what makes the trap live.
      expect(i.denominador.estado).toBe('declarado')
    }
  })

  // La otra mitad de la regla de arriba, y la que faltaba. Que no se publique
  // un cociente es correcto; que se rotule «coste no declarado» no lo es,
  // porque el ministerio SÍ declaró. Un centinela que vale por dos hechos —«la
  // fuente calla» y «nosotros no dividimos»— es la regla 3 de DATA_INTEGRITY,
  // aquí sobre una superficie legalmente material.
  it('se lleva la cifra que decide NO dividir, para no atribuir su silencio a la fuente', () => {
    // Dos concesiones que NO son el mismo hecho, y hasta ahora salían idénticas.
    const conCifra = resolverCoste(
      [
        {
          ine: '46214',
          anio: 2024,
          programa: 'a161',
          modoGestion: 'concesion',
          costeTotal: 1_898_034.08,
        },
      ] as never,
      'a161',
      2024,
    )
    const muda = resolverCoste(
      [
        { ine: '46214', anio: 2024, programa: 'a161', modoGestion: 'concesion', costeTotal: 0 },
      ] as never,
      'a161',
      2024,
    )

    // La decisión no cambia en ninguno de los dos: sin cociente.
    expect(conCifra.valor).toBeNull()
    expect(muda.valor).toBeNull()
    expect(conCifra.motivo).toBe('concesion')
    expect(muda.motivo).toBe('concesion')

    // Lo que cambia es que ahora se distinguen.
    expect(
      conCifra.declaradoNoComparable,
      'el ministerio declaró y el motor tiraba la cifra sin mirarla',
    ).toBeCloseTo(1_898_034.08, 2)
    expect(muda.declaradoNoComparable, 'aquí la fuente sí calla').toBeUndefined()
  })

  it('la entrega de 2021 del fixture es de las mudas, y por eso el caso de arriba es sintético', () => {
    // Prueba de trabajo: el fixture es de 2021, uno de los cinco ejercicios en
    // los que Riba-roja declaró cero para el agua. Si algún día trae cifra, el
    // caso sintético de arriba deja de ser el único sitio donde se ejerce, y
    // conviene enterarse en vez de seguir creyendo que se prueba con datos
    // reales.
    for (const id of ['a161-coste-unitario', 'a160-coste-unitario']) {
      expect(byId(id).numerador.declaradoNoComparable).toBeUndefined()
    }
  })

  it('la ficha distingue los tres casos, no dos', () => {
    // Se comprueba sobre el JSX porque el defecto vivía ahí: el rótulo salía de
    // `valor === null`, que es binario, y publicaba el silencio de la fuente
    // sobre una decisión nuestra.
    const jsx = readFileSync(
      join(__dirname, '..', 'src/components/eficiencia/FilaServicio.jsx'),
      'utf8',
    )
    expect(jsx).toContain('declaradoNoComparable')
    expect(jsx).toContain('no comparables (concesión)')
    expect(jsx).toContain('sin coste declarado (concesión)')
    // Y el binario de antes ya no decide el rótulo.
    expect(jsx).not.toContain("i.numerador.valor === null\n            ? 'coste no declarado'")
  })

  it('refuses a ratio when the denominator is an undeclared zero', () => {
    // El transporte era el ejemplo natural —declaraba viajeros a cero— hasta
    // que su tarjeta pasó a dividir entre kilómetros de red, que sí declara.
    // La REGLA sigue necesitando prueba, así que el cero se construye: la
    // misma fila del autobús con su denominador puesto a 0. Una guarda probada
    // sólo contra el dato que hoy la dispara deja de estar probada cuando ese
    // dato se arregla.
    const conCero = mias.map((f) =>
      f.programa === 'a4411/440P'
        ? { ...f, unidades: f.unidades.map((u) => ({ ...u, valor: 0 })) }
        : f,
    )
    const snapCero = construirIndicadores({
      municipio: { ine: '46214', nombre: 'Riba-roja de Túria', filas: conCero },
      pares: { conjunto: 'cv-15k-40k', anios: [2021], miembros, filas: rows },
      anioBase: 2021,
      citaUrl: CITA,
    })
    const bus = snapCero.indicadores.find((i) => i.id === 'a4411-440p-coste-unitario')!
    expect(bus.numerador.estado).toBe('declarado') // the money is real
    expect(bus.numerador.valor).toBe(485975.77)
    expect(bus.denominador.estado).toBe('no-declarado')
    expect(bus.denominador.motivo).toBe('cero-sin-declarar')
    expect(bus.denominador.valor).toBeNull()
    expect(bus.valor).toBeNull()
    expect(bus.pares).toBeNull()
    expect(situacion(bus)).toBe('sin-unidad')
  })

  it('refuses a cost when a programa has contradictory duplicate rows', () => {
    // a1721 declares 1.964.894,95 AND 282.412,19 for the same programa, both
    // under direct management. Two live claims, no way to choose.
    const m = resolverCoste(mias, 'a1721/170P', 2021)
    expect(m.estado).toBe('no-declarado')
    expect(m.motivo).toBe('filas-duplicadas')
    expect(m.valor).toBeNull()
  })

  it('does not let a zero-cost row poison a real one', () => {
    // Parques y jardines declares 718.015,88 AND 0, both direct. A zero cost is
    // «no lo declaré» exactly as it is on the CE3 side — treating it as a rival
    // claim would apply the opposite rule to the two halves of one module, and
    // would blank a 700k€ service that has a good denominator and 60+ peers.
    const m = resolverCoste(mias, 'a171/170P', 2021)
    expect(m.estado).toBe('declarado')
    expect(m.valor).toBe(718015.88)
    expect(byId('a171-170p-coste-unitario').valor).toBeCloseTo(718015.88 / 740046, 6)
  })

  it('still refuses when every row for a programa declares zero', () => {
    const filas = mias
      .filter((f) => f.programa === 'a171/170P')
      .map((f) => ({ ...f, costeTotal: 0 }))
    const m = resolverCoste(filas, 'a171/170P', 2021)
    expect(m.estado).toBe('no-declarado')
    expect(m.motivo).toBe('cero-sin-declarar')
  })

  it('refuses a unit when the same attribute is declared twice differently', () => {
    const m = resolverUnidad(
      mias,
      'a1721/170P',
      2021,
      'Nº personas en plantilla adscritas al servicio',
    )
    expect(m.estado).toBe('no-declarado')
    expect(m.motivo).toBe('atributo-ambiguo')
    expect(m.valor).toBeNull()
  })

  it('reports a missing service as absent rather than as zero', () => {
    const m = resolverCoste(mias, 'programa-que-no-existe', 2021)
    expect(m.estado).toBe('no-declarado')
    expect(m.motivo).toBe('ausente')
  })

  it('never selects a code attribute as a denominator', () => {
    // a1621 offers `Periodicidad (1 - DI, 2 - AL…) = 5`. Dividing the annual
    // spend by 5 would render a beautifully formatted lie.
    for (const def of Object.values(SERVICIOS)) {
      expect(def.denominador).not.toMatch(/periodicidad/i)
      expect(def.denominador).not.toMatch(/^Nº personas en plantilla/i)
    }
  })

  it('keeps every registry denominator matchable against the real source text', () => {
    // A denominator with a typo fixed, or a stray space, silently matches
    // nothing and the service quietly disappears from the page.
    const atributos = new Set(rows.flatMap((r) => r.unidades.map((u) => u.atributo)))
    for (const [programa, def] of Object.entries(SERVICIOS)) {
      expect(atributos.has(def.denominador), `${programa}: ${def.denominador}`).toBe(true)
    }
  })

  it('holds the invariants across every indicator', () => {
    let conPares = 0
    for (const i of snap.indicadores) {
      if (i.valor !== null) {
        expect(i.numerador.estado).toBe('declarado')
        expect(i.denominador.estado).toBe('declarado')
      }
      // A magnitude that is not `declarado` must not carry a number at all.
      for (const m of [i.numerador, i.denominador]) {
        if (m.estado !== 'declarado') expect(m.valor).toBeNull()
      }
      if (i.pares) {
        conPares++
        expect(i.pares.modoGestion).toBe(i.modoGestion)
        expect(i.pares.n).toBeGreaterThanOrEqual(MIN_PARES)
        expect(i.pares.miembros).toHaveLength(i.pares.n)
        expect(i.pares.p25).toBeLessThanOrEqual(i.pares.mediana)
        expect(i.pares.mediana).toBeLessThanOrEqual(i.pares.p75)
        expect(i.comparable).toBe(true)
        expect(i.pares.miembros.every((m) => m.ine !== '46214')).toBe(true)
      } else {
        expect(i.comparable).toBe(false)
      }
      for (const p of i.serie) if (p.estado !== 'declarado') expect(p.valor).toBeNull()
      expect(i.numerador.fuente).toMatch(/^cesel:\d{4}:CE2:.+:Econ14$/)
      expect(i.denominador.fuente).toMatch(/^cesel:\d{4}:CE3:/)
    }
    // Assert the peer comparison actually ran for somebody. Without this the
    // whole block passes vacuously on a snapshot where nothing is comparable.
    expect(conPares).toBeGreaterThan(0)
  })

  it('warns when a peer comparison diverges enough to be a declaration artifact', () => {
    // Alumbrado lands at about a quarter of the peer median. Read naively that
    // says Riba-roja lights its streets four times more efficiently than 52
    // comparable towns; far more likely is that «puntos de luz» and what gets
    // booked against the programa are filled in differently town to town.
    const alumbrado = byId('a165-coste-unitario')
    expect(alumbrado.valor! / alumbrado.pares!.mediana).toBeLessThan(1 / DIVERGENCIA_EXTREMA)
    expect(alumbrado.caveats.some((c) => /mediana de sus pares/.test(c))).toBe(true)

    // …and a service sitting close to the median gets no such warning, so the
    // caveat means something when it does appear.
    const biblioteca = byId('a3321-330p-coste-unitario')
    const razon = biblioteca.valor! / biblioteca.pares!.mediana
    expect(razon).toBeGreaterThan(1 / DIVERGENCIA_EXTREMA)
    expect(razon).toBeLessThan(DIVERGENCIA_EXTREMA)
    expect(biblioteca.caveats.some((c) => /mediana de sus pares/.test(c))).toBe(false)
  })

  it('marks an entrega as implausible against that year\u2019s peers, without deleting it', () => {
    // El fixture es de 2021 y no trae serie multi-año, así que se comprueba la
    // regla sobre datos sintéticos: la fuente publica cifras que no son costes
    // —limpieza viaria a 67 millones de euros por m²— y borrarlas sería
    // reescribir al ministerio. Se marcan.
    const base = mias.filter((f) => f.programa === 'a163' && f.anio === 2021)
    const disparatado = base.map((f) => ({ ...f, anio: 2022, costeTotal: 6.7e10 }))
    const snap2 = construirIndicadores({
      municipio: { ine: '46214', nombre: 'Riba-roja', filas: [...mias, ...disparatado] },
      pares: {
        conjunto: 'cv-15k-40k',
        anios: [2021],
        miembros,
        filas: [
          ...rows,
          ...rows.filter((r) => r.ine !== '46214').map((r) => ({ ...r, anio: 2022 })),
        ],
      },
      citaUrl: CITA,
    })
    const limpieza = snap2.indicadores.find((i) => i.servicio === 'a163')!
    const punto = limpieza.serie.find((p) => p.anio === 2022)!
    expect(punto.valor).not.toBeNull() // no se borra
    expect(punto.atipico).toBe(true)
    expect(punto.medianaPares).toBeGreaterThan(0)
    expect(limpieza.caveats.some((c) => /inveros[ií]miles/.test(c))).toBe(true)
    // …y una entrega normal no se marca, para que la marca signifique algo.
    expect(limpieza.serie.find((p) => p.anio === 2021)?.atipico).toBeUndefined()
  })

  it('states its own coverage as a partition that adds up', () => {
    // A coverage strip whose buckets overlap or leave a remainder reads as
    // completeness with extra confidence. These five must tile the registry.
    const u = snap.universe
    expect(u.aniosDisponibles).toEqual([2021])
    expect(u.enConcesion).toBeGreaterThan(0)
    expect(u.conRatio + u.enConcesion + u.sinUnidad + u.sinCoste + u.noSePresta).toBe(
      u.serviciosEnRegistro,
    )
    expect(u.comparables).toBeLessThanOrEqual(u.conRatio)
  })

  it('classifies every indicator into exactly one situación', () => {
    const buckets = snap.indicadores.map((i) => situacion(i))
    expect(buckets).toHaveLength(snap.indicadores.length)
    expect(situacion(byId('a161-coste-unitario'))).toBe('concesion')
    // El transporte divide ahora entre kilómetros de red, que la entrega sí
    // declara; el cero de viajeros vive en su salvedad, no en su situación.
    expect(situacion(byId('a4411-440p-coste-unitario'))).toBe('con-ratio')
    expect(situacion(byId('a1621-coste-unitario'))).toBe('con-ratio')
  })
})

describe('scraper/indicadores · otro modo de gestión en la serie (regla 4)', () => {
  // Hoy ningún servicio declara cociente bajo un modo distinto del que titula
  // —los años de concesión de limpieza vienen sin coste—, así que la regla se
  // prueba construida: el mismo panel con el 2022 de residuos pasado a
  // otro régimen con coste declarado ('otra'): una concesión no serviría,
  // porque su coste lo rechaza la trampa 1 antes de llegar aquí. Una guarda sin instancia viva es la primera que se rompe sin
  // que nadie lo vea.
  const mias22 = [
    ...mias,
    ...mias
      .filter((f) => f.programa === 'a1621')
      .map((f) => ({ ...f, anio: 2022, modoGestion: 'otra' as const })),
  ]
  const pares22 = [
    ...rows,
    ...rows.filter((r) => r.ine !== '46214').map((r) => ({ ...r, anio: 2022 })),
  ]
  const snapOM = construirIndicadores({
    municipio: { ine: '46214', nombre: 'Riba-roja de Túria', filas: mias22 },
    pares: { conjunto: 'cv-15k-40k', anios: [2021, 2022], miembros, filas: pares22 },
    anioBase: 2021,
    citaUrl: CITA,
  })
  const residuos = snapOM.indicadores.find((i) => i.id === 'a1621-coste-unitario')!

  it('marca el año del otro régimen sin borrarlo, y con su modo', () => {
    const p22 = residuos.serie.find((p) => p.anio === 2022)!
    expect(p22.estado).toBe('declarado')
    expect(p22.otroModo).toBe('otra')
    // Y el año del régimen titular no lleva marca.
    expect(residuos.serie.find((p) => p.anio === 2021)!.otroModo).toBeUndefined()
  })

  it('no le calcula mediana contra pares de gestión directa', () => {
    // Los pares de 2022 siguen en directa; compararle la concesión contra
    // ellos es exactamente lo que la regla 4 prohíbe en horizontal.
    const p22 = residuos.serie.find((p) => p.anio === 2022)!
    expect(p22.medianaPares).toBeUndefined()
  })

  it('la tarjeta lo cuenta en una salvedad que cita la regla', () => {
    expect(residuos.caveats.some((c) => /otro modo de gestión/.test(c) && /regla 4/.test(c))).toBe(
      true,
    )
  })
})

describe('scraper/indicadores · banda plausible del percentil', () => {
  const comparables = snap.indicadores.filter((i) => i.pares)

  it('todo indicador comparable la publica, dentro de rango y conteniendo al puesto', () => {
    expect(comparables.length).toBeGreaterThan(3)
    for (const i of comparables) {
      const banda = i.pares!.percentilBanda
      expect(Array.isArray(banda), `${i.id} sin percentilBanda`).toBe(true)
      const [lo, hi] = banda
      expect(lo).toBeGreaterThanOrEqual(0)
      expect(hi).toBeLessThanOrEqual(100)
      expect(lo).toBeLessThanOrEqual(i.pares!.percentil)
      expect(hi).toBeGreaterThanOrEqual(i.pares!.percentil)
      // Una banda de anchura cero con n<100 sería el bootstrap sin remuestrear.
      expect(hi - lo, `${i.id}: banda degenerada`).toBeGreaterThan(0)
    }
  })

  it('es determinista: la misma entrada produce el mismo intervalo', () => {
    // La semilla se deriva de conjunto+programa+entrega. Un snapshot que
    // cambiara sin que cambie ningún dato sería indistinguible de una revisión
    // del ministerio, que es justo lo que check:eficiencia-findings vigila.
    const otra = construirIndicadores({
      municipio: { ine: '46214', nombre: 'Riba-roja de Túria', filas: mias },
      pares: { conjunto: 'cv-15k-40k', anios: [2021], miembros, filas: rows },
      anioBase: 2021,
      citaUrl: CITA,
    })
    for (const i of snap.indicadores) {
      const gemela = otra.indicadores.find((x) => x.id === i.id)!
      expect(gemela.pares?.percentilBanda).toEqual(i.pares?.percentilBanda)
    }
  })
})

describe('scraper/indicadores · CE4 supramunicipal', () => {
  const supra = (anio: number, programa: string) => ({
    anio,
    entePrincipal: 'Mc. Camp de Turia',
    programa,
    descripcion: 'Promoción del deporte',
    municipioServido: 'Riba-roja de Túria',
  })
  const construir = (filasSupra: ReturnType<typeof supra>[]) =>
    construirIndicadores({
      municipio: { ine: '46214', nombre: 'Riba-roja de Túria', filas: mias },
      pares: { conjunto: 'cv-15k-40k', anios: [2021], miembros, filas: rows },
      anioBase: 2021,
      citaUrl: CITA,
      supramunicipal: filasSupra,
    })

  it('la tarjeta cuyo programa casa gana la salvedad, con el ente por su nombre', () => {
    // CE4 publica el programa SIN prefijo: «1621» tiene que casar con a1621.
    const snap = construir([supra(2021, '1621')])
    const residuos = snap.indicadores.find((i) => i.id === 'a1621-coste-unitario')!
    expect(residuos.caveats.some((c) => /Mc\. Camp de Turia/.test(c))).toBe(true)
    expect(residuos.caveats.some((c) => /sólo la parte municipal/.test(c))).toBe(true)
    // Y ninguna otra tarjeta la hereda por vecindad.
    const otros = snap.indicadores.filter((i) => i.id !== 'a1621-coste-unitario')
    for (const i of otros) {
      expect(i.caveats.some((c) => /Camp de Turia/.test(c))).toBe(false)
    }
  })

  it('una fila de OTRO año no dispara nada: la salvedad habla del año que titula', () => {
    const snap = construir([supra(2019, '1621')])
    const residuos = snap.indicadores.find((i) => i.id === 'a1621-coste-unitario')!
    expect(residuos.caveats.some((c) => /Camp de Turia/.test(c))).toBe(false)
  })
})

describe('scraper/indicadores · euros constantes', () => {
  // Índice inventado y deliberadamente brusco: 2020 vale la mitad que 2021, así
  // que cualquier confusión de dirección salta a la vista en vez de esconderse
  // detrás de un 2 % de inflación real.
  const IPC = { 2020: 50, 2021: 100 }
  const conIpc = construirIndicadores({
    municipio: { ine: '46214', nombre: 'Riba-roja de Túria', filas: mias },
    pares: { conjunto: 'cv-15k-40k', anios: [2021], miembros, filas: rows },
    anioBase: 2021,
    citaUrl: CITA,
    ipc: IPC,
  })

  const conSerie = conIpc.indicadores.find((i) =>
    i.serie.some((p) => p.valor !== null && p.anio === 2021),
  )!

  it('deja quieto el año base: un euro de 2021 es un euro de 2021', () => {
    const p = conSerie.serie.find((x) => x.anio === 2021 && x.valor !== null)!
    expect(p.valorReal).toBeCloseTo(p.valor!, 6)
  })

  it('NO deflacta la comparación con pares, que es de un año contra sí mismo', () => {
    // El percentil y los cuartiles salen de las celdas del ministerio del año
    // base. Deflactarlos multiplicaría a todos por la misma constante sin mover
    // la posición, y las cifras publicadas dejarían de coincidir con la celda
    // que dicen citar.
    const sinIpc = snap.indicadores.find((i) => i.id === conSerie.id)!
    expect(conSerie.pares?.percentil).toBe(sinIpc.pares?.percentil)
    expect(conSerie.pares?.mediana).toBe(sinIpc.pares?.mediana)
    expect(conSerie.valor).toBe(sinIpc.valor)
  })

  it('deflacta la mediana de pares con el MISMO factor que la línea propia', () => {
    // Si una se deflacta y la otra no, la distancia entre ambas deja de
    // significar nada, que es el defecto que esto existe para impedir.
    const conMediana = conIpc.indicadores
      .flatMap((i) => i.serie)
      .find((p) => p.medianaPares !== undefined && p.valor !== null)
    expect(conMediana).toBeDefined()
    const factorValor = conMediana!.valorReal! / conMediana!.valor!
    const factorMediana = conMediana!.medianaParesReal! / conMediana!.medianaPares!
    expect(factorMediana).toBeCloseTo(factorValor, 9)
  })

  it('sin índice devuelve null, nunca el valor sin tocar', () => {
    // Un valorReal que coincide con el nominal es indistinguible de uno bien
    // deflactado. Sin índice se dice que no hay, y la página lo rotula.
    for (const p of snap.indicadores.flatMap((i) => i.serie)) {
      expect(p.valorReal ?? null).toBeNull()
    }
  })
})
