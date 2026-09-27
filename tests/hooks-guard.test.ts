import { describe, it, expect } from 'vitest'
import {
  esLanzadorDeHusky,
  estadoComun,
  ganchosDelRepo,
  problemaDe,
  problemasDe,
  PROBLEMAS,
  QUE_PASA,
  reparacion,
  tine,
  worktreesDe,
  type MedidaGancho,
} from '../src/scraper/hooks-guard'

/**
 * Salida literal de `git worktree list --porcelain` en el portátil del curador el
 * 27-09-2026 (las tres primeras entradas, con la ruta de usuario acortada). La
 * cuarta es sintética, con la forma que documenta git para un worktree cuya
 * carpeta ya no existe: hoy no había ninguno.
 */
const PORCELAIN = `worktree /Users/x/dev/CivicPulse
HEAD 27edc0bbc3a9fe2f58ee8e863b0770eb9a34c333
branch refs/heads/main

worktree /Users/x/dev/civicpulse-revision
HEAD b6d968f6311a255c1a7aee22246f85ec89d1ea32
branch refs/heads/revision-reportajes

worktree /Users/x/dev/CivicPulse/.claude/worktrees/ayto-registros
HEAD aa5131b7bb079c6eb513330b93d059a44028ce9a
branch refs/heads/secretaria-coffee
locked claude session ayto-registros (pid 24641 start Sun Sep 27 06:42:31 2026)

worktree /Users/x/dev/CivicPulse/.claude/worktrees/borrado
HEAD 0000000000000000000000000000000000000000
detached
prunable gitdir file points to non-existent location

`

/** Bytes literales de `.husky/_/pre-commit` en el checkout principal: sin salto final. */
const LANZADOR = '#!/usr/bin/env sh\n. "$(dirname "$0")/h"'

/** Las primeras líneas reales de `.husky/pre-commit`: el guion, no el lanzador. */
const GUION = [
  '# Fail closed on real errors; warnings stay warnings (by design).',
  "# If ESLint takes too long, consider 'lint-staged' to check only changed files.",
  'cd "$(git rev-parse --show-toplevel)"',
  'npm run lint --silent',
].join('\n')

const gancho = (p: Partial<MedidaGancho>): MedidaGancho => ({
  nombre: 'pre-commit',
  fichero: 'presente',
  lanzador: true,
  corredor: true,
  guion: true,
  ...p,
})

describe('worktreesDe', () => {
  it('lee cada worktree, marca el principal y el que ya no está en disco', () => {
    expect(worktreesDe(PORCELAIN)).toEqual([
      { ruta: '/Users/x/dev/CivicPulse', principal: true, enDisco: true },
      { ruta: '/Users/x/dev/civicpulse-revision', principal: false, enDisco: true },
      {
        ruta: '/Users/x/dev/CivicPulse/.claude/worktrees/ayto-registros',
        principal: false,
        enDisco: true,
      },
      {
        ruta: '/Users/x/dev/CivicPulse/.claude/worktrees/borrado',
        principal: false,
        enDisco: false,
      },
    ])
  })

  it('no toma por borrado un worktree cuya RUTA contiene «prunable»', () => {
    // El control: un `includes('prunable')` sobre el bloque daría por perdido un
    // worktree vivo, y la guarda dejaría de mirarlo sin decir nada.
    const salida =
      'worktree /r\nHEAD 1\nbranch refs/heads/main\n\nworktree /r/prunable-x\nHEAD 2\n\n'
    expect(worktreesDe(salida).map((w) => w.enDisco)).toEqual([true, true])
  })
})

