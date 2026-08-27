#!/usr/bin/env tsx
/**
 * check:verified-compose — ¿lo que está publicado es la composición del base
 * que hay en disco?
 *
 *   npm run check:verified-compose
 *   npm run check:verified-compose -- --json
 *
 * `verified-rebuild.ts` conserva a propósito el `generatedAt` del base al
 * componer. Eso convierte los dos sellos en un invariante comprobable: si no
 * coinciden, lo publicado no sale del base que hay ahora mismo.
 *
 * El desajuste NO es una avería, y por eso esto no es un rojo. La nocturna
 * (`nightly-scrape.yml`) y `scrape-all.sh` corren `verify:pleno-claims --
 * --base-only` a propósito —«CI necesita que el fichero EXISTA, no
 * republicar»—, porque republicar un veredicto es un acto humano: nada
 * automático sube una afirmación publicada. Lo que faltaba no era la puerta,
 * era el AVISO de que la puerta tiene cola. El base avanzó el 24 de agosto de
 * 2026 y lo publicado se quedó en el 18 durante nueve días sin que nada lo
 * dijera en ninguna pantalla.
 *
 * Cuatro desenlaces, como en `check:eficiencia-findings`, y por el mismo
 * motivo: con dos, el caso normal —el base avanzó, falta republicar— saldría
 * rojo cada noche, y una guarda que grita cuando no pasa nada acaba apagada.
 *
 *   coincide                 lo publicado lleva el sello de su base
 *   pendiente-de-republicar  el base avanzó · AVISO, sale 0
 *   contradice               imposible por construcción · sale 1
 *   sin-base                 no hay base (clon nuevo, CI) · SALTADO, sale 0
 *
 * `sin-base` se imprime como saltado y jamás como visto bueno: el base está
 * gitignorado, así que un clon recién hecho no lo tiene, y una guarda que
 * contesta «todo en orden» sin haber comprobado nada es exactamente el defecto
 * que este repositorio ya pagó con `r?.findings ?? []`.
 *
 * Anti-hueco: imprime cuántos cotejos hizo. Uno que no evaluó nada y uno que no
 * encontró nada no pueden imprimir el mismo «✓».
 */
import { readFileSync, existsSync } from 'node:fs'
import { cotejarCompose, type CotejoCompose } from '../src/scraper/verified-merge'
import { BASE, VERIFIED } from './verified-rebuild'

/** El `generatedAt` de un volcado, o `null` si no está o no se deja leer. */
function selloDe(path: string): string | null {
  if (!existsSync(path)) return null
  try {
    const doc = JSON.parse(readFileSync(path, 'utf8')) as { generatedAt?: unknown }
    return typeof doc.generatedAt === 'string' ? doc.generatedAt : null
  } catch {
    return null
  }
}

function main(): void {
  const asJson = process.argv.includes('--json')

  // Un publicado ilegible y un publicado ausente son la misma cosa para el
  // cotejo —no hay sello— y las dos salen `contradice`, que es lo correcto:
  // ese fichero va comiteado y tiene que estar.
  const cotejo: CotejoCompose = cotejarCompose({
    baseGeneratedAt: selloDe(BASE),
    publicadoGeneratedAt: selloDe(VERIFIED),
  })

  // Uno solo, pero se cuenta y se imprime igual: el número es lo que separa
  // «comprobé y está bien» de «no comprobé nada».
  const comprobaciones = 1

  if (asJson) {
    process.stdout.write(JSON.stringify({ comprobaciones, cotejo }, null, 2) + '\n')
    if (cotejo.estado === 'contradice') process.exit(1)
    return
  }

  const sellos =
    `base=${cotejo.baseGeneratedAt ?? '—'} · ` + `publicado=${cotejo.publicadoGeneratedAt ?? '—'}`

  switch (cotejo.estado) {
    case 'coincide':
      process.stdout.write(
        `[check-compose] ${comprobaciones} cotejo(s) · coincide — lo publicado es la ` +
          `composición del base (${sellos})\n`,
      )
      return

    case 'sin-base':
      // SALTADO. No es un ✓.
      process.stdout.write(
        `[check-compose] ${comprobaciones} cotejo(s) · SALTADO: ${cotejo.motivo}\n` +
          `  No se ha comprobado nada, que no es lo mismo que estar todo bien.\n`,
      )
      return

    case 'pendiente-de-republicar':
      // Aviso, no fallo: es la cola de un acto humano, no un destrozo.
      process.stdout.write(
        `[check-compose] ${comprobaciones} cotejo(s) · pendiente-de-republicar (${sellos})\n` +
          `  ${cotejo.motivo}\n`,
      )
      return

    case 'contradice':
      process.stderr.write(`[check-compose] ✗ contradice (${sellos})\n` + `  ${cotejo.motivo}\n`)
      process.exit(1)
  }
}

main()
