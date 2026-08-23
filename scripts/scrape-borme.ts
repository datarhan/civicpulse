#!/usr/bin/env tsx
/**
 * scrape:borme — barrido puntual del BORME por rango de fechas y provincia.
 *
 *   npm run scrape:borme -- --desde 2026-01-01 --hasta 2026-08-23 \
 *     --provincia ALICANTE --empresa "HIDRAQUA"
 *
 * NO es un adaptador nocturno y no entra en `scrape-all.sh`. Es una herramienta
 * de reportaje: escribe a `.cache/borme/`, nunca a `public/data/`, porque lo que
 * sale de aquí es material en bruto para que un curador firme una ficha, no un
 * snapshot publicable. La regla de la casa —nada automático escribe lo que
 * afirma cosas de una persona o de una empresa— se cumple manteniendo esa
 * distancia.
 *
 * ## Por qué barre en vez de buscar
 *
 * BORME no tiene búsqueda libre: `buscar/borme.php` da 404 y libreborme está
 * tras Cloudflare. Lo que sí hay es el sumario diario en la API de datos
 * abiertos del BOE, así que se recorre día a día la sección de la provincia y se
 * filtra en local. Un día sin boletín devuelve 404 y se salta limpiamente: no
 * es un error.
 *
 * ## El parte dice lo que hizo
 *
 * Días pedidos, días con boletín, secciones leídas y anuncios encontrados van
 * por separado. Un barrido que sólo dijera «0 encontrados» no distingue «esta
 * empresa no publicó nada» de «no llegué a mirar», que es el defecto que este
 * repositorio ya pagó en otros sitios.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseBormeSeccion, filtrarPorEmpresa, type AnuncioBorme } from '../src/scraper/borme'
import { fetchSeccionesDelDia, fetchSeccionHtml, diasDelRango } from '../src/scraper/borme-fetch'

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const DESTINO = resolve('.cache/borme')
/** Cortesía con el servidor del BOE: un barrido largo no debe parecer un ataque. */
const PAUSA_MS = 350

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Hallazgo extends AnuncioBorme {
  fecha: string
  seccionId: string
  provincia: string
  url: string
}

async function main(): Promise<void> {
  const desde = arg('desde')
  const hasta = arg('hasta')
  const provincia = (arg('provincia') ?? '').toUpperCase()
  const empresa = arg('empresa')

  if (!desde || !hasta || !provincia) {
    process.stderr.write(
      'uso: scrape:borme -- --desde YYYY-MM-DD --hasta YYYY-MM-DD --provincia ALICANTE [--empresa "TEXTO"]\n',
    )
    process.exit(1)
  }

  const dias = diasDelRango(desde, hasta)
  let conBoletin = 0
  let seccionesLeidas = 0
  let anunciosVistos = 0
  const hallazgos: Hallazgo[] = []
  const fallos: string[] = []

  process.stdout.write(`[borme] ${dias.length} día(s) · provincia ${provincia}\n`)

  for (const dia of dias) {
    let secciones
    try {
      secciones = await fetchSeccionesDelDia(dia)
    } catch (e) {
      fallos.push(`${dia}: sumario — ${(e as Error).message}`)
      continue
    }
    if (secciones.length === 0) continue
    conBoletin++

    for (const s of secciones) {
      if (!s.provincia.toUpperCase().includes(provincia)) continue
      try {
        const html = await fetchSeccionHtml(s.urlHtml)
        const anuncios = parseBormeSeccion(html)
        seccionesLeidas++
        anunciosVistos += anuncios.length
        const encontrados = empresa ? filtrarPorEmpresa(anuncios, empresa) : anuncios
        for (const a of encontrados) {
          hallazgos.push({
            ...a,
            fecha: dia,
            seccionId: s.id,
            provincia: s.provincia,
            url: s.urlHtml,
          })
          process.stdout.write(`  ${dia} · ${a.numero} — ${a.denominacion}\n`)
        }
      } catch (e) {
        fallos.push(`${dia}: sección ${s.id} — ${(e as Error).message}`)
      }
      await dormir(PAUSA_MS)
    }
  }

  mkdirSync(DESTINO, { recursive: true })
  const salida = resolve(DESTINO, `borme-${provincia.toLowerCase()}-${desde}_${hasta}.json`)
  writeFileSync(
    salida,
    JSON.stringify(
      {
        consulta: { desde, hasta, provincia, empresa: empresa ?? null },
        recuento: {
          diasPedidos: dias.length,
          diasConBoletin: conBoletin,
          seccionesLeidas,
          anunciosVistos,
          hallazgos: hallazgos.length,
          fallos: fallos.length,
        },
        fallos,
        hallazgos,
      },
      null,
      2,
    ) + '\n',
  )

  process.stdout.write(
    `[borme] ${dias.length} pedidos · ${conBoletin} con boletín · ${seccionesLeidas} secciones · ` +
      `${anunciosVistos} anuncios leídos · ${hallazgos.length} coincidencia(s) · ${fallos.length} fallo(s)\n`,
  )
  for (const f of fallos) process.stdout.write(`  [fallo] ${f}\n`)
  process.stdout.write(`[borme] → ${salida}\n`)

  // Un barrido que no llegó a leer nada no puede presentarse como «sin
  // resultados»: son dos cosas distintas y sólo una es informativa.
  if (seccionesLeidas === 0) {
    process.stderr.write('[borme] no se leyó ni una sección: el barrido no ha comprobado nada\n')
    process.exit(1)
  }
}

main().catch((e) => {
  process.stderr.write(`[borme] ${(e as Error).message}\n`)
  process.exit(1)
})
