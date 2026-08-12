#!/usr/bin/env tsx
/**
 * check:dea — ¿sigue siendo cierto lo que publica /laboratorio/frontera?
 *
 * Dos preguntas distintas, y ninguna la responde una prueba unitaria:
 *
 * 1. **¿Se reproduce?** El snapshot congela puntuaciones que salen de un
 *    remuestreo de dos mil réplicas. La semilla viaja dentro precisamente para
 *    que se puedan volver a calcular: esta guarda rehace el análisis desde
 *    coste-efectivo.json y compara. Si el ministerio revisa una entrega, la
 *    cifra cambia y hay que verlo aquí, no en la página.
 *
 * 2. **¿Nombra a alguien?** La regla editorial de esta superficie es que no se
 *    publica ningún municipio salvo el propio. Es fácil romperla sin querer
 *    —basta añadir un campo de diagnóstico con los `id` de las referencias— y
 *    el efecto es publicar el veredicto de un modelo nuestro sobre veinte
 *    ayuntamientos que no tienen aquí derecho de réplica. Se comprueba sobre el
 *    JSON SERVIDO, no sobre la estructura en memoria.
 *
 * Imprime cuántas comprobaciones hizo. Una guarda que no evaluó nada y una que
 * no encontró nada imprimen el mismo «✓».
 *
 * Usage: npm run check:dea
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CesteRow } from '../src/scraper/coste-efectivo'
import {
  ESPECIFICACIONES,
  INE_PROPIO,
  MOTIVOS_EXCLUSION,
  ESTADOS_ESPECIFICACION,
  analizarEspecificacion,
  type AnalisisEspecificacion,
} from '../src/scraper/dea-especificacion'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const problemas: string[] = []
let comprobaciones = 0
const fail = (msg: string) => problemas.push(msg)

/** Tolerancia al comparar dos cálculos del mismo θ. */
const TOL = 1e-9

