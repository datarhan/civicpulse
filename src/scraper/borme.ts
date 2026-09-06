/**
 * BORME — la sección de empresarios de una provincia, convertida en filas.
 *
 * ## Por qué existe, si estaba declarado imposible
 *
 * `.claude/skills/biografia-concejal/SKILL.md` llevaba tiempo declarando que
 * BORME no tenía camino libre estructurado: «buscar/borme.php 404, libreborme
 * Cloudflare-walled, engines don't index it». Las tres cosas siguen siendo
 * ciertas — y la conclusión ya no, porque la API de datos abiertos del BOE sirve
 * el sumario de BORME en JSON y desde ahí se llega al texto de cada sección
 * provincial. Una limitación declarada que ha dejado de ser cierta es peor que
 * no tenerla: hace que nadie vuelva a intentarlo.
 *
 * ## Qué NO hace este módulo
 *
 * No interpreta. Saca los pares «etiqueta: valor» tal como vienen y los deja
 * ahí, junto al texto verbatim del anuncio. Quién es administrador y quién
 * apoderado, qué significa un cese o si dos nombres son la misma persona, lo
 * decide un curador al firmar la ficha — como en `competencias.ts`. Un parser
 * que dedujera cargos publicaría inferencias sobre personas vivas con la misma
 * tipografía que los hechos.
 *
 * Módulo PURO, sin red: la descarga vive en `borme-fetch.ts`, como en el par
 * `bop.ts` / `bop-fetch.ts`.
 *
 * ## La gramática, que es más regular de lo que parece
 *
 *   <h5 class="articulo">232200 - HIDRAQUA, GESTION INTEGRAL … SA.</h5>
 *   <p class="parrafo">Revocaciones. Apoderado: LOPEZ RODRIGUEZ JOSE IRENEO.
 *     Apo.Sol.: CAMARERO FERNANDEZ MARIA ESTHER.  Datos registrales.
 *     S 8 , H A 44577, I/A 238 ( 8.05.26).</p>
 *
 * El truco para partir los pares es que **los valores van en mayúsculas y las
 * etiquetas no**. No se puede cortar por el punto: las etiquetas los llevan
 * dentro («Apo.Man.Soli:», «Adm. Unico:»). Así que el valor se lee mientras la
 * letra sea mayúscula y se corta en cuanto aparece una minúscula, que sólo puede
 * ser el comienzo de la etiqueta siguiente.
 */

/**
 * Una colección de la API del BOE, siempre como lista.
 *
 * La API **colapsa las colecciones de un solo elemento a objeto**: donde
 * normalmente hay `seccion: [...]` puede venir `seccion: {...}`. Costó dos días
 * de barrido tirados con «object is not iterable» —el 9 y el 10 de mayo de
 * 2024, que sólo traen la sección C—, y sólo se vieron porque el parte cuenta
 * los fallos por separado en vez de sumarlos a «sin resultados».
 */
const comoLista = <T>(v: T | T[] | undefined | null): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v]

export interface SeccionProvincial {
  /** `BORME-A-2026-92-03` */
  id: string
  /** `ALICANTE`, tal como lo titula el sumario. */
  provincia: string
  urlHtml: string
}

/**
 * Las secciones provinciales de «Empresarios. Actos inscritos» de un sumario.
 *
 * Puro a propósito: la descarga vive en `borme-fetch.ts`, y así el caso raro
 * —un día cuya única sección es la C— se prueba con una fixture en vez de con
 * la red.
 */
