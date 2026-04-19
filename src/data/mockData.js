// =============================================================================
// CivicPulse Mock Data — Municipal Dashboard (Direction A)
// =============================================================================

export const CITIES = [
  { id: 'puertollano', code: 'PU', name: 'Puertollano', mhs: 78.4, delta: +2.3, pop: '48,264', region: 'Ciudad Real' },
  { id: 'valdepenas',  code: 'VA', name: 'Valdepeñas',  mhs: 71.2, delta: -0.8, pop: '30,102', region: 'Ciudad Real' },
  { id: 'tomelloso',   code: 'TO', name: 'Tomelloso',   mhs: 82.1, delta: +1.1, pop: '36,441', region: 'Ciudad Real' },
  { id: 'alcazar',     code: 'AL', name: 'Alcázar',     mhs: 74.0, delta: +0.4, pop: '30,755', region: 'Ciudad Real' },
];

export const PERSONAS = [
  { id: 'citizen',    name: 'Ciudadano',     sub: 'Visión diaria' },
  { id: 'journalist', name: 'Periodista',    sub: 'Investigación' },
  { id: 'official',   name: 'Cargo público', sub: 'Operaciones' },
];

export const DEPTS = [
  { id: 'limp', name: 'Limpieza',           lead: 'Roberto Silva',  score: 64, delta: -4, budget: 2.4, complaints: 312, resolved: 198 },
  { id: 'obr',  name: 'Obras Públicas',     lead: 'Carmen Ruiz',    score: 81, delta: +3, budget: 5.1, complaints: 142, resolved: 118 },
  { id: 'med',  name: 'Medio Ambiente',     lead: 'Javier Moreno',  score: 72, delta: +1, budget: 1.8, complaints:  89, resolved:  61 },
  { id: 'seg',  name: 'Seguridad',          lead: 'Elena Castro',   score: 85, delta: +2, budget: 3.9, complaints:  54, resolved:  48 },
  { id: 'cul',  name: 'Cultura',            lead: 'Pablo Herrera',  score: 77, delta:  0, budget: 1.2, complaints:  21, resolved:  19 },
  { id: 'soc',  name: 'Servicios Sociales', lead: 'Marta Jiménez',  score: 79, delta: +5, budget: 2.8, complaints:  67, resolved:  58 },
];

export const PROMISES = [
  { text: 'Renovación del Parque del Pozo Norte',         owner: 'Carmen Ruiz',    due: '2026-06-30', pct: 62, status: 'ok' },
  { text: 'Reducir tiempo respuesta quejas <48 h',        owner: 'Roberto Silva',  due: '2026-03-31', pct: 41, status: 'risk' },
  { text: 'Instalación de 120 puntos de reciclaje',       owner: 'Javier Moreno',  due: '2026-12-15', pct: 83, status: 'ok' },
  { text: 'Plan de eficiencia energética edificios',      owner: 'Carmen Ruiz',    due: '2026-09-30', pct: 28, status: 'late' },
  { text: 'Programa jóvenes emprendedores',               owner: 'Pablo Herrera',  due: '2026-11-01', pct: 55, status: 'ok' },
];

export const FEED = [
  { t: 'hace 2m',  type: 'queja',      dept: 'Limpieza',       text: 'Contenedores desbordados C/ Mayor 34',               sev: 'warn' },
  { t: 'hace 7m',  type: 'gasto',      dept: 'Obras Públicas', text: '€14,320 — Asfaltado Av. Primero de Mayo',             sev: 'info' },
  { t: 'hace 12m', type: 'pleno',      dept: 'Alcaldía',       text: 'Orden del día publicado — sesión 21 mar',             sev: 'info' },
  { t: 'hace 23m', type: 'queja',      dept: 'Obras Públicas', text: 'Bache grave en rotonda Ronda del Sur',                sev: 'crit' },
  { t: 'hace 34m', type: 'resolución', dept: 'Limpieza',       text: '18 quejas marcadas resueltas en turno mañana',        sev: 'ok'   },
  { t: 'hace 1h',  type: 'promesa',    dept: 'Medio Amb.',     text: 'Puntos de reciclaje — instalados 4 nuevos',           sev: 'ok'   },
  { t: 'hace 1h',  type: 'dato',       dept: 'Transparencia',  text: 'Actualización mensual del portal de contratos',       sev: 'info' },
  { t: 'hace 2h',  type: 'queja',      dept: 'Medio Amb.',     text: 'Olores en Polígono Industrial Este',                  sev: 'warn' },
];

