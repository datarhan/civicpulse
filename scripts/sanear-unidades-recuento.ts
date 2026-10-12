#!/usr/bin/env tsx
/**
 * sanear-unidades-recuento — migración: quita de las declaraciones ya extraídas
 * los recuentos cuya unidad no es una unidad (src/scraper/unidad-de-recuento.ts).
 *
 *   npm run sanear:unidades-recuento -- --dry-run   # informa, no escribe
 *   npm run sanear:unidades-recuento                # migra las sugerencias
 *   npm run verify:pleno-claims                     # y la CLI dueña recompone
 *
 * POR QUÉ
 * ───────
 * El 2026-10-12, /plenos/10yl550 publicaba «4 millones de euros},» en la
 * cabecera de una declaración: gpt-4o-mini escribió «euros},» como valor de
 * `countUnit` y el esquema lo dejó pasar. El extractor ya lo descarta al
 * extraer; esto arregla lo que se extrajo antes.
 *
 * QUÉ ESCRIBE, Y QUÉ NO
 * ─────────────────────
 * Sólo `public/data/pleno-claims-suggestions.json`, que no es un fichero curado:
 * lo escribe el extractor. NO re-extrae: los ids salen de la ventana y del
 * modelo, y re-extraer un pleno los renombra y deja huérfano lo ya firmado.
 * NO toca `pleno-claims-verified.json` ni los trozos: son de
 * `verify:pleno-claims`, que los recompone desde estas sugerencias —
 * base ⊕ overlay— sin que nadie los edite a mano. El veredicto determinista no
 * lee `count` ni `countUnit`, así que la recomposición no mueve ninguno.
 *
 * Quitar un número de la cabecera retira una afirmación y no añade ninguna: es
 * una bajada, nivel A en automation-policy.ts. La cita verbatim sigue entera.
 *
 * La pasada demuestra lo que hizo: cuenta por motivo y lista cada id, y aborta
 * si algo que no sea `entities.count` / `entities.countUnit` cambiaría.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { resolve } from 'node:path'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import { rechazarOpcionesDesconocidas } from '../src/scraper/opciones-cli'
import { MOTIVOS_DE_DESCARTE, sanearFilas } from '../src/scraper/unidad-de-recuento'

const SUGERENCIAS = resolve('public/data/pleno-claims-suggestions.json')

function sinRecuento(filas: readonly PlenoClaim[]): unknown[] {
  return filas.map((f) => {
    const { count: _c, countUnit: _u, ...resto } = f.entities
    return { ...f, entities: resto }
  })
}

function main() {
  rechazarOpcionesDesconocidas('sanear-unidades', { banderas: ['--dry-run'] })
  const ensayo = process.argv.includes('--dry-run')
  if (!existsSync(SUGERENCIAS)) {
    process.stderr.write(`[sanear-unidades] falta ${SUGERENCIAS}\n`)
    process.exit(1)
  }
  const crudo = readFileSync(SUGERENCIAS, 'utf8')
  const doc = JSON.parse(crudo) as { items: PlenoClaim[] }
  const serializar = (v: unknown) => JSON.stringify(v, null, 2) + '\n'
  if (serializar(doc) !== crudo) {
    throw new Error(
      'el fichero no está en JSON.stringify(x, null, 2) + "\\n": reescribirlo ' +
        'mezclaría formato con datos y el diff no se podría revisar',
    )
  }

  const { filas, descartadas } = sanearFilas(doc.items)

  // La prueba: quitando count y countUnit de TODAS las filas, antes y después
  // son idénticos. Si algo más se moviera, no se escribe nada.
  if (!isDeepStrictEqual(sinRecuento(doc.items), sinRecuento(filas))) {
    throw new Error('la migración cambiaría algo más que count/countUnit — abortado')
  }

  const porMotivo = Object.fromEntries(MOTIVOS_DE_DESCARTE.map((m) => [m, 0])) as Record<
    string,
    number
  >
  for (const d of descartadas) porMotivo[d.motivo] += 1
  process.stdout.write(
    `[sanear-unidades] ${doc.items.length} declaraciones leídas · ${descartadas.length} recuentos ` +
      `descartados (` +
      MOTIVOS_DE_DESCARTE.map((m) => `${m}: ${porMotivo[m]}`).join(' · ') +
      `)\n`,
  )
  for (const d of descartadas) {
    process.stdout.write(
      `[sanear-unidades]   ${d.id} · ${d.motivo} · «${d.count ?? ''} ${d.countUnit}»\n`,
    )
  }
  if (descartadas.length === 0) {
    process.stdout.write('[sanear-unidades] nada que migrar\n')
    return
  }
  if (ensayo) {
    process.stdout.write('[sanear-unidades] --dry-run: no se escribe nada\n')
    return
  }
  writeFileSync(SUGERENCIAS, serializar({ ...doc, items: filas }), 'utf8')
  process.stdout.write(
    `[sanear-unidades] escrito ${SUGERENCIAS}\n` +
      '[sanear-unidades] siguiente paso: npm run verify:pleno-claims (recompone verified + trozos)\n',
  )
}

main()
