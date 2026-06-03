/**
 * Queja router — classifies a citizen complaint and returns:
 *   - category (27 canonical categories mirroring Avisa Madrid + RR portfolios)
 *   - responsible concejalía (matched by portfolio) + alcalde fallback
 *   - legal basis with BOE URLs
 *   - time limits (10-day acuse, resolución 30/90 días, silencio type)
 *   - escalation ladder (sede → Síndic CV → CTBG → contencioso-administrativo)
 *   - Spanish human-readable explanation
 *
 * Pure function. No network. No mutation. Deterministic for a given
 * (queja, officialsSnapshot). Primary source URLs only — matches the
 * legal/editorial contract in docs/QUEJAS_DESIGN.md.
 */

// ============================================================================
// Types
// ============================================================================

export type QuejaCategory =
  | 'via_publica'
  | 'limpieza'
  | 'zonas_verdes'
  | 'alumbrado'
  | 'trafico'
  | 'mobiliario_urbano'
  | 'ruido'
  | 'agua_saneamiento'
  | 'transporte'
  | 'transparencia'
  | 'urbanismo'
  | 'accesibilidad'
  | 'seguridad'
  | 'cultura'
  | 'educacion'
  | 'servicios_sociales'
  | 'medio_ambiente'
  | 'residuos'
  | 'comercio'
  | 'fiestas'
  | 'vivienda'
  | 'agricultura'
  | 'mayores'
  | 'juventud'
  | 'turismo'
  | 'salud'
  | 'deportes'
  | 'igualdad'
  | 'bienestar_animal'
  | 'otros'

export interface QuejaInput {
  title: string
  detail: string
  category?: QuejaCategory
}

export interface LegalArticle {
  law: string
  article: string
  url: string
  says: string
}

export interface TimeLimit {
  kind: 'acuse' | 'resolucion' | 'reclamacion' | 'recurso'
  days: number
  basis: LegalArticle
}

export interface EscalationStep {
  step: number
  whenDays: number
  action: string
  who: string
  basis: LegalArticle
  template?: string
}

export interface Official {
  slug: string
  name: string
  honorific?: string
  role: 'alcalde' | 'concejal'
  party: string
  portfolios: string[]
  email?: string
  photoUrl?: string
}

export interface OfficialsSnapshot {
  generatedAt: string
  source: string
  count: number
  composition: Record<string, number>
  officials: Official[]
}

export interface QuejaRouting {
  queja: QuejaInput
  category: QuejaCategory
  confidence: 'low' | 'medium' | 'high'
  concejalia: {
    area: string
    responsible: (Official & { portfolioMatched: string }) | null
    alcaldeFallback: Pick<Official, 'slug' | 'name' | 'email'>
  }
  legalBasis: LegalArticle[]
  timeLimits: TimeLimit[]
  silencio: 'positivo' | 'negativo'
  escalation: EscalationStep[]
  explanationEs: string
}

// ============================================================================
// Legal catalogue — every quoted article is from the BOE text, verbatim or
// faithfully compressed. Update only by PR.
// ============================================================================

