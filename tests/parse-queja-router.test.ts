import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  classifyQueja,
  routeQueja,
  diasTranscurridos,
  plazoDeResolucion,
  problemasDelCalendario,
  relojDelPlazo,
  venceEnMeses,
  AMBITOS_DEL_FESTIVO,
  FESTIVOS_DE_LA_SEDE,
  LEGAL_CATALOG,
  ESCALATION_PROFILES,
  type FestivoDeLaSede,
  type FestivosPorAnio,
  type OfficialsSnapshot,
  type QuejaInput,
  type TimeLimit,
} from '../src/scraper/queja-router'

const officials: OfficialsSnapshot = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/officials.json'), 'utf8'),
)

describe('queja-router — classifyQueja', () => {
  it('classifies pothole/bache → via_publica', () => {
    const c = classifyQueja({
      title: 'Bache profundo',
      detail: 'Hay un bache enorme en la calle San Vicente que lleva meses sin arreglar',
    })
    expect(c.category).toBe('via_publica')
    expect(c.confidence).toBe('high')
  })

  it('classifies overflowing bin → limpieza', () => {
    const c = classifyQueja({
      title: 'Contenedor desbordado',
      detail: 'Los contenedores de la calle Mayor llevan 3 días desbordados',
    })
    expect(c.category).toBe('limpieza')
  })

  it('classifies broken streetlight → alumbrado', () => {
    const c = classifyQueja({
      title: 'Farola averiada',
      detail: 'La farola del parque lleva 2 semanas fundida',
    })
    expect(c.category).toBe('alumbrado')
  })

  it('classifies noise complaint → ruido', () => {
    const c = classifyQueja({
      title: 'Ruido nocturno',
      detail: 'Un local genera ruidos por la noche que impiden dormir',
    })
    expect(c.category).toBe('ruido')
  })

  it('classifies transparency request → transparencia', () => {
    const c = classifyQueja({
      title: 'Solicitud de acceso a información pública',
      detail: 'He pedido copia de los contratos de limpieza y no me contestan',
    })
    expect(c.category).toBe('transparencia')
  })

  it('classifies licencia de obra → urbanismo', () => {
    const c = classifyQueja({
      title: 'Licencia de obra menor',
      detail: 'Solicito licencia de obra menor para reforma de cocina',
    })
    expect(c.category).toBe('urbanismo')
  })

  it('classifies park request → zonas_verdes', () => {
    const c = classifyQueja({
      title: 'Parque descuidado',
      detail: 'El parque del Cid tiene el césped seco y los juegos infantiles rotos',
    })
    expect(c.category).toBe('zonas_verdes')
  })

  it('falls back to otros when no keyword matches', () => {
    const c = classifyQueja({
      title: 'Asunto genérico',
      detail: 'Me gustaría comentar un tema variopinto sin categoría clara',
    })
    expect(c.category).toBe('otros')
    expect(c.confidence).toBe('low')
  })

  it('respects explicit category override', () => {
    const c = classifyQueja({
      title: 'Bache',
      detail: 'bache en la calle',
      category: 'limpieza',
    })
    expect(c.category).toBe('limpieza')
    expect(c.confidence).toBe('high')
  })
})

describe('queja-router — routeQueja concejalía matching', () => {
  it('routes via_publica to Urbanismo/Obra Pública (Teresa Pozuelo)', () => {
    const r = routeQueja(
      { title: 'Bache profundo', detail: 'Bache en la avenida principal' },
      officials,
    )
    expect(r.concejalia.responsible?.name).toMatch(/Teresa Pozuelo/)
    expect(r.concejalia.area.toLowerCase()).toMatch(/obra|urbanismo/)
  })

  it('routes transparencia to Participación y transparencia (María Esther Gómez)', () => {
    const r = routeQueja(
      {
        title: 'Solicitud de acceso a información',
        detail: 'Pido copia de los contratos de alumbrado',
      },
      officials,
    )
    expect(r.concejalia.responsible?.name).toMatch(/María Esther Gómez/)
    expect(r.concejalia.area.toLowerCase()).toMatch(/transparencia/)
  })

  it('routes limpieza/residuos to Servicios públicos (Rafael Gómez)', () => {
    const r = routeQueja(
      { title: 'Basura acumulada', detail: 'Contenedores desbordados toda la semana' },
      officials,
    )
    expect(r.concejalia.responsible?.name).toMatch(/Rafael Gómez/)
  })

  it('routes ruido to Seguridad (Raquel Pamblanco)', () => {
    const r = routeQueja(
      { title: 'Ruido nocturno', detail: 'Local con música alta por la noche' },
      officials,
    )
    expect(r.concejalia.responsible?.name).toMatch(/Raquel Pamblanco/)
  })

  it('falls back to the alcalde when no portfolio matches', () => {
    // Pass a synthetic officials snapshot with only an alcalde.
    const minimal: OfficialsSnapshot = {
      generatedAt: officials.generatedAt,
      source: officials.source,
      count: 1,
      composition: { PSOE: 1 },
      officials: [officials.officials.find((o) => o.role === 'alcalde')!],
    }
    const r = routeQueja(
      { title: 'Algo raro', detail: 'Un tema sin encaje en ninguna concejalía conocida' },
      minimal,
    )
    expect(r.concejalia.responsible?.role).toBe('alcalde')
    expect(r.concejalia.alcaldeFallback.name).toMatch(/Robert Raga/)
  })

  it('always exposes the alcaldeFallback for accountability', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    expect(r.concejalia.alcaldeFallback.name).toMatch(/Robert Raga/)
  })
})

