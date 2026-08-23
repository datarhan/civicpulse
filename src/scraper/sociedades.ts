/**
 * Quién es la empresa que cobra un servicio municipal — el validador.
 *
 * `public/data/sociedades.json` es un fichero curado A MANO, de la misma clase
 * que `competencias.json`: lo escribe una persona leyendo anuncios del BORME,
 * se revisa en el PR y jamás lo toca la automatización. `scrape:borme` trae el
 * material en bruto a `.cache/`; lo que se publica lo firma alguien.
 *
 * ## Por qué un fichero nuevo y no el registro de entidades
 *
 * `entities.json` son nueve campos DERIVADOS de los adjudicatarios de
 * `tenders.json`, y `entity-overrides.json` sólo guarda alias de nombre con un
 * validador de lista blanca que descarta en silencio cualquier campo extra. No
 * hay dónde colgar un CIF, una hoja registral ni un socio único, y colgarlo de
 * un fichero derivado sería pedir que la próxima ejecución lo borre.
 *
 * ## La regla que lo gobierna: cada dato con su anuncio
 *
 * **Ningún campo se publica sin la referencia del anuncio que lo sostiene.** No
 * es ceremonia: los agregadores mercantiles (axesor, einforma, infoempresa)
 * tienen esta información y son cómodos, pero no son la fuente — son alguien
 * que la copió. Si un dato no aparece en un anuncio concreto del BORME o en un
 * expediente público, no se publica y se dice en `limites` que no se ha podido
 * establecer. Un hueco declarado es información; un hueco rellenado con un
 * agregador es una cita que no resiste.
 *
 * ## Lo que el esquema no permite
 *
 * No hay ningún campo donde quepa un juicio sobre la empresa ni sobre las
 * personas que la administran. Que una sociedad tenga socio único, muchos
 * apoderados o un auditor concreto no es una irregularidad, y el fichero no
 * tiene sitio para insinuar que lo sea. El validador rechaza además los campos
 * del esquema de hallazgos de pleno, por si alguien copia una fila.
 */

/** De dónde sale un dato concreto. Sin esto, el dato no se publica. */
export interface FuenteDato {
  /** Identificador del anuncio: `BORME-A-2023-238-03`, o el expediente. */
  referencia: string
  /** URL resoluble de ese anuncio o expediente. */
  url: string
  /** Fecha de publicación del anuncio, ISO. */
  fecha: string
  /** El texto literal del que sale el dato. Verbatim, sin parafrasear. */
  cita: string
}

/** Un dato con su procedencia pegada. */
export interface DatoSociedad {
  valor: string
  fuente: FuenteDato
}

/** La hoja del Registro Mercantil, que es lo que identifica a la sociedad. */
export interface HojaRegistral {
  registro: string
  hoja: string
  seccion: string
  tomo?: string | null
  folio?: string | null
  fuente: FuenteDato
}

export interface Sociedad {
  /** Clave estable, en kebab-case. */
  id: string
  /** Denominación social literal, como la escribe el registro. */
  denominacion: string
  /** Por qué aparece en este sitio: el servicio municipal que presta. */
  porQueAparece: string
  cif?: DatoSociedad
  hojaRegistral?: HojaRegistral
  /** Socio único, cuando la sociedad es unipersonal. El vínculo con el grupo. */
  socioUnico?: DatoSociedad
  /** Presidencia del consejo, u órgano de administración equivalente. */
  presidencia?: DatoSociedad
  auditor?: DatoSociedad
  /** Otros hechos inscritos que la ficha quiera contar, cada uno con su fuente. */
  hechos: Array<{ que: string; fuente: FuenteDato }>
  /**
   * Lo que la ficha NO dice, y lo que no se ha podido establecer.
   *
   * Obligatorio y no vacío. Una ficha societaria sin límites declarados es una
   * que finge saberlo todo; el precedente es el bloque `limites` del reportaje
   * de basuras.
   */
  limites: string[]
  firmadoEl: string
}

export interface SociedadesSnapshot {
  generatedAt: string
  /** Cómo se obtuvo el material: el barrido, su ventana y su alcance. */
  metodo: string
  sociedades: Sociedad[]
}

/**
 * Campos que no pueden aparecer a ninguna profundidad: los del esquema de
 * hallazgos de pleno (por si se copia una fila) y cualquiera con forma de
 * valoración sobre la empresa o sus administradores.
 */
const PROHIBIDOS = new Set([
  'severity',
  'quotes',
  'individualSpeaker',
  'speakerGroup',
  'valoracion',
  'irregularidad',
  'sospecha',
  'riesgo',
  'puntuacion',
  'nota',
])

const esTexto = (v: unknown, min = 1): v is string =>
  typeof v === 'string' && v.trim().length >= min

const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

