#!/usr/bin/env tsx
/**
 * Devolver a las citas re-extraídas la atribución de bloc que ya está
 * publicada, para que un rebuild deje de tirarla — y sólo la que hoy se podría
 * publicar.
 *
 *   npm run carry:attribution            # ensayo: dice qué haría y no toca nada
 *   npm run carry:attribution -- --write # escribe pleno-claims-suggestions.json
 *
 * Después hay que regenerar la base y el publicado:
 *
 *   npm run verify:pleno-claims
 *
 * El porqué entero está en src/scraper/claim-attribution-carry.ts. En corto: el
 * 13-ago la extracción corrió sobre todos los plenos con un único mapa de voces
 * en disco, y dejó 101 atribuciones donde el corpus publicado tenía 1.362. Esto
 * copia lo publicado a la cita que le corresponde —mismo id Y verbatim idéntico
 * byte a byte— y no deduce nada. Desde #218, además, no devuelve un grupo de un
 * escaño ni uno que el mapa de voces de hoy no dé a ese literal: así volvieron
 * el 15-08 las adivinanzas del extractor retirado, y hubo que retirarlas con
 * firma.
 *
 * Ensayo por defecto, y no al revés: el fichero que toca es la entrada de la
 * verificación de un corpus que nombra a grupos municipales.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  arrastrarAtribucion,
  MOTIVOS_DE_DESCARTE,
  POR_QUE_SE_DESCARTA,
} from '../src/scraper/claim-attribution-carry'
import { resolverDeGrupo } from '../src/scraper/claim-provenance'
import { oneSeatBlocsOf } from '../src/scraper/corporation-seats'
import { plenosConMapa } from '../src/scraper/etiqueta-de-grupo'

const PUBLICADO = resolve('public/data/pleno-claims-verified.json')
const SUGERENCIAS = resolve('public/data/pleno-claims-suggestions.json')
const OFFICIALS = resolve('public/data/officials.json')
const MAPAS = resolve('pleno-speaker-map')
const TRANSCRIPCIONES = resolve('public/data/pleno-transcripts')

const leer = (p: string): string | null => (existsSync(p) ? readFileSync(p, 'utf8') : null)

function main() {
  const escribir = process.argv.includes('--write')
  const log = (s: string) => process.stdout.write(`[carry-attribution] ${s}\n`)

  // Sin la composición no se sabe qué grupo nombra a una persona, y «no lo sé»
  // no puede leerse como «ninguno» (`oneSeatBlocsOf` devuelve null para eso).
  // Falla CERRADO: no se intenta nada.
  const crudo = leer(OFFICIALS)
  const unEscano = crudo === null ? null : oneSeatBlocsOf(JSON.parse(crudo))
  if (unEscano === null) {
    process.stderr.write(
      `[carry-attribution] ABORTADO: ${OFFICIALS} no dice cuántos escaños tiene cada grupo,\n` +
        '  así que no se sabe qué grupo nombra a su concejal por eliminación. No se intenta\n' +
        '  ningún arrastre.\n',
    )
    process.exitCode = 1
    return
  }

  const pub = JSON.parse(readFileSync(PUBLICADO, 'utf8')) as { items?: unknown[] }
  const sug = JSON.parse(readFileSync(SUGERENCIAS, 'utf8')) as {
    items?: { speakerGroup?: string | null }[]
  }

  // Un resolvedor por sesión, construido sólo si alguna cita llega a pedirlo.
  const resolvedores = new Map<string, ReturnType<typeof resolverDeGrupo>>()
  const resolverDe = (pleno: string) => {
    if (!resolvedores.has(pleno)) {
      resolvedores.set(
        pleno,
        resolverDeGrupo(
          leer(join(TRANSCRIPCIONES, `${pleno}.txt`)),
          leer(join(MAPAS, `${pleno}.json`)),
        ),
      )
    }
    return resolvedores.get(pleno) ?? null
  }

  const antes = (sug.items ?? []).filter((i) => i?.speakerGroup).length
  const r = arrastrarAtribucion(
    (pub.items ?? []) as never[],
    (sug.items ?? []) as { id?: string; speakerGroup?: string | null; verbatim?: string }[],
    {
      unEscano,
      conMapa: plenosConMapa(existsSync(MAPAS) ? readdirSync(MAPAS) : []),
      resolverDe,
    },
  )
  const despues = r.items.filter((i) => i?.speakerGroup).length

  log(`sugerencias: ${r.items.length} cita(s) · atribuidas ${antes} → ${despues}`)
  log(`publicadas con bloc: ${r.stats.intentadas} · arrastradas: ${r.stats.arrastradas}`)
  // Cada categoría por separado. Doblar «no lo intenté» dentro de «sin cambios»
  // es lo que dejó a una pasada informar de 1.017 re-juicios sin una sola
  // llamada al modelo (docs/DATA_INTEGRITY.md, regla 2).
  log(`publicadas cuyo id ya no existe entre las sugerencias: ${r.stats.publicadasSinDestino}`)
  for (const m of MOTIVOS_DE_DESCARTE) {
    log(`descartadas por ${m} (${POR_QUE_SE_DESCARTA[m]}): ${r.stats.descartes[m]}`)
  }
  // Con qué se decidió. Un mapa en disco que no se deja cotejar (sin
  // transcripción, ilegible) cuenta arriba como sin-mapa; aquí se dice aparte,
  // para que no se lea como una sesión sin mapa.
  const cotejadas = [...resolvedores.values()].filter(Boolean).length
  log(
    `grupos de un escaño, de officials.json: ${unEscano.length} · ` +
      `sesiones cotejadas con su mapa de voces: ${cotejadas}` +
      (resolvedores.size > cotejadas
        ? ` · con mapa pero sin poder cotejarlo (sin transcripción o ilegible): ` +
          `${resolvedores.size - cotejadas}`
        : ''),
  )

  if (!escribir) {
    log('ENSAYO — no se ha escrito nada. Repite con --write para aplicarlo.')
    return
  }
  if (despues < antes) {
    process.stderr.write('[carry-attribution] ABORTADO: el resultado tiene MENOS atribución\n')
    process.exit(1)
  }
  writeFileSync(SUGERENCIAS, JSON.stringify({ ...sug, items: r.items }, null, 2) + '\n')
  log(`escrito ${SUGERENCIAS}`)
  log('siguiente paso: npm run verify:pleno-claims (regenera la base y el publicado)')
}

main()
