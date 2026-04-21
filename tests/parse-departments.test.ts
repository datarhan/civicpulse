import { describe, it, expect } from 'vitest'
import {
  ALLOWED_DEPARTMENT_SLUGS,
  DEPARTMENT_LABEL,
  canonicalizeDepartment,
  resolveResponsibleOfficial,
  type DepartmentSlug,
  type OfficialLike,
} from '../src/scraper/departments'

describe('DepartmentSlug enum', () => {
  it('has a label (es + ca) for every slug', () => {
    for (const slug of ALLOWED_DEPARTMENT_SLUGS) {
      expect(DEPARTMENT_LABEL[slug]).toBeDefined()
      expect(DEPARTMENT_LABEL[slug].es.length).toBeGreaterThan(0)
      expect(DEPARTMENT_LABEL[slug].ca.length).toBeGreaterThan(0)
    }
  })

  it('declares every canonical slug in the test fixtures below (forces authors to keep the fixture in sync)', () => {
    // If this fails, add a row to AGENDA_FIXTURE or PORTFOLIO_FIXTURE
    // exercising the new slug. Stale slugs are worse than missing ones.
    const tested = new Set<DepartmentSlug>()
    for (const [, slug] of [...AGENDA_FIXTURE, ...PORTFOLIO_FIXTURE, ...QUEJA_FIXTURE]) {
      if (slug) tested.add(slug)
    }
    const untested = ALLOWED_DEPARTMENT_SLUGS.filter((s) => !tested.has(s))
    // 'alcaldia' is only exercised via officials.portfolio → it's covered
    // by the PORTFOLIO_FIXTURE assertion below.
    expect(untested).toEqual([])
  })
})

// ─── Agenda department strings (plenos-agendas.json, 27 distinct values) ──
const AGENDA_FIXTURE: Array<[string, DepartmentSlug | null]> = [
  ['COMERCIO', 'comercio'],
  ['CONTRATACIÓN', 'contratacion'],
  ['CULTURA', 'cultura'],
  ['EDUCACIÓN', 'educacion'],
  ['FOMENTO ECONOMICO', 'empleo-economia'],
  ['FOMENTO ECONÓMICO', 'empleo-economia'],
  ['GESTIÓN PATRIMONIAL', 'hacienda'],
  ['GESTIÓN TRIBUTARIA', 'hacienda'],
  ['INNOVACIÓN', 'innovacion'],
  ['INTEGRIDAD', 'transparencia'],
  ['INTERVENCIÓN', 'hacienda'],
  ['JUVENTUD', 'juventud'],
  ['MEDIO AMBIENTE', 'medio-ambiente'],
  ['MEMORIA HISTÓRICA', 'servicios-sociales'],
  ['PARQUES Y JARDINES', 'medio-ambiente'],
  ['POLICÍA LOCAL', 'seguridad'],
  ['RECAUDACIÓN', 'hacienda'],
  ['RECURSOS HUMANOS', 'recursos-humanos'],
  ['SECRETARIA', 'servicios-generales'],
  ['SECRETARÍA', 'servicios-generales'],
  ['SERVICIOS GENERALES', 'servicios-generales'],
  ['SERVICIOS JURÍDICOS', 'servicios-generales'],
  ['SERVICIOS PÚBLICOS', 'servicios-generales'],
  ['SERVICIOS SOCIALES', 'servicios-sociales'],
  ['TESORERÍA', 'hacienda'],
  ['TRANSPARENCIA', 'transparencia'],
  ['URBANISMO', 'urbanismo'],
]

describe('canonicalizeDepartment — agenda strings (UPPERCASE, accented)', () => {
  it.each(AGENDA_FIXTURE)('%s → %s', (raw, expected) => {
    expect(canonicalizeDepartment(raw)).toBe(expected)
  })
})

// ─── Official portfolio strings (officials.json, 40 distinct values) ──────
const PORTFOLIO_FIXTURE: Array<[string, DepartmentSlug | null]> = [
  ['Alcaldía', 'alcaldia'],
  ['Urbanismo', 'urbanismo'],
  ['Urbanizaciones', 'urbanismo'],
  ['Obra Pública', 'obras-publicas'],
  ['Actividades y Edificios públicos', 'obras-publicas'],
  ['Emergencia climática', 'medio-ambiente'],
  ['Agenda 2030', 'medio-ambiente'],
  ['Educación', 'educacion'],
  ['Arte y Cultura', 'cultura'],
  ['Fallas', 'fiestas'],
  ['Fiestas y Tradiciones', 'fiestas'],
  ['Juventud y Servicios Jurídicos', 'servicios-generales'],
  ['Mayores', 'mayores'],
  ['Movilidad y Deportes', 'deportes'],
  ['Igualdad', 'igualdad'],
  ['Participación y transparencia', 'transparencia'],
  ['Integridad', 'transparencia'],
  ['Comunicación e información', 'comunicacion'],
  ['Atención a la ciudadanía', 'comunicacion'],
  ['Finanzas públicas y recaudación', 'hacienda'],
  ['Compra Pública', 'contratacion'],
  ['Seguridad y emergencias', 'seguridad'],
  ['Empleo y Emprendimiento', 'empleo-economia'],
  ['Fomento económico', 'empleo-economia'],
  ['Fondos Europeos', 'empleo-economia'],
  ['Agricultura', 'agricultura'],
  ['Turismo y patrimonio histórico', 'turismo'],
  ['Vivienda', 'vivienda'],
  ['Recursos Humanos', 'recursos-humanos'],
  ['Administración y Servicios Generales', 'servicios-generales'],
  ['Servicios públicos municipales', 'servicios-generales'],
  ['Protocolo y Bienestar Animal', 'bienestar-animal'],
  ['Innovación', 'innovacion'],
  ['Planificación estratégica y grandes proyectos y cooperación nacional e internacional', 'innovacion'],
  ['Acción social y políticas inclusivas', 'servicios-sociales'],
  ['Infancia y Adolescencia y Memoria Histórica', 'servicios-sociales'],
  ['Promoción de la Salud e Infraestructuras sanitarias', 'salud'],
  ['Áreas Industriales y Cementerio', null],
  ['barrios y diseminados', 'urbanismo'],
  ['y Comercio', 'comercio'],
]

