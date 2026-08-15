#!/usr/bin/env tsx
/**
 * Devolver a las citas re-extraídas la atribución de bloc que ya está
 * publicada, para que un rebuild deje de tirarla.
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
 * byte a byte— y no deduce nada.
 *
 * Ensayo por defecto, y no al revés: el fichero que toca es la entrada de la
 * verificación de un corpus que nombra a grupos municipales.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { arrastrarAtribucion, MOTIVOS_DE_DESCARTE } from '../src/scraper/claim-attribution-carry'

const PUBLICADO = resolve('public/data/pleno-claims-verified.json')
const SUGERENCIAS = resolve('public/data/pleno-claims-suggestions.json')

function main() {
  const escribir = process.argv.includes('--write')
  const pub = JSON.parse(readFileSync(PUBLICADO, 'utf8')) as { items?: unknown[] }
  const sug = JSON.parse(readFileSync(SUGERENCIAS, 'utf8')) as {
    items?: { speakerGroup?: string | null }[]
  }

  const antes = (sug.items ?? []).filter((i) => i?.speakerGroup).length
  const r = arrastrarAtribucion(
    (pub.items ?? []) as never[],
    (sug.items ?? []) as { id?: string; speakerGroup?: string | null; verbatim?: string }[],
  )
  const despues = r.items.filter((i) => i?.speakerGroup).length

  const log = (s: string) => process.stdout.write(`[carry-attribution] ${s}\n`)
  log(`sugerencias: ${r.items.length} cita(s) · atribuidas ${antes} → ${despues}`)
  log(`publicadas con bloc: ${r.stats.intentadas} · arrastradas: ${r.stats.arrastradas}`)
  // Cada categoría por separado. Doblar «no lo intenté» dentro de «sin cambios»
  // es lo que dejó a una pasada informar de 1.017 re-juicios sin una sola
  // llamada al modelo (docs/DATA_INTEGRITY.md, regla 2).
  log(`publicadas cuyo id ya no existe entre las sugerencias: ${r.stats.publicadasSinDestino}`)
  for (const m of MOTIVOS_DE_DESCARTE) log(`descartadas por ${m}: ${r.stats.descartes[m]}`)

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
