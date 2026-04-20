import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export const LOCALES = ['es', 'ca']
export const DEFAULT_LOCALE = 'es'
const STORAGE_KEY = 'cp:lang'

/**
 * Translation catalogue. Keep keys dot-namespaced so tree-shaking + greps stay
 * simple. Only chrome/navigation strings are translated — body copy, press
 * headlines, acta titles, legal citations, promise quotes and other data fields
 * stay in their source language because auto-translating them introduces
 * factual risk (e.g. a verbatim promise quote becoming non-verbatim).
 *
 * The shipping contract for this module is:
 *   - every chrome string used in Sidebar, Topbar, TweaksPanel, and each page
 *     heading/eyebrow/empty-state goes through t()
 *   - if a key is missing in a non-default locale, t() falls back to Spanish
 *     so nothing renders as "[missing:foo.bar]" in front of citizens
 *   - Valencian (ca) uses standard Acadèmia Valenciana de la Llengua spelling
 */
const CATALOGUE = {
  es: {
    // Navigation
    'nav.inicio':     'Panel',
    'nav.cargos':     'Cargos',
    'nav.presup':     'Presupuesto',
    'nav.plenos':     'Plenos',
    'nav.promesas':   'Promesas',
    'nav.datos':      'Datos',
    'nav.quejas':     'Quejas',
    'nav.section':    'Navegación',

    // Topbar
    'topbar.search':       'Buscar quejas, cargos, plenos…',
    'topbar.search.aria':  'Buscar',
    'topbar.menu.aria':    'Abrir menú',
    'topbar.github':       'GitHub →',

    // Sidebar
    'sidebar.footer.tag':  'MVP público · datos abiertos',
    'sidebar.footer.legal': 'Aviso legal',
    'sidebar.footer.method': 'Metodología',

    // Tweaks
    'tweaks.title':         'Ajustes',
    'tweaks.close':         'cerrar',
    'tweaks.density.label': 'Densidad',
    'tweaks.density.compact':     'Compacta',
    'tweaks.density.comfortable': 'Cómoda',
    'tweaks.density.spacious':    'Espaciosa',
    'tweaks.dark':          'Modo oscuro',
    'tweaks.lang.label':    'Idioma',
    'tweaks.lang.es':       'Español',
    'tweaks.lang.ca':       'Valencià',
    'tweaks.open.aria':     'Ajustes',

    // Common
    'common.loading':       'Cargando…',
    'common.noData':        'Sin datos',

    // Page eyebrows + titles
    'cargos.eyebrow': 'Rendición de cuentas',
    'cargos.title':   'Cargos y departamentos',
    'plenos.eyebrow': 'Órganos de gobierno',
    'plenos.title':   'Plenos municipales',
    'promesas.eyebrow': 'Transparencia electoral',
    'promesas.title': 'Promesas por partido',
    'datos.eyebrow':  'Base estadística',
    'datos.title':    'Datos abiertos',
    'presup.eyebrow': 'Hacienda pública',
    'presup.title':   'Presupuesto municipal',
    'quejas.eyebrow': 'Voz ciudadana',
    'quejas.title':   'Quejas ciudadanas',
    'dashboard.eyebrow': 'Voz ciudadana · Dashboard',
    'dashboard.title':   'Salud del canal de quejas',

    // Plenos vote block
    'plenos.votes.heading':  'Votaciones registradas',
    'plenos.votes.empty.eyebrow': 'Sin datos',
    'plenos.votes.empty.title':   'No hay votaciones registradas todavía',

    // Quejas empty state
    'quejas.empty.title':    'El canal de quejas ciudadanas ya está abierto — no hay datos todavía',
    'dashboard.empty.title': 'El canal está abierto, aún no hay quejas',
  },

  // Valencià (estàndard oficial — Acadèmia Valenciana de la Llengua / GVA)
  ca: {
    'nav.inicio':     'Inici',
    'nav.cargos':     'Càrrecs',
    'nav.presup':     'Pressupost',
    'nav.plenos':     'Plens',
    'nav.promesas':   'Promeses',
    'nav.datos':      'Dades',
    'nav.quejas':     'Queixes',
    'nav.section':    'Navegació',

    'topbar.search':       'Cerca queixes, càrrecs, plens…',
    'topbar.search.aria':  'Cerca',
    'topbar.menu.aria':    'Obrir menú',
    'topbar.github':       'GitHub →',

    'sidebar.footer.tag':   'MVP públic · dades obertes',
    'sidebar.footer.legal': 'Avís legal',
    'sidebar.footer.method':'Metodologia',

    'tweaks.title':         'Ajustos',
    'tweaks.close':         'tanca',
    'tweaks.density.label': 'Densitat',
    'tweaks.density.compact':     'Compacta',
    'tweaks.density.comfortable': 'Còmoda',
    'tweaks.density.spacious':    'Espaiosa',
    'tweaks.dark':          'Mode fosc',
    'tweaks.lang.label':    'Idioma',
    'tweaks.lang.es':       'Castellà',
    'tweaks.lang.ca':       'Valencià',
    'tweaks.open.aria':     'Ajustos',

    'common.loading':       'Carregant…',
    'common.noData':        'Sense dades',

    'cargos.eyebrow': 'Rendició de comptes',
    'cargos.title':   'Càrrecs i departaments',
    'plenos.eyebrow': 'Òrgans de govern',
    'plenos.title':   'Plens municipals',
    'promesas.eyebrow': 'Transparència electoral',
    'promesas.title': 'Promeses per partit',
    'datos.eyebrow':  'Base estadística',
    'datos.title':    'Dades obertes',
    'presup.eyebrow': 'Hisenda pública',
    'presup.title':   'Pressupost municipal',
    'quejas.eyebrow': 'Veu ciutadana',
    'quejas.title':   'Queixes ciutadanes',
    'dashboard.eyebrow': 'Veu ciutadana · Tauler',
    'dashboard.title':   'Salut del canal de queixes',

    'plenos.votes.heading':  'Votacions registrades',
    'plenos.votes.empty.eyebrow': 'Sense dades',
    'plenos.votes.empty.title':   'Encara no hi ha votacions registrades',

    'quejas.empty.title':    'El canal de queixes ciutadanes ja està obert — encara no hi ha dades',
    'dashboard.empty.title': 'El canal està obert, encara no hi ha queixes',
  },
}

function loadLocale() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && LOCALES.includes(v)) return v
  } catch { /* empty */ }
  return DEFAULT_LOCALE
}

const LocaleContext = createContext({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (k) => CATALOGUE[DEFAULT_LOCALE][k] ?? k,
})

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(loadLocale)

  useEffect(() => {
    document.documentElement.lang = locale
    try { localStorage.setItem(STORAGE_KEY, locale) } catch { /* empty */ }
  }, [locale])

  const setLocale = useCallback((next) => {
    if (LOCALES.includes(next)) setLocaleState(next)
  }, [])

  const t = useCallback((key) => {
    const table = CATALOGUE[locale] || CATALOGUE[DEFAULT_LOCALE]
    return table[key] ?? CATALOGUE[DEFAULT_LOCALE][key] ?? key
  }, [locale])

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}

export function useT() {
  return useContext(LocaleContext).t
}
