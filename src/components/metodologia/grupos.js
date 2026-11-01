/**
 * Los grupos de /metodologia: qué viene a comprobar quien lee (auditoría de las
 * dos lecturas, §28).
 *
 * Es la única lista. El índice se pinta de aquí y las cabeceras de la página
 * usan estos ids; `tests/metodologia-indice.test.jsx` la compara con lo que la
 * página pinta, en el orden en que lo pinta, así que un apartado nuevo sin grupo
 * o fuera de su sitio pone la suite en rojo. Los rótulos y las frases viven en el
 * catálogo (`metodologia.grupo.*`, `metodologia.seccion.*`, `metodologia.frase.*`).
 */
export const GRUPOS_METODOLOGIA = [
  { id: 'reglas', secciones: ['principios', 'politica-automatizacion'] },
  { id: 'datos', secciones: ['fuentes-auditadas', 'gasto-por-concejalia', 'mapa-del-gasto'] },
  {
    id: 'cargos',
    secciones: ['corporacion', 'mudanza-portal', 'a-quien-se-pregunta', 'encaje', 'biografias'],
  },
  {
    id: 'plenos',
    secciones: [
      'verificacion-declaraciones',
      'trinquete-veredictos',
      'citas-transcripcion',
      'citas-contraste',
      'plazos-vencidos',
    ],
  },
  { id: 'promesas', secciones: ['estados', 'limites-motor', 'auto-curacion-promesas'] },
  { id: 'quejas', secciones: ['camino-de-una-queja', 'relacion-quejas-contratos'] },
  {
    id: 'eficiencia',
    secciones: ['eficiencia', 'opinion-editor', 'frontera', 'coste-esperado', 'laboratorio-prensa'],
  },
  { id: 'correcciones', secciones: ['rectificacion', 'politica-correcciones'] },
]

/** El ancla de un grupo. Con prefijo: `eficiencia` ya es el id de un apartado. */
export const anclaDeGrupo = (/** @type {string} */ id) => `grupo-${id}`

/** Donde vuelve el «Índice ↑» de cada grupo en pantallas sin índice lateral. */
export const ANCLA_INDICE = 'indice-metodologia'

/**
 * El grupo que se está leyendo: el último cuya cabecera ya quedó por encima de
 * `y`. Antes de la primera cabecera se lee la primera, que es la que sigue.
 *
 * @param {{ id: string, top: number }[]} cabeceras en orden de página
 * @param {number} y
 * @returns {string | null}
 */
export function grupoEnPosicion(cabeceras, y) {
  let actual = cabeceras[0]?.id ?? null
  for (const c of cabeceras) if (c.top <= y) actual = c.id
  return actual
}
