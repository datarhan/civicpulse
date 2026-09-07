/**
 * Entorno de un cargo: del expediente a la persona, nunca al revés.
 *
 * Un cargo puede declarar un patrimonio modesto mientras la sociedad de un
 * familiar cobra los contratos. La forma lícita de mirarlo no es levantar
 * fichas de sus parientes —son particulares— sino partir de lo que ya es
 * público por ser del Ayuntamiento: adjudicatarios, beneficiarios de
 * subvención, personas nombradas en un edicto. Para cada sociedad, la caché
 * del BORME dice quién la administra o la apodera; sólo entonces se pregunta
 * si alguna de esas personas es el propio cargo, un familiar DOCUMENTADO
 * (una «llave»: acta con abstención por parentesco, palabras del propio
 * cargo, prensa atribuida) o alguien que comparte sus dos apellidos (una
 * «pista», que no es nada sin documento). Una persona que no aparece en
 * ningún expediente municipal no sale con nombre en ninguna parte: si
 * comparte apellidos, se cuenta; no se nombra.
 *
 * Puro: sin red ni disco. El CLI (`scripts/journalist-entorno.ts`) lee los
 * snapshots y la caché y escribe sólo bajo `editorial/`.
 */

export interface CampoEntorno {
  etiqueta: string
  valor: string
  valores: string[]
}

export interface AnuncioEntorno {
  numero: number
  denominacion: string
  campos: CampoEntorno[]
  /** Los del BORME (`AnuncioBorme.datosRegistrales`); aquí sólo importa la fecha. */
  datosRegistrales: { fecha: string; [campo: string]: unknown } | null
  texto: string
}

export interface TenderEntorno {
  id: string
  title: string
  assignee: string | null
  status?: string | null
  awardDate?: string | null
  finalAmount?: number | null
}

export interface BdnsEntorno {
  id: string | number
  description?: string
  beneficiary?: string | null
  beneficiario?: string | null
}

export interface BopEntorno {
  id: string
  title: string
}

export type TipoContraparte = 'contrato' | 'subvencion' | 'edicto'

export interface Contraparte {
  /** Como aparece en el expediente. */
  nombre: string
  /** Normalizado para casar con la denominación del BORME. */
  clave: string
  tipo: TipoContraparte
  refs: string[]
  esPersona: boolean
}

export interface Llave {
  nombre: string
  parentesco: string
  documento: { titulo: string; url?: string; fecha: string; extracto?: string }
}

export interface Concejal {
  slug: string
  nombre: string
  rol?: string
}

export interface HallazgoRol {
  persona: string
  etiqueta: string
  empresa: string | null
  contraparte: string
  tipo: TipoContraparte
  refs: string[]
  bormeNumero: number | null
  fecha: string | null
  /** El párrafo del BORME, capado a 500: lo que se cita. */
  texto: string | null
}

export interface HallazgoLlave extends HallazgoRol {
  parentesco: string
  documento: Llave['documento']
}

export interface LlaveSinExpediente {
  persona: string
  etiqueta: string
  empresa: string
  parentesco: string
  bormeNumero: number
  fecha: string | null
}

export interface Abstencion {
  sesion: string
  fecha: string | null
  linea: number
  texto: string
  mencionaAlCargo: boolean
}

export interface Recuento {
  contrapartes: number
  empresasResueltasEnBorme: number
  propio: number
  llaveDocumentada: number
  pistaApellidos: number
  contrapartesConApellidos: number
  abstenciones: number
  ruidoUnApellido: number
  fueraDeExpedientes: number
  llaveSinExpediente: number
}

export interface Entorno {
  propio: HallazgoRol[]
  llaveDocumentada: HallazgoLlave[]
  pistaApellidos: HallazgoRol[]
  contrapartesConApellidos: Array<{ contraparte: string; tipo: TipoContraparte; refs: string[] }>
  llaveSinExpediente: LlaveSinExpediente[]
  abstenciones: Abstencion[]
  recuento: Recuento
}

// ─── Normalización ─────────────────────────────────────────────────────────

const plegar = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

