#!/usr/bin/env tsx
/**
 * check:area-fit — ¿sigue habiendo una firma para cada área delegada?
 *
 *   npm run check:area-fit
 *   npm run check:area-fit -- --json
 *
 * El encaje declarado de `/cargos` es curado: cada fila la firma una persona,
 * por (concejal × área), y dice si la formación y la experiencia DECLARADAS
 * guardan relación con el área. `officials.json`, en cambio, **se raspa cada
 * noche**. Las dos cosas juntas dejan un hueco que nadie más vigila.
 *
 * El hueco, en concreto: `EncajeCard` hace `if (!rows.length) return null`. Un
 * concejal con delegación y sin fila firmada **no pinta nada** — ni ficha
 * vacía, ni «pendiente»: nada. Y sus compañeros sí pintan sus chips. Para
 * quien lee, el silencio se lee como limpio, cuando significa que no lo hemos
 * mirado. La asimetría queda al revés de lo que debe ser: al revisado se le
 * ven las costuras y al no revisado se le supone bien.
 *
 * Hoy no pasa —40 áreas, 40 firmas, cero huecos— y precisamente por eso esto
 * es una guarda y no un arreglo: la cobertura completa de hoy es un hecho de
 * los DATOS, no de la construcción. Una remodelación de gobierno, o un alta
 * como la de julio de 2025, y el hueco aparece esa misma noche sin que nada se
 * ponga rojo.
 *
 * La pregunta vive en `src/scraper/area-fit.ts` (`cotejarCoberturaEncaje`)
 * para que una prueba pueda inyectarle datos falsos: una guarda que no se
 * puede poner roja a propósito no se ha comprobado nunca. Aquí sólo queda la
 * entrada/salida y el código de salida.
 *
 * Cuatro desenlaces, y tres salen 1 — todos publican algo sobre una persona
 * viva que dejó de ser cierto, o callan sobre quien no debería quedar en
 * silencio. Ninguno se arregla solo.
 *
 * Anti-hueco: si recorre cero áreas sale 1. Un «todo en orden» sobre un
 * fichero vacío es exactamente la puerta que no mide nada.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  cotejarCoberturaEncaje,
  ENCAJE_DESENLACES_ROJOS,
  type EncajeDesenlace,
  type FilaFirmada,
  type OficialConAreas,
} from '../src/scraper/area-fit'

const OFICIALES = resolve('public/data/officials.json')
const ENCAJE = resolve('public/data/area-fit.json')

function leerJson<T>(ruta: string, que: string): T {
  if (!existsSync(ruta)) {
    process.stderr.write(`[check-area-fit] falta ${que}: ${ruta}\n`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(ruta, 'utf8')) as T
}

function main() {
  const json = process.argv.includes('--json')

  const oficiales = leerJson<{ officials?: OficialConAreas[] }>(OFICIALES, 'officials.json')
  const encaje = leerJson<{ rows?: FilaFirmada[] }>(ENCAJE, 'area-fit.json')

  const lista = oficiales.officials ?? []
  const filas = encaje.rows ?? []
  const cotejos = cotejarCoberturaEncaje(lista, filas)

  const cuenta = (d: EncajeDesenlace) => cotejos.filter((c) => c.desenlace === d).length
  const resumen = {
    areas: cuenta('coincide') + cuenta('sin-firmar'),
    firmas: filas.length,
    coincide: cuenta('coincide'),
    'sin-firmar': cuenta('sin-firmar'),
    'cargo-cambiado': cuenta('cargo-cambiado'),
    'oficial-inexistente': cuenta('oficial-inexistente'),
  }

  if (json) {
    process.stdout.write(JSON.stringify({ resumen, cotejos }, null, 2) + '\n')
  } else {
    process.stdout.write(
      `[check-area-fit] ${resumen.areas} área(s) delegada(s) · ${resumen.firmas} firma(s)\n` +
        `  coincide ${resumen.coincide} · sin-firmar ${resumen['sin-firmar']} · ` +
        `cargo-cambiado ${resumen['cargo-cambiado']} · ` +
        `oficial-inexistente ${resumen['oficial-inexistente']}\n`,
    )
    for (const c of cotejos) {
      if (c.desenlace === 'coincide') continue
      process.stdout.write(`  [${c.desenlace}] ${c.oficial} · «${c.area}» — ${c.detalle}\n`)
    }
  }

  // Anti-hueco. Un parte de «todo en orden» sobre cero áreas es el gate que no
  // mide nada, que es el defecto que este repositorio ya pagó dos veces.
  if (resumen.areas === 0) {
    process.stderr.write(
      '[check-area-fit] cero áreas delegadas recorridas: no ha comprobado nada\n',
    )
    process.exit(1)
  }

  const rojo = cotejos.some((c) => ENCAJE_DESENLACES_ROJOS.includes(c.desenlace))
  process.exit(rojo ? 1 : 0)
}

main()