describe('queja-router — legal basis', () => {
  it('cites LPACAP art. 21.3 for the 3-month default', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache en la calle' }, officials)
    const art213 = r.legalBasis.find((l) => l.article.includes('21.3'))
    expect(art213).toBeDefined()
    expect(art213?.url).toMatch(/boe\.es.*BOE-A-2015-10565/)
  })

  it('cites LPACAP art. 21.4 for the 10-day acuse', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache en la calle' }, officials)
    const art214 = r.legalBasis.find((l) => l.article.includes('21.4'))
    expect(art214).toBeDefined()
  })

  it('cites Ley 19/2013 art. 20 for transparencia', () => {
    const r = routeQueja(
      {
        title: 'Derecho de acceso',
        detail: 'Solicito copia de los contratos de obras del 2025',
      },
      officials,
    )
    const art20 = r.legalBasis.find((l) => l.law.includes('19/2013') && l.article.includes('20'))
    expect(art20).toBeDefined()
    expect(art20?.url).toMatch(/BOE-A-2013-12887/)
  })

  it('cites LRBRL art. 18 for vecino rights on any queja', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    const a18 = r.legalBasis.find((l) => l.law.includes('7/1985') && l.article.includes('18'))
    expect(a18).toBeDefined()
  })
})

/**
 * El plazo de resolución va en MESES, que es como lo fija la norma (#62).
 *
 * El art. 21.3 LPACAP dice «tres meses» y el art. 20 de la Ley 19/2013 «un
 * mes»; aquí estaban escritos como 90 y 30 días. No es lo mismo: el art. 30.4
 * manda contar los meses de fecha a fecha, así que tres meses desde el 1 de
 * diciembre vencen el 1 de marzo —90 días serían el 2— y desde el 1 de enero de
 * un año bisiesto vencen el 1 de abril, que son 91. El contador de días
 * restantes de /quejas/:id se desviaba por ahí, y la página además repetía a
 * mano los dos números en vez de leerlos.
 */
describe('queja-router — time limits and silencio', () => {
  it('el plazo de resolución se publica en la unidad que usa la norma', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    const acuse = r.timeLimits.find((t) => t.kind === 'acuse')
    const res = r.timeLimits.find((t) => t.kind === 'resolucion')
    // El acuse sí lo fija el art. 21.4 en días: «en el plazo de diez días».
    expect(acuse).toMatchObject({ unit: 'days', amount: 10 })
    expect(res).toMatchObject({ unit: 'months', amount: 3 })
    expect(res?.basis.article).toMatch(/21\.3/)
  })

  it('defaults silencio to negativo for a bare queja (art. 24 LPACAP)', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    expect(r.silencio).toBe('negativo')
  })

  it('transparencia resuelve en 1 mes (art. 20 Ley 19/2013)', () => {
    const r = routeQueja(
      { title: 'Acceso a información pública', detail: 'pido copia de contratos' },
      officials,
    )
    const res = r.timeLimits.find((t) => t.kind === 'resolucion')
    expect(res).toMatchObject({ unit: 'months', amount: 1 })
    expect(res?.basis.law).toMatch(/19\/2013/)
  })

  it('`plazoDeResolucion` es lo que leen las páginas, y dice lo mismo que la ruta', () => {
    // La ficha de una queja no tiene la instantánea de cargos a mano, así que
    // necesita leer el plazo sin enrutar. Si las dos vías pudieran discrepar,
    // volveríamos a tener el número escrito dos veces, que es el hallazgo.
    for (const q of [
      { title: 'Bache', detail: 'bache' },
      { title: 'Acceso a información pública', detail: 'pido copia de contratos' },
    ]) {
      const r = routeQueja(q, officials)
      const suelto = plazoDeResolucion(r.category, q)
      expect(suelto).toEqual(r.timeLimits.find((t) => t.kind === 'resolucion'))
    }
  })

  it('`venceEnMeses` cuenta de fecha a fecha (art. 30.4 LPACAP)', () => {
    // Da el ÚLTIMO día del plazo, un día y no un instante: el plazo «concluirá
    // el mismo día», así que ese día entero es todavía plazo.
    expect(venceEnMeses('2026-12-01T09:00:00Z', 3)).toBe('2027-03-01')
    expect(venceEnMeses('2026-01-15T09:00:00Z', 1)).toBe('2026-02-15')
  })

  it('sin día equivalente en el mes de vencimiento, el último día del mes', () => {
    // «Si en el mes de vencimiento no hubiera día equivalente a aquel en que
    // comienza el cómputo, se entenderá que el plazo expira el último día del
    // mes» — art. 30.4. Sin esto, JavaScript desborda al mes siguiente y el 31
    // de enero más un mes daría el 3 de marzo.
    expect(venceEnMeses('2026-01-31T09:00:00Z', 1)).toBe('2026-02-28')
    expect(venceEnMeses('2028-01-31T09:00:00Z', 1)).toBe('2028-02-29')
    expect(venceEnMeses('2026-05-31T09:00:00Z', 1)).toBe('2026-06-30')
  })

  it('en días, tres meses NO son siempre noventa', () => {
    // La medida del hallazgo: el mismo plazo legal dura distinto según cuándo
    // se registre, y por eso no puede vivir como una constante. Los dos acaban
    // en día hábil, así que la diferencia es sólo la del art. 30.4.
    const limite = plazoDeResolucion('via_publica')
    const dias = (desde: string) => {
      const r = relojDelPlazo(limite, desde, Date.parse('2026-01-20T10:00:00Z'))
      return r.cuenta === 'calculada' ? r.dias : r.cuenta
    }
    const enero = dias('2026-01-15 10:00:00') // al miércoles 15 de abril
    const mayo = dias('2026-05-30 22:30:00') // 31 de mayo en Madrid, al lunes 31 de agosto
    expect(enero).toBe(90)
    expect(mayo).toBe(92)
    expect(mayo).not.toBe(enero)
  })

  it('silencio positivo for licencia de obra menor', () => {
    const r = routeQueja(
      { title: 'Licencia de obra menor', detail: 'pido licencia para reforma interior' },
      officials,
    )
    expect(r.silencio).toBe('positivo')
  })
})

