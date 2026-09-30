/**
 * Queja router — classifies a citizen complaint and returns:
 *   - category (27 canonical categories mirroring Avisa Madrid + RR portfolios)
 *   - responsible concejalía (matched by portfolio) + alcalde fallback
 *   - legal basis with BOE URLs
 *   - time limits (acuse de 10 días, resolución de 1 o 3 MESES, silencio type),
 *     counted in the sede's calendar with its días inhábiles (`relojDelPlazo`,
 *     `FESTIVOS_DE_LA_SEDE`)
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

/**
 * Un plazo, en la unidad EN QUE LO FIJA LA NORMA.
 *
 * Tenía un solo campo `days`, y los dos plazos que se publican aquí no están
 * fijados en la misma unidad: el acuse de recibo sí («en el plazo de diez
 * días», art. 21.4 LPACAP), pero la resolución no («tres meses», art. 21.3;
 * «un mes» en el art. 20 de la Ley 19/2013). Escribir los meses como 90 y 30
 * días parece inocuo y no lo es: el art. 30.4 manda contar los meses de fecha a
 * fecha, así que tres meses duran 90 o 91 días según cuándo empiecen, y el
 * contador de /quejas/:id se desviaba por ahí.
 *
 * `relojDelPlazo()` lo cuenta en días cuando hace falta, y necesita la fecha de
 * inicio precisamente porque la respuesta depende de ella —y del calendario de
 * días inhábiles del año en que acaba—.
 */
export interface TimeLimit {
  kind: 'acuse' | 'resolucion' | 'reclamacion' | 'recurso'
  unit: 'days' | 'months'
  amount: number
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
  /** En MESES, que es como lo fija la norma. Ver `TimeLimit`. */
  resolucionMeses: number
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
  resolucionMeses: 3, // art. 21.3 LPACAP
  silencio: 'negativo',
  escalationKey: 'standard',
}

const PROFILE_TRANSPARENCIA: LegalProfile = {
  basis: ['LTBG_8', 'LTBG_20', 'LTBG_24', 'LPACAP_16'],
  acuseDays: 0, // no formal 10-day acuse; resolución en 1 mes
  resolucionMeses: 1, // art. 20 Ley 19/2013
  silencio: 'negativo',
  escalationKey: 'transparencia',
}

const PROFILE_URBANISMO_LICENCIA: LegalProfile = {
  basis: ['LRBRL_18', 'LPACAP_16', 'LPACAP_21_3', 'LPACAP_21_4', 'LPACAP_24'],
  acuseDays: 10,
  resolucionMeses: 3, // art. 21.3 LPACAP
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

/**
 * El plazo máximo de resolución de una queja, sin necesidad de enrutarla.
 *
 * La ficha de /quejas/:id no tiene la instantánea de cargos a mano, así que
 * tenía los 30 y los 90 días copiados a mano en un `plazoFor` propio. Una
 * constante copiada de otra es lo mismo que un enum recitado en una prueba: se
 * quedan igual de verdes cuando la de al lado cambia. `routeQueja` publica
 * exactamente esto, y una prueba compara las dos vías.
 *
 * `q` sólo hace falta para distinguir la licencia urbanística del resto de
 * urbanismo, que comparten plazo pero no tipo de silencio; sin ella devuelve el
 * del perfil general de la categoría.
 */
export function plazoDeResolucion(
  category: QuejaCategory,
  q: QuejaInput = { title: '', detail: '' },
): TimeLimit {
  const profile = profileFor(category, q)
  return {
    kind: 'resolucion',
    unit: 'months',
    amount: profile.resolucionMeses,
    basis:
      profile.escalationKey === 'transparencia' ? LEGAL_CATALOG.LTBG_20 : LEGAL_CATALOG.LPACAP_21_3,
  }
}

// ============================================================================
// La hora de la sede
// ============================================================================

/**
 * La zona de la sede electrónica de Riba-roja. El registro «se regirá a efectos
 * de cómputo de los plazos, por la fecha y hora oficial de la sede electrónica de
 * acceso» (art. 31.2 LPACAP), y ésa es la de Madrid: el día en que entra una queja
 * es el del calendario de Madrid, no el de UTC ni el del equipo que lo calcula.
 */
export const ZONA_DE_LA_SEDE = 'Europe/Madrid'

// Día; y si lleva hora (con «T» o con el espacio de SQLite), su zona opcional.
const MARCA_ISO =
  /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?)?$/

