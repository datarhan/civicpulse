// =============================================================================
// CivicPulse Mock Data — Riba-roja de Túria (Municipality)
// =============================================================================

export const vitals = {
  airQuality: {
    aqi: 12,
    label: 'Excelente',
    color: '#00e676',
    source: 'AEMET / Sensor Local'
  },
  safety: {
    status: 'normal',
    label: 'Normal',
    incidents24h: 0,
    color: '#00e676'
  },
  metro: {
    line: 'Línea 9 MetroValencia',
    delay: 4,
    unit: 'min',
    color: '#ffa726'
  }
};

export const morningPulse = {
  date: '18 de marzo de 2026',
  headline: 'Pleno Extraordinario del Ayuntamiento',
  summary: `En el Pleno de anoche (18/03/2026), el Ayuntamiento aprobó una ampliación de €2,1M para el Polígono Industrial. También se actualizó la ordenanza de ruido de tu distrito. El concejal de urbanismo presentó el nuevo plan de movilidad sostenible para Riba-roja que incluye 3 km de carril bici.`,
  fullText: `Resumen completo del Pleno:\n\n1. Aprobación del presupuesto de ampliación del Polígono Industrial por €2,1M — Votación: 15 a favor, 6 en contra.\n\n2. Actualización de la Ordenanza Municipal de Ruido — Nuevos límites horarios para actividades de construcción (8:00–20:00).\n\n3. Plan de Movilidad Sostenible — 3 km de carril bici conectando el casco urbano con la estación de metro. Plazo: 18 meses.\n\n4. Convenio con Conselleria de Sanitat para nuevo centro de salud en el Sector 14.\n\n5. Ruegos y preguntas — Vecinos del Barrio de la Ermita solicitan más iluminación en Carrer de la Pau.`,
  source: 'Acta del Pleno · ayuntamiento.ribarroja.es'
};

export const incidents = [
  {
    id: 1,
    type: 'pothole',
    label: 'Bache en la calzada',
    location: 'Carrer Major, 42',
    status: 'open',
    lat: 39.5450,
    lng: -0.5695,
    assignedTo: 'rafael_gomez',
    reportedDate: '2026-03-15',
    category: 'Baches'
  },
  {
    id: 2,
    type: 'lighting',
    label: 'Farola fundida',
    location: 'Avinguda de la Constitució, 18',
    status: 'open',
    lat: 39.5430,
    lng: -0.5730,
    assignedTo: 'maria_sanchez',
    reportedDate: '2026-03-16',
    category: 'Iluminación'
  },
  {
    id: 3,
    type: 'bench',
    label: 'Banco roto',
    location: 'Carrer Major, 15',
    status: 'open',
    lat: 39.5442,
    lng: -0.5710,
    assignedTo: 'rafael_gomez',
    reportedDate: '2026-03-14',
    category: 'Limpieza'
  },
  {
    id: 4,
    type: 'bike_lane',
    label: 'Nuevo carril bici',
    location: 'Sector 14',
    status: 'in_progress',
    lat: 39.5465,
    lng: -0.5680,
    assignedTo: 'carlos_martinez',
    reportedDate: '2026-03-10',
    expectedDays: 3,
    category: 'Baches'
  },
  {
    id: 5,
    type: 'trash',
    label: 'Contenedor desbordado',
    location: 'Plaça de l\'Ajuntament',
    status: 'in_progress',
    lat: 39.5438,
    lng: -0.5720,
    assignedTo: 'ana_lopez',
    reportedDate: '2026-03-17',
    category: 'Limpieza'
  },
  {
    id: 6,
    type: 'lighting',
    label: 'Zona oscura peligrosa',
    location: 'Carrer de la Pau, 3',
    status: 'open',
    lat: 39.5420,
    lng: -0.5750,
    assignedTo: 'maria_sanchez',
    reportedDate: '2026-03-13',
    category: 'Iluminación'
  },
  {
    id: 7,
    type: 'pothole',
    label: 'Socavón tras lluvias',
    location: 'Camí de Manises, km 2',
    status: 'fixed',
    lat: 39.5480,
    lng: -0.5660,
    assignedTo: 'rafael_gomez',
    reportedDate: '2026-03-08',
    fixedDate: '2026-03-12',
    category: 'Baches'
  },
  {
    id: 8,
    type: 'cleanliness',
    label: 'Grafiti en fachada pública',
    location: 'Biblioteca Municipal',
    status: 'open',
    lat: 39.5455,
    lng: -0.5700,
    assignedTo: 'ana_lopez',
    reportedDate: '2026-03-16',
    category: 'Limpieza'
  }
];

export const politicians = [
  {
    id: 'robert_raga',
    name: 'Robert Raga',
    role: 'Alcalde',
    party: 'PSOE',
    partyColor: '#e53935',
    fixRate: 91,
    avgResponseHours: 36,
    totalIssues: 142,
    resolved: 129,
    avatar: null
  },
  {
    id: 'rafael_gomez',
    name: 'Rafael Gómez',
    role: 'Concejal de Urbanismo',
    party: 'PSOE',
    partyColor: '#e53935',
    fixRate: 85,
    avgResponseHours: 48,
    totalIssues: 67,
    resolved: 57,
    avatar: null
  },
  {
    id: 'maria_sanchez',
    name: 'María Sánchez',
    role: 'Concejala de Servicios Públicos',
    party: 'Compromís',
    partyColor: '#ff8f00',
    fixRate: 78,
    avgResponseHours: 52,
    totalIssues: 54,
    resolved: 42,
    avatar: null
  },
  {
    id: 'carlos_martinez',
    name: 'Carlos Martínez',
    role: 'Concejal de Movilidad',
    party: 'PP',
    partyColor: '#1565c0',
    fixRate: 72,
    avgResponseHours: 60,
    totalIssues: 38,
    resolved: 27,
    avatar: null
  },
  {
    id: 'ana_lopez',
    name: 'Ana López',
    role: 'Concejala de Medio Ambiente',
    party: 'Compromís',
    partyColor: '#ff8f00',
    fixRate: 88,
    avgResponseHours: 40,
    totalIssues: 45,
    resolved: 40,
    avatar: null
  },
  {
    id: 'javier_ruiz',
    name: 'Javier Ruiz',
    role: 'Concejal de Seguridad',
    party: 'Vox',
    partyColor: '#43a047',
    fixRate: 65,
    avgResponseHours: 72,
    totalIssues: 29,
    resolved: 19,
    avatar: null
  }
];

export const rivalry = [
  { name: "L'Eliana", efficiency: 92, trend: null, position: 1 },
  { name: 'Riba-roja de Túria', efficiency: 88, trend: '+2% esta semana', position: 2 },
  { name: 'La Pobla de Vallbona', efficiency: 81, trend: null, position: 3 }
];

export const chatResponses = {
  default: {
    question: '¿Por qué ya no recogen la basura los martes?',
    answer: 'Según el contrato de servicios actualizado en el Pleno de marzo de 2026 (Acta nº 2026/03-18, punto 4.2), el servicio de recogida de residuos se ha reorganizado. Tu zona ahora tiene recogida los **lunes, miércoles y viernes**. El cambio se debe a la optimización de rutas aprobada por la Concejalía de Medio Ambiente.',
    source: 'Acta del Pleno 18/03/2026 · ayuntamiento.ribarroja.es/actas/2026-03-18.pdf'
  }
};

// Helper to get politician by id
export function getPolitician(id) {
  return politicians.find(p => p.id === id);
}

// Map center: Riba-roja de Túria municipality center
export const MAP_CENTER = [39.5439, -0.5711];
export const MAP_ZOOM = 14;
