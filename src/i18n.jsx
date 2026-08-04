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
    'nav.reportajes': 'Reportajes',
    'nav.declaraciones': 'Declaraciones',
    'nav.datos': 'Datos',
    'nav.quejas': 'Quejas',
    'nav.empleo': 'Empleo',
    'nav.empleoPublico': 'Empleo público',
    'empleoPublico.eyebrow': 'Ayuntamiento · procesos selectivos',
    'empleoPublico.title': 'Empleo público',
    'empleoPublico.intro1':
      'Procesos selectivos del propio Ayuntamiento de Riba-roja de Túria — oposiciones, bolsas de trabajo y estabilización. Distinto de las ofertas de la Agència de Col·locació (ver ',
    'empleoPublico.intro2': '). Fuente: portal municipal.',
    'empleoPublico.empty': 'No hay procesos selectivos publicados ahora mismo.',
    'nav.laboratorio': 'Laboratorio',
    'nav.nosotros': 'Quiénes somos',
    'nav.agentes': 'Periodistas',
    'nav.section': 'Navegación',

    // Reportajes (índice de piezas long-form)
    'reportajes.eyebrow': 'CivicPulse · investigaciones de datos',
    'reportajes.title': 'Reportajes',
    'reportajes.intro':
      'Piezas largas a partir del registro público: cifras congeladas en el momento de la publicación y cada afirmación con su fuente.',
    'reportajes.read': 'Leer el reportaje →',

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
    'map.layer.money': 'Gasto situado',
    'map.layer.obras': 'Obras 2019–2024',
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
    'map.money.obras': 'Solo obras',
    'map.money.play': 'Reproducir línea de tiempo del gasto',
    'map.money.pause': 'Pausar línea de tiempo del gasto',
    'map.money.accum': 'obra acumulada',
    'map.money.of': 'de',
    'map.money.coverage':
      'Sólo el gasto cuyo título nombra un lugar. El resto son servicios de ámbito municipal —recogida de residuos, limpieza viaria, ayuda a domicilio— que no tienen un punto en el mapa.',
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
    'plenoDetail.empty.votes':
      'Todavía no hemos transcrito las votaciones del acta de esta sesión. No significa que no las hubiera.',
    'plenoDetail.votesPending': 'sin transcribir',
    'plenoDetail.empty.findings': 'Sin hallazgos editoriales para esta sesión.',
    // "Todavía no lo hemos recogido" ≠ "no hubo puntos". La sesión se celebró;
    // lo que falta es nuestra ingesta, no el orden del día.
    'plenoDetail.agendaPending': 'sin recoger',
    'plenoDetail.agendaPendingLong': 'Orden del día aún no recogido para esta sesión',
    'plenoDetail.empty.agendaPending':
      'Todavía no hemos podido recoger el orden del día de esta sesión desde la sede de plenos. La sesión se celebró; el dato falta por nuestra parte, no por la del Ayuntamiento.',
    'plenoDetail.empty.summary':
      'Sesión registrada. Aún no hay votaciones transcritas, declaraciones contrastables ni hallazgos para esta sesión.',
    'plenoDetail.empty.summaryNoAgenda':
      'Sesión registrada. Todavía no hemos recogido su orden del día, y aún no hay votaciones transcritas, declaraciones contrastables ni hallazgos.',

    // Quejas empty state
    'quejas.empty.title': 'El canal de quejas ciudadanas ya está abierto — no hay datos todavía',
    'dashboard.empty.title': 'El canal está abierto, aún no hay quejas',

    // Cambios · delta-digest page
    'cambios.eyebrow': 'Esta semana en Riba-roja',
    'cambios.title': 'Novedades',

    // Departamentos — per-concejalía accountability dashboard
    // Cargo (per-concejal) detail
    'cargos.detalle.notFound': 'Concejal no encontrado.',
    'hallazgos.area.filtered': 'Filtrado por área',
    'hallazgos.area.clear': 'ver todos',
    'hallazgos.area.note':
      'Hallazgos cuyas declaraciones se clasifican en esta área. La atribución de cada hallazgo es al GRUPO político que habló, nunca a una persona concreta.',
    'cargos.detalle.actividad.eyebrow': 'Actividad de sus áreas',
    'cargos.detalle.actividad.title': 'Qué se ha debatido y verificado en sus concejalías',
    'cargos.detalle.actividad.intro':
      'Cifras de las áreas que dirige, no de la persona. Las votaciones se registran por grupo político y las declaraciones se atribuyen al grupo que habló, nunca a un concejal concreto: por eso se enlazan aquí en lugar de mostrarse bajo su ficha.',
    'cargos.detalle.actividad.votos': 'votaciones',
    'cargos.detalle.actividad.declaraciones': 'declaraciones con evidencia',
    'cargos.detalle.actividad.hallazgos': 'hallazgos del área →',
    'datos.boe.eyebrow': 'Boletín Oficial del Estado',
    'datos.boe.intro':
      'Actos del Estado que nombran a Riba-roja: convenios, expropiaciones, resoluciones de personal o subvenciones nominativas que ninguna fuente municipal publica.',
    'datos.boe.empty':
      'Sin entradas en los últimos 30 días. El rastreo cubre solo ese periodo, así que esto significa "nada publicado este mes", no "nada nunca".',
    'presupuesto.ted.eyebrow': 'Contratos sobre el umbral europeo · TED',
    'presupuesto.ted.notices': 'anuncios',
    'presupuesto.ted.valued': 'con importe declarado',
    'presupuesto.ted.intro':
      'Anuncios del Ayuntamiento en el Diario Oficial de la UE: los contratos que superan el umbral europeo, entre ellos líneas NextGenerationEU y de reconstrucción por la DANA. Complementa el feed de PLACSP, que a veces los publica más tarde.',
    'presupuesto.ted.note':
      'TED no publica título descriptivo para estos anuncios —el número ES el identificador—, así que cada fila enlaza al original. El símbolo ≈ marca los anuncios sin fecha exacta: el año se recupera del número de publicación y no se inventa un día.',
    'cargos.detalle.ficha.eyebrow': 'Portal de transparencia',
    'cargos.detalle.ficha.title': 'Su ficha biográfica oficial',
    'cargos.detalle.ficha.note':
      'Documento publicado por el propio Ayuntamiento. Cinco concejales no tienen ficha publicada; en esos casos no se muestra nada antes que enlazar la de otra persona.',
    'cargos.detalle.mandato.eyebrow': 'Respaldo electoral',
    'cargos.detalle.mandato.title': 'Con cuántos votos llegó su lista',
    'cargos.detalle.mandato.municipales': 'municipales',
    'cargos.detalle.mandato.note':
      'Porcentaje de la candidatura, no de la persona: en las municipales se vota lista cerrada.',
    'cargos.detalle.mandato.abstencion': 'abstención',
    'cargos.detalle.pago.eyebrow': 'Retribución · acuerdo plenario',
    'cargos.detalle.pago.title': 'Qué cobra por el cargo',
    'cargos.detalle.pago.sinDedicacion':
      'Sin dedicación retribuida en el acuerdo de la corporación. Percibe, en su caso, asistencias por sesión, que no constan en esta fuente.',
    'cargos.detalle.pago.fuente': 'Fuente: acuerdo plenario de retribuciones.',
    'cargos.detalle.area.eyebrow': 'Contratación de sus áreas',
    'cargos.detalle.area.title': 'Dinero adjudicado en las concejalías que dirige',
    'cargos.detalle.area.intro':
      'Importes adjudicados por las áreas de las que es responsable. Es gasto de la concejalía, no de la persona: los contratos los adjudica el órgano de contratación del Ayuntamiento.',
    'cargos.detalle.area.note':
      'Solo contratos ya adjudicados y de categoría atribuible a un área; la cifra se queda corta antes que asignar un responsable equivocado.',
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

    'encaje.eyebrow': 'Encaje declarado',
    'encaje.field.formacion': 'Formación',
    'encaje.field.experiencia': 'Experiencia',
    'encaje.value.relacionada': 'relacionada',
    'encaje.value.sin-relacion-declarada': 'sin relación declarada',
    'encaje.value.no-consta': 'no consta',
    // De qué se sostiene LO CITADO. Una frase, no un distintivo repetido:
    // mientras todas las evaluaciones de la ficha coinciden se dice una vez.
    //
    // El sujeto es «lo que aquí se cita», nunca la ficha entera. Decía «todo lo
    // anterior» y alcanzaba también a las evaluaciones que no citan nada: sobre
    // ésas no se comprobó corroboración alguna, así que negarla afirmaba un
    // resultado que nadie midió. Una ausencia no es un hallazgo — la misma
    // distinción que separa «no consta» de «sin relación declarada».
    //
    // «sin-clasificar» no tiene texto a propósito: el validador publicado lo
    // rechaza, y darle copia sería preparar sitio para lo que no debe salir.
    'encaje.respaldo.autodeclarada':
      'Lo que aquí se cita procede del CV que publica la propia persona; ninguna fuente independiente lo corrobora.',
    'encaje.respaldo.corroborada':
      'Lo que aquí se cita lo respalda además alguna fuente independiente de la persona.',
    'encaje.respaldo.discrepancia-documentada':
      'Lo que aquí se cita arrastra una discrepancia documentada sin resolver.',
    'encaje.respaldo.mark.autodeclarada': 'autodeclarada',
    'encaje.respaldo.mark.corroborada': 'corroborada',
    'encaje.respaldo.mark.discrepancia-documentada': 'discrepancia documentada',
    'encaje.aviso.label': 'Advertencia de la biografía',
    'encaje.aviso.contradice': 'contradicción sin resolver',
    'encaje.aviso.corrobora': 'otra fuente lo confirma',
    'encaje.aviso.matiza': 'matiz',
    'encaje.aviso.area':
      'Sus áreas delegadas han cambiado durante el mandato; esta ficha puede referirse a un área que ya no lleva.',
    'encaje.card.gaps': 'qué falta',
    'encaje.card.law': 'qué exige la ley',
    'encaje.sinDelegacion.label': 'Sin delegación de área',
    'encaje.sinDelegacion.note':
      'No dirige ninguna concejalía, así que no hay área con la que comparar. El bloque en blanco refleja quién gobierna, no quién está formado.',
    'encaje.matrix.title': 'Qué declara para cada área que dirige',
    'encaje.matrix.intro':
      'Área por área, si lo que declara en su CV publicado guarda relación con la materia. No es una calificación: no hay nota, ni suma, ni orden. «No consta» significa que la fuente publicada no lo recoge.',
    'encaje.matrix.dept': 'Ver departamento',
    'encaje.matrix.signed': 'Revisado y firmado por',
    'encaje.ley.eyebrow': 'Requisitos legales',
    'encaje.ley.title': 'Qué exige la ley para cada puesto',
    'encaje.ley.titulacion': 'Titulación exigida',
    'encaje.ley.ninguna': 'ninguna',
    'departamentos.encaje':
      'De {cargos} concejalías con delegación, en {conFormacion} el responsable declara formación del campo del área y en {sinRelacion} lo declarado corresponde a otra materia.',

    'departamentos.eyebrow': 'Rendición de cuentas',
    'departamentos.title': 'Departamentos · compromisos y plazos',
    'departamentos.subtitle':
      'Seguimiento por concejalía de los acuerdos aprobados en pleno y las promesas con plazo. Las votaciones transcritas son el hecho primario; las promesas son secundarias.',
    'departamentos.card.responsable': 'Responsable',
    'departamentos.card.sinResponsable': 'Sin concejal asignado',
    'departamentos.card.votes': 'Votos',
    'departamentos.card.aprobados': 'Aprobados',
    'departamentos.card.vencidos': 'Plazos vencidos',
    'departamentos.card.verResponsable': 'Ver responsable',
    'departamentos.card.contratacion': 'Contratación',
    'departamentos.sinConcejalia': 'sin concejalía asignada',
    'departamentos.plazoVencido': 'plazo vencido',
    'departamentos.card.contratos': 'contratos',
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

    // Accessibility chrome
    'a11y.skipToContent': 'Saltar al contenido',
    'a11y.railLabel': 'Secciones',
    'a11y.editorialLabel': 'El Mirador · boletín cívico',
    'a11y.mainLabel': 'Mapa y boletín',
    'a11y.kpiLabel': 'Indicadores del municipio',

    // Landing ("El Mirador"). These ARE chrome under the policy above — the
    // column's own section bands and calls to action, not scraped data — but
    // until Aug 2026 none of them went through t(), so switching to Valencià
    // changed 8 of 376 lines on the page and every editorial heading stayed
    // in Castilian.
    'landing.masthead.kicker': 'CivicPulse · Boletín',
    'landing.masthead.title': 'El Mirador',
    'landing.masthead.tagline': 'Diario cívico · Riba-roja de Túria',
    'landing.queja.kicker': 'Voz ciudadana · canal directo',
    'landing.queja.title': 'Denuncia un bache en 10 segundos.',
    'landing.queja.body1': 'Abre el bot de Telegram, envía',
    'landing.queja.body2':
      ', adjunta foto y ubicación. Si 10 vecinos la apoyan, entra al Registro Electrónico del Ayuntamiento como solicitud oficial. Reloj legal público, sin coste, sin datos personales publicados.',
    'landing.queja.cta': 'Abrir el bot →',
    'landing.queja.privacy': 'Cómo protegemos tus datos',
    'landing.section.reportajes': 'Reportajes · CivicPulse',
    'landing.section.pleno': 'Pleno municipal',
    'landing.section.promesas': 'Seguimiento de promesas',
    'landing.section.rendicion': 'Rendición de cuentas por concejalía',
    'landing.section.prensa': 'Prensa',
    'landing.section.contratos': 'Contratos adjudicados',
    'landing.section.empleo': 'Empleo · Agència de Col·locació',
    'landing.section.eventos': 'Próximos eventos',
    'landing.section.participa': 'Participación ciudadana',
    'landing.reportajes.all': 'Todos los reportajes →',
    'landing.reportajes.piece': 'pieza',
    'landing.reportajes.pieces': 'piezas',
    'landing.reportajes.correction': 'corrección publicada',
    'landing.reportajes.corrections': 'correcciones publicadas',
    'landing.alcalde.role': 'Alcalde',
    'landing.empleo.all': 'Ver todas las ofertas →',
    'landing.promesas.blurb':
      'Compromisos públicos documentados con cita verbatim y fuente primaria. Sin juicios automáticos de cumplimiento.',
    'landing.promesas.cta': 'Ver tracker completo →',
    'landing.rendicion.blurb':
      'Cruza votos de pleno, promesas electorales y quejas ciudadanas por concejalía. Un plazo vencido se marca como aviso editorial — el estado nunca se modifica de forma automática.',
    'landing.rendicion.cta': 'Ver dashboard por departamento →',
    'landing.escanos': 'escaños',
    'landing.titulares': 'titulares',
    'landing.medios': 'medios',
    'landing.ofertas': 'ofertas',
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
    'nav.reportajes': 'Reportatges',
    'nav.declaraciones': 'Declaracions',
    'nav.datos': 'Dades',
    'nav.quejas': 'Queixes',
    'nav.empleo': 'Ocupació',
    'nav.empleoPublico': 'Ocupació pública',
    'empleoPublico.eyebrow': 'Ajuntament · processos selectius',
    'empleoPublico.title': 'Ocupació pública',
    'empleoPublico.intro1':
      'Processos selectius del mateix Ajuntament de Riba-roja de Túria — oposicions, borses de treball i estabilització. Diferent de les ofertes de l’Agència de Col·locació (veure ',
    'empleoPublico.intro2': '). Font: portal municipal.',
    'empleoPublico.empty': 'No hi ha processos selectius publicats ara mateix.',
    'nav.laboratorio': 'Laboratori',
    'nav.nosotros': 'Qui som',
    'nav.agentes': 'Periodistes',
    'nav.section': 'Navegació',

    // Reportatges (índex de peces long-form)
    'reportajes.eyebrow': 'CivicPulse · investigacions de dades',
    'reportajes.title': 'Reportatges',
    'reportajes.intro':
      'Peces llargues a partir del registre públic: xifres congelades en el moment de la publicació i cada afirmació amb la seua font.',
    'reportajes.read': 'Llegir el reportatge →',

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
    'map.layer.money': 'Despesa situada',
    'map.layer.obras': 'Obres 2019–2024',
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
    'map.money.obras': 'Només obres',
    'map.money.play': 'Reproduir la línia de temps de la despesa',
    'map.money.pause': 'Pausar la línia de temps de la despesa',
    'map.money.accum': 'obra acumulada',
    'map.money.of': 'de',
    'map.money.coverage':
      "Només la despesa el títol de la qual nomena un lloc. La resta són serveis d'àmbit municipal —recollida de residus, neteja viària, ajuda a domicili— que no tenen un punt al mapa.",
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
    'plenoDetail.empty.votes':
      "Encara no hem transcrit les votacions de l'acta d'aquesta sessió. No vol dir que no n'hi haguera.",
    'plenoDetail.votesPending': 'sense transcriure',
    'plenoDetail.empty.findings': 'Sense troballes editorials per a aquesta sessió.',
    'plenoDetail.agendaPending': 'sense recollir',
    'plenoDetail.agendaPendingLong': 'Ordre del dia encara no recollit per a aquesta sessió',
    'plenoDetail.empty.agendaPending':
      "Encara no hem pogut recollir l'ordre del dia d'aquesta sessió des de la seu de plens. La sessió es va celebrar; la dada falta per la nostra banda, no per la de l'Ajuntament.",
    'plenoDetail.empty.summary':
      'Sessió registrada. Encara no hi ha votacions transcrites, declaracions contrastables ni troballes per a aquesta sessió.',
    'plenoDetail.empty.summaryNoAgenda':
      'Sessió registrada. Encara no hem recollit el seu ordre del dia, i encara no hi ha votacions transcrites, declaracions contrastables ni troballes.',

    'quejas.empty.title': 'El canal de queixes ciutadanes ja està obert — encara no hi ha dades',
    'dashboard.empty.title': 'El canal està obert, encara no hi ha queixes',

    'cambios.eyebrow': 'Esta setmana a Riba-roja',
    'cambios.title': 'Novetats',

    'cargos.detalle.notFound': 'Regidor/a no trobat/da.',
    'hallazgos.area.filtered': 'Filtrat per àrea',
    'hallazgos.area.clear': 'veure tots',
    'hallazgos.area.note':
      "Troballes les declaracions de les quals es classifiquen en esta àrea. L'atribució de cada troballa és al GRUP polític que va parlar, mai a una persona concreta.",
    'cargos.detalle.actividad.eyebrow': 'Activitat de les seues àrees',
    'cargos.detalle.actividad.title': "Què s'ha debatut i verificat a les seues regidories",
    'cargos.detalle.actividad.intro':
      "Xifres de les àrees que dirigeix, no de la persona. Les votacions es registren per grup polític i les declaracions s'atribueixen al grup que va parlar, mai a un regidor concret: per això s'enllacen ací en lloc de mostrar-se sota la seua fitxa.",
    'cargos.detalle.actividad.votos': 'votacions',
    'cargos.detalle.actividad.declaraciones': 'declaracions amb evidència',
    'cargos.detalle.actividad.hallazgos': "troballes de l'àrea →",
    'datos.boe.eyebrow': "Butlletí Oficial de l'Estat",
    'datos.boe.intro':
      "Actes de l'Estat que anomenen Riba-roja: convenis, expropiacions, resolucions de personal o subvencions nominatives que cap font municipal publica.",
    'datos.boe.empty':
      'Sense entrades en els últims 30 dies. El rastreig cobrix només eixe període, així que això significa "res publicat este mes", no "res mai".',
    'presupuesto.ted.eyebrow': 'Contractes sobre el llindar europeu · TED',
    'presupuesto.ted.notices': 'anuncis',
    'presupuesto.ted.valued': 'amb import declarat',
    'presupuesto.ted.intro':
      "Anuncis de l'Ajuntament al Diari Oficial de la UE: els contractes que superen el llindar europeu, entre ells línies NextGenerationEU i de reconstrucció per la DANA. Complementa el feed de PLACSP, que de vegades els publica més tard.",
    'presupuesto.ted.note':
      "TED no publica títol descriptiu per a estos anuncis —el número ÉS l'identificador—, així que cada fila enllaça a l'original. El símbol ≈ marca els anuncis sense data exacta: l'any es recupera del número de publicació i no s'inventa un dia.",
    'cargos.detalle.ficha.eyebrow': 'Portal de transparència',
    'cargos.detalle.ficha.title': 'La seua fitxa biogràfica oficial',
    'cargos.detalle.ficha.note':
      "Document publicat pel mateix Ajuntament. Cinc regidors no tenen fitxa publicada; en eixos casos no es mostra res abans que enllaçar la d'una altra persona.",
    'cargos.detalle.mandato.eyebrow': 'Suport electoral',
    'cargos.detalle.mandato.title': 'Amb quants vots va arribar la seua llista',
    'cargos.detalle.mandato.municipales': 'municipals',
    'cargos.detalle.mandato.note':
      'Percentatge de la candidatura, no de la persona: a les municipals es vota llista tancada.',
    'cargos.detalle.mandato.abstencion': 'abstenció',
    'cargos.detalle.pago.eyebrow': 'Retribució · acord plenari',
    'cargos.detalle.pago.title': 'Què cobra pel càrrec',
    'cargos.detalle.pago.sinDedicacion':
      "Sense dedicació retribuïda en l'acord de la corporació. Percep, si escau, assistències per sessió, que no consten en esta font.",
    'cargos.detalle.pago.fuente': 'Font: acord plenari de retribucions.',
    'cargos.detalle.area.eyebrow': 'Contractació de les seues àrees',
    'cargos.detalle.area.title': 'Diners adjudicats a les regidories que dirigeix',
    'cargos.detalle.area.intro':
      "Imports adjudicats per les àrees de què és responsable. És despesa de la regidoria, no de la persona: els contractes els adjudica l'òrgan de contractació de l'Ajuntament.",
    'cargos.detalle.area.note':
      'Només contractes ja adjudicats i de categoria atribuïble a una àrea; la xifra es queda curta abans que assignar un responsable equivocat.',
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

    'encaje.eyebrow': 'Encaix declarat',
    'encaje.field.formacion': 'Formació',
    'encaje.field.experiencia': 'Experiència',
    'encaje.value.relacionada': 'relacionada',
    'encaje.value.sin-relacion-declarada': 'sense relació declarada',
    'encaje.value.no-consta': 'no consta',
    'encaje.respaldo.autodeclarada':
      'El que ací es cita procedeix del CV que publica la mateixa persona; cap font independent no ho corrobora.',
    'encaje.respaldo.corroborada':
      'El que ací es cita ho avala a més alguna font independent de la persona.',
    'encaje.respaldo.discrepancia-documentada':
      'El que ací es cita arrossega una discrepància documentada sense resoldre.',
    'encaje.respaldo.mark.autodeclarada': 'autodeclarada',
    'encaje.respaldo.mark.corroborada': 'corroborada',
    'encaje.respaldo.mark.discrepancia-documentada': 'discrepància documentada',
    'encaje.aviso.label': 'Advertiment de la biografia',
    'encaje.aviso.contradice': 'contradicció sense resoldre',
    'encaje.aviso.corrobora': 'una altra font ho confirma',
    'encaje.aviso.matiza': 'matís',
    'encaje.aviso.area':
      'Les seues àrees delegades han canviat durant el mandat; aquesta fitxa pot referir-se a una àrea que ja no porta.',
    'encaje.card.gaps': 'què falta',
    'encaje.card.law': 'què exigeix la llei',
    'encaje.sinDelegacion.label': 'Sense delegació d’àrea',
    'encaje.sinDelegacion.note':
      'No dirigeix cap regidoria, així que no hi ha àrea amb què comparar. El bloc en blanc reflecteix qui governa, no qui està format.',
    'encaje.matrix.title': 'Què declara per a cada àrea que dirigeix',
    'encaje.matrix.intro':
      'Àrea per àrea, si el que declara al seu CV publicat guarda relació amb la matèria. No és una qualificació: no hi ha nota, ni suma, ni ordre. «No consta» vol dir que la font publicada no ho recull.',
    'encaje.matrix.dept': 'Veure departament',
    'encaje.matrix.signed': 'Revisat i signat per',
    'encaje.ley.eyebrow': 'Requisits legals',
    'encaje.ley.title': 'Què exigeix la llei per a cada lloc',
    'encaje.ley.titulacion': 'Titulació exigida',
    'encaje.ley.ninguna': 'cap',
    'departamentos.encaje':
      'De {cargos} regidories amb delegació, en {conFormacion} el responsable declara formació del camp de l’àrea i en {sinRelacion} el que declara correspon a una altra matèria.',

    'departamentos.eyebrow': 'Rendició de comptes',
    'departamentos.title': 'Departaments · compromisos i terminis',
    'departamentos.subtitle':
      'Seguiment per regidoria dels acords aprovats en ple i de les promeses amb termini. Les votacions transcrites són el fet primari; les promeses són secundàries.',
    'departamentos.card.responsable': 'Responsable',
    'departamentos.card.sinResponsable': 'Sense regidor/a assignat',
    'departamentos.card.votes': 'Vots',
    'departamentos.card.aprobados': 'Aprovats',
    'departamentos.card.vencidos': 'Terminis vençuts',
    'departamentos.card.verResponsable': 'Veure responsable',
    'departamentos.card.contratacion': 'Contractació',
    'departamentos.sinConcejalia': 'sense regidoria assignada',
    'departamentos.plazoVencido': 'termini vençut',
    'departamentos.card.contratos': 'contractes',
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

    // Accessibilitat
    'a11y.skipToContent': 'Saltar al contingut',
    'a11y.railLabel': 'Seccions',
    'a11y.editorialLabel': 'El Mirador · butlletí cívic',
    'a11y.mainLabel': 'Mapa i butlletí',
    'a11y.kpiLabel': 'Indicadors del municipi',

    // Portada ("El Mirador")
    'landing.masthead.kicker': 'CivicPulse · Butlletí',
    'landing.masthead.title': 'El Mirador',
    'landing.masthead.tagline': 'Diari cívic · Riba-roja de Túria',
    'landing.queja.kicker': 'Veu ciutadana · canal directe',
    'landing.queja.title': 'Denuncia un clot en 10 segons.',
    'landing.queja.body1': 'Obri el bot de Telegram, envia',
    'landing.queja.body2':
      ", adjunta foto i ubicació. Si 10 veïns la recolzen, entra al Registre Electrònic de l'Ajuntament com a sol·licitud oficial. Rellotge legal públic, sense cost, sense dades personals publicades.",
    'landing.queja.cta': 'Obrir el bot →',
    'landing.queja.privacy': 'Com protegim les teues dades',
    'landing.section.reportajes': 'Reportatges · CivicPulse',
    'landing.section.pleno': 'Ple municipal',
    'landing.section.promesas': 'Seguiment de promeses',
    'landing.section.rendicion': 'Retiment de comptes per regidoria',
    'landing.section.prensa': 'Premsa',
    'landing.section.contratos': 'Contractes adjudicats',
    'landing.section.empleo': 'Ocupació · Agència de Col·locació',
    'landing.section.eventos': 'Pròxims esdeveniments',
    'landing.section.participa': 'Participació ciutadana',
    'landing.reportajes.all': 'Tots els reportatges →',
    'landing.reportajes.piece': 'peça',
    'landing.reportajes.pieces': 'peces',
    'landing.reportajes.correction': 'correcció publicada',
    'landing.reportajes.corrections': 'correccions publicades',
    'landing.alcalde.role': 'Alcalde',
    'landing.empleo.all': 'Veure totes les ofertes →',
    'landing.promesas.blurb':
      'Compromisos públics documentats amb cita verbatim i font primària. Sense judicis automàtics de compliment.',
    'landing.promesas.cta': 'Veure el tracker complet →',
    'landing.rendicion.blurb':
      "Creua vots de ple, promeses electorals i queixes ciutadanes per regidoria. Un termini vençut es marca com a avís editorial — l'estat mai es modifica de manera automàtica.",
    'landing.rendicion.cta': 'Veure el tauler per departament →',
    'landing.escanos': 'escons',
    'landing.titulares': 'titulars',
    'landing.medios': 'mitjans',
    'landing.ofertas': 'ofertes',
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