export const LEGAL_CATALOG: Record<string, LegalArticle> = {
  LPACAP_16: {
    law: 'Ley 39/2015 LPACAP',
    article: 'art. 16',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-10565#a16',
    says: 'Cada Administración dispondrá de un Registro Electrónico General; el recibo acreditativo con fecha y hora es la prueba de entrada.',
  },
  LPACAP_21_3: {
    law: 'Ley 39/2015 LPACAP',
    article: 'art. 21.3',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-10565#a21',
    says: 'Plazo máximo para resolver y notificar: el que fije la norma reguladora; en su defecto, tres meses.',
  },
  LPACAP_21_4: {
    law: 'Ley 39/2015 LPACAP',
    article: 'art. 21.4',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-10565#a21',
    says: 'En el plazo de diez días desde la recepción de la solicitud en el registro, la Administración informará al interesado del plazo máximo y de los efectos del silencio.',
  },
  LPACAP_24: {
    law: 'Ley 39/2015 LPACAP',
    article: 'art. 24',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-10565#a24',
    says: 'El silencio administrativo en procedimientos iniciados a solicitud de interesado tiene efecto desestimatorio cuando afecta al derecho de petición (art. 29 CE) o cuando la norma específica así lo establezca.',
  },
  LPACAP_123: {
    law: 'Ley 39/2015 LPACAP',
    article: 'art. 123',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-10565#a123',
    says: 'Recurso potestativo de reposición ante el mismo órgano que dictó el acto, en el plazo de un mes desde la notificación o, en caso de silencio, desde que se produzca.',
  },
  LRBRL_18: {
    law: 'Ley 7/1985 LRBRL',
    article: 'art. 18',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1985-5392#a18',
    says: 'Son derechos del vecino: ser informado previa petición razonada y dirigir solicitudes a la Administración municipal.',
  },
  LRBRL_132: {
    law: 'Ley 7/1985 LRBRL',
    article: 'art. 132',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1985-5392#a132',
    says: 'La Comisión Especial de Sugerencias y Reclamaciones defiende los derechos de los vecinos y rinde al Pleno informe anual sobre quejas recibidas y deficiencias del servicio.',
  },
  LTBG_8: {
    law: 'Ley 19/2013 Transparencia',
    article: 'art. 8.1.i',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2013-12887#a8',
    says: 'Los sujetos obligados publicarán la información estadística necesaria para valorar el grado de cumplimiento y calidad de los servicios públicos.',
  },
  LTBG_20: {
    law: 'Ley 19/2013 Transparencia',
    article: 'art. 20',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2013-12887#a20',
    says: 'La resolución de la solicitud de acceso a la información pública deberá notificarse al solicitante en el plazo máximo de un mes desde la recepción de la solicitud.',
  },
  LTBG_24: {
    law: 'Ley 19/2013 Transparencia',
    article: 'art. 24',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2013-12887#a24',
    says: 'Frente a toda resolución expresa o presunta en materia de acceso, podrá interponerse reclamación ante el Consejo de Transparencia y Buen Gobierno.',
  },
  LJCA_46: {
    law: 'Ley 29/1998 LJCA',
    article: 'art. 46',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1998-16718#a46',
    says: 'El plazo para interponer recurso contencioso-administrativo será de dos meses desde la notificación del acto, o de seis meses en caso de silencio.',
  },
  SINDIC_CV: {
    law: 'Ley 11/1988 Síndic de Greuges',
    article: 'art. 1',
    url: 'https://www.elsindic.com',
    says: 'El Síndic de Greuges de la Comunitat Valenciana protege los derechos de la ciudadanía frente a las administraciones y publica sus resoluciones.',
  },
  CONSTITUCION_29: {
    law: 'Constitución Española',
    article: 'art. 29',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1978-31229#a29',
    says: 'Todos los españoles tendrán el derecho de petición individual y colectiva por escrito.',
  },
}

// ============================================================================
// Category classifier — Spanish-aware keyword matching with light stemming.
// Order matters: the first category whose strong keywords match wins.
// ============================================================================