/**
 * El plazo en el calendario de la sede, y hasta el final de su último día.
 *
 * Medido el 28-09-2026 contra el código de entonces, que contaba en días de UTC
 * y en tandas de 24 horas desde la hora del registro:
 * - una queja registrada a las 11:00 de Madrid pasaba a silencio a las 12:00 de
 *   su último día, doce horas antes de que el plazo acabara; una registrada
 *   pasada la medianoche de Madrid, casi un día antes;
 * - el recibo real de la sede «Fecha de Registro 28/09/2026 0:00:01» (en UTC,
 *   `2026-09-27 22:00:01`) contaba desde el 27: vencía el 27-12 y no el 28-12.
 *
 * El art. 30.4 cuenta de fecha a fecha y el plazo «concluirá el mismo día»: ese
 * día entero es plazo, y el silencio empieza a las 00:00 del siguiente en Madrid
 * (art. 31.2, la hora oficial de la sede).
 */
describe('queja-router — el plazo en el calendario de la sede', () => {
  const tresMeses = plazoDeResolucion('via_publica')
  const antes = process.env.TZ
  afterEach(() => {
    if (antes === undefined) delete process.env.TZ
    else process.env.TZ = antes
  })
  // Lo que se cuenta no puede depender de dónde corra: el bot en Fly (UTC), la CI
  // (UTC), el portátil y los navegadores (Madrid). Se afirma el desfase de cada
  // zona para que el bucle no pruebe cuatro veces la del equipo.
  const DESFASE_EN_ENERO: Record<string, number> = {
    UTC: 0,
    'Europe/Madrid': -60,
    'America/New_York': 300,
    'Pacific/Kiritimati': -840,
  }
  function enCadaZona(prueba: () => void) {
    for (const [zona, desfase] of Object.entries(DESFASE_EN_ENERO)) {
      process.env.TZ = zona
      expect(new Date(2026, 0, 15, 12).getTimezoneOffset(), `no se aplicó ${zona}`).toBe(desfase)
      prueba()
    }
  }

  it('empieza el día de la sede en que entra la queja, no el de UTC', () => {
    enCadaZona(() => {
      // El recibo del domingo 27-09-2026: «Fecha de Registro 28/09/2026 0:00:01».
      expect(venceEnMeses('2026-09-27 22:00:01', 3)).toBe('2026-12-28')
      expect(venceEnMeses('2026-09-27 22:00:01', 1)).toBe('2026-10-28')
      // Las 00:30 del 31 de mayo en Madrid: el 31 de agosto, no el 30.
      expect(venceEnMeses('2026-05-30 22:30:00', 3)).toBe('2026-08-31')
      // Las 00:15 del 1 de diciembre en Madrid: el 1 de marzo, no el 28 de febrero.
      expect(venceEnMeses('2026-11-30 23:15:00', 3)).toBe('2027-03-01')
    })
  })

  it('los días del plazo son días del calendario de la sede', () => {
    enCadaZona(() => {
      // Entra el 31 de enero (00:30 en Madrid) y vence el 30 de abril: 89 días.
      // Contado desde el 30 de enero de UTC salían 90.
      const dias = (desde: string) => {
        const r = relojDelPlazo(tresMeses, desde, Date.parse('2026-02-01T10:00:00Z'))
        return r.cuenta === 'calculada' ? r.dias : r.cuenta
      }
      expect(dias('2026-01-30 23:30:00')).toBe(89)
      expect(dias('2026-09-27 22:00:01')).toBe(91)
    })
  })

  it('el último día es plazo entero: se agota a la medianoche de Madrid', () => {
    enCadaZona(() => {
      // 11:00 del 15 de enero en Madrid; vence el miércoles 15 de abril, hábil.
      const desde = '2026-01-15 10:00:00'
      const quedan = (ahora: string) => {
        const r = relojDelPlazo(tresMeses, desde, Date.parse(ahora))
        return r.cuenta === 'calculada' ? r.quedan : r.cuenta
      }
      expect(quedan('2026-01-15T10:00:00Z')).toBe(90)
      expect(quedan('2026-04-14T21:59:59Z')).toBe(1) // 23:59:59 del 14 en Madrid
      expect(quedan('2026-04-14T22:00:00Z')).toBe(0) // 00:00 del 15: el último día
      // A la hora del registro del último día el contador viejo ya lo daba por
      // agotado, y el bot pasaba la queja a silencio.
      expect(quedan('2026-04-15T10:00:00Z')).toBe(0)
      expect(quedan('2026-04-15T21:59:59Z')).toBe(0) // 23:59:59 del 15
      expect(quedan('2026-04-15T22:00:00Z')).toBe(-1) // 00:00 del 16: vencido
    })
  })

  it('lo transcurrido son días del mismo calendario', () => {
    enCadaZona(() => {
      const desde = '2026-01-30 23:30:00' // 31 de enero en Madrid
      expect(diasTranscurridos(desde, Date.parse('2026-01-31T12:00:00Z'))).toBe(0)
      expect(diasTranscurridos(desde, Date.parse('2026-04-30T21:59:00Z'))).toBe(89)
      expect(diasTranscurridos(desde, Date.parse('2026-04-30T22:00:00Z'))).toBe(90)
    })
  })

  it('una marca que no se puede leer no da plazo, ni vencido ni en curso', () => {
    // Con el código de antes, `new Date('ayer')` daba NaN, `NaN < plazo` era
    // falso, y el bot pasaba a silencio la queja en la primera vuelta.
    const ahora = Date.parse('2027-01-01T00:00:00Z')
    expect(venceEnMeses('09/28/2026', 3)).toBeNull()
    expect(relojDelPlazo(tresMeses, null, ahora)).toEqual({ cuenta: 'sin-fecha' })
    expect(relojDelPlazo(tresMeses, 'ayer', ahora)).toEqual({ cuenta: 'sin-fecha' })
    expect(diasTranscurridos(undefined, ahora)).toBeNull()
  })

  it('un plazo en días hábiles no se cuenta aquí', () => {
    // El acuse del art. 21.4 son diez días HÁBILES (art. 30.2): se descuentan del
    // cómputo TODOS los inhábiles, no sólo se prorroga el último como en un plazo
    // en meses (art. 30.5). Es otra regla, y nada publica todavía esa cuenta:
    // contar diez naturales sería inventar la fecha.
    const acuse = routeQueja({ title: 'Bache', detail: 'bache' }, officials).timeLimits.find(
      (t) => t.kind === 'acuse',
    )!
    expect(acuse).toMatchObject({ unit: 'days', amount: 10 })
    expect(relojDelPlazo(acuse, '2026-01-15 10:00:00', Date.parse('2026-01-20T10:00:00Z'))).toEqual(
      { cuenta: 'en-dias' },
    )
  })
})

