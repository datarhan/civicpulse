// @ts-check
/**
 * CPV (Common Procurement Vocabulary, EU 2008) code → human Spanish label.
 *
 * Contracts carry bare 8-digit CPV codes. The full per-code dictionary
 * (`public/data/cpv-labels.json`, built by `scripts/build-cpv-labels.ts`,
 * trimmed to the codes present in our data) is passed in as `dict`. When a
 * code is missing from the dict — or the dict failed to load — we degrade to
 * the 2-digit **division** label embedded below (all 45 CPV-2008 divisions,
 * guaranteed), and only as a last resort echo the raw code. So the feature
 * never shows a naked number even if the dictionary build is skipped.
 */

/** All 45 CPV-2008 divisions (2-digit prefix → Spanish label). */
export const CPV_DIVISIONS = {
  '03': 'Productos de la agricultura, ganadería, pesca y silvicultura',
  '09': 'Derivados del petróleo, combustibles y electricidad',
  14: 'Productos de la minería y metales básicos',
  15: 'Alimentos, bebidas, tabaco y productos afines',
  16: 'Maquinaria agrícola',
  18: 'Ropa, calzado, artículos de equipaje y accesorios',
  19: 'Cuero, tejidos textiles, plásticos y caucho',
  22: 'Impresos y productos relacionados',
  24: 'Productos químicos',
  30: 'Equipo y suministros de oficina e informática',
  31: 'Máquinas, aparatos y equipo eléctricos; iluminación',
  32: 'Equipos de radio, televisión y telecomunicaciones',
  33: 'Equipos y artículos médicos, farmacéuticos y de higiene',
  34: 'Equipos de transporte y productos auxiliares',
  35: 'Equipo de seguridad, extinción de incendios y defensa',
  37: 'Instrumentos musicales, artículos deportivos, juegos y juguetes',
  38: 'Equipo de laboratorio, óptico y de precisión',
  39: 'Mobiliario, electrodomésticos y productos de limpieza',
  41: 'Agua natural',
  42: 'Maquinaria industrial',
  43: 'Maquinaria de minería y equipo de construcción',
  44: 'Estructuras y materiales de construcción',
  45: 'Trabajos de construcción',
  48: 'Paquetes de software y sistemas de información',
  50: 'Servicios de reparación y mantenimiento',
  51: 'Servicios de instalación (excepto software)',
  55: 'Servicios de hostelería, restaurante y comercio',
  60: 'Servicios de transporte',
  63: 'Servicios auxiliares de transporte y agencias de viajes',
  64: 'Servicios de correos y telecomunicaciones',
  65: 'Servicios públicos (agua, energía, alumbrado)',
  66: 'Servicios financieros y de seguros',
  70: 'Servicios inmobiliarios',
  71: 'Servicios de arquitectura, ingeniería e inspección',
  72: 'Servicios de tecnología de la información',
  73: 'Servicios de investigación y desarrollo',
  75: 'Servicios de administración pública y seguridad social',
  76: 'Servicios relacionados con petróleo y gas',
  77: 'Servicios agrícolas, forestales y de jardinería',
  79: 'Servicios a empresas: asesoría, mercadotecnia y seguridad',
  80: 'Servicios de enseñanza y formación',
  85: 'Servicios de salud y asistencia social',
  90: 'Servicios de alcantarillado, basura, limpieza y medio ambiente',
  92: 'Servicios de esparcimiento, culturales y deportivos',
  98: 'Otros servicios comunitarios, sociales y personales',
}

/** Normalise a CPV code to its bare leading 8 digits (strips check digit/dash). */
function normalizeCpv(code) {
  if (code === null || code === undefined) return ''
  const digits = String(code).replace(/\D/g, '')
  return digits.slice(0, 8)
}

/** Leading 2-digit CPV division for a code (or '' when unparseable). */
export function cpvDivision(code) {
  return normalizeCpv(code).slice(0, 2)
}

/**
 * Human Spanish label for a CPV code.
 * full-code dict → 2-digit division → raw code (never a naked number if the
 * division is one of the 45 known ones).
 * @param {string|number|null|undefined} code
 * @param {Record<string,string>} [dict] full-code dictionary from cpv-labels.json
 */
export function cpvLabel(code, dict) {
  const norm = normalizeCpv(code)
  if (!norm) return ''
  if (dict && dict[norm]) return dict[norm]
  const div = norm.slice(0, 2)
  if (dict && dict[`${div}000000`]) return dict[`${div}000000`]
  if (CPV_DIVISIONS[div]) return CPV_DIVISIONS[div]
  return norm
}

/**
 * Map a list of CPV codes to de-duplicated human labels, preserving order.
 * @param {Array<string|number>|null|undefined} codes
 * @param {Record<string,string>} [dict]
 * @param {number} [limit]
 * @returns {string[]}
 */
export function uniqueCpvLabels(codes, dict, limit = 3) {
  if (!Array.isArray(codes)) return []
  const out = []
  const seen = new Set()
  for (const c of codes) {
    const label = cpvLabel(c, dict)
    if (!label || seen.has(label)) continue
    seen.add(label)
    out.push(label)
    if (out.length >= limit) break
  }
  return out
}
