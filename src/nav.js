import { Ic } from './components/Icons'
import { PERIODISTAS_ENABLED } from './flags'

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
    shortcut: 'G H',
  },
  {
    to: '/cambios',
    id: 'cambios',
    labelKey: 'nav.cambios',
    label: 'Novedades',
    icon: Ic.chart,
    shortcut: 'G N',
  },
  {
    to: '/cargos',
    id: 'cargos',
    labelKey: 'nav.cargos',
    label: 'Cargos',
    icon: Ic.people,
    shortcut: 'G C',
  },
  {
    to: '/presupuesto',
    id: 'presup',
    labelKey: 'nav.presup',
    label: 'Presupuesto',
    icon: Ic.coin,
    shortcut: 'G P',
  },
  {
    to: '/plenos',
    id: 'plenos',
    labelKey: 'nav.plenos',
    label: 'Plenos',
    icon: Ic.scale,
    shortcut: 'G L',
  },
  {
    to: '/promesas',
    id: 'promesas',
    labelKey: 'nav.promesas',
    label: 'Promesas',
    icon: Ic.scale,
    shortcut: 'G R',
  },
  {
    to: '/departamentos',
    id: 'depts',
    labelKey: 'nav.departamentos',
    label: 'Departamentos',
    icon: Ic.building,
    shortcut: 'G E',
  },
  {
    to: '/hallazgos',
    id: 'findings',
    labelKey: 'nav.hallazgos',
    label: 'Hallazgos',
    icon: Ic.warn,
    shortcut: 'G F',
  },
  {
    to: '/reportajes',
    id: 'reportajes',
    labelKey: 'nav.reportajes',
    label: 'Reportajes',
    icon: Ic.list ?? Ic.warn,
    shortcut: 'G J',
  },
  {
    to: '/declaraciones',
    id: 'declaraciones',
    labelKey: 'nav.declaraciones',
    label: 'Declaraciones',
    icon: Ic.list ?? Ic.warn,
    shortcut: 'G L',
  },
  {
    to: '/datos',
    id: 'datos',
    labelKey: 'nav.datos',
    label: 'Datos',
    icon: Ic.chart,
    shortcut: 'G D',
  },
  {
    to: '/quejas',
    id: 'quejas',
    labelKey: 'nav.quejas',
    label: 'Quejas',
    icon: Ic.warn,
    shortcut: 'G Q',
  },
  {
    to: '/empleo',
    id: 'empleo',
    labelKey: 'nav.empleo',
    label: 'Empleo',
    icon: Ic.building,
    shortcut: 'G O',
  },
  {
    to: '/empleo-publico',
    id: 'empleo-publico',
    labelKey: 'nav.empleoPublico',
    label: 'Empleo público',
    icon: Ic.building,
    shortcut: 'G U',
  },
  {
    to: '/laboratorio',
    id: 'laboratorio',
    labelKey: 'nav.laboratorio',
    label: 'Laboratorio',
    icon: Ic.lab,
    shortcut: 'G B',
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
          shortcut: 'G A',
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
          shortcut: 'G C',
        },
      ]
    : []),
  {
    to: '/nosotros',
    id: 'nosotros',
    labelKey: 'nav.nosotros',
    label: 'Quiénes somos',
    icon: Ic.people,
    shortcut: 'G S',
  },
]

// Editorial / legal contract links. Rendered in the Sidebar footer and at the
// foot of the LeftRail (below a divider). Same shared-list discipline as NAV.
export const NAV_SECONDARY = [
  { to: '/metodologia', label: 'Metodología', labelKey: 'sidebar.footer.method' },
  { to: '/aviso-legal', label: 'Aviso legal', labelKey: 'sidebar.footer.legal' },
]
