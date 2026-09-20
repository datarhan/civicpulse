import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * La clave de Gemini nunca va en la URL.
 *
 * Una URL acaba en sitios a los que una cabecera no llega: el mensaje de un error de
 * red, el argv de un proceso —que lee cualquiera con `ps`—, el registro de un proxy. El
 * 1-sep-2026 la clave entró en git justo así: `execFileSync` pone el argv completo en
 * el mensaje del error, el argv llevaba `?key=…`, y ese mensaje se guardaba como el
 * motivo de un trozo fallido en dos mapas de voces. De ahí nació
 * `src/scraper/redact-secrets.ts`, que tapa el estropicio; esto quita la causa.
 *
 * Se miran SÓLO los ficheros que hablan con la API de Gemini, para no confundirla con
 * la clave del mapa base de CARTO, que sí va en la URL de cada tesela y es pública.
 */

const DIRECTORIOS = ['scripts', 'src', 'bot/src']
const HOST = 'generativelanguage.googleapis.com'
/**
 * Una clave METIDA en la URL: `?key=${…}` en JS, `?key=%s` o `?key=$VAR` en shell. No
 * basta con buscar `?key=`, porque los comentarios de estos mismos ficheros lo nombran
 * para explicar por qué no se usa. Y tampoco vale quitar los comentarios antes de
 * mirar: la regla de `//` se comería el resto de una línea con una URL literal —
 * `https://…?key=${clave}`— que es justo lo que se busca.
 */
const CLAVE_EN_URL = /[?&]key=(\$\{|%s|\$[A-Za-z_(]|["']\s*\+)/

function ficherosDe(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : ficherosDe(p)
    return /\.(ts|tsx|js|jsx|mjs|sh)$/.test(e.name) ? [p] : []
  })
}

describe('la clave de Gemini viaja en la cabecera', () => {
  const hablanConGemini = DIRECTORIOS.flatMap(ficherosDe)
    .map((f) => ({ f, src: readFileSync(f, 'utf8') }))
    .filter(({ src }) => src.includes(HOST))

  it('el barrido encuentra los ficheros que llaman a Gemini (si no, no prueba nada)', () => {
    expect(hablanConGemini.map((x) => x.f).sort()).toEqual(
      expect.arrayContaining([
        'bot/src/services/photo-anonymize.ts',
        'scripts/extract-speaker-map.ts',
        'scripts/transcribe-pleno.sh',
      ]),
    )
  })

  it('ninguno mete la clave en la URL', () => {
    const conClaveEnLaUrl = hablanConGemini
      .filter(({ src }) => CLAVE_EN_URL.test(src))
      .map(({ f }) => f)
      .sort()
    expect(conClaveEnLaUrl).toEqual([])
  })
})