/**
 * El instante (ms) de una marca de tiempo ISO, leída en UTC cuando no dice su
 * zona; NaN si no es ISO.
 *
 * `new Date()` lee una fecha con hora y sin zona en hora LOCAL, así que el
 * resultado dependía del equipo que lo calculaba. Medido el 28-09-2026 (PR #150):
 * reconstruido en el Mac del curador (Europe/Madrid), los 30 `monthsAfter` de las
 * relaciones quejas↔contratos se movían dos horas respecto a los de la CI, que
 * construye en UTC, y un par en el borde de la ventana podía entrar o salir.
 *
 * UTC cuando la marca no dice nada, porque es lo que escribe el bot: sus marcas
 * (`created_at`, `registered_at`…) las rellena SQLite con `datetime('now')`, la
 * hora UTC escrita sin la Z. Y una fecha sin hora JavaScript ya la lee a
 * medianoche UTC.
 *
 * Vive aquí, y no en las relaciones, porque el plazo LPACAP lo necesita y este
 * módulo no puede importar nada: el bot lo importa, y su despliegue sólo mira las
 * rutas que bot/src importa directamente (`tests/bot-despliegue.test.js`). Las
 * relaciones lo reexportan: un solo lector, no dos copias de la regex.
 *
 * Fuera de las formas ISO no se adivina: los demás formatos que `Date` acepta
 * los lee en hora local, que es el mismo defecto por otra puerta.
 */
export function instanteUtc(marca: string): number {
  const m = MARCA_ISO.exec(marca)
  if (!m) return NaN
  const [, dia, hora = '00:00', zona = 'Z'] = m
  return Date.parse(`${dia}T${hora}${zona}`)
}

/** El calendario de la sede, por partes: el desfase lo pone el calendario de zonas. */
const CALENDARIO_DE_LA_SEDE = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_DE_LA_SEDE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * El día civil de la sede («AAAA-MM-DD») en que cae una marca del bot; null si
 * no hay marca o no es ISO.
 *
 * Los recibos de la sede del 27-09-2026, presentados en domingo, dicen «Fecha de
 * Registro 28/09/2026 0:00:01»: en UTC, `2026-09-27 22:00:01`. Su día de UTC es
 * el 27, y leída en hora local por un navegador de Madrid, también; el del
 * recibo, y el que cuenta para el plazo, es el 28. El desfase no se escribe a
 * mano: es +01:00 en invierno y +02:00 en verano.
 */
export function diaDeLaSede(marca: string | null | undefined): string | null {
  if (typeof marca !== 'string') return null
  return diaDelInstante(instanteUtc(marca))
}

/** El día civil de la sede en que cae un instante (ms); null si no lo es. */
function diaDelInstante(t: number): string | null {
  if (!Number.isFinite(t)) return null
  const partes = Object.fromEntries(
    CALENDARIO_DE_LA_SEDE.formatToParts(new Date(t)).map((p) => [p.type, p.value]),
  )
  return `${partes.year}-${partes.month}-${partes.day}`
}

/** Un día «AAAA-MM-DD» más unos meses, de fecha a fecha y sin desbordar el mes. */
function sumaMeses(dia: string, meses: number): string {
  const [anio, mes, d] = dia.split('-').map(Number)
  // El día 0 de un mes es el último del anterior: el último del de vencimiento.
  const ultimo = new Date(Date.UTC(anio, mes + meses, 0)).getUTCDate()
  return new Date(Date.UTC(anio, mes - 1 + meses, Math.min(d, ultimo))).toISOString().slice(0, 10)
}

/** Días naturales de un día «AAAA-MM-DD» a otro (los dos, a medianoche UTC). */
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000)
}

/** El día «AAAA-MM-DD» que sigue a otro. */
function diaSiguiente(dia: string): string {
  return new Date(Date.parse(dia) + 86_400_000).toISOString().slice(0, 10)
}

