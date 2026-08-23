#!/usr/bin/env tsx
/**
 * Barrido puntual del BOP de València por rango de fechas, para encontrar un
 * anuncio antiguo.
 *
 *   npx tsx scripts/buscar-bop-historico.ts --desde 2023-06-01 --hasta 2023-08-15 \
 *     --busca "delegaci"
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
 * El parte separa días pedidos, días con boletín, anuncios leídos y
 * coincidencias, y sale 1 si no llegó a leer ningún boletín: «no encontré» y
 * «no miré» no son lo mismo.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseBopBulletin } from '../src/scraper/bop'
import { fetchBopBulletinText } from '../src/scraper/bop-fetch'

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

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

const sinAcentos = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

async function main(): Promise<void> {
  const desde = arg('desde')
  const hasta = arg('hasta')
  const busca = arg('busca')
  if (!desde || !hasta || !busca) {
    process.stderr.write(
      'uso: buscar-bop-historico --desde YYYY-MM-DD --hasta YYYY-MM-DD --busca "texto"\n',
    )
    process.exit(1)
  }

  const dias = diasDelRango(desde, hasta)
  const q = sinAcentos(busca)
  let conBoletin = 0
  let anunciosVistos = 0
  const hallazgos: Array<{ fecha: string; title: string; pdfUrl: string }> = []
  const fallos: string[] = []

  process.stdout.write(`[bop-hist] ${dias.length} día(s) · busca «${busca}»\n`)

  for (const dia of dias) {
    let texto: string | null
    try {
      texto = await fetchBopBulletinText(comoBoletin(dia))
    } catch (e) {
      fallos.push(`${dia}: ${(e as Error).message}`)
      continue
    }
    if (!texto) continue // 404 = no hubo boletín ese día
    conBoletin++
    const anuncios = parseBopBulletin(texto, comoBoletin(dia), dia)
    anunciosVistos += anuncios.length
    for (const a of anuncios) {
      if (!sinAcentos(a.title).includes(q)) continue
      hallazgos.push({ fecha: dia, title: a.title, pdfUrl: a.pdfUrl })
      process.stdout.write(`  ${dia} · ${a.title.slice(0, 110)}\n`)
    }
    await dormir(PAUSA_MS)
  }

  mkdirSync(DESTINO, { recursive: true })
  const salida = resolve(DESTINO, `bop-${desde}_${hasta}-${q.slice(0, 12)}.json`)
  writeFileSync(
    salida,
    JSON.stringify(
      {
        consulta: { desde, hasta, busca },
        recuento: {
          diasPedidos: dias.length,
          diasConBoletin: conBoletin,
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
    `[bop-hist] ${dias.length} pedidos · ${conBoletin} con boletín · ${anunciosVistos} anuncios · ` +
      `${hallazgos.length} coincidencia(s) · ${fallos.length} fallo(s)\n`,
  )
  for (const f of fallos) process.stdout.write(`  [fallo] ${f}\n`)
  process.stdout.write(`[bop-hist] → ${salida}\n`)

  if (conBoletin === 0) {
    process.stderr.write('[bop-hist] ni un boletín leído: el barrido no ha comprobado nada\n')
    process.exit(1)
  }
}

main().catch((e) => {
  process.stderr.write(`[bop-hist] ${(e as Error).message}\n`)
  process.exit(1)
})