/**
 * El art. 30.5: «Cuando el último día del plazo sea inhábil, se entenderá
 * prorrogado al primer día hábil siguiente».
 *
 * Hasta el 29-09-2026 el cálculo no lo aplicaba: un plazo que acababa en sábado
 * pasaba a silencio el domingo, y /metodologia lo confesaba. Cada caso usa el
 * calendario de la sede de verdad (`FESTIVOS_DE_LA_SEDE`), y cada festivo se busca
 * en él antes de usarlo: si alguien lo quitara de la tabla, la prueba diría por
 * qué ya no se prorroga, en vez de fallar con una fecha a secas.
 */
describe('queja-router — art. 30.5: el último día inhábil pasa al primer día hábil', () => {
  const tresMeses = plazoDeResolucion('via_publica')
  const unMes = plazoDeResolucion('transparencia')
  /** El reloj de una queja registrada a las 12:00 de Madrid de ese día, mirado un día después. */
  const reloj = (limite: TimeLimit, dia: string) =>
    relojDelPlazo(limite, `${dia} 10:00:00`, Date.parse(`${dia}T12:00:00Z`) + 86_400_000)
  /** El festivo de 2026 de la tabla, de ese ámbito, o la prueba no tiene de qué hablar. */
  const festivo = (fecha: string, ambito: string) =>
    expect(FESTIVOS_DE_LA_SEDE[2026]).toContainEqual(expect.objectContaining({ fecha, ambito }))

  it('acaba en sábado: el lunes', () => {
    // Del viernes 14-08-2026, tres meses: el sábado 14-11-2026.
    expect(reloj(tresMeses, '2026-08-14')).toMatchObject({
      cuenta: 'calculada',
      nominal: '2026-11-14',
      ultimoDia: '2026-11-16',
      dias: 94,
    })
  })

  it('acaba en domingo: el lunes (un mes de transparencia)', () => {
    // Del jueves 22-10-2026, un mes: el domingo 22-11-2026.
    expect(reloj(unMes, '2026-10-22')).toMatchObject({
      nominal: '2026-11-22',
      ultimoDia: '2026-11-23',
    })
  })

  it('acaba en festivo nacional: el día siguiente', () => {
    festivo('2026-12-08', 'nacional') // Inmaculada Concepción, martes
    expect(reloj(tresMeses, '2026-09-08')).toMatchObject({
      nominal: '2026-12-08',
      ultimoDia: '2026-12-09',
    })
  })

  it('acaba en festivo de la Comunitat Valenciana: el día siguiente', () => {
    festivo('2026-06-24', 'autonomico') // San Juan, miércoles
    expect(reloj(tresMeses, '2026-03-24')).toMatchObject({
      nominal: '2026-06-24',
      ultimoDia: '2026-06-25',
    })
  })

  it('acaba en fiesta local de Riba-roja: el día siguiente', () => {
    festivo('2026-09-14', 'local') // Festividad del Cristo, lunes
    // Del viernes 14-08-2026, un mes de transparencia.
    expect(reloj(unMes, '2026-08-14')).toMatchObject({
      nominal: '2026-09-14',
      ultimoDia: '2026-09-15',
    })
    festivo('2026-04-13', 'local') // San Vicente Ferrer, lunes
    expect(reloj(tresMeses, '2026-01-13')).toMatchObject({
      nominal: '2026-04-13',
      ultimoDia: '2026-04-14',
    })
  })

  it('una racha de inhábiles se salta entera: autonómico, fin de semana y nacional', () => {
    // El 9-10-2026 (viernes, Día de la Comunitat Valenciana), sábado 10, domingo
    // 11 y lunes 12 (Fiesta Nacional de España): el plazo acaba el martes 13.
    festivo('2026-10-09', 'autonomico')
    festivo('2026-10-12', 'nacional')
    expect(reloj(tresMeses, '2026-07-09')).toMatchObject({
      nominal: '2026-10-09',
      ultimoDia: '2026-10-13',
    })
  })

  it('cruza el año: cuenta el calendario del día que se mira, no el del registro', () => {
    // Registrada el 1-10-2025, año que no está en la tabla: tres meses acaban el
    // jueves 1-01-2026 (Año Nuevo), y el plazo, el viernes 2. El año del registro
    // no hace falta; el del último día, sí.
    festivo('2026-01-01', 'nacional')
    expect(FESTIVOS_DE_LA_SEDE[2025]).toBeUndefined()
    expect(reloj(tresMeses, '2025-10-01')).toMatchObject({
      nominal: '2026-01-01',
      ultimoDia: '2026-01-02',
    })
  })

  it('cruza el año hacia uno sin calendario: no se calcula, y dice cuál falta', () => {
    // Con sólo 2026: registrada el 1-10-2026, tres meses acaban el 1-01-2027. Se
    // pasa sólo 2026 para que la prueba no dependa de cuándo se añada 2027.
    const solo2026 = { 2026: FESTIVOS_DE_LA_SEDE[2026] }
    expect(
      relojDelPlazo(tresMeses, '2026-10-01 10:00:00', Date.parse('2026-10-02T12:00:00Z'), solo2026),
    ).toMatchObject({ cuenta: 'sin-calendario', anio: 2027, nominal: '2027-01-01' })
  })

  it('el silencio llega al acabar el día prorrogado, no el nominal', () => {
    const desde = '2026-08-14 10:00:00'
    const quedan = (ahora: string) => {
      const r = relojDelPlazo(tresMeses, desde, Date.parse(ahora))
      return r.cuenta === 'calculada' ? r.quedan : r.cuenta
    }
    expect(quedan('2026-11-14T11:00:00Z')).toBe(2) // el sábado nominal, a mediodía
    expect(quedan('2026-11-15T22:59:59Z')).toBe(1) // 23:59:59 del domingo en Madrid
    expect(quedan('2026-11-16T22:59:59Z')).toBe(0) // 23:59:59 del lunes: el último día
    expect(quedan('2026-11-16T23:00:00Z')).toBe(-1) // 00:00 del martes: silencio
  })

  it('un último día hábil no se mueve', () => {
    // El recibo del domingo 27-09-2026 registra el lunes 28 a las 0:00:01; tres
    // meses acaban el lunes 28-12-2026, que es hábil.
    expect(
      relojDelPlazo(tresMeses, '2026-09-27 22:00:01', Date.parse('2026-10-01T10:00:00Z')),
    ).toMatchObject({ nominal: '2026-12-28', ultimoDia: '2026-12-28', dias: 91 })
  })
})

