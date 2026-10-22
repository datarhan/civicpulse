/**
 * «Cuesta · Consigue · Responde»: lo que un servicio cuesta, lo que se
 * consigue y quién responde de él, en los MISMOS años y contra el MISMO grupo.
 *
 * El panel ya tenía las tres cosas, pero separadas: el coste en el libro, el
 * resultado dentro de la ficha y el nombre al final de la ficha. Un vecino que
 * pregunta «¿lo hacen bien?» no podía ponerlas una al lado de otra. Este módulo
 * las alinea; no las une. Ninguna cifra se divide por otra (un coste entre un
 * resultado inventaría una relación que ningún dato sostiene, ver
 * `components/eficiencia/Resultado.jsx`), y ninguna palabra lleva valor: la
 * dirección se dice («sube», «baja»), el juicio no.
 *
 * Diseño: docs/superpowers/specs/2026-10-22-lectura-vecinal-eficiencia-design.md §3.
 *
 * ## Por qué un índice, y por qué desde 2021
 *
 * Coste y resultado tienen unidades que no se comparan (€/efectivo, ‰
 * habitantes), y el grupo de pares tiene su propio nivel. Pasar las series a
 * índice (año base = 100) deja ver lo único que se puede comparar entre ellas:
 * cuánto se movieron. La base es 2021 y no antes por dos hechos del dato, no
 * por gusto: 2020 es la entrega que el ayuntamiento no presentó, y es el suelo
 * de la pandemia en la serie de infracciones (empezar ahí exageraría cualquier
 * subida). Si un servicio no tiene 2021, la base es su primer año posterior.
 *
 * ## Qué NO dice
 *
 * Con el denominador congelado (el caso de casi todo el panel), el coste por
 * unidad sigue al coste total: «sube un 50 % por efectivo» puede ser más
 * efectivos o mejores sueldos, y la fila tiene que decirlo. El resultado no es
 * producto del servicio municipal (las infracciones las registran todos los
 * cuerpos). Y la serie de pares del resultado no existe todavía: sólo su último
 * percentil — salvo donde la fuente da la de un panel fijo (`paresSerie`, las
 * bibliotecas). Ninguna de las ausencias se rellena aquí.
 */

/** Primer año que puede ser base. Ver «Por qué desde 2021» arriba. */
export const ANIO_BASE_MINIMO = 2021

/**
 * Promesas del gobierno municipal que hablan de cada servicio, por id de
 * `/promesas`. Es un enlace EDITORIAL, como una asignación `editorial` de
 * `competencias.json`: lo ponemos nosotros leyendo el título de la promesa, y
 * por eso es corto y explícito. Un servicio sin entrada no tiene promesa
 * conocida, y la fila lo dice.
 */
export const PROMESAS_POR_SERVICIO: Readonly<Record<string, readonly string[]>> = {
  'a1621-coste-unitario': ['ac-psoe-1bkbwjs', 'ac-psoe-1ah9zqk'],
}

interface PuntoSerie {
  anio: number
  estado?: string
  numerador?: number | null
  valorReal?: number | null
  medianaParesReal?: number | null
  atipico?: boolean
}

export interface IndicadorCC {
  id: string
  etiqueta?: string
  unidad?: string
  serie?: PuntoSerie[]
  declaracion?: { denominador?: { congelada?: boolean; desde?: number | null } | null } | null
}

export interface ResultadoCC {
  id: string
  servicioRelacionado: string
  etiqueta: string
  unidad: string
  periodo: string
  serie?: { anio: number; valor: number }[]
  pares?: { percentil?: number | null; mediana?: number | null; n?: number } | null
  paresSerie?: { anio: number; mediana: number; n: number }[] | null
  decimales?: number
  comoSeLee?: string
  caveats?: string[]
}

export interface PuntoIndice {
  anio: number
  indice: number
}

export interface SerieIndexada {
  base: number
  puntos: PuntoIndice[]
  ultimo: number
  /** Cambio del último año sobre la base, en puntos porcentuales. */
  cambio: number
}

export interface CuestaConsigue {
  servicioId: string
  coste: {
    nuestro: SerieIndexada
    grupo: SerieIndexada | null
    congelado: boolean
    congeladoDesde: number | null
  } | null
  resultado: {
    id: string
    etiqueta: string
    unidad: string
    periodo: string
    valor: number
    /** Indexada sólo con dos años o más; un año suelto no tiene dirección. */
    nuestro: SerieIndexada | null
    /**
     * La mediana del grupo indexada sobre la MISMA base, cuando la fuente da su
     * serie (`paresSerie`, panel fijo). Sin ella, del grupo sólo hay el último
     * percentil y la fila lo dice.
     */
    grupo: SerieIndexada | null
    /** n del panel fijo de `grupo`. */
    nGrupo: number | null
    decimales: number
    percentil: number | null
    nPares: number | null
    comoSeLee: string | null
  } | null
  promesas: readonly string[]
}

/** Primer año ≥ mínimo con valor; null sin ninguno. */
function anioBase(anios: number[]): number | null {
  const posibles = anios.filter((a) => a >= ANIO_BASE_MINIMO).sort((a, b) => a - b)
  return posibles[0] ?? null
}

