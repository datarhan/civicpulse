import { describe, it, expect } from 'vitest'
import {
  clasificar,
  contarOcultos,
  patronesUtiles,
  tine,
  type EstadoWorktree,
} from '../src/scraper/sparse-guard'

/**
 * El caso real, reproducido en un repo de usar y tirar el 23-08-2026:
 *
 *     git sparse-checkout set providers/claude/plugin
 *     → docs/b.txt pasa a `S` y DESAPARECE del disco; root.txt se queda
 *
 * Es lo que se llevó `docs/` entero de este repositorio, y `git status` no dijo
 * nada porque para git no faltaba nada.
 */
const AJENO = `/*
!/*/
/providers/
!/providers/*/
/providers/claude/
!/providers/claude/*/
/providers/claude/plugin/
`

const worktree = (p: Partial<EstadoWorktree>): EstadoWorktree => ({
  ruta: '/repo',
  activo: false,
  patrones: [],
  ocultos: 0,
  ...p,
})

describe('patronesUtiles', () => {
  it('se queda con la línea que nombra algo y tira el andamiaje del cono', () => {
    // Las seis líneas de andamiaje son iguales en cualquier `set`, así que no
    // distinguen un patrón de otro. La útil es la que permite reconocer de
    // dónde vino — aquí, la fuente `git-subdir` del plugin de stripe.
    expect(patronesUtiles(AJENO)).toEqual([
      '/providers/',
      '/providers/claude/',
      '/providers/claude/plugin/',
    ])
  })

  it('un fichero vacío no son patrones', () => {
    expect(patronesUtiles('')).toEqual([])
    expect(patronesUtiles('\n\n  \n')).toEqual([])
  })
})

describe('contarOcultos', () => {
  it('cuenta las marcas S de `git ls-files -v`, que son los ficheros podados', () => {
    // Salida literal del repo de prueba, con el sparse-checkout ajeno puesto.
    const salida = ['H providers/claude/plugin/a.txt', 'H root.txt', 'S docs/b.txt'].join('\n')
    expect(contarOcultos(salida)).toBe(1)
  })

  it('no confunde un fichero que EMPIEZA por S con una marca S', () => {
    // El control: sin el espacio, `Src/…` contaría como oculto y la guarda
    // inventaría un daño que no existe.
    expect(contarOcultos('H Src/algo.ts\nH SKILL.md')).toBe(0)
  })
})

describe('clasificar', () => {
  it('sin patrones y apagado, limpio', () => {
    expect(clasificar(worktree({}))).toBe('limpio')
  })

  it('apagado pero con el fichero de patrones ahí, restos', () => {
    // Apagar NO borra el fichero: queda listo para volver a aplicarse, y es la
    // huella que identifica al culpable. Por eso no se confunde con «limpio».
    expect(clasificar(worktree({ patrones: patronesUtiles(AJENO) }))).toBe('restos')
  })

  it('activo, podando', () => {
    expect(
      clasificar(worktree({ activo: true, patrones: patronesUtiles(AJENO), ocultos: 64 })),
    ).toBe('podando')
  })
})

describe('tine', () => {
  it('sólo la poda activa tiñe', () => {
    // Un resto no oculta ni un fichero. Una guarda que se pone roja por algo
    // que no hace daño es una guarda que se acaba saltando.
    expect(tine([worktree({ patrones: patronesUtiles(AJENO) })])).toBe(false)
    expect(tine([worktree({})])).toBe(false)
  })

  it('y basta con que UN worktree esté podado', () => {
    expect(tine([worktree({}), worktree({ activo: true, ocultos: 1 })])).toBe(true)
  })
})
