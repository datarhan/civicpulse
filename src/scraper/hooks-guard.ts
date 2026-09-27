/**
 * ¿Ejecuta git los ganchos del repositorio en CADA worktree, o se los salta sin
 * decir nada?
 *
 * husky escribe `core.hooksPath = .husky/_` RELATIVO en el `.git/config` que
 * comparten todos los worktrees, y git resuelve un valor relativo contra la raíz
 * de cada uno. `.husky/_` lo genera husky y está en `.gitignore`: sólo existe
 * donde alguien lo generó. En los demás worktrees git no encuentra ningún gancho
 * y comitea y empuja como si no hubiera, sin una línea de aviso.
 *
 * El 27-09-2026 eran nueve de doce worktrees. La historia entera, el arreglo y
 * dónde está enchufada la guarda, en `scripts/check-hooks.ts`; aquí vive sólo lo
 * que se decide, para poder probarlo sin git.
 */
import { isAbsolute, resolve } from 'node:path'

/** Una entrada de `git worktree list --porcelain`. */
export interface Worktree {
  ruta: string
  /** El primero de la lista: el checkout principal, donde vive `.git`. */
  principal: boolean
  /** `false` si git lo marca `prunable`: registrado, pero su carpeta ya no está. */
  enDisco: boolean
}

export function worktreesDe(porcelain: string): Worktree[] {
  const worktrees: Worktree[] = []
  for (const bloque of porcelain.split(/\n\s*\n/)) {
    const lineas = bloque.split('\n')
    const cabecera = lineas.find((l) => l.startsWith('worktree '))
    if (!cabecera) continue
    worktrees.push({
      ruta: cabecera.slice('worktree '.length),
      principal: worktrees.length === 0,
      // Por LÍNEA, no por bloque: la ruta de un worktree vivo puede contener la
      // palabra, y darlo por perdido sería dejar de mirarlo sin decirlo.
      enDisco: !lineas.some((l) => l === 'prunable' || l.startsWith('prunable ')),
    })
  }
  return worktrees
}

/**
 * Los ganchos que trae el repositorio: los ficheros rastreados justo bajo
 * `.husky/`, con nombre de gancho de git (minúsculas, cifras y guiones). Se
 * derivan de `git ls-files` en vez de listarse aquí, para que un gancho nuevo
 * entre en la comprobación el día que entra en el repositorio.
 */
export function ganchosDelRepo(lsFiles: string): string[] {
  return lsFiles
    .split('\n')
    .map((l) => /^\.husky\/([a-z][a-z0-9-]*)$/.exec(l.trim())?.[1])
    .filter((n): n is string => Boolean(n))
}

/**
 * ¿Es el lanzador que husky 9 genera en `.husky/_/<gancho>`? Su única orden
 * carga el corredor `h` de al lado, que ejecuta `.husky/<gancho>` con `sh -e`.
 *
 * Importa porque los guiones de `.husky/` no llevan shebang y cuentan con ese
 * `-e` para fallar cerrado. Ejecutados por git directamente corren sin él, y un
 * paso que falla —lint, un secreto— deja pasar el commit: medido el 27-09-2026.
 */
export function esLanzadorDeHusky(texto: string): boolean {
  return /^\.\s+.*\/h"?\s*$/m.test(texto)
}

/** El valor de `core.hooksPath` en el config COMPARTIDO (`git config --local`). */
export type EstadoComun =
  | { tipo: 'absoluto'; valor: string }
  /** `destino`: el mismo directorio, resuelto contra el checkout principal. */
  | { tipo: 'relativo'; valor: string; destino: string }
  /** Sin poner, pero esta máquina tiene ganchos: nadie sin valor propio los corre. */
  | { tipo: 'sin-poner' }
  /** Ni valor ni ganchos generados: CI o un clon nuevo, donde no hay ganchos por diseño. */
  | { tipo: 'sin-ganchos' }

/**
 * `hayGanchos`: si `.husky/_` está generado en el principal o algún worktree
 * fija su propio valor. Sólo cuenta cuando el compartido no está puesto.
 */
export function estadoComun(
  valor: string | null,
  raizPrincipal: string,
  hayGanchos: boolean,
): EstadoComun {
  // Vacío es «sin poner»: `resolve(raiz, '')` es la raíz misma, y --fix la
  // escribiría como directorio de ganchos.
  if (!valor) return hayGanchos ? { tipo: 'sin-poner' } : { tipo: 'sin-ganchos' }
  if (isAbsolute(valor)) return { tipo: 'absoluto', valor }
  // Contra el PRINCIPAL, que es donde husky generó `.husky/_`: para él es el
  // mismo directorio de siempre, y para cada worktree pasa a ser ése.
  return { tipo: 'relativo', valor, destino: resolve(raizPrincipal, valor) }
}