export const COMPLAINTS_30D = [48, 52, 45, 38, 41, 55, 61, 58, 49, 44, 51, 47, 53, 60, 57, 62, 55, 50, 46, 52, 58, 63, 59, 54, 49, 55, 61, 57, 52, 48];
export const RESOLVED_30D   = [30, 34, 32, 28, 33, 40, 45, 44, 37, 33, 38, 35, 41, 46, 45, 48, 44, 40, 36, 41, 46, 50, 47, 43, 40, 44, 49, 46, 42, 39];

export const MHS_15D = [71, 69.4, 70, 72, 71.5, 73, 74, 73.5, 75, 76, 74, 75.5, 77, 76.5, 78.4];

export const TAX_BREAKDOWN = [
  { cat: 'Personal municipal',   pct: 38, color: '#2463EB' },
  { cat: 'Obras e infraestr.',   pct: 22, color: '#7C3AED' },
  { cat: 'Servicios básicos',    pct: 15, color: '#16A34A' },
  { cat: 'Deuda + financiación', pct: 10, color: '#D97706' },
  { cat: 'Cultura y deportes',   pct:  7, color: '#06B6D4' },
  { cat: 'Otros',                pct:  8, color: '#94A3B8' },
];

export const AGENDA_CIVICA = [
  { day: 'HOY 18:00', title: 'Sesión plenaria ordinaria',           tag: '12 puntos · orden publicado', icon: 'scale'  },
  { day: 'HOY 20:30', title: 'Apertura plazo alegaciones PGOU',     tag: '30 días',                     icon: 'chart'  },
  { day: 'MAÑANA',    title: 'Consejo de Barrio Zona Sur',          tag: 'Salón de actos · 19:00',      icon: 'people' },
  { day: '21 MAR',    title: 'Publicación contratos 1T',            tag: 'portal de transparencia',     icon: 'coin'   },
];

export const COMPLAINT_ROWS = [
  { id: 'Q-2419', dept: 'Limpieza',    sev: 'warn', text: 'Contenedores desbordados en C/ Mayor 34',   addr: 'Centro',  age: '2 h',  status: 'abierta'  },
  { id: 'Q-2418', dept: 'Obras',       sev: 'crit', text: 'Bache grave en rotonda Ronda del Sur',       addr: 'Zona Sur',age: '3 h',  status: 'asignada' },
  { id: 'Q-2417', dept: 'Medio Amb.',  sev: 'warn', text: 'Olores en Polígono Industrial Este',         addr: 'P. Ind.', age: '3 h',  status: 'en curso' },
  { id: 'Q-2416', dept: 'Seguridad',   sev: 'info', text: 'Farola averiada Pl. Constitución',           addr: 'Centro',  age: '4 h',  status: 'abierta'  },
  { id: 'Q-2415', dept: 'Limpieza',    sev: 'info', text: 'Pintadas en fachada Av. 1º Mayo',            addr: 'Oeste',   age: '5 h',  status: 'abierta'  },
  { id: 'Q-2414', dept: 'Obras',       sev: 'warn', text: 'Acera rota en C/ Gabriel García',            addr: 'Norte',   age: '6 h',  status: 'asignada' },
  { id: 'Q-2413', dept: 'Limpieza',    sev: 'ok',   text: 'Resuelto — recogida voluminosos',            addr: 'Este',    age: '9 h',  status: 'resuelta' },
  { id: 'Q-2412', dept: 'Medio Amb.',  sev: 'info', text: 'Árbol caído por viento C/ Jardines',         addr: 'Centro',  age: '11 h', status: 'asignada' },
];

export const COMPLAINT_CATS = [
  { id: 'all',  name: 'Todas',      n: 312 },
  { id: 'limp', name: 'Limpieza',   n: 142 },
  { id: 'obr',  name: 'Obras',      n:  78 },
  { id: 'med',  name: 'Medio Amb.', n:  34 },
  { id: 'seg',  name: 'Seguridad',  n:  28 },
  { id: 'otro', name: 'Otros',      n:  30 },
];

