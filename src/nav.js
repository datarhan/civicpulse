import { Ic } from './components/Icons'
import { PERIODISTAS_ENABLED, EFICIENCIA_ENABLED } from './flags'

// Single source of truth for site navigation. BOTH the labelled Sidebar
// (InnerShell routes) and the grouped section bar of the `/` landing
// (direction-d/BarraSecciones.jsx) render from this — so a route added here
// shows up in both and they can never drift.
//
// - `labelKey` is an i18n key; `label` is the fallback display string used by
//   breadcrumb matching when the key is not loaded (SSR/hydration).
// - `group` es el grupo de la barra de la portada bajo el que se abre la
//   sección (NAV_GROUPS), o `proyecto` para lo que trata de nosotros y no del
//   municipio. Sólo `/` no lleva: es la propia portada.
// - `descKey` es la frase de una línea que el desplegable pone bajo el rótulo:
//   para qué sirve la sección, dicho como lo diría quien la busca.
// - The glyph comes from SECTION_GLYPHS keyed by `to`
//   (src/components/SectionGlyph.jsx) — keep a unique glyph there for every
//   `to` listed here, including NAV_SECONDARY.
//
// tests/nav-grupos.test.js se pone en rojo con una ruta sin grupo o sin frase.
export const NAV = [
  {
    to: '/',
    id: 'inicio',
    labelKey: 'nav.inicio',
    label: 'Panel',
    icon: Ic.home,
  },
  {
    to: '/cambios',
    id: 'cambios',
    labelKey: 'nav.cambios',
    label: 'Novedades',
    icon: Ic.chart,
    group: 'vigilancia',
    descKey: 'nav.desc.cambios',
  },
  {
    to: '/cargos',
    id: 'cargos',
    labelKey: 'nav.cargos',
    label: 'Cargos',
    icon: Ic.people,
    group: 'gobierno',
    descKey: 'nav.desc.cargos',
  },
  {
    to: '/presupuesto',
    id: 'presup',
    labelKey: 'nav.presup',
    label: 'Presupuesto',
    icon: Ic.coin,
    group: 'dinero',
    descKey: 'nav.desc.presup',
  },
  // Coste unitario por servicio frente a municipios comparables. Va detrás de
  // /presupuesto porque es la otra mitad de la misma pregunta: qué se gasta, y
  // qué se obtiene. Oculto en producción salvo VITE_ENABLE_EFICIENCIA=true.
  ...(EFICIENCIA_ENABLED
    ? [
        {
          to: '/eficiencia',
          id: 'eficiencia',
          labelKey: 'nav.eficiencia',
          label: 'Eficiencia',
          icon: Ic.chart,
          group: 'dinero',
          descKey: 'nav.desc.eficiencia',
        },
        // La otra mitad del panel, separada por FUENTE: /eficiencia sale entera
        // del coste efectivo de los servicios y esto de las series PMP, de
        // CONPREL, del perfil de contratante y del estado de ejecución. Iba
        // dentro y era el 28 % de una página de trece pantallas. Comparte
        // bandera con /eficiencia a propósito: son la misma función y una
        // bandera propia sería una ruta que se despliega sin ejercitarse.
        {
          to: '/gestion',
          id: 'gestion',
          labelKey: 'nav.gestion',
          label: 'Gestión',
          icon: Ic.clock,
          group: 'dinero',
          descKey: 'nav.desc.gestion',
        },
      ]
    : []),
  {
    to: '/plenos',
    id: 'plenos',
    labelKey: 'nav.plenos',
    label: 'Plenos',
    icon: Ic.scale,
    group: 'gobierno',
    descKey: 'nav.desc.plenos',
  },
  {
    to: '/promesas',
    id: 'promesas',
    labelKey: 'nav.promesas',
    label: 'Promesas',
    icon: Ic.scale,
    group: 'gobierno',
    descKey: 'nav.desc.promesas',
  },
  {
    to: '/departamentos',
    id: 'depts',
    labelKey: 'nav.departamentos',
    label: 'Departamentos',
    icon: Ic.building,
    group: 'gobierno',
    descKey: 'nav.desc.departamentos',
  },
  {
    to: '/hallazgos',
    id: 'findings',
    labelKey: 'nav.hallazgos',
    label: 'Hallazgos',
    icon: Ic.warn,
    group: 'vigilancia',
    descKey: 'nav.desc.hallazgos',
  },
  {
    to: '/reportajes',
    id: 'reportajes',
    labelKey: 'nav.reportajes',
    label: 'Reportajes',
    icon: Ic.list ?? Ic.warn,
    group: 'vigilancia',
    descKey: 'nav.desc.reportajes',
  },
  {
    to: '/declaraciones',
    id: 'declaraciones',
    labelKey: 'nav.declaraciones',
    label: 'Declaraciones',
    icon: Ic.list ?? Ic.warn,
    group: 'vigilancia',
    descKey: 'nav.desc.declaraciones',
  },
  // Con el laboratorio y no con la ciudadanía: es la materia prima —todo lo
  // que alimenta el sitio, descargable— y la página se dirige a quien investiga.
  {
    to: '/datos',
    id: 'datos',
    labelKey: 'nav.datos',
    label: 'Datos',
    icon: Ic.chart,
    group: 'laboratorio',
    descKey: 'nav.desc.datos',
  },
  {
    to: '/quejas',
    id: 'quejas',
    labelKey: 'nav.quejas',
    label: 'Quejas',
    icon: Ic.warn,
    group: 'ciudadania',
    descKey: 'nav.desc.quejas',
  },
  {
    to: '/empleo',
    id: 'empleo',
    labelKey: 'nav.empleo',
    label: 'Empleo',
    icon: Ic.building,
    group: 'ciudadania',
    descKey: 'nav.desc.empleo',
  },
  {
    to: '/empleo-publico',
    id: 'empleo-publico',
    labelKey: 'nav.empleoPublico',
    label: 'Empleo público',
    icon: Ic.building,
    group: 'ciudadania',
    descKey: 'nav.desc.empleoPublico',
  },
  {
    to: '/laboratorio',
    id: 'laboratorio',
    labelKey: 'nav.laboratorio',
    label: 'Laboratorio',
    icon: Ic.lab,
    group: 'laboratorio',
    descKey: 'nav.desc.laboratorio',
  },
  // La frontera NO va tras bandera. Es el experimento más sujeto a
  // malinterpretación de todo el sitio y por eso la página entera está
  // construida para decir lo que no es; esconderla tras un flag daría el
  // resultado contrario al de /eficiencia, donde la bandera protegía una cifra
  // sobre un ayuntamiento con nombre. Aquí no se nombra a nadie salvo a
  // Riba-roja, y el aviso es la primera tarjeta.
  {
    to: '/laboratorio/frontera',
    id: 'frontera',
    labelKey: 'nav.frontera',
    label: 'Frontera',
    icon: Ic.lab,
    group: 'laboratorio',
    descKey: 'nav.desc.frontera',
  },
  // Mismo criterio que la frontera: veredicto de modelo, sin bandera, con la
  // página entera construida para decir lo que no es. No nombra a nadie salvo
  // a Riba-roja y el aviso va antes que ninguna cifra.
  {
    to: '/laboratorio/coste-esperado',
    id: 'coste-esperado',
    labelKey: 'nav.costeEsperado',
    label: 'Coste esperado',
    icon: Ic.lab,
    group: 'laboratorio',
    descKey: 'nav.desc.costeEsperado',
  },
  // Sin bandera, por el mismo criterio: mide una limitación NUESTRA y la página
  // entera está construida para decir lo que no es. No nombra a nadie —son
  // recuentos, sin una sola cita— y no hay cifra que proteger.
  {
    to: '/laboratorio/cobertura',
    id: 'cobertura',
    labelKey: 'nav.cobertura',
    label: 'Cobertura',
    icon: Ic.lab,
    group: 'laboratorio',
    descKey: 'nav.desc.cobertura',
  },
  // "Periodistas" (the AI journalist agent) is the highest legal-sensitivity
  // surface — it drafts biographies of named living officials. Hidden from
  // production builds unless VITE_ENABLE_PERIODISTAS=true — same flag that
  // registers the routes (src/flags.js).
  ...(PERIODISTAS_ENABLED
    ? [
        {
          to: '/laboratorio/agentes',
          id: 'agentes',
          labelKey: 'nav.agentes',
          label: 'Periodistas',
          icon: Ic.lab,
          group: 'laboratorio',
          descKey: 'nav.desc.agentes',
        },
      ]
    : []),
  // /curator is dev-only — surfaces in the sidebar only when running
  // `npm run dev` on a curator's laptop. Production builds tree-shake this
  // entry out via the import.meta.env.MODE check.
  ...(import.meta.env.MODE !== 'production'
    ? [
        {
          to: '/curator',
          id: 'curator',
          labelKey: 'nav.curator',
          label: 'Curator (dev)',
          icon: Ic.settings ?? Ic.warn,
          group: 'laboratorio',
          descKey: 'nav.desc.curator',
        },
        {
          to: '/despiece',
          id: 'despiece',
          labelKey: 'nav.despiece',
          label: 'Despiece (dev)',
          icon: Ic.lab ?? Ic.settings,
          group: 'laboratorio',
          descKey: 'nav.desc.despiece',
        },
      ]
    : []),
  {
    to: '/nosotros',
    id: 'nosotros',
    labelKey: 'nav.nosotros',
    label: 'Quiénes somos',
    icon: Ic.people,
    group: 'proyecto',
  },
]

