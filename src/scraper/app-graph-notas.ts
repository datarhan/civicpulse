/**
 * Lo que el código no puede decir de sí mismo: para qué sirve cada pieza y
 * cómo falla.
 *
 * ## Por qué a mano, y por qué tan pocas
 *
 * El despiece deriva las RELACIONES, y la mayor parte del «qué es» se cosecha
 * de las cabeceras: 215 de 217 guiones y 189 de 194 parsers abren con un bloque
 * de documentación, mediana de 19 líneas. Lo que no tiene fichero del que
 * cosechar —una ruta, un cron, una fuente de arriba, el bot— es lo único que
 * hay que escribir aquí.
 *
 * ## La declaración se comprueba, no se cree
 *
 * Cada nota sobre un fichero lleva el hash de ese fichero. `check:despiece`
 * reporta CUATRO desenlaces, no dos: `coincide`, `movido` (el código cambió
 * debajo de la nota — avisa), `huerfana` (la nota nombra algo que ya no existe
 * — rompe) y `sin-nota` (se cuenta, no falla). Una nota escrita a mano dentro
 * de un control contra el desfase se queda vieja ella sola si nadie la mira, y
 * ése es el chiste que este repositorio ya ha contado dos veces.
 */

export interface Nota {
  /** El id del nodo que describe. */
  nodo: string
  /** Para qué sirve, en una línea. */
  queEs: string
  /** Cómo falla. Vacío no es «no falla»: es «no lo hemos escrito». */
  fallaCuando?: readonly string[]
  /**
   * `sha256Short` del fichero descrito cuando se escribió la nota. Ausente
   * cuando el nodo NO es un fichero (una ruta, un cron, una fuente): ahí no hay
   * código que se pueda mover debajo.
   */
  hashDelCodigo?: string
}

export type Desenlace = 'coincide' | 'movido' | 'huerfana'

export interface ResultadoNota {
  nodo: string
  desenlace: Desenlace
  /** Sólo `huerfana` rompe. Un aviso que puede tumbar el build se acaba apagando. */
  rompe: boolean
  detalle: string
}

/**
 * Coteja las notas contra el grafo.
 *
 * `hashDe` se inyecta para que esto siga siendo puro: quien lee el disco es el
 * CLI, y así los cuatro desenlaces se pueden probar sin tocar un fichero.
 */
export function verificarNotas(
  notas: readonly Nota[],
  grafo: { nodos: { id: string; ruta?: string }[] },
  hashDe: (ruta: string) => string | null,
): ResultadoNota[] {
  const porId = new Map(grafo.nodos.map((n) => [n.id, n]))
  return notas.map((nota) => {
    const nodo = porId.get(nota.nodo)
    if (!nodo) {
      return {
        nodo: nota.nodo,
        desenlace: 'huerfana' as const,
        rompe: true,
        detalle: 'la nota describe una pieza que ya no está en el grafo',
      }
    }
    if (!nota.hashDelCodigo || !nodo.ruta) {
      return {
        nodo: nota.nodo,
        desenlace: 'coincide' as const,
        rompe: false,
        detalle: 'sin fichero que anclar: sólo puede existir o no',
      }
    }
    const actual = hashDe(nodo.ruta)
    if (actual === nota.hashDelCodigo) {
      return { nodo: nota.nodo, desenlace: 'coincide' as const, rompe: false, detalle: '' }
    }
    return {
      nodo: nota.nodo,
      desenlace: 'movido' as const,
      rompe: false,
      detalle: `el código cambió bajo la nota (${nota.hashDelCodigo} → ${actual ?? 'ilegible'})`,
    }
  })
}

/**
 * Las notas. Sobre lo que NO tiene cabecera de la que cosechar.
 *
 * `npm run despiece -- --sellar` reescribe los hashes tras revisar una nota.
 */
export const NOTAS: readonly Nota[] = [
  {
    nodo: 'fuente:Telegram',
    queEs:
      'Un vecino escribiendo al bot. Es la única entrada de datos personales del sistema entero.',
    fallaCuando: [
      'las fotos pasan por visión y mosaico y FALLAN CERRADO: si la llamada no corre, la foto se retiene, no se publica',
      'las quejas se agregan a nivel de barrio antes de tocar public/data',
      '/olvidar es el punto donde se ejerce el derecho al olvido',
    ],
  },
  {
    nodo: 'proceso:bot',
    queEs: 'El bot de Telegram, desplegado en Fly.io en modo webhook con su SQLite en un volumen.',
    fallaCuando: [
      'no forma parte de la compilación del sitio: la web renderiza perfectamente sin él',
      'qué comando escribe en qué tabla NO se deriva, así que este mapa no lo dibuja',
    ],
  },
  {
    nodo: 'proceso:pull-quejas.yml',
    queEs:
      'Trae /export/quejas.json del bot a public/data todos los días, media hora antes de la nocturna.',
    fallaCuando: [
      'es el único productor de quejas.json: ningún guion de este repositorio lo escribe',
    ],
  },
  {
    nodo: 'proceso:scrape-all.sh',
    queEs: 'La nocturna. Ejecuta cada adaptador aislado, no en cadena con &&.',
    fallaCuando: [
      'tiene un tramo BEST_EFFORT que no debe poner la nocturna en rojo',
      'el ORDEN de sus pasos y sus condicionales son bash y este mapa no los deriva',
    ],
  },
  {
    nodo: 'proceso:review-sweep.sh',
    queEs:
      'El barrido lector nocturno: lee cada ruta pública como la leería un visitante y señala lo que el dato no sostiene.',
    fallaCuando: [
      'acierta aproximadamente la mitad de las veces: comprueba cada señalamiento contra el dato antes de tocar prosa firmada',
      'su registro está en scripts/logs/review-sweep.log — léelo antes de dar por nuevo un hallazgo',
    ],
  },
]
