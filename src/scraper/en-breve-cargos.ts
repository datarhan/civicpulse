/**
 * La lectura vecinal de /cargos — puro, sin E/S.
 *
 * La auditoría de las dos lecturas (§3) midió que quien llega a /cargos
 * preguntando «¿quién lleva lo mío?» se encuentra primero dos series de
 * retribuciones, un párrafo de 120 palabras y un histograma de filas anónimas.
 * Todo cierto y necesario, para quien lo busca. Encima va la respuesta corta,
 * derivada de los mismos ficheros:
 *
 * - «¿Cuánto cobran?» sale del acuerdo de retribuciones (dedicaciones.json):
 *   cuántos puestos tienen sueldo, del menor al mayor importe, y cuántos
 *   concejales cobran sólo por sesión. Si las dos cuentas no suman los escaños
 *   del pleno no hay frase: serían dos cifras ciertas sin el puente que las
 *   cuadra. Una fila sin importe tampoco cuenta como cero: tampoco hay frase.
 * - El importe mayor lleva dentro la antigüedad personal de quien ocupa el
 *   puesto cuando el cuadro del acta la escribe (`antiguedadEuros`, que el
 *   validador exige citada). El cuadro de retribuciones de abajo los separa, y
 *   la frase lo dice: sin eso, 59.195 € se leería como el sueldo del cargo.
 * - «¿Quién vigila al gobierno?» sale de la lista de cargos: quien no tiene
 *   ninguna área delegada, la misma regla que reparte la página en «Quién
 *   dirige qué» y «Quién fiscaliza» (`sinAreasDelegadas`).
 * - La lista de los 21 de la lectura vecinal reparte con la misma regla y el
 *   mismo orden que las tarjetas de abajo (`conAreasDelegadas`).
 *
 * Ninguna frase de aquí nombra a una persona: un tramo de importes y unos
 * partidos. La lista devuelve las filas de la lista de cargos tal cual.
 */

export interface FilaDeDedicacion {
  slug?: string
  amountEuros?: number | null
  antiguedadEuros?: number | null
}

export interface AcuerdoDeRetribuciones {
  byOfficial?: FilaDeDedicacion[]
  sinDedicacionCount?: number
  source?: { date?: string | null } | null
}

export interface SueldosEnBreve {
  /** Puestos con sueldo fijado por el pleno. */
  conSueldo: number
  /** Concejales que cobran sólo por las sesiones a las que asisten. */
  sinSueldo: number
  minimo: number
  maximo: number
  /** La antigüedad personal que lleva dentro el importe mayor, o null si la fila no la trae. */
  antiguedadDelMaximo: number | null
  /** El día del acuerdo, «AAAA-MM-DD». */
  fecha: string | null
}

const esImporte = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

export function sueldosEnBreve(
  acuerdo: AcuerdoDeRetribuciones | null | undefined,
  escanos: number,
): SueldosEnBreve | null {
  const filas = acuerdo?.byOfficial ?? []
  const sinSueldo = acuerdo?.sinDedicacionCount
  if (filas.length === 0 || typeof sinSueldo !== 'number') return null
  if (filas.length + sinSueldo !== escanos) return null
  if (!filas.every((f) => esImporte(f.amountEuros))) return null
  const importes = filas.map((f) => f.amountEuros as number)
  const maximo = Math.max(...importes)
  const antiguedad = filas.find((f) => f.amountEuros === maximo)?.antiguedadEuros
  return {
    conSueldo: filas.length,
    sinSueldo,
    minimo: Math.min(...importes),
    maximo,
    antiguedadDelMaximo: esImporte(antiguedad) ? antiguedad : null,
    fecha: acuerdo?.source?.date ?? null,
  }
}

export interface Cargo {
  party: string
  role?: string
  portfolios?: string[] | null
}

/** Quien no tiene ninguna área delegada: no gobierna, fiscaliza. */
export function sinAreasDelegadas<T extends Cargo>(cargos: readonly T[]): T[] {
  return cargos.filter((o) => (o.portfolios ?? []).length === 0)
}

/**
 * Quien tiene alguna área delegada, el complemento exacto de
 * `sinAreasDelegadas`: el alcalde delante y los demás en el orden de la lista.
 * Es el orden de «Quién dirige qué» y el de la lista de los 21, que así no
 * pueden contar a dos gobiernos distintos. Un alcalde sin áreas no entra por
 * ser alcalde: la regla son las áreas, no el cargo.
 */
export function conAreasDelegadas<T extends Cargo>(cargos: readonly T[]): T[] {
  const con = cargos.filter((o) => (o.portfolios ?? []).length > 0)
  return [...con.filter((o) => o.role === 'alcalde'), ...con.filter((o) => o.role !== 'alcalde')]
}

export interface QuienFiscaliza {
  n: number
  /** Un partido una vez, de más a menos escaños; a igualdad, por su nombre. */
  partidos: { partido: string; escanos: number }[]
}

export function quienFiscaliza(cargos: readonly Cargo[]): QuienFiscaliza | null {
  const fuera = sinAreasDelegadas(cargos)
  if (fuera.length === 0) return null
  const porPartido = new Map<string, number>()
  for (const o of fuera) porPartido.set(o.party, (porPartido.get(o.party) ?? 0) + 1)
  const partidos = [...porPartido]
    .map(([partido, escanos]) => ({ partido, escanos }))
    .sort((a, b) => b.escanos - a.escanos || a.partido.localeCompare(b.partido))
  return { n: fuera.length, partidos }
}