// Editorial / legal contract links. Rendered in the Sidebar footer and, on the
// landing, at the foot of the section bar's index under «Sobre CivicPulse».
// Same shared-list discipline as NAV.
export const NAV_SECONDARY = [
  {
    to: '/metodologia',
    label: 'Metodología',
    labelKey: 'sidebar.footer.method',
    group: 'proyecto',
  },
  { to: '/aviso-legal', label: 'Aviso legal', labelKey: 'sidebar.footer.legal', group: 'proyecto' },
]

/**
 * Los cinco grupos de la barra de secciones de la portada, en el orden en que
 * se leen (lámina 1b de «Portada · Revisión»). Sustituyen a un carril de
 * glifos cuyo rótulo sólo existía en un `title`: cinco nombres que se leen, y
 * cada uno se abre con una frase que dice para qué sirve lo que hay dentro.
 *
 * Dentro de cada grupo las secciones van en el orden de NAV y no en uno
 * propio: un segundo orden escrito a mano sería otra lista capaz de discrepar
 * de la barra lateral sin que nada avisara.
 */
export const NAV_GROUPS = [
  { id: 'gobierno', labelKey: 'nav.grupo.gobierno', ledeKey: 'nav.grupo.gobierno.lede' },
  { id: 'dinero', labelKey: 'nav.grupo.dinero', ledeKey: 'nav.grupo.dinero.lede' },
  { id: 'vigilancia', labelKey: 'nav.grupo.vigilancia', ledeKey: 'nav.grupo.vigilancia.lede' },
  { id: 'ciudadania', labelKey: 'nav.grupo.ciudadania', ledeKey: 'nav.grupo.ciudadania.lede' },
  { id: 'laboratorio', labelKey: 'nav.grupo.laboratorio', ledeKey: 'nav.grupo.laboratorio.lede' },
]