export function seccionesDelSumario(json: unknown): SeccionProvincial[] {
  const raiz = json as {
    data?: { sumario?: { diario?: unknown } }
  }
  const out: SeccionProvincial[] = []
  for (const diario of comoLista(raiz?.data?.sumario?.diario as Record<string, unknown>[])) {
    for (const seccion of comoLista(diario?.seccion as Record<string, unknown>[])) {
      // Sólo la sección A: actos inscritos. La B son «otros actos» y la C,
      // anuncios y avisos legales — otra cosa y otra forma.
      if (seccion?.codigo !== 'A') continue
      for (const it of comoLista(seccion?.item as Record<string, unknown>[])) {
        const url = it?.url_html as string | undefined
        const id = it?.identificador as string | undefined
        if (!url || !id) continue
        out.push({ id, provincia: String(it?.titulo ?? '').trim(), urlHtml: url })
      }
    }
  }
  return out
}

/** Un par «etiqueta: valor» del cuerpo del anuncio. */
export interface CampoBorme {
  /** «Apoderado», «Adm. Unico», «Socio único». Como lo escribe el BORME. */
  etiqueta: string
  /** El valor entero, verbatim, con sus «;» si trae varios. */
  valor: string
  /** El mismo valor partido por «;», que es como el BORME separa titulares. */
  valores: string[]
}

/** El identificador que hace citable un anuncio: sección, hoja e inscripción. */
export interface DatosRegistrales {
  /** Tomo, cuando el anuncio lo trae. No siempre está. */
  tomo: string | null
  /** Folio, cuando el anuncio lo trae. */
  folio: string | null
  seccion: string
  /** «A 44577» — letra de registro y número de hoja. */
  hoja: string
  inscripcion: string
  /** Tal como viene, «8.05.26». No se normaliza: es lo que cita la ficha. */
  fecha: string
}

export interface AnuncioBorme {
  numero: number
  denominacion: string
  campos: CampoBorme[]
  datosRegistrales: DatosRegistrales | null
  /** El párrafo entero sin etiquetas HTML. Lo que se cita es esto. */
  texto: string
}

const desetiquetar = (s: string): string =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&Aacute;/g, 'Á')
    .replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&Ntilde;/g, 'Ñ')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * `S 8 , H A 44577, I/A 238 ( 8.05.26).` — y a veces con tomo y folio delante:
 * `T 4541 , F 19, S 8, H A 44577, I/A 220 ( 1.02.24).`
 *
 * Tres variantes que el regex no contemplaba y que devolvían `null` en
 * silencio: el prefijo opcional `T … , F …`; un punto suelto antes del
 * paréntesis (`I/A 2 . ( 8.05.26)`); y una inscripción que **no es un número**
 * (`I/A A`). El prefijo `T … , F …` es OPCIONAL y esa opcionalidad costó tres anuncios: el
 * regex exigía que `S` fuera detrás de «Datos registrales.» y devolvía `null`
 * sin decir nada, así que tres de los veinte de Hidraqua se quedaron sin
 * identificador registral —es decir, sin poder citarse— y el barrido no se
 * quejó. Un dato que no se puede citar aquí es un dato que no se publica.
 */
function leerDatosRegistrales(texto: string): DatosRegistrales | null {
  const m = texto.match(
    /Datos registrales\.\s*(?:T\s*(\d+)\s*,\s*F\s*(\d+)\s*,\s*)?S\s*(\d+)\s*,\s*H\s*([A-Z]{1,3}\s*\d+)\s*,\s*I\/A\s*([A-Z0-9]+)\s*\.?\s*\(\s*([\d.]+)\s*\)/i,
  )
  if (!m) return null
  return {
    tomo: m[1] ?? null,
    folio: m[2] ?? null,
    seccion: m[3],
    hoja: m[4].replace(/\s+/g, ' ').trim(),
    inscripcion: m[5],
    fecha: m[6],
  }
}

/**
 * Los pares «etiqueta: valor» del cuerpo.
 *
 * El valor arranca tras los dos puntos y termina donde aparece la primera
 * minúscula, porque los valores del BORME son nombres en mayúsculas y las
 * etiquetas siempre traen alguna minúscula. Luego se recorta la cola hasta el
 * último punto, que es el separador real entre un par y el siguiente.
 */
