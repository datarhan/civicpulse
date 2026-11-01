import { PROCESO_TIPOS } from '../scraper/procesos-selectivos'

/**
 * Las palabras que /empleo-publico define antes de su lista: las de los
 * títulos de los procesos. Son entradas del glosario (`src/glosario.js`), así
 * que la definición de la página y la de Cmd+K son la misma.
 */
export const TERMINOS_DE_ACCESO = ['oposicion', 'concurso', 'bolsaDeTrabajo', 'estabilizacion']

/**
 * Los procesos agrupados por tipo, en el orden de `PROCESO_TIPOS`; dentro de
 * cada grupo, el de la página del Ayuntamiento. Un tipo que el clasificador no
 * conoce va a `otro` en vez de perderse, y un grupo vacío no sale.
 * @param {{ tipo: string }[]} procesos
 * @returns {{ tipo: string, procesos: any[] }[]}
 */
export function agruparProcesos(procesos) {
  const porTipo = new Map(PROCESO_TIPOS.map((tipo) => [tipo, []]))
  for (const p of procesos || []) {
    porTipo.get(porTipo.has(p.tipo) ? p.tipo : 'otro').push(p)
  }
  return PROCESO_TIPOS.filter((tipo) => porTipo.get(tipo).length > 0).map((tipo) => ({
    tipo,
    procesos: porTipo.get(tipo),
  }))
}