describe('ganchosDelRepo', () => {
  it('son los ficheros rastreados justo bajo .husky/', () => {
    // Salida literal de `git ls-files -- .husky` el 27-09-2026.
    expect(ganchosDelRepo('.husky/pre-commit\n.husky/pre-push\n')).toEqual([
      'pre-commit',
      'pre-push',
    ])
  })

  it('no cuenta como gancho lo que no puede serlo', () => {
    // Un README o el `.gitignore` de husky, contados como ganchos, pondrían la
    // guarda en rojo por un «README.md» que git nunca iba a ejecutar.
    const salida = '.husky/.gitignore\n.husky/README.md\n.husky/_/h\n.husky/pre-push\n'
    expect(ganchosDelRepo(salida)).toEqual(['pre-push'])
  })
})

describe('esLanzadorDeHusky', () => {
  it('reconoce el lanzador que husky genera en .husky/_/, aunque no acabe en salto de línea', () => {
    expect(esLanzadorDeHusky(LANZADOR)).toBe(true)
  })

  it('no confunde el guion de .husky/ con su lanzador', () => {
    // Es la trampa de la app de escritorio: sin `core.hooksPath`, apunta el
    // worktree a `.husky` a secas y git ejecuta el guion directamente, sin el
    // `sh -e` de husky — medido: un paso que falla deja pasar el commit.
    expect(esLanzadorDeHusky(GUION)).toBe(false)
    expect(esLanzadorDeHusky('')).toBe(false)
  })

  it('no toma por lanzador un guion que carga otra cosa llamada h…', () => {
    // La forma de husky 8 cargaba `_/husky.sh` desde el propio guion.
    expect(esLanzadorDeHusky('#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n')).toBe(false)
  })
})

describe('estadoComun', () => {
  it('relativo: el destino se resuelve contra el checkout PRINCIPAL', () => {
    // Git resuelve un valor relativo contra la raíz de cada worktree; el arreglo
    // tiene que fijarlo contra el principal, que es donde husky lo generó.
    expect(estadoComun('.husky/_', '/Users/x/dev/CivicPulse', true)).toEqual({
      tipo: 'relativo',
      valor: '.husky/_',
      destino: '/Users/x/dev/CivicPulse/.husky/_',
    })
  })

  it('absoluto: nada que resolver', () => {
    expect(
      estadoComun('/Users/x/dev/CivicPulse/.husky/_', '/Users/x/dev/CivicPulse', true),
    ).toEqual({
      tipo: 'absoluto',
      valor: '/Users/x/dev/CivicPulse/.husky/_',
    })
  })

  it('sin poner, con ganchos en la máquina: sin-poner', () => {
    expect(estadoComun(null, '/r', true).tipo).toBe('sin-poner')
  })

  it('sin poner y sin ganchos: la máquina no tiene ganchos (CI, clon nuevo)', () => {
    expect(estadoComun(null, '/r', false)).toEqual({ tipo: 'sin-ganchos' })
  })

  it('una cadena vacía es «sin poner», no un camino relativo', () => {
    // `resolve('/r', '')` es '/r': tomarla por relativa haría que --fix
    // escribiese la raíz del repositorio como directorio de ganchos.
    expect(estadoComun('', '/r', false)).toEqual({ tipo: 'sin-ganchos' })
    expect(estadoComun('', '/r', true).tipo).toBe('sin-poner')
  })
})

describe('reparacion', () => {
  const existe = () => true

  it('sólo repara el valor relativo, y con el destino absoluto', () => {
    expect(reparacion(estadoComun('.husky/_', '/r', true), existe)).toBe('/r/.husky/_')
  })

  it('no instala ganchos donde no hay valor puesto', () => {
    // Sin valor, alguien pudo quitarlo a propósito; y en CI no hay ganchos por
    // diseño. Poner uno es instalar, no reparar.
    expect(reparacion(estadoComun(null, '/r', true), existe)).toBeNull()
    expect(reparacion(estadoComun(null, '/r', false), existe)).toBeNull()
  })

  it('no reescribe un valor absoluto', () => {
    expect(reparacion(estadoComun('/otro/sitio/_', '/r', true), existe)).toBeNull()
  })

  it('no apunta a un directorio que no existe', () => {
    // husky corrió en un worktree y nunca en el principal: fijar el absoluto
    // dejaría sin ganchos al único árbol que los tenía — y el pre-commit de ese
    // árbol, que repara, se los quitaría a sí mismo.
    expect(reparacion(estadoComun('.husky/_', '/r', true), () => false)).toBeNull()
  })
})