export const AGENDA_PLENO = [
  { n: '01', title: 'Aprobación del acta anterior',           type: 'trámite',  time: '5 min'  },
  { n: '02', title: 'Modificación presupuestaria 3/2026',     type: 'votación', time: '25 min', hot: true },
  { n: '03', title: 'Adjudicación contrato alumbrado LED',    type: 'votación', time: '15 min' },
  { n: '04', title: 'Ordenanza ruidos — primera lectura',     type: 'debate',   time: '35 min', hot: true },
  { n: '05', title: 'Moción — Zona de Bajas Emisiones',       type: 'moción',   time: '20 min' },
  { n: '06', title: 'Ruegos y preguntas',                     type: 'abierto',  time: '30 min' },
];

export const HISTORIC_VOTES = [
  { date: '5 mar',  title: 'Presupuesto 2026',         result: 'APROBADO',  counts: '14–7',  tone: 'ok'   },
  { date: '5 mar',  title: 'Ordenanza terrazas',       result: 'APROBADO',  counts: '18–3',  tone: 'ok'   },
  { date: '21 feb', title: 'Cesión uso Parque Sur',    result: 'RECHAZADO', counts: '9–12',  tone: 'crit' },
  { date: '21 feb', title: 'Plan movilidad 2030',      result: 'APROBADO',  counts: '15–6',  tone: 'ok'   },
  { date: '7 feb',  title: 'Moción igualdad',          result: 'APROBADO',  counts: '21–0',  tone: 'ok'   },
];

export const TOP_CONTRACTS = [
  { name: 'Asfaltado general 2026',       val: '€1.24M', vendor: 'Construcciones Silva SA', status: 'en curso'    },
  { name: 'Renovación alumbrado LED',     val: '€680k',  vendor: 'Iluminatia',              status: 'en curso'    },
  { name: 'Mantenimiento parques',        val: '€420k',  vendor: 'JardiSur SL',             status: 'adjudicado'  },
  { name: 'Software gestión municipal',   val: '€285k',  vendor: 'Pending…',                status: 'licitación'  },
  { name: 'Flota vehículos limpieza',     val: '€1.8M',  vendor: 'FCC Medio Amb.',          status: 'en curso'    },
];

export const DATASETS = [
  { name: 'Incidencias ciudadanas',   rows: '142,841', fmt: ['csv', 'json', 'api'], updated: 'hace 2 min' },
  { name: 'Contratos municipales',    rows: '4,217',   fmt: ['csv', 'json'],        updated: 'diario'      },
  { name: 'Ejecución presupuestaria', rows: '28,109',  fmt: ['csv', 'json', 'api'], updated: 'semanal'     },
  { name: 'Actas de pleno',           rows: '312',     fmt: ['pdf', 'json'],        updated: 'bimensual'   },
  { name: 'Plantilla municipal',      rows: '618',     fmt: ['csv'],                updated: 'anual'       },
  { name: 'Indicadores de salud',     rows: '1,095',   fmt: ['csv', 'json', 'api'], updated: 'diario'      },
];

export const BUDGET_KPI = {
  total: '€42.8M',
  totalDelta: +4.2,
  executed: '€11.7M',
  executedDelta: +2.1,
  debt: '€18.3M',
  debtDelta: -3.8,
  perCapita: '€886',
  perCapitaDelta: +0.8,
};

export const BUDGET_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const BUDGET_PLAN = [3.56, 3.56, 3.56, 3.56, 3.56, 3.56, 3.56, 3.56, 3.56, 3.56, 3.56, 3.56];
export const BUDGET_ACTUAL = [3.1, 3.4, 3.9, 0, 0, 0, 0, 0, 0, 0, 0, 0];

export const DEFAULT_TWEAKS = {
  city: 'puertollano',
  persona: 'citizen',
  dark: false,
  density: 'comfortable',
}

// =============================================================================
// Live City — Riba-roja de Túria (location-specific, always this municipality)
// =============================================================================

