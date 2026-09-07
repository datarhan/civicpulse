#!/usr/bin/env tsx
/**
 * Barrido puntual del BOP de València por rango de fechas, para encontrar un
 * anuncio antiguo.
 *
 *   npx tsx scripts/buscar-bop-historico.ts --desde 2023-06-01 --hasta 2023-08-15 \
 *     --busca "delegaci"
 *   npx tsx scripts/buscar-bop-historico.ts --desde 2011-04-26 --hasta 2011-04-26 \
 *     --busca "GIMENO CALVO" --texto
 *
 * ## Por qué existe si ya hay `scrape:bop`
 *
 * `scrape:bop` mantiene una ventana RODANTE de 30 días y **sobrescribe**
 * `public/data/bop.json` en cada ejecución. Sirve para «qué se ha publicado
 * últimamente» y no para «qué se publicó en julio de 2023»: el decreto de
 * delegación de la corporación 2023-2027 está a más de mil días de esa ventana,
 * y pedirlo con `--days 1200` machacaría el snapshot publicado con mil días de
 * anuncios.
 *
 * Así que esto reutiliza sus dos piezas —`fetchBopBulletinText` y
 * `parseBopBulletin`, que están limpiamente separadas— y escribe a `.cache/`.
 * No toca `public/data/` ni entra en `scrape-all.sh`.
 *
 * ## Y por qué el rango es corto
 *
 * Las corporaciones se constituyen a mediados de junio y el decreto de
 * delegación se publica en las semanas siguientes, así que no hacen falta mil
 * días: hacen falta dos ventanas de unas seis semanas. Un barrido de 60
 * boletines en vez de 1.200 es la diferencia entre una tarde y una semana.
 *
 * ## Tres ceros distintos
 *
 * El parte separa días pedidos, días con boletín, anuncios leídos, coincidencias
 * y líneas, y sale 1 en dos casos que no son «no encontré»: si no llegó a leer
 * ningún boletín («no miré») y si leyó boletines de los que no supo extraer NI
 * UN anuncio («no supe leer»). Lo segundo pasó el 06-09-2026 con el boletín de
 * 28/04/2015 —306 páginas, 0 anuncios, control presente en el PDF— y el
 * script imprimía «0 coincidencias» como si hubiera comprobado algo: el
 * sumario de los boletines anteriores a la plataforma actual no lleva el
 * número de registro que `parseBopBulletin` usa de ancla. Para esos
 * boletines está `--texto`: busca el patrón en el texto entero, tolerando los
 * glifos desplazados de algunos PDF antiguos (`src/scraper/bop-glifos.ts`).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseBopBulletin } from '../src/scraper/bop'
import { fetchBopBulletinText } from '../src/scraper/bop-fetch'
import { buscarConGlifos } from '../src/scraper/bop-glifos'

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const flag = (n: string): boolean => process.argv.includes(`--${n}`)

const DESTINO = resolve('.cache/bop-historico')
const PAUSA_MS = 400
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** El BOP pide `DD/MM/YYYY` en la URL; el parser quiere además la ISO. */
function comoBoletin(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function diasDelRango(desde: string, hasta: string): string[] {
  const out: string[] = []
  const d = new Date(`${desde}T00:00:00Z`)
  const fin = new Date(`${hasta}T00:00:00Z`)
  while (d <= fin) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export interface RecuentoBarrido {
  diasPedidos: number
  diasConBoletin: number
  anunciosVistos: number
  hallazgos: number
  /** Líneas coincidentes de la búsqueda a texto completo (`--texto`). */
  lineas: number
  fallos: number
}

/**
 * Qué significa el recuento. Sólo un barrido que leyó boletines Y supo extraer
 * anuncios (o líneas, con `--texto`) puede decir «0 coincidencias»; los otros
 * dos ceros son «no miré» y «no supe leer», y salen rojos.
 */
export function parteBarrido(r: RecuentoBarrido): { exitCode: 0 | 1; mensaje: string } {
  if (r.diasConBoletin === 0) {
    return {
      exitCode: 1,
      mensaje: '[bop-hist] ni un boletín leído: el barrido no ha comprobado nada',
    }
  }
  if (r.anunciosVistos === 0 && r.lineas === 0) {
    return {
      exitCode: 1,
      mensaje:
        `[bop-hist] leyó ${r.diasConBoletin} boletín(es) y no supo extraer ningún anuncio: el formato no es el ` +
        'que entiende parseBopBulletin, así que «0 coincidencias» no mide nada — busca con --texto ' +
        '(texto entero, tolerante a glifos desplazados)',
    }
  }
  return { exitCode: 0, mensaje: '' }
}

async function main(): Promise<void> {
  const desde = arg('desde')
  const hasta = arg('hasta')
  const busca = arg('busca')
  const texto = flag('texto')
  if (!desde || !hasta || !busca) {
    process.stderr.write(
      'uso: buscar-bop-historico --desde YYYY-MM-DD --hasta YYYY-MM-DD --busca "texto" [--texto]\n',
    )
    process.exit(1)
  }
  const dias = diasDelRango(desde, hasta)
  const q = sinAcentos(busca)
  let conBoletin = 0
  let anunciosVistos = 0
  const hallazgos: Array<{ fecha: string; title: string; pdfUrl: string }> = []
  const lineas: Array<{ fecha: string; linea: number; forma: string; decodificada: string }> = []
  const fallos: string[] = []

  process.stdout.write(
    `[bop-hist] ${dias.length} día(s) · busca «${busca}»${texto ? ' · texto entero' : ''}\n`,
  )

  for (const dia of dias) {
    let cuerpo: string | null
    try {
      cuerpo = await fetchBopBulletinText(comoBoletin(dia))
    } catch (e) {
      fallos.push(`${dia}: ${(e as Error).message}`)
      continue
    }
    if (!cuerpo) continue // 404 = no hubo boletín ese día
    conBoletin++
    const anuncios = parseBopBulletin(cuerpo, comoBoletin(dia), dia)
    anunciosVistos += anuncios.length
    for (const a of anuncios) {
      if (!sinAcentos(a.title).includes(q)) continue
      hallazgos.push({ fecha: dia, title: a.title, pdfUrl: a.pdfUrl })
      process.stdout.write(`  ${dia} · ${a.title.slice(0, 110)}\n`)
    }
    if (texto) {
      for (const h of buscarConGlifos(cuerpo, busca)) {
        lineas.push({ fecha: dia, linea: h.linea, forma: h.forma, decodificada: h.decodificada })
        process.stdout.write(
          `  ${dia} · l.${h.linea} (${h.forma}) · ${h.decodificada.trim().slice(0, 110)}\n`,
        )
      }
    }
    await dormir(PAUSA_MS)
  }

  const recuento: RecuentoBarrido = {
    diasPedidos: dias.length,
    diasConBoletin: conBoletin,
    anunciosVistos,
    hallazgos: hallazgos.length,
    lineas: lineas.length,
    fallos: fallos.length,
  }

  mkdirSync(DESTINO, { recursive: true })
  const salida = resolve(DESTINO, `bop-${desde}_${hasta}-${q.slice(0, 12)}.json`)
  writeFileSync(
    salida,
    JSON.stringify(
      { consulta: { desde, hasta, busca, texto }, recuento, fallos, hallazgos, lineas },
      null,
      2,
    ) + '\n',
  )

  process.stdout.write(
    `[bop-hist] ${dias.length} pedidos · ${conBoletin} con boletín · ${anunciosVistos} anuncios · ` +
      `${hallazgos.length} coincidencia(s)` +
      (texto ? ` · ${lineas.length} línea(s)` : '') +
      ` · ${fallos.length} fallo(s)\n`,
  )
  for (const f of fallos) process.stdout.write(`  [fallo] ${f}\n`)
  process.stdout.write(`[bop-hist] → ${salida}\n`)

  const parte = parteBarrido(recuento)
  if (parte.exitCode !== 0) {
    process.stderr.write(`${parte.mensaje}\n`)
    process.exit(parte.exitCode)
  }
}

// Guarded so `parteBarrido` can be unit-tested without the CLI touching the
// network on import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    process.stderr.write(`[bop-hist] ${(e as Error).message}\n`)
    process.exit(1)
  })
}