interface CategoryDef {
  id: QuejaCategory
  keywords: string[] // exact-stem matches → high confidence
  softKeywords?: string[] // partial matches → medium confidence
  portfolioKeys: string[] // portfolio strings to match concejalías against
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'transparencia',
    keywords: [
      'acceso a informacion',
      'acceso a información',
      'informacion publica',
      'información pública',
      'derecho de acceso',
      'transparencia',
      'portal de transparencia',
      'copia de contratos',
    ],
    portfolioKeys: ['transparencia', 'participacion', 'participación'],
  },
  {
    id: 'urbanismo',
    keywords: [
      'licencia de obra',
      'licencia urbanistica',
      'licencia urbanística',
      'pgou',
      'planeamiento',
    ],
    softKeywords: ['urbanismo', 'urbanistic'],
    portfolioKeys: ['urbanismo'],
  },
  {
    id: 'vivienda',
    keywords: ['vivienda social', 'alquiler social', 'vpo'],
    softKeywords: ['vivienda'],
    portfolioKeys: ['vivienda'],
  },
  {
    id: 'alumbrado',
    keywords: ['farola', 'alumbrado publico', 'alumbrado público', 'alumbrado'],
    softKeywords: ['luz averiada', 'luminaria'],
    portfolioKeys: ['servicios publicos', 'servicios públicos', 'obra publica', 'obra pública'],
  },
  {
    id: 'limpieza',
    keywords: ['contenedor', 'contenedores', 'basura', 'limpieza viaria', 'suciedad'],
    softKeywords: ['limpieza'],
    portfolioKeys: ['servicios publicos', 'servicios públicos'],
  },
  {
    id: 'residuos',
    keywords: ['reciclaje', 'residuos solidos', 'residuos sólidos', 'punto limpio'],
    softKeywords: ['residuos'],
    portfolioKeys: ['servicios publicos', 'servicios públicos', 'medio ambiente'],
  },
  {
    id: 'zonas_verdes',
    keywords: ['parque', 'jardin', 'jardín', 'arbol', 'árbol', 'cesped', 'césped', 'zona verde'],
    portfolioKeys: ['servicios publicos', 'servicios públicos', 'medio ambiente'],
  },
  {
    id: 'ruido',
    keywords: [
      'ruido',
      'ruidos',
      'ruido nocturno',
      'contaminacion acustica',
      'contaminación acústica',
    ],
    portfolioKeys: ['seguridad', 'medio ambiente'],
  },
  {
    id: 'trafico',
    keywords: ['trafico', 'tráfico', 'semaforo', 'semáforo', 'aparcamiento ilegal', 'multa'],
    portfolioKeys: ['seguridad', 'movilidad'],
  },
  {
    id: 'transporte',
    keywords: ['autobus', 'autobús', 'metro', 'tren', 'parada', 'linea 9', 'línea 9'],
    softKeywords: ['transporte', 'movilidad'],
    portfolioKeys: ['movilidad'],
  },
  {
    id: 'agua_saneamiento',
    keywords: ['agua potable', 'alcantarillado', 'fuga de agua', 'saneamiento'],
    softKeywords: ['agua'],
    portfolioKeys: ['servicios publicos', 'servicios públicos', 'obra publica', 'obra pública'],
  },
  {
    id: 'via_publica',
    keywords: ['bache', 'baches', 'acera rota', 'asfaltado', 'calzada', 'pavimento'],
    softKeywords: ['via publica', 'vía pública'],
    portfolioKeys: ['obra publica', 'obra pública', 'urbanismo'],
  },
  {
    id: 'mobiliario_urbano',
    keywords: ['banco roto', 'papelera', 'mobiliario urbano', 'senalizacion', 'señalización'],
    portfolioKeys: ['obra publica', 'obra pública'],
  },
  {
    id: 'accesibilidad',
    keywords: [
      'accesibilidad',
      'silla de ruedas',
      'rampa',
      'barrera arquitectonica',
      'barrera arquitectónica',
    ],
    portfolioKeys: ['obra publica', 'obra pública', 'movilidad'],
  },
  {
    id: 'seguridad',
    keywords: ['policia local', 'policía local', 'inseguridad', 'vandalismo', 'robo'],
    softKeywords: ['seguridad'],
    portfolioKeys: ['seguridad'],
  },
  {
    id: 'bienestar_animal',
    keywords: ['perro abandonado', 'colonia felina', 'maltrato animal', 'bienestar animal'],
    portfolioKeys: ['bienestar animal'],
  },
  {
    id: 'cultura',
    keywords: ['biblioteca', 'museo', 'auditorio', 'teatro municipal'],
    softKeywords: ['cultura', 'arte'],
    portfolioKeys: ['cultura', 'arte'],
  },
  {
    id: 'educacion',
    keywords: ['colegio', 'escuela infantil', 'guarderia', 'guardería', 'ampa'],
    softKeywords: ['educacion', 'educación'],
    portfolioKeys: ['educacion', 'educación', 'infancia'],
  },
  {
    id: 'servicios_sociales',
    keywords: ['servicios sociales', 'ayuda social', 'exclusion', 'exclusión', 'emergencia social'],
    portfolioKeys: ['accion social', 'acción social', 'servicios sociales'],
  },
  {
    id: 'mayores',
    keywords: [
      'tercera edad',
      'mayor',
      'mayores',
      'centro de dia',
      'centro de día',
      'residencia de mayores',
    ],
    portfolioKeys: ['mayores'],
  },
  {
    id: 'juventud',
    keywords: ['juventud', 'jovenes', 'jóvenes', 'ocio juvenil', 'casa de juventud'],
    portfolioKeys: ['juventud'],
  },
  {
    id: 'salud',
    keywords: ['centro de salud', 'consultorio medico', 'consultorio médico', 'ambulatorio'],
    softKeywords: ['salud', 'sanidad'],
    portfolioKeys: ['salud', 'sanitaria'],
  },
  {
    id: 'igualdad',
    keywords: ['igualdad', 'violencia de genero', 'violencia de género', 'feminismo'],
    portfolioKeys: ['igualdad'],
  },
  {
    id: 'deportes',
    keywords: [
      'polideportivo',
      'piscina municipal',
      'pista deportiva',
      'campo de futbol',
      'campo de fútbol',
    ],
    softKeywords: ['deporte', 'deportes'],
    portfolioKeys: ['deportes'],
  },
  {
    id: 'fiestas',
    keywords: ['fallas', 'fiestas patronales', 'fiesta mayor'],
    softKeywords: ['fiesta', 'tradicion', 'tradición'],
    portfolioKeys: ['fiestas', 'fallas', 'tradiciones'],
  },
  {
    id: 'turismo',
    keywords: ['turismo', 'patrimonio historico', 'patrimonio histórico', 'oficina de turismo'],
    portfolioKeys: ['turismo', 'patrimonio'],
  },
  {
    id: 'comercio',
    keywords: ['comercio local', 'mercado municipal', 'pequeno comercio', 'pequeño comercio'],
    softKeywords: ['comercio'],
    portfolioKeys: ['comercio', 'empleo', 'emprendimiento'],
  },
  {
    id: 'agricultura',
    keywords: ['regadio', 'regadío', 'agricultura', 'agricultor', 'camino rural'],
    portfolioKeys: ['agricultura'],
  },
  {
    id: 'medio_ambiente',
    keywords: [
      'contaminacion',
      'contaminación',
      'vertido',
      'emisiones',
      'calidad del aire',
      'rio turia',
      'río turia',
    ],
    softKeywords: ['medio ambiente', 'emergencia climatica', 'emergencia climática'],
    portfolioKeys: [
      'medio ambiente',
      'emergencia climatica',
      'emergencia climática',
      'agenda 2030',
    ],
  },
]

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\sñ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function classifyQueja(q: QuejaInput): {
  category: QuejaCategory
  confidence: 'low' | 'medium' | 'high'
  matchedCategory?: CategoryDef
} {
  if (q.category) {
    const def = CATEGORIES.find((c) => c.id === q.category)
    return { category: q.category, confidence: 'high', matchedCategory: def }
  }
  const text = normalize(q.title + ' ' + q.detail)
  // Strong keywords (first match wins — order in CATEGORIES array is intentional).
  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      if (text.includes(normalize(kw))) {
        return { category: cat.id, confidence: 'high', matchedCategory: cat }
      }
    }
  }
  // Soft keywords (medium confidence).
  for (const cat of CATEGORIES) {
    for (const kw of cat.softKeywords || []) {
      if (text.includes(normalize(kw))) {
        return { category: cat.id, confidence: 'medium', matchedCategory: cat }
      }
    }
  }
  return { category: 'otros', confidence: 'low' }
}

