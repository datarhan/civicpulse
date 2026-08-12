#!/usr/bin/env node
/**
 * PostToolUse runner. Toda la decisión vive en ./stale-copy-paths.mjs; esto sólo
 * lee la llamada e imprime el aviso.
 *
 * Corre incondicionalmente y no bloquea nunca: sale 0 pase lo que pase. Un
 * recordatorio que puede tumbar una edición se acaba desactivando, y entonces
 * deja de recordar nada.
 */
import { readFileSync } from 'node:fs'
import { decideRecordatorio } from './stale-copy-paths.mjs'

function main() {
  let payload = {}
  try {
    payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
  } catch {
    return // sin payload legible no hay nada que decir
  }
  const aviso = decideRecordatorio(payload)
  if (aviso) console.error(aviso)
}

try {
  main()
} catch {
  // Un recordatorio roto no puede romper una edición.
}
process.exit(0)