describe('problemaDe', () => {
  it('sin problema cuando la cadena entera está: lanzador, corredor y guion', () => {
    expect(problemaDe(gancho({}))).toBeNull()
  })

  it('cada eslabón que falta tiene su nombre', () => {
    expect(problemaDe(gancho({ fichero: 'ausente' }))).toBe('ausente')
    expect(problemaDe(gancho({ fichero: 'no-ejecutable' }))).toBe('no-ejecutable')
    expect(problemaDe(gancho({ lanzador: false }))).toBe('sin-lanzador')
    expect(problemaDe(gancho({ corredor: false }))).toBe('sin-corredor')
    // El silencioso de husky: `h` no encuentra el guion y sale 0.
    expect(problemaDe(gancho({ guion: false }))).toBe('sin-guion')
  })

  it('un fichero ausente es «ausente», no «sin lanzador»', () => {
    // Lo que no está no se puede leer: diagnosticarlo como un lanzador ajeno
    // mandaría a buscar el fallo donde no está.
    expect(problemaDe(gancho({ fichero: 'ausente', lanzador: false, corredor: false }))).toBe(
      'ausente',
    )
  })
})

describe('problemasDe', () => {
  it('un worktree que git no dejó medir tiene un problema, no cero', () => {
    // Un null no es «no encontré nada»: es el `r?.findings ?? []` que imprime su
    // propio visto bueno.
    expect(problemasDe({ ruta: '/r/wt', dir: null, ganchos: [] })).toEqual([
      { gancho: null, problema: 'sin-medir' },
    ])
  })

  it('lista sólo los ganchos rotos', () => {
    expect(
      problemasDe({
        ruta: '/r/wt',
        dir: '/r/wt/.husky/_',
        ganchos: [gancho({}), gancho({ nombre: 'pre-push', fichero: 'ausente' })],
      }),
    ).toEqual([{ gancho: 'pre-push', problema: 'ausente' }])
  })
})

describe('QUE_PASA', () => {
  it('explica cada problema que la guarda puede dar', () => {
    for (const p of PROBLEMAS) expect(QUE_PASA[p], p).toBeTruthy()
  })
})

describe('tine', () => {
  const absoluto = estadoComun('/r/.husky/_', '/r', true)
  const relativo = estadoComun('.husky/_', '/r', true)

  it('un valor relativo tiñe aunque hoy ningún worktree esté roto', () => {
    // Si sólo contaran los síntomas, bastaría con que hoy todos los worktrees
    // los hubiese creado la app de escritorio —que fija su propio valor— para
    // callar; y el siguiente creado de otro modo saldría sin ganchos.
    expect(tine(relativo, 0, { desdeGancho: false })).toBe(true)
  })

  it('sin poner, habiendo ganchos en la máquina, tiñe', () => {
    expect(tine(estadoComun(null, '/r', true), 0, { desdeGancho: false })).toBe(true)
  })

  it('un worktree con problemas tiñe, aunque el valor compartido esté bien', () => {
    expect(tine(absoluto, 1, { desdeGancho: false })).toBe(true)
    expect(tine(absoluto, 0, { desdeGancho: false })).toBe(false)
  })

  it('una máquina sin ganchos no tiñe: CI no los tiene a propósito', () => {
    expect(tine(estadoComun(null, '/r', false), 0, { desdeGancho: false })).toBe(false)
  })

  it('desde un gancho no tiñe nunca', () => {
    // El pre-commit del principal lo corren también los agentes de launchd:
    // un fallo de OTRO worktree no puede parar sus commits de datos.
    expect(tine(relativo, 3, { desdeGancho: true })).toBe(false)
  })
})