export const RIBA_ROJA = {
  name: 'Riba-roja de Túria',
  region: 'Valencia · Camp de Túria',
  center: [39.5439, -0.5711],
  zoom: 14,
  mhsBase: 81.2,
  population: '22,480',
  bbox: { minLat: 39.532, maxLat: 39.558, minLng: -0.585, maxLng: -0.555 },
}

export const RR_NEIGHBORHOODS = [
  { id: 'casco',     name: 'Casco Urbano',          center: [39.5439, -0.5711], pop: 8400, mhs: 83, color: '#60A5FA' },
  { id: 'ermita',    name: 'Barrio de la Ermita',   center: [39.5463, -0.5688], pop: 2700, mhs: 79, color: '#7C3AED' },
  { id: 'sector14',  name: 'Sector 14',             center: [39.5478, -0.5755], pop: 4100, mhs: 86, color: '#16A34A' },
  { id: 'traver',    name: 'Masía de Traver',       center: [39.5505, -0.5660], pop: 1600, mhs: 88, color: '#22D3EE' },
  { id: 'estacio',   name: 'Estación · Metro L9',   center: [39.5401, -0.5692], pop: 1800, mhs: 76, color: '#F59E0B' },
  { id: 'poligono',  name: 'Polígono Industrial',   center: [39.5378, -0.5602], pop:  180, mhs: 64, color: '#EF4444' },
  { id: 'conarda',   name: 'La Conarda',            center: [39.5420, -0.5770], pop: 2200, mhs: 81, color: '#84CC16' },
  { id: 'vallbona',  name: 'Mont Cabrer',           center: [39.5500, -0.5780], pop: 1500, mhs: 78, color: '#F97316' },
]

export const RR_LANDMARKS = [
  { id: 'ayto',    name: 'Ayuntamiento',             pos: [39.5439, -0.5711], kind: 'civic',  icon: '🏛' },
  { id: 'metro',   name: 'Metro Línea 9',            pos: [39.5401, -0.5692], kind: 'transit', icon: '🚇' },
  { id: 'pol',     name: 'Polígono Industrial Oeste',pos: [39.5378, -0.5602], kind: 'ind',    icon: '🏭' },
  { id: 'parque',  name: 'Parc Cinturó Verd',        pos: [39.5470, -0.5730], kind: 'park',   icon: '🌳' },
  { id: 'rio',     name: 'Río Túria',                pos: [39.5385, -0.5750], kind: 'river',  icon: '💧' },
  { id: 'biblio',  name: 'Biblioteca Municipal',     pos: [39.5445, -0.5702], kind: 'civic',  icon: '📚' },
]

// Seed incidents with real-looking Riba-roja street names
export const RR_INCIDENTS_SEED = [
  { id: 'L-1204', pos: [39.5442, -0.5712], sev: 'crit', text: 'Bache profundo en C/ Cid',            dept: 'Obras',     age: 4,  status: 'asignada' },
  { id: 'L-1203', pos: [39.5460, -0.5690], sev: 'warn', text: 'Contenedor desbordado C/ Mayor 34',    dept: 'Limpieza',  age: 11, status: 'abierta' },
  { id: 'L-1202', pos: [39.5383, -0.5598], sev: 'warn', text: 'Olores en Polígono Industrial Oeste',  dept: 'Medio Amb.',age: 18, status: 'en curso' },
  { id: 'L-1201', pos: [39.5478, -0.5755], sev: 'info', text: 'Señalización borrada Av. Sector 14',   dept: 'Obras',     age: 26, status: 'abierta' },
  { id: 'L-1200', pos: [39.5419, -0.5694], sev: 'info', text: 'Farola averiada Pl. Constitució',      dept: 'Obras',     age: 34, status: 'abierta' },
  { id: 'L-1199', pos: [39.5465, -0.5685], sev: 'ok',   text: 'Resuelto: banco roto Parc Ermita',     dept: 'Obras',     age: 45, status: 'resuelta' },
  { id: 'L-1198', pos: [39.5506, -0.5658], sev: 'info', text: 'Pintadas fachada Masía Traver',        dept: 'Limpieza',  age: 52, status: 'abierta' },
  { id: 'L-1197', pos: [39.5422, -0.5768], sev: 'warn', text: 'Acera rota C/ de la Pau',              dept: 'Obras',     age: 68, status: 'asignada' },
  { id: 'L-1196', pos: [39.5402, -0.5690], sev: 'ok',   text: 'Resuelto: limpieza gran volumen',      dept: 'Limpieza',  age: 85, status: 'resuelta' },
]

