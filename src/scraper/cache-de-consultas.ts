/**
 * La caché de los vectores de consulta del verificador.
 *
 * La huella del shortlist (`huellaDeCandidatos`, verifier-runner.ts) va en la
 * clave de cada llamada del motor de veredictos, y lleva la similitud de cada
 * candidato redondeada a dos decimales: la que el prompt le enseña al modelo
 * (`· sim=0.29`). Esa similitud sale del vector de la declaración, que se pedía
 * a OpenAI de nuevo en cada pasada, y OpenAI no lo devuelve siempre idéntico.
 * Medido el 11-10-2026 sobre las 59 consultas que embebe el eval del oro, seis
 * peticiones de cada una: 12 trajeron más de un vector, con cosenos que se
 * movían hasta 0,0009. Basta para que un coseno junto a la frontera de redondeo
 * (x,xx5) salga 0,29 en una pasada y 0,30 en otra, o para que dos candidatos
 * cambien de orden; la clave cambia y la caché no contesta. Tres repeticiones
 * del eval desde la caché reprodujeron 60, 58 y 59 de sus 61 filas, y un ensayo
 * en seco seguido de la pasada real podía volver a preguntar una declaración y
 * escribir algo distinto de lo ensayado.
 *
 * Con el vector guardado, el shortlist de una declaración depende sólo de su
 * texto, del corpus y de los datos: la segunda pasada lee el vector que usó la
 * primera.
 *
 * Sacar la similitud de la huella no lo arreglaba. El prompt la enseña, y una
 * clave que no cubre lo que lee el modelo sirve la respuesta de otra pregunta.
 * Y no bastaba: de los tres shortlists que variaron en aquella medición, uno
 * cambió de orden, no de similitud.
 *
 * La clave es el embedder que construyó el corpus —su sidecar `.model`, p. ej.
 * `openai:text-embedding-3-small:1536`— y el texto exacto de la consulta. El
 * vector se guarda en JSON, que devuelve el mismo `number` que se guardó: con
 * menos precisión (Float32, decimales) el coseno volvería a moverse.
 *
 * El primero que guarda gana (`link`, que no pisa): dos pasadas a la vez sobre
 * la misma declaración acaban usando el mismo vector. Una entrada ilegible o de
 * otra consulta se rehace, en vez de dejar la consulta sin guardar para siempre.
 *
 * Las entradas viven junto al corpus (`Corpus.dirDeConsultas`, que pone
 * `loadCorpus`): en un checkout, `.embed-cache/consultas/`. Un ensayo en seco en
 * un worktree vale para la pasada real en otro checkout sólo si viajan juntas
 * `.llm-cache/` y `.embed-cache/consultas/`: sin el vector, la real pide uno
 * nuevo y su clave puede no casar.
 *
 * Nunca para al verificador: si no se puede leer o escribir, se embebe como
 * antes y se avisa una vez por directorio.
 */
import { createHash, randomUUID } from 'node:crypto'
import { linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EmbedFn } from './semantic-shortlist'

export interface OpcionesDeLaCache {
  /** Dónde se guardan las entradas: `Corpus.dirDeConsultas`. */
  dir: string
  /** Quién embebe, como lo escribe el sidecar del corpus. */
  embedder: string
  /** El ancho de los vectores del corpus: uno de otro ancho no se guarda. */
  dim?: number
}

interface Entrada {
  embedder: string
  texto: string
  vector: number[]
  /** Cosmético: cuándo se pidió el vector. */
  creado: string
}

/** Los directorios que ya han avisado en este proceso. */
const avisados = new Set<string>()

export function conCacheDeConsultas(embedFn: EmbedFn, opts: OpcionesDeLaCache): EmbedFn {
  return async (texto) => {
    const ruta = join(opts.dir, `${claveDeConsulta(opts.embedder, texto)}.json`)
    const guardado = leer(ruta, opts.embedder, texto, opts.dim)
    if (guardado) return guardado
    const vector = await embedFn(texto)
    // Quien llama rechaza un ancho que no es el del corpus con su propio error
    // (assertQueryDimMatchesCorpus); aquí sólo no se guarda.
    if (!esVector(vector, opts.dim)) return vector
    const entrada: Entrada = {
      embedder: opts.embedder,
      texto,
      vector,
      creado: new Date().toISOString(),
    }
    try {
      return guardar(opts.dir, ruta, entrada, opts.dim)
    } catch (err) {
      if (!avisados.has(opts.dir)) {
        avisados.add(opts.dir)
        process.stderr.write(
          `[cache-de-consultas] no se pudo guardar en ${opts.dir} (${(err as Error).message}): ` +
            'cada pasada vuelve a pedir el vector de consulta, y el shortlist puede cambiar entre pasadas\n',
        )
      }
      return vector
    }
  }
}

function claveDeConsulta(embedder: string, texto: string): string {
  return createHash('sha256')
    .update(JSON.stringify([embedder, texto]))
    .digest('hex')
}

function esVector(v: unknown, dim?: number): v is number[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    (dim === undefined || v.length === dim) &&
    v.every((x) => typeof x === 'number' && Number.isFinite(x))
  )
}

/** El vector guardado para esta consulta, o null si no hay uno que le sirva. */
function leer(ruta: string, embedder: string, texto: string, dim?: number): number[] | null {
  let e: Partial<Entrada> | null
  try {
    e = JSON.parse(readFileSync(ruta, 'utf8'))
  } catch {
    return null
  }
  return e?.embedder === embedder && e.texto === texto && esVector(e.vector, dim) ? e.vector : null
}

/**
 * Guarda la entrada si nadie lo ha hecho antes y devuelve el vector que queda
 * guardado. `link` es atómico y no pisa: si otra pasada guardó primero, vale el
 * suyo. Se escribe aparte y se enlaza, así que nadie lee una entrada a medias.
 */
function guardar(dir: string, ruta: string, entrada: Entrada, dim?: number): number[] {
  mkdirSync(dir, { recursive: true })
  const tmp = `${ruta}.${randomUUID()}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(entrada))
    try {
      linkSync(tmp, ruta)
      return entrada.vector
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
    const primero = leer(ruta, entrada.embedder, entrada.texto, dim)
    if (primero) return primero
    renameSync(tmp, ruta)
    return entrada.vector
  } finally {
    rmSync(tmp, { force: true })
  }
}