/**
 * Un año sin calendario no es un año sin festivos.
 *
 * El art. 30.5 prorroga al primer día hábil el último día de un plazo que cae en
 * inhábil, y saber si un martes es inhábil exige el calendario de ESE año. Leer
 * «no tengo el año» como «ese año no tiene festivos» es tomar un centinela por un
 * valor (regla 3 de docs/DATA_INTEGRITY.md): el cálculo daría el plazo por
 * vencido el día de Año Nuevo, y el bot pasaría la queja a silencio al lado del
 * nombre de un cargo. Así que falla cerrado: sin el calendario del año en que
 * acaba, no hay último día, ni cuenta de días, ni silencio — y se dice qué año
 * falta y cuál era el último día antes de la prórroga.
 */
describe('queja-router — un año sin calendario no es un año sin festivos', () => {
  const tresMeses = plazoDeResolucion('via_publica')
  const F = { disposicion: 'Calendario de prueba', diario: 'ninguno', url: 'https://www.boe.es/' }
  /** Un año entero de prueba —los tres ámbitos, dos fiestas locales—, como pide el validador. */
  const anio2030: FestivoDeLaSede[] = [
    { fecha: '2030-01-01', nombre: 'Año Nuevo', ambito: 'nacional', fuente: F },
    { fecha: '2030-03-19', nombre: 'San José', ambito: 'autonomico', fuente: F },
    { fecha: '2030-05-13', nombre: 'Fiesta local', ambito: 'local', fuente: F },
    { fecha: '2030-09-09', nombre: 'Otra fiesta local', ambito: 'local', fuente: F },
  ]
  // Registrada el viernes 14-06-2030: tres meses vencen el sábado 14-09-2030, y
  // el primer hábil siguiente es el lunes 16.
  const desde = '2030-06-14 10:00:00'
  const junio = Date.parse('2030-06-20T10:00:00Z')

  it('con el año entero, se calcula', () => {
    expect(relojDelPlazo(tresMeses, desde, junio, { 2030: anio2030 })).toMatchObject({
      cuenta: 'calculada',
      nominal: '2030-09-14',
      ultimoDia: '2030-09-16',
    })
  })

  it('el último día en un año sin calendario no se calcula, y se dice qué año falta', () => {
    // El calendario de verdad: 2099 no lo va a tener nadie, así que la prueba no
    // caduca el día que se añada el año que viene.
    expect(
      relojDelPlazo(tresMeses, '2099-01-15 10:00:00', Date.parse('2099-05-01T10:00:00Z')),
    ).toEqual({ cuenta: 'sin-calendario', anio: 2099, nominal: '2099-04-15', quedanAlNominal: -16 })
  })

  it('antes del día nominal el plazo sigue abierto seguro: la prórroga sólo lo alarga', () => {
    expect(
      relojDelPlazo(tresMeses, '2099-01-15 10:00:00', Date.parse('2099-04-10T10:00:00Z')),
    ).toMatchObject({ cuenta: 'sin-calendario', anio: 2099, quedanAlNominal: 5 })
  })

  it('un año a medias no es un año: sin sus fiestas locales no se sabe si el lunes es hábil', () => {
    const sinLocales = { 2030: anio2030.filter((f) => f.ambito !== 'local') }
    expect(relojDelPlazo(tresMeses, desde, junio, sinLocales)).toMatchObject({
      cuenta: 'sin-calendario',
      anio: 2030,
    })
  })

  it('un año vacío tampoco: una lista sin días no dice «ningún festivo»', () => {
    expect(relojDelPlazo(tresMeses, desde, junio, { 2030: [] })).toMatchObject({
      cuenta: 'sin-calendario',
      anio: 2030,
    })
  })

  it('un fin de semana no necesita calendario; el día hábil que lo sigue, sí', () => {
    // Tres meses desde el 30-09-2028 vencen el sábado 30-12-2028. Con 2028 entero
    // y sin 2029: el sábado 30 y el domingo 31 son inhábiles sin mirar ningún
    // calendario (art. 30.2), y el lunes 1-01-2029 ya es de 2029. Falta ESE año,
    // el del día que se mira, no el del registro ni el del día nominal.
    const r = relojDelPlazo(tresMeses, '2028-09-30 10:00:00', Date.parse('2028-10-01T10:00:00Z'), {
      2028: anio2030.map((f) => ({ ...f, fecha: f.fecha.replace('2030', '2028') })),
    })
    expect(r).toMatchObject({ cuenta: 'sin-calendario', anio: 2029, nominal: '2028-12-30' })
  })
})

