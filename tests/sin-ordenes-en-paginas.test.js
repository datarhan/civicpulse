import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Un estado vacío tampoco lleva instrucciones para quien mantiene el sitio.
 *
 * `tests/e2e/interno.spec.ts` lee el texto que se pinta, y un estado vacío sólo
 * se pinta cuando falta el dato, que en el sitio publicado no falta. Así seguían
 * cuatro, re-medidos el 02-11-2026: /laboratorio/agentes sin asignaciones
 * («… con npm run journalist:assign»), /laboratorio/frontera y
 * /laboratorio/coste-esperado sin experimento («Se genera con npm run …») y el
 * filtro de /laboratorio/prensa que no encuentra nada, que SÍ se ve: basta con
 * pedir un medio y un veredicto que no casen, y respondía con cuatro órdenes
 * «si acabas de instalar el laboratorio».
 *
 * La guarda, escrita, encontró un quinto que nadie había medido: /promesas,
 * cuando no carga, decía «Regenera con npm run scrape:promise-suggestions».
 *
 * Por eso esta guarda lee el CÓDIGO de las páginas y los componentes, no lo que
 * se pinta. Se quitan antes los comentarios, que sí pueden nombrar órdenes.
 * Quedan fuera, con su motivo: las páginas que sólo existen en desarrollo
 * (`App.jsx` no monta el curador ni /despiece en un build, y `pages/curator/`
 * son trozos del curador); /metodologia, que es el contrato publicado y nombra
 * las herramientas con las que se corrige; y el blog técnico, en inglés, que
 * cuenta cómo está hecho el sitio (la misma razón que en `interno.spec.ts`).
 */
const RAIZ = resolve(__dirname, '..')
const FUERA = new Set([
  'src/pages/Curator.jsx',
  'src/pages/Despiece.jsx',
  'src/pages/Metodologia.jsx',
  'src/pages/blog/BuildingCivicPulse.jsx',
])

function jsx(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return jsx(p)
    return p.endsWith('.jsx') ? [p] : []
  })
}

const FICHEROS = [...jsx(join(RAIZ, 'src/pages')), ...jsx(join(RAIZ, 'src/components'))]
  .map((p) => relative(RAIZ, p))
  .filter((p) => !FUERA.has(p) && !p.startsWith('src/pages/curator/'))

/** El código sin comentarios: los de bloque, los de JSX y los de línea. */
function sinComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const ORDEN = /\bnpm run [\w:.-]+/g

describe('ningún estado vacío le pide al lector que ejecute nada', () => {
  it('mide algo: lee todas las páginas, y caza la orden aunque no la quite un comentario', () => {
    expect(FICHEROS.length).toBeGreaterThan(150)
    expect(FICHEROS).toContain('src/pages/LaboratorioPrensa.jsx')
    expect(FICHEROS).not.toContain('src/pages/Curator.jsx')
    expect(FICHEROS.some((f) => f.startsWith('src/pages/curator/'))).toBe(false)
    const muestra = 'Se genera con{" "}\n<code>npm run compute:dea</code>. // npm run otra'
    expect(sinComentarios(muestra).match(ORDEN)).toEqual(['npm run compute:dea'])
    expect(sinComentarios('/* npm run x */ {/* npm run y */}').match(ORDEN)).toBeNull()
  })

  for (const fichero of FICHEROS) {
    it(fichero, () => {
      const hallado = sinComentarios(readFileSync(join(RAIZ, fichero), 'utf8')).match(ORDEN) ?? []
      expect(hallado, `${fichero} le enseña una orden al lector`).toEqual([])
    })
  }
})
