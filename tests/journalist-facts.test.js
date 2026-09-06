import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  officeItems,
  currentOffice,
  officeSince,
  latestOffice,
} from '../src/lib/journalist-facts.js'

/**
 * El chip «EN EL CARGO desde …» de la cabecera tomaba el año MÁS BAJO de toda
 * la trayectoria política, candidaturas incluidas: Laura Guzmán salía «desde
 * 2019» por una candidatura sin escaño (entró en 2023) y el alcalde «desde
 * 2010» por un acta de concejal de otra corporación, cuando es alcalde desde
 * 2015. Lo vio un navegador el 06-09-2026; ningún test miraba el chip.
 *
 * La regla: el cargo actual es la fila ABIERTA que es un cargo (no una
 * candidatura, no personal eventual, no una asesoría en otro órgano), y «desde»
 * es el inicio de la cadena contigua de cargos que desemboca en él. Sin cargo
 * actual no hay chip: un centinela nunca es un valor.
 */
const AYTO = 'Ayuntamiento de Riba-roja de Túria'
const row = (role, startYear, endYear, org = AYTO) => ({ role, org, startYear, endYear })

const REPORTS = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/journalist-reports.json'), 'utf8'),
)
const careerOf = (assignmentId) => {
  const r = REPORTS.items.find((x) => x.assignmentId === assignmentId)
  if (!r) throw new Error(`no published report for ${assignmentId}`)
  return r.sections.find((s) => s.kind === 'career-political')?.payload?.items ?? []
}

describe('officeItems: qué filas son un cargo', () => {
  it('excluye candidaturas, personal eventual y asesorías', () => {
    const items = [
      row(
        'Candidata n.º 11 de la lista del PP (sin obtener escaño)',
        2019,
        2019,
        'Elecciones municipales',
      ),
      row('Personal eventual (personal de confianza) — su CV lo titula «Director»', 2019, 2023),
      row('Assessor de Ple (personal de confianza)', 2023, null, 'Diputació de València'),
      row('Concejal, n.º 6 del Grupo Municipal Popular', 2023, null),
    ]
    expect(officeItems(items).map((i) => i.startYear)).toEqual([2023])
  })

  it('excluye órganos que no son el ayuntamiento aunque el rol sea de cargo', () => {
    const items = [row('Portavoz del grupo', 2023, null, 'Diputació de València')]
    expect(officeItems(items)).toEqual([])
  })

  it('acepta «Ajuntament», «Regidora» y el «Ayuntamiento» a secas', () => {
    const items = [
      row('Alcalde (mandato en curso)', 2023, null, 'Ajuntament de Riba-roja de Túria'),
      row('Regidora — Transparencia', 2019, 2023),
      row('Concejala · Primera Teniente de Alcalde', 2023, null, 'Ayuntamiento'),
    ]
    expect(officeItems(items)).toHaveLength(3)
  })
})

describe('currentOffice: la fila abierta que es un cargo', () => {
  it('prefiere el cargo abierto de inicio más reciente', () => {
    const items = [row('Concejal', 2019, null), row('Alcalde', 2023, null)]
    expect(currentOffice(items).role).toBe('Alcalde')
  })

  it('es null sin cargo abierto — nunca la primera fila histórica', () => {
    expect(currentOffice([row('Concejal', 2023, 2025)])).toBeNull()
    expect(currentOffice([])).toBeNull()
  })
})

describe('officeSince: la cadena contigua hasta el cargo actual', () => {
  it('una candidatura previa sin escaño no cuenta (Guzmán)', () => {
    const items = [
      row(
        'Candidata n.º 11 de la lista del PP (sin obtener escaño)',
        2019,
        2019,
        'Elecciones municipales',
      ),
      row('Concejal, n.º 6 del Grupo Municipal Popular', 2023, null),
    ]
    expect(officeSince(items)).toBe(2023)
  })

  it('un hueco entre mandatos rompe la cadena (Folgado)', () => {
    const items = [row('Concejal de Compromís', 2015, 2019), row('Concejal y portavoz', 2023, null)]
    expect(officeSince(items)).toBe(2023)
  })

  it('un relevo el mismo año continúa la cadena; un mandato anterior con hueco, no (Raga)', () => {
    const items = [
      row('Concejal — corporación 2007-2011', 2010, 2010),
      row('Alcalde', 2015, 2019),
      row('Alcalde (proyectos europeos)', 2019, 2023),
      row('Alcalde (mandato en curso)', 2023, null),
    ]
    expect(officeSince(items)).toBe(2015)
  })

  it('acepta las filas desordenadas', () => {
    const items = [
      row('Alcalde (mandato en curso)', 2023, null),
      row('Alcalde', 2015, 2019),
      row('Alcalde (proyectos europeos)', 2019, 2023),
    ]
    expect(officeSince(items)).toBe(2015)
  })

  it('es null sin cargo actual', () => {
    expect(officeSince([row('Concejal', 2023, 2025)])).toBeNull()
    expect(officeSince([])).toBeNull()
  })
})

describe('latestOffice: el subtítulo de un ex cargo', () => {
  it('devuelve el mandato cerrado más reciente cuando no hay ninguno abierto', () => {
    const items = [row('Concejal', 2015, 2019), row('Concejal y portavoz suplente', 2023, 2025)]
    expect(latestOffice(items).startYear).toBe(2023)
  })

  it('con un cargo abierto, devuelve ese', () => {
    const items = [row('Concejal', 2015, 2019), row('Alcalde', 2023, null)]
    expect(latestOffice(items).role).toBe('Alcalde')
  })

  it('es null sin ninguna fila de cargo', () => {
    expect(latestOffice([])).toBeNull()
  })
})

describe('contra los informes publicados (años medidos a mano el 06-09-2026)', () => {
  const ESPERADO = {
    'a-robert-raga-bio-v4': 2015, // 2010 fue un acta suelta de otra corporación: hueco
    'a-jose-angel-hernandez-bio': 2015,
    'a-teresa-pozuelo-bio': 2015,
    'a-jose-luis-ramos-bio': 2019,
    'a-rafael-gomez-bio': 2019,
    'a-esther-gomez-bio': 2019,
    'a-salvador-ferrer-bio': 2019, // de Ciudadanos al PP, relevo en 2023
    'a-rfolgado-bio': 2023, // 2015-2019 y hueco
    'a-david-barbancho-bio': 2023, // 2019-2023 era personal eventual
    'a-alberto-gimeno-bio': 2023,
    'a-laura-guzman-bio': 2023, // 2019 fue candidata sin escaño
    'a-alfredo-pla-bio': 2023, // 2019 fue candidato sin escaño
  }

  for (const [id, year] of Object.entries(ESPERADO)) {
    it(`${id} → desde ${year}`, () => {
      expect(officeSince(careerOf(id))).toBe(year)
    })
  }

  it('Gimeno: el cargo actual es el del ayuntamiento, no la asesoría en la Diputació', () => {
    const c = currentOffice(careerOf('a-alberto-gimeno-bio'))
    expect(c.org).toMatch(/ayuntamiento/i)
    expect(c.role).toMatch(/concejal/i)
  })

  it('sin filas de trayectoria (Gallardo, Fernández) no hay cargo actual ni chip', () => {
    for (const id of ['a-jmgallardo-bio', 'a-jlfernandez-bio']) {
      expect(careerOf(id), id).toEqual([])
      expect(currentOffice(careerOf(id)), id).toBeNull()
      expect(officeSince(careerOf(id)), id).toBeNull()
    }
  })
})