function buscarProhibidos(valor: unknown, ruta: string, halladas: string[]): void {
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => buscarProhibidos(v, `${ruta}[${i}]`, halladas))
    return
  }
  if (!valor || typeof valor !== 'object') return
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (PROHIBIDOS.has(k)) halladas.push(`${ruta}.${k}`)
    buscarProhibidos(v, `${ruta}.${k}`, halladas)
  }
}

function validarFuente(f: unknown, donde: string, errores: string[]): void {
  const x = f as Record<string, unknown>
  if (!x || typeof x !== 'object') {
    errores.push(`${donde}: sin fuente — un dato sin anuncio que lo sostenga no se publica`)
    return
  }
  if (!esTexto(x.referencia)) errores.push(`${donde}.fuente.referencia vacía`)
  if (!esTexto(x.url) || !/^https?:\/\//.test(x.url as string))
    errores.push(`${donde}.fuente.url debe ser absoluta`)
  if (!esFecha(x.fecha)) errores.push(`${donde}.fuente.fecha debe ser YYYY-MM-DD`)
  // La cita literal es lo que hace comprobable el dato sin salir de la página.
  // El mínimo no detecta una paráfrasis —ninguna longitud lo hace— pero sí
  // descarta el resumen de una línea que se cuela como cita: «lo dice el BORME»
  // pasaba con el umbral anterior. Un fragmento real de un anuncio no baja de
  // aquí, y lo que la longitud no puede juzgar lo juzga `revisar-borrador`.
  if (!esTexto(x.cita, 25)) errores.push(`${donde}.fuente.cita: hace falta el texto literal`)
}

function validarDato(d: unknown, donde: string, errores: string[]): void {
  const x = d as Record<string, unknown>
  if (!esTexto(x?.valor)) errores.push(`${donde}.valor vacío`)
  validarFuente(x?.fuente, donde, errores)
}

export function validarSociedades(raw: unknown): SociedadesSnapshot {
  const errores: string[] = []
  const r = raw as Record<string, unknown>
  if (!r || typeof r !== 'object') throw new Error('sociedades: el snapshot no es un objeto')

  const prohibidos: string[] = []
  buscarProhibidos(r, '$', prohibidos)
  for (const p of prohibidos) errores.push(`campo prohibido en ${p}`)

  if (typeof r.generatedAt !== 'string') errores.push('generatedAt debe ser una fecha ISO')
  if (!esTexto(r.metodo, 40)) errores.push('metodo: hay que decir cómo se obtuvo el material')

  const lista = Array.isArray(r.sociedades) ? (r.sociedades as unknown[]) : null
  if (!lista) errores.push('sociedades debe ser un array')
  else {
    const ids = new Set<string>()
    lista.forEach((s, i) => {
      const x = s as Record<string, unknown>
      const donde = `sociedades[${i}]`
      for (const campo of ['id', 'denominacion', 'porQueAparece'] as const) {
        if (!esTexto(x[campo])) errores.push(`${donde}.${campo} vacío`)
      }
      if (esTexto(x.id)) {
        if (ids.has(x.id as string)) errores.push(`id duplicado: ${x.id}`)
        ids.add(x.id as string)
      }
      if (!esFecha(x.firmadoEl)) errores.push(`${donde}.firmadoEl debe ser YYYY-MM-DD`)

      for (const campo of ['cif', 'socioUnico', 'presidencia', 'auditor'] as const) {
        if (x[campo] !== undefined) validarDato(x[campo], `${donde}.${campo}`, errores)
      }
      if (x.hojaRegistral !== undefined) {
        const h = x.hojaRegistral as Record<string, unknown>
        for (const campo of ['registro', 'hoja', 'seccion'] as const) {
          if (!esTexto(h?.[campo])) errores.push(`${donde}.hojaRegistral.${campo} vacío`)
        }
        validarFuente(h?.fuente, `${donde}.hojaRegistral`, errores)
      }

      const hechos = Array.isArray(x.hechos) ? (x.hechos as unknown[]) : null
      if (!hechos) errores.push(`${donde}.hechos debe ser un array`)
      else
        hechos.forEach((h, j) => {
          const y = h as Record<string, unknown>
          if (!esTexto(y?.que, 10)) errores.push(`${donde}.hechos[${j}].que vacío`)
          validarFuente(y?.fuente, `${donde}.hechos[${j}]`, errores)
        })

      // Una ficha societaria sin límites declarados finge saberlo todo.
      const limites = Array.isArray(x.limites) ? (x.limites as unknown[]) : null
      if (!limites || limites.length === 0)
        errores.push(`${donde}.limites: una ficha sobre una empresa declara lo que NO establece`)
      else
        limites.forEach((l, j) => {
          if (!esTexto(l, 20)) errores.push(`${donde}.limites[${j}] demasiado corto`)
        })
    })
  }

  if (errores.length) throw new Error(`sociedades inválido:\n  - ${errores.join('\n  - ')}`)
  return r as unknown as SociedadesSnapshot
}
