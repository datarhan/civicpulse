/**
 * ¿Se ha vuelto ESPARCIDO este repositorio sin que nadie lo pidiera?
 *
 * Este proyecto no usa `sparse-checkout` en ningún sitio: se clona entero. Así
 * que cualquier patrón esparcido aquí viene de fuera, y no es cosmético — un
 * `git sparse-checkout set` PODA el árbol de trabajo. Ficheros rastreados que
 * estaban en disco dejan de estarlo, marcados `skip-worktree`, y `git status`
 * no dice nada porque para git no falta nada.
 *
 * No es hipotético. Entre el 18 y el 23 de agosto de 2026 pasó cuatro veces en
 * los worktrees de este repositorio, con el patrón `providers/claude/plugin`.
 * Una de ellas se llevó `docs/` ENTERO del disco, y se descubrió por casualidad
 * al fallar un `git add`. Reproducido en un repo de usar y tirar:
 *
 *     git sparse-checkout set providers/claude/plugin
 *     → docs/b.txt pasa a `S` y desaparece del disco; root.txt se queda
 *
 * El origen medido: `providers/claude/plugin` es el `path` de la fuente
 * `git-subdir` del plugin `stripe@claude-plugins-official`, el ÚNICO plugin
 * instalado que usa esa clase de fuente. Cuando su actualizador refresca, el
 * sparse-checkout acaba aplicándose al repositorio del directorio de trabajo en
 * vez de al del plugin. Los relojes cuadran al minuto: `installed_plugins.json`
 * y el fichero de patrones se escribieron ambos a las 21:39 del 23-08-2026.
 *
 * Esto no lo puede arreglar este repositorio —el que escribe es ajeno—, pero sí
 * puede negarse a trabajar podado y decir cuánto le falta. Que es la diferencia
 * entre perder `docs/` y enterarse, y perderlo y no.
 *
 * El 23-08-2026 se quitó el disparador: `stripe` estaba instalado pero
 * DESACTIVADO —de 38 plugins sólo tres lo están— y aun así su actualizador
 * corría y podaba. Desinstalado, ningún plugin instalado usa ya una fuente
 * `git-subdir`. Esta guarda se queda igualmente: quitar el disparador de hoy no
 * es lo mismo que arreglar el fallo, y el siguiente plugin con esa clase de
 * fuente lo devolvería sin avisar.
 */

export interface EstadoWorktree {
  /** Ruta del worktree, para el parte. */
  ruta: string
  /** `core.sparseCheckout` — si está activo, ahora mismo hay fichero podado. */
  activo: boolean
  patrones: string[]
  /** Ficheros rastreados marcados `skip-worktree`: el daño, en unidades. */
  ocultos: number
}

/**
 * Tres desenlaces, no dos.
 *
 * `restos` existe porque apagar el sparse-checkout NO borra el fichero de
 * patrones: queda ahí, listo para volver a aplicarse, y es la huella que
 * identifica al culpable. Callarlo dejaría «ya lo apagué» indistinguible de
 * «aquí nunca pasó nada», y este defecto ha vuelto cuatro veces.
 */
export type Desenlace = 'limpio' | 'restos' | 'podando'

export function clasificar(e: EstadoWorktree): Desenlace {
  if (e.activo) return 'podando'
  return e.patrones.length > 0 ? 'restos' : 'limpio'
}

/**
 * Sólo `podando` tiñe.
 *
 * Un resto no oculta ni un fichero, y una guarda que se pone roja por algo que
 * no hace daño es una guarda que se acaba saltando — el mismo razonamiento por
 * el que `check:drift` dejó de gritar por una comparación que no era de
 * iguales. Se informa de los restos; se falla por la poda.
 */
export function tine(estados: EstadoWorktree[]): boolean {
  return estados.some((e) => clasificar(e) === 'podando')
}

/** Cuenta de `git ls-files -v`: la marca `S` es `skip-worktree`. */
export function contarOcultos(salida: string): number {
  return salida.split('\n').filter((l) => l.startsWith('S ')).length
}

// Los patrones que git escribe, sin el andamiaje del modo cono.
//
// `sparse-checkout set X` envuelve la línea que importa en seis de andamiaje
// (las de barra-asterisco y sus negaciones). Para el parte sólo sirve la que
// nombra algo: es la que permite reconocer de dónde vino el patrón.
//
// Va en comentarios de línea a propósito — el andamiaje contiene la secuencia
// que cierra un bloque, así que escribirlo aquí dentro terminaría el comentario
// a media frase.
export function patronesUtiles(fichero: string): string[] {
  return fichero
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('!') && l !== '/*')
}

/**
 * La raíz de un worktree, sacada de su fichero `gitdir`.
 *
 * `.git/worktrees/<nombre>/gitdir` guarda la ruta ABSOLUTA del fichero `.git`
 * del worktree —`/…/worktrees/description-reframe/.git`—, así que su directorio
 * es la raíz. Es el mapeo fiable y no obliga a parsear la salida de
 * `git worktree list`, que además cambia de forma entre versiones.
 *
 * Devuelve null si el contenido no tiene esa pinta: un worktree que no se sabe
 * dónde está no se toca, y desde luego no se le corre un `git -C` a ciegas.
 */
export function raizDesdeGitdir(contenido: string): string | null {
  const linea = contenido.trim()
  if (!linea.endsWith('/.git')) return null
  const raiz = linea.slice(0, -'/.git'.length)
  return raiz.length > 0 ? raiz : null
}

/**
 * EL ORDEN DE LA REPARACIÓN, y por qué no es un detalle de estilo.
 *
 * Apagar primero, borrar el patrón después. Al revés destroza más de lo que
 * arregla, y está MEDIDO en un repo de usar y tirar: con
 * `core.sparseCheckout = true` y el fichero de patrones borrado, un
 * `sparse-checkout reapply` dejó el árbol en UN solo fichero —se llevó por
 * delante hasta el directorio que el patrón salvaba—, porque en modo cono «sin
 * patrones» no significa «sin filtro» sino «no encaja nada».
 *
 * Se expone como constante para que la prueba pueda afirmar sobre el orden en
 * vez de sobre un comentario.
 */
export const ORDEN_REPARACION = ['disable', 'borrar-patron'] as const

/**
 * ¿Dice el `config.worktree` de un worktree que el esparcido está ENCENDIDO?
 *
 * Se lee el fichero en vez de preguntarle a git con `-C` porque el barrido sólo
 * necesita mirar, y mirar un fichero no toca el árbol de nadie.
 *
 * Existe por un error concreto: informé de que dos worktrees conservaban «un
 * patrón apagado, inerte», y los dos tenían `sparseCheckout = true`. Estaban
 * CEBADOS —bandera puesta y patrón cargado—, salvados sólo por que ninguna
 * operación de git había reaplicado el esparcido todavía. Llamar «resto» a eso
 * es quitarle importancia a un daño que está a un `git` de distancia.
 */
export function esparcidoActivoEnConfig(texto: string): boolean {
  return /^\s*sparseCheckout\s*=\s*true\s*$/im.test(texto)
}
