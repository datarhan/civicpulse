#!/usr/bin/env tsx
/**
 * check:coste-esperado — ¿sigue siendo cierto lo que publica
 * /laboratorio/coste-esperado?
 *
 * Calcada de check:dea, con una diferencia que simplifica: aquí no hay azar.
 * El intervalo es analítico, así que la recta se reproduce EXACTA desde la
 * muestra anónima publicada en el propio snapshot — sin caché, sin semilla.
 *
 * Tres niveles, y el que no corre se dice:
 *
 * 1. **Siempre**: la recta y la banda se recalculan desde la muestra publicada
 *    y se comparan campo a campo; los estados contra su enum; la cobertura
 *    suma; los puntos de la muestra llevan exactamente dos claves.
 * 2. **Siempre**: ningún municipio ajeno en el fichero SERVIDO. La lista de
 *    nombres sale del censo CONPREL cacheado si está, y si no, de las filas de
 *    pares de coste-efectivo.json (peor lista, pero lista) — el nivel usado se
 *    imprime, porque «no encontré nombres» con la lista corta no es lo mismo
 *    que con la larga.
 * 3. **Con caché de libros**: el análisis entero se rehace desde el libro
 *    CCAA-17 y se compara. Si el ministerio revisa la entrega, se ve aquí.
 *    Sin caché ese nivel NO corre y lo dice — una guarda que calla lo que no
 *    comprobó imprime su propio all-clear.
 *
 * Usage: npm run check:coste-esperado
 */
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCeselInforme } from '../src/scraper/coste-efectivo'
import { parseConprelRoster } from '../src/scraper/budget'
import {
  INE_PROPIO,
  ESTADOS_ESPERADO,
  MOTIVOS_EXCLUSION_ESPERADO,
  ajustarOls,
  intervaloPrediccion,
  analizarServicio,
  type AnalisisEsperado,
} from '../src/scraper/coste-esperado'
import { SERVICIOS } from '../src/scraper/indicador-registry'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CCAA_DIR = join(ROOT, '.cache/cesel/ccaa')
const CONPREL = join(ROOT, '.cache/cesel/conprel-cv.xls')

const problemas: string[] = []
let comprobaciones = 0
const fail = (msg: string) => problemas.push(msg)

const TOL = 1e-9

type EspecPublicada = AnalisisEsperado & { label?: string }

