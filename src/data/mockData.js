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
};