const tokens = (s: string): string[] =>
  plegar(s)
    .split(/[^A-Z0-9Ñ]+/)
    .filter(Boolean)

const FORMAS_JURIDICAS =
  /\b(SOCIEDAD LIMITADA UNIPERSONAL|SOCIEDAD LIMITADA LABORAL|SOCIEDAD LIMITADA NUEVA EMPRESA|SOCIEDAD LIMITADA|SOCIEDAD ANONIMA UNIPERSONAL|SOCIEDAD ANONIMA LABORAL|SOCIEDAD ANONIMA|SOCIEDAD COOPERATIVA VALENCIANA|SOCIEDAD COOPERATIVA|SOCIEDAD CIVIL|COMUNIDAD DE BIENES|EN LIQUIDACION|EN CONCURSO|S L U|S L L|S L N E|S L|S A U|S A L|S A|S C O O P|S COOP V|S COOP|S C P|C B|SLU|SLL|SLNE|SL|SAU|SAL|SA|SCOOP|SCP|CB|AIE|UTE)\b/g

/**
 * Nombre de sociedad comparable entre un expediente («PAVASAL EMPRESA
 * CONSTRUCTORA, S.A.») y el BORME («PAVASAL EMPRESA CONSTRUCTORA SA»): sin
 * acentos, sin puntuación, sin forma jurídica ni estado concursal.
 */