// Live event pool — random events will be picked from this to simulate a live feed
export const RR_EVENT_POOL = [
  { sev: 'warn', ico: '⚑', text: 'Nueva queja: contenedor desbordado',      dept: 'Limpieza',   hoodId: 'casco'    },
  { sev: 'crit', ico: '⚑', text: 'Queja crítica: bache grave',              dept: 'Obras',      hoodId: 'estacio'  },
  { sev: 'info', ico: '€', text: 'Pago €8,420 — limpieza viaria',           dept: 'Limpieza',   hoodId: 'casco'    },
  { sev: 'ok',   ico: '✓', text: 'Resuelto: 12 quejas en turno de tarde',   dept: 'Limpieza',   hoodId: 'ermita'   },
  { sev: 'warn', ico: '⚑', text: 'Farola fundida notificada',               dept: 'Obras',      hoodId: 'conarda'  },
  { sev: 'info', ico: '◊', text: 'Asistencia ciudadana al Consell de Barri',dept: 'Alcaldía',   hoodId: 'ermita'   },
  { sev: 'ok',   ico: '✓', text: 'Punto de reciclaje instalado',            dept: 'Medio Amb.', hoodId: 'sector14' },
  { sev: 'info', ico: '€', text: 'Pago €14,320 — asfaltado tramo 2',        dept: 'Obras',      hoodId: 'casco'    },
  { sev: 'warn', ico: '⚑', text: 'Reporte de ruido nocturno',               dept: 'Seguridad',  hoodId: 'poligono' },
  { sev: 'crit', ico: '⚠', text: 'Alerta calidad aire zona industrial',     dept: 'Medio Amb.', hoodId: 'poligono' },
  { sev: 'ok',   ico: '✓', text: 'Resuelto: grafiti Biblioteca Municipal',  dept: 'Limpieza',   hoodId: 'casco'    },
  { sev: 'info', ico: '📡',text: 'Autobús línea 3 — 4 min retraso',          dept: 'Movilidad',  hoodId: 'estacio'  },
  { sev: 'warn', ico: '⚑', text: 'Aviso: hoja caída bloquea acera',         dept: 'Limpieza',   hoodId: 'traver'   },
  { sev: 'info', ico: '€', text: 'Adjudicación €680k — alumbrado LED',      dept: 'Obras',      hoodId: 'casco'    },
  { sev: 'ok',   ico: '✓', text: 'Queja validada por vecino verificado',    dept: 'Limpieza',   hoodId: 'conarda'  },
]

// Budget flow — from Ayuntamiento to neighborhood/department centers
export const RR_BUDGET_FLOW = [
  { to: 'casco',    color: '#60A5FA', label: 'Personal' },
  { to: 'sector14', color: '#B084EE', label: 'Obras' },
  { to: 'poligono', color: '#22D3EE', label: 'Servicios' },
  { to: 'ermita',   color: '#4ADE80', label: 'Medio Amb.' },
  { to: 'estacio',  color: '#FBBF24', label: 'Movilidad' },
  { to: 'traver',   color: '#F97316', label: 'Cultura' },
]

export const RR_WEATHER = {
  temp: 18,
  min: 12,
  max: 22,
  condition: 'Despejado',
  icon: '☀',
  wind: 8,
  humidity: 54,
  aqi: 28,
  aqiLabel: 'Buena',
}

export const RR_LAYERS = [
  { id: 'incidencias', name: 'Incidencias', hint: 'Pins activos por gravedad' },
  { id: 'flujo',       name: '€ Flujo',    hint: 'Presupuesto a barrios' },
  { id: 'calor',       name: 'Salud',      hint: 'Índice por barrio' },
  { id: 'aire',        name: 'Aire',       hint: 'Calidad del aire' },
]

