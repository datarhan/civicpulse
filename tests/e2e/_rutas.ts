import { readFileSync } from 'node:fs'

/**
 * Las rutas públicas que la suite vigila, en un solo sitio.
 *
 * Vivían dentro de `a11y.spec.ts` como una const local. En cuanto una segunda
 * puerta necesitó la misma lista —la de contraste medido— copiarla habría
 * repetido la lección del RefList: añadir una ruta en un fichero y dejar a la
 * otra puerta mirando a un sitio menos, sin que nada avise.
 *
 * Los dos ids salen de snapshots comprometidos en git, no inventados: si el
 * fichero cambia, la ruta sigue existiendo.
 */

/** Un pleno real con claims, para `/plenos/:id`. */
export const FIRST_PLENO_ID = JSON.parse(
  readFileSync('public/data/pleno-claims/index.json', 'utf8'),
).plenos?.[0]?.plenoId

/** Una oferta real, para `/empleo/:id`. */
export const FIRST_OFERTA_ID = JSON.parse(readFileSync('public/data/empleo.json', 'utf8'))
  .items?.[0]?.id

export const STRICT_ROUTES = [
  '/',
  '/cargos',
  '/cargos/robert-raga-gadea',
  '/presupuesto',
  '/plenos',
  `/plenos/${FIRST_PLENO_ID}`,
  '/promesas',
  '/departamentos',
  '/departamentos/urbanismo',
  '/hallazgos',
  '/declaraciones',
  '/datos',
  '/empleo',
  '/empleo-publico',
  `/empleo/${FIRST_OFERTA_ID}`,
  '/quejas',
  '/quejas/dashboard',
  '/quejas/q-no-existe',
  '/cambios',
  '/eficiencia',
  '/gestion',
  '/laboratorio',
  '/laboratorio/agentes',
  '/laboratorio/frontera',
  '/laboratorio/coste-esperado',
  '/nosotros',
  '/about',
  '/reportajes',
  '/reportajes/reconstruccion-dana',
  '/reportajes/coste-efectivo',
  '/reportajes/inteligencia-turistica',
  '/reportajes/basuras',
  '/blog/building-civicpulse-with-ai',
  '/laboratorio/agentes/a-robert-raga-bio',
  '/lab-health',
  '/metodologia',
  '/aviso-legal',
]