async function main() {
  const publicado = JSON.parse(
    await readFile(join(ROOT, 'public/data/coste-esperado.json'), 'utf8'),
  )
  const crudo = JSON.stringify(publicado)
  const especs: EspecPublicada[] = publicado.especificaciones ?? []

  // ── 1. Registro y reproducción desde la muestra publicada ─────────────────
  const registro = Object.keys(SERVICIOS)
  if (especs.length !== registro.length) {
    fail(
      `el snapshot trae ${especs.length} especificaciones y el registro tiene ` +
        `${registro.length}: hay que recomponer con npm run compute:coste-esperado`,
    )
  }
  let reproducidas = 0
  for (const programa of registro) {
    const e = especs.find((x) => x.programa === programa)
    if (!e) {
      fail(`«${programa}» está en el registro y no en el snapshot`)
      continue
    }
    if (!(ESTADOS_ESPERADO as readonly string[]).includes(e.estado)) {
      fail(`«${programa}» tiene un estado fuera del enum: ${e.estado}`)
    }
    for (const m of Object.keys(e.cobertura?.excluidas ?? {})) {
      if (!(MOTIVOS_EXCLUSION_ESPERADO as readonly string[]).includes(m)) {
        fail(`«${programa}» cuenta exclusiones bajo un motivo desconocido: ${m}`)
      }
      comprobaciones++
    }
    const suma = Object.values(e.cobertura?.excluidas ?? {}).reduce((a, b) => a + b, 0)
    if (e.cobertura.incluidas + suma !== e.cobertura.declarantes) {
      fail(
        `«${programa}»: la cobertura no cuadra — ${e.cobertura.incluidas} + ${suma} ≠ ` +
          `${e.cobertura.declarantes} declarantes`,
      )
    }
    comprobaciones++

    if (e.estado === 'muestra-insuficiente') {
      if (e.modelo !== null || e.propia !== null || (e.muestra ?? []).length > 0) {
        fail(`«${programa}» está marcada insuficiente pero publica modelo, punto o muestra`)
      }
      comprobaciones++
      reproducidas++
      continue
    }

    // La muestra publicada: anónima (dos claves por punto) y ordenada.
    for (const p of e.muestra) {
      const claves = Object.keys(p).sort()
      if (claves.length !== 2 || claves[0] !== 'coste' || claves[1] !== 'poblacion') {
        fail(`«${programa}»: un punto de la muestra trae claves de más: ${claves.join(',')}`)
        break
      }
    }
    for (let i = 1; i < e.muestra.length; i++) {
      if (e.muestra[i].poblacion < e.muestra[i - 1].poblacion) {
        fail(`«${programa}»: la muestra no va ordenada por población — re-identificable`)
        break
      }
    }
    comprobaciones += 2

    const m = ajustarOls(e.muestra)
    for (const campo of ['n', 'alfa', 'beta', 'r2', 'sigma2', 'xMedia', 'sxx', 'tCrit'] as const) {
      if (Math.abs((m[campo] as number) - (e.modelo![campo] as number)) > TOL) {
        fail(`«${programa}».modelo.${campo}: publicado ${e.modelo![campo]} contra ${m[campo]}`)
      }
      comprobaciones++
    }
    if (!(e.modelo!.r2 >= -TOL && e.modelo!.r2 <= 1 + TOL)) {
      fail(`«${programa}»: R² fuera de [0, 1]: ${e.modelo!.r2}`)
    }

    if (e.estado === 'sin-declaracion-propia') {
      if (e.propia !== null) fail(`«${programa}» dice no tener punto propio y publica uno`)
      if (!e.motivoEstado) fail(`«${programa}» calla por qué falta el punto propio`)
      comprobaciones++
      reproducidas++
      continue
    }

    const p = e.propia!
    const banda = intervaloPrediccion(m, p.poblacion)
    if (
      Math.abs(banda.esperado - p.esperado) > TOL ||
      Math.abs(banda.inferior - p.inferior) > TOL ||
      Math.abs(banda.superior - p.superior) > TOL
    ) {
      fail(`«${programa}»: la banda no se reproduce desde la muestra publicada`)
    }
    if (Math.abs(p.razon - p.costeObservado / p.esperado) > TOL) {
      fail(`«${programa}»: razón publicada ${p.razon} ≠ observado/esperado`)
    }
    const dentro = p.costeObservado >= p.inferior && p.costeObservado <= p.superior
    if (dentro !== p.dentroDeLoEsperado) {
      fail(`«${programa}»: dentroDeLoEsperado no coincide con la banda publicada`)
    }
    if (!(p.inferior < p.esperado && p.esperado < p.superior)) {
      fail(`«${programa}»: el esperado queda fuera de su propia banda`)
    }
    comprobaciones += 4
    reproducidas++
  }

  // ── 2. Ningún municipio ajeno en el fichero servido ───────────────────────
  let listaNombres: { ine: string; nombre: string }[] = []
  let nivelLista = ''
  try {
    const roster = parseConprelRoster(await readFile(CONPREL))
    listaNombres = roster.map((r) => ({ ine: r.ine, nombre: r.nombre }))
    nivelLista = `censo CONPREL (${listaNombres.length} municipios)`
  } catch {
    const fuente = JSON.parse(await readFile(join(ROOT, 'public/data/coste-efectivo.json'), 'utf8'))
    const vistos = new Map<string, string>()
    for (const f of fuente.pares?.filas ?? []) vistos.set(f.ine, f.nombre)
    listaNombres = [...vistos].map(([ine, nombre]) => ({ ine, nombre }))
    nivelLista = `pares de coste-efectivo.json (${listaNombres.length} municipios — lista corta: sin caché CONPREL)`
  }
  if (listaNombres.length === 0) fail('no hay lista de municipios contra la que buscar nombres')
  const ajenos: string[] = []
  for (const { ine, nombre } of listaNombres) {
    if (ine === INE_PROPIO) continue
    if ((nombre && crudo.includes(`"${nombre}"`)) || crudo.includes(`"${ine}"`)) {
      ajenos.push(`${ine} ${nombre}`)
    }
    comprobaciones++
  }
  for (const a of [...new Set(ajenos)]) {
    fail(
      `«${a}» aparece en coste-esperado.json. Esta superficie publica el veredicto de un modelo ` +
        'nuestro: nombrar a un tercero es firmar una afirmación sobre él sin derecho de réplica.',
    )
  }

  // ── 3. El análisis entero contra el libro, si la caché está ───────────────
  let contraLibro =
    'sin caché de libros: la comparación contra el libro NO corrió — npm run fetch:cesel-ccaa'
  try {
    const nombres = await readdir(CCAA_DIR)
    const libros = nombres
      .map((n) => ({ n, m: n.match(/^cesel-ccaa17-(\d{4})\.xlsx$/) }))
      .filter((x) => x.m)
      .map((x) => ({ nombre: x.n, anio: Number(x.m![1]) }))
      .sort((a, b) => b.anio - a.anio)
    if (libros.length && listaNombres.length > 60) {
      const libro = libros[0]
      if (libro.anio !== publicado.stats?.entrega) {
        fail(
          `el libro más reciente en caché es de ${libro.anio} y el snapshot habla de ` +
            `${publicado.stats?.entrega}: recomponer con npm run compute:coste-esperado`,
        )
      }
      const filas = parseCeselInforme(await readFile(join(CCAA_DIR, libro.nombre)), {
        anio: libro.anio,
      })
      const poblaciones = new Map(
        parseConprelRoster(await readFile(CONPREL)).map((m) => [m.ine, m.poblacion]),
      )
      let iguales = 0
      for (const programa of registro) {
        const rehecho = analizarServicio(programa, { filas, poblaciones })
        const pub = especs.find((x) => x.programa === programa)
        if (!pub) continue
        if (rehecho.estado !== pub.estado) {
          fail(`«${programa}»: publicada como ${pub.estado} y el libro da ${rehecho.estado}`)
        } else if ((rehecho.modelo?.n ?? -1) !== (pub.modelo?.n ?? -1)) {
          fail(
            `«${programa}»: ${pub.modelo?.n} municipios publicados contra ` +
              `${rehecho.modelo?.n} del libro`,
          )
        } else if (
          rehecho.propia &&
          pub.propia &&
          Math.abs(rehecho.propia.costeObservado - pub.propia.costeObservado) > TOL
        ) {
          fail(`«${programa}»: el coste observado propio no coincide con el libro`)
        } else {
          iguales++
        }
        comprobaciones++
      }
      contraLibro = `rehecho desde ${libro.nombre}: ${iguales}/${registro.length} especificaciones idénticas`
    }
  } catch {
    /* la caché no está: el nivel queda como no corrido, y se dice */
  }

  console.log(
    `[check-coste-esperado] ${comprobaciones} comprobaciones · ${reproducidas}/${registro.length} ` +
      `especificaciones reproducidas desde la muestra publicada`,
  )
  console.log(`[check-coste-esperado] nombres buscados contra: ${nivelLista}`)
  console.log(`[check-coste-esperado] contra el libro: ${contraLibro}`)
  if (comprobaciones === 0 || reproducidas === 0) {
    console.error('[check-coste-esperado] no se evaluó NADA — la guarda está muerta')
    process.exit(1)
  }
  if (problemas.length) {
    for (const p of problemas) console.error(`  ✗ ${p}`)
    console.error(`[check-coste-esperado] ${problemas.length} problema(s)`)
    process.exit(1)
  }
  console.log(
    '[check-coste-esperado] ✓ la recta se reproduce y no se nombra a nadie más que a Riba-roja',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