async function main() {
  const publicado = JSON.parse(await readFile(join(ROOT, 'public/data/dea.json'), 'utf8'))
  const fuente = JSON.parse(await readFile(join(ROOT, 'public/data/coste-efectivo.json'), 'utf8'))
  const filas: CesteRow[] = [...fuente.pares.filas, ...fuente.municipio.filas]

  const anio = publicado.fuente?.entrega
  if (!Number.isFinite(anio)) {
    console.error('[check-dea] el snapshot no dice de qué entrega habla')
    process.exit(1)
  }
  const miembrosBanda = new Set(filas.filter((f) => f.anio === anio).map((f) => f.ine)).size
  if (miembrosBanda !== publicado.stats?.banda) {
    fail(`banda publicada ${publicado.stats?.banda} pero la fuente trae ${miembrosBanda}`)
  }
  comprobaciones++

  // ── 1. Ningún municipio ajeno, en ningún sitio del fichero servido ────────
  const crudo = JSON.stringify(publicado)
  const ajenos: string[] = []
  for (const f of filas) {
    if (f.ine === INE_PROPIO) continue
    if (crudo.includes(f.ine) || (f.nombre && crudo.includes(f.nombre))) {
      ajenos.push(`${f.ine} ${f.nombre}`)
    }
    comprobaciones++
  }
  for (const a of [...new Set(ajenos)]) {
    fail(
      `«${a}» aparece en dea.json. Esta superficie publica el veredicto de un modelo nuestro: ` +
        'nombrar a un tercero es firmar una afirmación sobre él sin darle derecho de réplica.',
    )
  }

  // ── 2. El análisis se reproduce desde la fuente ───────────────────────────
  const publicadas: AnalisisEspecificacion[] = publicado.especificaciones ?? []
  if (publicadas.length !== ESPECIFICACIONES.length) {
    fail(
      `el snapshot trae ${publicadas.length} especificaciones y el registro tiene ` +
        `${ESPECIFICACIONES.length}: hay que recomponer con npm run compute:dea`,
    )
  }
  let reproducidas = 0
  for (const spec of ESPECIFICACIONES) {
    const pub = publicadas.find((e) => e.id === spec.id)
    if (!pub) {
      fail(`«${spec.id}» está en el registro y no en el snapshot`)
      continue
    }
    if (!ESTADOS_ESPECIFICACION.includes(pub.estado)) {
      fail(`«${spec.id}» tiene un estado fuera del enum: ${pub.estado}`)
    }
    for (const m of Object.keys(pub.cobertura?.excluidas ?? {})) {
      if (!(MOTIVOS_EXCLUSION as readonly string[]).includes(m)) {
        fail(`«${spec.id}» cuenta exclusiones bajo un motivo desconocido: ${m}`)
      }
      comprobaciones++
    }

    const rehecho = analizarEspecificacion(spec, {
      filas,
      anio,
      miembrosBanda,
      replicas: publicado.modelo?.replicas ?? 2000,
      alfa: publicado.modelo?.alfa ?? 0.05,
    })
    comprobaciones++

    if (rehecho.estado !== pub.estado) {
      fail(`«${spec.id}»: publicada como ${pub.estado} y ahora sale ${rehecho.estado}`)
      continue
    }
    if (rehecho.cobertura.incluidas !== pub.cobertura.incluidas) {
      fail(
        `«${spec.id}»: ${pub.cobertura.incluidas} unidades publicadas contra ` +
          `${rehecho.cobertura.incluidas} recalculadas`,
      )
    }
    const suma = Object.values(pub.cobertura.excluidas).reduce((a, b) => a + b, 0)
    if (suma + pub.cobertura.incluidas !== pub.cobertura.banda) {
      fail(
        `«${spec.id}»: la cobertura no cuadra — ${pub.cobertura.incluidas} + ${suma} ≠ ` +
          `${pub.cobertura.banda}`,
      )
    }
    comprobaciones++

    if (pub.estado !== 'publicada') {
      if (pub.propia !== null || pub.distribucion !== null) {
        fail(`«${spec.id}» está marcada insuficiente pero publica puntuación`)
      }
      reproducidas++
      continue
    }
    const a = pub.propia!
    const b = rehecho.propia!
    for (const campo of ['theta', 'thetaCorregido', 'thetaCrs', 'escala'] as const) {
      if (Math.abs(a[campo] - b[campo]) > TOL) {
        fail(`«${spec.id}».${campo}: publicado ${a[campo]} contra ${b[campo]} recalculado`)
      }
      comprobaciones++
    }
    if (
      Math.abs(a.ic.inferior - b.ic.inferior) > TOL ||
      Math.abs(a.ic.superior - b.ic.superior) > TOL
    ) {
      fail(`«${spec.id}»: el intervalo no se reproduce con la semilla publicada`)
    }
    // Invariantes que la página da por hechos al pintar.
    if (!(a.theta > 0 && a.theta <= 1 + TOL)) fail(`«${spec.id}»: θ fuera de (0, 1]`)
    if (a.thetaCorregido > a.theta + TOL) fail(`«${spec.id}»: la corrección sube en vez de bajar`)
    if (a.thetaCrs > a.theta + TOL) fail(`«${spec.id}»: CRS por encima de VRS`)
    if (a.intervaloAcotaPorAbajo !== !a.ic.truncadoInferior) {
      fail(`«${spec.id}»: el aviso de intervalo sin cota no coincide con el intervalo`)
    }
    const d = pub.distribucion!
    if (d.n !== pub.cobertura.incluidas)
      fail(`«${spec.id}»: la distribución no cuenta las unidades`)
    if (d.autorreferentes > d.eficientes) fail(`«${spec.id}»: más autorreferentes que eficientes`)
    const enHistograma = d.histograma.reduce((s, h) => s + h.n, 0)
    if (enHistograma !== d.n) {
      fail(`«${spec.id}»: el histograma suma ${enHistograma} y la muestra son ${d.n}`)
    }
    comprobaciones += 6
    reproducidas++
  }

  console.log(
    `[check-dea] ${comprobaciones} comprobaciones · ${reproducidas}/${ESPECIFICACIONES.length} ` +
      `especificaciones reproducidas · ${filas.length} filas revisadas por si nombraban a un tercero`,
  )
  if (comprobaciones === 0 || reproducidas === 0) {
    console.error('[check-dea] no se evaluó NADA — la guarda está muerta')
    process.exit(1)
  }
  if (problemas.length) {
    for (const p of problemas) console.error(`  ✗ ${p}`)
    console.error(`[check-dea] ${problemas.length} problema(s)`)
    process.exit(1)
  }
  console.log('[check-dea] ✓ el experimento se reproduce y no nombra a nadie más que a Riba-roja')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
