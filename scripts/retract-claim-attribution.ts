#!/usr/bin/env tsx
/**
 * retract-claim-attribution — retirar la atribución de bloc de declaraciones
 * concretas, por id, dejando constancia en el historial.
 *
 *   npm run retract-attribution -- --dry-run --from-check
 *   npm run retract-attribution -- --claim <id> [--claim <id>…] --motivo "…"
 *   npm run retract-attribution -- --from-check --motivo "…"
 *
 * `--from-check` toma exactamente el conjunto que `check:claim-provenance`
 * marca como `partido-distinto`: lo publicado contradice la transcripción
 * vigente. No hay que copiar ids a mano de un informe a un comando, que es
 * como se cuela el id equivocado.
 *
 * SÓLO BAJA. Pone `null` y no sabe poner otra cosa —ver la nota de contrato en
 * `src/scraper/retract-attribution.ts`—. Cambiar `PP` por `VOX` sería un
 * veredicto que sube, y VOX tiene un escaño, así que escribirlo nombraría a
 * una persona por eliminación: eso lo hace un curador con prueba propia, no
 * una alineación de texto.
 *
 * Escribe en los ficheros que REALMENTE llevan el valor —medido, no supuesto:
 * el monolito publicado, las sugerencias (de donde se reconstruye el base), el
 * base gitignorado, y los trozos que lee la SPA. Editar sólo el trozo lo
 * borraría la siguiente reconstrucción.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  emptyTally,
  esCompuesto,
  onlySpeakerGroupMoved,
  retractAttributions,
} from '../src/scraper/retract-attribution'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Todo fichero que puede llevar un `speakerGroup` de una declaración. */
function targetFiles(plenoIds: ReadonlySet<string>): string[] {
  const fixed = [
    'public/data/pleno-claims-verified.json',
    'public/data/pleno-claims-verified-base.json',
    'public/data/pleno-claims-suggestions.json',
    'public/data/auto-curation-bundles.json',
    'public/data/auto-curation-queue.json',
  ]
  const chunks = [...plenoIds].map((p) => `public/data/pleno-claims/${p}.json`)
  return [...fixed, ...chunks].map((p) => join(ROOT, p)).filter((p) => existsSync(p))
}

function argAll(flag: string): string[] {
  const out: string[] = []
  for (let i = 0; i < process.argv.length; i++)
    if (process.argv[i] === flag) out.push(process.argv[i + 1])
  return out.filter(Boolean)
}
function argOne(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}

/** Los ids que `check:claim-provenance` marca `partido-distinto`, sin copiarlos a mano. */
function idsFromCheck(): string[] {
  // El check SALE 1 a propósito cuando encuentra algo, que es exactamente
  // cuando esto se usa. Tratar ese 1 como un fallo dejaría la herramienta sin
  // poder leer nunca su propia entrada — así que se lee el stdout igual y sólo
  // se aborta si no vino nada.
  let out: string
  try {
    out = execFileSync(
      'npx',
      ['tsx', join(ROOT, 'scripts/check-claim-provenance.ts'), '--', '--list', 'partido-distinto'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: ROOT },
    )
  } catch (err) {
    const e = err as { stdout?: string }
    if (typeof e.stdout !== 'string' || e.stdout.length === 0) {
      console.error(
        '[retract-attribution] check:claim-provenance no devolvió nada — no se deduce ninguna lista',
      )
      process.exit(1)
    }
    out = e.stdout
  }
  const ids: string[] = []
  let inSection = false
  for (const line of out.split('\n')) {
    if (line.includes('── partido-distinto')) {
      inSection = true
      continue
    }
    if (!inSection) continue
    const m = line.match(/^\s{4}\S+\s+(\S+)\s*$/)
    if (m) ids.push(m[1])
  }
  return ids
}

