#!/usr/bin/env tsx
/**
 * ¿Lleva un fichero comiteado el nombre de alguien en sus METADATOS?
 *
 *   npm run check:metadatos -- --staged    → lo estampado (pre-commit)
 *   npm run check:metadatos                → todo lo rastreado (CI, monitor:health)
 *   npm run check:metadatos -- --historia  → cada versión de cada fichero, en cualquier ref
 *   npm run check:metadatos -- <ruta>…     → ficheros del disco, antes de añadirlos
 *   … --mostrar                            → los valores en claro, para tu máquina
 *
 * La cuarta hermana de `check:secrets`, `check:privado` y `check:editorial`, y
 * hace falta aparte porque las tres leen TEXTO. El 28-09-2026 una fixture real
 * de Hacienda llevaba en su `LastAuthor` y en el registro WRITEACCESS de su
 * libro los nombres de dos personas del ministerio, públicos desde abril, y las
 * tres guardas la habían visto pasar: el nombre vive dentro de la estructura
 * binaria del fichero. Qué se lee y qué se señala está en
 * `src/scraper/metadatos/index.ts`; aquí se enumeran ficheros y se cuenta.
 *
 * Tres cosas que esta guarda hace a propósito:
 *
 *   · Lee el BLOB ESTAMPADO (`git cat-file`), no la copia de trabajo: lo que se
 *     publica es lo que se comitea, y las dos pueden no coincidir.
 *   · ENMASCARA los valores. La CI de un repositorio público publica sus
 *     registros, y una guarda que imprime el nombre que encuentra lo vuelve a
 *     publicar. `--mostrar` los enseña, para mirarlos en tu máquina.
 *   · Una auditoría que no abre NINGÚN fichero sale con 1: «0 señalados» sobre 0
 *     mirados es el visto bueno que no significa nada. Y un fichero ilegible no
 *     cuenta como limpio.
 *
 * Y como sus hermanas: quitar el fichero de la punta no lo saca de la historia.
 * `--historia` dice qué versiones antiguas lo llevan; despublicarlas es otra
 * cosa (reescribir, y borrar las `refs/pull/*` de GitHub).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { enmascarar, esCandidato, revisar } from '../src/scraper/metadatos/index.ts'

export interface Opciones {
  modo: 'estampado' | 'arbol' | 'historia' | 'rutas'
  cwd: string
  rutas?: string[]
  mostrar?: boolean
}

export interface Resultado {
  codigo: 0 | 1
  lineas: string[]
}

interface Pieza {
  ruta: string
  etiqueta: string
  leer: () => Uint8Array
}

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, {
    cwd,
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

/** `git ls-files -s -z`: modo, blob, etapa y ruta. Enlaces y submódulos, fuera. */
function indice(cwd: string, rutas: string[] = []): Array<{ ruta: string; sha: string }> {
  return git(cwd, ['ls-files', '-s', '-z', '--', ...rutas])
    .toString('utf8')
    .split('\u0000')
    .flatMap((linea) => {
      const m = /^(\d{6}) ([0-9a-f]+) \d\t([\s\S]+)$/.exec(linea)
      return m && m[1] !== '120000' && m[1] !== '160000' ? [{ ruta: m[3], sha: m[2] }] : []
    })
}