// ============================================================================
// Legal profiles per category — which articles + deadlines apply.
// ============================================================================

interface LegalProfile {
  basis: string[] // keys into LEGAL_CATALOG
  acuseDays: number
  resolucionDays: number
  silencio: 'positivo' | 'negativo'
  escalationKey: keyof typeof ESCALATION_PROFILES
}

const PROFILE_STANDARD: LegalProfile = {
  basis: [
    'LRBRL_18',
    'LRBRL_132',
    'LPACAP_16',
    'LPACAP_21_3',
    'LPACAP_21_4',
    'LPACAP_24',
    'CONSTITUCION_29',
  ],
  acuseDays: 10,
  resolucionDays: 90,
  silencio: 'negativo',
  escalationKey: 'standard',
}

const PROFILE_TRANSPARENCIA: LegalProfile = {
  basis: ['LTBG_8', 'LTBG_20', 'LTBG_24', 'LPACAP_16'],
  acuseDays: 0, // no formal 10-day acuse; resolución en 1 mes
  resolucionDays: 30,
  silencio: 'negativo',
  escalationKey: 'transparencia',
}

const PROFILE_URBANISMO_LICENCIA: LegalProfile = {
  basis: ['LRBRL_18', 'LPACAP_16', 'LPACAP_21_3', 'LPACAP_21_4', 'LPACAP_24'],
  acuseDays: 10,
  resolucionDays: 90,
  silencio: 'positivo', // Licencia de obra menor → art. 24.1 LPACAP
  escalationKey: 'standard',
}

function profileFor(category: QuejaCategory, q: QuejaInput): LegalProfile {
  if (category === 'transparencia') return PROFILE_TRANSPARENCIA
  if (category === 'urbanismo') {
    const text = normalize(q.title + ' ' + q.detail)
    if (text.includes('licencia')) return PROFILE_URBANISMO_LICENCIA
  }
  return PROFILE_STANDARD
}

