/**
 * «¿Cuánta gente trabaja en el Ayuntamiento?» — puro, sin E/S.
 *
 * `plantilla.json` trae dos cifras que no miden lo mismo: las PERSONAS que
 * trabajaban en el Ayuntamiento (una nota de prensa de 2021, con desglose por
 * sexo; incluye al personal eventual) y los PUESTOS de la plantilla aprobada en
 * 2024 (funcionario y laboral, cubiertos o vacantes; sin el eventual, que fija
 * aparte un acuerdo plenario). Puestas una al lado de la otra invitan a restar,
 * y la resta no significa nada. La auditoría de las dos lecturas (§21) pidió
 * llevarlas a /empleo-publico con el puente dicho en una frase; esto decide qué
 * mitades de la frase tienen dato.
 *
 * Una cifra sin su año no entra: «trabajan 340 personas» sin el año es una
 * cifra de 2021 leída como de hoy.
 */

export interface PlantillaPublicada {
  total?: number | null
  asOf?: string | null
  authorized?: {
    plazas?: number | null
    approx?: boolean | null
    asOf?: string | null
  } | null
}

export interface PuenteDePlantilla {
  /** Las personas, con el año de la cifra; null si falta cualquiera de los dos. */
  personas: { n: number; anio: string } | null
  /** Los puestos, con el año de la plantilla y si la cifra es una suma aproximada. */
  plazas: { n: number; anio: string; aprox: boolean } | null
}

const anioDe = (s: unknown): string | null => {
  const m = typeof s === 'string' ? /^(\d{4})/.exec(s) : null
  return m ? m[1] : null
}
const esCifra = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

export function puenteDePlantilla(
  p: PlantillaPublicada | null | undefined,
): PuenteDePlantilla | null {
  if (!p) return null
  const anioPersonas = anioDe(p.asOf)
  const personas = esCifra(p.total) && anioPersonas ? { n: p.total, anio: anioPersonas } : null
  const a = p.authorized
  const anioPlazas = anioDe(a?.asOf)
  const plazas =
    a && esCifra(a.plazas) && anioPlazas
      ? { n: a.plazas, anio: anioPlazas, aprox: a.approx === true }
      : null
  if (!personas && !plazas) return null
  return { personas, plazas }
}
