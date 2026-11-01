#!/usr/bin/env tsx
/**
 * check:contract-corrections — ¿llegó cada corrección curada del registro de
 * contratos al `tenders.json` publicado, y sigue haciendo falta?
 *
 *   npm run check:contract-corrections
 *
 * Cuatro desenlaces por corrección (`evaluarCorrecciones`):
 *
 *   · aplicada     la fila publicada lleva la corrección
 *   · pendiente    el fichero es anterior a la firma: ninguna nocturna la ha
 *                  visto todavía. Sale 0 con NO COMPROBADO, que el parte de
 *                  salud cuenta como «sin comprobar» y no como limpio.
 *   · no-aplicada  una pasada posterior a la firma no la aplicó ✗
 *   · sobra        Gobierto ya publica bien la fila, la fila no está o nombra
 *                  a otra adjudicataria: hay que retirarla ✗
 *
 * Y antes de todo, que el fichero curado valide ✗. Reglas y porqués:
 * src/scraper/contract-corrections.ts.
 *
 * Después imprime la identidad de filas que dejó la última pasada: cuántas
 * conservan su `sourceRowId`, y las pasadas guardadas en las que algo se movió
 * (src/scraper/identidad-de-filas.ts). Es una medida y no un gate: nunca pone el
 * código de salida, y sólo lleva NO COMPROBADO cuando no se pudo medir.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { evaluarCorrecciones } from '../src/scraper/contract-corrections'
import { renglonesDeIdentidad } from '../src/scraper/identidad-de-filas'
import { loadContractCorrections } from './contract-correction'

const TENDERS = resolve('public/data/tenders.json')

function comprobarCorrecciones(snapshot: Parameters<typeof evaluarCorrecciones>[1] | null) {
  let correcciones
  try {
    correcciones = loadContractCorrections()
  } catch (e) {
    console.log(`✗ [fichero-invalido] ${e instanceof Error ? e.message : String(e)}`)
    process.exitCode = 1
    return
  }
  if (!correcciones || correcciones.corrections.length === 0) {
    console.log('[contract-corrections] ninguna corrección curada')
    return
  }
  if (!snapshot) {
    console.log('[contract-corrections] NO COMPROBADO: no hay tenders.json que mirar')
    return
  }
  const desenlaces = evaluarCorrecciones(correcciones, snapshot)
  console.log(`[contract-corrections] ${desenlaces.length} corrección(es)`)
  let rojo = false
  for (const d of desenlaces) {
    const fila = `${d.id} (lote ${d.lote})`
    if (d.desenlace === 'aplicada') console.log(`  · aplicada ${fila}: ${d.detalle}`)
    else if (d.desenlace === 'pendiente') console.log(`  NO COMPROBADO ${fila}: ${d.detalle}`)
    else {
      rojo = true
      const qué =
        d.desenlace === 'sobra'
          ? `sobra (${d.detalle}) — retírala: npm run contract-correction -- --retirar ${d.id}`
          : `no aplicada: ${d.detalle}`
      console.log(`  ✗ [${d.desenlace}] ${fila} ${qué}`)
    }
  }
  if (rojo) process.exitCode = 1
}

function main() {
  const snapshot = existsSync(TENDERS) ? JSON.parse(readFileSync(TENDERS, 'utf8')) : null
  comprobarCorrecciones(snapshot)
  for (const renglon of renglonesDeIdentidad(snapshot ?? {})) console.log(renglon)
}

main()