function main() {
  const dryRun = process.argv.includes('--dry-run')
  const motivo = argOne('--motivo')
  let ids = argAll('--claim')
  if (process.argv.includes('--from-check')) {
    const found = idsFromCheck()
    console.log(
      `[retract-attribution] check:claim-provenance señala ${found.length} con partido-distinto`,
    )
    ids = [...new Set([...ids, ...found])]
  }
  if (ids.length === 0) {
    console.error('[retract-attribution] nada que retirar: usa --claim <id> o --from-check')
    process.exit(2)
  }
  if (!dryRun && !motivo) {
    // Una retirada sin motivo es una retirada que nadie puede revisar dentro de
    // seis meses. En seco no hace falta, porque no deja rastro.
    console.error('[retract-attribution] --motivo es obligatorio para escribir')
    process.exit(2)
  }

  const idSet = new Set(ids)
  const plenoIds = new Set(ids.map((i) => i.split('-')[0]))
  const files = targetFiles(plenoIds)

  console.log(`[retract-attribution] ${ids.length} declaración(es) · ${files.length} fichero(s)`)
  const seenSomewhere = new Set<string>()
  const compuestosTocados: string[] = []
  let totalWrites = 0

  for (const path of files) {
    const raw = readFileSync(path, 'utf8')
    const original = JSON.parse(raw)
    const tally = emptyTally()
    const next = retractAttributions(original, idSet, tally)

    // La prueba de alcance, sobre un SEGUNDO parseo independiente: si la
    // transformación tocó cualquier byte que no fuera un `speakerGroup`, aquí
    // se para en vez de escribir.
    if (!onlySpeakerGroupMoved(JSON.parse(raw), next)) {
      console.error(
        `[retract-attribution] ${path}: la transformación movió algo más — NO se escribe`,
      )
      process.exit(1)
    }

    for (const id of tally.retracted.keys()) seenSomewhere.add(id)
    for (const id of tally.alreadyNull) seenSomewhere.add(id)

    const rel = path.replace(ROOT + '/', '')
    if (tally.retracted.size === 0) {
      console.log(`  ${rel.padEnd(48)} — sin cambios`)
      continue
    }
    const detail = [...tally.retracted]
      .map(([id, bloc]) => `${id.split('-').pop()}:${bloc}→null`)
      .join(' ')
    console.log(
      `  ${rel.padEnd(48)} ${dryRun ? 'retiraría' : 'retirado'} ${tally.retracted.size} · ${detail}`,
    )
    // Un fichero compuesto lo fecha `composedAt`, y eso no lo mueve escribir:
    // lo mueve recomponer. Se anota AQUÍ, con el original delante, para no
    // tener que volver a leer nada después.
    if (esCompuesto(original)) compuestosTocados.push(rel)

    if (!dryRun) {
      // El fichero conserva su formato: 2 espacios y salto final, como lo
      // escriben los generadores. Sin esto el diff sería el fichero entero y
      // nadie podría revisar cuatro filas.
      writeFileSync(path, JSON.stringify(next, null, 2) + '\n')
    }
    totalWrites += tally.retracted.size
  }

  // Un id que no aparece en NINGÚN fichero es un id equivocado, y callarlo
  // convierte esta pasada en un no-op silencioso que parece un éxito.
  const missing = ids.filter((i) => !seenSomewhere.has(i))
  if (missing.length > 0) {
    console.error(`\n[retract-attribution] ${missing.length} id(s) no aparecen en ningún fichero:`)
    for (const m of missing) console.error(`  ${m}`)
    process.exit(1)
  }

  console.log(
    `\n[retract-attribution] ${dryRun ? '[en seco] ' : ''}${totalWrites} atribución(es) a null` +
      (motivo ? `\n  motivo: ${motivo}` : ''),
  )
  // Recomponer. Escribir un fichero compuesto deja su `composedAt` detrás del
  // contenido que sella, y `check:stamps` —que entra en el parte nocturno— se
  // pone en rojo. Pasó de verdad: PR #80 movió cuatro atribuciones y dejó el
  // sello en el día anterior. No vale sellarlo a mano —`restamp-curated.ts` se
  // niega, y con razón: aquí `generatedAt` es el sello del base y
  // `check:verified-compose` exige igualdad exacta con él—. Lo que fecha el
  // contenido es `composedAt`, y sólo lo escribe quien compone.
  //
  // La pasada de composición es local, determinista y sin LLM ni red, así que
  // encadenarla no cuesta nada y cierra la puerta en vez de documentarla.
  if (compuestosTocados.length > 0 && totalWrites > 0) {
    if (dryRun) {
      console.log(
        `\n[retract-attribution] [en seco] recompondría ${compuestosTocados.length} fichero(s) ` +
          `compuesto(s) para mover su sello: ${compuestosTocados.join(', ')}`,
      )
    } else {
      console.log(
        `\n[retract-attribution] recomponiendo ${compuestosTocados.length} fichero(s) ` +
          'compuesto(s) para que su sello alcance al contenido…',
      )
      try {
        execFileSync('npx', ['tsx', join(ROOT, 'scripts/verify-pleno-claims.ts')], {
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          cwd: ROOT,
          stdio: 'inherit',
        })
      } catch {
        // Un fallo aquí NO deshace la retractación —ya está escrita— pero
        // dejarlo pasar en silencio publicaría el sello viejo, que es el
        // defecto que esto viene a cerrar.
        console.error(
          '\n[retract-attribution] la recomposición FALLÓ. La retractación SÍ está escrita,\n' +
            '  pero el sello se quedó atrás: corre `npm run verify:pleno-claims` a mano\n' +
            '  antes de comitear, o `npm run check:stamps` saldrá en rojo.',
        )
        process.exit(1)
      }
    }
  }

  if (!dryRun) {
    console.log(
      '  El registro es el commit: descríbelo ahí, y vuelve a pasar\n' +
        '  `npm run check:claim-provenance` para confirmar que ya no las señala.',
    )
    if (compuestosTocados.length > 0) {
      // Recomponer NO es el último paso: hay nodos derivados que leen este
      // fichero —`finding-quote-provenance.json` entre ellos— y se quedan
      // rancios. No se encadena aquí a propósito: `refresh` recorre el grafo
      // entero y podría reconstruir cosas que no tienen nada que ver con una
      // retractación. Se nombra, que es lo que faltaba.
      console.log(
        '  Y queda un paso: `npm run refresh` — al mover verified.json se\n' +
          '  quedan rancios los nodos derivados que lo leen.',
      )
    }
  }
}

main()