/** ¿Es «AAAA-MM-DD» un día que existe? El 30 de febrero, no. */
function esDiaReal(dia: unknown): dia is string {
  if (typeof dia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false
  const t = Date.parse(dia)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === dia
}

/**
 * El ÚLTIMO día de un plazo fijado en meses («AAAA-MM-DD», en el calendario de la
 * sede) — art. 30.4 LPACAP: «El plazo concluirá el mismo día en que se produjo la
 * notificación, publicación o silencio administrativo en el mes o el año de
 * vencimiento. Si en el mes de vencimiento no hubiera día equivalente a aquel en
 * que comienza el cómputo, se entenderá que el plazo expira el último día del
 * mes». null si la marca de inicio no se puede leer.
 *
 * Ese segundo inciso es el que un `setMonth` a secas se salta: el 31 de enero
 * más un mes da el 3 de marzo, y la norma dice el 28 de febrero.
 *
 * Devuelve un DÍA y no un instante. Hasta el 28-09-2026 devolvía el instante del
 * registro trasladado N meses, y quien lo leía contaba tandas de 24 horas: el bot
 * pasaba una queja registrada a las 11:00 a silencio a las 12:00 de su último día,
 * cuando ese día entero es todavía plazo. Y lo contaba desde el día de UTC, no
 * desde el de la sede (art. 31.2): el recibo «Fecha de Registro 28/09/2026
 * 0:00:01», en UTC `2026-09-27 22:00:01`, vencía el 27 de diciembre y no el 28.
 *
 * Es el día NOMINAL: la prórroga del art. 30.5 —un último día inhábil pasa al
 * primer hábil siguiente— la aplica `relojDelPlazo`, que es lo que leen el bot y
 * las páginas.
 */
export function venceEnMeses(desde: string | null | undefined, meses: number): string | null {
  const inicio = diaDeLaSede(desde)
  return inicio === null ? null : sumaMeses(inicio, meses)
}

/**
 * El plazo dicho en castellano y en su unidad: «10 días», «1 mes», «3 meses».
 *
 * Vive aquí porque lo escriben tres sitios —el bot, el documento del lote y el
 * escrito al Síndic— y porque uno de ellos CITA el artículo justo antes de
 * decirlo: el escrito al Síndic invocaba el art. 21.3 y a continuación lo
 * traducía a «90 días naturales», que no es lo que dice el artículo.
 */
export function plazoHumano(limite: TimeLimit): string {
  if (limite.unit === 'days') return `${limite.amount} días`
  return limite.amount === 1 ? '1 mes' : `${limite.amount} meses`
}

/**
 * Los días naturales que van del día de la sede en que entró la queja al día de
 * la sede de `ahora`: 0 el mismo día de la entrada. null si no se puede leer.
 */
export function diasTranscurridos(
  desde: string | null | undefined,
  ahora: Date | number = Date.now(),
): number | null {
  const inicio = diaDeLaSede(desde)
  const hoy = diaDelInstante(typeof ahora === 'number' ? ahora : ahora.getTime())
  return inicio === null || hoy === null ? null : diasEntre(inicio, hoy)
}

// ============================================================================
// Los días inhábiles de la sede (arts. 30.2, 30.5 y 30.7 LPACAP)
// ============================================================================

/** Quién declara un festivo. El calendario de la sede suma los tres (art. 30.7). */
export const AMBITOS_DEL_FESTIVO = ['nacional', 'autonomico', 'local'] as const
export type AmbitoDelFestivo = (typeof AMBITOS_DEL_FESTIVO)[number]

/** De dónde sale un festivo: la disposición que lo declara, no una web que la copia. */
export interface FuenteDelFestivo {
  /** Quién la dicta y cómo se titula, como la publica el diario oficial. */
  disposicion: string
  /** Diario, número y fecha: «BOE núm. 250, de 17 de octubre de 2025». */
  diario: string
  /** La disposición en el diario oficial, o en la sede que la publica. */
  url: string
}

export interface FestivoDeLaSede {
  /** «AAAA-MM-DD». */
  fecha: string
  /** Como lo nombra la disposición. */
  nombre: string
  ambito: AmbitoDelFestivo
  fuente: FuenteDelFestivo
}

/** Los festivos de cada año. Un año está entero —los tres ámbitos— o no está. */
export type FestivosPorAnio = Readonly<Record<number, readonly FestivoDeLaSede[]>>

/**
 * Las fiestas locales de un año: «no podrán exceder de catorce al año, de las
 * cuales dos serán locales» (art. 37.2 del Estatuto de los Trabajadores).
 */
const FIESTAS_LOCALES_POR_ANIO = 2

/**
 * Dónde puede estar la fuente de un festivo: los diarios oficiales que los
 * declaran (el BOE, el DOGV en gva.es y el BOCM) y las webs del propio
 * ayuntamiento. Una web que copia el calendario no lo declara, y el día que se
 * equivoque no habrá a quién citar.
 *
 * El BOCM entró el 29-09-2026 para el calendario de los ministerios con sede en
 * Madrid (`calendarios-inhabiles.ts`): las fiestas locales de la capital sólo
 * las declara él. La sede de Riba-roja no tiene ningún día de allí.
 */
const HOSTS_OFICIALES = ['boe.es', 'gva.es', 'bocm.es', 'ribarroja.es']

function esFuenteOficial(f: FuenteDelFestivo | undefined): boolean {
  if (!f || typeof f.disposicion !== 'string' || typeof f.diario !== 'string') return false
  if (!f.disposicion.trim() || !f.diario.trim()) return false
  let url: URL
  try {
    url = new URL(f.url)
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase()
  return (
    url.protocol === 'https:' && HOSTS_OFICIALES.some((h) => host === h || host.endsWith(`.${h}`))
  )
}

function problemasDelAnio(anio: number, dias: readonly FestivoDeLaSede[]): string[] {
  if (!Number.isInteger(anio)) return [`${anio}: no es un año`]
  if (!Array.isArray(dias)) return [`${anio}: sin lista de festivos`]
  const problemas: string[] = []
  const vistos = new Set<string>()
  for (const f of dias) {
    const donde = `${anio} · ${f?.fecha}`
    if (!esDiaReal(f?.fecha) || Number(f.fecha.slice(0, 4)) !== anio) {
      problemas.push(`${donde}: fecha que no existe o no es de ${anio}`)
    } else if (vistos.has(f.fecha)) {
      problemas.push(`${donde}: repetida`)
    }
    vistos.add(f?.fecha)
    if (typeof f?.nombre !== 'string' || !f.nombre.trim()) problemas.push(`${donde}: sin nombre`)
    if (!(AMBITOS_DEL_FESTIVO as readonly string[]).includes(f?.ambito as string)) {
      problemas.push(`${donde}: ámbito «${f?.ambito}» desconocido`)
    }
    if (!esFuenteOficial(f?.fuente)) {
      problemas.push(
        `${donde}: sin fuente oficial (disposición, diario y URL https del BOE, el DOGV, el BOCM o el ayuntamiento)`,
      )
    }
  }
  for (const ambito of AMBITOS_DEL_FESTIVO) {
    if (!dias.some((f) => f?.ambito === ambito)) {
      problemas.push(`${anio}: sin festivos de ámbito ${ambito} — un año va entero o no va`)
    }
  }
  const locales = dias.filter((f) => f?.ambito === 'local').length
  if (locales > 0 && locales !== FIESTAS_LOCALES_POR_ANIO) {
    problemas.push(
      `${anio}: ${locales} fiestas de ámbito local, y son ${FIESTAS_LOCALES_POR_ANIO} (art. 37.2 ET)`,
    )
  }
  return problemas
}

/**
 * Lo que impide que un calendario decida un plazo; vacío si puede. Un año que no
 * pasa esto no cuenta como calendario al calcular (`relojDelPlazo`): si contara,
 * el validador sería un aviso y no una puerta.
 */
export function problemasDelCalendario(festivos: FestivosPorAnio): string[] {
  return Object.entries(festivos).flatMap(([anio, dias]) => problemasDelAnio(Number(anio), dias))
}

const BOE_FIESTAS_2026: FuenteDelFestivo = {
  disposicion:
    'Resolución de 17 de octubre de 2025, de la Dirección General de Trabajo, por la que se publica la relación de fiestas laborales para el año 2026',
  diario: 'BOE núm. 259, de 28 de octubre de 2025',
  url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-21667',
}

const DOGV_CALENDARIO_LABORAL_2026: FuenteDelFestivo = {
  disposicion:
    'Decreto 100/2025, de 1 de julio, del Consell, por el que se determina el calendario laboral de aplicación en el ámbito territorial de la Comunitat Valenciana para el año 2026',
  diario: 'DOGV núm. 10145, de 7 de julio de 2025',
  url: 'https://dogv.gva.es/datos/2025/07/07/pdf/2025_24690_es.pdf',
}

// La modificó la Resolución de 13 de enero de 2026 (DOGV núm. 10281, de 15 de
// enero), que cambia Villamalur, Benissoda, Alcosser, Onil y Penàguila, no
// Riba-roja: https://dogv.gva.es/datos/2026/01/15/pdf/2026_1043_va.pdf
const DOGV_FIESTAS_LOCALES_2026: FuenteDelFestivo = {
  disposicion:
    'Resolución de 12 de noviembre de 2025, de la Conselleria de Educación, Cultura, Universidades y Empleo, por la que se aprueba el calendario de fiestas locales, retribuidas y no recuperables, en el ámbito de la Comunitat Valenciana para el año 2026',
  diario: 'DOGV núm. 10238, de 14 de noviembre de 2025',
  url: 'https://dogv.gva.es/datos/2025/11/14/pdf/2025_46326_es.pdf',
}

/**
 * Los festivos de la sede electrónica de Riba-roja de Túria, año a año.
 *
 * La sede fija sus días inhábiles con el calendario de la Comunitat Valenciana,
 * que «comprenderá los días inhábiles de las Entidades Locales» (arts. 31.3 y
 * 30.7 LPACAP); el del Estado para 2026 remite los locales a ese mismo
 * calendario (BOE-A-2025-23702). Son, pues, las fiestas nacionales que rigen en
 * la Comunitat (BOE), las autonómicas que fija el Consell y las dos locales de
 * Riba-roja (DOGV). Ninguna de las tres llega en un formato que se pueda leer
 * sin una persona: el portal de datos abiertos de la Generalitat no tiene el
 * calendario (dadesobertes.gva.es, consultado el 29-09-2026), y las fiestas
 * locales sólo se publican en el PDF del DOGV. Así que se copian a mano, por PR,
 * cada día con la disposición que lo declara, y `problemasDelCalendario` los
 * valida en la suite. Los sábados y los domingos no se escriben: son inhábiles
 * por ley (art. 30.2) y no hace falta calendario para saberlo.
 *
 * Un año se añade ENTERO —nacionales, autonómicos y las dos fiestas locales— o
 * no se añade: el que falta no es un año sin festivos, y un plazo que acaba en
 * él no se calcula (`relojDelPlazo` devuelve `sin-calendario`). El siguiente se
 * puede añadir cuando el DOGV publique sus fiestas locales, hacia noviembre.
 * Cambiar esta tabla redespliega el bot, que la usa para decidir el silencio.
 */
export const FESTIVOS_DE_LA_SEDE: FestivosPorAnio = {
  2026: [
    { fecha: '2026-01-01', nombre: 'Año Nuevo', ambito: 'nacional', fuente: BOE_FIESTAS_2026 },
    {
      fecha: '2026-01-06',
      nombre: 'Epifanía del Señor',
      ambito: 'nacional',
      fuente: BOE_FIESTAS_2026,
    },
    { fecha: '2026-03-19', nombre: 'San José', ambito: 'nacional', fuente: BOE_FIESTAS_2026 },
    { fecha: '2026-04-03', nombre: 'Viernes Santo', ambito: 'nacional', fuente: BOE_FIESTAS_2026 },
    {
      fecha: '2026-04-06',
      nombre: 'Lunes de Pascua',
      ambito: 'autonomico',
      fuente: DOGV_CALENDARIO_LABORAL_2026,
    },
    {
      fecha: '2026-04-13',
      nombre: 'San Vicente Ferrer',
      ambito: 'local',
      fuente: DOGV_FIESTAS_LOCALES_2026,
    },
    {
      fecha: '2026-05-01',
      nombre: 'Fiesta del Trabajo',
      ambito: 'nacional',
      fuente: BOE_FIESTAS_2026,
    },
    {
      fecha: '2026-06-24',
      nombre: 'San Juan',
      ambito: 'autonomico',
      fuente: DOGV_CALENDARIO_LABORAL_2026,
    },
    {
      fecha: '2026-08-15',
      nombre: 'Asunción de la Virgen',
      ambito: 'nacional',
      fuente: BOE_FIESTAS_2026,
    },
    {
      fecha: '2026-09-14',
      nombre: 'Festividad del Cristo',
      ambito: 'local',
      fuente: DOGV_FIESTAS_LOCALES_2026,
    },
    {
      fecha: '2026-10-09',
      nombre: 'Día de la Comunitat Valenciana',
      ambito: 'autonomico',
      fuente: DOGV_CALENDARIO_LABORAL_2026,
    },
    {
      fecha: '2026-10-12',
      nombre: 'Fiesta Nacional de España',
      ambito: 'nacional',
      fuente: BOE_FIESTAS_2026,
    },
    {
      fecha: '2026-12-08',
      nombre: 'Inmaculada Concepción',
      ambito: 'nacional',
      fuente: BOE_FIESTAS_2026,
    },
    {
      fecha: '2026-12-25',
      nombre: 'Natividad del Señor',
      ambito: 'nacional',
      fuente: BOE_FIESTAS_2026,
    },
  ],
}

/**
 * El primer día hábil desde `dia`, él incluido: el último día del plazo con la
 * prórroga del art. 30.5. Un sábado o un domingo es inhábil sin mirar ningún
 * calendario (art. 30.2); un día entre semana, sólo con el calendario de SU año,
 * y si ese año no está entero no se sabe: se devuelve el año que falta.
 */
function primerDiaHabil(
  dia: string,
  festivos: FestivosPorAnio,
): { dia: string } | { sinCalendario: number } {
  // Con la semana y los catorce festivos de un año, no hay racha de inhábiles
  // que llegue a un mes; el tope sólo impide un bucle si la fecha no avanzara.
  for (let d = dia, i = 0; i < 31; i++, d = diaSiguiente(d)) {
    const semana = new Date(Date.parse(d)).getUTCDay()
    if (semana === 0 || semana === 6) continue
    const anio = Number(d.slice(0, 4))
    const delAnio = festivos[anio]
    if (!Array.isArray(delAnio) || problemasDelAnio(anio, delAnio).length > 0) {
      return { sinCalendario: anio }
    }
    if (!delAnio.some((f) => f.fecha === d)) return { dia: d }
  }
  throw new Error(`primerDiaHabil: un mes entero sin días hábiles desde ${dia}`)
}

/**
 * El último día de un plazo en meses, sin el «hoy»: el del art. 30.4 LPACAP
 * (`nominal`) y, si es inhábil en el calendario de quien resuelve, el primer
 * hábil siguiente (art. 30.5).
 *
 * - `calculada`: `ultimoDia` es el nominal o el primer hábil tras él.
 * - `sin-calendario`: el plazo acaba en un año que ese calendario no tiene
 *   entero. No se sabe el último día; sólo que no es anterior al nominal.
 * - `sin-fecha`: `desde` no se puede leer.
 *
 * Es la cuenta de `relojDelPlazo`, que la usa, y la de las solicitudes de
 * acceso de los reportajes (`venceEl`, en solicitud-acceso.ts), que van a otras
 * administraciones y se cuentan con SU calendario (`calendarios-inhabiles.ts`).
 * Una sola cuenta para las dos: la de las solicitudes era otra, sumaba el mes y
 * no prorrogaba nada.
 */
export type FinDelPlazo =
  | { cuenta: 'calculada'; nominal: string; ultimoDia: string }
  | { cuenta: 'sin-calendario'; anio: number; nominal: string }
  | { cuenta: 'sin-fecha' }

export function finDelPlazoEnMeses(
  desde: string | null | undefined,
  meses: number,
  festivos: FestivosPorAnio = FESTIVOS_DE_LA_SEDE,
): FinDelPlazo {
  const inicio = diaDeLaSede(desde)
  return inicio === null ? { cuenta: 'sin-fecha' } : finDesdeElDia(inicio, meses, festivos)
}

/** `finDelPlazoEnMeses` desde un día de la sede ya leído. */
function finDesdeElDia(
  inicio: string,
  meses: number,
  festivos: FestivosPorAnio,
): Exclude<FinDelPlazo, { cuenta: 'sin-fecha' }> {
  const nominal = sumaMeses(inicio, meses)
  const habil = primerDiaHabil(nominal, festivos)
  return 'sinCalendario' in habil
    ? { cuenta: 'sin-calendario', anio: habil.sinCalendario, nominal }
    : { cuenta: 'calculada', nominal, ultimoDia: habil.dia }
}

/**
 * Cómo está el plazo de resolución de una queja el día de la sede en que cae
 * `ahora`. Es la única cuenta: la leen el bot (el paso a silencio), la ficha de
 * /quejas/:id, el panel de /quejas/dashboard y el escrito al Síndic.
 *
 * - `calculada`: el último día es el del art. 30.4 (`nominal`) o, si es inhábil,
 *   el primer hábil siguiente (art. 30.5). `quedan` es 0 durante todo ese día y
 *   negativo desde las 00:00 del siguiente en Madrid, que es cuando se produce el
 *   silencio; `dias` es lo que dura, del día de entrada al último.
 * - `sin-calendario`: el plazo acaba en un año cuyo calendario de inhábiles no
 *   está (entero) en `FESTIVOS_DE_LA_SEDE`. No se da último día ni cuenta de
 *   días, y quien lo lea no puede dar el plazo por vencido. Hasta el día nominal
 *   sí es seguro que sigue abierto —la prórroga sólo lo alarga—: eso es
 *   `quedanAlNominal` ≥ 0.
 * - `sin-fecha`: la marca de registro no se puede leer.
 * - `en-dias`: un plazo en días, que son HÁBILES (art. 30.2): se descuentan del
 *   cómputo todos los inhábiles, no sólo se prorroga el último. Es otra cuenta, y
 *   nada la publica todavía.
 */
export type RelojDelPlazo =
  | { cuenta: 'calculada'; nominal: string; ultimoDia: string; dias: number; quedan: number }
  | { cuenta: 'sin-calendario'; anio: number; nominal: string; quedanAlNominal: number }
  | { cuenta: 'sin-fecha' }
  | { cuenta: 'en-dias' }

export function relojDelPlazo(
  limite: TimeLimit,
  desde: string | null | undefined,
  ahora: Date | number = Date.now(),
  festivos: FestivosPorAnio = FESTIVOS_DE_LA_SEDE,
): RelojDelPlazo {
  if (limite.unit !== 'months') return { cuenta: 'en-dias' }
  const hoy = diaDelInstante(typeof ahora === 'number' ? ahora : ahora.getTime())
  // `ahora` lo pone quien llama, no un dato: si no es un instante, es un fallo
  // de programación, y callarlo como «sin fecha» lo escondería.
  if (hoy === null) throw new TypeError(`relojDelPlazo: «ahora» no es un instante (${ahora})`)
  const inicio = diaDeLaSede(desde)
  if (inicio === null) return { cuenta: 'sin-fecha' }
  const fin = finDesdeElDia(inicio, limite.amount, festivos)
  if (fin.cuenta === 'sin-calendario') {
    return { ...fin, quedanAlNominal: diasEntre(hoy, fin.nominal) }
  }
  return {
    ...fin,
    dias: diasEntre(inicio, fin.ultimoDia),
    quedan: diasEntre(hoy, fin.ultimoDia),
  }
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
      unit: 'days',
      amount: profile.acuseDays,
      basis: LEGAL_CATALOG.LPACAP_21_4,
    })
  }
  // Lo mismo que leen las páginas por su cuenta, desde la misma función: si se
  // compusiera aquí otra vez, las dos vías podrían decir cosas distintas.
  timeLimits.push(plazoDeResolucion(category, q))

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

  // Antes era una escalera de `=== 30 ? '1 mes' : === 90 ? '3 meses'`: los
  // mismos dos números otra vez, traducidos a mano a la unidad que ya tenían.
  const resolucionHumano =
    profile.resolucionMeses === 1 ? '1 mes' : `${profile.resolucionMeses} meses`

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
