/**
 * El catálogo de /datos como tabla (auditoría de las dos lecturas, §22): por
 * cada fichero, qué es una fila, con qué licencia o en qué condiciones se
 * reutiliza, y qué código lo escribe. Hasta el 22-11-2026 era una rejilla de
 * fichas con el recuento, la fuente y la fecha; la licencia sólo salía dentro de
 * tres cadenas de fuente, y lo que produce CivicPulse no tenía ninguna declarada.
 *
 * Desde el 22-11-2026, lo que produce CivicPulse se publica con CC BY 4.0; lo que
 * viene de fuera conserva las condiciones de su fuente, como ya dice /aviso-legal;
 * y el texto de cada queja es de quien la escribe. La licencia de cada fichero
 * vive en `src/lib/catalogo-datos.js`, al lado de su fila y de su código.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { FICHAS, LICENCIAS } from '../src/lib/catalogo-datos'
import { CATALOGUE } from '../src/i18n'

const PAGINA = readFileSync(resolve('src/pages/Datos.jsx'), 'utf8')

/** Ruta → texto de su fuente, tal como lo pinta el catálogo. */
function fuentesDelCatalogo() {
  const out = new Map()
  const items = PAGINA.slice(
    PAGINA.indexOf('const items = ['),
    PAGINA.indexOf('...EXTRA_DATASETS.map'),
  )
  for (const m of items.matchAll(/source:\s*(?:'([^']*)'|`([^`]*)`)[\s\S]*?path:\s*'([^']+)'/g))
    out.set(m[3], m[1] ?? m[2])
  const extra = PAGINA.slice(PAGINA.indexOf('const EXTRA_DATASETS = ['))
  for (const m of extra.matchAll(/\[\s*'[^']+',\s*'(\/data\/[^']+)',\s*'([^']+)'/g))
    if (!out.has(m[1])) out.set(m[1], m[2])
  return out
}
const FUENTES = fuentesDelCatalogo()

describe('cada fichero del catálogo, con su ficha', () => {
  it('mide algo: el catálogo tiene decenas de ficheros', () => {
    expect(FUENTES.size).toBeGreaterThan(40)
  })

  it('cada fichero del catálogo tiene su ficha, y ninguna ficha sobra', () => {
    expect(Object.keys(FICHAS).sort()).toEqual([...FUENTES.keys()].sort())
  })

  it('cada ficha dice qué es una fila, en los dos idiomas y distinto en cada uno', () => {
    for (const [ruta, f] of Object.entries(FICHAS)) {
      expect(CATALOGUE.es[f.fila], `${ruta}: ${f.fila}`).toBeTruthy()
      expect(CATALOGUE.ca[f.fila], `${ruta}: ${f.fila}`).toBeTruthy()
      expect(CATALOGUE.ca[f.fila], ruta).not.toBe(CATALOGUE.es[f.fila])
    }
  })

  it('cada licencia es una de las conocidas, con su enlace salvo la de la prensa', () => {
    for (const [ruta, f] of Object.entries(FICHAS)) {
      const l = LICENCIAS[f.licencia]
      expect(l, `${ruta}: ${f.licencia}`).toBeTruthy()
      if (f.licencia !== 'prensa') expect(l.url, ruta).toMatch(/^https:\/\//)
      if (l.clave) {
        expect(CATALOGUE.es[l.clave], l.clave).toBeTruthy()
        expect(CATALOGUE.ca[l.clave], l.clave).toBeTruthy()
      } else expect(l.nombre, ruta).toBeTruthy()
    }
  })

  it('el código que se enlaza existe en el repositorio', () => {
    for (const [ruta, f] of Object.entries(FICHAS))
      expect(existsSync(resolve(f.codigo)), `${ruta}: ${f.codigo}`).toBe(true)
  })
})

describe('qué licencia lleva cada uno', () => {
  // Lo que produce CivicPulse se reconoce en la fuente que el propio catálogo
  // pinta: «curación», «modelo propio», «derivado» o el bot de quejas. Así la
  // licencia no puede contradecir a la fuente que se lee en la misma fila.
  const esPropia = (fuente) => /curaci[oó]n|modelo propio|derivado|Telegram bot/i.test(fuente)

  it('lo que produce CivicPulse lleva su CC BY 4.0, y sólo eso', () => {
    const propias = [...FUENTES].filter(([, fuente]) => esPropia(fuente)).map(([r]) => r)
    expect(propias.length).toBeGreaterThan(5)
    for (const [ruta, fuente] of FUENTES)
      expect(FICHAS[ruta]?.licencia === 'propia', `${ruta} · ${fuente}`).toBe(esPropia(fuente))
  })

  it('las fuentes con licencia propia la conservan', () => {
    for (const [ruta, fuente] of FUENTES) {
      if (/OpenStreetMap/.test(fuente)) expect(FICHAS[ruta].licencia, ruta).toBe('odbl')
      if (/wikidata/i.test(fuente)) expect(FICHAS[ruta].licencia, ruta).toBe('cc0')
      if (/CC BY 4\.0/.test(fuente)) expect(FICHAS[ruta].licencia, ruta).toBe('cc-by-4.0')
    }
  })

  it('la prensa no se ofrece como dato abierto', () => {
    expect(FICHAS['/data/press.json'].licencia).toBe('prensa')
  })

  it('el texto de cada queja es de quien la escribe, y la fila lo dice', () => {
    const q = FICHAS['/data/quejas.json']
    expect(q.licencia).toBe('propia')
    expect(CATALOGUE.es[q.nota]).toMatch(/texto de cada queja es de quien la escribe/)
    expect(CATALOGUE.ca[q.nota]).toMatch(
      /text de cada queixa és de qui l’escriu|text de cada queixa és de qui l'escriu/,
    )
  })
})

describe('el contrato publicado lo dice', () => {
  const aviso = readFileSync(resolve('src/pages/AvisoLegal.jsx'), 'utf8')

  it('/aviso-legal declara la licencia de los datos de CivicPulse y la de las quejas', () => {
    expect(aviso).toMatch(/Licencia de los datos/)
    expect(aviso).toMatch(/CC BY 4\.0/)
    expect(aviso).toMatch(/texto de cada queja es de quien la escribe/)
  })
})
