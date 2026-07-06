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
    'nav.inicio': 'Panel',
    'nav.cambios': 'Novedades',
    'nav.cargos': 'Cargos',
    'nav.presup': 'Presupuesto',
    'nav.plenos': 'Plenos',
    'nav.promesas': 'Promesas',
    'nav.departamentos': 'Departamentos',
    'nav.hallazgos': 'Hallazgos',
    'nav.declaraciones': 'Declaraciones',
    'nav.datos': 'Datos',
    'nav.quejas': 'Quejas',
    'nav.empleo': 'Empleo',
    'nav.laboratorio': 'Laboratorio',
    'nav.nosotros': 'Quiénes somos',
    'nav.agentes': 'Periodistas',
    'nav.section': 'Navegación',

    // Empleo (ofertas de empleo · Agència de Col·locació)
    'empleo.eyebrow': 'Agència de Col·locació · ADL',
    'empleo.title': 'Ofertas de empleo',
    'empleo.intro':
      'Ofertas activas publicadas por la Agència de Col·locació (ADL) del Ayuntamiento de Riba-roja de Túria. La agencia intermedia empleo para toda la comarca, así que incluye puestos fuera del municipio.',
    'empleo.openOffers': 'ofertas abiertas',
    'empleo.closingSoon': 'cierran pronto',
    'empleo.searchPlaceholder': 'Buscar por puesto, código o localidad…',
    'empleo.ribaOnly': 'Solo Riba-roja',
    'empleo.sortBy': 'Ordenar por',
    'empleo.sortDeadline': 'Cierre de inscripción',
    'empleo.sortPublished': 'Fecha de publicación',
    'empleo.error': 'No se pudieron cargar las ofertas. Ejecuta',
    'empleo.empty': 'No hay ofertas que coincidan con el filtro.',
    'empleo.sourceNote':
      'Fuente: ribaocupacio.portalemp.com (Agència de Col·locació · Ajuntament de Riba-roja de Túria). La inscripción se realiza en el portal oficial.',
    'empleo.closed': 'Cerrada',
    'empleo.closesToday': 'Cierra hoy',
    'empleo.closesIn': 'Cierra en',
    'empleo.days': 'días',
    // Empleo v2 — stats + filters + pagination
    'empleo.kpi.offers': 'Ofertas abiertas',
    'empleo.kpi.positions': 'Puestos ofertados',
    'empleo.kpi.inRiba': 'En Riba-roja',
    'empleo.kpi.closing': 'Cierran ≤14 días',
    'empleo.kpi.of': 'de',
    'empleo.kpi.vehicle': 'requieren vehículo propio',
    'empleo.chart.byMonth': 'Ofertas por mes',
    'empleo.chart.byContract': 'Tipo de contrato',
    'empleo.chart.byMunicipio': 'Dónde',
    'empleo.stats.thin': 'Pocos datos',
    'empleo.filterMunicipio': 'Municipio',
    'empleo.allMunicipios': 'Todos los municipios',
    'empleo.filterContract': 'Tipo de contrato',
    'empleo.allContracts': 'Todos los contratos',
    'empleo.filterJornada': 'Jornada',
    'empleo.allJornadas': 'Toda jornada',
    'empleo.jornadaFull': 'Completa',
    'empleo.jornadaPart': 'Parcial',
    'empleo.filterClosing': 'Cierre',
    'empleo.closingAll': 'Cualquier cierre',
    'empleo.closingWeek': 'Cierra esta semana',
    'empleo.closingMonth': 'Cierra este mes',
    'empleo.results': 'ofertas',
    'empleo.clearFilters': 'Limpiar filtros',
    'empleo.prev': 'Anterior',
    'empleo.next': 'Siguiente',
    'empleo.page': 'Página',
    'empleo.card.positions': 'puestos',
    'empleo.card.occ': 'Ocupación:',
    'empleo.card.exp': 'Exp.',
    'empleo.card.more': 'Ver más',
    'empleo.card.less': 'Ver menos',
    'empleo.rss': 'Feed RSS de nuevas ofertas',
    'empleo.showMap': 'Ver mapa de ofertas ▾',
    'empleo.hideMap': 'Ocultar mapa ▴',
    'empleo.mapEmpty': 'Sin ofertas localizables en el filtro actual',
    'empleo.back': 'Volver a ofertas',
    'empleo.published': 'Publicada',
    'empleo.deadline': 'Fin inscripción',
    'empleo.workplace': 'Lugar de trabajo',
    'empleo.positions': 'Nº de puestos',
    'empleo.applyCta': 'Inscribirse en el portal',
    'empleoDetail.notFound':
      'Esta oferta ya no está disponible o ha cerrado su plazo de inscripción. Vuelve al listado para ver las ofertas abiertas.',
    'empleoDetail.section': 'Ficha',
    'empleoDetail.generalData': 'Datos generales',
    'empleoDetail.requested': 'Perfil',
    'empleoDetail.occupations': 'Ocupaciones solicitadas',
    'empleoDetail.experience': 'Experiencia',
    'empleoDetail.noDetail': 'Sin ficha detallada disponible para esta oferta.',

    // Topbar
    'topbar.search': 'Buscar quejas, cargos, plenos…',
    'topbar.search.aria': 'Buscar',
    'topbar.menu.aria': 'Abrir menú',

    // Sidebar
    'sidebar.footer.tag': 'MVP público · datos abiertos',
    'sidebar.footer.legal': 'Aviso legal',
    'sidebar.footer.method': 'Metodología',

    // Tweaks
    'tweaks.title': 'Ajustes',
    'tweaks.close': 'cerrar',
    'tweaks.density.label': 'Densidad',
    'tweaks.density.compact': 'Compacta',
    'tweaks.density.comfortable': 'Cómoda',
    'tweaks.density.spacious': 'Espaciosa',
    'tweaks.dark': 'Modo oscuro',
    'tweaks.lang.label': 'Idioma',
    'tweaks.lang.es': 'Español',
    'tweaks.lang.ca': 'Valencià',
    'tweaks.open.aria': 'Ajustes',

    // Map (landing interactive layers)
    'map.layers.title': 'Capas del mapa',
    'map.layer.money': 'Gasto municipal',
    'map.layer.poi': 'Servicios',
    'map.layer.quejas': 'Quejas',
    'map.layer.flood': 'Riesgo inundación',
    'map.quejas.title': 'Quejas por barrio',
    'map.quejas.crit': 'silencio alto',
    'map.quejas.warn': 'silencio moderado',
    'map.quejas.ok': 'mayoría resueltas',
    'map.quejas.civic': 'en curso',
    'map.quejas.radius': 'radio ∝ nº de quejas',
    'map.money.title': 'Gasto situado',
    'map.money.dana': 'Solo DANA',
    'map.money.play': 'Reproducir línea de tiempo del gasto',
    'map.money.pause': 'Pausar línea de tiempo del gasto',
    'map.money.accum': 'obra acumulada',
    'map.poi.title': 'Servicios públicos',
    'map.poi.source': 'OpenStreetMap · datos abiertos',
    'map.flood.title': 'Riesgo de inundación',

    // Common
    'common.loading': 'Cargando…',
    'common.noData': 'Sin datos',

    // Declaraciones page (global verified-claim browse)
    'declaraciones.eyebrow': 'Verificación de declaraciones',
    'declaraciones.title': 'Declaraciones en pleno',
    'declaraciones.subtitle':
      'Cada afirmación, promesa o acusación detectada en los plenos municipales, cruzada contra los datos abiertos publicados (PLACSP, BDNS, presupuesto, promesas electorales). Atribución a nivel de grupo. Las declaraciones sin atribuir o sin evidencia se mantienen visibles porque se han hecho — pero no se promueven editorialmente sin verificación humana.',
    'declaraciones.stat.total': 'Total',
    'declaraciones.stat.conEvidencia': 'Con evidencia',
    'declaraciones.filter.verdict': 'Verdicto',
    'declaraciones.filter.bloc': 'Grupo',
    'declaraciones.filter.topic': 'Tema',
    'declaraciones.filter.todas': 'Todas',
    'declaraciones.filter.todos': 'Todos',
    'declaraciones.filter.conEvidencia': 'Con evidencia',
    'declaraciones.filter.atribuidas': 'Atribuidas',
    'declaraciones.search.placeholder': 'Buscar en el texto literal…',
    'declaraciones.matchCount': 'declaraciones coinciden con los filtros',
    'declaraciones.loadMore': 'Mostrar más',
    'declaraciones.empty': 'Ninguna declaración coincide con los filtros actuales.',

    // Page eyebrows + titles
    'cargos.eyebrow': 'Rendición de cuentas',
    'cargos.title': 'Cargos y departamentos',
    'plenos.eyebrow': 'Órganos de gobierno',
    'plenos.title': 'Plenos municipales',
    'promesas.eyebrow': 'Transparencia electoral',
    'promesas.title': 'Promesas por partido',
    'datos.eyebrow': 'Base estadística',
    'datos.title': 'Datos abiertos',
    'presup.eyebrow': 'Hacienda pública',
    'presup.title': 'Presupuesto municipal',
    'quejas.eyebrow': 'Voz ciudadana',
    'quejas.title': 'Quejas ciudadanas',
    'dashboard.eyebrow': 'Voz ciudadana · Dashboard',
    'dashboard.title': 'Salud del canal de quejas',

    // Plenos vote block
    'plenos.votes.heading': 'Votaciones registradas',
    'plenos.votes.empty.eyebrow': 'Sin datos',
    'plenos.votes.empty.title': 'No hay votaciones registradas todavía',

    // Claim ledger (declaraciones contrastadas)
    'ledger.loadMore': 'Cargar más',

    // Pleno index (/plenos)
    'plenosIndex.crossSession': 'Verificación de declaraciones (todas las sesiones) →',
    'plenosIndex.points': 'puntos',
    'plenosIndex.findings': 'hallazgos',

    // Pleno detail (/plenos/:id)
    'plenoDetail.notFound': 'Sesión no encontrada',
    'plenoDetail.back': '← Todos los plenos',
    'plenoDetail.summary': 'Resumen',
    'plenoDetail.agenda': 'Orden del día',
    'plenoDetail.votes': 'Votaciones',
    'plenoDetail.declarations': 'Declaraciones contrastadas',
    'plenoDetail.findings': 'Hallazgos editoriales',
    'plenoDetail.transcript': 'Ver transcripción',
    'plenoDetail.transcriptLoading': 'Cargando transcripción…',
    'plenoDetail.transcriptMissing': 'Transcripción no disponible para esta sesión.',
    'plenoDetail.video': '▸ Ver vídeo',
    'plenoDetail.empty.agenda': 'Sin orden del día publicado para esta sesión.',
    'plenoDetail.empty.votes': 'Sin votaciones transcritas del acta para esta sesión.',
    'plenoDetail.empty.findings': 'Sin hallazgos editoriales para esta sesión.',

    // Quejas empty state
    'quejas.empty.title': 'El canal de quejas ciudadanas ya está abierto — no hay datos todavía',
    'dashboard.empty.title': 'El canal está abierto, aún no hay quejas',

    // Cambios · delta-digest page
    'cambios.eyebrow': 'Esta semana en Riba-roja',
    'cambios.title': 'Novedades',

    // Departamentos — per-concejalía accountability dashboard
    // Cargo (per-concejal) detail
    'cargos.detalle.notFound': 'Concejal no encontrado.',
    'cargos.detalle.stat.portfolios': 'Concejalías',
    'cargos.detalle.stat.partyPromises': 'Promesas · grupo',
    'cargos.detalle.stat.agendaItems': 'Puntos en pleno',
    'cargos.detalle.stat.quejas': 'Quejas pendientes',
    'cargos.detalle.portfolios.eyebrow': 'Áreas asignadas',
    'cargos.detalle.portfolios.title': 'Concejalías que gestiona',
    'cargos.detalle.promesas.eyebrow': 'Atribución de grupo',
    'cargos.detalle.promesas.title': 'Promesas del grupo parlamentario',
    'cargos.detalle.promesas.viewAll': 'Ver tracker completo →',
    'cargos.detalle.promesas.empty': 'Sin promesas documentadas para este grupo.',
    'cargos.detalle.promesas.more': 'Ver {n} promesas más →',
    'cargos.detalle.agenda.eyebrow': 'Puntos de orden del día',
    'cargos.detalle.agenda.title': 'Asuntos llevados al pleno por sus concejalías',
    'cargos.detalle.agenda.empty': 'Sin puntos registrados en las áreas que gestiona.',
    'cargos.detalle.agenda.more': '+ {n} puntos anteriores',
    'cargos.detalle.quejas.eyebrow': 'Canal ciudadano',
    'cargos.detalle.quejas.title': 'Quejas asignadas por el router',
    'cargos.detalle.quejas.viewAll': 'Ver canal completo →',
    'cargos.detalle.quejas.empty': 'Sin quejas asignadas actualmente.',
    'cargos.detalle.methodology':
      'Las promesas se atribuyen a nivel de grupo parlamentario, no a personas. Los puntos de orden del día se cuentan cuando la concejalía proponente coincide con un área asignada.',
    'cargos.detalle.methodology.link': 'Leer metodología →',

    'departamentos.eyebrow': 'Rendición de cuentas',
    'departamentos.title': 'Departamentos · compromisos y plazos',
    'departamentos.subtitle':
      'Seguimiento por concejalía de los acuerdos aprobados en pleno y las promesas con plazo. Las votaciones transcritas son el hecho primario; las promesas son secundarias.',
    'departamentos.card.responsable': 'Responsable',
    'departamentos.card.sinResponsable': 'Sin concejal asignado',
    'departamentos.card.votes': 'Votos',
    'departamentos.card.aprobados': 'Aprobados',
    'departamentos.card.vencidos': 'Plazos vencidos',
    'departamentos.card.promesas': 'Promesas',
    'departamentos.card.quejas': 'Quejas abiertas',
    'departamentos.card.declaraciones': 'Declaraciones con evidencia',
    'departamentos.card.sinContraste': 'sin contraste',
    'departamentos.card.sinVotoTranscrito': 'sin voto transcrito',
    'departamentos.detalle.back': '← Todos los departamentos',
    'departamentos.detalle.compromisos': 'Compromisos plenarios',
    'departamentos.detalle.promesas': 'Promesas electorales',
    'departamentos.detalle.agendas': 'Puntos debatidos sin voto transcrito',
    'departamentos.detalle.quejas': 'Quejas ciudadanas activas',
    'departamentos.detalle.empty.votes':
      '0 votos transcritos para esta concejalía — contribuye vía `npm run pleno-vote` o la plantilla de issue.',
    'departamentos.detalle.empty.promesas': 'Sin promesas registradas para esta concejalía.',
    'departamentos.detalle.empty.quejas': 'Sin quejas ciudadanas activas para esta concejalía.',
    'plazo.vencido': 'plazo vencido · sin evidencia de ejecución',
    'plazo.hint':
      'Fecha de compromiso superada sin que se haya registrado evidencia de ejecución. El estado editorial NO cambia automáticamente.',
    'liveTicker.plazosVencidos': 'plazos vencidos',
    'liveTicker.plazosVencidos.none': 'sin plazos vencidos · todo en regla',
  },

  // Valencià (estàndard oficial — Acadèmia Valenciana de la Llengua / GVA)
  ca: {
    'nav.inicio': 'Inici',
    'nav.cambios': 'Novetats',
    'nav.cargos': 'Càrrecs',
    'nav.presup': 'Pressupost',
    'nav.plenos': 'Plens',
    'nav.promesas': 'Promeses',
    'nav.departamentos': 'Departaments',
    'nav.hallazgos': 'Troballes',
    'nav.declaraciones': 'Declaracions',
    'nav.datos': 'Dades',
    'nav.quejas': 'Queixes',
    'nav.empleo': 'Ocupació',
    'nav.laboratorio': 'Laboratori',
    'nav.nosotros': 'Qui som',
    'nav.agentes': 'Periodistes',
    'nav.section': 'Navegació',

    // Empleo (ofertes d’ocupació · Agència de Col·locació)
    'empleo.eyebrow': 'Agència de Col·locació · ADL',
    'empleo.title': 'Ofertes d’ocupació',
    'empleo.intro':
      'Ofertes actives publicades per l’Agència de Col·locació (ADL) de l’Ajuntament de Riba-roja de Túria. L’agència intermedia ocupació per a tota la comarca, així que inclou llocs fora del municipi.',
    'empleo.openOffers': 'ofertes obertes',
    'empleo.closingSoon': 'tanquen prompte',
    'empleo.searchPlaceholder': 'Cerca per lloc, codi o localitat…',
    'empleo.ribaOnly': 'Només Riba-roja',
    'empleo.sortBy': 'Ordenar per',
    'empleo.sortDeadline': 'Tancament d’inscripció',
    'empleo.sortPublished': 'Data de publicació',
    'empleo.error': 'No s’han pogut carregar les ofertes. Executa',
    'empleo.empty': 'No hi ha ofertes que coincidisquen amb el filtre.',
    'empleo.sourceNote':
      'Font: ribaocupacio.portalemp.com (Agència de Col·locació · Ajuntament de Riba-roja de Túria). La inscripció es fa al portal oficial.',
    'empleo.closed': 'Tancada',
    'empleo.closesToday': 'Tanca hui',
    'empleo.closesIn': 'Tanca en',
    'empleo.days': 'dies',
    // Empleo v2 — estadístiques + filtres + paginació
    'empleo.kpi.offers': 'Ofertes obertes',
    'empleo.kpi.positions': 'Llocs oferits',
    'empleo.kpi.inRiba': 'A Riba-roja',
    'empleo.kpi.closing': 'Tanquen ≤14 dies',
    'empleo.kpi.of': 'de',
    'empleo.kpi.vehicle': 'requereixen vehicle propi',
    'empleo.chart.byMonth': 'Ofertes per mes',
    'empleo.chart.byContract': 'Tipus de contracte',
    'empleo.chart.byMunicipio': 'On',
    'empleo.stats.thin': 'Poques dades',
    'empleo.filterMunicipio': 'Municipi',
    'empleo.allMunicipios': 'Tots els municipis',
    'empleo.filterContract': 'Tipus de contracte',
    'empleo.allContracts': 'Tots els contractes',
    'empleo.filterJornada': 'Jornada',
    'empleo.allJornadas': 'Tota jornada',
    'empleo.jornadaFull': 'Completa',
    'empleo.jornadaPart': 'Parcial',
    'empleo.filterClosing': 'Tancament',
    'empleo.closingAll': 'Qualsevol tancament',
    'empleo.closingWeek': 'Tanca esta setmana',
    'empleo.closingMonth': 'Tanca este mes',
    'empleo.results': 'ofertes',
    'empleo.clearFilters': 'Netejar filtres',
    'empleo.prev': 'Anterior',
    'empleo.next': 'Següent',
    'empleo.page': 'Pàgina',
    'empleo.card.positions': 'llocs',
    'empleo.card.occ': 'Ocupació:',
    'empleo.card.exp': 'Exp.',
    'empleo.card.more': 'Veure més',
    'empleo.card.less': 'Veure menys',
    'empleo.rss': 'Feed RSS de noves ofertes',
    'empleo.showMap': 'Veure mapa d’ofertes ▾',
    'empleo.hideMap': 'Amagar mapa ▴',
    'empleo.mapEmpty': 'Sense ofertes localitzables en el filtre actual',
    'empleo.back': 'Tornar a ofertes',
    'empleo.published': 'Publicada',
    'empleo.deadline': 'Fi inscripció',
    'empleo.workplace': 'Lloc de treball',
    'empleo.positions': 'Nre. de llocs',
    'empleo.applyCta': 'Inscriure’s al portal',
    'empleoDetail.notFound':
      'Esta oferta ja no està disponible o ha tancat el termini d’inscripció. Torna al llistat per veure les ofertes obertes.',
    'empleoDetail.section': 'Fitxa',
    'empleoDetail.generalData': 'Dades generals',
    'empleoDetail.requested': 'Perfil',
    'empleoDetail.occupations': 'Ocupacions sol·licitades',
    'empleoDetail.experience': 'Experiència',
    'empleoDetail.noDetail': 'Sense fitxa detallada disponible per a esta oferta.',

    'topbar.search': 'Cerca queixes, càrrecs, plens…',
    'topbar.search.aria': 'Cerca',
    'topbar.menu.aria': 'Obrir menú',

    'sidebar.footer.tag': 'MVP públic · dades obertes',
    'sidebar.footer.legal': 'Avís legal',
    'sidebar.footer.method': 'Metodologia',

    'tweaks.title': 'Ajustos',
    'tweaks.close': 'tanca',
    'tweaks.density.label': 'Densitat',
    'tweaks.density.compact': 'Compacta',
    'tweaks.density.comfortable': 'Còmoda',
    'tweaks.density.spacious': 'Espaiosa',
    'tweaks.dark': 'Mode fosc',
    'tweaks.lang.label': 'Idioma',
    'tweaks.lang.es': 'Castellà',
    'tweaks.lang.ca': 'Valencià',
    'tweaks.open.aria': 'Ajustos',

    // Map (landing interactive layers)
    'map.layers.title': 'Capes del mapa',
    'map.layer.money': 'Despesa municipal',
    'map.layer.poi': 'Serveis',
    'map.layer.quejas': 'Queixes',
    'map.layer.flood': 'Risc d’inundació',
    'map.quejas.title': 'Queixes per barri',
    'map.quejas.crit': 'silenci alt',
    'map.quejas.warn': 'silenci moderat',
    'map.quejas.ok': 'majoria resoltes',
    'map.quejas.civic': 'en curs',
    'map.quejas.radius': 'radi ∝ nº de queixes',
    'map.money.title': 'Despesa situada',
    'map.money.dana': 'Només DANA',
    'map.money.play': 'Reproduir la línia de temps de la despesa',
    'map.money.pause': 'Pausar la línia de temps de la despesa',
    'map.money.accum': 'obra acumulada',
    'map.poi.title': 'Serveis públics',
    'map.poi.source': 'OpenStreetMap · dades obertes',
    'map.flood.title': 'Risc d’inundació',

    'common.loading': 'Carregant…',
    'common.noData': 'Sense dades',

    'declaraciones.eyebrow': 'Verificació de declaracions',
    'declaraciones.title': 'Declaracions en plenari',
    'declaraciones.subtitle':
      'Cada afirmació, promesa o acusació detectada als plens municipals, creuada contra les dades obertes publicades (PLACSP, BDNS, pressupost, promeses electorals). Atribució a nivell de grup. Les declaracions sense atribuir o sense evidència es mantenen visibles perquè es van fer — però no es promouen editorialment sense verificació humana.',
    'declaraciones.stat.total': 'Total',
    'declaraciones.stat.conEvidencia': 'Amb evidència',
    'declaraciones.filter.verdict': 'Veredicte',
    'declaraciones.filter.bloc': 'Grup',
    'declaraciones.filter.topic': 'Tema',
    'declaraciones.filter.todas': 'Totes',
    'declaraciones.filter.todos': 'Tots',
    'declaraciones.filter.conEvidencia': 'Amb evidència',
    'declaraciones.filter.atribuidas': 'Atribuïdes',
    'declaraciones.search.placeholder': 'Cerca en el text literal…',
    'declaraciones.matchCount': 'declaracions coincideixen amb els filtres',
    'declaraciones.loadMore': 'Mostrar-ne més',
    'declaraciones.empty': 'Cap declaració coincideix amb els filtres actuals.',

    'cargos.eyebrow': 'Rendició de comptes',
    'cargos.title': 'Càrrecs i departaments',
    'plenos.eyebrow': 'Òrgans de govern',
    'plenos.title': 'Plens municipals',
    'promesas.eyebrow': 'Transparència electoral',
    'promesas.title': 'Promeses per partit',
    'datos.eyebrow': 'Base estadística',
    'datos.title': 'Dades obertes',
    'presup.eyebrow': 'Hisenda pública',
    'presup.title': 'Pressupost municipal',
    'quejas.eyebrow': 'Veu ciutadana',
    'quejas.title': 'Queixes ciutadanes',
    'dashboard.eyebrow': 'Veu ciutadana · Tauler',
    'dashboard.title': 'Salut del canal de queixes',

    'plenos.votes.heading': 'Votacions registrades',
    'plenos.votes.empty.eyebrow': 'Sense dades',
    'plenos.votes.empty.title': 'Encara no hi ha votacions registrades',

    // Claim ledger (declaracions contrastades)
    'ledger.loadMore': 'Carrega més',

    // Pleno index (/plenos)
    'plenosIndex.crossSession': 'Verificació de declaracions (totes les sessions) →',
    'plenosIndex.points': 'punts',
    'plenosIndex.findings': 'troballes',

    // Pleno detail (/plenos/:id)
    'plenoDetail.notFound': 'Sessió no trobada',
    'plenoDetail.back': '← Tots els plens',
    'plenoDetail.summary': 'Resum',
    'plenoDetail.agenda': 'Ordre del dia',
    'plenoDetail.votes': 'Votacions',
    'plenoDetail.declarations': 'Declaracions contrastades',
    'plenoDetail.findings': 'Troballes editorials',
    'plenoDetail.transcript': 'Veure transcripció',
    'plenoDetail.transcriptLoading': 'Carregant transcripció…',
    'plenoDetail.transcriptMissing': 'Transcripció no disponible per a aquesta sessió.',
    'plenoDetail.video': '▸ Veure vídeo',
    'plenoDetail.empty.agenda': 'Sense ordre del dia publicat per a aquesta sessió.',
    'plenoDetail.empty.votes': "Sense votacions transcrites de l'acta per a aquesta sessió.",
    'plenoDetail.empty.findings': 'Sense troballes editorials per a aquesta sessió.',

    'quejas.empty.title': 'El canal de queixes ciutadanes ja està obert — encara no hi ha dades',
    'dashboard.empty.title': 'El canal està obert, encara no hi ha queixes',

    'cambios.eyebrow': 'Esta setmana a Riba-roja',
    'cambios.title': 'Novetats',

    'cargos.detalle.notFound': 'Regidor/a no trobat/da.',
    'cargos.detalle.stat.portfolios': 'Regidories',
    'cargos.detalle.stat.partyPromises': 'Promeses · grup',
    'cargos.detalle.stat.agendaItems': 'Punts al ple',
    'cargos.detalle.stat.quejas': 'Queixes pendents',
    'cargos.detalle.portfolios.eyebrow': 'Àrees assignades',
    'cargos.detalle.portfolios.title': 'Regidories que gestiona',
    'cargos.detalle.promesas.eyebrow': 'Atribució de grup',
    'cargos.detalle.promesas.title': 'Promeses del grup parlamentari',
    'cargos.detalle.promesas.viewAll': 'Veure tracker complet →',
    'cargos.detalle.promesas.empty': 'Sense promeses documentades per a este grup.',
    'cargos.detalle.promesas.more': 'Veure {n} promeses més →',
    'cargos.detalle.agenda.eyebrow': "Punts de l'ordre del dia",
    'cargos.detalle.agenda.title': 'Assumptes portats al ple per les seues regidories',
    'cargos.detalle.agenda.empty': 'Sense punts registrats en les àrees que gestiona.',
    'cargos.detalle.agenda.more': '+ {n} punts anteriors',
    'cargos.detalle.quejas.eyebrow': 'Canal ciutadà',
    'cargos.detalle.quejas.title': 'Queixes assignades pel router',
    'cargos.detalle.quejas.viewAll': 'Veure canal complet →',
    'cargos.detalle.quejas.empty': 'Sense queixes assignades actualment.',
    'cargos.detalle.methodology':
      "Les promeses s'atribueixen a nivell de grup parlamentari, no a persones. Els punts de l'ordre del dia es compten quan la regidoria proposant coincideix amb una àrea assignada.",
    'cargos.detalle.methodology.link': 'Llegir metodologia →',

    'departamentos.eyebrow': 'Rendició de comptes',
    'departamentos.title': 'Departaments · compromisos i terminis',
    'departamentos.subtitle':
      'Seguiment per regidoria dels acords aprovats en ple i de les promeses amb termini. Les votacions transcrites són el fet primari; les promeses són secundàries.',
    'departamentos.card.responsable': 'Responsable',
    'departamentos.card.sinResponsable': 'Sense regidor/a assignat',
    'departamentos.card.votes': 'Vots',
    'departamentos.card.aprobados': 'Aprovats',
    'departamentos.card.vencidos': 'Terminis vençuts',
    'departamentos.card.promesas': 'Promeses',
    'departamentos.card.quejas': 'Queixes obertes',
    'departamentos.card.declaraciones': 'Declaracions amb evidència',
    'departamentos.card.sinContraste': 'sense contrast',
    'departamentos.card.sinVotoTranscrito': 'sense vot transcrit',
    'departamentos.detalle.back': '← Tots els departaments',
    'departamentos.detalle.compromisos': 'Compromisos plenaris',
    'departamentos.detalle.promesas': 'Promeses electorals',
    'departamentos.detalle.agendas': 'Punts debatuts sense vot transcrit',
    'departamentos.detalle.quejas': 'Queixes ciutadanes actives',
    'departamentos.detalle.empty.votes':
      "0 vots transcrits per a aquesta regidoria — contribueix via `npm run pleno-vote` o la plantilla d'issue.",
    'departamentos.detalle.empty.promesas': 'Sense promeses registrades per a aquesta regidoria.',
    'departamentos.detalle.empty.quejas':
      'Sense queixes ciutadanes actives per a aquesta regidoria.',
    'plazo.vencido': "termini vençut · sense evidència d'execució",
    'plazo.hint':
      "Data de compromís superada sense que s'haja registrat evidència d'execució. L'estat editorial NO canvia automàticament.",
    'liveTicker.plazosVencidos': 'terminis vençuts',
    'liveTicker.plazosVencidos.none': 'sense terminis vençuts · tot en regla',
  },
}

function loadLocale() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && LOCALES.includes(v)) return v
  } catch {
    /* empty */
  }
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
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      /* empty */
    }
  }, [locale])

  const setLocale = useCallback((next) => {
    if (LOCALES.includes(next)) setLocaleState(next)
  }, [])

  const t = useCallback(
    (key) => {
      const table = CATALOGUE[locale] || CATALOGUE[DEFAULT_LOCALE]
      return table[key] ?? CATALOGUE[DEFAULT_LOCALE][key] ?? key
    },
    [locale],
  )

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}

export function useT() {
  return useContext(LocaleContext).t
}
