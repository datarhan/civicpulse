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
// Exportado para que `tests/i18n-catalogue.test.ts` lo LEA en vez de recitarlo:
// una copia en la prueba se queda verde mientras la de producción se mueve.
export const CATALOGUE = {
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
    'nav.eficiencia': 'Eficiencia',
    'nav.gestion': 'Gestión',
    'eficiencia.eyebrow': 'Ayuntamiento · coste efectivo de los servicios',
    'eficiencia.title': '¿Cuánto cuesta y qué se obtiene?',
    'eficiencia.intro':
      'Lo que cada servicio municipal costó, dividido entre lo que produjo, y dónde queda eso entre municipios valencianos de tamaño parecido. No hay nota global ni ranking: cada indicador va con su fuente, su modo de gestión y sus salvedades.',
    'eficiencia.cobertura.titulo': 'Qué cubre esta página',
    'eficiencia.cobertura.conRatio': 'con coste y unidad declarados',
    'eficiencia.cobertura.concesion': 'en concesión (el coste no lo soporta el ayuntamiento)',
    'eficiencia.cobertura.sinUnidad': 'sin unidad física declarada',
    'eficiencia.cobertura.sinCoste': 'sin coste utilizable',
    'eficiencia.cobertura.noSePresta': 'no se prestan',
    'eficiencia.pares.ver': 'Ver los municipios comparados',
    'eficiencia.pares.nota':
      'Sólo se compara contra municipios que prestan el servicio del MISMO modo de gestión y que declaran las dos cifras.',
    'eficiencia.pares.municipio': 'Municipio',
    'eficiencia.pares.poblacion': 'Población',
    'eficiencia.pares.valor': 'Coste unitario',
    'eficiencia.tier.input': 'precio',
    'eficiencia.tier.carga': 'carga de trabajo',
    'eficiencia.tier.output': 'producto',
    'eficiencia.tier.outcome': 'resultado',
    'eficiencia.pares.atipico': 'fuera de un orden de magnitud',
    'eficiencia.competencia.eyebrow': 'Competencia delegada',
    'eficiencia.competencia.editorial': 'La atribución la hacemos nosotros — por qué',
    'eficiencia.empty': 'Todavía no hay indicadores calculados.',
    'eficiencia.subnav.aria': 'Secciones de la página',
    'eficiencia.subnav.lectura': 'Lectura',
    'eficiencia.subnav.cobertura': 'Cobertura',
    'eficiencia.subnav.servicios': 'Servicios',
    'eficiencia.subnav.declaracion': 'Declaración',
    'eficiencia.subnav.hallazgos': 'Hallazgos',
    'eficiencia.subnav.preguntas': 'Preguntas',
    'eficiencia.preguntas.titulo': 'Preguntas registradas',
    'eficiencia.preguntas.porque': 'Se pregunta porque:',
    'eficiencia.preguntas.verBase': 'ver la cifra →',
    'eficiencia.preguntas.replica':
      'Derecho de réplica abierto para las instituciones destinatarias — la vía:',
    'eficiencia.preguntas.replicaLink': 'aviso legal',
    'empleoPublico.eyebrow': 'Ayuntamiento · procesos selectivos',
    'empleoPublico.title': 'Empleo público',
    'empleoPublico.intro1':
      'Procesos selectivos del propio Ayuntamiento de Riba-roja de Túria — oposiciones, bolsas de trabajo y estabilización. Distinto de las ofertas de la Agència de Col·locació (ver ',
    'empleoPublico.intro2': '). Fuente: portal municipal.',
    'empleoPublico.empty': 'No hay procesos selectivos publicados ahora mismo.',
    'nav.laboratorio': 'Laboratorio',
    'nav.nosotros': 'Quiénes somos',
    'nav.despiece': 'Despiece (dev)',
    'nav.agentes': 'Periodistas',
    'nav.frontera': 'Frontera',
    'nav.costeEsperado': 'Coste esperado',
    'nav.cobertura': 'Cobertura',
    'nav.section': 'Navegación',
    'nav.curator': 'Curator (dev)',

    // Barra de secciones de la portada (direction-d/BarraSecciones.jsx): los
    // cinco grupos, su lema y la frase de cada sección, que salen de NAV_GROUPS
    // y del `descKey` de cada entrada de src/nav.js. La frase dice PARA QUÉ
    // sirve la sección y no lleva cifras: una cifra escrita aquí envejece sola.
    'nav.grupo.gobierno': 'Gobierno',
    'nav.grupo.gobierno.lede': 'quién decide',
    'nav.grupo.dinero': 'Dinero',
    'nav.grupo.dinero.lede': 'cuánto, en qué y a quién',
    'nav.grupo.vigilancia': 'Vigilancia',
    'nav.grupo.vigilancia.lede': 'qué cambia y qué se coteja',
    'nav.grupo.ciudadania': 'Ciudadanía',
    'nav.grupo.ciudadania.lede': 'qué puedes hacer',
    'nav.grupo.laboratorio': 'Laboratorio',
    'nav.grupo.laboratorio.lede': 'datos y experimentos',
    'nav.grupo.proyecto': 'Sobre CivicPulse',
    // El chip «Hoy» de la cabecera y su detalle. Los rótulos del tiempo y del
    // aire ya viven aquí abajo —estaban escritos dentro de sus hooks— y ningún
    // globo del mapa los consume.
    'vivo.cerrar': 'Cerrar el detalle',
    // El tiempo y el aire, que vivían escritos dentro de los hooks y por eso la
    // portada en valencià los pintaba en castellano. Ninguna lleva hueco, así
    // que se pueden buscar por código: `t(`vivo.wmo.${codigo}`)`.
    'vivo.wmo.0': 'Despejado',
    'vivo.wmo.1': 'Mayormente despejado',
    'vivo.wmo.2': 'Parcialmente nublado',
    'vivo.wmo.3': 'Nublado',
    'vivo.wmo.45': 'Niebla',
    'vivo.wmo.48': 'Niebla helada',
    'vivo.wmo.51': 'Llovizna ligera',
    'vivo.wmo.53': 'Llovizna',
    'vivo.wmo.55': 'Llovizna intensa',
    'vivo.wmo.61': 'Lluvia ligera',
    'vivo.wmo.63': 'Lluvia',
    'vivo.wmo.65': 'Lluvia intensa',
    'vivo.wmo.71': 'Nieve ligera',
    'vivo.wmo.73': 'Nieve',
    'vivo.wmo.75': 'Nieve intensa',
    'vivo.wmo.80': 'Chubascos',
    'vivo.wmo.81': 'Chubascos fuertes',
    'vivo.wmo.82': 'Aguacero violento',
    'vivo.wmo.95': 'Tormenta',
    'vivo.wmo.96': 'Tormenta con granizo',
    'vivo.wmo.variable': 'Variable',
    'vivo.aqi.buena': 'Buena',
    'vivo.aqi.razonable': 'Razonable',
    'vivo.aqi.moderada': 'Moderada',
    'vivo.aqi.mala': 'Mala',
    'vivo.aqi.muyMala': 'Muy mala',
    'vivo.aqi.extrema': 'Extremadamente mala',
    // La ausencia tiene nombre propio: un «—» donde va una banda se lee como
    // medición, y eso ya publicó un chip «AQI – —» en la portada.
    'vivo.aqi.sinDato': 'sin lectura',
    // El chip único. Los dos huecos los rellena quien pinta, y
    // `i18n-catalogue.test.ts` exige que los rellene LOS DOS: una cadena con
    // «{m}» sin sustituir ya se publicó una vez en /empleo.
    // Una plantilla por combinación, en vez de una rellenada a medias: dejar
    // «{t}» o «{m}» sin sustituir es literalmente lo que /empleo publicó una vez
    // («sobre 24 de {total} ofertas»). El metro casi nunca falta —`useNextMetro`
    // es puro— pero «casi» no es «nunca», y con `m: ''` el chip decía «L9  ».
    'vivo.hoy.chip': 'Hoy · {t}° · L9 {m}',
    'vivo.hoy.chip.sinTiempo': 'Hoy · L9 {m}',
    'vivo.hoy.chip.sinMetro': 'Hoy · {t}°',
    'vivo.hoy.chip.solo': 'Hoy',
    // La espera, con su palabra. El chip decía «L9 0 min» donde el panel dice
    // «ahora», y a las 22:52 «L9 419 min» sin contar que ese tren es de mañana.
    'vivo.hoy.espera': '{m} min',
    'vivo.hoy.ahora': 'ahora',
    'vivo.hoy.manana': '{m} min (mañana)',
    // El rótulo de la fila del panel, que era un «Hoy» a pelo en el código y se
    // leía en castellano justo debajo de «Hui a Riba-roja».
    'vivo.fila.hoy': 'Hoy',
    'vivo.fuente.transcrita': 'FGV · fgv.es (horario transcrito)',
    'vivo.hoy.aria': 'El tiempo, el aire y el metro de hoy — abrir el detalle',
    'vivo.hoy.titulo': 'Hoy en Riba-roja',
    'vivo.hoy.tiempo': 'Tiempo',
    'vivo.hoy.aire': 'Aire',
    'vivo.hoy.metro': 'Metro',
    // El resto del panel, que se quedó en castellano al mudar las etiquetas de
    // arriba (#19): los rótulos de fila, los valores que llevan palabra, los pies
    // de cada fuente y las frases del pie del metro, que arma una función fuera
    // del JSX. Las siglas —EAQI, PM₂.₅, NO₂…— y «FGV GTFS» no están aquí a
    // propósito: son contenido de dato y se quedan en su idioma.
    'vivo.fila.sensacion': 'Sensación térmica',
    'vivo.fila.humedad': 'Humedad',
    'vivo.fila.viento': 'Viento',
    'vivo.fila.lluvia': 'Prob. lluvia (hoy)',
    'vivo.fila.amanece': 'Amanece',
    'vivo.fila.anochece': 'Anochece',
    'vivo.fila.manana': 'Mañana',
    'vivo.fila.proximo': 'Próximo tren',
    'vivo.fila.faltan': 'Faltan',
    'vivo.fila.sentido': 'Sentido',
    'vivo.fila.estacion': 'Estación',
    'vivo.fila.fuente': 'Fuente',
    'vivo.aire.serie': 'PM₂.₅ · últimas 24 h',
    'vivo.fuente.tiempo': 'Open-Meteo · actualizado cada 10 min',
    'vivo.fuente.aire': 'Open-Meteo Air Quality · EAQI (EEA) · actualizado cada 15 min',
    'vivo.metro.manana': '{hora} (mañana)',
    'vivo.metro.hacia': 'Hacia {destino}',
    'vivo.metro.estacion': '{estacion} (terminus)',
    'vivo.metro.aviso':
      'Pulsa cualquier estación de L9 en el mapa para ver los próximos trenes en ambos sentidos.',
    'vivo.metro.oficial': 'Ver horario oficial →',
    'vivo.horario.transcrito': 'Horario transcrito de fgv.es',
    'vivo.horario.valido': '{fuente} · válido hasta {fecha}',
    'vivo.horario.referencia': '{fuente} · horario de REFERENCIA, no vigente; confirma en fgv.es',
    'nav.desc.cambios': 'Lo que ha cambiado en los últimos días',
    'nav.desc.cargos': 'Concejales, áreas y retribuciones',
    'nav.desc.presup': 'Lo aprobado, lo ejecutado, contratos y deuda',
    'nav.desc.eficiencia':
      'Coste unitario de los servicios, frente a municipios de tamaño parecido',
    'nav.desc.gestion': 'Plazos de pago, concurrencia en contratos y ejecución',
    'nav.desc.plenos': 'Sesiones, órdenes del día y votaciones',
    'nav.desc.promesas': 'Compromisos por partido, cada uno con su fuente',
    'nav.desc.departamentos': 'Acuerdos y plazos, concejalía a concejalía',
    'nav.desc.hallazgos': 'Fichas sobre lo dicho en pleno, con sus documentos',
    'nav.desc.reportajes': 'Investigaciones largas, cada afirmación con su fuente',
    'nav.desc.declaraciones':
      'Lo afirmado en pleno, contrastado con datos abiertos cuando se puede',
    'nav.desc.datos': 'Todo lo que alimenta el sitio, descargable',
    'nav.desc.quejas': 'Las quejas vecinales, agregadas y anónimas',
    'nav.desc.empleo': 'Ofertas de la Agència de Col·locació',
    'nav.desc.empleoPublico': 'Oposiciones y bolsas del Ayuntamiento',
    'nav.desc.laboratorio': 'Afirmaciones de prensa frente a los datos públicos',
    'nav.desc.frontera': 'Análisis envolvente de datos, y lo que no mide',
    'nav.desc.costeEsperado': 'Qué coste cabría esperar según la población',
    'nav.desc.cobertura': 'Qué podemos comprobar y qué no',
    'nav.desc.agentes': 'Informes de un agente de IA, revisados antes de publicar',
    'nav.desc.curator': 'Mesa de curación (sólo en desarrollo)',
    'nav.desc.despiece': 'De dónde sale cada dato (sólo en desarrollo)',
    'secciones.indice': 'Índice',
    'secciones.indice.titulo': 'Todas las secciones',
    'secciones.queja': 'Poner una queja',
    'secciones.queja.nota': '(abre Telegram en otra pestaña)',

    // Reportajes (índice de piezas long-form)
    'reportajes.eyebrow': 'CivicPulse · investigaciones de datos',
    'reportajes.title': 'Reportajes',
    'reportajes.intro':
      'Piezas largas a partir del registro público: cifras congeladas en el momento de la publicación y cada afirmación con su fuente.',
    'reportajes.read': 'Leer el reportaje →',
    // El armazón de cada pieza (components/reportajes/Pieza.jsx): el índice de
    // apartados, leído de sus encabezados, y el pie con las demás piezas.
    'reportajes.indice': 'En esta pieza',
    'reportajes.indice.apartados': '{n} apartados',
    'reportajes.mas': 'Más reportajes',
    'reportajes.todos': 'Todos los reportajes →',

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
    // La fecha de la tarjeta va ROTULADA. Desnuda, y con una píldora «Cierra en
    // 3 días» justo encima, se lee como el plazo: `ING climatización y frio
    // industrial` se publicó el 24-05-2026 y cierra el 24-09-2026, y la tarjeta
    // enseñaba «Cierra en 3 días» sobre «24 may 2026».
    'empleo.card.publicada': 'publicada {fecha}',
    'empleo.kpi.closing': 'Cierran ≤14 días',
    'empleo.kpi.of': 'de',
    'empleo.kpi.ofShown': 'de {n} mostradas',
    'empleo.kpi.vehicle': 'requieren vehículo propio',
    'empleo.chart.byMonth': 'Ofertas por mes',
    'empleo.chart.byContract': 'Tipo de contrato',
    'empleo.chart.byMunicipio': 'Dónde',
    'empleo.stats.thin': 'Pocos datos',
    // Dos cosas, y la segunda es la que cuadra la página: cuántas quedan fuera
    // del gráfico, y cuántas de ésas cuenta el KPI «En Riba-roja», que lee la
    // localidad del listado y no la ficha. Con las dos, 26 + 12 = 38 se puede
    // seguir; sin la segunda, el lector tiene que adivinar.
    'empleo.chart.coverage':
      '{n} ofertas no traen municipio en su ficha y quedan fuera de este gráfico',
    'empleo.chart.coverage.enRiba':
      ' — de ellas, {enRiba} sí dicen Riba-roja de Túria en el listado, y son las que el recuento de arriba suma y este gráfico no',
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
    'map.layer.money': 'Contratos situados',
    'map.layer.obras': 'Obras 2019–2024',
    'map.layer.poi': 'Servicios',
    'map.layer.quejas': 'Quejas',
    'map.layer.flood': 'Riesgo inundación',
    'map.layer.incendios': 'Incendios forestales',
    'map.quejas.title': 'Quejas por barrio',
    'map.quejas.crit': 'silencio alto',
    'map.quejas.warn': 'silencio moderado',
    'map.quejas.ok': 'mayoría resueltas',
    'map.quejas.civic': 'en curso',
    'map.quejas.radius': 'radio ∝ nº de quejas',
    'map.quejas.cobertura': 'sobre {q} queja(s) en {b} barrio(s)',
    'map.quejas.escalaParcial': 'los demás niveles de la escala no se dan hoy',
    'map.estacion.terminal': 'Terminus',
    'map.estacion.aprox': 'aprox',
    'map.estacion.verEnMetrovalencia': 'ver horario en metrovalencia.es',
    'map.estacion.aproximado': 'Línea {linea} — horario aproximado (cada {min} min).',
    'map.estacion.linea': 'Línea {linea} — Metrovalencia (FGV).',
    'map.estacion.estimacion': 'Estimación a partir de fgv.es',
    'map.estacion.oficialLinea': 'Horario oficial {linea} →',
    'map.estacion.adif':
      'Estación sobre la línea de Adif (ferrocarril convencional). No forma parte de L9 Metrovalencia.',
    'map.estacion.adifOperador': 'Adif · Red convencional',
    'map.estacion.renfe': 'Horarios Renfe Cercanías València →',
    'map.estacion.redHorarios': 'Ver horarios en metrovalencia.es →',
    'map.money.title': 'Contratos situados',
    'map.money.dana': 'Solo DANA',
    'map.money.obras': 'Solo obras',
    // Neutras y compartidas: las usan el deslizador del dinero Y el de
    // incendios. Cuando decían «del gasto», el botón de incendios lo decía
    // también a quien usa lector de pantalla.
    'map.timeline.play': 'Reproducir la línea de tiempo',
    'map.timeline.pause': 'Pausar la línea de tiempo',
    // «obra acumulada» decía el rótulo, y la capa pinta TODO el gasto situado:
    // el filtro «Solo obras» nace apagado. Medido sobre tenders.json con los
    // predicados del repo, la obra es 185 filas y 17.475.488,67 € — el 14,1 %
    // de los 123,7 M€ que la línea de debajo pone como denominador. El trozo
    // situado tampoco es obra: de los 47 contratos con punto, 25 son obra, 13
    // servicios y 9 suministros. Ni el numerador ni el denominador lo eran.
    // Neutral en tipo, como el título del propio panel («Gasto situado»), que
    // vale igual con el filtro puesto que sin él.
    'map.money.accum': 'adjudicado acumulado',
    'map.money.detalle': 'Detalle',
    'map.money.of': 'de',
    'map.money.coverage':
      'Sólo los contratos cuyo título nombra un lugar. El resto son servicios de ámbito municipal —la concesión del agua, la recogida de residuos, la limpieza viaria— adjudicados por todo su plazo y sin un punto en el mapa.',
    'map.poi.title': 'Servicios públicos',
    'map.poi.source': 'OpenStreetMap · datos abiertos',
    'map.flood.title': 'Riesgo de inundación',
    'map.flood.loading': 'cargando tramas…',
    'map.flood.error': 'el servicio del ICV no responde ahora mismo',
    'map.incendios.title': 'Incendios forestales',
    'map.incendios.serie': 'Serie de incendios',
    'map.incendios.sinIncendios': 'sin incendios',
    'map.incendios.acumulados': '{n} incendios acumulados desde {desde}',
    'map.incendios.tono.reciente': '−10 años',
    'map.incendios.tono.medio': '10-20',
    'map.incendios.tono.antiguo': '+20 años',
    'map.incendios.causaTitulo': 'Causa según el parte',
    'map.incendios.sobre': 'Sobre {n} partes con causa determinada',
    'map.incendios.noConsta': '; en otros {n} no consta',
    'map.incendios.resumen': '{n} incendios · {desde}–{hasta} · {ha} ha',
    'map.incendios.superficie':
      'La superficie es la de cada incendio completo, no sólo la parte que ardió dentro del término.',
    'map.incendios.cartografia.meses':
      'La cartografía del ICV llega a {hasta}: de los últimos meses no hay perímetros dibujados, ni constancia aquí de si hubo incendios.',
    'map.incendios.cartografia.anios':
      'La cartografía del ICV llega a {hasta}: de los últimos {n} años no hay perímetros dibujados, ni constancia aquí de si hubo incendios.',
    'map.incendios.fueraDelTermino.uno':
      'Otro incendio ({ha} ha) consta a nombre de Riba-roja pero la Generalitat lo dibuja fuera del término, así que no se pinta.',
    'map.incendios.fueraDelTermino.varios':
      'Otros {n} incendios ({ha} ha) constan a nombre de Riba-roja pero la Generalitat los dibuja fuera del término, así que no se pintan.',
    'map.incendios.contratosSinSituar':
      'El ayuntamiento tiene {n} contratos que hablan de incendios y ninguno se puede situar en el mapa: la prevención se contrata para todo el municipio y no nombra ningún paraje.',
    'map.poi.categoria.educacion': 'Educación',
    'map.poi.categoria.salud': 'Salud',
    'map.poi.categoria.verde': 'Zonas verdes',
    'map.poi.categoria.deporte': 'Deporte',
    'map.poi.categoria.cultura': 'Cultura',
    'map.money.slider': 'Línea de tiempo de los contratos situados por zona',
    'map.eventos.hoy': 'HOY EN RIBA-ROJA',
    'map.eventos.manana': 'MAÑANA EN RIBA-ROJA',
    'map.eventos.participa': 'participa ›',
    'participa.tipo.activity': 'Actividad',
    'participa.tipo.survey': 'Encuesta',
    'participa.tipo.other': 'Aviso',
    'participa.tipo.desconocido': 'Participación',
    'liveTicker.aria': 'Datos nacionales en directo',
    // La cinta de datos nacionales, entera (#38). Hasta entonces sólo su nombre
    // pasaba por aquí: «DIRECTO», cada serie, sus `aria-label`, los paneles y
    // «hace 3 h» seguían escritos a mano en castellano sobre la portada valenciana.
    'liveTicker.directo': 'DIRECTO',
    'liveTicker.luz': 'Luz PVPC',
    'liveTicker.luz.aria': 'Precio de la luz {valor} euros por kilovatio hora',
    'liveTicker.luz.curva': 'Curva 24h · €/kWh',
    'liveTicker.gasolina95': 'Gasolina 95',
    'liveTicker.gasolina95.aria': 'Gasolina 95 promedio {valor} euros por litro',
    'liveTicker.gasolina.estaciones': 'est.',
    'liveTicker.diesel': 'Diésel A',
    'liveTicker.diesel.aria': 'Diésel A promedio {valor} euros por litro',
    'liveTicker.euribor': 'Euribor 12m',
    'liveTicker.euribor.aria': 'Euribor 12 meses {valor} por ciento',
    'liveTicker.ipc': 'IPC España',
    'liveTicker.ipc.aria': 'IPC interanual España {valor} por ciento',
    'liveTicker.ipc.historia': 'IPC últimos 12 meses · %',
    'liveTicker.bce': 'BCE MRO',
    'liveTicker.bce.aria': 'Tipo principal del BCE {valor} por ciento',
    'liveTicker.aemet': 'AEMET Valencia',
    'liveTicker.aemet.aria': 'Alerta meteorológica AEMET nivel {nivel}',
    'liveTicker.aemet.nivel.amarillo': 'amarillo',
    'liveTicker.aemet.nivel.naranja': 'naranja',
    'liveTicker.aemet.nivel.rojo': 'rojo',
    'liveTicker.dgt': 'DGT tráfico',
    'liveTicker.dgt.incidencias': 'incid.',
    'liveTicker.dgt.aria': '{n} incidencias de tráfico en la zona',
    'liveTicker.dgt.aria.una': 'una incidencia de tráfico en la zona',
    'liveTicker.dgt.mas': '+{n} más',
    'liveTicker.noticia.aria': 'Noticia de {fuente}: {titulo}',
    'liveTicker.panel.cerrar': 'Cerrar',
    'liveTicker.panel.min': 'min',
    'liveTicker.panel.max': 'max',
    'liveTicker.panel.fuente': 'Fuente oficial →',
    'tiempo.ahora': 'ahora',
    'tiempo.haceMin': 'hace {n} min',
    'tiempo.haceHoras': 'hace {n} h',
    'tiempo.haceDias': 'hace {n} d',
    'contrato.relacion.zonaYMateria': 'misma zona y materia',
    'contrato.relacion.zona': 'misma zona',
    'contrato.relacion.materiaYFechas': 'misma materia y fechas próximas',
    'pleno.tipo.ordinario': 'Ordinario',
    'pleno.tipo.extraordinario': 'Extraordinario',
    'pleno.tipo.urgente': 'Urgente',
    'pleno.tipo.otro': 'Otro',
    'map.flood.nota':
      'Zonas oficiales de peligrosidad · {fuente} (Generalitat Valenciana / ICV). Tonos más intensos = mayor riesgo.',

    // Globos y rótulos flotantes del mapa. Estaban escritos a mano en cada
    // componente y la portada valenciana los pintaba en castellano; cada valor es
    // el texto exacto que ya pintaba su componente. «Población», «Quejas
    // ciudadanas», «días» y los tonos de salud no se repiten aquí: reutilizan
    // `eficiencia.pares.poblacion`, `quejas.title`, `empleo.days` y
    // `map.quejas.crit|warn|ok|civic`. Una frase, una traducción.
    'map.barrio.habitantes': '{n} hab.',
    'map.barrio.osm': 'Barrio OSM',
    'map.barrio.inversion': 'Inversión situada',
    'map.barrio.danaIncluida': 'incluye {importe} recuperación DANA',
    'map.barrio.sinObras': 'sin obras cuyo título nombre el barrio',
    'map.barrio.sinQuejas': 'sin quejas de vecinos',
    // Un nombre que se escribe igual en los dos idiomas («obra», «licitador»,
    // «adj.», «Causa») va solo en su nodo de texto: pegado a una cifra dentro de
    // una plantilla, tests/components/mapa-valencia.test.jsx no podría
    // distinguirlo de un rótulo sin traducir.
    'map.obras.una': 'obra',
    'map.obras.varias': 'obras',
    'map.quejas.una': '{n} queja',
    'map.quejas.varias': '{n} quejas',
    'map.lugar.street': 'Calle / camino',
    'map.lugar.poi': 'Equipamiento',
    'map.lugar.urbanizacion': 'Urbanización',
    'map.lugar.barrio': 'Barrio',
    'map.lugar.lote': 'Lote de: «{titulo}»',
    'map.lugar.pie': 'Solo obras cuyo título nombra una calle, zona o equipamiento · PLACSP/TED',
    'map.incendio.deAnyo': 'Incendio de {anyo}',
    'map.incendio.superficie': 'superficie del incendio completo',
    'map.incendio.atribuido':
      'Atribuido por la Generalitat a {municipio}; su perímetro entra en Riba-roja.',
    'map.incendio.detectado': 'Detectado',
    'map.incendio.extinguido': 'Extinguido',
    'map.incendio.sinFecha': 'sin fecha en el parte',
    'map.incendio.causaRotulo': 'Causa',
    'map.incendio.causaNoConsta': 'no consta en el parte',
    'map.incendio.reparto': 'Reparto',
    'map.incendio.repartoHa': '{arbolada} ha arboladas · {noArbolada} ha no arboladas',
    'map.incendio.parte': 'Parte {id} · {fuente}',
    'map.incendio.otroTermino': 'consta en otro término',
    // Una clave por valor del enum `CAUSAS`, el centinela incluido: el globo y la
    // leyenda no lo pintan como causa, pero el enum lo trae.
    'map.incendio.causa.intencionado': 'Intencionado',
    'map.incendio.causa.negligencia': 'Negligencia o accidente',
    'map.incendio.causa.rayo': 'Rayo',
    'map.incendio.causa.sinClasificar': 'Sin determinar',
    'map.obra.adjudicado': 'adj.',
    'map.obra.previsto': 'previsto',
    'map.obra.inicio': 'inicio {fecha}',
    'map.obra.ejecucion': 'ejecución {fecha}',
    'map.obra.baja': 'baja {pct}%',
    'map.obra.meses': '{n} meses',
    'map.obra.verFicha': 'Ver ficha ↗',

    // La tarjeta de contrato: el globo de un pin de dinero y /presupuesto. Los
    // estados son el vocabulario de `src/scraper/tenders.ts`, y `STATUS_LABEL`
    // lee de aquí su castellano, así que el listado de /presupuesto pinta lo que
    // pintaba; por qué cada estado se llama como se llama está contado en
    // useTenders.js. Tipos y procedimientos son los de Gobierto, y
    // tests/i18n-mapa-enums.test.ts exige una clave por cada valor que traiga
    // tenders.json: de ahí `special_administrative`, que sólo sale en las
    // licitaciones.
    'contrato.adjudicatario': 'Adjudicatario:',
    'contrato.baja': 'Baja de adjudicación (adjudicación vs licitación)',
    'contrato.sinFecha': 'sin fecha',
    'contrato.licitador': 'licitador',
    'contrato.licitadores': 'licitadores',
    'contrato.importeLicitacion': 'importe de licitación',
    'contrato.situadoPor': 'situado por «{lugar}»',
    'contrato.quejasRelacionadas': 'Quejas ciudadanas relacionadas',
    'contrato.estado.awarded': 'Adjudicado',
    'contrato.estado.formalized': 'Formalizado',
    'contrato.estado.void': 'Anulado',
    'contrato.estado.revoked': 'Renuncia',
    'contrato.estado.abandoned': 'Desistido',
    'contrato.estado.withdrawn': 'Retirado',
    'contrato.estado.provisionally_awarded': 'Provisional',
    'contrato.estado.in_progress': 'En curso',
    'contrato.estado.open': 'Abierto',
    'contrato.estado.evaluation': 'Valoración',
    'contrato.estado.pending': 'Pendiente',
    'contrato.estado.draft': 'Borrador',
    'contrato.estado.finalized': 'Finalizado',
    'contrato.estado.closed': 'Cerrado',
    'contrato.estado.unknown': 'Sin clasificar',
    'contrato.tipo.services': 'Servicios',
    'contrato.tipo.construction': 'Obras',
    'contrato.tipo.supplies': 'Suministros',
    'contrato.tipo.patrimonial': 'Patrimonial',
    'contrato.tipo.public_services_management': 'Gestión de servicios públicos',
    'contrato.tipo.special_administrative': 'Administrativo especial',
    'contrato.tipo.other': 'Otros',
    // La categoría con la que Gobierto publica cada contrato es un token en inglés
    // («architecture»), y la portada lo pintaba tal cual en los dos idiomas (#38).
    'contrato.categoria.construction': 'Construcción',
    'contrato.categoria.environment': 'Medio ambiente',
    'contrato.categoria.it': 'Informática',
    'contrato.categoria.health': 'Salud',
    'contrato.categoria.other': 'Otros',
    'contrato.categoria.transportation': 'Transporte',
    'contrato.categoria.architecture': 'Arquitectura',
    'contrato.categoria.culture': 'Cultura',
    'contrato.categoria.legal': 'Jurídico',
    'contrato.categoria.maintenance': 'Mantenimiento',
    'contrato.categoria.education': 'Educación',
    'contrato.categoria.catering': 'Restauración',
    'contrato.categoria.security': 'Seguridad',
    'contrato.categoria.industry': 'Industria',
    'contrato.categoria.energy': 'Energía',
    'contrato.categoria.agriculture': 'Agricultura',
    'contrato.categoria.textile': 'Textil',
    'contrato.categoria.real_estate': 'Inmobiliario',
    'contrato.categoria.audiovisual': 'Audiovisual',
    'contrato.categoria.furniture': 'Mobiliario',
    'contrato.categoria.print': 'Imprenta',
    'contrato.categoria.software': 'Software',
    'contrato.categoria.finance': 'Finanzas',
    'contrato.categoria.electrical': 'Material eléctrico',
    'contrato.categoria.telecom': 'Telecomunicaciones',
    'contrato.categoria.public_services': 'Servicios públicos',
    'contrato.procedimiento.open': 'Abierto',
    'contrato.procedimiento.open_simplified': 'Abierto simplificado',
    'contrato.procedimiento.restricted': 'Restringido',
    'contrato.procedimiento.negotiated_without_publicity': 'Negociado sin publicidad',
    'contrato.procedimiento.negotiated_with_publicity': 'Negociado con publicidad',
    'contrato.procedimiento.minor_contract': 'Contrato menor',
    'contrato.procedimiento.based_on_agreement': 'Basado en acuerdo marco',

    // Common
    'common.loading': 'Cargando…',
    'common.noData': 'Sin datos',
    'common.compartirWhatsApp': 'Compartir en WhatsApp',
    'dataAsOf.datos': 'Datos',
    'dataAsOf.sinFecha': 'sin fecha de generación',
    'paginacion.aria': 'Paginación del {etiqueta}',
    'paginacion.anterior.aria': 'Página anterior del {etiqueta}',
    'paginacion.siguiente.aria': 'Página siguiente del {etiqueta}',
    'paginacion.anterior': '← Anterior',
    'paginacion.siguiente': 'Siguiente →',

    // Declaraciones page (global verified-claim browse)
    'declaraciones.eyebrow': 'Verificación de declaraciones',
    'declaraciones.title': 'Declaraciones en pleno',
    'declaraciones.subtitle':
      'Cada afirmación, promesa o acusación detectada en los plenos municipales, cruzada contra los datos abiertos publicados (PLACSP, BDNS, presupuesto, promesas electorales). Atribución a nivel de grupo. El veredicto de cada fila lo pone un cotejo automático, salvo en las que llevan la marca «corregido por un curador», donde una persona lo ha rectificado a la baja: las declaraciones sin atribuir o sin evidencia se mantienen visibles porque se han hecho, y ninguna de ellas se convierte en un hallazgo editorial sin que una persona lo firme.',
    'declaraciones.stat.total': 'Total',
    'declaraciones.stat.conEvidencia': 'Contrastadas',
    'declaraciones.filter.verdict': 'Verdicto',
    'declaraciones.filter.bloc': 'Grupo',
    'declaraciones.filter.topic': 'Tema',
    'declaraciones.filter.todas': 'Todas',
    'declaraciones.filter.todos': 'Todos',
    'declaraciones.filter.conEvidencia': 'Contrastadas',
    'declaraciones.filter.atribuidas': 'Atribuidas',
    'declaraciones.filter.sinCorpus': 'Sin corpus que consultar',
    'declaraciones.filter.comprobadoSinHallar': 'Comprobada, no aparece',
    'declaraciones.split.titulo': 'Por qué «sin datos»',
    'declaraciones.split.cuerpo':
      'No es lo mismo haber comprobado y no encontrar nada que no haber tenido con qué comprobar. Lo segundo no dice nada sobre la declaración: dice que aún no tenemos ese corpus.',
    'declaraciones.split.sinCorpus': 'sin corpus que consultar',
    'declaraciones.split.comprobadoSinHallar': 'comprobadas, no aparecen',
    'declaraciones.search.placeholder': 'Buscar en el texto literal…',
    'declaraciones.matchCount': 'declaraciones coinciden con los filtros',
    'declaraciones.loadMore': 'Mostrar más',
    'declaraciones.empty': 'Ninguna declaración coincide con los filtros actuales.',

    // Page eyebrows + titles
    'cargos.eyebrow': 'Rendición de cuentas',
    'cargos.title': 'Cargos y departamentos',
    'plenos.eyebrow': 'Órganos de gobierno',
    'plenos.title': 'Plenos municipales',
    // El índice de sesiones (/plenos): la entradilla, la escalera de cobertura, la
    // tabla con sus filtros, las tarjetas de votaciones y declaraciones y el reparto
    // por área. Las retiradas de votaciones, por alcance, en singular y en plural.
    'plenos.indice.lede.celebradas': 'El ayuntamiento ha celebrado {sesiones} desde el {fecha}.',
    'plenos.indice.lede.celebradasSinFecha': 'El ayuntamiento ha celebrado {sesiones}.',
    'plenos.indice.nSesiones': '{n} sesiones',
    'plenos.indice.lede.cobertura':
      'De ésas, tenemos el orden del día de {agenda}, declaraciones extraídas de {decl} y {votos}.',
    'plenos.indice.lede.votos': 'votaciones transcritas de {n}',
    'plenos.indice.lede.aviso':
      'Lo que esta página no cuenta no es que no ocurriera: es que aún no lo hemos leído.',
    'plenos.indice.actaEnRegmeet':
      'Cada sesión enlaza a su acta en regmeet.com, el gestor del propio ayuntamiento.',
    'plenos.indice.comoSeProcesa': 'Cómo se procesa una sesión →',
    'plenos.indice.fuente':
      'Fuente: actas y vídeos publicados por el Ayuntamiento de Riba-roja de Túria en regmeet.com.',
    'plenos.indice.ultimaSesion': 'Última sesión recogida: {fecha}.',
    'plenos.indice.enlace.participacion': 'Participación ciudadana →',
    'plenos.indice.enlace.hallazgos': 'Hallazgos →',
    'plenos.indice.enlace.metodologia': 'Metodología →',
    'plenos.indice.deTotal': '{n} de {total}',
    'plenos.indice.escalera.titulo': 'Qué tenemos del acta',
    'plenos.indice.escalera.sesiones': 'Sesiones celebradas',
    'plenos.indice.escalera.orden': 'Con orden del día extraído',
    'plenos.indice.escalera.declaraciones': 'Con declaraciones extraídas',
    'plenos.indice.escalera.votaciones': 'Con votaciones transcritas',
    'plenos.indice.escalera.nota':
      'Los cuatro escalones se cuentan sobre las mismas {n} sesiones, pero no están anidados:',
    'plenos.indice.escalera.declSinOrden.uno':
      'una sesión tiene declaraciones extraídas sin su orden del día',
    'plenos.indice.escalera.declSinOrden.varios':
      '{n} sesiones tienen declaraciones extraídas sin su orden del día',
    'plenos.indice.escalera.votosSinDecl.uno': 'una tiene votaciones sin declaraciones',
    'plenos.indice.escalera.votosSinDecl.varios': '{n} tienen votaciones sin declaraciones',
    'plenos.indice.escalera.ambas': '{a}, y {b}',
    'plenos.indice.escalera.sueltas':
      '{lista}. El orden del día lo publica regmeet y las declaraciones salen de la transcripción, así que una sesión puede tener lo segundo sin lo primero.',
    'plenos.indice.escalera.anidadas':
      'hoy cada escalón resulta ser un subconjunto del anterior, pero es una coincidencia de la cobertura, no una garantía: el orden del día lo publica regmeet y las declaraciones salen de la transcripción.',
    'plenos.indice.escalera.sube':
      'La cobertura sube cuando se transcribe una sesión antigua, no cuando el pleno se reúne.',
    'plenos.indice.columna.fecha': 'Fecha',
    'plenos.indice.columna.tipo': 'Tipo',
    'plenos.indice.columna.puntos': 'Puntos del orden del día',
    'plenos.indice.columna.decl': 'Declaraciones',
    'plenos.indice.columna.votos': 'Votaciones',
    'plenos.indice.columna.hall': 'Hallazgos',
    'plenos.indice.celda.puntos': 'Puntos',
    'plenos.indice.sinExtraer': 'sin extraer',
    'plenos.indice.sinTranscribir': 'sin transcribir',
    'plenos.indice.tabla.eyebrow': 'Las sesiones · {n}',
    'plenos.indice.tabla.titulo': 'Una fila por sesión, de la última a la primera',
    'plenos.indice.filtros.aria': 'Filtrar sesiones',
    'plenos.indice.filtros.ver': 'Ver',
    'plenos.indice.filtro.todas': 'Todas',
    'plenos.indice.filtro.votos': 'Con votaciones',
    'plenos.indice.filtro.declaraciones': 'Con declaraciones',
    'plenos.indice.filtro.sin-orden': 'Sin orden del día',
    'plenos.indice.filtro.no-ordinarias': 'Extraordinarias y urgentes',
    'plenos.indice.anio.deSesiones': '{n} de {total} sesiones',
    'plenos.indice.filtroVacio': 'Ninguna sesión cumple ese filtro.',
    'plenos.indice.leyenda.puntos': 'puntos del orden del día, a escala común',
    'plenos.indice.leyenda.sinExtraer':
      'la sesión se celebró; esa parte del acta no está procesada',
    'plenos.indice.leyenda.cero': 'procesada, y nada publicado en esa columna',
    'plenos.indice.leyenda.noMide': 'Ninguna cifra de esta tabla mide la actividad del pleno.',
    'plenos.indice.votos.eyebrow': 'Votaciones transcritas · {n} sesiones de {total}',
    'plenos.indice.votos.titulo': 'De {total} votaciones registradas, {aprobado} se aprobaron',
    'plenos.indice.votos.desenlace.aprobado': 'aprobado',
    'plenos.indice.votos.desenlace.rechazado': 'rechazado',
    'plenos.indice.votos.desenlace.retirado': 'retirado',
    'plenos.indice.votos.desenlace.aplazado': 'aplazado',
    'plenos.indice.votos.desglose':
      'Los desgloses por grupo salen de una {transcripcion} del vídeo, no del acta: el resultado lo publica el ayuntamiento, el reparto de votos lo infiere el sistema. Por eso cada uno lleva su procedencia por separado.',
    'plenos.indice.votos.transcripcion': 'transcripción automática',
    'plenos.indice.votos.retirada':
      'Cuando la fuente no sostiene lo que se publicó, se retira la parte que no aguanta —el registro entero, el reparto por grupos o sólo el plazo— y se dice, en vez de corregirlo en silencio.',
    'plenos.indice.decl.extraidas': 'Extraídas de la transcripción',
    'plenos.indice.decl.extraidas.nota': 'en {n} sesiones con transcripción',
    'plenos.indice.decl.retenidas': 'Retenidas por la puerta editorial',
    'plenos.indice.decl.retenidas.nota': 'acusaciones públicas sin contrastar: no se publican aquí',
    'plenos.indice.decl.sinProcedencia': 'Retenidas por falta de procedencia',
    'plenos.indice.decl.sinProcedencia.nota':
      'su literal no consta en ninguna transcripción nuestra: no se publican',
    'plenos.indice.decl.sinDatos': 'Publicadas sin datos que las contrasten',
    'plenos.indice.decl.sinDatos.nota': 'ni confirmadas ni desmentidas',
    'plenos.indice.decl.contrastadas': 'Parciales o verificadas',
    'plenos.indice.decl.contrastadas.nota': 'lo único que cotejó un documento municipal',
    'plenos.indice.decl.eyebrow': 'Declaraciones extraídas · {n} sesiones',
    'plenos.indice.decl.titulo': '{extraidas} declaraciones, {verificado} verificadas',
    'plenos.indice.decl.sinDatosNota':
      'Un «sin datos» no desmiente nada: dice que no encontramos ningún documento municipal que hable de eso. De los {sinDatos}, {sinCorpus} y {comprobado} se comprobaron sin hallar nada.',
    'plenos.indice.decl.sinCorpus': '{n} no tenían corpus donde buscar',
    'plenos.indice.decl.enlace': 'Verificación de declaraciones, todas las sesiones →',
    'plenos.indice.reparto.eyebrow': 'Reparto por área · {puntos} puntos de {sesiones} sesiones',
    'plenos.indice.reparto.titulo': 'Qué áreas llevan el orden del día',
    'plenos.indice.reparto.enlace': 'Ver el panel por departamento →',
    'plenos.indice.reparto.nota':
      'Son los puntos de las {sesionesConOrden}, no de las {total}. Y sólo {con} de los {puntos} puntos llevan área asignada. Un área con pocos puntos puede tener mucha actividad en sesiones que aún no hemos procesado: este reparto describe nuestra cobertura tanto como el trabajo del pleno.',
    'plenos.indice.reparto.sesionesConOrden': '{n} sesiones con orden del día extraído',
    'plenos.retirada.record.uno': 'registro',
    'plenos.retirada.record.varios': 'registros',
    'plenos.retirada.breakdown.uno': 'desglose',
    'plenos.retirada.breakdown.varios': 'desgloses',
    'plenos.retirada.plazo.uno': 'plazo',
    'plenos.retirada.plazo.varios': 'plazos',
    'plenos.retirada.frase.uno': '{lista} retirado',
    'plenos.retirada.frase.varios': '{lista} retirados',
    'promesas.eyebrow': 'Transparencia electoral',
    'promesas.title': 'Promesas por partido',
    'datos.eyebrow': 'Base estadística',
    'datos.title': 'Datos abiertos',
    'presup.eyebrow': 'Hacienda pública',
    'presup.title': 'Presupuesto municipal',
    'quejas.eyebrow': 'Voz ciudadana',
    'quejas.title': 'Quejas ciudadanas',
    // El cruce por barrio. La columna de euros son las zonas de
    // `tender-geo.json`: importe de ADJUDICACIÓN sin IVA, los mismos euros que
    // la portada rotula «adjudicado acumulado» y /presupuesto «adjudicado sin
    // IVA». Se llamaba «gasto situado» porque esta prosa vivía escrita a mano
    // dentro del componente, fuera del catálogo y fuera de la guarda.
    'quejas.cruce.eyebrow': 'Cruce de datos · sin causalidad',
    'quejas.cruce.titulo': 'Quejas y contratos situados por barrio',
    'quejas.cruce.intro':
      'Por barrio: número de quejas ciudadanas frente a lo adjudicado en contratos ya situados allí. **Las dos columnas no cubren el mismo periodo**',
    'quejas.cruce.periodos':
      ': las quejas se recogen desde {periodoQuejas} y lo situado acumula adjudicaciones de {periodoContratos}',
    'quejas.cruce.periodos.sinFechas':
      ' — el canal de quejas es mucho más reciente que el registro de contratación',
    'quejas.cruce.cierre':
      ', así que comparar una columna con la otra no mide la respuesta municipal. Son cifras de contexto — la ausencia de contratos situados **no** implica desatención: muchas actuaciones no nombran el lugar en el título y por eso no se sitúan (ver',
    'quejas.cruce.metodologia': 'metodología',
    'quejas.cruce.col.barrio': 'Barrio',
    'quejas.cruce.col.quejas': 'Quejas',
    'quejas.cruce.col.adjudicado': 'Adjudicado situado',
    'quejas.cruce.sinSituado': 'sin contratos situados',
    'dashboard.eyebrow': 'Voz ciudadana · Dashboard',
    'dashboard.title': 'Salud del canal de quejas',

    // Plenos vote block
    'plenos.votes.heading': 'Votaciones registradas',
    'plenos.votes.empty.eyebrow': 'Sin datos',
    'plenos.votes.empty.title': 'No hay votaciones registradas todavía',

    // Claim ledger (declaraciones contrastadas)
    'ledger.loadMore': 'Cargar más',

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
    'plenoDetail.extractionPending': 'sin extraer',
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
    // Por qué un cargo no lleva cifras de respuesta. El plazo de la LPACAP corre
    // desde el registro: sin registro no hay respuesta que contar, ni silencio.
    'quejas.reloj.sinRegistro':
      'Ninguna queja de esta área ha llegado todavía al registro del ayuntamiento. El plazo legal corre desde el registro: sin él no hay respuesta que contar, ni silencio.',
    'quejas.reloj.sinRegistro.corto': 'sin registro',
    'quejas.reloj.exportIncompleto':
      'El listado publicado no coincide con el recuento del bot, así que no se puede saber qué quejas llegaron al registro.',
    'quejas.reloj.exportIncompleto.corto': 'listado parcial',
    'quejas.reloj.sinDatos': 'No se han podido leer las quejas publicadas.',
    'quejas.reloj.sinDatos.corto': 'sin datos',
    // La ficha de una queja (/quejas/:id). El estado y la categoría son enums del
    // bot: las tablas STATE_LABEL y CATEGORY_LABEL de useQuejas leen su castellano
    // de aquí, para que las páginas que aún no se traducen no puedan discrepar.
    'quejas.estado.capturada': 'Capturada',
    'quejas.estado.apoyada_verificada': 'Verificada',
    'quejas.estado.registrada': 'Registrada en sede',
    'quejas.estado.notificada_10d': 'Acuse recibido',
    'quejas.estado.en_tramite': 'En trámite',
    'quejas.estado.resuelta': 'Resuelta',
    'quejas.estado.silencio_negativo': 'Silencio administrativo',
    'quejas.estado.escalada_sindic': 'Escalada al Síndic',
    'quejas.estado.cerrada_no_registrada': 'Cerrada sin registrar',
    'quejas.categoria.via_publica': 'Vía pública',
    'quejas.categoria.limpieza': 'Limpieza',
    'quejas.categoria.zonas_verdes': 'Zonas verdes',
    'quejas.categoria.alumbrado': 'Alumbrado',
    'quejas.categoria.trafico': 'Tráfico',
    'quejas.categoria.mobiliario_urbano': 'Mobiliario urbano',
    'quejas.categoria.ruido': 'Ruido',
    'quejas.categoria.agua_saneamiento': 'Agua y saneamiento',
    'quejas.categoria.transporte': 'Transporte',
    'quejas.categoria.transparencia': 'Transparencia',
    'quejas.categoria.urbanismo': 'Urbanismo',
    'quejas.categoria.accesibilidad': 'Accesibilidad',
    'quejas.categoria.seguridad': 'Seguridad',
    'quejas.categoria.cultura': 'Cultura',
    'quejas.categoria.educacion': 'Educación',
    'quejas.categoria.servicios_sociales': 'Servicios sociales',
    'quejas.categoria.medio_ambiente': 'Medio ambiente',
    'quejas.categoria.residuos': 'Residuos',
    'quejas.categoria.comercio': 'Comercio',
    'quejas.categoria.fiestas': 'Fiestas',
    'quejas.categoria.vivienda': 'Vivienda',
    'quejas.categoria.agricultura': 'Agricultura',
    'quejas.categoria.mayores': 'Mayores',
    'quejas.categoria.juventud': 'Juventud',
    'quejas.categoria.turismo': 'Turismo',
    'quejas.categoria.salud': 'Salud',
    'quejas.categoria.deportes': 'Deportes',
    'quejas.categoria.igualdad': 'Igualdad',
    'quejas.categoria.bienestar_animal': 'Bienestar animal',
    'quejas.categoria.otros': 'Otros',
    'quejas.detalle.volver': '← Feed de quejas',
    'quejas.detalle.eyebrow': 'Queja ciudadana · {id}',
    'quejas.detalle.compartir': 'Queja {id} · {categoria} · {estado}',
    'quejas.detalle.apoyos': '{n} apoyos',
    'quejas.detalle.responsable': 'Responsable político',
    'quejas.detalle.texto.eyebrow': 'Texto de la queja',
    'quejas.detalle.texto.titulo': 'Detalle ciudadano (verbatim)',
    'quejas.detalle.foto.eyebrow': 'Imagen adjunta',
    'quejas.detalle.foto.titulo': 'Foto ciudadana (anonimizada)',
    'quejas.detalle.foto.alt': 'Imagen de la queja anonimizada automáticamente',
    'quejas.detalle.foto.pie':
      '🔒 Imagen anonimizada automáticamente · caras y matrículas difuminadas antes de publicar. Si la enviaste tú y ves datos personales, escribe {olvidar} al bot para retirarla; si apareces en ella, pide su retirada desde el {aviso}.',
    'quejas.detalle.foto.avisoLegal': 'aviso legal',
    'quejas.detalle.relacion.eyebrow': 'Relación por zona y materia · no causal',
    'quejas.detalle.relacion.titulo': 'Posibles actuaciones municipales relacionadas',
    'quejas.detalle.relacion.nota':
      'Contratos municipales que coinciden con esta queja en {zona} y/o {materia}. La coincidencia {no} implica que el contrato resuelva el problema — es una relación de contexto, no causal.',
    'quejas.detalle.relacion.zona': 'zona',
    'quejas.detalle.relacion.materia': 'materia',
    'quejas.detalle.relacion.no': 'no',
    'quejas.detalle.relacion.pastilla':
      'Relación determinista y verificable — coincidencia de zona y/o materia',
    'quejas.detalle.relacion.verContrato': 'Ver contrato en contrataciondelestado.es →',
    'quejas.detalle.reloj.eyebrow': 'Reloj legal',
    'quejas.detalle.reloj.titulo': 'Plazo LPACAP en curso',
    'quejas.detalle.reloj.registrada': 'Registrada',
    'quejas.detalle.reloj.plazoMaximo': 'Plazo máximo',
    'quejas.detalle.reloj.meses': '{n} meses',
    'quejas.detalle.reloj.mes': '1 mes',
    'quejas.detalle.reloj.restantes': 'Días restantes',
    'quejas.detalle.reloj.excedidos': 'Días excedidos',
    'quejas.detalle.reloj.asiento': 'Asiento sede',
    'quejas.detalle.historial.eyebrow': 'Historial',
    'quejas.detalle.historial.titulo': 'Línea temporal',
    'quejas.detalle.hito.capturada': 'Capturada en CivicPulse',
    'quejas.detalle.hito.capturada.detalle': 'Vía Telegram bot · barrio {barrio}',
    'quejas.detalle.hito.verificada': 'Verificada por la comunidad',
    'quejas.detalle.hito.verificada.detalle':
      '{n} apoyos vecinales · umbral del lote semanal alcanzado',
    'quejas.detalle.hito.registrada': 'Registrada en sede electrónica',
    'quejas.detalle.hito.registrada.detalle':
      'Asiento {asiento} · inicio del reloj legal ({plazo})',
    'quejas.detalle.hito.silencio': 'Silencio administrativo negativo',
    'quejas.detalle.hito.silencio.detalle': 'Plazo legal vencido · art. 24 LPACAP',
    'quejas.detalle.hito.sindic': 'Escalada al Síndic de Greuges CV',
    'quejas.detalle.hito.sindic.detalle': 'Ley 11/1988 · resoluciones públicas',
    'quejas.detalle.hito.resuelta': 'Resuelta',
    'quejas.detalle.replica.eyebrow': 'Derecho de réplica oficial',
    'quejas.detalle.replica.titulo': 'Respuesta del Ayuntamiento',
    'quejas.detalle.replica.fuente': 'Fuente primaria →',
    'quejas.detalle.acciones.eyebrow': 'Acciones',
    'quejas.detalle.acciones.titulo': '¿Qué puedes hacer?',
    'quejas.detalle.acciones.apoyar': 'Apoyar:',
    'quejas.detalle.acciones.apoyar.texto': 'escribe {comando} al bot de Telegram.',
    'quejas.detalle.acciones.sindic': 'Presentar queja al Síndic:',
    'quejas.detalle.acciones.responder': 'Responder como responsable público:',
    'quejas.detalle.acciones.responder.texto':
      'contacta con la redacción según se indica en {aviso}.',
    'quejas.detalle.noEncontrada.eyebrow': 'No encontrada',
    'quejas.detalle.noEncontrada.titulo': 'Queja {id}',
    'quejas.detalle.noEncontrada.texto':
      'Esta queja no aparece en el snapshot actual. Puede que haya sido archivada o que el identificador sea incorrecto.',
    'quejas.detalle.noEncontrada.volver': '← Volver al feed público',
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
    // Cross-checked documents. The date qualifier is chrome, not data: it says
    // WHICH date is being shown, so «7 feb 2023» beneath a 2026 debate cannot
    // be read as the debate's own date.
    'findings.refs.crossChecked': 'Documentos cotejados',
    // La grabación de la sesión NO es un documento cotejado: es de donde salen
    // las citas. Iban en la misma lista, así que una ficha cuyo único cotejo
    // era el vídeo del propio pleno enseñaba «DOCUMENTOS COTEJADOS ·
    // PLENO-VIDEO» debajo de un texto que promete haber buscado en la
    // contratación, las subvenciones y el presupuesto. Cotejo que no encuentra
    // nada y procedencia de la cita son dos hechos, y sólo el segundo estaba
    // ahí. Medido: de 40 hallazgos, 2 no tenían más cotejo que el vídeo.
    'findings.refs.provenance': 'Procedencia de las citas',
    'findings.refs.contradiction': 'Documentos que contradicen',
    'findings.refs.date.award': 'adjudicación',
    'findings.refs.date.formalized': 'formalización',
    'findings.refs.date.start': 'inicio',
    'findings.refs.date.opened': 'apertura de ofertas',
    'findings.refs.date.submission': 'plazo de presentación',
    'findings.refs.date.session': 'sesión',
    'findings.refs.date.none': 'sin fecha publicada',
    'findings.refs.date.noneTitle':
      'El registro público de este documento no publica ninguna fecha utilizable. No significa que sea reciente.',
    // Tres estados y sólo tres, más el silencio mientras el snapshot carga. Un
    // expediente anulado antes de adjudicar y un contrato firmado se leían
    // igual bajo «Documentos cotejados».
    'findings.refs.status.cancelled': 'expediente anulado',
    'findings.refs.status.cancelledTitle':
      'El procedimiento terminó sin contrato: se anuló, se desistió o quedó desierto. El ayuntamiento no llegó a firmarlo.',
    'findings.refs.status.committed': 'adjudicado',
    'findings.refs.status.committedTitle':
      'El registro publica este expediente como adjudicado o formalizado: hay contrato.',
    'findings.refs.status.in-flight': 'en licitación',
    'findings.refs.status.in-flightTitle':
      'El expediente sigue en marcha: publicado, en evaluación o con adjudicación sólo provisional. Todavía no hay contrato firme.',
    'findings.refs.status.none': 'sin estado',
    'findings.refs.status.noneTitle':
      'El registro público de este documento no publica ningún estado utilizable. No significa que se anulara ni que se firmara.',
    'cargos.detalle.actividad.eyebrow': 'Actividad de sus áreas',
    'cargos.detalle.actividad.title': 'Qué se ha debatido y verificado en sus concejalías',
    'cargos.detalle.actividad.intro':
      'Cifras de las áreas que dirige, no de la persona. Las votaciones se registran por grupo político y las declaraciones se atribuyen al grupo que habló, nunca a un concejal concreto: por eso se enlazan aquí en lugar de mostrarse bajo su ficha.',
    'cargos.detalle.actividad.votos': 'votaciones',
    'cargos.detalle.actividad.declaraciones': 'declaraciones contrastadas',
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
    'presupuesto.ted.concentracion':
      'No es un volumen repartido: el mayor anuncio se lleva el {pct} % del total ({importe}), porque una concesión se adjudica por todo su plazo de una vez.',
    'presupuesto.ted.note':
      'TED no publica título descriptivo para estos anuncios —el número ES el identificador—, así que cada fila enlaza al original. El símbolo ≈ marca los anuncios sin fecha exacta: el año se recupera del número de publicación y no se inventa un día.',
    // /presupuesto · lámina 5b. Toda cifra va en un {marcador}: la frase la
    // deriva `scraper/presupuesto-lectura`, el catálogo sólo pone las palabras.
    // Un par de asteriscos marca negrita; lo pinta <Marcado> en la página.
    'presupuesto.eyebrow': 'Hacienda pública · ejercicio {year} · aprobado y ejecutado',
    'presupuesto.eyebrow.aprobado': 'Hacienda pública · ejercicio {year} · CONPREL',
    'presupuesto.title': 'Presupuesto municipal {year}',
    'presupuesto.title.sinAnio': 'Presupuesto municipal',
    'presupuesto.loading': 'Cargando datos reales de MinHac (CONPREL)…',
    'presupuesto.error': 'No se pudo cargar el presupuesto real.',
    // /presupuesto bajo la cascada: la tarjeta del mapa de lo adjudicado y sus
    // pestañas (presupuesto.gasto), las subvenciones, las obras, la contratación
    // menor y el titular de la deuda, que se compone de sus campos en src/lib.
    'presupuesto.gasto.eyebrow': 'Contratación municipal · {periodo} · Gobierto/PLACSP',
    'presupuesto.gasto.eyebrow.sinPeriodo': 'Contratación municipal · Gobierto/PLACSP',
    'presupuesto.gasto.titulo': '¿A dónde va el dinero en contratos?',
    'presupuesto.gasto.adjudicadoSinIva': 'adjudicado sin IVA',
    'presupuesto.gasto.ejercicios': '{n} ejercicios, no un año',
    'presupuesto.gasto.intro.total': 'El total de arriba es {todo}:',
    'presupuesto.gasto.intro.todo': 'todo lo adjudicado en contratos, no solo obras',
    'presupuesto.gasto.intro.obrasPct': 'las obras son el {pct} %',
    'presupuesto.gasto.intro.grueso': 'el grueso',
    'presupuesto.gasto.intro.resto':
      'y el resto son servicios de ámbito municipal, suministros y otros —el desglose completo está en «{pestana}».',
    'presupuesto.gasto.intro.periodo':
      'Y es de {periodo}, no de un solo ejercicio: puesto sin periodo al lado de un presupuesto anual se lee mucho mayor de lo que es.',
    'presupuesto.gasto.intro.noRepartido': 'No es un volumen repartido:',
    'presupuesto.gasto.intro.mayorConcesion':
      'el mayor contrato —una concesión de {importe} M€— se lleva él solo el {pct} % del total, porque una concesión se adjudica por todo su plazo de una vez.',
    'presupuesto.gasto.intro.mayor':
      'el mayor contrato —{importe} M€— se lleva él solo el {pct} % del total.',
    'presupuesto.gasto.intro.situados':
      'Solo se sitúan los contratos cuyo título nombra una zona, y ahí sí predominan las obras ({pct} %). Tamaño del círculo = € adjudicado en la zona · ámbar cuando la mitad o más es recuperación DANA.',
    'presupuesto.gasto.intro.situadosSinPct':
      'Solo se sitúan los contratos cuyo título nombra una zona. Tamaño del círculo = € adjudicado en la zona · ámbar cuando la mitad o más es recuperación DANA.',
    'presupuesto.gasto.soloDana': 'Solo DANA',
    'presupuesto.gasto.pestana.explorar': 'Explorar contratos',
    'presupuesto.gasto.pestana.contratistas': '¿Quién recibe el dinero?',
    'presupuesto.gasto.pestana.tipos': 'Tipos de contrato',
    'presupuesto.gasto.pestanas.aria': 'Vistas de los contratos',
    'presupuesto.gasto.mapa.aria': 'Mapa interactivo de los contratos municipales por zona',
    'presupuesto.gasto.mapa.ariaVacio': 'Mapa de los contratos municipales por zona',
    'presupuesto.gasto.mapa.vacio': 'Aún no hay contratos situables en el periodo seleccionado.',
    'presupuesto.gasto.contratos.uno': '{n} contrato',
    'presupuesto.gasto.contratos.varios': '{n} contratos',
    'presupuesto.gasto.tiempo.reproducir': 'Reproducir línea de tiempo',
    'presupuesto.gasto.tiempo.pausar': 'Pausar línea de tiempo',
    'presupuesto.gasto.tiempo.aria': 'Línea de tiempo de los contratos situados',
    'presupuesto.gasto.cobertura.conPeriodo':
      'De {total} adjudicados en contratos (sin IVA) {periodo} —suma acumulada de {n} ejercicios, no de un año—, {situado} ({pct}%) se pueden situar en el mapa.',
    'presupuesto.gasto.cobertura.sinPeriodo':
      'De {total} adjudicados en contratos (sin IVA), {situado} ({pct}%) se pueden situar en el mapa.',
    'presupuesto.gasto.cobertura.aLoLargo': 'a lo largo de {periodo}',
    'presupuesto.gasto.cobertura.resto':
      'El resto de ese importe adjudicado son contratos cuyo título no nombra una zona (servicios, suministros y obras sin lugar citado): no se inventa una ubicación. Un contrato que cita dos zonas suma en ambas, pero cuenta una sola vez aquí.',
    'presupuesto.gasto.zona.todas': '← todas las zonas',
    'presupuesto.gasto.buscar': 'Buscar contrato o empresa…',
    'presupuesto.gasto.filtro.zona': 'Filtrar por zona',
    'presupuesto.gasto.filtro.zonas': 'Todas las zonas',
    'presupuesto.gasto.filtro.tipo': 'Filtrar por tipo',
    'presupuesto.gasto.filtro.tipos': 'Todo tipo',
    'presupuesto.gasto.resultado.uno': 'resultado',
    'presupuesto.gasto.resultado.varios': 'resultados',
    'presupuesto.gasto.resultado.pagina': '{desde}–{hasta}, página {pagina} de {paginas}',
    'presupuesto.gasto.comprometido': 'son dinero comprometido (adjudicado o formalizado).',
    // La cifra de esa fila es el presupuesto base de licitación, no el importe
    // por el que se firmó, porque la fuente no publica el segundo. Se avisa
    // sólo ahí: en una fila sin adjudicar la pastilla de estado ya lo dice.
    'presupuesto.gasto.sinAdjudicacion': 'importe de licitación',
    'presupuesto.gasto.fueraDeCifras.uno':
      'El otro consta en el registro público pero no cuenta en las cifras de arriba:',
    'presupuesto.gasto.fueraDeCifras.varios':
      'Los otros {n} constan en el registro público pero no cuentan en las cifras de arriba:',
    'presupuesto.gasto.listado': 'listado de contratos',
    'presupuesto.gasto.razonesSociales': '{n} razones sociales',
    'presupuesto.gasto.dana': 'Recuperación DANA ≈ {pct}% del importe adjudicado.',
    'presupuesto.subvenciones.eyebrow': 'BDNS · {total} convocatorias · {municipales} municipales',
    'presupuesto.subvenciones.titulo': 'Subvenciones · Base Nacional',
    'presupuesto.subvenciones.fuente': 'Datos reales de MinHac BDNS · pap.hacienda.gob.es',
    'presupuesto.obras.eyebrow': 'Urbanismo · infraestructuras',
    'presupuesto.obras.titulo': 'Obras de infraestructura · fichas municipales 2019–2024',
    'presupuesto.obras.intro':
      '{n} obras publicadas por el Ayuntamiento en fichas oficiales: {renove} actuaciones del Plan RENOVE de adecuación de viales (ejecutadas 2023–2024) y {feder} obras de 2019–2020 cofinanciadas con el FEDER de la Comunitat Valenciana 2014–2020.',
    'presupuesto.obras.intro.soloFeder':
      '{n} obras publicadas por el Ayuntamiento en fichas oficiales: {feder} obras de 2019–2020 cofinanciadas con el FEDER de la Comunitat Valenciana 2014–2020.',
    'presupuesto.obras.ultimas': 'Últimas fichas publicadas: feb 2024',
    'presupuesto.obras.ejecutadas': 'obras ya ejecutadas · no refleja obras posteriores',
    'presupuesto.obras.renove': 'Plan RENOVE',
    'presupuesto.obras.baja': 'baja',
    'presupuesto.obras.adj': 'adj.',
    'presupuesto.obras.previsto': 'previsto',
    'presupuesto.obras.meses': '{n} meses',
    'presupuesto.obras.inicio': 'inicio {fecha}',
    'presupuesto.obras.ejecucion': 'ejecución {fecha}',
    'presupuesto.obras.verFicha': 'Ver ficha ↗',
    'presupuesto.obras.fuente':
      'Fuente: Ayuntamiento de Riba-roja de Túria — Portal de Transparencia («obras de infraestructuras en curso») y página del Plan RENOVE de adecuación de viales.',
    'presupuesto.obras.listado': 'listado de obras',
    'presupuesto.menores.eyebrow': 'Contratación · vía directa',
    'presupuesto.menores.titulo': 'Contratos menores: {n} de {total}, {importe}',
    'presupuesto.menores.intro':
      'El contrato menor se adjudica {sinLicitacion}. Son el {pct} % de los contratos adjudicados o firmados y{importe}: muchos expedientes y poca parte del dinero.',
    'presupuesto.menores.intro.sinLicitacion': 'sin licitación ni publicidad previa',
    'presupuesto.menores.intro.importe': 'el {pct} % del importe',
    'presupuesto.menores.peso':
      'Ese segundo porcentaje depende mucho del denominador — una sola concesión de {importe}, adjudicada de una vez por todo su plazo, es el {cuota} % de todo lo contratado; apartándola, los menores serían el {sin} %.',
    'presupuesto.menores.iva':
      'Todas las cifras van {sinIva}, porque así define el techo el art. 118 de la Ley 9/2017 —{obras} en obras, {servicios} en servicios y suministros.',
    'presupuesto.menores.iva.sinIva': 'sin IVA',
    'presupuesto.menores.sobreTecho': '{n} por encima del techo del art. 118',
    'presupuesto.menores.frente': 'frente a',
    'presupuesto.menores.marca':
      'La marca «contrato menor» la pone el portal de contratación, no nosotros, y una etiqueta equivocada en origen se parece exactamente a un incumplimiento. Esto mide la distancia al límite legal y la publica; llamarlo infracción es un paso que no da un programa.',
    'presupuesto.menores.sinTecho': '{n} sin techo declarado para su tipo de contrato',
    'presupuesto.menores.sinImporte': '{n} sin importe neto publicado',
    'presupuesto.menores.sinComparar':
      '{lista}: no se comparan con el límite, en vez de darlos por dentro.',
    'presupuesto.menores.anulados':
      'Otros {n} venían marcados como menores y su adjudicación se deshizo: no cuentan como gasto ni se les mide el techo.',
    'presupuesto.menores.norma': 'Ley 9/2017, art. 118',
    'presupuesto.deuda.titular.igual': 'Sin cambio en {anio}',
    'presupuesto.deuda.titular.sube': 'Sube en {anio}',
    'presupuesto.deuda.titular.baja': 'Baja en {anio}',
    'presupuesto.deuda.titular.sigueSubiendo': 'Sube por {ordinal} año seguido',
    'presupuesto.deuda.titular.sigueBajando': 'Baja por {ordinal} año seguido',
    'presupuesto.deuda.titular.subioYBaja': 'Subió en {anterior} y en {anio} baja',
    'presupuesto.deuda.titular.bajoYSube': 'Bajó en {anterior} y en {anio} vuelve a subir',
    'presupuesto.deuda.titular.subioAniosYBaja': 'Subió {cardinal} años seguidos, y en {anio} baja',
    'presupuesto.deuda.titular.bajoAniosYSube':
      'Bajó {cardinal} años seguidos, y en {anio} vuelve a subir',
    'presupuesto.deuda.ordinal.2': 'segundo',
    'presupuesto.deuda.ordinal.3': 'tercer',
    'presupuesto.deuda.ordinal.4': 'cuarto',
    'presupuesto.deuda.ordinal.5': 'quinto',
    'presupuesto.deuda.ordinal.6': 'sexto',
    'presupuesto.deuda.ordinal.7': 'séptimo',
    'presupuesto.deuda.ordinal.otro': '{n}º',
    'presupuesto.deuda.cardinal.2': 'dos',
    'presupuesto.deuda.cardinal.3': 'tres',
    'presupuesto.deuda.cardinal.4': 'cuatro',
    'presupuesto.deuda.cardinal.5': 'cinco',
    'presupuesto.deuda.cardinal.6': 'seis',
    'presupuesto.deuda.cardinal.7': 'siete',
    'presupuesto.deuda.cardinal.otro': '{n}',
    'presupuesto.lede':
      'El ayuntamiento abrió el año con {inicial} de crédito, lo amplió en {mod} durante el ejercicio —un {pct} % más— y ejecutó {ejecutado}.',
    'presupuesto.lede.dominanteCero':
      ' Casi toda la ampliación, el {cuota} %, fue a {capitulo}, un capítulo que había empezado en cero.',
    'presupuesto.lede.dominante': ' Casi toda la ampliación, el {cuota} %, fue a {capitulo}.',
    'presupuesto.lede.soloAprobado':
      'El presupuesto aprobado para {year} según el Ministerio de Hacienda es de {gastos} de gastos. Lo ejecutado aparece más abajo en cuanto el Ayuntamiento publica su estado de ejecución.',
    // Estado distinto del anterior: el listado municipal SÍ está publicado, pero
    // su crédito definitivo no es la suma de inicial y modificaciones. Decir
    // «en cuanto lo publique» ahí sería falso, y es justo el estado para el que
    // se escribió `cuadra`.
    'presupuesto.lede.sinCuadre':
      'El presupuesto aprobado para {year} según el Ministerio de Hacienda es de {gastos} de gastos. El estado de ejecución que publica el propio Ayuntamiento no cuadra consigo mismo este ejercicio: sus cuatro magnitudes van más abajo, una a una y sin sumarlas por él.',
    'presupuesto.tres':
      'Esta página distingue en todo momento tres cosas que suelen confundirse: lo **aprobado**, lo **definitivo** tras modificaciones y lo **ejecutado**.',
    'presupuesto.tres.link': 'Cómo se leen los tres ↓',
    'presupuesto.meta':
      '{gastos} de gastos aprobados según CONPREL · {porHab} por habitante · {hab} habitantes · actualizado {fecha}',
    'presupuesto.fuentes.title': 'Dos fuentes, dos presupuestos aprobados',
    'presupuesto.fuentes.conprel': 'CONPREL · Ministerio de Hacienda',
    'presupuesto.fuentes.municipal': 'Estado de ejecución del propio Ayuntamiento',
    'presupuesto.fuentes.diferencia': 'Diferencia sin explicar',
    'presupuesto.fuentes.nota':
      'Las dos son oficiales y **no se reconcilian aquí**: no consta el motivo de la diferencia, y elegir una sería inventar el puente entre dos fuentes públicas. Cada cifra de esta página dice de cuál viene.',
    'presupuesto.cascada.eyebrow':
      'Ejecución presupuestaria · {year}{periodo} · del crédito inicial a lo ejecutado',
    'presupuesto.cascada.periodo': ' · {t}º trimestre',
    'presupuesto.cascada.title': 'El presupuesto creció un {pct} % dentro del año',
    'presupuesto.cascada.title.sinCuadre': 'Del crédito inicial a lo ejecutado',
    'presupuesto.cascada.inicial': 'Crédito inicial aprobado',
    'presupuesto.cascada.inicial.nota': 'lo que aprobó el pleno · estado de ejecución',
    'presupuesto.cascada.mod': 'Modificaciones de crédito',
    'presupuesto.cascada.mod.nota': '+{pct} % sobre el inicial, durante el ejercicio',
    'presupuesto.cascada.definitivo': 'Presupuesto definitivo',
    'presupuesto.cascada.definitivo.nota': 'inicial + modificaciones',
    'presupuesto.cascada.ejecutado': 'Ejecutado',
    'presupuesto.cascada.ejecutado.nota': 'obligaciones reconocidas netas · {pct} % del definitivo',
    'presupuesto.cascada.noCuadra':
      'El listado municipal declara un definitivo que no es la suma de inicial y modificaciones ({suma}); se publican las cuatro cifras tal cual y se retira el porcentaje de crecimiento.',
    'presupuesto.callout.denominador':
      '**El «{pctDef} % ejecutado» es un cociente sobre el presupuesto definitivo.** Sobre el crédito que se aprobó en enero, lo ejecutado es el {pctIni} %. Cada cifra responde a una pregunta distinta: cuánto se ejecutó de lo que se aprobó en enero, y cuánto de lo que se acabó autorizando.',
    'presupuesto.callout.asimetria.entro':
      '**Entró {mucho}más de lo que salió.** De ingresos se ejecutó el {pctIng} % —{ingEj}— frente al {pctGas} % de gastos: {gasEj}. La asimetría entre esos dos porcentajes es el dato, no cada uno por su lado.',
    'presupuesto.callout.asimetria.salio':
      '**Salió más de lo que entró.** De gastos se ejecutó el {pctGas} % —{gasEj}— frente al {pctIng} % de ingresos: {ingEj}. La asimetría entre esos dos porcentajes es el dato, no cada uno por su lado.',
    'presupuesto.callout.mucho': 'mucho ',
    'presupuesto.cap.eyebrow': 'Capítulo a capítulo · {year}',
    'presupuesto.cap.title': 'Dónde se amplió el crédito y dónde se ejecutó',
    'presupuesto.cap.leyenda.inicial': 'crédito inicial',
    'presupuesto.cap.leyenda.ampliacion': 'ampliación',
    'presupuesto.cap.leyenda.ejecutado': 'ejecutado',
    'presupuesto.cap.nota.cero': 'crédito inicial 0 €',
    'presupuesto.cap.nota.cuota': '{cuota} % de toda la ampliación',
    // Dos frases para el capítulo que abre en cero, y la diferencia es de quién
    // es el cero. Esta página publica DOS presupuestos aprobados del mismo
    // ejercicio: cuando el otro también abre el capítulo en cero, el crédito no
    // estaba en ninguno y la frase puede decirlo. Cuando no —2025, Inversiones
    // reales—, decirlo en singular elige una fuente sin nombrarla.
    'presupuesto.cap.pie.cero':
      '**{capitulo} abrió el ejercicio con 0 € y acabó con {definitivo}** —el {cuota} % de toda la ampliación—, de los que se ejecutó el {pct} %. Un capítulo que empieza en cero y recibe todo su crédito durante el ejercicio no es una desviación de ejecución: ese crédito no estaba en ninguno de los dos presupuestos aprobados que publica esta página.',
    'presupuesto.cap.pie.ceroDiscrepan':
      '**{capitulo} abrió el ejercicio con 0 € y acabó con {definitivo}** —el {cuota} % de toda la ampliación—, de los que se ejecutó el {pct} %. Ese cero es el del estado de ejecución del propio Ayuntamiento: **el presupuesto que se remitió a CONPREL le da {conprel} de crédito inicial a ese mismo capítulo**. Las dos fuentes son oficiales y no se reconcilian, así que parte de lo que aquí figura como ampliación ya estaba aprobado en la otra.',
    'presupuesto.cap.pie.dominante':
      '**{capitulo} se llevó el {cuota} % de toda la ampliación**: de {inicial} a {definitivo}, de los que se ejecutó el {pct} %.',
    'presupuesto.cap.pie.cociente':
      ' El porcentaje de la derecha es ejecutado ÷ definitivo: obligaciones reconocidas netas.',
    'presupuesto.cap.fuente':
      'Fuente: Ayuntamiento de Riba-roja · estados de ejecución presupuestaria{fecha}.',
    'presupuesto.cap.fecha': ' · listado a {fecha}',
    'presupuesto.econ.eyebrow': 'Gastos aprobados {year} · CONPREL · en qué',
    'presupuesto.econ.title': 'En qué prevé gastarse el dinero público',
    'presupuesto.econ.cero':
      'El capítulo {code}, {label}, está aprobado a 0 € y por eso no tiene barra. Se deja dicho en vez de omitirlo.',
    'presupuesto.econ.ceroVarios':
      'Los capítulos {lista} están aprobados a 0 € y por eso no tienen barra. Se dejan dichos en vez de omitirlos.',
    'presupuesto.econ.cero.y': 'y',
    'presupuesto.ing.eyebrow': 'Ingresos aprobados {year} · CONPREL · de dónde',
    'presupuesto.ing.title': 'De dónde vienen los ingresos municipales',
    'presupuesto.descuadre':
      '**Este presupuesto no cuadra en la fuente del ministerio:** atribuye {ingresos} de ingresos frente a {gastos} de gastos, {dif} de diferencia. Un presupuesto general se aprueba **sin déficit inicial** (art. 165.4 del texto refundido de la Ley de Haciendas Locales) y la exigencia vale en los dos sentidos: tampoco debería sobrar. En ese mismo fichero, otras entidades cuadran al céntimo. No es un remanente ni un colchón: es un descuadre, y no sabemos si está en lo que remitió el ayuntamiento o en cómo lo publica el ministerio.',
    'presupuesto.prog.eyebrow': 'Gastos aprobados {year} · clasificación por programas · para qué',
    'presupuesto.prog.title': 'Los mismos {total} repartidos por finalidad',
    'presupuesto.prog.nota':
      'Otro corte del mismo dinero, no otro dinero: la económica dice «en qué», esta dice «para qué». No se cruzan entre sí.',
    'presupuesto.prog.deuda':
      'El programa «Deuda pública» ({importe}) es lo que se aparta este ejercicio para atender la deuda. No es el saldo vivo de más abajo —{deuda}— y las dos cifras no se suman.',
    // Las seis áreas de gasto de la Orden EHA/3565/2008 (anexo I), glosadas
    // con lo que cada una agrupa según esa misma orden.
    'presupuesto.prog.glosa.deuda': 'lo que se aparta este año para atenderla',
    'presupuesto.prog.glosa.basicos':
      'seguridad, urbanismo y vivienda, bienestar comunitario, medio ambiente',
    'presupuesto.prog.glosa.social': 'pensiones, servicios sociales, fomento del empleo',
    'presupuesto.prog.glosa.preferentes': 'sanidad, educación, cultura, deporte',
    'presupuesto.prog.glosa.economico':
      'agricultura, industria, comercio, turismo, transporte, infraestructuras',
    'presupuesto.prog.glosa.general':
      'órganos de gobierno, servicios generales, administración financiera',
    'presupuesto.deuda.eyebrow': 'Endeudamiento · saldo a 31 de diciembre',
    'presupuesto.deuda.saldo': 'deuda viva a 31/12/{year}',
    'presupuesto.deuda.desde': 'Desde {anio}: {delta}',
    'presupuesto.deuda.nota1':
      'Es el saldo que el Ayuntamiento debía al cerrar el ejercicio. **No es el capítulo «Deuda pública» del presupuesto**{importe}, que es lo que se aparta cada año para atenderla: son dos cifras distintas y no se suman.',
    'presupuesto.deuda.nota1.importe': ' —{x} en {year}—',
    'presupuesto.deuda.nota2':
      'Riba-roja queda **por encima del {percentil} %** de los {n} ayuntamientos de la entrega —de los que **{aCero} declaran cero deuda**—, así que la mediana del reparto es {mediana} y el percentil dice poco por sí solo. El p90 de la entrega está en {p90}.',
    'presupuesto.deuda.noPublicados':
      'Sin entrega publicada todavía: {lista}. La serie se corta ahí porque el Ministerio aún no ha publicado ese ejercicio, no porque no haya deuda.',
    'presupuesto.deuda.fuente': 'Ministerio de Hacienda · deuda viva EE.LL.',
    'presupuesto.contra.eyebrow': 'Contratación y subvenciones',
    'presupuesto.contra.title': 'Lo que se ha adjudicado, cada cifra con su periodo',
    'presupuesto.contra.intro':
      'El presupuesto se aprueba y se ejecuta cada año; la contratación se acumula a lo largo de varios ejercicios. Así que **estos cuatro recuentos no son el reparto del presupuesto de arriba**: cada uno lleva el periodo que abarca. Van **medidos sobre los contratos adjudicados y sin IVA**, con los mismos predicados que las fichas de abajo, y cada uno abre la suya.',
    'presupuesto.contra.menores': 'Contratos menores',
    'presupuesto.contra.menores.nota':
      'de {adj} adjudicados{span} · {importe} sin IVA: el {pctN} % de los expedientes y el {pctImporte} % del importe',
    'presupuesto.contra.menores.link': 'Vía directa ↓',
    'presupuesto.contra.obras': 'Obras publicadas',
    'presupuesto.contra.obras.nota':
      'fichas municipales · {renove} del Plan RENOVE y {feder} del FEDER, ya ejecutadas',
    'presupuesto.contra.obras.link': 'Fichas ↓',
    'presupuesto.contra.ted': 'Umbral europeo · TED',
    'presupuesto.contra.ted.nota': 'anuncios{span} · {valued} con importe, {total}',
    'presupuesto.contra.ted.mayor': ', el {pct} % en un solo anuncio',
    'presupuesto.contra.ted.link': 'Anuncios ↓',
    'presupuesto.contra.bdns': 'Subvenciones · BDNS',
    'presupuesto.contra.bdns.nota':
      'convocatorias municipales en la Base Nacional{span} · {total} en total, contando las recibidas',
    'presupuesto.contra.bdns.link': 'Convocatorias ↓',
    'presupuesto.pie.fuentes.a': 'Fuentes: presupuesto aprobado de ',
    'presupuesto.pie.fuentes.conprel': 'CONPREL, Ministerio de Hacienda ↗',
    'presupuesto.pie.fuentes.b': ' · estado de ejecución del Ayuntamiento de Riba-roja · ',
    'presupuesto.pie.fuentes.deuda': 'deuda viva de EE.LL. ↗',
    'presupuesto.pie.fuentes.c': '. Snapshot del {fecha}.',
    'presupuesto.pie.eficiencia': 'Coste de los servicios →',
    'presupuesto.pie.datos': 'Datos abiertos →',
    'presupuesto.pie.metodologia': 'Metodología →',
    'cargos.detalle.ficha.eyebrow': 'Portal de transparencia',
    'cargos.detalle.ficha.title': 'Su ficha biográfica oficial',
    'cargos.detalle.ficha.note':
      'Documento publicado por el propio Ayuntamiento. Nunca se enlaza la ficha de otra persona: si el cruce es ambiguo, no se enseña ninguna.',
    'cargos.detalle.ficha.cobertura': 'fichas publicadas',
    'cargos.detalle.ficha.enlace': 'Datos biográficos (PDF)',
    'cargos.detalle.ficha.sin.title': 'El Ayuntamiento no publica su ficha.',
    'cargos.detalle.ficha.sin.body':
      'La página de la Corporación Municipal enlaza un CV en PDF junto a cada concejal; junto a este escaño no hay ninguno. No consta si llegó a publicarse antes: la página que el portal usaba hasta septiembre de 2026 no tiene copia en el Internet Archive, así que no se puede decir si se retiró o nunca estuvo.',
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
    'cargos.detalle.area.title': 'Dinero adjudicado en las concejalías que hoy dirige',
    'cargos.detalle.area.titleRango':
      'Dinero adjudicado entre {desde} y {hasta} en las concejalías que hoy dirige',
    'cargos.detalle.area.titleAnio':
      'Dinero adjudicado en {anio} en las concejalías que hoy dirige',
    'cargos.detalle.area.intro':
      'Importes adjudicados en las áreas de las que hoy es responsable, sumados a lo largo de todo el periodo, las dirigiera quien las dirigiera: no es la contratación de su mandato. Es contratación de la concejalía, no de la persona: los contratos los adjudica el órgano de contratación del Ayuntamiento.',
    'cargos.detalle.area.note':
      'Solo contratos ya adjudicados y de categoría atribuible a un área; la cifra se queda corta antes que asignar un responsable equivocado.',
    'cargos.detalle.stat.areasDelegadas': 'Áreas delegadas',
    'cargos.detalle.stat.partyPromises': 'Promesas · grupo',
    'cargos.detalle.stat.agendaItems': 'Puntos en pleno',
    'cargos.detalle.stat.quejas': 'Quejas pendientes',
    'cargos.detalle.portfolios.eyebrow': 'Áreas asignadas',
    'cargos.detalle.portfolios.sinFicha': 'Sin ficha de área en /departamentos: {lista}',
    'cargos.card.departamentos': 'Departamentos',
    'cargos.card.departamentos.mas': '+{n} más',
    'cargos.intro':
      'Quiénes forman la corporación, qué áreas lleva cada cual, qué cobran por el cargo según el acuerdo plenario y la estadística del ministerio, qué declara su CV para las áreas que dirigen y qué quejas les llegan.',
    // Un centinela nunca es un valor: sin correo en la fuente no se pinta el
    // buzón de nadie más, y sin retrato en la fuente las iniciales dicen por qué.
    'cargos.card.sinCorreo': 'sin correo publicado',
    'cargos.card.sinRetrato': 'sin retrato en la fuente',
    'cargos.card.altaDesde': 'Toma de posesión ante el Pleno el {fecha}',
    'cargos.card.hastaF': 'Concejala hasta el {fecha}',
    'cargos.card.hastaM': 'Concejal hasta el {fecha}',
    'cargos.card.acta': 'acta ↗',
    // El buzón compartido se CUENTA en el padrón, no se lista a mano: once
    // cargos comparten el de alcaldía y seis el del grupo del PP, y bajo una
    // cara un mostrador compartido se lee como la línea directa de esa persona.
    'cargos.card.buzonCompartido': '· buzón compartido por {n} cargos',
    'cargos.baja.renuncia': 'renuncia al acta',
    'cargos.baja.fallecimiento': 'fallecimiento',
    'cargos.baja.perdida-condicion': 'pérdida de la condición de concejal',
    // La segunda línea del sello sólo existe cuando hay correcciones: se deriva
    // del fichero, no se escribe, para que no pueda quedarse vieja.
    'cargos.corporacion.raspado': 'padrón raspado de ribarroja.es · actualizado {fecha}',
    'cargos.corporacion.correcciones':
      '{n} corrección(es) documentada(s): la página del ayuntamiento no recoge aún {bajas} baja(s) y {altas} alta(s) que el Pleno ya acordó; se aplican con el acta al lado.',
    'cargos.corporacion.correccionesLink': 'cómo se corrige el padrón',
    'cargos.bajas.title': 'Ya no forman parte de la corporación',
    'cargos.bajas.note':
      'Se conservan con su fecha de cese y el acta que la recoge. Nada en presente —retribución, áreas, quejas, encaje— se pinta sobre quien ya no ocupa el escaño.',
    // Lo que ISPA suma es lo percibido por los electos: ni las cuotas
    // empresariales, ni el personal eventual, ni las asignaciones a grupos.
    // Llamarlo «coste de la corporación» era la palabra equivocada sobre la
    // cifra correcta, la misma clase de defecto que «crédito» por «gastado».
    'cargos.ispa.total': 'retribuciones y asistencias de los {n} electos · ISPA {year}',
    'cargos.ispa.totalNota':
      'No incluye las cuotas empresariales a la Seguridad Social, el personal eventual ni la asignación a los grupos políticos.',
    'cargos.ispa.trienios':
      'El acuerdo añade «+ trienios» a esa asignación, y el ISPA publica lo percibido cada año sin desglosarlos.',
    'cargos.hero.mandato': 'mandato {m}',
    // Quién gobierna y quién fiscaliza se DERIVA de las áreas delegadas, no del
    // nombre de un partido: la frase tiene que aguantar una coalición, un
    // cambio de cartera y a un concejal que deja el grupo de gobierno.
    'cargos.hero.lead':
      'El pleno tiene {total} escaños. {partido} suma {nGob} y se reparte todas las áreas delegadas; los {nOpo} restantes no dirigen ninguna, y ese es su papel: fiscalizar, no gestionar.',
    'cargos.hero.leadVarios':
      'El pleno tiene {total} escaños. {nGob} se reparten todas las áreas delegadas; los {nOpo} restantes no dirigen ninguna, y ese es su papel: fiscalizar, no gestionar.',
    // Nunca «la corporación cuesta X»: lo que el ISPA suma es lo PERCIBIDO por
    // los electos, sin cuotas empresariales, personal eventual ni asignación a
    // los grupos. Es la palabra equivocada sobre la cifra correcta, la misma
    // clase de defecto que «crédito» por «gastado» — y ya se corrigió una vez.
    'cargos.hero.coste':
      'Los {n} percibieron {importe} en {year} entre retribuciones y asistencias, y ninguno cobró cero.',
    'cargos.hero.fichas': 'Fichas biográficas oficiales en el portal: {n} de {total}',
    'cargos.composicion.title': 'Composición del pleno · {n} escaños',
    'cargos.composicion.gobiernan': 'con áreas delegadas · gobiernan',
    'cargos.composicion.fiscalizan': 'sin áreas delegadas · fiscalizan',
    'cargos.retri.eyebrow': 'Retribuciones · los {n}, ninguno a cero',
    'cargos.retri.title': 'Qué cobra la corporación, y de dónde sale cada cifra',
    // El techo, hecho visible: si el reparto no reconstruye el total que el
    // propio analizador calculó, la página retira los subtotales en vez de
    // publicar una aritmética que nadie ha comprobado.
    'cargos.retri.noCuadra':
      'El reparto entre dedicación y asistencias no reconstruye el total publicado, así que los subtotales de cada columna se retiran hasta que cuadren. La cabecera sigue siendo la cifra del ministerio.',
    'cargos.retri.fijadoPor': '· dedicación {dedicacion}, fijada en el acuerdo',
    // Nunca «sin datos» ni un hueco: el régimen SÍ consta en el acuerdo. Lo que
    // no consta es cuánto cobra cada cual, porque las filas del ISPA no llevan
    // nombre — y por eso el importe vive en el reparto, no en la tarjeta.
    'cargos.retri.asistenciasCargo': 'asistencias por sesión',
    'cargos.retri.asistenciasCargoNota': '· sin dedicación; el ISPA no publica el nombre',
    'cargos.gobierno.eyebrow': 'Gobierno · {n} concejales con áreas delegadas',
    'cargos.gobierno.title': 'Quién dirige qué',
    'cargos.gobierno.areas': 'Áreas delegadas · {n}',
    'cargos.oposicion.eyebrow': 'Oposición · {n} concejales sin áreas delegadas',
    'cargos.oposicion.title': 'Quién fiscaliza',
    'cargos.oposicion.nota':
      'Su tarjeta está vacía de gestión por institución, no por falta de datos. Lo que sí tienen es voto en el pleno y derecho a preguntar.',
    'cargos.plantilla.eyebrow': 'Otra cosa · no son los cargos electos',
    'cargos.plantilla.title': 'Plantilla municipal',
    'cargos.plantilla.personas': 'personas empleadas',
    'cargos.plantilla.plazas': 'plazas autorizadas',
    'cargos.plantilla.mujeres': 'mujeres',
    'cargos.plantilla.hombres': 'hombres',
    'cargos.plantilla.fuenteSexo':
      'El desglose por sexo es la última cifra publicada, y su fuente es un periódico comarcal, no el ayuntamiento:',
    // La fecha del acuerdo se DERIVA de dedicaciones.json, no se teclea: un
    // «07/07/2023» escrito aquí sobrevive al mandato que nombra.
    'cargos.fuentes':
      'Fuentes: corporación y fotografías de ribarroja.es · retribuciones fijadas en el acuerdo de pleno de {acuerdo} · importes percibidos del ISPA, Ministerio de Hacienda y Función Pública. Padrón actualizado el {fecha}.',
    'cargos.detalle.baja.banner':
      'Ya no forma parte de la corporación: {motivo}. El Pleno tomó razón el {fecha}.',
    'cargos.detalle.baja.fuente': 'Fuente',
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
    // El conector que ACOTA la credencial a las áreas donde se le encontró
    // relación, y sólo cuando no las alcanza todas. Sin él, la ficha imprime el
    // título y nada más, y quien lo lea puede darlo por bueno para todas las
    // delegaciones — incluidas aquellas en las que el curador expresamente no lo
    // encontró. Es cromo, así que se traduce; los títulos y los puestos que van
    // detrás no, porque son el texto literal del CV de una persona.
    //
    // Dice «solo en» y a continuación NOMBRES. Nunca «solo en 4 de 7»: eso es la
    // nota que esta sección existe para no dar.
    'encaje.card.soloEn': 'solo en',
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
    // Contra qué se comparó, cuando NADA en la ficha cita nada.
    //
    // Las frases de arriba hablan de «lo que aquí se cita», así que sin una sola
    // cita ninguna es cierta y la ficha se quedaba con dos etiquetas negativas y
    // ninguna procedencia: dos «sin relación declarada» sueltos se leen como un
    // hallazgo que ningún componente afirma. Ésta dice contra qué se comparó sin
    // decir nada de citas que no existen — y en particular NO niega corroboración
    // alguna, porque donde no se citó nada no se comprobó nada.
    'encaje.card.sinCita':
      'Lo que se compara es el CV que la propia persona declara y el ayuntamiento publica; aquí no se cita ninguna de sus entradas, así que no hay referencia cuyo respaldo describir.',
    'encaje.aviso.label': 'Advertencia de la biografía',
    // El mismo aviso, cuando la superficie NO enseña el texto literal de la
    // biografía sino la frase fija de más abajo — que la escribe este sitio, no
    // la biografía. La etiqueta sigue al contenido: se atribuye a la biografía
    // sólo lo que se cita entre comillas.
    'encaje.aviso.label.ficha': 'Advertencia sobre esta ficha',
    'encaje.aviso.contradice': 'contradicción sin resolver',
    'encaje.aviso.corrobora': 'otra fuente lo confirma',
    'encaje.aviso.matiza': 'matiz',
    // No dice «puede referirse a un área que ya no lleva»: `check:relations`
    // (areafit-officials) garantiza que cada fila juzga un área que la persona
    // lleva HOY, así que esa frase no podía ser cierta. Lo que sí cambió es el
    // reparto con el que se escribió la biografía.
    'encaje.aviso.area':
      'Sus áreas delegadas cambiaron durante el mandato. Esta fila juzga un área que lleva hoy; la biografía se escribió con el reparto anterior.',
    'encaje.card.gaps': 'qué falta',
    'encaje.card.law': 'qué exige la ley',
    'encaje.sinDelegacion.label': 'Sin delegación de área',
    'encaje.sinDelegacion.note':
      'No dirige ninguna concejalía, así que no hay área con la que comparar. El bloque en blanco refleja quién gobierna, no quién está formado.',
    'encaje.sinRevisar.label': 'Todavía sin revisar',
    'encaje.sinRevisar.note':
      'Dirige un área y aún no hemos revisado qué formación y experiencia declara. El hueco es nuestro, no suyo: no dice nada de esta persona, sólo que todavía no hemos hecho el trabajo.',
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
    'departamentos.card.declaraciones': 'Declaraciones contrastadas',
    'departamentos.card.sinContraste': 'sin contraste',
    'departamentos.card.sinVotoTranscrito': 'sin voto transcrito',
    'departamentos.detalle.back': '← Todos los departamentos',
    'departamentos.detalle.compromisos': 'Compromisos plenarios',
    'departamentos.detalle.promesas': 'Promesas electorales',
    'departamentos.detalle.agendas': 'Puntos debatidos sin voto transcrito',
    'departamentos.detalle.quejas': 'Quejas ciudadanas activas',
    'departamentos.detalle.declaraciones.eyebrow': 'Declaraciones en pleno',
    'departamentos.detalle.declaraciones.title':
      'Lo que se dijo en pleno sobre los temas de esta área',
    'departamentos.detalle.declaraciones.aviso':
      'Las pronunció cualquier grupo municipal, no necesariamente quien dirige el área: se agrupan por tema, no por quien habla.',
    'departamentos.detalle.declaraciones.vacio':
      'Todavía no hay declaraciones contrastadas sobre los temas de esta área.',
    'departamentos.detalle.barra.titulo': 'Contraste con los datos',
    'departamentos.detalle.barra.resto': 'contrastadas · {total} en total',
    'departamentos.detalle.empty.votes':
      '0 votos transcritos para esta concejalía — contribuye vía `npm run pleno-vote` o la plantilla de issue.',
    'departamentos.detalle.empty.promesas': 'Sin promesas registradas para esta concejalía.',
    'departamentos.detalle.empty.quejas': 'Sin quejas ciudadanas activas para esta concejalía.',
    'plazo.vencido': 'plazo vencido · sin evidencia de ejecución',
    'plazo.hint':
      'Fecha de compromiso superada sin que se haya registrado evidencia de ejecución. El estado editorial NO cambia automáticamente.',
    'liveTicker.plazosVencidos': 'plazos vencidos',
    'liveTicker.plazosVencidos.aria':
      '{n} compromisos municipales con plazo vencido sin evidencia de ejecución — abrir el panel de departamentos',
    'liveTicker.plazosVencidos.aria.uno':
      'un compromiso municipal con plazo vencido sin evidencia de ejecución — abrir el panel de departamentos',

    // Accessibility chrome
    'a11y.skipToContent': 'Saltar al contenido',
    'a11y.secciones': 'Secciones',
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
    // The counter above this line is an accumulation; the list below it is the
    // four most recent awards. Without the period between them the pair reads
    // as one summer's spending.
    'landing.contratos.acumulado': 'Acumulado',
    'landing.contratos.recientes': 'abajo, las últimas adjudicaciones',
    // La ficha de PLACSP que abre cada fila TITULA el presupuesto base y
    // esconde la adjudicación detrás de «Ver detalle de la adjudicación». Sin
    // nombrar la magnitud, el lector que comprobaba la cita encontraba otro
    // número y no tenía forma de saber cuál era cuál.
    'landing.contratos.importes': 'importe adjudicado, sin IVA',
    // El recuento y la suma de al lado describen conjuntos distintos: el primero
    // cuenta los contratos firmados y la segunda sólo los que publican importe.
    // La diferencia no es cero euros, es un importe que la fuente no da.
    'landing.contratos.sinImporte': '{n} sin importe publicado',
    'landing.contratos.lote.conBase':
      'Lote {n} de {total}{exp}. El enlace abre la ficha del expediente entero, cuyo presupuesto base es {base}.',
    'landing.contratos.lote.deTotal':
      'Lote {n} de {total}{exp}. El enlace abre la ficha del expediente entero, no la de este lote.',
    'landing.contratos.lote.simple':
      'Lote {n}{exp}. El enlace abre la ficha del expediente entero, no la de este lote.',
    'landing.contratos.lote.sinNumero':
      'Uno de varios contratos que comparten expediente{exp}. El enlace abre su ficha entera, no la de este contrato.',
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
      'Reúne por concejalía los votos de pleno, las promesas electorales y las quejas del canal, que sólo se cuentan como pendientes de respuesta cuando han llegado al registro del ayuntamiento. Un plazo vencido se marca como aviso editorial — el estado nunca se modifica de forma automática.',
    'landing.rendicion.cta': 'Ver dashboard por departamento →',
    'landing.rendicion.concejalias': 'Concejalías',
    'landing.rendicion.conResponsable': 'Con responsable',
    'landing.rendicion.concejales': 'Concejales',
    'landing.escanos': 'escaños',
    'landing.titulares': 'titulares',
    'landing.medios': 'medios',
    'landing.ofertas': 'ofertas',
    // Lo que la portada escribía a mano fuera del catálogo (#38): la tira de
    // indicadores, el bloque del alcalde, las notas de la columna y la cabecera.
    // Las cifras siguen en es-ES en los dos idiomas.
    'landing.kpi.poblacion': 'Población',
    'landing.kpi.poblacionAnio': 'Población {anio}',
    'landing.kpi.poblacion.sub': '10 años · INE',
    'landing.kpi.poblacion.subSinDato': 'INE Padrón',
    'landing.kpi.presupuesto': 'Presupuesto',
    'landing.kpi.presupuestoAnio': 'Presup. {anio}',
    'landing.kpi.presupuesto.definitivo': 'Ayto. · definitivo',
    'landing.kpi.presupuesto.ejec': '{pct} % ejec.',
    'landing.kpi.presupuesto.aprobado': 'CONPREL · aprobado',
    'landing.kpi.sinDato': 'sin dato',
    'landing.kpi.personal': 'Presup. personal',
    'landing.kpi.personal.sub': 'Cap.1 económico',
    'landing.kpi.contratos': 'Contratos adj.',
    'landing.kpi.contratosAnios': 'Contratos adj. {anios}',
    'landing.kpi.contratos.sub': 'acumulado · Gobierto/PLACSP',
    'landing.kpi.paro': 'Paro',
    'landing.kpi.paroPeriodo': 'Paro {periodo}',
    'landing.kpi.paro.sub': 'SEPE · paro registrado',
    'landing.kpi.pleno': 'Último pleno',
    'landing.kpi.pleno.sesiones': '{n} sesiones',
    'landing.alcalde.promesas': 'promesas',
    'landing.alcalde.promesas.title': 'Promesas documentadas del grupo {grupo}',
    'landing.alcalde.puntos': 'puntos en pleno',
    'landing.alcalde.puntos.title':
      'Puntos de orden del día gestionados por concejalías del Alcalde',
    'landing.alcalde.gobierno': 'Gobierno municipal',
    'landing.alcalde.definitivo': 'crédito definitivo',
    'landing.alcalde.definitivo.title':
      'Crédito definitivo del ejercicio: lo aprobado más las modificaciones de crédito, según el estado de ejecución del Ayuntamiento. Al lado, las obligaciones reconocidas.',
    'landing.alcalde.aprobado': 'presupuesto aprobado',
    'landing.alcalde.aprobado.title':
      'Presupuesto de gastos aprobado del ejercicio, según CONPREL (Ministerio de Hacienda). No es lo ejecutado.',
    'landing.alcalde.ejecutado': 'ejecutado',
    'landing.alcalde.contratos': 'contratos acumulados',
    'landing.alcalde.contratos.title':
      'Contratos adjudicados registrados en el portal de contratación, no solo los de este mandato',
    'landing.alcalde.subvenciones': 'subvenciones',
    'landing.alcalde.subvenciones.title':
      'Subvenciones concedidas por el Ayuntamiento (registro BDNS)',
    'landing.promesas.congelado': 'LOREG · congelado',
    'landing.topbar.edicion': 'ed. mañana',
    'landing.empleo.cierra': 'cierra {fecha}',
    'landing.contratos.sinCategoria': 'Contrato',
    'landing.contratos.sinAdjudicatario': 'Sin adjudicatario',
    'landing.contratos.concesion':
      'Concesión: el importe es el valor estimado por todo su plazo, no un gasto anual.',
    'landing.contratos.concesionAnios':
      'Concesión: el importe es el valor estimado por todo su plazo —{anios} años—, no un gasto anual.',
    'landing.prensa.oficial': 'Oficial',
    'landing.prensa.oficial.title': 'Fuente primaria · Ayuntamiento',
    'landing.participa.aviso': 'aviso',
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
    'nav.eficiencia': 'Eficiència',
    'nav.gestion': 'Gestió',
    'eficiencia.eyebrow': 'Ajuntament · cost efectiu dels serveis',
    'eficiencia.title': 'Quant costa i què se n\u2019obté?',
    'eficiencia.intro':
      'El que cada servei municipal va costar, dividit pel que va produir, i on queda això entre municipis valencians de mida semblant. No hi ha nota global ni rànquing: cada indicador va amb la seua font, la seua manera de gestió i els seus advertiments.',
    'eficiencia.cobertura.titulo': 'Què cobreix aquesta pàgina',
    'eficiencia.cobertura.conRatio': 'amb cost i unitat declarats',
    'eficiencia.cobertura.concesion': 'en concessió (el cost no el suporta l\u2019ajuntament)',
    'eficiencia.cobertura.sinUnidad': 'sense unitat física declarada',
    'eficiencia.cobertura.sinCoste': 'sense cost utilitzable',
    'eficiencia.cobertura.noSePresta': 'no es presten',
    'eficiencia.pares.ver': 'Veure els municipis comparats',
    'eficiencia.pares.nota':
      'Només es compara amb municipis que presten el servei de la MATEIXA manera de gestió i que declaren les dues xifres.',
    'eficiencia.pares.municipio': 'Municipi',
    'eficiencia.pares.poblacion': 'Població',
    'eficiencia.pares.valor': 'Cost unitari',
    'eficiencia.tier.input': 'preu',
    'eficiencia.tier.carga': 'càrrega de treball',
    'eficiencia.tier.output': 'producte',
    'eficiencia.tier.outcome': 'resultat',
    'eficiencia.pares.atipico': "fora d'un ordre de magnitud",
    'eficiencia.competencia.eyebrow': 'Competència delegada',
    'eficiencia.competencia.editorial': "L'atribució la fem nosaltres — per què",
    'eficiencia.empty': 'Encara no hi ha indicadors calculats.',
    'eficiencia.subnav.aria': 'Seccions de la pàgina',
    'eficiencia.subnav.lectura': 'Lectura',
    'eficiencia.subnav.cobertura': 'Cobertura',
    'eficiencia.subnav.servicios': 'Serveis',
    'eficiencia.subnav.declaracion': 'Declaració',
    'eficiencia.subnav.hallazgos': 'Troballes',
    'eficiencia.subnav.preguntas': 'Preguntes',
    'eficiencia.preguntas.titulo': 'Preguntes registrades',
    'eficiencia.preguntas.porque': 'Es pregunta perquè:',
    'eficiencia.preguntas.verBase': 'veure la xifra →',
    'eficiencia.preguntas.replica':
      'Dret de rèplica obert per a les institucions destinatàries — la via:',
    'eficiencia.preguntas.replicaLink': 'avís legal',
    'empleoPublico.eyebrow': 'Ajuntament · processos selectius',
    'empleoPublico.title': 'Ocupació pública',
    'empleoPublico.intro1':
      'Processos selectius del mateix Ajuntament de Riba-roja de Túria — oposicions, borses de treball i estabilització. Diferent de les ofertes de l’Agència de Col·locació (veure ',
    'empleoPublico.intro2': '). Font: portal municipal.',
    'empleoPublico.empty': 'No hi ha processos selectius publicats ara mateix.',
    'nav.laboratorio': 'Laboratori',
    'nav.nosotros': 'Qui som',
    'nav.despiece': 'Despiece (dev)',
    'nav.agentes': 'Periodistes',
    'nav.frontera': 'Frontera',
    'nav.costeEsperado': 'Cost esperat',
    'nav.cobertura': 'Cobertura',
    'nav.section': 'Navegació',
    'nav.curator': 'Curator (dev)',
    'nav.grupo.gobierno': 'Govern',
    'nav.grupo.gobierno.lede': 'qui decideix',
    'nav.grupo.dinero': 'Diners',
    'nav.grupo.dinero.lede': 'quant, en què i a qui',
    'nav.grupo.vigilancia': 'Vigilància',
    'nav.grupo.vigilancia.lede': 'què canvia i què s’acara',
    'nav.grupo.ciudadania': 'Ciutadania',
    'nav.grupo.ciudadania.lede': 'què pots fer',
    'nav.grupo.laboratorio': 'Laboratori',
    'nav.grupo.laboratorio.lede': 'dades i experiments',
    'vivo.cerrar': 'Tancar el detall',
    'vivo.wmo.0': 'Serè',
    'vivo.wmo.1': 'Majoritàriament serè',
    'vivo.wmo.2': 'Parcialment ennuvolat',
    'vivo.wmo.3': 'Ennuvolat',
    'vivo.wmo.45': 'Boira',
    'vivo.wmo.48': 'Boira gelada',
    'vivo.wmo.51': 'Plugim lleu',
    'vivo.wmo.53': 'Plugim',
    'vivo.wmo.55': 'Plugim intens',
    'vivo.wmo.61': 'Pluja lleu',
    'vivo.wmo.63': 'Pluja',
    'vivo.wmo.65': 'Pluja intensa',
    'vivo.wmo.71': 'Neu lleu',
    'vivo.wmo.73': 'Neu',
    'vivo.wmo.75': 'Neu intensa',
    'vivo.wmo.80': 'Xàfecs',
    'vivo.wmo.81': 'Xàfecs forts',
    'vivo.wmo.82': 'Xàfec violent',
    'vivo.wmo.95': 'Tempesta',
    'vivo.wmo.96': 'Tempesta amb calamarsa',
    'vivo.wmo.variable': 'Variable',
    'vivo.aqi.buena': 'Bona',
    'vivo.aqi.razonable': 'Raonable',
    'vivo.aqi.moderada': 'Moderada',
    'vivo.aqi.mala': 'Dolenta',
    'vivo.aqi.muyMala': 'Molt dolenta',
    'vivo.aqi.extrema': 'Extremadament dolenta',
    'vivo.aqi.sinDato': 'sense lectura',
    'vivo.hoy.chip': 'Hui · {t}° · L9 {m}',
    'vivo.hoy.chip.sinTiempo': 'Hui · L9 {m}',
    'vivo.hoy.chip.sinMetro': 'Hui · {t}°',
    'vivo.hoy.chip.solo': 'Hui',
    'vivo.hoy.espera': '{m} min',
    'vivo.hoy.ahora': 'ara',
    'vivo.hoy.manana': '{m} min (demà)',
    'vivo.fila.hoy': 'Hui',
    'vivo.fuente.transcrita': 'FGV · fgv.es (horari transcrit)',
    'vivo.hoy.aria': 'El temps, l’aire i el metro d’hui — obrir el detall',
    'vivo.hoy.titulo': 'Hui a Riba-roja',
    'vivo.hoy.tiempo': 'Temps',
    'vivo.hoy.aire': 'Aire',
    'vivo.hoy.metro': 'Metro',
    'vivo.fila.sensacion': 'Sensació tèrmica',
    'vivo.fila.humedad': 'Humitat',
    'vivo.fila.viento': 'Vent',
    'vivo.fila.lluvia': 'Prob. pluja (hui)',
    'vivo.fila.amanece': 'Eixida del sol',
    'vivo.fila.anochece': 'Posta de sol',
    'vivo.fila.manana': 'Demà',
    'vivo.fila.proximo': 'Pròxim tren',
    'vivo.fila.faltan': 'Falten',
    'vivo.fila.sentido': 'Sentit',
    'vivo.fila.estacion': 'Estació',
    'vivo.fila.fuente': 'Font',
    'vivo.aire.serie': 'PM₂.₅ · últimes 24 h',
    'vivo.fuente.tiempo': 'Open-Meteo · actualitzat cada 10 min',
    'vivo.fuente.aire': 'Open-Meteo Air Quality · EAQI (EEA) · actualitzat cada 15 min',
    'vivo.metro.manana': '{hora} (demà)',
    'vivo.metro.hacia': 'Cap a {destino}',
    'vivo.metro.estacion': '{estacion} (terminal)',
    'vivo.metro.aviso':
      'Prem qualsevol estació de la L9 al mapa per a veure els pròxims trens en els dos sentits.',
    'vivo.metro.oficial': 'Veure l’horari oficial →',
    'vivo.horario.transcrito': 'Horari transcrit de fgv.es',
    'vivo.horario.valido': '{fuente} · vàlid fins a {fecha}',
    'vivo.horario.referencia': '{fuente} · horari de REFERÈNCIA, no vigent; confirma-ho en fgv.es',
    'nav.grupo.proyecto': 'Sobre CivicPulse',
    'nav.desc.cambios': 'El que ha canviat en els últims dies',
    'nav.desc.cargos': 'Regidors, àrees i retribucions',
    'nav.desc.presup': 'L’aprovat, l’executat, contractes i deute',
    'nav.desc.eficiencia': 'Cost unitari dels serveis, respecte a municipis de mida semblant',
    'nav.desc.gestion': 'Terminis de pagament, concurrència en contractes i execució',
    'nav.desc.plenos': 'Sessions, ordres del dia i votacions',
    'nav.desc.promesas': 'Compromisos per partit, cadascun amb la seua font',
    'nav.desc.departamentos': 'Acords i terminis, regidoria a regidoria',
    'nav.desc.hallazgos': 'Fitxes sobre el que s’ha dit en el ple, amb els seus documents',
    'nav.desc.reportajes': 'Investigacions llargues, cada afirmació amb la seua font',
    'nav.desc.declaraciones': 'El que s’afirma en el ple, contrastat amb dades obertes quan es pot',
    'nav.desc.datos': 'Tot el que alimenta el web, descarregable',
    'nav.desc.quejas': 'Les queixes veïnals, agregades i anònimes',
    'nav.desc.empleo': 'Ofertes de l’Agència de Col·locació',
    'nav.desc.empleoPublico': 'Oposicions i borses de l’Ajuntament',
    'nav.desc.laboratorio': 'Afirmacions de premsa enfront de les dades públiques',
    'nav.desc.frontera': 'Anàlisi envolupant de dades, i el que no mesura',
    'nav.desc.costeEsperado': 'Quin cost caldria esperar segons la població',
    'nav.desc.cobertura': 'Què podem comprovar i què no',
    'nav.desc.agentes': 'Informes d’un agent d’IA, revisats abans de publicar',
    'nav.desc.curator': 'Taula de curació (només en desenvolupament)',
    'nav.desc.despiece': 'D’on ix cada dada (només en desenvolupament)',
    'secciones.indice': 'Índex',
    'secciones.indice.titulo': 'Totes les seccions',
    'secciones.queja': 'Posar una queixa',
    'secciones.queja.nota': '(obri Telegram en una altra pestanya)',

    // Reportatges (índex de peces long-form)
    'reportajes.eyebrow': 'CivicPulse · investigacions de dades',
    'reportajes.title': 'Reportatges',
    'reportajes.intro':
      'Peces llargues a partir del registre públic: xifres congelades en el moment de la publicació i cada afirmació amb la seua font.',
    'reportajes.read': 'Llegir el reportatge →',
    'reportajes.indice': 'En aquesta peça',
    'reportajes.indice.apartados': '{n} apartats',
    'reportajes.mas': 'Més reportatges',
    'reportajes.todos': 'Tots els reportatges →',

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
    'empleo.card.publicada': 'publicada {fecha}',
    'empleo.kpi.closing': 'Tanquen ≤14 dies',
    'empleo.kpi.of': 'de',
    'empleo.kpi.ofShown': 'de {n} mostrades',
    'empleo.kpi.vehicle': 'requereixen vehicle propi',
    'empleo.chart.byMonth': 'Ofertes per mes',
    'empleo.chart.byContract': 'Tipus de contracte',
    'empleo.chart.byMunicipio': 'On',
    'empleo.stats.thin': 'Poques dades',
    'empleo.chart.coverage':
      '{n} ofertes no porten municipi en la seua fitxa i queden fora d’aquest gràfic',
    'empleo.chart.coverage.enRiba':
      ' — d’elles, {enRiba} sí que diuen Riba-roja de Túria en el llistat, i són les que el recompte de dalt suma i aquest gràfic no',
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
    'map.layer.money': 'Contractes situats',
    'map.layer.obras': 'Obres 2019–2024',
    'map.layer.poi': 'Serveis',
    'map.layer.quejas': 'Queixes',
    'map.layer.flood': 'Risc d’inundació',
    'map.layer.incendios': 'Incendis forestals',
    'map.quejas.title': 'Queixes per barri',
    'map.quejas.crit': 'silenci alt',
    'map.quejas.warn': 'silenci moderat',
    'map.quejas.ok': 'majoria resoltes',
    'map.quejas.civic': 'en curs',
    'map.quejas.radius': 'radi ∝ nº de queixes',
    'map.quejas.cobertura': 'sobre {q} queixa(es) en {b} barri(s)',
    'map.quejas.escalaParcial': "la resta de nivells de l'escala no es donen hui",
    'map.estacion.terminal': 'Terminal',
    'map.estacion.aprox': 'aprox',
    'map.estacion.verEnMetrovalencia': 'veure l’horari en metrovalencia.es',
    'map.estacion.aproximado': 'Línia {linea} — horari aproximat (cada {min} min).',
    'map.estacion.linea': 'Línia {linea} — Metrovalencia (FGV).',
    'map.estacion.estimacion': 'Estimació a partir de fgv.es',
    'map.estacion.oficialLinea': 'Horari oficial {linea} →',
    'map.estacion.adif':
      'Estació sobre la línia d’Adif (ferrocarril convencional). No forma part de L9 Metrovalencia.',
    'map.estacion.adifOperador': 'Adif · Xarxa convencional',
    'map.estacion.renfe': 'Horaris de Renfe Cercanías València →',
    'map.estacion.redHorarios': 'Veure els horaris en metrovalencia.es →',
    'map.money.title': 'Contractes situats',
    'map.money.dana': 'Només DANA',
    'map.money.obras': 'Només obres',
    'map.timeline.play': 'Reproduir la línia de temps',
    'map.timeline.pause': 'Pausar la línia de temps',
    // Ver la nota del bloque castellano: el rótulo decía «obra» sobre una capa
    // que pinta todo el gasto situado. Aquí además estaba sin traducir.
    'map.money.accum': 'adjudicat acumulat',
    'map.money.detalle': 'Detall',
    'map.money.of': 'de',
    'map.money.coverage':
      "Només els contractes el títol dels quals nomena un lloc. La resta són serveis d'àmbit municipal —la concessió de l'aigua, la recollida de residus, la neteja viària— adjudicats per tot el seu termini i sense un punt al mapa.",
    'map.poi.title': 'Serveis públics',
    'map.poi.source': 'OpenStreetMap · dades obertes',
    'map.flood.title': 'Risc d’inundació',
    'map.flood.loading': 'carregant trames…',
    'map.flood.error': 'el servei de l’ICV no respon ara mateix',
    'map.incendios.title': 'Incendis forestals',
    'map.incendios.serie': 'Sèrie d’incendis',
    'map.incendios.sinIncendios': 'sense incendis',
    'map.incendios.acumulados': '{n} incendis acumulats des de {desde}',
    'map.incendios.tono.reciente': '−10 anys',
    'map.incendios.tono.medio': '10-20',
    'map.incendios.tono.antiguo': '+20 anys',
    'map.incendios.causaTitulo': 'Causa segons el part',
    'map.incendios.sobre': 'Sobre {n} parts amb causa determinada',
    'map.incendios.noConsta': '; en altres {n} no hi consta',
    'map.incendios.resumen': '{n} incendis · {desde}–{hasta} · {ha} ha',
    'map.incendios.superficie':
      'La superfície és la de cada incendi complet, no sols la part que va cremar dins del terme.',
    'map.incendios.cartografia.meses':
      'La cartografia de l’ICV arriba a {hasta}: dels últims mesos no hi ha perímetres dibuixats, ni constància ací de si hi va haver incendis.',
    'map.incendios.cartografia.anios':
      'La cartografia de l’ICV arriba a {hasta}: dels últims {n} anys no hi ha perímetres dibuixats, ni constància ací de si hi va haver incendis.',
    'map.incendios.fueraDelTermino.uno':
      'Un altre incendi ({ha} ha) consta a nom de Riba-roja, però la Generalitat el dibuixa fora del terme, així que no es pinta.',
    'map.incendios.fueraDelTermino.varios':
      'Uns altres {n} incendis ({ha} ha) consten a nom de Riba-roja, però la Generalitat els dibuixa fora del terme, així que no es pinten.',
    'map.incendios.contratosSinSituar':
      'L’ajuntament té {n} contractes que parlen d’incendis i cap no es pot situar al mapa: la prevenció es contracta per a tot el municipi i no nomena cap paratge.',
    'map.poi.categoria.educacion': 'Educació',
    'map.poi.categoria.salud': 'Salut',
    'map.poi.categoria.verde': 'Zones verdes',
    'map.poi.categoria.deporte': 'Esport',
    'map.poi.categoria.cultura': 'Cultura',
    'map.money.slider': 'Línia de temps dels contractes situats per zona',
    'map.eventos.hoy': 'HUI A RIBA-ROJA',
    'map.eventos.manana': 'DEMÀ A RIBA-ROJA',
    'map.eventos.participa': 'participa ›',
    'participa.tipo.activity': 'Activitat',
    'participa.tipo.survey': 'Enquesta',
    'participa.tipo.other': 'Avís',
    'participa.tipo.desconocido': 'Participació',
    'liveTicker.aria': 'Dades nacionals en directe',
    // La cinta de datos nacionales: ver la nota del bloque castellano.
    'liveTicker.directo': 'EN DIRECTE',
    'liveTicker.luz': 'Llum PVPC',
    'liveTicker.luz.aria': 'Preu de la llum {valor} euros per quilowatt hora',
    'liveTicker.luz.curva': 'Corba 24h · €/kWh',
    'liveTicker.gasolina95': 'Gasolina 95',
    'liveTicker.gasolina95.aria': 'Gasolina 95, mitjana de {valor} euros per litre',
    'liveTicker.gasolina.estaciones': 'est.',
    'liveTicker.diesel': 'Dièsel A',
    'liveTicker.diesel.aria': 'Dièsel A, mitjana de {valor} euros per litre',
    'liveTicker.euribor': 'Euríbor 12m',
    'liveTicker.euribor.aria': 'Euríbor 12 mesos {valor} per cent',
    'liveTicker.ipc': 'IPC Espanya',
    'liveTicker.ipc.aria': 'IPC interanual Espanya {valor} per cent',
    'liveTicker.ipc.historia': 'IPC últims 12 mesos · %',
    'liveTicker.bce': 'BCE MRO',
    'liveTicker.bce.aria': 'Tipus principal del BCE {valor} per cent',
    'liveTicker.aemet': 'AEMET València',
    'liveTicker.aemet.aria': 'Alerta meteorològica AEMET nivell {nivel}',
    'liveTicker.aemet.nivel.amarillo': 'groc',
    'liveTicker.aemet.nivel.naranja': 'taronja',
    'liveTicker.aemet.nivel.rojo': 'roig',
    'liveTicker.dgt': 'DGT trànsit',
    'liveTicker.dgt.incidencias': 'incid.',
    'liveTicker.dgt.aria': '{n} incidències de trànsit a la zona',
    'liveTicker.dgt.aria.una': 'una incidència de trànsit a la zona',
    'liveTicker.dgt.mas': '+{n} més',
    'liveTicker.noticia.aria': 'Notícia de {fuente}: {titulo}',
    'liveTicker.panel.cerrar': 'Tancar',
    'liveTicker.panel.min': 'mín.',
    'liveTicker.panel.max': 'màx.',
    'liveTicker.panel.fuente': 'Font oficial →',
    'tiempo.ahora': 'ara',
    'tiempo.haceMin': 'fa {n} min',
    'tiempo.haceHoras': 'fa {n} h',
    'tiempo.haceDias': 'fa {n} d',
    'contrato.relacion.zonaYMateria': 'mateixa zona i matèria',
    'contrato.relacion.zona': 'mateixa zona',
    'contrato.relacion.materiaYFechas': 'mateixa matèria i dates pròximes',
    'pleno.tipo.ordinario': 'Ordinari',
    'pleno.tipo.extraordinario': 'Extraordinari',
    'pleno.tipo.urgente': 'Urgent',
    'pleno.tipo.otro': 'Altre',
    'map.flood.nota':
      'Zones oficials de perillositat · {fuente} (Generalitat Valenciana / ICV). Tons més intensos = més risc.',

    // Globos y rótulos flotantes del mapa: ver la nota del bloque castellano.
    'map.barrio.habitantes': '{n} hab.',
    'map.barrio.osm': 'Barri OSM',
    'map.barrio.inversion': 'Inversió situada',
    'map.barrio.danaIncluida': 'inclou {importe} de recuperació DANA',
    'map.barrio.sinObras': 'sense obres el títol de les quals nomene el barri',
    'map.barrio.sinQuejas': 'sense queixes de veïns',
    'map.obras.una': 'obra',
    'map.obras.varias': 'obres',
    'map.quejas.una': '{n} queixa',
    'map.quejas.varias': '{n} queixes',
    'map.lugar.street': 'Carrer / camí',
    'map.lugar.poi': 'Equipament',
    'map.lugar.urbanizacion': 'Urbanització',
    'map.lugar.barrio': 'Barri',
    'map.lugar.lote': 'Lot de: «{titulo}»',
    'map.lugar.pie':
      'Només obres el títol de les quals nomena un carrer, una zona o un equipament · PLACSP/TED',
    'map.incendio.deAnyo': 'Incendi de {anyo}',
    'map.incendio.superficie': 'superfície de l’incendi complet',
    'map.incendio.atribuido':
      'La Generalitat l’atribueix a {municipio}; el seu perímetre entra a Riba-roja.',
    'map.incendio.detectado': 'Detectat',
    'map.incendio.extinguido': 'Extingit',
    'map.incendio.sinFecha': 'sense data en el part',
    'map.incendio.causaRotulo': 'Causa',
    'map.incendio.causaNoConsta': 'no consta en el part',
    'map.incendio.reparto': 'Repartiment',
    'map.incendio.repartoHa': '{arbolada} ha arbrades · {noArbolada} ha no arbrades',
    'map.incendio.parte': 'Part {id} · {fuente}',
    'map.incendio.otroTermino': 'consta en un altre terme',
    'map.incendio.causa.intencionado': 'Intencionat',
    'map.incendio.causa.negligencia': 'Negligència o accident',
    'map.incendio.causa.rayo': 'Llamp',
    'map.incendio.causa.sinClasificar': 'Sense determinar',
    'map.obra.adjudicado': 'adj.',
    'map.obra.previsto': 'previst',
    'map.obra.inicio': 'inici {fecha}',
    'map.obra.ejecucion': 'execució {fecha}',
    'map.obra.baja': 'baixa {pct}%',
    'map.obra.meses': '{n} mesos',
    'map.obra.verFicha': 'Veure la fitxa ↗',

    // La tarjeta de contrato: ver la nota del bloque castellano.
    'contrato.adjudicatario': 'Adjudicatari:',
    'contrato.baja': 'Baixa d’adjudicació (adjudicació vs. licitació)',
    'contrato.sinFecha': 'sense data',
    'contrato.licitador': 'licitador',
    'contrato.licitadores': 'licitadors',
    'contrato.importeLicitacion': 'import de licitació',
    'contrato.situadoPor': 'situat per «{lugar}»',
    'contrato.quejasRelacionadas': 'Queixes ciutadanes relacionades',
    'contrato.estado.awarded': 'Adjudicat',
    'contrato.estado.formalized': 'Formalitzat',
    'contrato.estado.void': 'Anul·lat',
    'contrato.estado.revoked': 'Renúncia',
    'contrato.estado.abandoned': 'Desistit',
    'contrato.estado.withdrawn': 'Retirat',
    'contrato.estado.provisionally_awarded': 'Provisional',
    'contrato.estado.in_progress': 'En curs',
    'contrato.estado.open': 'Obert',
    'contrato.estado.evaluation': 'Valoració',
    'contrato.estado.pending': 'Pendent',
    'contrato.estado.draft': 'Esborrany',
    'contrato.estado.finalized': 'Finalitzat',
    'contrato.estado.closed': 'Tancat',
    'contrato.estado.unknown': 'Sense classificar',
    'contrato.tipo.services': 'Serveis',
    'contrato.tipo.construction': 'Obres',
    'contrato.tipo.supplies': 'Subministraments',
    'contrato.tipo.patrimonial': 'Patrimonial',
    'contrato.tipo.public_services_management': 'Gestió de serveis públics',
    'contrato.tipo.special_administrative': 'Administratiu especial',
    'contrato.tipo.other': 'Altres',
    'contrato.categoria.construction': 'Construcció',
    'contrato.categoria.environment': 'Medi ambient',
    'contrato.categoria.it': 'Informàtica',
    'contrato.categoria.health': 'Salut',
    'contrato.categoria.other': 'Altres',
    'contrato.categoria.transportation': 'Transport',
    'contrato.categoria.architecture': 'Arquitectura',
    'contrato.categoria.culture': 'Cultura',
    'contrato.categoria.legal': 'Jurídic',
    'contrato.categoria.maintenance': 'Manteniment',
    'contrato.categoria.education': 'Educació',
    'contrato.categoria.catering': 'Restauració',
    'contrato.categoria.security': 'Seguretat',
    'contrato.categoria.industry': 'Indústria',
    'contrato.categoria.energy': 'Energia',
    'contrato.categoria.agriculture': 'Agricultura',
    'contrato.categoria.textile': 'Tèxtil',
    'contrato.categoria.real_estate': 'Immobiliari',
    'contrato.categoria.audiovisual': 'Audiovisual',
    'contrato.categoria.furniture': 'Mobiliari',
    'contrato.categoria.print': 'Impremta',
    'contrato.categoria.software': 'Programari',
    'contrato.categoria.finance': 'Finances',
    'contrato.categoria.electrical': 'Material elèctric',
    'contrato.categoria.telecom': 'Telecomunicacions',
    'contrato.categoria.public_services': 'Serveis públics',
    'contrato.procedimiento.open': 'Obert',
    'contrato.procedimiento.open_simplified': 'Obert simplificat',
    'contrato.procedimiento.restricted': 'Restringit',
    'contrato.procedimiento.negotiated_without_publicity': 'Negociat sense publicitat',
    'contrato.procedimiento.negotiated_with_publicity': 'Negociat amb publicitat',
    'contrato.procedimiento.minor_contract': 'Contracte menor',
    'contrato.procedimiento.based_on_agreement': 'Basat en un acord marc',

    'common.loading': 'Carregant…',
    'common.noData': 'Sense dades',
    'common.compartirWhatsApp': 'Compartir per WhatsApp',
    'dataAsOf.datos': 'Dades',
    'dataAsOf.sinFecha': 'sense data de generació',
    'paginacion.aria': 'Paginació del {etiqueta}',
    'paginacion.anterior.aria': 'Pàgina anterior del {etiqueta}',
    'paginacion.siguiente.aria': 'Pàgina següent del {etiqueta}',
    'paginacion.anterior': '← Anterior',
    'paginacion.siguiente': 'Següent →',

    'declaraciones.eyebrow': 'Verificació de declaracions',
    'declaraciones.title': 'Declaracions en plenari',
    'declaraciones.subtitle':
      "Cada afirmació, promesa o acusació detectada als plens municipals, creuada contra les dades obertes publicades (PLACSP, BDNS, pressupost, promeses electorals). Atribució a nivell de grup. El veredicte de cada fila el posa un acarament automàtic: les declaracions sense atribuir o sense evidència es mantenen visibles perquè es van fer, i cap d'elles es converteix en una troballa editorial sense que una persona la signe.",
    'declaraciones.stat.total': 'Total',
    'declaraciones.stat.conEvidencia': 'Contrastades',
    'declaraciones.filter.verdict': 'Veredicte',
    'declaraciones.filter.bloc': 'Grup',
    'declaraciones.filter.topic': 'Tema',
    'declaraciones.filter.todas': 'Totes',
    'declaraciones.filter.todos': 'Tots',
    'declaraciones.filter.conEvidencia': 'Contrastades',
    'declaraciones.filter.atribuidas': 'Atribuïdes',
    'declaraciones.filter.sinCorpus': 'Sense corpus a consultar',
    'declaraciones.filter.comprobadoSinHallar': 'Comprovada, no apareix',
    'declaraciones.split.titulo': 'Per què «sense dades»',
    'declaraciones.split.cuerpo':
      'No és el mateix haver comprovat i no trobar res que no haver tingut amb què comprovar. El segon no diu res sobre la declaració: diu que encara no tenim eixe corpus.',
    'declaraciones.split.sinCorpus': 'sense corpus a consultar',
    'declaraciones.split.comprobadoSinHallar': 'comprovades, no apareixen',
    'declaraciones.search.placeholder': 'Cerca en el text literal…',
    'declaraciones.matchCount': 'declaracions coincideixen amb els filtres',
    'declaraciones.loadMore': 'Mostrar-ne més',
    'declaraciones.empty': 'Cap declaració coincideix amb els filtres actuals.',

    'cargos.eyebrow': 'Rendició de comptes',
    'cargos.title': 'Càrrecs i departaments',
    'plenos.eyebrow': 'Òrgans de govern',
    'plenos.title': 'Plens municipals',
    'plenos.indice.lede.celebradas': 'L’ajuntament ha celebrat {sesiones} des del {fecha}.',
    'plenos.indice.lede.celebradasSinFecha': 'L’ajuntament ha celebrat {sesiones}.',
    'plenos.indice.nSesiones': '{n} sessions',
    'plenos.indice.lede.cobertura':
      'D’aquestes, tenim l’ordre del dia de {agenda}, declaracions extretes de {decl} i {votos}.',
    'plenos.indice.lede.votos': 'votacions transcrites de {n}',
    'plenos.indice.lede.aviso':
      'El que esta pàgina no compta no vol dir que no passara: vol dir que encara no ho hem llegit.',
    'plenos.indice.actaEnRegmeet':
      'Cada sessió enllaça amb la seua acta a regmeet.com, el gestor del mateix ajuntament.',
    'plenos.indice.comoSeProcesa': 'Com es processa una sessió →',
    'plenos.indice.fuente':
      'Font: actes i vídeos publicats per l’Ajuntament de Riba-roja de Túria a regmeet.com.',
    'plenos.indice.ultimaSesion': 'Última sessió recollida: {fecha}.',
    'plenos.indice.enlace.participacion': 'Participació ciutadana →',
    'plenos.indice.enlace.hallazgos': 'Troballes →',
    'plenos.indice.enlace.metodologia': 'Metodologia →',
    'plenos.indice.deTotal': '{n} de {total}',
    'plenos.indice.escalera.titulo': 'Què tenim de l’acta',
    'plenos.indice.escalera.sesiones': 'Sessions celebrades',
    'plenos.indice.escalera.orden': 'Amb l’ordre del dia extret',
    'plenos.indice.escalera.declaraciones': 'Amb declaracions extretes',
    'plenos.indice.escalera.votaciones': 'Amb votacions transcrites',
    'plenos.indice.escalera.nota':
      'Els quatre graons es compten sobre les mateixes {n} sessions, però no estan niats:',
    'plenos.indice.escalera.declSinOrden.uno':
      'una sessió té declaracions extretes sense el seu ordre del dia',
    'plenos.indice.escalera.declSinOrden.varios':
      '{n} sessions tenen declaracions extretes sense el seu ordre del dia',
    'plenos.indice.escalera.votosSinDecl.uno': 'una té votacions sense declaracions',
    'plenos.indice.escalera.votosSinDecl.varios': '{n} tenen votacions sense declaracions',
    'plenos.indice.escalera.ambas': '{a}, i {b}',
    'plenos.indice.escalera.sueltas':
      '{lista}. L’ordre del dia el publica regmeet i les declaracions ixen de la transcripció, així que una sessió pot tindre el segon sense el primer.',
    'plenos.indice.escalera.anidadas':
      'hui cada graó resulta ser un subconjunt de l’anterior, però és una coincidència de la cobertura, no una garantia: l’ordre del dia el publica regmeet i les declaracions ixen de la transcripció.',
    'plenos.indice.escalera.sube':
      'La cobertura puja quan es transcriu una sessió antiga, no quan el ple es reunix.',
    'plenos.indice.columna.fecha': 'Data',
    'plenos.indice.columna.tipo': 'Tipus',
    'plenos.indice.columna.puntos': 'Punts de l’ordre del dia',
    'plenos.indice.columna.decl': 'Declaracions',
    'plenos.indice.columna.votos': 'Votacions',
    'plenos.indice.columna.hall': 'Troballes',
    'plenos.indice.celda.puntos': 'Punts',
    // «per extraure» y no «sense extraure»: a 1280 px «sense transcriure» se salía 2 px
    // de su columna y tocaba la de al lado. Miden lo mismo que el castellano.
    'plenos.indice.sinExtraer': 'per extraure',
    'plenos.indice.sinTranscribir': 'per transcriure',
    'plenos.indice.tabla.eyebrow': 'Les sessions · {n}',
    'plenos.indice.tabla.titulo': 'Una fila per sessió, de l’última a la primera',
    'plenos.indice.filtros.aria': 'Filtrar sessions',
    'plenos.indice.filtros.ver': 'Veure',
    'plenos.indice.filtro.todas': 'Totes',
    'plenos.indice.filtro.votos': 'Amb votacions',
    'plenos.indice.filtro.declaraciones': 'Amb declaracions',
    'plenos.indice.filtro.sin-orden': 'Sense ordre del dia',
    'plenos.indice.filtro.no-ordinarias': 'Extraordinàries i urgents',
    'plenos.indice.anio.deSesiones': '{n} de {total} sessions',
    'plenos.indice.filtroVacio': 'Cap sessió complix eixe filtre.',
    'plenos.indice.leyenda.puntos': 'punts de l’ordre del dia, a escala comuna',
    'plenos.indice.leyenda.sinExtraer':
      'la sessió es va celebrar; eixa part de l’acta no està processada',
    'plenos.indice.leyenda.cero': 'processada, i res publicat en eixa columna',
    'plenos.indice.leyenda.noMide': 'Cap xifra d’esta taula mesura l’activitat del ple.',
    'plenos.indice.votos.eyebrow': 'Votacions transcrites · {n} sessions de {total}',
    'plenos.indice.votos.titulo': 'De {total} votacions registrades, {aprobado} es van aprovar',
    'plenos.indice.votos.desenlace.aprobado': 'aprovat',
    'plenos.indice.votos.desenlace.rechazado': 'rebutjat',
    'plenos.indice.votos.desenlace.retirado': 'retirat',
    'plenos.indice.votos.desenlace.aplazado': 'ajornat',
    'plenos.indice.votos.desglose':
      'Els desglossaments per grup ixen d’una {transcripcion} del vídeo, no de l’acta: el resultat el publica l’ajuntament, el repartiment de vots l’inferix el sistema. Per això cadascun porta la seua procedència per separat.',
    'plenos.indice.votos.transcripcion': 'transcripció automàtica',
    'plenos.indice.votos.retirada':
      'Quan la font no sosté el que es va publicar, es retira la part que no aguanta —el registre sencer, el repartiment per grups o només el termini— i es diu, en compte de corregir-ho en silenci.',
    'plenos.indice.decl.extraidas': 'Extretes de la transcripció',
    'plenos.indice.decl.extraidas.nota': 'en {n} sessions amb transcripció',
    'plenos.indice.decl.retenidas': 'Retingudes per la porta editorial',
    'plenos.indice.decl.retenidas.nota':
      'acusacions públiques sense contrastar: no es publiquen ací',
    'plenos.indice.decl.sinProcedencia': 'Retingudes per falta de procedència',
    'plenos.indice.decl.sinProcedencia.nota':
      'el seu literal no consta en cap transcripció nostra: no es publiquen',
    'plenos.indice.decl.sinDatos': 'Publicades sense dades que les contrasten',
    'plenos.indice.decl.sinDatos.nota': 'ni confirmades ni desmentides',
    'plenos.indice.decl.contrastadas': 'Parcials o verificades',
    'plenos.indice.decl.contrastadas.nota': 'l’única cosa que va acarar un document municipal',
    'plenos.indice.decl.eyebrow': 'Declaracions extretes · {n} sessions',
    'plenos.indice.decl.titulo': '{extraidas} declaracions, {verificado} verificades',
    'plenos.indice.decl.sinDatosNota':
      'Un «sense dades» no desmentix res: diu que no hem trobat cap document municipal que en parle. Dels {sinDatos}, {sinCorpus} i {comprobado} es van comprovar sense trobar res.',
    'plenos.indice.decl.sinCorpus': '{n} no tenien corpus on buscar',
    'plenos.indice.decl.enlace': 'Verificació de declaracions, totes les sessions →',
    'plenos.indice.reparto.eyebrow': 'Repartiment per àrea · {puntos} punts de {sesiones} sessions',
    'plenos.indice.reparto.titulo': 'Quines àrees porten l’ordre del dia',
    'plenos.indice.reparto.enlace': 'Veure el panell per departament →',
    'plenos.indice.reparto.nota':
      'Són els punts de les {sesionesConOrden}, no de les {total}. I només {con} dels {puntos} punts porten àrea assignada. Una àrea amb pocs punts pot tindre molta activitat en sessions que encara no hem processat: este repartiment descriu la nostra cobertura tant com el treball del ple.',
    'plenos.indice.reparto.sesionesConOrden': '{n} sessions amb l’ordre del dia extret',
    'plenos.retirada.record.uno': 'registre',
    'plenos.retirada.record.varios': 'registres',
    'plenos.retirada.breakdown.uno': 'desglossament',
    'plenos.retirada.breakdown.varios': 'desglossaments',
    'plenos.retirada.plazo.uno': 'termini',
    'plenos.retirada.plazo.varios': 'terminis',
    'plenos.retirada.frase.uno': '{lista} retirat',
    'plenos.retirada.frase.varios': '{lista} retirats',
    'promesas.eyebrow': 'Transparència electoral',
    'promesas.title': 'Promeses per partit',
    'datos.eyebrow': 'Base estadística',
    'datos.title': 'Dades obertes',
    'presup.eyebrow': 'Hisenda pública',
    'presup.title': 'Pressupost municipal',
    'quejas.eyebrow': 'Veu ciutadana',
    'quejas.title': 'Queixes ciutadanes',
    'quejas.cruce.eyebrow': 'Creuament de dades · sense causalitat',
    'quejas.cruce.titulo': 'Queixes i contractes situats per barri',
    'quejas.cruce.intro':
      'Per barri: nombre de queixes ciutadanes enfront del que s’ha adjudicat en contractes ja situats allí. **Les dos columnes no cobrixen el mateix període**',
    'quejas.cruce.periodos':
      ': les queixes es recullen des de {periodoQuejas} i el que està situat acumula adjudicacions de {periodoContratos}',
    'quejas.cruce.periodos.sinFechas':
      ' — el canal de queixes és molt més recent que el registre de contractació',
    'quejas.cruce.cierre':
      ', així que comparar una columna amb l’altra no mesura la resposta municipal. Són xifres de context — l’absència de contractes situats **no** implica desatenció: moltes actuacions no anomenen el lloc en el títol i per això no se situen (vore',
    'quejas.cruce.metodologia': 'metodologia',
    'quejas.cruce.col.barrio': 'Barri',
    'quejas.cruce.col.quejas': 'Queixes',
    'quejas.cruce.col.adjudicado': 'Adjudicat situat',
    'quejas.cruce.sinSituado': 'sense contractes situats',
    'dashboard.eyebrow': 'Veu ciutadana · Tauler',
    'dashboard.title': 'Salut del canal de queixes',

    'plenos.votes.heading': 'Votacions registrades',
    'plenos.votes.empty.eyebrow': 'Sense dades',
    'plenos.votes.empty.title': 'Encara no hi ha votacions registrades',

    // Claim ledger (declaracions contrastades)
    'ledger.loadMore': 'Carrega més',

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
    'plenoDetail.extractionPending': 'sense extraure',
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
    // Per què un càrrec no porta xifres de resposta. El termini de la LPACAP
    // corre des del registre: sense registre no hi ha resposta que comptar.
    'quejas.reloj.sinRegistro':
      'Cap queixa d’aquesta àrea ha arribat encara al registre de l’ajuntament. El termini legal corre des del registre: sense ell no hi ha resposta que comptar, ni silenci.',
    'quejas.reloj.sinRegistro.corto': 'sense registre',
    'quejas.reloj.exportIncompleto':
      'El llistat publicat no coincideix amb el recompte del bot, així que no es pot saber quines queixes van arribar al registre.',
    'quejas.reloj.exportIncompleto.corto': 'llistat parcial',
    'quejas.reloj.sinDatos': 'No s’han pogut llegir les queixes publicades.',
    'quejas.reloj.sinDatos.corto': 'sense dades',
    'quejas.estado.capturada': 'Capturada',
    'quejas.estado.apoyada_verificada': 'Verificada',
    'quejas.estado.registrada': 'Registrada en seu',
    'quejas.estado.notificada_10d': 'Justificant rebut',
    'quejas.estado.en_tramite': 'En tràmit',
    'quejas.estado.resuelta': 'Resolta',
    'quejas.estado.silencio_negativo': 'Silenci administratiu',
    'quejas.estado.escalada_sindic': 'Elevada al Síndic',
    'quejas.estado.cerrada_no_registrada': 'Tancada sense registrar',
    'quejas.categoria.via_publica': 'Via pública',
    'quejas.categoria.limpieza': 'Neteja',
    'quejas.categoria.zonas_verdes': 'Zones verdes',
    'quejas.categoria.alumbrado': 'Enllumenat',
    'quejas.categoria.trafico': 'Trànsit',
    'quejas.categoria.mobiliario_urbano': 'Mobiliari urbà',
    'quejas.categoria.ruido': 'Soroll',
    'quejas.categoria.agua_saneamiento': 'Aigua i sanejament',
    'quejas.categoria.transporte': 'Transport',
    'quejas.categoria.transparencia': 'Transparència',
    'quejas.categoria.urbanismo': 'Urbanisme',
    'quejas.categoria.accesibilidad': 'Accessibilitat',
    'quejas.categoria.seguridad': 'Seguretat',
    'quejas.categoria.cultura': 'Cultura',
    'quejas.categoria.educacion': 'Educació',
    'quejas.categoria.servicios_sociales': 'Serveis socials',
    'quejas.categoria.medio_ambiente': 'Medi ambient',
    'quejas.categoria.residuos': 'Residus',
    'quejas.categoria.comercio': 'Comerç',
    'quejas.categoria.fiestas': 'Festes',
    'quejas.categoria.vivienda': 'Habitatge',
    'quejas.categoria.agricultura': 'Agricultura',
    'quejas.categoria.mayores': 'Majors',
    'quejas.categoria.juventud': 'Joventut',
    'quejas.categoria.turismo': 'Turisme',
    'quejas.categoria.salud': 'Salut',
    'quejas.categoria.deportes': 'Esports',
    'quejas.categoria.igualdad': 'Igualtat',
    'quejas.categoria.bienestar_animal': 'Benestar animal',
    'quejas.categoria.otros': 'Altres',
    'quejas.detalle.volver': '← Feed de queixes',
    'quejas.detalle.eyebrow': 'Queixa ciutadana · {id}',
    'quejas.detalle.compartir': 'Queixa {id} · {categoria} · {estado}',
    'quejas.detalle.apoyos': '{n} suports',
    'quejas.detalle.responsable': 'Responsable polític',
    'quejas.detalle.texto.eyebrow': 'Text de la queixa',
    'quejas.detalle.texto.titulo': 'Detall ciutadà (literal)',
    'quejas.detalle.foto.eyebrow': 'Imatge adjunta',
    'quejas.detalle.foto.titulo': 'Foto ciutadana (anonimitzada)',
    'quejas.detalle.foto.alt': 'Imatge de la queixa anonimitzada automàticament',
    'quejas.detalle.foto.pie':
      '🔒 Imatge anonimitzada automàticament · cares i matrícules difuminades abans de publicar. Si la vas enviar tu i hi veus dades personals, escriu {olvidar} al bot per a retirar-la; si hi apareixes, demana que la retiren des de l’{aviso}.',
    'quejas.detalle.foto.avisoLegal': 'avís legal',
    'quejas.detalle.relacion.eyebrow': 'Relació per zona i matèria · no causal',
    'quejas.detalle.relacion.titulo': 'Possibles actuacions municipals relacionades',
    'quejas.detalle.relacion.nota':
      'Contractes municipals que coincideixen amb esta queixa en {zona} i/o {materia}. La coincidència {no} implica que el contracte resolga el problema — és una relació de context, no causal.',
    'quejas.detalle.relacion.zona': 'zona',
    'quejas.detalle.relacion.materia': 'matèria',
    'quejas.detalle.relacion.no': 'no',
    'quejas.detalle.relacion.pastilla':
      'Relació determinista i verificable — coincidència de zona i/o matèria',
    'quejas.detalle.relacion.verContrato': 'Veure el contracte a contrataciondelestado.es →',
    'quejas.detalle.reloj.eyebrow': 'Rellotge legal',
    'quejas.detalle.reloj.titulo': 'Termini LPACAP en curs',
    'quejas.detalle.reloj.registrada': 'Registrada',
    'quejas.detalle.reloj.plazoMaximo': 'Termini màxim',
    'quejas.detalle.reloj.meses': '{n} mesos',
    'quejas.detalle.reloj.mes': '1 mes',
    'quejas.detalle.reloj.restantes': 'Dies restants',
    'quejas.detalle.reloj.excedidos': 'Dies excedits',
    'quejas.detalle.reloj.asiento': 'Assentament en seu',
    'quejas.detalle.historial.eyebrow': 'Historial',
    'quejas.detalle.historial.titulo': 'Línia temporal',
    'quejas.detalle.hito.capturada': 'Capturada a CivicPulse',
    'quejas.detalle.hito.capturada.detalle': 'Via bot de Telegram · barri {barrio}',
    'quejas.detalle.hito.verificada': 'Verificada per la comunitat',
    'quejas.detalle.hito.verificada.detalle':
      '{n} suports veïnals · llindar del lot setmanal assolit',
    'quejas.detalle.hito.registrada': 'Registrada en la seu electrònica',
    'quejas.detalle.hito.registrada.detalle':
      'Assentament {asiento} · inici del rellotge legal ({plazo})',
    'quejas.detalle.hito.silencio': 'Silenci administratiu negatiu',
    'quejas.detalle.hito.silencio.detalle': 'Termini legal vençut · art. 24 LPACAP',
    'quejas.detalle.hito.sindic': 'Elevada al Síndic de Greuges CV',
    'quejas.detalle.hito.sindic.detalle': 'Llei 11/1988 · resolucions públiques',
    'quejas.detalle.hito.resuelta': 'Resolta',
    'quejas.detalle.replica.eyebrow': 'Dret de rèplica oficial',
    'quejas.detalle.replica.titulo': 'Resposta de l’Ajuntament',
    'quejas.detalle.replica.fuente': 'Font primària →',
    'quejas.detalle.acciones.eyebrow': 'Accions',
    'quejas.detalle.acciones.titulo': 'Què pots fer?',
    'quejas.detalle.acciones.apoyar': 'Donar suport:',
    'quejas.detalle.acciones.apoyar.texto': 'escriu {comando} al xat del bot de Telegram.',
    'quejas.detalle.acciones.sindic': 'Presentar una queixa al Síndic:',
    'quejas.detalle.acciones.responder': 'Respondre com a responsable públic:',
    'quejas.detalle.acciones.responder.texto':
      'contacta amb la redacció tal com s’indica en {aviso}.',
    'quejas.detalle.noEncontrada.eyebrow': 'No trobada',
    'quejas.detalle.noEncontrada.titulo': 'Queixa {id}',
    'quejas.detalle.noEncontrada.texto':
      'Esta queixa no apareix en les dades publicades ara. Pot ser que s’haja arxivat o que l’identificador siga incorrecte.',
    'quejas.detalle.noEncontrada.volver': '← Tornar al feed públic',
    'dashboard.empty.title': 'El canal està obert, encara no hi ha queixes',

    'cambios.eyebrow': 'Esta setmana a Riba-roja',
    'cambios.title': 'Novetats',

    'cargos.detalle.notFound': 'Regidor/a no trobat/da.',
    'hallazgos.area.filtered': 'Filtrat per àrea',
    'hallazgos.area.clear': 'veure tots',
    'hallazgos.area.note':
      "Troballes les declaracions de les quals es classifiquen en esta àrea. L'atribució de cada troballa és al GRUP polític que va parlar, mai a una persona concreta.",
    'findings.refs.crossChecked': 'Documents contrastats',
    'findings.refs.provenance': 'Procedència de les cites',
    'findings.refs.contradiction': 'Documents que contradiuen',
    'findings.refs.date.award': 'adjudicació',
    'findings.refs.date.formalized': 'formalització',
    'findings.refs.date.start': 'inici',
    'findings.refs.date.opened': "obertura d'ofertes",
    'findings.refs.date.submission': 'termini de presentació',
    'findings.refs.date.session': 'sessió',
    'findings.refs.date.none': 'sense data publicada',
    'findings.refs.date.noneTitle':
      "El registre públic d'este document no publica cap data utilitzable. No vol dir que siga recent.",
    'findings.refs.status.cancelled': 'expedient anul·lat',
    'findings.refs.status.cancelledTitle':
      "El procediment va acabar sense contracte: es va anul·lar, se'n va desistir o va quedar desert. L'ajuntament no el va arribar a signar.",
    'findings.refs.status.committed': 'adjudicat',
    'findings.refs.status.committedTitle':
      'El registre publica este expedient com a adjudicat o formalitzat: hi ha contracte.',
    'findings.refs.status.in-flight': 'en licitació',
    'findings.refs.status.in-flightTitle':
      "L'expedient continua en marxa: publicat, en avaluació o amb adjudicació només provisional. Encara no hi ha contracte ferm.",
    'findings.refs.status.none': 'sense estat',
    'findings.refs.status.noneTitle':
      "El registre públic d'este document no publica cap estat utilitzable. No vol dir que s'anul·lara ni que se signara.",
    'cargos.detalle.actividad.eyebrow': 'Activitat de les seues àrees',
    'cargos.detalle.actividad.title': "Què s'ha debatut i verificat a les seues regidories",
    'cargos.detalle.actividad.intro':
      "Xifres de les àrees que dirigeix, no de la persona. Les votacions es registren per grup polític i les declaracions s'atribueixen al grup que va parlar, mai a un regidor concret: per això s'enllacen ací en lloc de mostrar-se sota la seua fitxa.",
    'cargos.detalle.actividad.votos': 'votacions',
    'cargos.detalle.actividad.declaraciones': 'declaracions contrastades',
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
    'presupuesto.ted.concentracion':
      "No és un volum repartit: el major anunci s'emporta el {pct} % del total ({importe}), perquè una concessió s'adjudica per tot el seu termini d'una vegada.",
    'presupuesto.ted.note':
      "TED no publica títol descriptiu per a estos anuncis —el número ÉS l'identificador—, així que cada fila enllaça a l'original. El símbol ≈ marca els anuncis sense data exacta: l'any es recupera del número de publicació i no s'inventa un dia.",
    'presupuesto.eyebrow': 'Hisenda pública · exercici {year} · aprovat i executat',
    'presupuesto.eyebrow.aprobado': 'Hisenda pública · exercici {year} · CONPREL',
    'presupuesto.title': 'Pressupost municipal {year}',
    'presupuesto.title.sinAnio': 'Pressupost municipal',
    'presupuesto.loading': 'Carregant dades reals de MinHac (CONPREL)…',
    'presupuesto.error': "No s'ha pogut carregar el pressupost real.",
    'presupuesto.gasto.eyebrow': 'Contractació municipal · {periodo} · Gobierto/PLACSP',
    'presupuesto.gasto.eyebrow.sinPeriodo': 'Contractació municipal · Gobierto/PLACSP',
    'presupuesto.gasto.titulo': 'On van els diners dels contractes?',
    'presupuesto.gasto.adjudicadoSinIva': 'adjudicat sense IVA',
    'presupuesto.gasto.ejercicios': '{n} exercicis, no un any',
    'presupuesto.gasto.intro.total': 'El total de dalt és {todo}:',
    'presupuesto.gasto.intro.todo': 'tot el que s’ha adjudicat en contractes, no només obres',
    'presupuesto.gasto.intro.obrasPct': 'les obres són el {pct} %',
    'presupuesto.gasto.intro.grueso': 'la major part',
    'presupuesto.gasto.intro.resto':
      'i la resta són serveis d’àmbit municipal, subministraments i altres —el desglossament complet és a «{pestana}».',
    'presupuesto.gasto.intro.periodo':
      'I és de {periodo}, no d’un sol exercici: posat sense període al costat d’un pressupost anual es llig molt més gran del que és.',
    'presupuesto.gasto.intro.noRepartido': 'No és un volum repartit:',
    'presupuesto.gasto.intro.mayorConcesion':
      'el contracte més gran —una concessió de {importe} M€— s’emporta ell sol el {pct} % del total, perquè una concessió s’adjudica per tot el seu termini d’una vegada.',
    'presupuesto.gasto.intro.mayor':
      'el contracte més gran —{importe} M€— s’emporta ell sol el {pct} % del total.',
    'presupuesto.gasto.intro.situados':
      'Només se situen els contractes el títol dels quals anomena una zona, i ací sí que predominen les obres ({pct} %). Mida del cercle = € adjudicat a la zona · ambre quan la meitat o més és recuperació DANA.',
    'presupuesto.gasto.intro.situadosSinPct':
      'Només se situen els contractes el títol dels quals anomena una zona. Mida del cercle = € adjudicat a la zona · ambre quan la meitat o més és recuperació DANA.',
    'presupuesto.gasto.soloDana': 'Només DANA',
    'presupuesto.gasto.pestana.explorar': 'Explorar contractes',
    'presupuesto.gasto.pestana.contratistas': 'Qui rep els diners?',
    'presupuesto.gasto.pestana.tipos': 'Tipus de contracte',
    'presupuesto.gasto.pestanas.aria': 'Vistes dels contractes',
    'presupuesto.gasto.mapa.aria': 'Mapa interactiu dels contractes municipals per zona',
    'presupuesto.gasto.mapa.ariaVacio': 'Mapa dels contractes municipals per zona',
    'presupuesto.gasto.mapa.vacio':
      'Encara no hi ha contractes situables en el període seleccionat.',
    'presupuesto.gasto.contratos.uno': '{n} contracte',
    'presupuesto.gasto.contratos.varios': '{n} contractes',
    'presupuesto.gasto.tiempo.reproducir': 'Reproduir la línia de temps',
    'presupuesto.gasto.tiempo.pausar': 'Pausar la línia de temps',
    'presupuesto.gasto.tiempo.aria': 'Línia de temps dels contractes situats',
    'presupuesto.gasto.cobertura.conPeriodo':
      'Dels {total} adjudicats en contractes (sense IVA) {periodo} —la suma acumulada de {n} exercicis, no d’un any—, {situado} ({pct}%) es poden situar al mapa.',
    'presupuesto.gasto.cobertura.sinPeriodo':
      'Dels {total} adjudicats en contractes (sense IVA), {situado} ({pct}%) es poden situar al mapa.',
    'presupuesto.gasto.cobertura.aLoLargo': 'al llarg de {periodo}',
    'presupuesto.gasto.cobertura.resto':
      'La resta d’eixe import adjudicat són contractes el títol dels quals no anomena cap zona (serveis, subministraments i obres sense lloc citat): no s’inventa una ubicació. Un contracte que cita dues zones suma en totes dues, però compta una sola vegada ací.',
    'presupuesto.gasto.zona.todas': '← totes les zones',
    'presupuesto.gasto.buscar': 'Cerca un contracte o una empresa…',
    'presupuesto.gasto.filtro.zona': 'Filtrar per zona',
    'presupuesto.gasto.filtro.zonas': 'Totes les zones',
    'presupuesto.gasto.filtro.tipo': 'Filtrar per tipus',
    'presupuesto.gasto.filtro.tipos': 'Tots els tipus',
    'presupuesto.gasto.resultado.uno': 'resultat',
    'presupuesto.gasto.resultado.varios': 'resultats',
    'presupuesto.gasto.resultado.pagina': '{desde}–{hasta}, pàgina {pagina} de {paginas}',
    'presupuesto.gasto.comprometido': 'són diners compromesos (adjudicats o formalitzats).',
    'presupuesto.gasto.sinAdjudicacion': 'import de licitació',
    'presupuesto.gasto.fueraDeCifras.uno':
      'L’altre consta en el registre públic però no compta en les xifres de dalt:',
    'presupuesto.gasto.fueraDeCifras.varios':
      'Els altres {n} consten en el registre públic però no compten en les xifres de dalt:',
    'presupuesto.gasto.listado': 'llistat de contractes',
    'presupuesto.gasto.razonesSociales': '{n} raons socials',
    'presupuesto.gasto.dana': 'Recuperació DANA ≈ {pct}% de l’import adjudicat.',
    'presupuesto.subvenciones.eyebrow': 'BDNS · {total} convocatòries · {municipales} municipals',
    'presupuesto.subvenciones.titulo': 'Subvencions · Base Nacional',
    'presupuesto.subvenciones.fuente': 'Dades reals de MinHac BDNS · pap.hacienda.gob.es',
    'presupuesto.obras.eyebrow': 'Urbanisme · infraestructures',
    'presupuesto.obras.titulo': 'Obres d’infraestructura · fitxes municipals 2019–2024',
    'presupuesto.obras.intro':
      '{n} obres publicades per l’Ajuntament en fitxes oficials: {renove} actuacions del Pla RENOVE d’adequació de vials (executades 2023–2024) i {feder} obres de 2019–2020 cofinançades amb el FEDER de la Comunitat Valenciana 2014–2020.',
    'presupuesto.obras.intro.soloFeder':
      '{n} obres publicades per l’Ajuntament en fitxes oficials: {feder} obres de 2019–2020 cofinançades amb el FEDER de la Comunitat Valenciana 2014–2020.',
    'presupuesto.obras.ultimas': 'Últimes fitxes publicades: febr. 2024',
    'presupuesto.obras.ejecutadas': 'obres ja executades · no reflecteix obres posteriors',
    'presupuesto.obras.renove': 'Pla RENOVE',
    'presupuesto.obras.baja': 'baixa',
    'presupuesto.obras.adj': 'adj.',
    'presupuesto.obras.previsto': 'previst',
    'presupuesto.obras.meses': '{n} mesos',
    'presupuesto.obras.inicio': 'inici {fecha}',
    'presupuesto.obras.ejecucion': 'execució {fecha}',
    'presupuesto.obras.verFicha': 'Veure la fitxa ↗',
    'presupuesto.obras.fuente':
      'Font: Ajuntament de Riba-roja de Túria — Portal de Transparència («obras de infraestructuras en curso») i pàgina del Pla RENOVE d’adequació de vials.',
    'presupuesto.obras.listado': 'llistat d’obres',
    'presupuesto.menores.eyebrow': 'Contractació · via directa',
    'presupuesto.menores.titulo': 'Contractes menors: {n} de {total}, {importe}',
    'presupuesto.menores.intro':
      'El contracte menor s’adjudica {sinLicitacion}. Són el {pct} % dels contractes adjudicats o signats i{importe}: molts expedients i poca part dels diners.',
    'presupuesto.menores.intro.sinLicitacion': 'sense licitació ni publicitat prèvia',
    'presupuesto.menores.intro.importe': 'el {pct} % de l’import',
    'presupuesto.menores.peso':
      'Eixe segon percentatge depén molt del denominador — una sola concessió de {importe}, adjudicada d’una vegada per tot el seu termini, és el {cuota} % de tot el que s’ha contractat; si s’aparta, els menors serien el {sin} %.',
    'presupuesto.menores.iva':
      'Totes les xifres van {sinIva}, perquè així defineix el sostre l’art. 118 de la Llei 9/2017 —{obras} en obres, {servicios} en serveis i subministraments.',
    'presupuesto.menores.iva.sinIva': 'sense IVA',
    'presupuesto.menores.sobreTecho': '{n} per damunt del sostre de l’art. 118',
    'presupuesto.menores.frente': 'enfront de',
    'presupuesto.menores.marca':
      'La marca «contracte menor» la posa el portal de contractació, no nosaltres, i una etiqueta equivocada en origen s’assembla exactament a un incompliment. Açò mesura la distància al límit legal i la publica; anomenar-ho infracció és un pas que no fa un programa.',
    'presupuesto.menores.sinTecho': '{n} sense sostre declarat per al seu tipus de contracte',
    'presupuesto.menores.sinImporte': '{n} sense import net publicat',
    'presupuesto.menores.sinComparar':
      '{lista}: no es comparen amb el límit, en compte de donar-los per dins.',
    'presupuesto.menores.anulados':
      'Altres {n} venien marcats com a menors i la seua adjudicació es va desfer: no compten com a despesa ni se’ls mesura el sostre.',
    'presupuesto.menores.norma': 'Llei 9/2017, art. 118',
    'presupuesto.deuda.titular.igual': 'Sense canvis en {anio}',
    'presupuesto.deuda.titular.sube': 'Puja en {anio}',
    'presupuesto.deuda.titular.baja': 'Baixa en {anio}',
    'presupuesto.deuda.titular.sigueSubiendo': 'Puja per {ordinal} any seguit',
    'presupuesto.deuda.titular.sigueBajando': 'Baixa per {ordinal} any seguit',
    'presupuesto.deuda.titular.subioYBaja': 'Va pujar en {anterior} i en {anio} baixa',
    'presupuesto.deuda.titular.bajoYSube': 'Va baixar en {anterior} i en {anio} torna a pujar',
    'presupuesto.deuda.titular.subioAniosYBaja':
      'Va pujar {cardinal} anys seguits, i en {anio} baixa',
    'presupuesto.deuda.titular.bajoAniosYSube':
      'Va baixar {cardinal} anys seguits, i en {anio} torna a pujar',
    'presupuesto.deuda.ordinal.2': 'segon',
    'presupuesto.deuda.ordinal.3': 'tercer',
    'presupuesto.deuda.ordinal.4': 'quart',
    'presupuesto.deuda.ordinal.5': 'cinqué',
    'presupuesto.deuda.ordinal.6': 'sisé',
    'presupuesto.deuda.ordinal.7': 'seté',
    'presupuesto.deuda.ordinal.otro': '{n}é',
    'presupuesto.deuda.cardinal.2': 'dos',
    'presupuesto.deuda.cardinal.3': 'tres',
    'presupuesto.deuda.cardinal.4': 'quatre',
    'presupuesto.deuda.cardinal.5': 'cinc',
    'presupuesto.deuda.cardinal.6': 'sis',
    'presupuesto.deuda.cardinal.7': 'set',
    'presupuesto.deuda.cardinal.otro': '{n}',
    'presupuesto.lede':
      "L'ajuntament va obrir l'any amb {inicial} de crèdit, el va ampliar en {mod} durant l'exercici —un {pct} % més— i va executar {ejecutado}.",
    'presupuesto.lede.dominanteCero':
      " Quasi tota l'ampliació, el {cuota} %, va anar a {capitulo}, un capítol que havia començat en zero.",
    'presupuesto.lede.dominante': " Quasi tota l'ampliació, el {cuota} %, va anar a {capitulo}.",
    'presupuesto.lede.soloAprobado':
      "El pressupost aprovat per a {year} segons el Ministeri d'Hisenda és de {gastos} de despeses. L'executat apareix més avall quan l'Ajuntament publica el seu estat d'execució.",
    'presupuesto.lede.sinCuadre':
      "El pressupost aprovat per a {year} segons el Ministeri d'Hisenda és de {gastos} de despeses. L'estat d'execució que publica el propi Ajuntament no quadra amb si mateix este exercici: les seues quatre magnituds van més avall, una a una i sense sumar-les per ell.",
    'presupuesto.tres':
      "Esta pàgina distingix en tot moment tres coses que solen confondre's: l'**aprovat**, el **definitiu** després de modificacions i l'**executat**.",
    'presupuesto.tres.link': 'Com es lligen els tres ↓',
    'presupuesto.meta':
      '{gastos} de despeses aprovades segons CONPREL · {porHab} per habitant · {hab} habitants · actualitzat {fecha}',
    'presupuesto.fuentes.title': 'Dos fonts, dos pressupostos aprovats',
    'presupuesto.fuentes.conprel': "CONPREL · Ministeri d'Hisenda",
    'presupuesto.fuentes.municipal': "Estat d'execució del propi Ajuntament",
    'presupuesto.fuentes.diferencia': 'Diferència sense explicar',
    'presupuesto.fuentes.nota':
      "Les dos són oficials i **no es reconcilien ací**: no consta el motiu de la diferència, i triar-ne una seria inventar el pont entre dos fonts públiques. Cada xifra d'esta pàgina diu de quina ve.",
    'presupuesto.cascada.eyebrow':
      "Execució pressupostària · {year}{periodo} · del crèdit inicial a l'executat",
    'presupuesto.cascada.periodo': ' · {t}r trimestre',
    'presupuesto.cascada.title': "El pressupost va créixer un {pct} % dins de l'any",
    'presupuesto.cascada.title.sinCuadre': "Del crèdit inicial a l'executat",
    'presupuesto.cascada.inicial': 'Crèdit inicial aprovat',
    'presupuesto.cascada.inicial.nota': "el que va aprovar el ple · estat d'execució",
    'presupuesto.cascada.mod': 'Modificacions de crèdit',
    'presupuesto.cascada.mod.nota': "+{pct} % sobre l'inicial, durant l'exercici",
    'presupuesto.cascada.definitivo': 'Pressupost definitiu',
    'presupuesto.cascada.definitivo.nota': 'inicial + modificacions',
    'presupuesto.cascada.ejecutado': 'Executat',
    'presupuesto.cascada.ejecutado.nota': 'obligacions reconegudes netes · {pct} % del definitiu',
    'presupuesto.cascada.noCuadra':
      "El llistat municipal declara un definitiu que no és la suma d'inicial i modificacions ({suma}); es publiquen les quatre xifres tal qual i es retira el percentatge de creixement.",
    'presupuesto.callout.denominador':
      "**El «{pctDef} % executat» és un quocient sobre el pressupost definitiu.** Sobre el crèdit que es va aprovar al gener, l'executat és el {pctIni} %. Cada xifra respon a una pregunta distinta: quant es va executar del que es va aprovar al gener, i quant del que es va acabar autoritzant.",
    'presupuesto.callout.asimetria.entro':
      "**Va entrar {mucho}més del que va eixir.** D'ingressos es va executar el {pctIng} % —{ingEj}— enfront del {pctGas} % de despeses: {gasEj}. L'asimetria entre eixos dos percentatges és la dada, no cadascun pel seu compte.",
    'presupuesto.callout.asimetria.salio':
      "**Va eixir més del que va entrar.** De despeses es va executar el {pctGas} % —{gasEj}— enfront del {pctIng} % d'ingressos: {ingEj}. L'asimetria entre eixos dos percentatges és la dada, no cadascun pel seu compte.",
    'presupuesto.callout.mucho': 'molt ',
    'presupuesto.cap.eyebrow': 'Capítol a capítol · {year}',
    'presupuesto.cap.title': 'On es va ampliar el crèdit i on es va executar',
    'presupuesto.cap.leyenda.inicial': 'crèdit inicial',
    'presupuesto.cap.leyenda.ampliacion': 'ampliació',
    'presupuesto.cap.leyenda.ejecutado': 'executat',
    'presupuesto.cap.nota.cero': 'crèdit inicial 0 €',
    'presupuesto.cap.nota.cuota': "{cuota} % de tota l'ampliació",
    'presupuesto.cap.pie.cero':
      "**{capitulo} va obrir l'exercici amb 0 € i va acabar amb {definitivo}** —el {cuota} % de tota l'ampliació—, dels quals es va executar el {pct} %. Un capítol que comença en zero i rep tot el seu crèdit durant l'exercici no és una desviació d'execució: eixe crèdit no estava en cap dels dos pressupostos aprovats que publica esta pàgina.",
    'presupuesto.cap.pie.ceroDiscrepan':
      "**{capitulo} va obrir l'exercici amb 0 € i va acabar amb {definitivo}** —el {cuota} % de tota l'ampliació—, dels quals es va executar el {pct} %. Eixe zero és el de l'estat d'execució del propi Ajuntament: **el pressupost que es va remetre a CONPREL li dóna {conprel} de crèdit inicial a eixe mateix capítol**. Les dos fonts són oficials i no es reconcilien, així que part del que ací figura com a ampliació ja estava aprovat en l'altra.",
    'presupuesto.cap.pie.dominante':
      "**{capitulo} es va emportar el {cuota} % de tota l'ampliació**: de {inicial} a {definitivo}, dels quals es va executar el {pct} %.",
    'presupuesto.cap.pie.cociente':
      ' El percentatge de la dreta és executat ÷ definitiu: obligacions reconegudes netes.',
    'presupuesto.cap.fuente':
      "Font: Ajuntament de Riba-roja · estats d'execució pressupostària{fecha}.",
    'presupuesto.cap.fecha': ' · llistat a {fecha}',
    'presupuesto.econ.eyebrow': 'Despeses aprovades {year} · CONPREL · en què',
    'presupuesto.econ.title': 'En què preveu gastar-se els diners públics',
    'presupuesto.econ.cero':
      "El capítol {code}, {label}, està aprovat a 0 € i per això no té barra. Es deixa dit en compte d'ometre'l.",
    'presupuesto.econ.ceroVarios':
      "Els capítols {lista} estan aprovats a 0 € i per això no tenen barra. Es deixen dits en compte d'ometre'ls.",
    'presupuesto.econ.cero.y': 'i',
    'presupuesto.ing.eyebrow': "Ingressos aprovats {year} · CONPREL · d'on",
    'presupuesto.ing.title': "D'on vénen els ingressos municipals",
    'presupuesto.descuadre':
      "**Este pressupost no quadra en la font del ministeri:** atribuïx {ingresos} d'ingressos enfront de {gastos} de despeses, {dif} de diferència. Un pressupost general s'aprova **sense dèficit inicial** (art. 165.4 del text refós de la Llei d'Hisendes Locals) i l'exigència val en els dos sentits: tampoc hauria de sobrar. En eixe mateix fitxer, altres entitats quadren al cèntim. No és un romanent ni un coixí: és un desquadrament, i no sabem si està en el que va remetre l'ajuntament o en com ho publica el ministeri.",
    'presupuesto.prog.eyebrow':
      'Despeses aprovades {year} · classificació per programes · per a què',
    'presupuesto.prog.title': 'Els mateixos {total} repartits per finalitat',
    'presupuesto.prog.nota':
      "Un altre tall dels mateixos diners, no uns altres diners: l'econòmica diu «en què», esta diu «per a què». No es creuen entre si.",
    'presupuesto.prog.deuda':
      "El programa «Deute públic» ({importe}) és el que s'aparta este exercici per a atendre el deute. No és el saldo viu de més avall —{deuda}— i les dos xifres no se sumen.",
    'presupuesto.prog.glosa.deuda': "el que s'aparta este any per a atendre'l",
    'presupuesto.prog.glosa.basicos':
      'seguretat, urbanisme i habitatge, benestar comunitari, medi ambient',
    'presupuesto.prog.glosa.social': "pensions, servicis socials, foment de l'ocupació",
    'presupuesto.prog.glosa.preferentes': 'sanitat, educació, cultura, esport',
    'presupuesto.prog.glosa.economico':
      'agricultura, indústria, comerç, turisme, transport, infraestructures',
    'presupuesto.prog.glosa.general':
      'òrgans de govern, servicis generals, administració financera',
    'presupuesto.deuda.eyebrow': 'Endeutament · saldo a 31 de desembre',
    'presupuesto.deuda.saldo': 'deute viu a 31/12/{year}',
    'presupuesto.deuda.desde': 'Des de {anio}: {delta}',
    'presupuesto.deuda.nota1':
      "És el saldo que l'Ajuntament devia en tancar l'exercici. **No és el capítol «Deute públic» del pressupost**{importe}, que és el que s'aparta cada any per a atendre'l: són dos xifres distintes i no se sumen.",
    'presupuesto.deuda.nota1.importe': ' —{x} en {year}—',
    'presupuesto.deuda.nota2':
      "Riba-roja se situa **per damunt del {percentil} %** dels {n} ajuntaments de l'entrega —dels quals **{aCero} declaren zero deute**—, així que la mediana del repartiment és {mediana} i el percentil diu poc per si sol. El p90 de l'entrega està en {p90}.",
    'presupuesto.deuda.noPublicados':
      'Sense entrega publicada encara: {lista}. La sèrie es talla ací perquè el Ministeri encara no ha publicat eixe exercici, no perquè no hi haja deute.',
    'presupuesto.deuda.fuente': "Ministeri d'Hisenda · deute viu EE.LL.",
    'presupuesto.contra.eyebrow': 'Contractació i subvencions',
    'presupuesto.contra.title': "El que s'ha adjudicat, cada xifra amb el seu període",
    'presupuesto.contra.intro':
      "El pressupost s'aprova i s'executa cada any; la contractació s'acumula al llarg de diversos exercicis. Així que **estos quatre recomptes no són el repartiment del pressupost de dalt**: cadascun porta el període que abasta. Van **mesurats sobre els contractes adjudicats i sense IVA**, amb els mateixos predicats que les fitxes de baix, i cadascun obri la seua.",
    'presupuesto.contra.menores': 'Contractes menors',
    'presupuesto.contra.menores.nota':
      "de {adj} adjudicats{span} · {importe} sense IVA: el {pctN} % dels expedients i el {pctImporte} % de l'import",
    'presupuesto.contra.menores.link': 'Via directa ↓',
    'presupuesto.contra.obras': 'Obres publicades',
    'presupuesto.contra.obras.nota':
      'fitxes municipals · {renove} del Pla RENOVE i {feder} del FEDER, ja executades',
    'presupuesto.contra.obras.link': 'Fitxes ↓',
    'presupuesto.contra.ted': 'Llindar europeu · TED',
    'presupuesto.contra.ted.nota': 'anuncis{span} · {valued} amb import, {total}',
    'presupuesto.contra.ted.mayor': ', el {pct} % en un sol anunci',
    'presupuesto.contra.ted.link': 'Anuncis ↓',
    'presupuesto.contra.bdns': 'Subvencions · BDNS',
    'presupuesto.contra.bdns.nota':
      'convocatòries municipals en la Base Nacional{span} · {total} en total, comptant les rebudes',
    'presupuesto.contra.bdns.link': 'Convocatòries ↓',
    'presupuesto.pie.fuentes.a': 'Fonts: pressupost aprovat de ',
    'presupuesto.pie.fuentes.conprel': "CONPREL, Ministeri d'Hisenda ↗",
    'presupuesto.pie.fuentes.b': " · estat d'execució de l'Ajuntament de Riba-roja · ",
    'presupuesto.pie.fuentes.deuda': "deute viu d'EE.LL. ↗",
    'presupuesto.pie.fuentes.c': '. Instantània del {fecha}.',
    'presupuesto.pie.eficiencia': 'Cost dels servicis →',
    'presupuesto.pie.datos': 'Dades obertes →',
    'presupuesto.pie.metodologia': 'Metodologia →',
    'cargos.detalle.ficha.eyebrow': 'Portal de transparència',
    'cargos.detalle.ficha.title': 'La seua fitxa biogràfica oficial',
    'cargos.detalle.ficha.note':
      "Document publicat pel mateix Ajuntament. Mai s'enllaça la fitxa d'una altra persona: si el creuament és ambigu, no se'n mostra cap.",
    'cargos.detalle.ficha.cobertura': 'fitxes publicades',
    'cargos.detalle.ficha.enlace': 'Dades biogràfiques (PDF)',
    'cargos.detalle.ficha.sin.title': "L'Ajuntament no publica la seua fitxa.",
    'cargos.detalle.ficha.sin.body':
      "La pàgina de la Corporació Municipal enllaça un CV en PDF al costat de cada regidor; al costat d'aquest escó no n'hi ha cap. No consta si va arribar a publicar-se abans: la pàgina que el portal feia servir fins al setembre de 2026 no té còpia a l'Internet Archive, així que no es pot dir si es va retirar o mai no hi va estar.",
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
    'cargos.detalle.area.title': 'Diners adjudicats a les regidories que hui dirigeix',
    'cargos.detalle.area.titleRango':
      'Diners adjudicats entre {desde} i {hasta} a les regidories que hui dirigeix',
    'cargos.detalle.area.titleAnio':
      'Diners adjudicats el {anio} a les regidories que hui dirigeix',
    'cargos.detalle.area.intro':
      "Imports adjudicats a les àrees de què hui és responsable, sumats al llarg de tot el període, les dirigira qui les dirigira: no és la contractació del seu mandat. És contractació de la regidoria, no de la persona: els contractes els adjudica l'òrgan de contractació de l'Ajuntament.",
    'cargos.detalle.area.note':
      'Només contractes ja adjudicats i de categoria atribuïble a una àrea; la xifra es queda curta abans que assignar un responsable equivocat.',
    'cargos.detalle.stat.areasDelegadas': 'Àrees delegades',
    'cargos.detalle.stat.partyPromises': 'Promeses · grup',
    'cargos.detalle.stat.agendaItems': 'Punts al ple',
    'cargos.detalle.stat.quejas': 'Queixes pendents',
    'cargos.detalle.portfolios.eyebrow': 'Àrees assignades',
    'cargos.detalle.portfolios.sinFicha': 'Sense fitxa d’àrea a /departamentos: {lista}',
    'cargos.card.departamentos': 'Departaments',
    'cargos.card.departamentos.mas': '+{n} més',
    'cargos.intro':
      'Qui forma la corporació, quines àrees porta cadascú, què cobren pel càrrec segons l’acord plenari i l’estadística del ministeri, què declara el seu CV per a les àrees que dirigeixen i quines queixes els arriben.',
    'cargos.card.sinCorreo': 'sense correu publicat',
    'cargos.card.sinRetrato': 'sense retrat a la font',
    'cargos.card.altaDesde': 'Presa de possessió davant el Ple el {fecha}',
    'cargos.card.hastaF': 'Regidora fins al {fecha}',
    'cargos.card.hastaM': 'Regidor fins al {fecha}',
    'cargos.card.acta': 'acta ↗',
    'cargos.card.buzonCompartido': '· bústia compartida per {n} càrrecs',
    'cargos.baja.renuncia': 'renúncia a l’acta',
    'cargos.baja.fallecimiento': 'defunció',
    'cargos.baja.perdida-condicion': 'pèrdua de la condició de regidor',
    'cargos.corporacion.raspado': 'padró raspat de ribarroja.es · actualitzat {fecha}',
    'cargos.corporacion.correcciones':
      '{n} correcció(ns) documentada(es): la pàgina de l’ajuntament encara no recull {bajas} baixa(es) i {altas} alta(es) que el Ple ja va acordar; s’apliquen amb l’acta al costat.',
    'cargos.corporacion.correccionesLink': 'com es corregeix el padró',
    'cargos.bajas.title': 'Ja no formen part de la corporació',
    'cargos.bajas.note':
      'Es conserven amb la data de cessament i l’acta que la recull. Res en present —retribució, àrees, queixes, encaix— es pinta sobre qui ja no ocupa l’escó.',
    'cargos.ispa.total': 'retribucions i assistències dels {n} electes · ISPA {year}',
    'cargos.ispa.totalNota':
      'No inclou les quotes empresarials a la Seguretat Social, el personal eventual ni l’assignació als grups polítics.',
    'cargos.ispa.trienios':
      'L’acord afig «+ triennis» a eixa assignació, i l’ISPA publica el que es percep cada any sense desglossar-los.',
    'cargos.hero.mandato': 'mandat {m}',
    'cargos.hero.lead':
      'El ple té {total} escons. {partido} suma {nGob} i es reparteix totes les àrees delegades; els {nOpo} restants no en dirigeixen cap, i eixe és el seu paper: fiscalitzar, no gestionar.',
    'cargos.hero.leadVarios':
      'El ple té {total} escons. {nGob} es reparteixen totes les àrees delegades; els {nOpo} restants no en dirigeixen cap, i eixe és el seu paper: fiscalitzar, no gestionar.',
    'cargos.hero.coste':
      'Els {n} van percebre {importe} en {year} entre retribucions i assistències, i cap va cobrar zero.',
    'cargos.hero.fichas': 'Fitxes biogràfiques oficials al portal: {n} de {total}',
    'cargos.composicion.title': 'Composició del ple · {n} escons',
    'cargos.composicion.gobiernan': 'amb àrees delegades · governen',
    'cargos.composicion.fiscalizan': 'sense àrees delegades · fiscalitzen',
    'cargos.retri.eyebrow': 'Retribucions · els {n}, cap a zero',
    'cargos.retri.title': 'Què cobra la corporació, i d’on ix cada xifra',
    'cargos.retri.noCuadra':
      'El repartiment entre dedicació i assistències no reconstruïx el total publicat, així que els subtotals de cada columna es retiren fins que quadren. La capçalera continua sent la xifra del ministeri.',
    'cargos.retri.fijadoPor': '· dedicació {dedicacion}, fixada en l’acord',
    'cargos.retri.asistenciasCargo': 'assistències per sessió',
    'cargos.retri.asistenciasCargoNota': '· sense dedicació; l’ISPA no publica el nom',
    'cargos.gobierno.eyebrow': 'Govern · {n} regidors amb àrees delegades',
    'cargos.gobierno.title': 'Qui dirigix què',
    'cargos.gobierno.areas': 'Àrees delegades · {n}',
    'cargos.oposicion.eyebrow': 'Oposició · {n} regidors sense àrees delegades',
    'cargos.oposicion.title': 'Qui fiscalitza',
    'cargos.oposicion.nota':
      'La seua fitxa està buida de gestió per institució, no per falta de dades. El que sí que tenen és vot en el ple i dret a preguntar.',
    'cargos.plantilla.eyebrow': 'Una altra cosa · no són els càrrecs electes',
    'cargos.plantilla.title': 'Plantilla municipal',
    'cargos.plantilla.personas': 'persones empleades',
    'cargos.plantilla.plazas': 'places autoritzades',
    'cargos.plantilla.mujeres': 'dones',
    'cargos.plantilla.hombres': 'hòmens',
    'cargos.plantilla.fuenteSexo':
      'El desglossament per sexe és l’última xifra publicada, i la seua font és un periòdic comarcal, no l’ajuntament:',
    'cargos.fuentes':
      'Fonts: corporació i fotografies de ribarroja.es · retribucions fixades en l’acord de ple de {acuerdo} · imports percebuts de l’ISPA, Ministeri d’Hisenda i Funció Pública. Padró actualitzat el {fecha}.',
    'cargos.detalle.baja.banner':
      'Ja no forma part de la corporació: {motivo}. El Ple en va prendre raó el {fecha}.',
    'cargos.detalle.baja.fuente': 'Font',
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
    // El connector, no el títol: el que va darrere és el text literal del CV.
    'encaje.card.soloEn': 'només en',
    'encaje.respaldo.autodeclarada':
      'El que ací es cita procedeix del CV que publica la mateixa persona; cap font independent no ho corrobora.',
    'encaje.respaldo.corroborada':
      'El que ací es cita ho avala a més alguna font independent de la persona.',
    'encaje.respaldo.discrepancia-documentada':
      'El que ací es cita arrossega una discrepància documentada sense resoldre.',
    'encaje.respaldo.mark.autodeclarada': 'autodeclarada',
    'encaje.respaldo.mark.corroborada': 'corroborada',
    'encaje.respaldo.mark.discrepancia-documentada': 'discrepància documentada',
    'encaje.card.sinCita':
      'El que es compara és el CV que la mateixa persona declara i l’ajuntament publica; ací no se’n cita cap entrada, així que no hi ha cap referència de la qual dir en què se sosté.',
    'encaje.aviso.label': 'Advertiment de la biografia',
    'encaje.aviso.label.ficha': 'Advertiment sobre aquesta fitxa',
    'encaje.aviso.contradice': 'contradicció sense resoldre',
    'encaje.aviso.corrobora': 'una altra font ho confirma',
    'encaje.aviso.matiza': 'matís',
    'encaje.aviso.area':
      'Les seues àrees delegades van canviar durant el mandat. Esta fila jutja una àrea que porta hui; la biografia es va escriure amb el repartiment anterior.',
    'encaje.card.gaps': 'què falta',
    'encaje.card.law': 'què exigeix la llei',
    'encaje.sinDelegacion.label': 'Sense delegació d’àrea',
    'encaje.sinDelegacion.note':
      'No dirigeix cap regidoria, així que no hi ha àrea amb què comparar. El bloc en blanc reflecteix qui governa, no qui està format.',
    'encaje.sinRevisar.label': 'Encara sense revisar',
    'encaje.sinRevisar.note':
      'Dirigeix una àrea i encara no hem revisat quina formació i experiència declara. El buit és nostre, no seu: no diu res d’aquesta persona, només que encara no hem fet la feina.',
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
    'departamentos.card.declaraciones': 'Declaracions contrastades',
    'departamentos.card.sinContraste': 'sense contrast',
    'departamentos.card.sinVotoTranscrito': 'sense vot transcrit',
    'departamentos.detalle.back': '← Tots els departaments',
    'departamentos.detalle.compromisos': 'Compromisos plenaris',
    'departamentos.detalle.promesas': 'Promeses electorals',
    'departamentos.detalle.agendas': 'Punts debatuts sense vot transcrit',
    'departamentos.detalle.quejas': 'Queixes ciutadanes actives',
    'departamentos.detalle.declaraciones.eyebrow': 'Declaracions en ple',
    'departamentos.detalle.declaraciones.title':
      'El que es va dir en ple sobre els temes d’aquesta àrea',
    'departamentos.detalle.declaraciones.aviso':
      'Les va pronunciar qualsevol grup municipal, no necessàriament qui dirigeix l’àrea: s’agrupen per tema, no per qui parla.',
    'departamentos.detalle.declaraciones.vacio':
      'Encara no hi ha declaracions contrastades sobre els temes d’aquesta àrea.',
    'departamentos.detalle.barra.titulo': 'Contrast amb les dades',
    'departamentos.detalle.barra.resto': 'contrastades · {total} en total',
    'departamentos.detalle.empty.votes':
      "0 vots transcrits per a aquesta regidoria — contribueix via `npm run pleno-vote` o la plantilla d'issue.",
    'departamentos.detalle.empty.promesas': 'Sense promeses registrades per a aquesta regidoria.',
    'departamentos.detalle.empty.quejas':
      'Sense queixes ciutadanes actives per a aquesta regidoria.',
    'plazo.vencido': "termini vençut · sense evidència d'execució",
    'plazo.hint':
      "Data de compromís superada sense que s'haja registrat evidència d'execució. L'estat editorial NO canvia automàticament.",
    'liveTicker.plazosVencidos': 'terminis vençuts',
    'liveTicker.plazosVencidos.aria':
      '{n} compromisos municipals amb termini vençut sense evidència d’execució — obrir el tauler de departaments',
    'liveTicker.plazosVencidos.aria.uno':
      'un compromís municipal amb termini vençut sense evidència d’execució — obrir el tauler de departaments',

    // Accessibilitat
    'a11y.skipToContent': 'Saltar al contingut',
    'a11y.secciones': 'Seccions',
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
    'landing.contratos.acumulado': 'Acumulat',
    'landing.contratos.recientes': 'a sota, les últimes adjudicacions',
    'landing.contratos.importes': 'import adjudicat, sense IVA',
    'landing.contratos.sinImporte': '{n} sense import publicat',
    'landing.contratos.lote.conBase':
      "Lot {n} de {total}{exp}. L'enllaç obri la fitxa de l'expedient sencer, el pressupost base del qual és {base}.",
    'landing.contratos.lote.deTotal':
      "Lot {n} de {total}{exp}. L'enllaç obri la fitxa de l'expedient sencer, no la d'este lot.",
    'landing.contratos.lote.simple':
      "Lot {n}{exp}. L'enllaç obri la fitxa de l'expedient sencer, no la d'este lot.",
    'landing.contratos.lote.sinNumero':
      "Un de diversos contractes que comparteixen expedient{exp}. L'enllaç obri la seua fitxa sencera, no la d'este contracte.",
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
      "Reunix per regidoria els vots de ple, les promeses electorals i les queixes del canal, que només es compten com a pendents de resposta quan han arribat al registre de l'ajuntament. Un termini vençut es marca com a avís editorial — l'estat mai es modifica de manera automàtica.",
    'landing.rendicion.cta': 'Veure el tauler per departament →',
    'landing.rendicion.concejalias': 'Regidories',
    'landing.rendicion.conResponsable': 'Amb responsable',
    'landing.rendicion.concejales': 'Regidors',
    'landing.escanos': 'escons',
    'landing.titulares': 'titulars',
    'landing.medios': 'mitjans',
    'landing.ofertas': 'ofertes',
    // Lo que la portada escribía a mano fuera del catálogo: ver la nota castellana.
    'landing.kpi.poblacion': 'Població',
    'landing.kpi.poblacionAnio': 'Població {anio}',
    'landing.kpi.poblacion.sub': '10 anys · INE',
    'landing.kpi.poblacion.subSinDato': 'INE Padró',
    'landing.kpi.presupuesto': 'Pressupost',
    'landing.kpi.presupuestoAnio': 'Pressup. {anio}',
    'landing.kpi.presupuesto.definitivo': 'Ajunt. · definitiu',
    'landing.kpi.presupuesto.ejec': '{pct} % exec.',
    'landing.kpi.presupuesto.aprobado': 'CONPREL · aprovat',
    'landing.kpi.sinDato': 'sense dada',
    'landing.kpi.personal': 'Pressup. personal',
    'landing.kpi.personal.sub': 'Cap. 1 econòmic',
    'landing.kpi.contratos': 'Contractes adj.',
    'landing.kpi.contratosAnios': 'Contractes adj. {anios}',
    'landing.kpi.contratos.sub': 'acumulat · Gobierto/PLACSP',
    'landing.kpi.paro': 'Atur',
    'landing.kpi.paroPeriodo': 'Atur {periodo}',
    'landing.kpi.paro.sub': 'SEPE · atur registrat',
    'landing.kpi.pleno': 'Últim ple',
    'landing.kpi.pleno.sesiones': '{n} sessions',
    'landing.alcalde.promesas': 'promeses',
    'landing.alcalde.promesas.title': 'Promeses documentades del grup {grupo}',
    'landing.alcalde.puntos': 'punts en ple',
    'landing.alcalde.puntos.title':
      'Punts de l’orde del dia gestionats per regidories de l’Alcalde',
    'landing.alcalde.gobierno': 'Govern municipal',
    'landing.alcalde.definitivo': 'crèdit definitiu',
    'landing.alcalde.definitivo.title':
      'Crèdit definitiu de l’exercici: allò aprovat més les modificacions de crèdit, segons l’estat d’execució de l’Ajuntament. Al costat, les obligacions reconegudes.',
    'landing.alcalde.aprobado': 'pressupost aprovat',
    'landing.alcalde.aprobado.title':
      'Pressupost de despeses aprovat de l’exercici, segons CONPREL (Ministeri d’Hisenda). No és allò executat.',
    'landing.alcalde.ejecutado': 'executat',
    'landing.alcalde.contratos': 'contractes acumulats',
    'landing.alcalde.contratos.title':
      'Contractes adjudicats registrats al portal de contractació, no sols els d’este mandat',
    'landing.alcalde.subvenciones': 'subvencions',
    'landing.alcalde.subvenciones.title': 'Subvencions concedides per l’Ajuntament (registre BDNS)',
    'landing.promesas.congelado': 'LOREG · congelat',
    'landing.topbar.edicion': 'ed. matí',
    'landing.empleo.cierra': 'tanca el {fecha}',
    'landing.contratos.sinCategoria': 'Contracte',
    'landing.contratos.sinAdjudicatario': 'Sense adjudicatari',
    'landing.contratos.concesion':
      'Concessió: l’import és el valor estimat per tot el seu termini, no una despesa anual.',
    'landing.contratos.concesionAnios':
      'Concessió: l’import és el valor estimat per tot el seu termini —{anios} anys—, no una despesa anual.',
    'landing.prensa.oficial': 'Oficial',
    'landing.prensa.oficial.title': 'Font primària · Ajuntament',
    'landing.participa.aviso': 'avís',
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

/**
 * El rótulo de un valor de enum: su clave del catálogo, o `reserva` si la clave
 * no existe en ningún idioma.
 *
 * `t` devuelve la clave tal cual cuando falta, y «contrato.estado.formalized»
 * pintado en una pastilla es peor que el token crudo o que nada. Cada llamada
 * elige su reserva para pintar lo que se pintaba antes: el token crudo donde la
 * tabla escrita a mano caía a él (`STATUS_LABEL[s] || s`), `null` donde un valor
 * sin rótulo no se pintaba.
 *
 * @param {(clave: string) => string} t
 * @param {string} clave
 * @param {string | null} reserva
 * @returns {string | null}
 */
export function rotuloDe(t, clave, reserva) {
  const rotulo = t(clave)
  return rotulo === clave ? reserva : rotulo
}