/**
 * Lo que `--fix` escribe en el config compartido, o `null`.
 *
 * Sólo el valor relativo se repara. Uno sin poner pudo quitarse a propósito, y
 * en CI no hay ganchos por diseño: poner uno sería instalar, no reparar. Uno
 * absoluto es una decisión de alguien.
 *
 * Y sólo hacia un directorio que existe. Si husky corrió en un worktree y nunca
 * en el principal, el absoluto apuntaría a la nada y dejaría sin ganchos al
 * único árbol que los tenía — y el pre-commit de ese árbol, que repara, se los
 * quitaría a sí mismo.
 */
export function reparacion(e: EstadoComun, existe: (dir: string) => boolean): string | null {
  return e.tipo === 'relativo' && existe(e.destino) ? e.destino : null
}

export const PROBLEMAS = [
  'ausente',
  'no-ejecutable',
  'sin-lanzador',
  'sin-corredor',
  'sin-guion',
  'sin-medir',
] as const
export type Problema = (typeof PROBLEMAS)[number]

export const QUE_PASA: Record<Problema, string> = {
  ausente: 'git no encuentra el gancho y no ejecuta nada, sin decirlo',
  'no-ejecutable': 'git lo salta; como mucho deja un «hint» que nadie lee',
  'sin-lanzador':
    'no pasa por el lanzador de husky: git ejecuta el guion sin `sh -e`, y un paso que falla no para el commit',
  'sin-corredor': 'el lanzador de husky no encuentra `h` y el gancho falla en cada commit',
  'sin-guion': 'el corredor de husky no encuentra el guion en `.husky/` y sale 0 sin ejecutar nada',
  'sin-medir': 'git no contestó dónde busca los ganchos: no se puede afirmar que corran',
}

/** Un gancho, medido en el directorio donde git lo buscará. */
export interface MedidaGancho {
  nombre: string
  fichero: 'ausente' | 'no-ejecutable' | 'presente'
  /** ¿Es el lanzador de husky? Ver `esLanzadorDeHusky`. */
  lanzador: boolean
  /** `<dir>/h`, el corredor al que llama el lanzador. */
  corredor: boolean
  /** `<dir>/../<gancho>`, el guion que ejecuta el corredor — si falta, sale 0 callado. */
  guion: boolean
}

/**
 * El primer eslabón roto de la cadena git → lanzador → corredor → guion.
 *
 * Se mira la cadena entera, no que exista un fichero: dos de sus eslabones
 * fallan en silencio (git sin fichero, el corredor sin guion) y otro falla
 * ABIERTO (el guion sin lanzador).
 */
export function problemaDe(m: MedidaGancho): Problema | null {
  if (m.fichero !== 'presente') return m.fichero
  if (!m.lanzador) return 'sin-lanzador'
  if (!m.corredor) return 'sin-corredor'
  if (!m.guion) return 'sin-guion'
  return null
}

export interface MedidaWorktree {
  ruta: string
  /** Dónde buscará git sus ganchos, o `null` si git no contestó. */
  dir: string | null
  ganchos: MedidaGancho[]
}

export function problemasDe(
  w: MedidaWorktree,
): Array<{ gancho: string | null; problema: Problema }> {
  // Un worktree que no se dejó medir no está limpio: `?? []` aquí sería el
  // parte que se da el visto bueno a sí mismo.
  if (w.dir === null) return [{ gancho: null, problema: 'sin-medir' }]
  return w.ganchos.flatMap((g) => {
    const problema = problemaDe(g)
    return problema ? [{ gancho: g.nombre, problema }] : []
  })
}

/**
 * ¿Sale 1?
 *
 * Un valor relativo tiñe aunque hoy ningún worktree esté roto: los que crea la
 * app de escritorio fijan el suyo y lo tapan, y el siguiente creado de otro
 * modo nacería sin ganchos. Una máquina sin ganchos no tiñe: en CI no los hay a
 * propósito. Y desde un gancho no tiñe nunca: el pre-commit del checkout
 * principal lo corren también los agentes de launchd, y lo que falle en OTRO
 * worktree no puede parar sus commits de datos.
 */
export function tine(
  comun: EstadoComun,
  worktreesConProblemas: number,
  { desdeGancho }: { desdeGancho: boolean },
): boolean {
  if (desdeGancho) return false
  return comun.tipo === 'relativo' || comun.tipo === 'sin-poner' || worktreesConProblemas > 0
}
