#!/usr/bin/env tsx
/**
 * check:solicitudes — ¿lo que la página dice de cada solicitud sigue siendo
 * cierto?
 *
 *   npm run check:solicitudes
 *   npm run check:solicitudes -- --json
 *
 * Cinco desenlaces, y NINGUNO sale 1: que una administración tarde no es una
 * avería que arreglar. Lo que hay es una cola que tiene que verse, y una guarda
 * que se pusiera roja porque el Ayuntamiento no ha contestado sería una guarda
 * que alguien apaga justo el día que importa.
 *
 * Lo que sí sale 1 es una incoherencia NUESTRA: una solicitud que nombra una
 * clase inexistente, un estado escrito a mano en vez de derivado de las fechas,
 * un registro que no valida, o un manifiesto sin el cruce por clase documental
 * que esta guarda mide (`[sin-cruce-documental]`).
 *
 * Anti-hueco: imprime cuántas clases evaluó. Un «todo en orden» sobre cero
 * clases es el gate que no mide nada.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { CLASES_PEDIBLES, CLASE_ETIQUETA } from '../src/scraper/clase-documental'
import {
  validarRegistroSolicitudes,
  estadoDeSolicitud,
  frasePublica,
  type RegistroSolicitudes,
} from '../src/scraper/solicitud-acceso'

const REG = resolve('public/data/solicitudes-acceso.json')
const MANIFIESTO = resolve('public/data/pleno-claims/index.json')

function main(): void {
  const asJson = process.argv.includes('--json')
  const hoy = new Date().toISOString().slice(0, 10)
  const problemas: string[] = []

  if (!existsSync(REG)) {
    process.stderr.write(`[check-solicitudes] falta ${REG}\n`)
    process.exit(1)
  }
  const reg = JSON.parse(readFileSync(REG, 'utf8')) as RegistroSolicitudes
  try {
    validarRegistroSolicitudes(reg, CLASES_PEDIBLES)
  } catch (e) {
    process.stderr.write(`[check-solicitudes] registro inválido: ${(e as Error).message}\n`)
    process.exit(1)
  }

  // Sin manifiesto, SALTADO y no rojo: que falte el fichero entero ya lo da en
  // rojo check:cobertura, que corre a su lado en la nocturna, y la página lo dice
  // en vez de pintar ceros. Que falte sólo el cruce no lo ve nadie más: abajo.
  if (!existsSync(MANIFIESTO)) {
    process.stdout.write(
      '[check-solicitudes] 0 clase(s) · SALTADO: no hay manifiesto de declaraciones que leer. ' +
        'No se ha comprobado nada, que no es lo mismo que estar todo bien.\n',
    )
    return
  }
  const totals = (
    JSON.parse(readFileSync(MANIFIESTO, 'utf8')) as {
      totals?: { cobertura?: { porClaseDocumental?: { porClase?: Record<string, number> } } }
    }
  ).totals
  const porClase = totals?.cobertura?.porClaseDocumental?.porClase
  if (!porClase) {
    // Que falte el cruce no es un manifiesto viejo que haya que esperar: su único
    // escritor, `buildManifest` (src/scraper/pleno-claims-chunks.ts), lo escribe
    // siempre desde el 27-08-2026, el día en que nacieron el cruce y esta guarda.
    // Ninguna otra guarda lo lee, y sin él /laboratorio/cobertura pinta un 0 en
    // cada clase. Hasta el 06-10-2026 esto salía SALTADO, con 0, y la inyección
    // de check:guards que quita el cruce no pudo disparar nunca.
    process.stdout.write('[check-solicitudes] 0 clase(s) evaluada(s)\n')
    process.stderr.write(
      '  ✗ [sin-cruce-documental] el manifiesto no trae `totals.cobertura.porClaseDocumental`: ' +
        '/laboratorio/cobertura pintaría 0 declaraciones en cada clase. Rederiva con ' +
        '`npm run chunk-pleno-claims`.\n',
    )
    process.exit(1)
  }

  // Toda solicitud tiene que apuntar a una clase que EXISTE en el material. Una
  // petición sin declaraciones detrás es una petición que el material no
  // justifica, y eso se paga delante de una administración.
  for (const s of reg.items) {
    if (!(s.clase in porClase)) {
      problemas.push(`${s.id}: pide «${s.clase}» y ninguna declaración sin corpus nombra esa clase`)
    }
  }

  const filas = CLASES_PEDIBLES.map((clase) => {
    const s = reg.items.find((x) => x.clase === clase) ?? null
    return {
      clase,
      etiqueta: CLASE_ETIQUETA[clase],
      declaraciones: porClase[clase] ?? 0,
      estado: estadoDeSolicitud(s, hoy),
      frase: frasePublica(s, hoy),
    }
  })

  if (asJson) {
    process.stdout.write(JSON.stringify({ clases: filas.length, filas, problemas }, null, 2) + '\n')
    process.exit(problemas.length ? 1 : 0)
  }

  process.stdout.write(`[check-solicitudes] ${filas.length} clase(s) evaluada(s)\n`)
  for (const f of filas) {
    process.stdout.write(
      `  · ${f.clase.padEnd(16)} ${String(f.declaraciones).padStart(4)} declaración(es) · ${f.estado}\n`,
    )
  }
  // Que la comprobación mide algo: si NINGUNA clase tuviera declaraciones, todo
  // saldría `sin-solicitar` y esto imprimiría un visto bueno sobre nada.
  if (filas.every((f) => f.declaraciones === 0)) {
    process.stderr.write(
      '[check-solicitudes] ninguna clase tiene declaraciones detrás: no estoy midiendo nada, ' +
        'que no es lo mismo que estar todo bien\n',
    )
    process.exit(1)
  }
  for (const p of problemas) process.stderr.write(`  ✗ ${p}\n`)
  if (problemas.length) process.exit(1)
}

main()