export function normalizarEmpresa(s: string): string {
  return plegar(s)
    .replace(/[.,;:'"()/&-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(FORMAS_JURIDICAS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const PALABRAS_DE_EMPRESA =
  /\b(EMPRESA|CONSTRUC|SERVICIO|SERVEIS|PROYECTO|OBRA|OBRES|ACTIVIDAD|ACTIVITAT|SUMINISTRO|INGENIER|CONSULTOR|ASESOR|GRUPO|GRUP|CENTRO|CENTRE|ASOCIACI|FUNDACI|CLUB|COOPERATIVA|COMERCIAL|INDUSTRIA|TALLER|GESTION|GESTIO|TECNOLOG|SISTEMAS|INSTALACION|LIMPIEZA|SEGURIDAD|FORMACION|FORMACIO|EVENTOS|OCIO|TRANSPORTE|LOGISTIC|ENERG|DISTRIBUC|HOSTELER|RESTAURA|MEDIC|CLINIC|FARMAC|ESTUDIO|DESARROLLO|COMUNICACION|MARKETING|DISEÑO|DIGITAL|SOLUCION|INTEGRAL|MANTENIMIENTO|JARDIN|VIAL|PAVIMENT|ELECTRIC|IBERIA|ESPAÑA|EUROPA|VALENCIA|LEVANTE|MEDITERRANE)/

/** Un adjudicatario que parece persona física: sin forma jurídica, pocas palabras, sin léxico de empresa. */
function pareceParticular(nombre: string): boolean {
  const original = plegar(nombre).replace(/[.,;:'"()/&-]+/g, ' ')
  if (FORMAS_JURIDICAS.test(original)) {
    FORMAS_JURIDICAS.lastIndex = 0
    return false
  }
  FORMAS_JURIDICAS.lastIndex = 0
  const t = tokens(nombre)
  if (t.length < 2 || t.length > 5) return false
  if (t.some((x) => /\d/.test(x))) return false
  return !PALABRAS_DE_EMPRESA.test(original)
}

// ─── Contrapartes ──────────────────────────────────────────────────────────

const PERSONA_EN_EDICTO =
  /\b(?:D\.?ª|Dª|D\.|Don|Doña|Dna\.?|Sr\.|Sra\.|En|Na)\s+((?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ'-]+)(?:\s+(?:(?:de|del|la|las|los|y|i)\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ'-]+){1,4})/

export function contrapartesDe(datos: {
  tenders: TenderEntorno[]
  bdns: BdnsEntorno[]
  bop: BopEntorno[]
}): Contraparte[] {
  const out: Contraparte[] = []
  const porClave = new Map<string, Contraparte>()
  const añadir = (nombre: string, tipo: TipoContraparte, ref: string): void => {
    const limpio = nombre.replace(/\s+/g, ' ').trim()
    if (!limpio) return
    const clave = normalizarEmpresa(limpio)
    if (!clave) return
    const k = `${tipo}:${clave}`
    const existente = porClave.get(k)
    if (existente) {
      if (!existente.refs.includes(ref)) existente.refs.push(ref)
      return
    }
    const c: Contraparte = {
      nombre: limpio,
      clave,
      tipo,
      refs: [ref],
      esPersona: pareceParticular(limpio),
    }
    porClave.set(k, c)
    out.push(c)
  }
  for (const t of datos.tenders) {
    if (t.assignee) añadir(t.assignee, 'contrato', t.id)
  }
  for (const b of datos.bdns) {
    const nombre = b.beneficiary ?? b.beneficiario
    if (nombre) añadir(nombre, 'subvencion', String(b.id))
  }
  for (const b of datos.bop) {
    const m = b.title.match(PERSONA_EN_EDICTO)
    if (m) añadir(m[1], 'edicto', b.id)
  }
  return out
}

// ─── Cargos societarios ────────────────────────────────────────────────────

const ETIQUETA_DE_ROL =
  /^(Adm|Administrador|Apo|Consej|Cons\.|Presid|Vicepresid|Secretar|Vicesecretar|Liq|Socio|Auditor|Representan|Director|Gerente|Tesorer|Vocal|Miembro|Con\.Del|Cons\.Del)/i
const ETIQUETA_SIN_PERSONA =
  /^(FIRME|Juez|Resoluciones|Ceses|Nombramientos|Revocaciones|Reelecciones)$/i

/** Las personas con cargo societario que nombra un anuncio; el juez y la firmeza no son cargos. */
export function rolesDelAnuncio(a: AnuncioEntorno): Array<{ etiqueta: string; persona: string }> {
  const out: Array<{ etiqueta: string; persona: string }> = []
  for (const c of a.campos) {
    const etiqueta = c.etiqueta.trim()
    if (ETIQUETA_SIN_PERSONA.test(etiqueta) || !ETIQUETA_DE_ROL.test(etiqueta)) continue
    for (const v of c.valores) {
      const persona = v.replace(/\s+/g, ' ').trim()
      if (persona) out.push({ etiqueta, persona })
    }
  }
  return out
}

// ─── Cruce ─────────────────────────────────────────────────────────────────

interface Identidad {
  apellidos: [string, string]
  nombrePila: string[]
  rol: RegExp | null
}

function identidadDe(concejal: Concejal): Identidad {
  const t = tokens(concejal.nombre)
  if (t.length < 2) throw new Error(`nombre sin dos apellidos: ${concejal.nombre}`)
  const apellidos: [string, string] = [t[t.length - 2], t[t.length - 1]]
  const nombrePila = t.slice(0, -2)
  const rol = concejal.rol && /alcald/i.test(concejal.rol) ? /\balcald(e|esa|ía|ia)\b/i : null
  return { apellidos, nombrePila, rol }
}

const tiene = (t: string[], palabra: string): boolean => t.includes(palabra)

function coincidenApellidos(persona: string, id: Identidad): 0 | 1 | 2 {
  const t = tokens(persona)
  return ((tiene(t, id.apellidos[0]) ? 1 : 0) + (tiene(t, id.apellidos[1]) ? 1 : 0)) as 0 | 1 | 2
}

function esElPropio(persona: string, id: Identidad): boolean {
  const t = tokens(persona)
  return (
    coincidenApellidos(persona, id) === 2 && id.nombrePila.length > 0 && tiene(t, id.nombrePila[0])
  )
}

function llaveDe(persona: string, llaves: Llave[]): Llave | null {
  const t = tokens(persona)
  for (const l of llaves) {
    const lt = tokens(l.nombre)
    if (lt.length >= 2 && lt.every((x) => tiene(t, x))) return l
  }
  return null
}

export interface Acumulador {
  id: Identidad
  llaves: Llave[]
  porClave: Map<string, Contraparte>
  contrapartes: Contraparte[]
  resueltas: Set<string>
  propio: HallazgoRol[]
  llaveDocumentada: HallazgoLlave[]
  pistaApellidos: HallazgoRol[]
  llaveSinExpediente: LlaveSinExpediente[]
  ruidoUnApellido: number
  fueraDeExpedientes: number
}

export function crearAcumulador(
  concejal: Concejal,
  contrapartes: Contraparte[],
  llaves: Llave[],
): Acumulador {
  const porClave = new Map<string, Contraparte>()
  for (const c of contrapartes) if (!c.esPersona && !porClave.has(c.clave)) porClave.set(c.clave, c)
  return {
    id: identidadDe(concejal),
    llaves,
    porClave,
    contrapartes,
    resueltas: new Set(),
    propio: [],
    llaveDocumentada: [],
    pistaApellidos: [],
    llaveSinExpediente: [],
    ruidoUnApellido: 0,
    fueraDeExpedientes: 0,
  }
}

/** Un lote de anuncios del BORME (un año de la caché); se llama tantas veces como ficheros. */
export function acumularBorme(acc: Acumulador, anuncios: AnuncioEntorno[]): void {
  for (const a of anuncios) {
    const roles = rolesDelAnuncio(a)
    if (roles.length === 0) continue
    const contraparte = acc.porClave.get(normalizarEmpresa(a.denominacion))
    const fecha = a.datosRegistrales?.fecha ?? null
    if (!contraparte) {
      for (const r of roles) {
        const llave = llaveDe(r.persona, acc.llaves)
        if (llave) {
          acc.llaveSinExpediente.push({
            persona: r.persona,
            etiqueta: r.etiqueta,
            empresa: a.denominacion,
            parentesco: llave.parentesco,
            bormeNumero: a.numero,
            fecha,
          })
        } else if (coincidenApellidos(r.persona, acc.id) === 2) {
          acc.fueraDeExpedientes++
        }
      }
      continue
    }
    acc.resueltas.add(contraparte.clave)
    for (const r of roles) {
      const base: HallazgoRol = {
        persona: r.persona,
        etiqueta: r.etiqueta,
        empresa: a.denominacion,
        contraparte: contraparte.nombre,
        tipo: contraparte.tipo,
        refs: [...contraparte.refs],
        bormeNumero: a.numero,
        fecha,
        texto: a.texto.slice(0, 500),
      }
      const llave = llaveDe(r.persona, acc.llaves)
      if (llave) {
        acc.llaveDocumentada.push({
          ...base,
          parentesco: llave.parentesco,
          documento: llave.documento,
        })
        continue
      }
      const n = coincidenApellidos(r.persona, acc.id)
      if (n === 2 && esElPropio(r.persona, acc.id)) acc.propio.push(base)
      else if (n === 2) acc.pistaApellidos.push(base)
      else if (n === 1) acc.ruidoUnApellido++
    }
  }
}

/**
 * Un motivo de abstención personal, en castellano o valenciano: «interés
 * directo», «parentesco», «vínculo familiar», el art. 23 de la Ley 40/2015. Una
 * abstención de voto («votar abstenció») no lo es, y «vinculant» no es
 * «vínculo»: se exige la palabra entera.
 */
const MOTIVO_ABSTENCION =
  /(inter[eé]s\s+(directo|personal|propio|directe)|parentesco|parentiu|\bfamiliar\b|v[ií]nculo\s+(familiar|de\s+parentesco)|vincle\s+familiar|incompatib|conflicto\s+de\s+inter|conflicte\s+d.inter|art[íi]culo\s+23|art\.?\s*23|deber\s+de\s+abst|deure\s+d.abst)/i

export function abstencionesDe(
  transcripts: Record<string, string>,
  plenos: Array<{ id: string; date?: string | null }>,
  id: Identidad,
): Abstencion[] {
  const fechaDe = new Map(plenos.map((p) => [p.id, p.date ?? null]))
  const out: Abstencion[] = []
  const nombra = (s: string): boolean => {
    const t = tokens(s)
    return (
      tiene(t, id.apellidos[0]) || tiene(t, id.apellidos[1]) || (id.rol ? id.rol.test(s) : false)
    )
  }
  for (const [sesion, texto] of Object.entries(transcripts)) {
    const lineas = texto.split('\n')
    lineas.forEach((linea, i) => {
      if (!/\babst/i.test(linea) || !MOTIVO_ABSTENCION.test(linea)) return
      const ventana = lineas.slice(Math.max(0, i - 2), i + 3).join('\n')
      out.push({
        sesion,
        fecha: fechaDe.get(sesion) ?? null,
        linea: i + 1,
        texto: linea.slice(0, 300),
        mencionaAlCargo: nombra(ventana),
      })
    })
  }
  return out
}

export function cerrarEntorno(
  acc: Acumulador,
  extra: {
    transcripts: Record<string, string>
    plenos: Array<{ id: string; date?: string | null }>
  },
): Entorno {
  // Contrapartes que son personas físicas: se comparan directamente.
  for (const c of acc.contrapartes) {
    if (!c.esPersona) continue
    const base: HallazgoRol = {
      persona: c.nombre,
      etiqueta: 'contraparte',
      empresa: null,
      contraparte: c.nombre,
      tipo: c.tipo,
      refs: [...c.refs],
      bormeNumero: null,
      fecha: null,
      texto: null,
    }
    const llave = llaveDe(c.nombre, acc.llaves)
    if (llave) {
      acc.llaveDocumentada.push({
        ...base,
        parentesco: llave.parentesco,
        documento: llave.documento,
      })
      continue
    }
    const n = coincidenApellidos(c.nombre, acc.id)
    if (n === 2 && esElPropio(c.nombre, acc.id)) acc.propio.push(base)
    else if (n === 2) acc.pistaApellidos.push(base)
    else if (n === 1) acc.ruidoUnApellido++
  }
  const contrapartesConApellidos = acc.contrapartes
    .filter((c) => !c.esPersona && coincidenApellidos(c.nombre, acc.id) === 2)
    .map((c) => ({ contraparte: c.nombre, tipo: c.tipo, refs: [...c.refs] }))
  const abstenciones = abstencionesDe(extra.transcripts, extra.plenos, acc.id)
  return {
    propio: acc.propio,
    llaveDocumentada: acc.llaveDocumentada,
    pistaApellidos: acc.pistaApellidos,
    contrapartesConApellidos,
    llaveSinExpediente: acc.llaveSinExpediente,
    abstenciones,
    recuento: {
      contrapartes: acc.contrapartes.length,
      empresasResueltasEnBorme: acc.resueltas.size,
      propio: acc.propio.length,
      llaveDocumentada: acc.llaveDocumentada.length,
      pistaApellidos: acc.pistaApellidos.length,
      contrapartesConApellidos: contrapartesConApellidos.length,
      abstenciones: abstenciones.length,
      ruidoUnApellido: acc.ruidoUnApellido,
      fueraDeExpedientes: acc.fueraDeExpedientes,
      llaveSinExpediente: acc.llaveSinExpediente.length,
    },
  }
}

/** Todo de una vez, para pruebas y para cachés pequeñas. El CLI acumula fichero a fichero. */
export function cruzarEntorno(input: {
  concejal: Concejal
  contrapartes: Contraparte[]
  anuncios: AnuncioEntorno[]
  llaves: Llave[]
  transcripts: Record<string, string>
  plenos: Array<{ id: string; date?: string | null }>
}): Entorno {
  const acc = crearAcumulador(input.concejal, input.contrapartes, input.llaves)
  acumularBorme(acc, input.anuncios)
  return cerrarEntorno(acc, { transcripts: input.transcripts, plenos: input.plenos })
}

export interface EstadoFuente {
  estado: 'found' | 'empty' | 'failed'
  n: number
  motivo?: string
}

/** found / empty / failed con motivo: un fichero ausente no es «no había nada». */
export function estadoFuente(n: number | null, motivo?: string): EstadoFuente {
  if (n === null) return { estado: 'failed', n: 0, motivo: motivo ?? 'sin motivo' }
  return n > 0 ? { estado: 'found', n } : { estado: 'empty', n: 0 }
}
