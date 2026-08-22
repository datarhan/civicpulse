/**
 * El calendario de CESEL, y la lista de entregas que hasta ahora se escribía a
 * mano en dos sitios sin nada que la cotejara.
 *
 * Un lector que entra en agosto de 2026 y lee «entrega 2024» deduce, con toda
 * la razón del mundo, que el sitio está sin actualizar. No lo está: 2024 es lo
 * más nuevo que existe, porque la Orden HAP/2075/2014 da a las entidades
 * locales hasta el 1 de noviembre del año SIGUIENTE para rendir cada ejercicio
 * y el ministerio publica después. Ese desfase es del dato, no nuestro, y la
 * página tenía que decirlo.
 *
 * Lo segundo que se prueba aquí es la lista de entregas. Vivía copiada en
 * `scrape-coste-efectivo.ts` y en `fetch-cesel-ccaa.ts`, sin que nada la
 * comparase con el desplegable del ministerio: el día que se publique la
 * entrega de 2025 no habría saltado nada y el sitio seguiría titulando en 2024
 * indefinidamente. Es la regla 1 de DATA_INTEGRITY —exporta el enum, no lo
 * reescribas— aplicada a una tabla que además envejece sola.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ENTREGAS,
  parseEntregasDisponibles,
  calendarioEntrega,
  reescribirEntregas,
  VENCE_MES,
  VENCE_DIA,
} from '../src/scraper/cesel-entregas'

const fixture = () =>
  readFileSync(join(__dirname, 'fixtures/cesel_consulta_2026-08-19.html'), 'utf8')

describe('parseEntregasDisponibles', () => {
  it('lee el desplegable real del ministerio', () => {
    const vivas = parseEntregasDisponibles(fixture())

    // Control: sin esto, un parser que devolviera {} pasaría las dos
    // comprobaciones de abajo por vacuidad. La guarda que no evaluó nada y la
    // guarda que no encontró nada imprimen el mismo ✓.
    expect(Object.keys(vivas).length).toBeGreaterThan(5)

    // La página de 2026-08-19 ofrecía once ejercicios, 2014–2024. Es el hecho
    // que contesta «¿dónde está 2025?»: no está en ninguna parte.
    expect(Object.values(vivas).sort()).toEqual([
      2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024,
    ])
    expect(Object.values(vivas)).not.toContain(2025)
  })

  it('el mapa que usan los adaptadores coincide con el desplegable', () => {
    // Se IMPORTA ENTREGAS, no se reescribe. Un test que copiase la tabla
    // seguiría verde con los adaptadores mirando otra cosa, que es exactamente
    // cómo se perdieron 298 contratos en este repositorio.
    expect(parseEntregasDisponibles(fixture())).toEqual(ENTREGAS)
  })

  it('un documento sin desplegable devuelve vacío, no el mapa de casa', () => {
    // El fallo tiene que distinguirse del acierto. Si un error de red o un
    // rediseño devuelven una página sin ddlEntrega, la guarda debe poder decir
    // «no lo he comprobado» en vez de «todo en orden».
    expect(parseEntregasDisponibles('<html><body>vaya</body></html>')).toEqual({})
    expect(parseEntregasDisponibles('')).toEqual({})
  })
})

describe('calendarioEntrega', () => {
  it('con la entrega de 2024 delante, la de 2025 aún no ha vencido', () => {
    const c = calendarioEntrega(2024, new Date('2026-08-19T00:00:00Z'))
    expect(c.ultima).toBe(2024)
    expect(c.proxima).toBe(2025)
    // Orden HAP/2075/2014: se rinde antes del 1 de noviembre del año siguiente
    // al del ejercicio. Ejercicio 2025 → 1 de noviembre de 2026.
    expect(c.venceEn).toBe(2026)
    expect(c.estado).toBe('en-plazo')
  })

  it('el 1 de noviembre el plazo ya ha terminado; el 31 de octubre no', () => {
    // «Antes del 1 de noviembre» — el día 1 el plazo está cumplido. Sin este
    // par, la frase de la página seguiría diciendo «no llega tarde» un año
    // después de que dejara de ser verdad, que es la avería de prosa rancia
    // que este repositorio ya ha pagado tres veces.
    expect(calendarioEntrega(2024, new Date('2026-10-31T23:00:00Z')).estado).toBe('en-plazo')
    expect(calendarioEntrega(2024, new Date('2026-11-01T00:00:00Z')).estado).toBe('plazo-vencido')
  })

  it('el vencimiento se mueve solo cuando avanza la entrega', () => {
    // Cuando el ministerio publique 2025, la frase tiene que hablar de 2026 sin
    // que nadie la reescriba.
    const c = calendarioEntrega(2025, new Date('2027-03-01T00:00:00Z'))
    expect(c.proxima).toBe(2026)
    expect(c.venceEn).toBe(2027)
    expect(c.estado).toBe('en-plazo')
  })

  it('sin entrega conocida no inventa un calendario', () => {
    expect(calendarioEntrega(null, new Date('2026-08-19T00:00:00Z'))).toBeNull()
    expect(calendarioEntrega(undefined, new Date('2026-08-19T00:00:00Z'))).toBeNull()
  })

  it('la fecha límite es la de la Orden, no una constante suelta', () => {
    // 1 de noviembre. Se exportan para que la prosa y la guarda citen la misma.
    expect(VENCE_DIA).toBe(1)
    expect(VENCE_MES).toBe(11)
  })
})

describe('reescribirEntregas', () => {
  const FUENTE = [
    '/** cabecera que debe sobrevivir */',
    'export const ENTREGAS: Record<string, number> = {',
    "  '1': 2014,",
    "  '13': 2024,",
    '}',
    '',
    'export const VENCE_DIA = 1',
  ].join('\n')

  const literal = (texto: string) => {
    const m = /export const ENTREGAS: Record<string, number> = \{([\s\S]*?)\n\}/.exec(texto)
    if (!m) throw new Error('sin literal')
    const out: Record<string, number> = {}
    for (const [, id, anio] of m[1].matchAll(/'(\d+)':\s*(\d{4}),/g)) out[id] = Number(anio)
    return out
  }

  it('añade la entrega nueva sin tocar el resto del fichero', () => {
    const nuevo = reescribirEntregas(FUENTE, { '1': 2014, '13': 2024, '14': 2025 })
    expect(literal(nuevo)).toEqual({ '1': 2014, '13': 2024, '14': 2025 })
    // Lo de alrededor sigue ahí: una reescritura que se coma el módulo
    // compilaría igual de mal en noviembre, cuando no hay nadie mirando.
    expect(nuevo).toContain('/** cabecera que debe sobrevivir */')
    expect(nuevo).toContain('export const VENCE_DIA = 1')
  })

  it('ordena por ejercicio, no por id de texto', () => {
    // '9' > '13' como cadenas. Si se ordena mal, 2020 acaba detrás de 2024 y el
    // fichero deja de leerse como una serie.
    const nuevo = reescribirEntregas(FUENTE, { '13': 2024, '9': 2020, '1': 2014 })
    const anios = [...nuevo.matchAll(/'(\d+)':\s*(\d{4}),/g)].map((m) => Number(m[2]))
    expect(anios).toEqual([2014, 2020, 2024])
  })

  it('es idempotente: sin cambios, el texto es idéntico', () => {
    // Sin esto la automatización abriría una PR cada lunes con un diff vacío.
    expect(reescribirEntregas(FUENTE, { '1': 2014, '13': 2024 })).toBe(FUENTE)
  })

  it('estalla si no encuentra el literal, en vez de no hacer nada', () => {
    // Un renombrado deja la reescritura sin ancla. Devolver el texto tal cual
    // haría que la PR de noviembre trajera datos nuevos y un mapa viejo — la
    // guarda seguiría en rojo y nadie sabría por qué.
    expect(() => reescribirEntregas('const OTRA_COSA = {}', { '1': 2014 })).toThrow(/ENTREGAS/)
  })
})