/**
 * El calendario que se publica: sólo años enteros, y cada día con su fuente.
 *
 * Lo cura una persona, por PR, desde lo que publican el BOE y el DOGV; el
 * validador es lo que impide que un año a medias o un día sin fuente lleguen a
 * decidir un silencio.
 */
describe('queja-router — el calendario de inhábiles de la sede', () => {
  const F = { disposicion: 'Calendario de prueba', diario: 'ninguno', url: 'https://www.boe.es/' }
  const anio2030: FestivoDeLaSede[] = [
    { fecha: '2030-01-01', nombre: 'Año Nuevo', ambito: 'nacional', fuente: F },
    { fecha: '2030-03-19', nombre: 'San José', ambito: 'autonomico', fuente: F },
    { fecha: '2030-05-13', nombre: 'Fiesta local', ambito: 'local', fuente: F },
    { fecha: '2030-09-09', nombre: 'Otra fiesta local', ambito: 'local', fuente: F },
  ]
  const con = (cambia: (a: FestivoDeLaSede[]) => FestivoDeLaSede[]) =>
    problemasDelCalendario({ 2030: cambia(anio2030.map((f) => ({ ...f }))) })

  it('el calendario publicado pasa su validador, y hay algo que validar', () => {
    expect(Object.keys(FESTIVOS_DE_LA_SEDE).length).toBeGreaterThan(0)
    expect(problemasDelCalendario(FESTIVOS_DE_LA_SEDE)).toEqual([])
  })

  it('cada año publicado tiene sus tres ámbitos', () => {
    for (const [anio, dias] of Object.entries(FESTIVOS_DE_LA_SEDE)) {
      for (const ambito of AMBITOS_DEL_FESTIVO) {
        expect(
          dias.some((f) => f.ambito === ambito),
          `${anio} sin festivos de ámbito ${ambito}`,
        ).toBe(true)
      }
    }
  })

  it('el validador acepta un año entero (el control)', () => {
    expect(problemasDelCalendario({ 2030: anio2030 })).toEqual([])
  })

  it('rechaza un año sin sus fiestas locales, o vacío', () => {
    expect(con((a) => a.filter((f) => f.ambito !== 'local'))).toEqual([
      expect.stringMatching(/2030.*local/),
    ])
    expect(problemasDelCalendario({ 2030: [] }).length).toBeGreaterThan(0)
  })

  it('rechaza más de dos fiestas locales (art. 37.2 del Estatuto de los Trabajadores)', () => {
    expect(con((a) => [...a, { ...a[2], fecha: '2030-10-14', nombre: 'Una tercera' }])).toEqual([
      expect.stringMatching(/2030.*local/),
    ])
  })

  it('rechaza una fecha que no existe, que es de otro año o que se repite', () => {
    expect(con((a) => [...a, { ...a[0], fecha: '2030-02-30' }])).toEqual([
      expect.stringMatching(/2030-02-30/),
    ])
    expect(con((a) => [...a, { ...a[0], fecha: '2031-01-06' }])).toEqual([
      expect.stringMatching(/2031-01-06/),
    ])
    expect(con((a) => [...a, { ...a[0] }])).toEqual([expect.stringMatching(/2030-01-01/)])
  })

  it('rechaza un día sin nombre, sin ámbito conocido o sin fuente oficial', () => {
    expect(con((a) => [{ ...a[0], nombre: ' ' }, ...a.slice(1)])).toEqual([
      expect.stringMatching(/2030-01-01/),
    ])
    expect(
      con((a) => [{ ...a[0], ambito: 'provincial' as never }, ...a.slice(1)]).length,
    ).toBeGreaterThan(0)
    // Una web que copia el calendario no es la disposición que lo declara.
    expect(
      con((a) => [
        { ...a[0], fuente: { ...F, url: 'https://www.calendarios-laborales.com/' } },
        ...a.slice(1),
      ]),
    ).toEqual([expect.stringMatching(/2030-01-01/)])
    expect(
      con((a) => [{ ...a[0], fuente: { ...F, url: 'http://www.boe.es/' } }, ...a.slice(1)]),
    ).toEqual([expect.stringMatching(/2030-01-01/)])
    expect(con((a) => [{ ...a[0], fuente: { ...F, disposicion: '' } }, ...a.slice(1)])).toEqual([
      expect.stringMatching(/2030-01-01/),
    ])
  })

  it('un año que el validador rechaza no cuenta como calendario al calcular', () => {
    // Si el cálculo aceptara lo que el validador rechaza, el validador sería un
    // aviso y no una puerta.
    const tresMeses: TimeLimit = plazoDeResolucion('via_publica')
    const conTresLocales: FestivosPorAnio = {
      2030: [...anio2030, { ...anio2030[2], fecha: '2030-10-14', nombre: 'Una tercera' }],
    }
    expect(
      relojDelPlazo(
        tresMeses,
        '2030-06-14 10:00:00',
        Date.parse('2030-06-20T10:00:00Z'),
        conTresLocales,
      ),
    ).toMatchObject({ cuenta: 'sin-calendario', anio: 2030 })
  })
})

