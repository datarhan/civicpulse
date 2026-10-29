import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { fichaDe, leerDeDisco } from '../../scripts/lib/fichas-representativas'

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

/**
 * Una queja con contratos relacionados —con foto, si alguna la tiene— para
 * `/quejas/:id`. Sólo pasaba `/quejas/q-no-existe`, la tarjeta de «no aparece»,
 * así que las tarjetas de contrato y el pie de la foto nunca se leían: el
 * «aviso legal» de ese pie, distinguible sólo por el color, pasó sin aviso.
 */
const CON_CONTRATOS = new Set(
  JSON.parse(readFileSync('public/data/queja-contract-relations.json', 'utf8')).links?.map(
    (l: { quejaId: string }) => l.quejaId,
  ),
)
const QUEJAS_CON_CONTRATOS = (
  JSON.parse(readFileSync('public/data/quejas.json', 'utf8')).items ?? []
).filter((q: { service_request_id: string }) => CON_CONTRATOS.has(q.service_request_id))
export const QUEJA_CON_CONTRATOS: string | undefined = (
  QUEJAS_CON_CONTRATOS.find((q: { photo: unknown }) => q.photo) ?? QUEJAS_CON_CONTRATOS[0]
)?.service_request_id

/**
 * Una biografía publicada, para `/laboratorio/agentes/:assignmentId`: la misma
 * que lee la revisión lectora, elegida de los datos por
 * `fichas-representativas.ts` —la que más plantilla pinta, réplica y registro de
 * correcciones primero—.
 *
 * Aquí estaba escrita a mano `/laboratorio/agentes/a-robert-raga-bio`, una
 * asignación ARCHIVADA (la publicada es su v5). La página decía «No hay informe
 * publicado para esta asignación todavía», y axe y el contraste medido la daban
 * por buena: ninguna puerta estricta había leído nunca una biografía publicada,
 * que nombra a un concejal vivo y es legalmente material. La primera pasada
 * sobre una de verdad encontró un enlace que sólo se distinguía por el color y
 * dos `<main>` anidados.
 */
export const BIOGRAFIA = fichaDe(
  '/laboratorio/agentes/:assignmentId',
  leerDeDisco('public/data'),
).clave

/**
 * Las dos rutas que piden A PROPÓSITO un id que no existe: su tarjeta de «no
 * aparece» es una página publicada y pasa por las puertas como cualquier otra.
 */
const NO_EXISTEN_A_PROPOSITO = new Set(['/hallazgos/h-no-existe', '/quejas/q-no-existe'])

/**
 * Que la ruta pintó lo que promete y no su «no existe».
 *
 * Las plantillas de detalle marcan con `data-no-resuelta` el id que no
 * encuentran, que es como lo reconoce `review-surfaces.ts`. Sin esta
 * comprobación, una ruta cuyo id deja de existir —un hallazgo que se retira,
 * una oferta que vence, una asignación que se archiva— sigue en verde midiendo
 * una tarjeta de tres líneas: «verde por no ejecutarse», como la biografía de
 * arriba hasta el 29-10-2026. Y al revés: si una de las dos rutas de «no
 * existe» empezara a resolver, ya no mediría su tarjeta.
 *
 * Se llama DESPUÉS de medir: «no resuelta» es un estado final, así que lo que
 * se ve aquí es lo que había —o lo que iba a haber— cuando se midió.
 */
export async function exigeQueResuelva(page: Page, ruta: string) {
  const aProposito = NO_EXISTEN_A_PROPOSITO.has(ruta)
  await expect(
    page.locator('[data-no-resuelta]'),
    aProposito
      ? `${ruta} pide un id que no existe y ya no pinta su «no aparece»`
      : `${ruta} no resuelve su id: la puerta habría medido una página vacía`,
  ).toHaveCount(aProposito ? 1 : 0)
}

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
  ...(QUEJA_CON_CONTRATOS ? [`/quejas/${QUEJA_CON_CONTRATOS}`] : []),
  '/quejas/q-no-existe',
  '/cambios',
  '/eficiencia',
  '/gestion',
  '/laboratorio',
  '/laboratorio/prensa',
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
  '/reportajes/matriculas-y-moviles',
  '/blog/building-civicpulse-with-ai',
  BIOGRAFIA,
  '/lab-health',
  '/metodologia',
  '/aviso-legal',
]