/**
 * Lo que no trata del municipio sino de nosotros: quién firma, con qué reglas
 * y bajo qué aviso legal. No abre desplegable propio; va al pie del índice,
 * que es donde el carril lo llevaba, bajo su separador.
 */
export const GRUPO_PROYECTO = { id: 'proyecto', labelKey: 'nav.grupo.proyecto' }

/** Las entradas de un grupo, en el orden de NAV. */
export function entradasDeGrupo(grupo, entradas = [...NAV, ...NAV_SECONDARY]) {
  return entradas.filter((n) => n.group === grupo)
}

/**
 * Qué entrada de navegación describe una ruta. Es lo que rotula la miga de pan.
 *
 * `NAV.find((n) => pathname.startsWith(n.to))` parece lo obvio y estuvo mal
 * durante toda la vida de la barra: la primera entrada es `/`, y **toda** ruta
 * empieza por `/`, así que la miga decía «Panel» en cada página del sitio. Un
 * fallo silencioso de manual —el rótulo existía, era legible y era falso—, y
 * ninguna suite lo cazaba porque ninguna leía la miga.
 *
 * Dos correcciones, y las dos hacen falta:
 *
 * 1. **Frontera de segmento.** `/cargos` no puede rotular `/cargos-de-otro`.
 * 2. **La coincidencia más específica gana.** Sin esto `/laboratorio/frontera`
 *    diría «Laboratorio», que es cierto y no es lo que el lector necesita.
 */
export function entradaNavActiva(pathname, entradas = [...NAV, ...NAV_SECONDARY]) {
  return (
    entradas
      .filter((n) =>
        n.to === '/' ? pathname === '/' : pathname === n.to || pathname.startsWith(`${n.to}/`),
      )
      .sort((a, b) => b.to.length - a.to.length)[0] ?? null
  )
}
