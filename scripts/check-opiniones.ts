#!/usr/bin/env tsx
/**
 * check:opiniones — ¿se sostiene cada opinión del editor sobre lo que el panel
 * publica hoy, y nombra sólo a quien debe?
 *
 *   npm run check:opiniones
 *
 * Una opinión se apoya en hechos (indicadores, resultados, hallazgos firmados)
 * que pueden cambiar sin que nadie toque el texto: el ministerio revisa una
 * entrega y la opinión sigue diciendo lo de antes. Mismos cuatro desenlaces
 * que `check:eficiencia-findings`, por la misma razón — colapsar «no lo
 * encontré» dentro de «coincide» es un gate que se da a sí mismo el visto
 * bueno:
 *
 *   coincide      el hecho sigue diciendo lo citado
 *   movido        el panel avanzó de año. Aviso: la opinión dice de qué año habla
 *   contradice    el MISMO año vale otra cosa → sale 1
 *   sin-indicador el hecho ya no está en el panel → sale 1
 *
 * Y vuelve a comprobar los nombres contra `competencias.json`: persona,
 * competencia y periodo (`comprobarNombres`). Un nombre fuera de su delegación
 * sale 1.
 *
 * Anti-hueco: imprime cuántas comprobaciones corrió, también cuando son cero.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  comprobarNombres,
  cotejarHecho,
  validarOpinionesSnapshot,
  type EstadoHecho,
} from '../src/scraper/opinion-editor'

const leer = (f: string) => JSON.parse(readFileSync(resolve('public/data', f), 'utf8'))

function main(): void {
  const ruta = resolve('public/data/opiniones-editor.json')
  if (!existsSync(ruta)) {
    process.stderr.write('[check:opiniones] falta public/data/opiniones-editor.json\n')
    process.exit(1)
  }
  const snap = validarOpinionesSnapshot(readFileSync(ruta, 'utf8'))
  const panel = leer('indicadores.json')
  const hallazgos = leer('eficiencia-findings.json')
  const comp = leer('competencias.json')

  const cuenta: Record<EstadoHecho, number> = {
    coincide: 0,
    movido: 0,
    contradice: 0,
    'sin-indicador': 0,
  }
  const problemas: string[] = []
  let hechos = 0
  for (const o of snap.items) {
    for (const h of o.hechos) {
      hechos++
      const e = cotejarHecho(h, panel, hallazgos)
      cuenta[e]++
      if (e === 'contradice' || e === 'sin-indicador')
        problemas.push(`${o.id}: ${h.tipo} «${h.id}»${h.anio ? ` (${h.anio})` : ''} → ${e}`)
      else if (e === 'movido')
        process.stdout.write(
          `[check:opiniones] aviso: ${o.id} cita ${h.id} de ${h.anio}; el panel ya tiene un año posterior\n`,
        )
    }
    problemas.push(...comprobarNombres(o, comp))
  }

  process.stdout.write(
    `[check:opiniones] ${snap.items.length} opinión(es), ${hechos} hecho(s) cotejado(s): ` +
      `${cuenta.coincide} coincide · ${cuenta.movido} movido · ${cuenta.contradice} contradice · ` +
      `${cuenta['sin-indicador']} sin-indicador\n`,
  )
  if (problemas.length) {
    for (const p of problemas) process.stderr.write(`[check:opiniones] ✗ ${p}\n`)
    process.exit(1)
  }
}

main()