/** Una serie {año, valor} a índice sobre `base`. null si la base no tiene valor. */
export function indexar(
  puntos: { anio: number; valor: number }[],
  base: number,
): SerieIndexada | null {
  const enBase = puntos.find((p) => p.anio === base)?.valor
  if (!enBase || !Number.isFinite(enBase)) return null
  const desde = puntos.filter((p) => p.anio >= base).sort((a, b) => a.anio - b.anio)
  if (desde.length < 2) return null
  const conIndice = desde.map((p) => ({ anio: p.anio, indice: (p.valor / enBase) * 100 }))
  const ultimo = conIndice[conIndice.length - 1]
  return { base, puntos: conIndice, ultimo: ultimo.anio, cambio: ultimo.indice - 100 }
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function cuestaConsigue(
  indicador: IndicadorCC,
  resultado: ResultadoCC | null | undefined,
): CuestaConsigue {
  // Sólo lo declarado y no atípico: una entrega «que no puede ser un coste» no
  // es un punto de la serie, es un aviso.
  const validos = (indicador.serie ?? []).filter(
    (p) => p.estado === 'declarado' && !p.atipico && num(p.valorReal),
  )
  const base = anioBase(validos.map((p) => p.anio))
  let coste: CuestaConsigue['coste'] = null
  if (base !== null) {
    const nuestro = indexar(
      validos.map((p) => ({ anio: p.anio, valor: p.valorReal as number })),
      base,
    )
    const grupo = indexar(
      validos
        .filter((p) => num(p.medianaParesReal))
        .map((p) => ({ anio: p.anio, valor: p.medianaParesReal as number })),
      base,
    )
    const den = indicador.declaracion?.denominador
    if (nuestro)
      coste = {
        nuestro,
        grupo,
        congelado: !!den?.congelada,
        congeladoDesde: den?.congelada && num(den.desde) ? den.desde : null,
      }
  }

  let res: CuestaConsigue['resultado'] = null
  if (resultado) {
    const serie = (resultado.serie ?? []).filter((p) => num(p.valor))
    const baseRes = anioBase(serie.map((p) => p.anio))
    const ultimo = serie.slice().sort((a, b) => b.anio - a.anio)[0]
    if (ultimo)
      res = {
        id: resultado.id,
        etiqueta: resultado.etiqueta,
        unidad: resultado.unidad,
        periodo: resultado.periodo,
        valor: ultimo.valor,
        nuestro: baseRes !== null ? indexar(serie, baseRes) : null,
        grupo:
          baseRes !== null && resultado.paresSerie?.length
            ? indexar(
                resultado.paresSerie.map((p) => ({ anio: p.anio, valor: p.mediana })),
                baseRes,
              )
            : null,
        nGrupo: resultado.paresSerie?.length ? resultado.paresSerie[0].n : null,
        decimales: num(resultado.decimales) ? resultado.decimales : 1,
        percentil: num(resultado.pares?.percentil) ? resultado.pares!.percentil! : null,
        nPares: num(resultado.pares?.n) ? resultado.pares!.n! : null,
        comoSeLee: resultado.comoSeLee ?? null,
      }
  }

  return {
    servicioId: indicador.id,
    coste,
    resultado: res,
    promesas: PROMESAS_POR_SERVICIO[indicador.id] ?? [],
  }
}

/**
 * Las filas del bloque: TODOS los servicios del panel. Primero los que tienen
 * un resultado publicado, en el orden de los resultados; después el resto, por
 * coste declarado del último año, de mayor a menor.
 *
 * Al principio sólo entraban los servicios con resultado, y eso escondía dos
 * cosas que un vecino tiene que ver de los otros trece: cómo se ha movido su
 * coste frente al grupo, y quién tiene la competencia. Un «Consigue» vacío no
 * es motivo para callarlas; se dice que está vacío.
 */
export function filasCuestaConsigue(data: {
  indicadores?: IndicadorCC[]
  resultados?: { items?: ResultadoCC[] } | null
}): CuestaConsigue[] {
  const indicadores = data.indicadores ?? []
  const porId = new Map(indicadores.map((i) => [i.id, i]))
  const out: CuestaConsigue[] = []
  const vistos = new Set<string>()
  for (const r of data.resultados?.items ?? []) {
    const ind = porId.get(r.servicioRelacionado)
    if (!ind || vistos.has(ind.id)) continue
    vistos.add(ind.id)
    out.push(cuestaConsigue(ind, r))
  }
  const costeUltimo = (i: IndicadorCC) => {
    const s = (i.serie ?? []).filter((p) => p.estado === 'declarado' && num(p.numerador))
    return s.length ? (s[s.length - 1].numerador as number) : 0
  }
  const resto = indicadores
    .filter((i) => !vistos.has(i.id))
    .sort((a, b) => costeUltimo(b) - costeUltimo(a))
  for (const i of resto) out.push(cuestaConsigue(i, null))
  return out
}

/**
 * La palabra de dirección de un cambio. Sin valor: «sube» no es «peor».
 * Por debajo de un punto de cambio, «se mantiene»: decir «sube un 0 %» es ruido.
 */
export function direccion(cambio: number): 'sube' | 'baja' | 'igual' {
  if (Math.abs(cambio) < 1) return 'igual'
  return cambio > 0 ? 'sube' : 'baja'
}
