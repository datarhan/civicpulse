#!/usr/bin/env tsx
/**
 * Catastro (OVC) curator lookup CLI. Pure stdout — never writes to
 * public/data/. Used when a press claim names an address ("la finca
 * de calle Mayor 14") or a cadastral reference and a curator wants
 * to confirm the parcel exists + see uso + superficie before
 * promoting the finding.
 *
 * Usage:
 *   npm run lookup-catastro -- --address "CL MAYOR 14"
 *   npm run lookup-catastro -- --refcat 4720001YJ2742S0001JF
 *   npm run lookup-catastro -- --address "AV CV-373 4" --json
 *
 * Address must be "SIGLA NOMBRE NUMERO" (CL/AV/PL/CR + name + n°).
 */
import { queryByAddress, queryByRefCat, type CatastroLookupResult } from '../src/scraper/catastro'

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

function parseAddress(raw: string): { sigla: string; calle: string; numero: string } | null {
  const m = raw.trim().match(/^([A-Z]{2,3})\s+(.+?)\s+(\d+[a-zA-Z]?)\s*$/i)
  if (!m) return null
  return { sigla: m[1].toUpperCase(), calle: m[2].trim().toUpperCase(), numero: m[3] }
}

function renderResult(result: CatastroLookupResult): string {
  if (!result.ok) {
    return `[catastro] no parcel found · ${result.error?.code ?? '?'} · ${result.error?.description ?? 'unknown error'}`
  }
  const lines = [`[catastro] ${result.parcels.length} parcel(s):`]
  for (const p of result.parcels) {
    lines.push(
      `  · ${p.refCatastral} · ${p.direccion || '(sin dirección)'}` +
        (p.cp ? ` · CP ${p.cp}` : '') +
        (p.uso ? ` · uso=${p.uso}` : '') +
        (p.superficie != null ? ` · ${p.superficie} m²` : ''),
    )
  }
  return lines.join('\n')
}

async function main() {
  const refCat = getFlag('--refcat')
  const address = getFlag('--address')
  const asJson = process.argv.includes('--json')

  if (!refCat && !address) {
    console.error(
      'Usage: lookup-catastro -- --refcat <20-char-ref>  OR  --address "SIGLA NOMBRE NUMERO"',
    )
    process.exit(2)
  }

  let result: CatastroLookupResult
  if (refCat) {
    result = await queryByRefCat({ refCatastral: refCat })
  } else {
    const parsed = parseAddress(address!)
    if (!parsed) {
      console.error(`Invalid address format: "${address}". Expected: "SIGLA NOMBRE NUMERO"`)
      process.exit(2)
    }
    result = await queryByAddress(parsed)
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } else {
    console.log(renderResult(result))
  }
}

main().catch((err) => {
  console.error('[catastro] failed:', err)
  process.exit(1)
})
