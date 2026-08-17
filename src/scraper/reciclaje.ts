/**
 * Tasas de recogida de residuos por municipio — capa 0503_Residuos del ICV
 * (GVA), WFS `ms:TasasGeneracion.Municipios_wfs`, CC BY 4.0.
 *
 * UNA edición machine-readable, y por eso esto es un corte transversal y no
 * una serie: lo posterior sólo se publica en un visor Power BI sin datos
 * descargables, y ESA ausencia se publica en /eficiencia. La edición tampoco
 * la declara la capa (abstracts genéricos): se estableció MIDIENDO — los
 * habitantes del fichero para Riba-roja (23.050) coinciden exactamente con el
 * padrón INE de 2022 que ya usa la serie de criminalidad.
 *
 * Dos trampas del fichero, fijadas en el fixture:
 *
 *  - Los números van con PUNTO decimal (en-US), no es-ES. Se comprobó con la
 *    identidad kg/hab = tn·1000/habitantes antes de creerlo.
 *  - Una fracción vacía es NULL, no cero: «no declara FORS» y «recogió cero
 *    orgánica» son afirmaciones distintas y la fuente sólo hace la primera.
 *
 * Puro: sin red. El CLI (scripts/scrape-reciclaje.ts) trae el CSV.
 */

export interface FilaResiduos {
  ine: string
  nombre: string
  habitantes: number | null
  consorcio: string | null
  rumTn: number | null
  forsTn: number | null
  vidrioTn: number | null
  eellTn: number | null
  pycTn: number | null
}

/** Una línea CSV con campos entrecomillados (el WKT trae comas dentro). */
function camposCsv(linea: string): string[] {
  const out: string[] = []
  let actual = ''
  let dentro = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '"') {
      if (dentro && linea[i + 1] === '"') {
        actual += '"'
        i++
      } else dentro = !dentro
    } else if (c === ',' && !dentro) {
      out.push(actual)
      actual = ''
    } else actual += c
  }
  out.push(actual)
  return out
}

function numero(s: string | undefined): number | null {
  const t = (s ?? '').trim()
  if (t === '') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

export function parseTasasResiduos(csv: string): FilaResiduos[] {
  const lineas = csv.replace(/^\uFEFF/, '').split('\n')
  const cab = camposCsv(lineas[0] ?? '').map((c) => c.trim().toLowerCase())
  const col = (nombre: string) => {
    const i = cab.indexOf(nombre)
    if (i < 0) throw new Error(`[reciclaje] la cabecera perdió la columna «${nombre}»`)
    return i
  }
  const iIne = col('codinemun')
  const iNombre = col('noms_mun')
  const iHab = col('habitantes')
  const iConsorcio = col('consorcio')
  const iRum = col('rum_tn')
  const iFors = col('fors_tn')
  const iVidrio = col('vidrio_tn')
  const iEell = col('eell_tn')
  const iPyc = col('pyc_tn')

  const out: FilaResiduos[] = []
  for (const linea of lineas.slice(1)) {
    if (!linea.trim()) continue
    const c = camposCsv(linea)
    const ine = (c[iIne] ?? '').trim()
    if (!/^\d{5}$/.test(ine)) continue
    out.push({
      ine,
      nombre: (c[iNombre] ?? '').trim(),
      habitantes: numero(c[iHab]),
      consorcio: (c[iConsorcio] ?? '').trim() || null,
      rumTn: numero(c[iRum]),
      forsTn: numero(c[iFors]),
      vidrioTn: numero(c[iVidrio]),
      eellTn: numero(c[iEell]),
      pycTn: numero(c[iPyc]),
    })
  }
  return out
}

export interface TasaSelectiva {
  /** Toneladas de las fracciones selectivas DECLARADAS (las ausentes, fuera). */
  selectivaTn: number
  totalTn: number
  /** Porcentaje selectiva sobre el total, 0–100. */
  pct: number
}

/**
 * La parte selectiva sobre el total. Sin RUM no hay total y no hay tasa:
 * null, nunca un porcentaje inventado. Las fracciones ausentes no suman —
 * tratarlas como cero inflaría a la baja la tasa de quien no declara.
 */
export function tasaSelectiva(f: FilaResiduos): TasaSelectiva | null {
  if (typeof f.rumTn !== 'number' || f.rumTn <= 0) return null
  const fracciones = [f.forsTn, f.vidrioTn, f.eellTn, f.pycTn].filter(
    (v): v is number => typeof v === 'number' && v >= 0,
  )
  if (fracciones.length === 0) return null
  const selectivaTn = fracciones.reduce((a, b) => a + b, 0)
  const totalTn = selectivaTn + f.rumTn
  return { selectivaTn, totalTn, pct: (100 * selectivaTn) / totalTn }
}