describe('queja-router — escalation path', () => {
  it('standard quejas escalate to Síndic de Greuges CV', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    const sindic = r.escalation.find((e) => e.who.includes('Síndic'))
    expect(sindic).toBeDefined()
    expect(sindic?.template).toMatch(/elsindic\.com/)
  })

  it('standard quejas offer recurso contencioso-administrativo at 90d + 2m', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    const contencioso = r.escalation.find((e) => e.action.includes('contencioso'))
    expect(contencioso).toBeDefined()
    expect(contencioso?.basis.law).toMatch(/29\/1998|LJCA/)
  })

  it('transparencia escalates to the CTBG (reclamación especial)', () => {
    const r = routeQueja(
      { title: 'Acceso a información pública', detail: 'pido contratos' },
      officials,
    )
    const ctbg = r.escalation.find((e) => e.who.includes('CTBG') || e.who.includes('Consell'))
    expect(ctbg).toBeDefined()
  })

  it('every escalation step cites a BOE or official institution URL', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    for (const step of r.escalation) {
      expect(step.basis.url).toMatch(
        /boe\.es|elsindic\.com|consejodetransparencia\.es|defensordelpueblo\.es|gva\.es/,
      )
    }
  })

  it('escalation steps are ordered by whenDays ascending', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    for (let i = 1; i < r.escalation.length; i++) {
      expect(r.escalation[i].whenDays).toBeGreaterThanOrEqual(r.escalation[i - 1].whenDays)
    }
  })
})

