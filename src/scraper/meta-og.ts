/**
 * La tarjeta que sale al compartir un enlace, una por ruta.
 *
 * EL DEFECTO, medido el 2026-09-09: `/`, `/presupuesto` y un reportaje recién
 * publicado devolvían los tres el mismo `<title>` y el mismo `og:title`. Las
 * etiquetas están bien puestas; el problema es dónde viven. Están en
 * `index.html`, y `vercel.json` reescribe `/(.*)` a ese fichero — así que
 * cualquier URL del sitio sirve el mismo HTML. Los rastreadores de WhatsApp,
 * Telegram, X o LinkedIn **no ejecutan JavaScript**, con lo que ven ese HTML y
 * nunca llegan a lo que la SPA pinta después. Compartir un reportaje daba la
 * ficha del sitio entero, y el `og:url` apuntaba siempre a la portada.
 *
 * EL ARREGLO: escribir un `index.html` POR RUTA dentro de `dist/`, con sus
 * etiquetas ya puestas. Vercel consulta el sistema de ficheros ANTES de aplicar
 * las reescrituras, así que el fichero concreto gana; y como sólo cambian las
 * metaetiquetas —ni los scripts ni el `<div id="root">`—, la SPA arranca igual.
 * No hay servidor nuevo, que es justamente lo que este proyecto no quiere.
 *
 * LA REGLA QUE MÁS IMPORTA: **no se inventa descripción.** Un reportaje tiene
 * título y subtítulo reales, revisados y congelados en su instantánea; una ruta
 * de navegación tiene su etiqueta; y lo que no tiene ninguna de las dos se queda
 * con la del sitio y lo DECLARA en `origen`. Así se puede contar cuántas fichas
 * son de verdad y cuántas son relleno, en vez de que una descripción inventada
 * pase por buena porque suena bien.
 */

export interface MetaRuta {
  ruta: string
  /** El `<title>` completo, tal cual va a la etiqueta. */
  titulo: string
  descripcion: string
  /** Absoluta y canónica: es la que el rastreador enseña bajo el titular. */
  url: string
  /** De dónde salió. `defecto` es relleno, y hay que poder contarlo. */
  origen: 'reportaje' | 'nav' | 'defecto'
}

export interface OpcionesMetas {
  rutas: string[]
  /** ruta → etiqueta de navegación. */
  etiquetas: Record<string, string>
  /** slug → instantánea congelada del reportaje. */
  reportajes: Record<string, { titulo: string; subtitulo: string; estado: string }>
  base: string
  tituloSitio: string
  descripcionSitio: string
}

const PREFIJO_REPORTAJE = '/reportajes/'

export function construirMetas(o: OpcionesMetas): MetaRuta[] {
  const out: MetaRuta[] = []

  for (const ruta of o.rutas) {
    // Una ruta con parámetro no es una página: no hay nada que prerenderizar y
    // escribir `dist/cargos/:slug/index.html` sólo crearía un fichero absurdo.
    if (ruta.includes(':') || ruta.includes('*')) continue

    const url = `${o.base}${ruta}`
    const defecto: MetaRuta = {
      ruta,
      titulo: o.tituloSitio,
      descripcion: o.descripcionSitio,
      url,
      origen: 'defecto',
    }

    if (ruta === '/') {
      out.push(defecto)
      continue
    }

    if (ruta.startsWith(PREFIJO_REPORTAJE)) {
      const slug = ruta.slice(PREFIJO_REPORTAJE.length)
      const r = o.reportajes[slug]
      // Sólo lo PUBLICADO tiene ficha propia. La prosa de un borrador no está
      // firmada, y una tarjeta es publicación.
      if (r && r.estado === 'publicado') {
        out.push({
          ruta,
          titulo: `${r.titulo} · ${o.tituloSitio}`,
          descripcion: r.subtitulo,
          url,
          origen: 'reportaje',
        })
        continue
      }
      out.push(defecto)
      continue
    }

    const etiqueta = o.etiquetas[ruta]
    if (etiqueta) {
      out.push({
        ruta,
        titulo: `${etiqueta} · ${o.tituloSitio}`,
        descripcion: o.descripcionSitio,
        url,
        origen: 'nav',
      })
      continue
    }

    out.push(defecto)
  }

  return out
}

/** Escapa lo que va dentro de un atributo HTML. */
function attr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Escapa lo que va como texto, para el `<title>`. */
function texto(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Sustituye una metaetiqueta, esté en una línea o partida en varias.
 *
 * `[^>]` incluye los saltos de línea, así que el mismo patrón vale para
 * `<meta property="og:title" content="…" />` y para la forma que Prettier deja
 * cuando el contenido es largo, con el atributo y el contenido en renglones
 * distintos. Una versión que sólo entendiera la primera forma dejaría la mitad
 * de la ficha con el texto viejo — y media ficha vieja se ve igual de mal que
 * ninguna.
 *
 * La comilla de cierre en el patrón es lo que impide que `og:image` se coma
 * también a `og:image:type`.
 */
function sustituirMeta(html: string, clave: string, valor: string): string {
  const re = new RegExp(`<meta[^>]*(?:property|name)="${esc(clave)}"[^>]*>`, 'g')
  const nueva =
    clave.startsWith('og:') || clave.startsWith('article:')
      ? `<meta property="${clave}" content="${attr(valor)}" />`
      : `<meta name="${clave}" content="${attr(valor)}" />`
  return re.test(html) ? html.replace(re, nueva) : html
}

export function inyectarMeta(html: string, m: MetaRuta): string {
  let out = html

  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${texto(m.titulo)}</title>`)

  out = sustituirMeta(out, 'description', m.descripcion)
  out = sustituirMeta(out, 'og:title', m.titulo)
  out = sustituirMeta(out, 'og:description', m.descripcion)
  out = sustituirMeta(out, 'og:url', m.url)
  out = sustituirMeta(out, 'twitter:title', m.titulo)
  out = sustituirMeta(out, 'twitter:description', m.descripcion)

  // La canónica no existía en el original. Sin ella, cada ruta prerenderizada
  // sería una página distinta sin decir cuál es la buena.
  const canonica = `<link rel="canonical" href="${attr(m.url)}" />`
  out = /<link rel="canonical"[^>]*>/.test(out)
    ? out.replace(/<link rel="canonical"[^>]*>/, canonica)
    : out.replace('</head>', `  ${canonica}\n  </head>`)

  return out
}

export interface ResumenMetas {
  total: number
  porOrigen: Record<MetaRuta['origen'], number>
  /** Una pasada que no escribió ninguna ficha propia no ha hecho el trabajo. */
  concluyente: boolean
}

export function resumirMetas(metas: MetaRuta[]): ResumenMetas {
  const porOrigen: Record<MetaRuta['origen'], number> = { reportaje: 0, nav: 0, defecto: 0 }
  for (const m of metas) porOrigen[m.origen] += 1
  return {
    total: metas.length,
    porOrigen,
    concluyente: porOrigen.reportaje + porOrigen.nav > 0,
  }
}