// ============================================================================
// Escalation profiles
// ============================================================================

export const ESCALATION_PROFILES: Record<string, EscalationStep[]> = {
  standard: [
    {
      step: 1,
      whenDays: 0,
      action: 'Registro en sede electrónica — recibo con CSV + nº de asiento',
      who: 'Ciudadano (firma con Cl@ve / Autofirma / DNIe)',
      basis: LEGAL_CATALOG.LPACAP_16,
    },
    {
      step: 2,
      whenDays: 10,
      action: 'El Ayuntamiento debe acusar recibo e informar del plazo y del silencio',
      who: 'Ayuntamiento · concejalía responsable',
      basis: LEGAL_CATALOG.LPACAP_21_4,
    },
    {
      step: 3,
      whenDays: 90,
      action: 'Silencio administrativo negativo (petición art. 29 CE) — se entiende desestimada',
      who: 'Efecto legal automático',
      basis: LEGAL_CATALOG.LPACAP_24,
    },
    {
      step: 4,
      whenDays: 90,
      action: 'Recurso potestativo de reposición ante el mismo órgano (1 mes)',
      who: 'Ciudadano',
      basis: LEGAL_CATALOG.LPACAP_123,
    },
    {
      step: 5,
      whenDays: 90,
      action:
        'Queja al Síndic de Greuges de la Comunitat Valenciana (sin coste, no perjudica otros recursos)',
      who: 'Síndic de Greuges CV',
      basis: LEGAL_CATALOG.SINDIC_CV,
      template: 'https://www.elsindic.com/es/presenta-una-queja',
    },
    {
      step: 6,
      whenDays: 150,
      action: 'Recurso contencioso-administrativo ante el JCA de Valencia (6 meses desde silencio)',
      who: 'Ciudadano · órgano judicial',
      basis: LEGAL_CATALOG.LJCA_46,
    },
  ],
  transparencia: [
    {
      step: 1,
      whenDays: 0,
      action: 'Solicitud de acceso en sede electrónica o Portal de Transparencia',
      who: 'Ciudadano',
      basis: LEGAL_CATALOG.LTBG_20,
    },
    {
      step: 2,
      whenDays: 30,
      action: 'Silencio → se entiende desestimada',
      who: 'Efecto legal automático',
      basis: LEGAL_CATALOG.LTBG_20,
    },
    {
      step: 3,
      whenDays: 30,
      action:
        'Reclamación ante el Consell de Transparència de la CV (o CTBG) · 1 mes para interponerla',
      who: 'Consell de Transparència CV / CTBG',
      basis: LEGAL_CATALOG.LTBG_24,
      template: 'https://www.consejodetransparencia.es/ct_Home/Actividad/Reclamaciones.html',
    },
    {
      step: 4,
      whenDays: 90,
      action:
        'Recurso contencioso-administrativo (2 meses desde resolución de la reclamación, o 6 meses si silencio)',
      who: 'Ciudadano · órgano judicial',
      basis: LEGAL_CATALOG.LJCA_46,
    },
  ],
}

// ============================================================================
// Concejalía matcher
// ============================================================================

function matchConcejalia(
  portfolioKeys: string[] | undefined,
  officials: Official[],
): { responsible: (Official & { portfolioMatched: string }) | null; area: string } {
  if (!portfolioKeys || portfolioKeys.length === 0) {
    return { responsible: null, area: 'Alcaldía' }
  }
  for (const key of portfolioKeys) {
    const needle = normalize(key)
    for (const o of officials) {
      if (o.role === 'alcalde') continue // alcalde is a fallback, not a match
      for (const portfolio of o.portfolios || []) {
        if (normalize(portfolio).includes(needle)) {
          return {
            responsible: { ...o, portfolioMatched: portfolio },
            area: portfolio,
          }
        }
      }
    }
  }
  return { responsible: null, area: 'Alcaldía' }
}

// ============================================================================
// Main export
// ============================================================================

