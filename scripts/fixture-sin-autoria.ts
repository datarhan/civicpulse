#!/usr/bin/env tsx
/**
 * Vacía EN SU SITIO los metadatos que `check:metadatos` señala, sin volver a
 * guardar el fichero.
 *
 *   npm run fixture:sin-autoria -- <fichero>…
 *
 * Una fixture es la descarga real, y ése es su valor: la prueba que la lee
 * ejerce el analizador contra lo que publica la fuente. Re-guardarla con SheetJS
 * o con Excel para quitarle un autor la convierte en lo que escribió nuestra
 * herramienta. Así que esto no re-guarda nada: en un .xls cambia los bytes del
 * nombre y ni uno más (`conprel_CV_2024.xls`, 28-09-2026: 48 bytes de 691.200);
 * en un .xlsx o un .ods reescribe sólo la parte de metadatos y copia las demás
 * byte a byte; en una foto, número de serie y GPS, y el crédito del fotógrafo
 * se queda.
 *
 * Lo que no sabe hacer sin romper algo —un comentario, que es parte del
 * documento; un PDF; la foto de una queja, que anonimiza el bot— lo deja como
 * estaba, dice por qué y sale con 1. Y nunca escribe un resultado que no se
 * deje volver a leer limpio.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { limpiar } from '../src/scraper/metadatos/index.ts'

export function sinAutoria(rutas: string[], cwd: string): { codigo: 0 | 1; lineas: string[] } {
  const lineas: string[] = []
  let rechazados = 0
  for (const ruta of rutas) {
    const disco = resolve(cwd, ruta)
    const antes = readFileSync(disco)
    const r = limpiar(antes, ruta)
    if (r.estado === 'nada') {
      lineas.push(`${ruta}: nada que vaciar`)
      continue
    }
    if (r.estado === 'rechazado') {
      rechazados += 1
      lineas.push(`${ruta}: NO se toca — ${r.motivo}`)
      continue
    }
    let distintos = 0
    for (let i = 0; i < Math.min(antes.length, r.bytes.length); i++)
      if (antes[i] !== r.bytes[i]) distintos++
    writeFileSync(disco, r.bytes)
    const tam =
      r.bytes.length === antes.length
        ? `de ${antes.length}`
        : `(${antes.length} → ${r.bytes.length} bytes)`
    lineas.push(`${ruta}: vaciado ${r.cambios.join(', ')} · ${distintos} byte(s) cambiados ${tam}`)
  }
  return { codigo: rechazados ? 1 : 0, lineas }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rutas = process.argv.slice(2)
  if (rutas.length === 0) {
    console.error('uso: npm run fixture:sin-autoria -- <fichero>…')
    process.exit(2)
  }
  const r = sinAutoria(rutas, process.cwd())
  for (const l of r.lineas) console.log(l)
  process.exit(r.codigo)
}
