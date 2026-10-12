/**
 * Una opción que el CLI no conoce no se ignora: se rechaza antes de leer nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ
 *
 * El 11-10-2026 se vio que `reclassify-claim` no tenía `--dry-run`, y que su
 * `parse()` metía cualquier opción que no conocía entre los posicionales:
 * `reclassify-claim <id> <tipo> --reason "…" --dry-run` escribía el sidecar
 * curado y recomponía verified.json de verdad. La mitad de los CLIs de curador
 * hacían lo mismo o algo parecido —`process.argv.includes('--x')` no ve lo que
 * no busca—, y escriben ficheros que este proyecto trata como legalmente
 * materiales. Una opción supuesta o mal tecleada que hace en silencio una
 * escritura real es el peor fallo posible de un CLI así: quien la escribió cree
 * que no ha pasado nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 *
 * Cada CLI declara lo que admite —banderas sueltas y opciones que llevan un
 * valor detrás— y llama a `rechazarOpcionesDesconocidas` como lo primero que
 * hace, antes de leer ningún fichero. No sustituye a su parser: los que ya
 * funcionaban siguen leyendo sus opciones como siempre; esto sólo cierra la
 * puerta a lo que no esperan.
 *
 * Se tiene por opción un token que empieza por `-` o `--` seguido de una letra y
 * sin espacios antes de un `=`: `--dry-run`, `-n`, `--reason=…`. Una cita entre
 * comillas que empiece por un guion lleva espacios y no cuenta; un número
 * negativo tampoco. `--x=valor` se rechaza aunque `--x` exista, porque ninguno
 * de estos parsers lo entiende: leerían `--x` como ausente.
 *
 * Una opción con valor cuyo valor falta, o es otra opción (`--editor --dry-run`),
 * también se rechaza: el parser de turno se habría tragado la segunda como valor
 * de la primera.
 */

export interface OpcionesAdmitidas {
  /** Banderas sin valor: `--dry-run`, `--list`, `-h`. */
  banderas?: readonly string[]
  /** Opciones que llevan un valor detrás: `--reason "<…>"`. */
  conValor?: readonly string[]
}

const PARECE_OPCION = /^--?[A-Za-z][\w-]*(?:=|$)/

/** ¿Es este token una opción, y no un valor posicional? */
export const pareceOpcion = (token: string): boolean => PARECE_OPCION.test(token)

/** Lo que admite, para el mensaje. */
export function describirAdmitidas(opciones: OpcionesAdmitidas): string {
  const todas = [
    ...(opciones.conValor ?? []).map((o) => `${o} <valor>`),
    ...(opciones.banderas ?? []),
  ]
  return todas.length > 0
    ? `Admite: ${todas.join(', ')}.`
    : 'No admite ninguna opción: sólo argumentos posicionales.'
}

/**
 * El motivo por el que esta orden no corre, o `null` si todas sus opciones son
 * de las admitidas. Pura, para las pruebas.
 */
export function opcionDesconocida(
  argv: readonly string[],
  opciones: OpcionesAdmitidas,
): string | null {
  const banderas = new Set(opciones.banderas ?? [])
  const conValor = new Set(opciones.conValor ?? [])
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (!pareceOpcion(t)) continue
    if (banderas.has(t)) continue
    if (conValor.has(t)) {
      const valor = argv[i + 1]
      if (valor === undefined) return `${t} lleva un valor detrás, y no lo tiene.`
      if (pareceOpcion(valor)) {
        return `${t} lleva un valor detrás, y le sigue otra opción (${valor}).`
      }
      i += 1
      continue
    }
    const igual = t.indexOf('=')
    if (igual > 0) {
      const nombre = t.slice(0, igual)
      if (banderas.has(nombre) || conValor.has(nombre)) {
        return `opción no admitida: ${t}. Escríbela separada del valor: ${nombre} <valor>.`
      }
    }
    const sinPrueba =
      t === '--dry-run' || t === '-n'
        ? ' Este CLI no tiene modo de prueba: lo que corre, lo escribe.'
        : ''
    return `opción desconocida: ${t}.${sinPrueba}`
  }
  return null
}

/**
 * Sale con 2 si la orden trae una opción que el CLI no admite, diciendo cuál y
 * cuáles admite. Llámala antes de leer nada.
 */
export function rechazarOpcionesDesconocidas(
  etiqueta: string,
  opciones: OpcionesAdmitidas,
  argv: readonly string[] = process.argv.slice(2),
): void {
  const motivo = opcionDesconocida(argv, opciones)
  if (motivo == null) return
  process.stderr.write(
    `[${etiqueta}] ${motivo} No se ha leído ni escrito nada.\n` +
      `[${etiqueta}] ${describirAdmitidas(opciones)}\n`,
  )
  process.exit(2)
}
