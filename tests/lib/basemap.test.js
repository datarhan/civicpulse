import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BASEMAP_ATTRIBUTION, CARTO_TILES, tileUrl } from '../../src/lib/basemap'

const RAIZ = join(__dirname, '..', '..')

/** Todo `.jsx`/`.js` bajo src/, para poder buscar copias sueltas de la URL. */
function fuentes(dir, acc = []) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) fuentes(ruta, acc)
    else if (/\.jsx?$/.test(nombre)) acc.push(ruta)
  }
  return acc
}

describe('lib/basemap', () => {
  it('mete la clave donde CARTO la lee, y no deja un `key=` vacío sin ella', () => {
    // Con clave: el parámetro es `key`, no `api_key` — lo segundo devuelve la
    // teselita con la marca de agua y un 200, que es indistinguible de acertar.
    expect(tileUrl('abc123')).toContain('?key=abc123')
    expect(tileUrl('abc123')).toContain(CARTO_TILES)

    // Sin clave, la URL sale limpia: un `?key=` vacío se comporta igual pero
    // deja creer que hay clave puesta cuando no la hay.
    expect(tileUrl('')).not.toContain('key=')
    expect(tileUrl(undefined)).not.toContain('key=')
  })

  it('conserva el marcador de retina, que la portada ya usaba', () => {
    // `{r}` lo expande Leaflet a `@2x` en pantallas densas. CARTO lo sirve
    // (medido: 200, 30.773 B); quitarlo degrada el mapa en cualquier Mac.
    expect(tileUrl('abc123')).toContain('{r}')
    expect(tileUrl('abc123')).toContain('{z}/{x}/{y}')
  })

  it('la atribución nombra a CARTO Y a OpenStreetMap', () => {
    // No es decorativa: la capa gratuita de CARTO la exige por escrito, y la
    // ODbL de OSM la exige venga la tesela de donde venga.
    expect(BASEMAP_ATTRIBUTION).toMatch(/CARTO/)
    expect(BASEMAP_ATTRIBUTION).toMatch(/OpenStreetMap/)
  })

  it('ningún componente conserva su propia copia de la URL', () => {
    // Cuatro copias a mano es lo que convirtió «CARTO pide clave» en un
    // arreglo de cuatro ficheros donde uno podía quedarse atrás en silencio,
    // porque un mapa sin clave no falla: se marca con agua y devuelve 200.
    const sueltas = fuentes(join(RAIZ, 'src'))
      .filter((f) => !f.endsWith(join('lib', 'basemap.js')))
      .filter((f) => /cartocdn/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(RAIZ + '/', ''))
    expect(sueltas).toEqual([])
  })
})