function leerCampos(cuerpo: string): CampoBorme[] {
  const out: CampoBorme[] = []
  const re = /([^.:;]*(?:\.[^\s.:;][^.:;]*)*)\s*:\s*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cuerpo)) !== null) {
    const etiqueta = m[1].replace(/^[\s.;]+/, '').trim()
    if (!etiqueta) continue
    const desde = m.index + m[0].length
    const resto = cuerpo.slice(desde)

    // Hasta la primera minúscula: ahí empieza la etiqueta siguiente.
    const min = resto.search(/[a-záéíóúñ]/)
    let bruto = min === -1 ? resto : resto.slice(0, min)
    // Y retrocede al último punto, que cierra el valor de verdad.
    const punto = bruto.lastIndexOf('.')
    if (punto !== -1) bruto = bruto.slice(0, punto)

    const valor = bruto
      .replace(/\s+/g, ' ')
      .replace(/[\s;,]+$/, '')
      .trim()
    if (!valor) continue
    out.push({
      etiqueta,
      valor,
      valores: valor
        .split(';')
        .map((v) => v.trim())
        .filter(Boolean),
    })
    re.lastIndex = desde
  }
  return out
}

/**
 * Todos los anuncios de una sección provincial.
 *
 * Ancla en `h5.articulo` + el `p.parrafo` que le sigue, que es la estructura que
 * el BOE emite de forma estable. Un anuncio sin párrafo se descarta: sin cuerpo
 * no hay nada que citar.
 */
export function parseBormeSeccion(html: string): AnuncioBorme[] {
  const out: AnuncioBorme[] = []
  const re =
    /<h5[^>]*class="articulo"[^>]*>([\s\S]*?)<\/h5>\s*<p[^>]*class="parrafo"[^>]*>([\s\S]*?)<\/p>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const cabecera = desetiquetar(m[1])
    const cuerpo = desetiquetar(m[2])
    const enc = cabecera.match(/^(\d+)\s*-\s*(.+?)\.?$/)
    if (!enc) continue
    out.push({
      numero: Number(enc[1]),
      denominacion: enc[2].trim(),
      campos: leerCampos(cuerpo),
      datosRegistrales: leerDatosRegistrales(cuerpo),
      texto: cuerpo,
    })
  }
  return out
}

/** Los anuncios cuya denominación contiene el texto buscado, sin acentos ni caja. */
export function filtrarPorEmpresa(anuncios: AnuncioBorme[], busqueda: string): AnuncioBorme[] {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
  const q = norm(busqueda)
  return anuncios.filter((a) => norm(a.denominacion).includes(q))
}

/**
 * Los anuncios cuyo CUERPO nombra a una persona.
 *
 * El registro imprime a administradores y apoderados dentro del anuncio, con
 * los apellidos delante y en mayúsculas («Adm. Unico: RAGA GADEA ROBERTO
 * PASCUAL»), así que se busca en `texto`, no en la denominación, y sin que
 * importe el orden en que quien pregunta escribe los apellidos. Lo que NO puede
 * ser es laxa con la palabra entera: RAGA dentro de FRAGA es otra persona, y
 * una coincidencia falsa aquí acaba en una ficha que nombra a quien no toca.
 * Cada token tiene que aparecer como palabra completa; una consulta vacía no
 * devuelve nada, nunca «todo».
 */
export function filtrarPorPersona(anuncios: AnuncioBorme[], nombre: string): AnuncioBorme[] {
  const plegar = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
  const tokens = plegar(nombre)
    .split(' ')
    .filter((t) => t.length > 0)
  if (tokens.length === 0) return []
  const patrones = tokens.map(
    (t) => new RegExp(`(^|[^A-Z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^A-Z0-9])`),
  )
  return anuncios.filter((a) => {
    const cuerpo = plegar(a.texto)
    return patrones.every((rx) => rx.test(cuerpo))
  })
}