describe('queja-router — legal catalog integrity', () => {
  it('every LEGAL_CATALOG entry has a BOE URL', () => {
    for (const art of Object.values(LEGAL_CATALOG)) {
      expect(art.url).toMatch(/boe\.es|elsindic\.com|consejodetransparencia\.es/)
    }
  })

  it('every ESCALATION_PROFILE has at least one step', () => {
    for (const profile of Object.values(ESCALATION_PROFILES)) {
      expect(profile.length).toBeGreaterThan(0)
    }
  })
})

describe('queja-router — Spanish explanation', () => {
  it('produces a human-readable multi-paragraph explanation', () => {
    const r = routeQueja(
      { title: 'Bache profundo en Av. Primera', detail: 'Bache sin reparar desde hace 3 meses' },
      officials,
    )
    expect(r.explanationEs.length).toBeGreaterThan(300)
    // name of responsible + deadline + escalation body all appear
    expect(r.explanationEs).toMatch(/Teresa Pozuelo/)
    expect(r.explanationEs).toMatch(/3 meses/)
    expect(r.explanationEs).toMatch(/Síndic/)
  })

  it('never includes editorial adjectives (ineficaz, corrupto, negligente)', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache en la calle' }, officials)
    expect(r.explanationEs.toLowerCase()).not.toMatch(
      /ineficaz|incompetente|negligente|corrupto|prevaricador|mentiroso/,
    )
  })
})

describe('queja-router — end-to-end shape', () => {
  it('returns a fully-populated QuejaRouting object', () => {
    const queja: QuejaInput = {
      title: 'Bache peligroso en Sector 14',
      detail: 'Lleva 2 meses sin arreglar y ya ha causado una caída',
    }
    const r = routeQueja(queja, officials)
    expect(r.queja).toEqual(queja)
    expect(r.category).toBeTruthy()
    expect(r.confidence).toMatch(/low|medium|high/)
    expect(r.concejalia.area).toBeTruthy()
    expect(r.concejalia.alcaldeFallback).toBeTruthy()
    expect(Array.isArray(r.legalBasis)).toBe(true)
    expect(r.legalBasis.length).toBeGreaterThan(0)
    expect(Array.isArray(r.timeLimits)).toBe(true)
    expect(r.timeLimits.length).toBeGreaterThan(0)
    expect(['positivo', 'negativo']).toContain(r.silencio)
    expect(Array.isArray(r.escalation)).toBe(true)
    expect(r.escalation.length).toBeGreaterThan(0)
    expect(typeof r.explanationEs).toBe('string')
  })
})
