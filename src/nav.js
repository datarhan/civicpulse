import { Ic } from './components/Icons'
import { PERIODISTAS_ENABLED, EFICIENCIA_ENABLED } from './flags'

// Single source of truth for site navigation. BOTH the labelled Sidebar
// (InnerShell routes) and the icon-only LeftRail (the `/` landing) render from
// this — so a route added here shows up in both and they can never drift.
//
// - `labelKey` is an i18n key; `label` is the fallback display string used by
//   breadcrumb matching when the key is not loaded (SSR/hydration).
// - `railLabel` (optional) overrides the hover title in the icon rail, where a
//   section may carry its own landing-page branding (e.g. `/` = "Mirador").
// - The glyph shown in the rail comes from SECTION_GLYPHS keyed by `to`
//   (src/components/SectionGlyph.jsx) — keep a unique glyph there for every
//   `to` listed here, including NAV_SECONDARY.
export const NAV = [
  {
    to: '/',
    id: 'inicio',
    labelKey: 'nav.inicio',
    label: 'Panel',
    railLabel: 'Mirador',
    icon: Ic.home,
  },
  {
    to: '/cambios',
    id: 'cambios',
    labelKey: 'nav.cambios',
    label: 'Novedades',
    icon: Ic.chart,
  },
  {
    to: '/cargos',
    id: 'cargos',
    labelKey: 'nav.cargos',
    label: 'Cargos',
    icon: Ic.people,
  },
  {
    to: '/presupuesto',
    id: 'presup',
    labelKey: 'nav.presup',
    label: 'Presupuesto',
    icon: Ic.coin,
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
        },
      ]
    : []),
  {
    to: '/plenos',
    id: 'plenos',
    labelKey: 'nav.plenos',
    label: 'Plenos',
    icon: Ic.scale,
  },
  {
    to: '/promesas',
    id: 'promesas',
    labelKey: 'nav.promesas',
    label: 'Promesas',
    icon: Ic.scale,
  },
  {
    to: '/departamentos',
    id: 'depts',
    labelKey: 'nav.departamentos',
    label: 'Departamentos',
    icon: Ic.building,
  },
  {
    to: '/hallazgos',
    id: 'findings',
    labelKey: 'nav.hallazgos',
    label: 'Hallazgos',
    icon: Ic.warn,
  },
  {
    to: '/reportajes',
    id: 'reportajes',
    labelKey: 'nav.reportajes',
    label: 'Reportajes',
    icon: Ic.list ?? Ic.warn,
  },
  {
    to: '/declaraciones',
    id: 'declaraciones',
    labelKey: 'nav.declaraciones',
    label: 'Declaraciones',
    icon: Ic.list ?? Ic.warn,
  },
  {
    to: '/datos',
    id: 'datos',
    labelKey: 'nav.datos',
    label: 'Datos',
    icon: Ic.chart,
  },
  {
    to: '/quejas',
    id: 'quejas',
    labelKey: 'nav.quejas',
    label: 'Quejas',
    icon: Ic.warn,
  },
  {
    to: '/empleo',
    id: 'empleo',
    labelKey: 'nav.empleo',
    label: 'Empleo',
    icon: Ic.building,
  },
  {
    to: '/empleo-publico',
    id: 'empleo-publico',
    labelKey: 'nav.empleoPublico',
    label: 'Empleo público',
    icon: Ic.building,
  },
  {
    to: '/laboratorio',
    id: 'laboratorio',
    labelKey: 'nav.laboratorio',
    label: 'Laboratorio',
    icon: Ic.lab,
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
        },
      ]
    : []),
  {
    to: '/nosotros',
    id: 'nosotros',
    labelKey: 'nav.nosotros',
    label: 'Quiénes somos',
    icon: Ic.people,
  },
]

// Editorial / legal contract links. Rendered in the Sidebar footer and at the
// foot of the LeftRail (below a divider). Same shared-list discipline as NAV.
export const NAV_SECONDARY = [
  { to: '/metodologia', label: 'Metodología', labelKey: 'sidebar.footer.method' },
  { to: '/aviso-legal', label: 'Aviso legal', labelKey: 'sidebar.footer.legal' },
]

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
