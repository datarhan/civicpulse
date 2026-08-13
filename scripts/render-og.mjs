#!/usr/bin/env node
/**
 * Rasteriza public/og.svg a public/og.png.
 *
 * Por qué existe: Facebook, WhatsApp, X y LinkedIn **no renderizan SVG** como
 * og:image; exigen PNG o JPEG. El sitio declaraba
 * `og:image = /og.svg` con `og:image:type = image/svg+xml`, así que la pieza que
 * el brandbook §12 llama «la más vista del proyecto» probablemente no se veía en
 * ninguna de las plataformas donde circula. Rediseñar su contenido y dejarla en
 * un formato que nadie pinta sería hacer el trabajo visible y saltarse el eficaz.
 *
 * El SVG sigue siendo la fuente: se edita ese, y esto lo rasteriza. Usa el
 * Playwright que el repo ya tiene para los e2e — cero dependencias nuevas.
 *
 * Deja además `public/og.png.sha`, el sha256 del SVG del que salió el PNG. Es
 * lo que permite a tests/og-card.test.js distinguir «el PNG está al día» de
 * «alguien tocó el SVG y no volvió a generar»: se direcciona por CONTENIDO, no
 * por fecha de fichero, porque un `git checkout` reescribe las fechas y dejaría
 * la comprobación afirmando algo que no midió.
 *
 *   npm run render:og
 */
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SVG = join(ROOT, 'public/og.svg')
const PNG = join(ROOT, 'public/og.png')
const SHA = join(ROOT, 'public/og.png.sha')

const WIDTH = 1200
const HEIGHT = 630

const svg = readFileSync(SVG, 'utf8')

// Un SVG mal formado se sirve como página de error, no como imagen — y eso ya
// pasó una vez: un doble guion dentro de un comentario XML rompió el fichero
// entero mientras el balance de etiquetas, la paleta y el guard de marca daban
// verde. Se comprueba antes de gastar un navegador en ello.
const comentarios = svg.match(/<!--[\s\S]*?-->/g) ?? []
for (const c of comentarios) {
  if (c.slice(4, -3).includes('--')) {
    console.error('✗ og.svg: un comentario XML contiene «--», lo que invalida el fichero entero.')
    console.error('  ' + c.slice(0, 120).replace(/\n/g, ' ') + '…')
    process.exit(1)
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2, // 2400×1260: las plataformas reescalan hacia abajo
})

// Abrir el SVG por file:// deja las fuentes en las del sistema, y la tarjeta de
// marca saldría en una grotesca cualquiera en vez de en Outfit — §03 dice dos
// familias, una por función. Así que se envuelve en un HTML mínimo que carga
// las de verdad, las mismas que index.html.
const FUENTES =
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=DM+Mono:wght@400;500;700&display=swap'
await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8">
   <link rel="stylesheet" href="${FUENTES}">
   <style>html,body{margin:0;padding:0;background:#0B0F19}svg{display:block}</style>
   </head><body>${svg}</body></html>`,
  { waitUntil: 'networkidle' },
)

// Y se COMPRUEBA que llegaron. Sin esto, un fallo de red produce una tarjeta en
// la fuente equivocada, idéntica de tamaño y sin ningún síntoma: exactamente la
// forma de «verde por no haber medido nada» que este repo ya ha pagado. Mejor
// romper la generación que publicar una marca mal compuesta.
await page.evaluate(() => document.fonts.ready)
const fuentesOk = await page.evaluate(() => ({
  outfit: document.fonts.check('700 62px Outfit'),
  mono: document.fonts.check('400 19px "DM Mono"'),
}))
if (!fuentesOk.outfit || !fuentesOk.mono) {
  await browser.close()
  console.error('✗ las fuentes de marca no cargaron:', JSON.stringify(fuentesOk))
  console.error('  el PNG habría salido en la fuente de sistema. No se escribe nada.')
  process.exit(1)
}

await page.screenshot({ path: PNG, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } })
await browser.close()

const sha = createHash('sha256').update(svg).digest('hex')
writeFileSync(SHA, sha + '\n')

console.log(`✓ public/og.png  ${WIDTH}×${HEIGHT} @2x`)
console.log(`  desde og.svg   sha256 ${sha.slice(0, 16)}…`)
