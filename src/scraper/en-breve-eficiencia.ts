/**
 * «En breve» de /eficiencia: las cifras de la primera capa, para quien llega
 * preguntando «¿cuánto cuesta y lo hacen bien?» sin saber qué es un
 * denominador congelado.
 *
 * Diseño: docs/superpowers/specs/2026-10-22-lectura-vecinal-eficiencia-design.md
 * (v1 §1, tarjetas 1, 3, 4 y 5; la 2 —«¿es caro?»— la contesta ya «Cuesta ·
 * Consigue · Responde», servicio a servicio y en el mismo idioma de dirección).
 *
 * Las mismas reglas que el resto del panel: cada cifra sale del snapshot y del
 * mismo cálculo que la sección a la que enlaza (el total es el de
 * `LibroServicios`, los congelados los de `EstadoRendicion`), y una respuesta
 * que no se puede dar es `null`, nunca un cero.
 */

interface Serie {
  anio: number
  estado?: string
  denominador?: number | null
}

export interface IndicadorEB {
  id: string
  etiqueta: string
  valor: number | null
  numerador?: { valor?: number | null } | null
  divisor?: { singular?: string; plural?: string } | null
  serie?: Serie[]
  declaracion?: {
    denominador?: { congelada?: boolean; desde?: number | null } | null
  } | null
}

export interface PanelEB {
  anioBase?: number
  indicadores?: IndicadorEB[]
  cobertura?: { entregasPublicadas?: number[]; entregasNoPresentadas?: number[] } | null
}

export interface PreguntasEB {
  panels?: Record<string, { bloques?: { destinatario?: string; items?: unknown[] }[] }>
}

export interface EnBreveEficiencia {
  coste: {
    anio: number
    total: number
    filas: { id: string; etiqueta: string; coste: number; cuota: number }[]
    resto: number
    n: number
  } | null
  congelado: {
    n: number
    de: number
    ejemplo: {
      id: string
      etiqueta: string
      valor: number
      unidad: string
      desde: number
      anios: number[]
    } | null
  } | null
  entregas: { presentadas: number; obligatorias: number; faltan: number[] } | null
  preguntas: { n: number; destinatarios: string[] } | null
}

/** Cuántos servicios se pintan por su nombre antes de agrupar el resto. */
export const FILAS_COSTE = 5

/** El ejemplo preferido: el más concreto para un vecino, si está congelado. */
export const EJEMPLO_PREFERIDO = 'a1621-coste-unitario'

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function enBreveEficiencia(
  panel: PanelEB,
  preguntas?: PreguntasEB | null,
): EnBreveEficiencia {
  const indicadores = panel.indicadores ?? []
  const conRatio = indicadores.filter((i) => i.valor !== null && num(i.numerador?.valor))

  let coste: EnBreveEficiencia['coste'] = null
  if (conRatio.length > 0 && num(panel.anioBase)) {
    // El mismo total que imprime el libro (`LibroServicios`): los servicios con
    // cociente, sumando el coste declarado del último año.
    const total = conRatio.reduce((s, i) => s + (i.numerador!.valor as number), 0)
    const orden = conRatio
      .map((i) => ({ id: i.id, etiqueta: i.etiqueta, coste: i.numerador!.valor as number }))
      .sort((a, b) => b.coste - a.coste)
    const cabeza = orden.slice(0, FILAS_COSTE)
    coste = {
      anio: panel.anioBase,
      total,
      n: conRatio.length,
      filas: cabeza.map((f) => ({ ...f, cuota: f.coste / total })),
      resto: orden.slice(FILAS_COSTE).reduce((s, f) => s + f.coste, 0),
    }
  }

  // Los mismos recuentos que `EstadoRendicion`: medibles son los que tienen
  // cociente y declaración del denominador; congelados, los que la repiten.
  const medibles = conRatio.filter((i) => i.declaracion?.denominador)
  const congelados = medibles.filter((i) => i.declaracion?.denominador?.congelada)
  let congelado: EnBreveEficiencia['congelado'] = null
  if (medibles.length > 0) {
    const candidatos = [
      ...congelados.filter((i) => i.id === EJEMPLO_PREFERIDO),
      ...congelados.filter((i) => i.id !== EJEMPLO_PREFERIDO),
    ]
    let ejemplo: NonNullable<EnBreveEficiencia['congelado']>['ejemplo'] = null
    for (const i of candidatos) {
      const desde = i.declaracion?.denominador?.desde
      if (!num(desde)) continue
      const tramo = (i.serie ?? []).filter(
        (p) => p.anio >= desde && p.estado === 'declarado' && num(p.denominador),
      )
      // Sólo si de verdad es el MISMO valor en todo el tramo: el ejemplo
      // enseña una cifra quieta, y tiene que estarlo.
      const valores = new Set(tramo.map((p) => p.denominador))
      if (tramo.length >= 2 && valores.size === 1) {
        ejemplo = {
          id: i.id,
          etiqueta: i.etiqueta,
          valor: tramo[0].denominador as number,
          unidad: i.divisor?.plural ?? '',
          desde,
          anios: tramo.map((p) => p.anio),
        }
        break
      }
    }
    congelado = { n: congelados.length, de: medibles.length, ejemplo }
  }

  const pub = panel.cobertura?.entregasPublicadas ?? []
  const faltan = panel.cobertura?.entregasNoPresentadas ?? []
  const entregas =
    pub.length > 0
      ? { obligatorias: pub.length, presentadas: pub.length - faltan.length, faltan }
      : null

  const bloques = preguntas?.panels?.['coste-efectivo']?.bloques ?? []
  const n = bloques.reduce((s, b) => s + (b.items?.length ?? 0), 0)
  const preguntasOut =
    n > 0
      ? {
          n,
          destinatarios: [
            ...new Set(bloques.map((b) => b.destinatario).filter(Boolean) as string[]),
          ],
        }
      : null

  return { coste, congelado, entregas, preguntas: preguntasOut }
}
