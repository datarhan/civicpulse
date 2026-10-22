/**
 * La conversación con la consulta ciudadana de SINAC, compartida por
 * `scrape-agua.ts` (Riba-roja, todas sus redes) y `scrape-agua-pares.ts` (los
 * municipios de la banda, su red principal).
 *
 * Una sesión es una cookie y un orden: entrada → redes del municipio → ficha de
 * una red → detalle de un boletín. Los formularios llevan el municipio y la
 * red, y la página responde con lo que la sesión cree que se le pidió; por eso
 * `leerDetalle` comprueba que el boletín que llega es el que se pidió antes de
 * devolverlo. Pausa fija entre peticiones y el User-Agent del proyecto.
 *
 * Node: el `fetch` nativo no lee HTTPS_PROXY. En un entorno con proxy, corre
 * con NODE_USE_ENV_PROXY=1.
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  parseBoletin,
  parseDetalleRed,
  parseRedes,
  type DetalleRed,
  type Parametro,
  type Red,
} from '../../src/scraper/sinac'
import { decodeHtmlEntities } from '../../src/scraper/normalize'

export const BASE = 'https://sinac.sanidad.gob.es/CiudadanoWeb/ciudadano'
export const ENTRADA = `${BASE}/informacionAbastecimientoActionEntrada.do`
const UA = 'CivicPulse/1.0 (civic monitor Riba-roja; +https://github.com/datarhan/civicpulse)'
const PAUSA_MS = 1200

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface Sesion {
  pedir: (url: string, form?: Record<string, string>) => Promise<string>
  peticiones: () => number
}

export async function abrirSesion(): Promise<Sesion> {
  let cookie = ''
  let n = 0
  const pedir = async (url: string, form?: Record<string, string>) => {
    await esperar(PAUSA_MS)
    n++
    const res = await fetch(url, {
      method: form ? 'POST' : 'GET',
      headers: {
        'User-Agent': UA,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: AbortSignal.timeout(30_000),
    })
    const nuevas = res.headers.getSetCookie?.() ?? []
    if (nuevas.length) cookie = nuevas.map((c) => c.split(';')[0]).join('; ')
    if (!res.ok) throw new Error(`[sinac] ${url} respondió ${res.status}`)
    // La cabecera dice iso-8859-1; el cuerpo es UTF-8 (comprobado el 22-10-2026).
    const html = new TextDecoder('utf-8').decode(await res.arrayBuffer())
    if (html.includes('Debido a un problema técnico'))
      throw new Error(`[sinac] ${url} contestó con su página de error técnico`)
    return html
  }
  await pedir(ENTRADA)
  return { pedir, peticiones: () => n }
}

const formBase = (ine: string, denMunicipio: string, idRed = '') => ({
  codMunicipio: ine,
  codProvincia: ine.slice(0, 2),
  denProvincia: '',
  denComunidad: '',
  denMunicipio,
  idRed,
  provinciaMapa: '',
})

/** Las redes de un municipio y el nombre con el que SINAC lo escribe. */
export async function leerRedes(
  s: Sesion,
  ine: string,
): Promise<{ redes: Red[]; denMunicipio: string }> {
  const html = await s.pedir(`${BASE}/informacionRedes.do`, {
    provinciaMapa: '',
    codComunidad: '10',
    codProvincia: ine.slice(0, 2),
    codMunicipio: ine,
  })
  return {
    redes: parseRedes(html),
    // Atributo HTML crudo: «L&#39;ELIANA» hasta decodificarlo.
    denMunicipio: decodeHtmlEntities(html.match(/name="denMunicipio" value="([^"]*)"/)?.[1] ?? ''),
  }
}

/** La ficha de una red, ya validada: una sección que no sabemos leer lanza. */
export async function leerFicha(
  s: Sesion,
  ine: string,
  denMunicipio: string,
  red: Red,
): Promise<{ html: string; ficha: DetalleRed }> {
  const html = await s.pedir(
    `${BASE}/informacionAbastecimientoActionDetalleRed.do`,
    formBase(ine, denMunicipio, String(red.idRed)),
  )
  const ficha = parseDetalleRed(html)
  if (ficha.seccionesSinReconocer.length)
    throw new Error(
      `[sinac] la red ${red.idRed} trae secciones que no sabemos leer: ` +
        `${ficha.seccionesSinReconocer.join(' · ')} — añadirlas a TIPOS_ANALISIS`,
    )
  if (ficha.boletines.length === 0 && ficha.parametros.length === 0)
    throw new Error(`[sinac] la ficha de la red ${red.idRed} llegó vacía — ¿cambió la página?`)
  return { html, ficha }
}

/**
 * Los parámetros de un boletín, desde la caché por id (un boletín notificado
 * no cambia) o pidiéndolo. Lanza si lo que llega no es el boletín pedido.
 */
export async function leerDetalle(
  s: Sesion,
  ine: string,
  denMunicipio: string,
  red: Red,
  boletin: { id: number; fecha: string },
  cacheDir: string,
): Promise<{ parametros: Parametro[]; descargado: boolean }> {
  const cache = join(cacheDir, `${boletin.id}.html`)
  let html: string
  let descargado = false
  if (existsSync(cache)) html = await readFile(cache, 'utf8')
  else {
    html = await s.pedir(`${BASE}/detalleBoletin.do`, {
      ...formBase(ine, denMunicipio, String(red.idRed)),
      idBoletin: String(boletin.id),
      denRed: red.nombre,
    })
    descargado = true
  }
  const d = parseBoletin(html)
  // La sesión mezcla formularios: un detalle de otra red o de otra fecha no se
  // archiva bajo ésta (ni se guarda en caché).
  if (d.id !== boletin.id || d.fecha !== boletin.fecha || d.red !== red.nombre)
    throw new Error(
      `[sinac] el boletín ${boletin.id} no casa con su fila (${d.id}, ${d.fecha}, ${d.red})`,
    )
  if (descargado) await writeFile(cache, html)
  return { parametros: d.parametros, descargado }
}