// Local press — color per outlet matches their brand loosely
export const RR_PRESS_POOL = [
  { src: 'Las Provincias',   mono: 'LP', color: '#B0291F', cat: 'Local',    tone: 'info', headline: 'Riba-roja estrena riego inteligente en el Parc Cinturó Verd' },
  { src: 'Levante-EMV',      mono: 'LE', color: '#D5A013', cat: 'Obras',    tone: 'info', headline: 'El Ayuntamiento aprueba 12 nuevas plazas de aparcamiento en el centro' },
  { src: 'Valencia Plaza',   mono: 'VP', color: '#1E3A8A', cat: 'Movilidad',tone: 'warn', headline: 'Metro L9 modificará su frecuencia durante agosto' },
  { src: 'Cadena SER',       mono: 'SR', color: '#0A0A0A', cat: 'Sucesos',  tone: 'warn', headline: 'Detenido un individuo por tentativa de robo en el Polígono Oeste' },
  { src: 'ElDiario.es CV',   mono: 'ED', color: '#E43F3B', cat: 'Política', tone: 'warn', headline: 'El pleno de hoy debate la Zona de Bajas Emisiones' },
  { src: 'À Punt',           mono: 'ÀP', color: '#FF6B00', cat: 'Medio Amb.',tone:'ok',   headline: 'Riba-roja instalará 4 nuevos puntos de reciclaje este mes' },
  { src: '20minutos',        mono: '20', color: '#CC0000', cat: 'Local',    tone: 'info', headline: 'Convocatoria vecinal para el Consell de Barri del Sector 14' },
  { src: 'El Mundo CV',      mono: 'EM', color: '#1C1C1C', cat: 'Local',    tone: 'warn', headline: 'Vecinos del Barrio de la Ermita reclaman más iluminación nocturna' },
  { src: 'Levante-EMV',      mono: 'LE', color: '#D5A013', cat: 'Obras',    tone: 'info', headline: 'Licitación de alumbrado LED por €680.000 adjudicada' },
  { src: 'RTVE L\'Horta',    mono: 'TV', color: '#004B8D', cat: 'Política', tone: 'info', headline: 'Abierto el plazo de alegaciones al PGOU — 30 días hábiles' },
  { src: 'Las Provincias',   mono: 'LP', color: '#B0291F', cat: 'Medio Amb.',tone:'ok',   headline: 'El río Túria recupera caudal medio tras las últimas lluvias' },
  { src: 'Levante-EMV',      mono: 'LE', color: '#D5A013', cat: 'Cultura',  tone: 'info', headline: 'Programa cultural de verano: 14 actividades gratuitas en el casco urbano' },
  { src: 'Cadena SER',       mono: 'SR', color: '#0A0A0A', cat: 'Seguridad',tone: 'ok',   headline: 'La Policía Local refuerza el dispositivo de controles en el Polígono' },
  { src: 'Valencia Plaza',   mono: 'VP', color: '#1E3A8A', cat: 'Economía', tone: 'ok',   headline: 'Tres empresas se instalan en el Polígono Industrial Oeste' },
]