export function routeQueja(q: QuejaInput, officials: OfficialsSnapshot): QuejaRouting {
  const { category, confidence, matchedCategory } = classifyQueja(q)

  const alcalde = officials.officials.find((o) => o.role === 'alcalde')!
  const { responsible, area } = matchConcejalia(matchedCategory?.portfolioKeys, officials.officials)

  // If no portfolio match, the alcalde takes the queja (art. 21.1 LBRL — the
  // alcalde represents the Ayuntamiento and answers for omission).
  const effectiveResponsible =
    responsible ||
    ({ ...alcalde, portfolioMatched: 'Alcaldía' } as Official & { portfolioMatched: string })

  const profile = profileFor(category, q)
  const legalBasis: LegalArticle[] = profile.basis.map((k) => LEGAL_CATALOG[k]).filter(Boolean)

  const timeLimits: TimeLimit[] = []
  if (profile.acuseDays > 0) {
    timeLimits.push({
      kind: 'acuse',
      days: profile.acuseDays,
      basis: LEGAL_CATALOG.LPACAP_21_4,
    })
  }
  timeLimits.push({
    kind: 'resolucion',
    days: profile.resolucionDays,
    basis:
      profile.escalationKey === 'transparencia' ? LEGAL_CATALOG.LTBG_20 : LEGAL_CATALOG.LPACAP_21_3,
  })

  const escalation = ESCALATION_PROFILES[profile.escalationKey].map((s) => ({ ...s }))

  const explanationEs = composeExplanation({
    queja: q,
    category,
    area,
    responsible: effectiveResponsible,
    alcalde,
    profile,
    escalation,
  })

  return {
    queja: q,
    category,
    confidence,
    concejalia: {
      area,
      responsible: effectiveResponsible,
      alcaldeFallback: {
        slug: alcalde.slug,
        name: alcalde.name,
        email: alcalde.email,
      },
    },
    legalBasis,
    timeLimits,
    silencio: profile.silencio,
    escalation,
    explanationEs,
  }
}

// ============================================================================
// Spanish explanation composer (no editorial adjectives — factual only)
// ============================================================================

function composeExplanation(ctx: {
  queja: QuejaInput
  category: QuejaCategory
  area: string
  responsible: Official & { portfolioMatched: string }
  alcalde: Official
  profile: LegalProfile
  escalation: EscalationStep[]
}): string {
  const { queja, category, area, responsible, alcalde, profile } = ctx
  const silencioText =
    profile.silencio === 'positivo'
      ? 'silencio administrativo positivo (se entiende estimada si no hay resolución expresa en plazo)'
      : 'silencio administrativo negativo (se entiende desestimada si no hay resolución expresa en plazo, sin perjuicio de la obligación de resolver)'

  const resolucionHumano =
    profile.resolucionDays === 30
      ? '1 mes'
      : profile.resolucionDays === 90
        ? '3 meses'
        : `${profile.resolucionDays} días`

  return [
    `Asunto: ${queja.title}`,
    ``,
    `Categoría detectada: ${category}. Esta materia corresponde al área de ${area} del Ayuntamiento de Riba-roja de Túria, bajo la responsabilidad política de ${responsible.honorific ?? ''} ${responsible.name} (${responsible.party}).`,
    ``,
    `Base legal de la obligación de respuesta:`,
    `- Art. 18 de la Ley 7/1985 (LRBRL) reconoce al vecino el derecho a dirigir solicitudes a la Administración municipal.`,
    `- Art. 21 de la Ley 39/2015 (LPACAP) obliga al Ayuntamiento a dictar y notificar resolución expresa en todo procedimiento, con acuse de recibo en 10 días e informando del plazo máximo aplicable.`,
    `- Plazo máximo aplicable en este caso: ${resolucionHumano} desde la entrada en el Registro Electrónico.`,
    `- Tipo de silencio: ${silencioText}.`,
    ``,
    `Si transcurre el plazo sin respuesta, las vías abiertas son:`,
    `1. Recurso potestativo de reposición ante el mismo órgano (1 mes — art. 123 LPACAP).`,
    `2. Queja al Síndic de Greuges de la Comunitat Valenciana, sin coste y sin perjudicar otros recursos (https://www.elsindic.com).`,
    category === 'transparencia'
      ? `3. Reclamación ante el Consell de Transparència de la CV o el Consejo de Transparencia y Buen Gobierno (art. 24 Ley 19/2013).`
      : `3. Recurso contencioso-administrativo ante el Juzgado de lo Contencioso-Administrativo de Valencia (6 meses desde el silencio — art. 46 Ley 29/1998).`,
    ``,
    `El alcalde, ${alcalde.honorific ?? ''} ${alcalde.name}, representa al Ayuntamiento (art. 21 LRBRL) y responde en todo caso de la omisión de respuesta.`,
  ].join('\n')
}
