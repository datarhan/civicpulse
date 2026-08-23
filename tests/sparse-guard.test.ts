import { describe, it, expect } from 'vitest'
import {
  clasificar,
  contarOcultos,
  esparcidoActivoEnConfig,
  ORDEN_REPARACION,
  patronesUtiles,
  raizDesdeGitdir,
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

describe('raizDesdeGitdir', () => {
  it('saca la raíz del worktree de su fichero `gitdir`', () => {
    // Contenido literal de .git/worktrees/description-reframe/gitdir.
    expect(
      raizDesdeGitdir('/Users/x/dev/CivicPulse/.claude/worktrees/description-reframe/.git\n'),
    ).toBe('/Users/x/dev/CivicPulse/.claude/worktrees/description-reframe')
  })

  it('devuelve null si no tiene esa pinta', () => {
    // Un worktree cuya ruta no se sabe no se toca, y desde luego no se le corre
    // un `git -C` a ciegas: sería adivinar sobre el árbol de otra sesión.
    expect(raizDesdeGitdir('')).toBeNull()
    expect(raizDesdeGitdir('/ruta/sin/sufijo')).toBeNull()
    expect(raizDesdeGitdir('/.git')).toBeNull()
  })
})

describe('ORDEN_REPARACION', () => {
  it('apaga ANTES de borrar el patrón', () => {
    // No es estilo, está medido: con `core.sparseCheckout = true` y el fichero
    // de patrones borrado, un `sparse-checkout reapply` dejó el repo de pruebas
    // en UN solo fichero — se llevó hasta el directorio que el patrón salvaba,
    // porque en modo cono «sin patrones» significa «no encaja nada».
    expect(ORDEN_REPARACION).toEqual(['disable', 'borrar-patron'])
    expect(ORDEN_REPARACION.indexOf('disable')).toBeLessThan(
      ORDEN_REPARACION.indexOf('borrar-patron'),
    )
  })
})

describe('esparcidoActivoEnConfig', () => {
  // Contenido literal de .git/worktrees/description-reframe/config.worktree el
  // 23-08-2026. Se informó de ese worktree como «patrón apagado, inerte» y era
  // mentira: la bandera estaba puesta. Esta prueba fija la diferencia.
  const CEBADO = '[core]\n\tsparseCheckout = true\n\tsparseCheckoutCone = true\n'
  const APAGADO =
    '[core]\n\tsparseCheckout = false\n\tsparseCheckoutCone = false\n[index]\n\tsparse = false\n'

  it('reconoce la bandera encendida', () => {
    expect(esparcidoActivoEnConfig(CEBADO)).toBe(true)
  })

  it('y no la confunde con la apagada', () => {
    expect(esparcidoActivoEnConfig(APAGADO)).toBe(false)
    expect(esparcidoActivoEnConfig('')).toBe(false)
  })

  it('no se deja engañar por `sparseCheckoutCone = true`', () => {
    // El control que importa: el nombre de la otra clave CONTIENE el de ésta,
    // así que un `includes('sparseCheckout = true')` mal escrito daría true con
    // el esparcido apagado — y la guarda cantaría un cebado que no existe.
    expect(esparcidoActivoEnConfig('[core]\n\tsparseCheckoutCone = true\n')).toBe(false)
  })
})