// Social feed — mix of institutional accounts, citizens, journalists, opposition
export const RR_SOCIAL_POOL = [
  { handle: 'AytoRibaroja',    name: 'Ajuntament Riba-roja', verified: true,  bg: '#2463EB', initials: 'AR', platform: 'x',  tone: 'info', text: '🚧 Aviso: corte parcial en C/ Mayor hoy 16:00–19:00 por obras de reasfaltado. Desvíos señalizados.',     likes: 42, replies: 7, reposts: 12 },
  { handle: 'PolLocal_Riba',   name: 'Policía Local',        verified: true,  bg: '#1E3A8A', initials: 'PL', platform: 'x',  tone: 'warn', text: 'Controles de velocidad en Avda. Constitución durante la mañana. ⚠ Circulen con prudencia.',           likes: 18, replies: 3, reposts:  5 },
  { handle: 'MariaV_Riba',     name: 'María V.',             verified: false, bg: '#B084EE', initials: 'MV', platform: 'x',  tone: 'crit', text: 'Otro bache en C/ Cid sin arreglar. @AytoRibaroja van 3 semanas ya. 🕳️',                              likes:  9, replies: 2, reposts:  1 },
  { handle: 'joan_ermita',     name: 'Joan M.',              verified: false, bg: '#4ADE80', initials: 'JM', platform: 'bluesky', tone: 'ok', text: '¡Al fin! Han arreglado el banco del Parc de la Ermita. Gracias a los que lo reportasteis 👏',     likes: 24, replies: 4, reposts:  2 },
  { handle: 'VecinosSect14',   name: 'Vecinos Sector 14',    verified: false, bg: '#F5B544', initials: 'VS', platform: 'x',  tone: 'info', text: 'Recordad: mañana Consell de Barri a las 19h en el Salón de Actos. Vamos a dar la cara por la zona.',   likes: 31, replies: 8, reposts:  9 },
  { handle: 'MetroValencia',   name: 'MetroValencia',        verified: true,  bg: '#E53935', initials: 'M', platform: 'x',  tone: 'info', text: 'L9 en servicio normal. Actualización: frecuencia 15 min en hora punta a partir de agosto.',         likes: 56, replies: 12, reposts: 18 },
  { handle: 'paco_erm',        name: 'Paco R.',              verified: false, bg: '#94A3B8', initials: 'PR', platform: 'x',  tone: 'warn', text: 'El contenedor de C/ Pau lleva 3 días desbordado. Esto no es normal, @AytoRibaroja.',                  likes:  7, replies: 1, reposts:  0 },
  { handle: 'LauraV_press',    name: 'Laura Vázquez',        verified: true,  bg: '#0EA5E9', initials: 'LV', platform: 'mastodon', tone: 'info', text: 'Mañana publicamos el análisis de 312 quejas de limpieza en Riba-roja. No os lo perdáis 📊',  likes: 88, replies: 11, reposts: 34 },
  { handle: 'AytRiba_Obras',   name: 'Obras · Riba-roja',    verified: true,  bg: '#7C3AED', initials: 'OR', platform: 'x',  tone: 'ok',   text: 'Trabajos en curso en Avda. Primero de Mayo. Tramo 2 de 3 avanzando al 68%. Fin previsto: 12 ago.', likes: 14, replies: 2, reposts:  3 },
  { handle: 'RibaInfo',        name: 'Riba-roja Info',       verified: false, bg: '#F97316', initials: 'RI', platform: 'x',  tone: 'info', text: '📢 Pleno hoy 18:00 — 2 puntos calientes: Ordenanza de ruidos y Moción ZBE. Sigue el directo.',     likes: 62, replies: 9, reposts: 22 },
  { handle: 'PepeOliva_PSOE',  name: 'Pepe Oliva',           verified: true,  bg: '#E53935', initials: 'PO', platform: 'x',  tone: 'info', text: 'Hoy defenderé en el pleno el calendario de renovación del alumbrado LED. 680k€ bien invertidos.',  likes: 37, replies: 14, reposts:  6 },
  { handle: 'VerdsRiba',       name: 'Verds Riba-roja',      verified: false, bg: '#16A34A', initials: 'VR', platform: 'mastodon', tone: 'warn', text: 'Pedimos que la ZBE entre en vigor antes de 2027. No podemos esperar 3 años más con el aire del Polígono.', likes: 28, replies: 6, reposts: 11 },
  { handle: 'carolina_traver', name: 'Carolina B.',          verified: false, bg: '#22D3EE', initials: 'CB', platform: 'bluesky', tone: 'ok', text: 'Día soleado en Masía de Traver. El parque lleno de familias. Así da gusto ☀️',                        likes: 19, replies: 0, reposts:  1 },
  { handle: 'transito_GV',     name: 'Tráfico GV',           verified: true,  bg: '#0A0A0A', initials: 'TG', platform: 'x',  tone: 'warn', text: 'CV-35 dirección Valencia — retenciones km 12 a km 16 por obras. Desvío por CV-370.',              likes: 11, replies: 3, reposts:  4 },
  { handle: 'antonio_polig',   name: 'Antonio L.',           verified: false, bg: '#EF4444', initials: 'AL', platform: 'x',  tone: 'crit', text: 'Hay un olor terrible en el Polígono esta mañana. Alguien ha reportado? 😷',                           likes:  4, replies: 2, reposts:  0 },
]

;