function piezas(o: Opciones): { total: number; piezas: Pieza[] } {
  const blob = (sha: string) => () => git(o.cwd, ['cat-file', 'blob', sha])
  if (o.modo === 'rutas') {
    const rutas = o.rutas ?? []
    return {
      total: rutas.length,
      piezas: rutas.map((r) => ({
        ruta: r,
        etiqueta: r,
        leer: () => readFileSync(resolve(o.cwd, r)),
      })),
    }
  }
  if (o.modo === 'estampado') {
    const estampados = git(o.cwd, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'])
      .toString('utf8')
      .split('\u0000')
      .filter(Boolean)
    const candidatos = estampados.filter(esCandidato)
    return {
      total: estampados.length,
      piezas: candidatos.length
        ? indice(o.cwd, candidatos).map((i) => ({
            ruta: i.ruta,
            etiqueta: i.ruta,
            leer: blob(i.sha),
          }))
        : [],
    }
  }
  if (o.modo === 'arbol') {
    const todos = indice(o.cwd)
    return {
      total: todos.length,
      piezas: todos
        .filter((i) => esCandidato(i.ruta))
        .map((i) => ({ ruta: i.ruta, etiqueta: i.ruta, leer: blob(i.sha) })),
    }
  }
  // historia: cada blob alcanzable desde cualquier referencia, con la ruta en que apareció
  const vistos = new Set<string>()
  const fuera: Pieza[] = []
  const objetos = git(o.cwd, ['rev-list', '--objects', '--all']).toString('utf8').split('\n')
  for (const linea of objetos) {
    const espacio = linea.indexOf(' ')
    if (espacio < 0) continue
    const sha = linea.slice(0, espacio)
    const ruta = linea.slice(espacio + 1)
    if (!esCandidato(ruta) || vistos.has(sha)) continue
    vistos.add(sha)
    fuera.push({ ruta, etiqueta: `${ruta} @ ${sha.slice(0, 8)}`, leer: blob(sha) })
  }
  return { total: fuera.length, piezas: fuera }
}

const NOMBRE_DEL_MODO = {
  estampado: 'estampado(s)',
  arbol: 'rastreado(s)',
  historia: 'versión(es) en la historia',
  rutas: 'dado(s)',
} as const

export function ejecutar(o: Opciones): Resultado {
  const { total, piezas: lista } = piezas(o)
  let mirados = 0
  let conDatos = 0
  let ilegibles = 0
  let revisados = 0
  const cuerpo: string[] = []

  for (const p of lista) {
    let bytes: Uint8Array
    try {
      bytes = p.leer()
    } catch (e) {
      ilegibles += 1
      cuerpo.push(
        `  ${p.etiqueta} · ilegible: no se pudo leer (${String((e as Error).message).split('\n')[0]})`,
      )
      continue
    }
    const r = revisar(p.ruta, bytes)
    if (r.lectura.estado === 'ajeno') continue
    mirados += 1
    if (r.revisado) {
      revisados += 1
      continue
    }
    if (r.lectura.estado === 'ilegible') {
      ilegibles += 1
      cuerpo.push(`  ${p.etiqueta} · ilegible: ${r.lectura.motivo}`)
      continue
    }
    if (r.hallazgos.length === 0) continue
    conDatos += 1
    for (const h of r.hallazgos) {
      const valor = o.mostrar ? `«${h.valor}»` : enmascarar(h.valor)
      cuerpo.push(`  ${p.etiqueta} · ${h.campo} = ${valor} · ${h.clase}`)
    }
    if (o.modo !== 'historia') {
      cuerpo.push(
        `    en su sitio, sin volver a guardarlo: npm run fixture:sin-autoria -- ${p.ruta}`,
      )
    }
  }

  const auditoriaVacia = mirados === 0 && (o.modo === 'arbol' || o.modo === 'historia')
  const lineas = [
    `[check:metadatos] ${total} fichero(s) ${NOMBRE_DEL_MODO[o.modo]} · ${mirados} de un formato que se mira · ` +
      `${conDatos} con datos personales en sus metadatos · ${ilegibles} ilegible(s)` +
      (revisados ? ` · ${revisados} revisado(s) a mano` : ''),
    ...cuerpo,
  ]
  if (auditoriaVacia) {
    lineas.push('  no se abrió ningún fichero: una auditoría que no mira nada no da el visto bueno')
  }
  if (conDatos || ilegibles) {
    lineas.push(
      '  Lo comiteado queda publicado aunque ninguna página lo enseñe. Si es un órgano o un programa,',
      '  va a AUTORIA_INSTITUCIONAL con su razón (src/scraper/metadatos/index.ts); si lo miró una',
      '  persona y se acepta tal cual, a REVISADOS por su sha256. Valores en claro: -- --mostrar',
    )
  }
  return { codigo: conDatos || ilegibles || auditoriaVacia ? 1 : 0, lineas }
}

function main(): void {
  const args = process.argv.slice(2)
  const rutas = args.filter((a) => !a.startsWith('--'))
  const modo = args.includes('--staged')
    ? 'estampado'
    : args.includes('--historia')
      ? 'historia'
      : rutas.length
        ? 'rutas'
        : 'arbol'
  const r = ejecutar({ modo, cwd: process.cwd(), rutas, mostrar: args.includes('--mostrar') })
  for (const l of r.lineas) console.log(l)
  process.exit(r.codigo)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
