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

/**
 * Un hallazgo publicado y uno retirado, para `/hallazgos/:id`. Los tres estados
 * de esa página —ficha, huella de la retirada y «no existe»— pasan por las
 * puertas estrictas, no sólo el que tiene datos.
 */
const HALLAZGOS = JSON.parse(readFileSync('public/data/pleno-findings.json', 'utf8'))
export const PRIMER_HALLAZGO: { id: string; title: string } = HALLAZGOS.items?.[0]
export const PRIMERA_RETIRADA: string | undefined = HALLAZGOS.retractions?.[0]?.findingId

/** Una oferta real, para `/empleo/:id`. */
export const FIRST_OFERTA_ID = JSON.parse(readFileSync('public/data/empleo.json', 'utf8'))
  .items?.[0]?.id

export const STRICT_ROUTES = [
  '/',
  '/cargos',
  '/cargos/robert-raga-gadea',
  // Quien entró por corrección curada (sin retrato ni correo en la fuente) y
  // quien dejó la corporación (sección aparte, sin bloques en presente): las
  // dos formas del padrón corregido tienen que renderizar sin errores.
  '/cargos/pedro-tortajada-raga',
  '/cargos/soraya-trejo-delgado',
  '/presupuesto',
  '/plenos',
  `/plenos/${FIRST_PLENO_ID}`,
  '/promesas',
  '/departamentos',
  '/departamentos/urbanismo',
  '/hallazgos',
  `/hallazgos/${PRIMER_HALLAZGO.id}`,
  ...(PRIMERA_RETIRADA ? [`/hallazgos/${PRIMERA_RETIRADA}`] : []),
  '/hallazgos/h-no-existe',
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
  '/laboratorio/cobertura',
  '/nosotros',
  '/about',
  '/reportajes',
  '/reportajes/reconstruccion-dana',
  '/reportajes/coste-efectivo',
  '/reportajes/inteligencia-turistica',
  '/reportajes/basuras',
  '/reportajes/conteo-visitantes',
  '/blog/building-civicpulse-with-ai',
  '/laboratorio/agentes/a-robert-raga-bio',
  '/lab-health',
  '/metodologia',
  '/aviso-legal',
]