describe('canonicalizeDepartment — portfolio strings (TitleCase, accented)', () => {
  it.each(PORTFOLIO_FIXTURE)('%s → %s', (raw, expected) => {
    expect(canonicalizeDepartment(raw)).toBe(expected)
  })
})

// ─── Queja category enums (queja-router.ts, 29 values — underscore form) ──
const QUEJA_FIXTURE: Array<[string, DepartmentSlug | null]> = [
  ['transparencia', 'transparencia'],
  ['urbanismo', 'urbanismo'],
  ['vivienda', 'vivienda'],
  ['alumbrado', 'movilidad'],
  ['limpieza', 'medio-ambiente'],
  ['residuos', 'medio-ambiente'],
  ['zonas_verdes', 'medio-ambiente'],
  ['ruido', 'salud'],
  ['trafico', 'movilidad'],
  ['transporte', 'movilidad'],
  ['agua_saneamiento', 'salud'],
  ['via_publica', 'movilidad'],
  ['mobiliario_urbano', 'movilidad'],
  ['accesibilidad', 'movilidad'],
  ['seguridad', 'seguridad'],
  ['bienestar_animal', 'bienestar-animal'],
  ['cultura', 'cultura'],
  ['educacion', 'educacion'],
  ['servicios_sociales', 'servicios-sociales'],
  ['mayores', 'mayores'],
  ['juventud', 'juventud'],
  ['salud', 'salud'],
  ['igualdad', 'igualdad'],
  ['deportes', 'deportes'],
  ['fiestas', 'fiestas'],
  ['turismo', 'turismo'],
  ['comercio', 'comercio'],
  ['agricultura', 'agricultura'],
  ['medio_ambiente', 'medio-ambiente'],
]

describe('canonicalizeDepartment — queja categories (snake_case lowercase)', () => {
  it.each(QUEJA_FIXTURE)('%s → %s', (raw, expected) => {
    expect(canonicalizeDepartment(raw)).toBe(expected)
  })
})

describe('canonicalizeDepartment — empty and unknown inputs', () => {
  it('returns null for empty / nullish input', () => {
    expect(canonicalizeDepartment('')).toBeNull()
    expect(canonicalizeDepartment('   ')).toBeNull()
    expect(canonicalizeDepartment(null)).toBeNull()
    expect(canonicalizeDepartment(undefined)).toBeNull()
  })

  it('returns null for strings that do not match any rule', () => {
    expect(canonicalizeDepartment('Otros')).toBeNull()
    expect(canonicalizeDepartment('xyzzy')).toBeNull()
  })
})

// ─── resolveResponsibleOfficial ──────────────────────────────────────────
describe('resolveResponsibleOfficial', () => {
  const fixtureOfficials: OfficialLike[] = [
    {
      slug: 'ana-urb',
      name: 'Ana Urbanista',
      portfolios: ['Urbanismo', 'Vivienda'],
    },
    {
      slug: 'beto-med',
      name: 'Beto Medio',
      portfolios: ['Emergencia climática', 'Agenda 2030'],
    },
    {
      slug: 'carlos-edu',
      name: 'Carlos Educador',
      portfolios: ['Educación'],
    },
  ]

  it('returns the official whose portfolio matches the slug', () => {
    const o = resolveResponsibleOfficial('medio-ambiente', fixtureOfficials)
    expect(o?.slug).toBe('beto-med')
  })

  it('first-match wins when multiple officials share the slug', () => {
    const extended = [
      ...fixtureOfficials,
      { slug: 'dany-urb', name: 'Dany', portfolios: ['Urbanismo'] },
    ]
    const o = resolveResponsibleOfficial('urbanismo', extended)
    expect(o?.slug).toBe('ana-urb')
  })

  it('returns null when no official has a matching portfolio', () => {
    const o = resolveResponsibleOfficial('turismo', fixtureOfficials)
    expect(o).toBeNull()
  })

  it('returns null for empty officials list', () => {
    expect(resolveResponsibleOfficial('urbanismo', [])).toBeNull()
  })
})
