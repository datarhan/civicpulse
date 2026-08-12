#!/usr/bin/env tsx
/**
 * Descarga el fichero CESEL de una comunidad autónoma para cada entrega.
 *
 * POR QUÉ UN NAVEGADOR Y NO curl
 *
 * La descarga del mapa es un POST de formulario con tres campos ocultos, y se
 * reprodujo con curl hasta el último detalle: mismos diez campos, mismas
 * longitudes de `__VIEWSTATE` y `__EVENTVALIDATION`, misma cookie de sesión,
 * cabeceras de navegador completas. El servidor contesta 200 con la página en
 * vez del fichero. Lo que la aplicación mira para decidir no está en la
 * petición, así que la vía headless quedó descartada por evidencia, no por
 * pereza.
 *
 * Y con el navegador del usuario tampoco: Chrome bloquea las descargas
 * automáticas a partir de la primera, y darle permiso a un sitio para
 * descargar en bucle es tocar la configuración de seguridad del navegador de
 * otra persona. Este script abre el suyo propio —perfil temporal, descargas
 * habilitadas por nosotros— y no toca nada del usuario.
 *
 * Cada fichero trae TODOS los municipios de la comunidad en esa entrega, así
 * que de aquí salen a la vez la serie propia y los pares año por año, que es
 * lo que permite que cada tarjeta titule con la entrega más reciente en vez de
 * quedarse anclada a la única que el ministerio vuelca en abierto.
 *
 *   npm run fetch:cesel-ccaa                 # Comunitat Valenciana, todas
 *   npm run fetch:cesel-ccaa -- --ccaa 17 --anios 2022,2023
 *
 * Los ficheros van a .cache/cesel/ccaa (gitignorado). Después:
 *   npm run scrape:coste-efectivo && npm run compute:indicadores
 */
import { chromium } from '@playwright/test'
import { mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const MAPA =
  'https://serviciostelematicosext.hacienda.gob.es/SGCIEF/CESEL/Consulta/Mapa/ConsultaMapa.aspx'

/** id de entrega → ejercicio, leídos del propio ddlEntrega de la página. */
const ENTREGAS: Record<string, number> = {
  '1': 2014,
  '3': 2015,
  '5': 2016,
  '6': 2017,
  '7': 2018,
  '8': 2019,
  '9': 2020,
  '10': 2021,
  '11': 2022,
  '12': 2023,
  '13': 2024,
}

const CCAA_NOMBRE: Record<string, RegExp> = {
  '17': /Comunitat Valenciana/i,
}

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function existe(p: string) {
  try {
    return (await stat(p)).size > 0
  } catch {
    return false
  }
}

async function main() {
  const ccaa = arg('ccaa') ?? '17'
  const patron = CCAA_NOMBRE[ccaa]
  if (!patron) throw new Error(`[cesel-ccaa] no sé qué región es la ${ccaa}`)
  const pedidos = arg('anios')
    ?.split(',')
    .map((s) => Number(s.trim()))
  const dest = join(ROOT, '.cache/cesel/ccaa')
  await mkdir(dest, { recursive: true })

  const navegador = await chromium.launch()
  // `acceptDownloads` es lo que sustituye al permiso que Chrome pide al
  // usuario: aquí lo concedemos explícitamente sobre un perfil que es nuestro.
  const contexto = await navegador.newContext({
    acceptDownloads: true,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/140.0.0.0 Safari/537.36 CivicPulse/1.0 (+https://github.com/datarhan/civicpulse)',
  })

  let hechos = 0
  let saltados = 0
  for (const [id, anio] of Object.entries(ENTREGAS)) {
    if (pedidos && !pedidos.includes(anio)) continue
    const salida = join(dest, `cesel-ccaa${ccaa}-${anio}.xlsx`)
    if (await existe(salida)) {
      console.log(`  ${anio} · ya estaba`)
      saltados++
      continue
    }

    const pagina = await contexto.newPage()
    try {
      // Una carga limpia por entrega: la aplicación arrastra estado entre
      // envíos y reutilizar la página devuelve la página en vez del fichero.
      await pagina.goto(MAPA, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await pagina.selectOption('#MainContentPlaceHolder_ddlEntrega', id)

      // Se llama a la función de la propia página en vez de pinchar el `area`:
      // un área de mapa de imagen no tiene caja de layout, así que Playwright
      // no sabe dónde pinchar. `Promise.all` evita además que la espera de la
      // descarga quede colgando y reviente el proceso si el disparo falla.
      const alt = await regionAlt(pagina, patron)
      if (!alt) throw new Error('no encuentro la región en el mapa')
      const [fichero] = await Promise.all([
        pagina.waitForEvent('download', { timeout: 180_000 }),
        pagina.evaluate((region) => {
          const area = [...document.querySelectorAll('area')].find((a) => a.alt === region)
          if (!area) throw new Error('región desaparecida')
          area.click()
        }, alt),
      ])
      await fichero.saveAs(salida)

      const bytes = (await stat(salida)).size
      // Este servidor contesta 200 con una página de error cuando algo falla.
      // Un xlsx empieza por PK; sin comprobarlo se guardaría HTML con nombre
      // de hoja de cálculo y el parser lo descubriría mucho más tarde.
      if (bytes < 10_000) throw new Error(`sólo ${bytes} bytes — no parece un xlsx`)
      console.log(`  ${anio} · ${(bytes / 1024 / 1024).toFixed(1)} MB`)
      hechos++
    } catch (err) {
      console.warn(`  ${anio} · falló: ${(err as Error).message.split('\n')[0]}`)
    } finally {
      await pagina.close()
      // Cortesía con el ministerio: son ficheros de varios MB.
      await new Promise((r) => setTimeout(r, 2500))
    }
  }

  await navegador.close()
  console.log(`[cesel-ccaa] ${hechos} descargada(s) · ${saltados} ya estaban → ${dest}`)
}

/** El alt exacto del área pinchable, para no depender del orden del mapa. */
async function regionAlt(
  pagina: import('@playwright/test').Page,
  patron: RegExp,
): Promise<string | null> {
  const alts = await pagina
    .locator('area')
    .evaluateAll((els) => els.map((e) => (e as HTMLAreaElement).alt))
  return alts.find((a) => patron.test(a)) ?? null
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
