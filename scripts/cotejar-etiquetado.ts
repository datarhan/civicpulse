#!/usr/bin/env tsx
/**
 * ¿Se sostiene el etiquetado de la muestra de dimensionado?
 *
 *   npm run cotejar:etiquetado
 *   npm run cotejar:etiquetado -- --json
 *
 * ## Qué problema resuelve
 *
 * `editorial/cobertura-sizing-etiquetado.md` lleva 102 filas etiquetadas a mano
 * por una máquina y una nota que dice «pendiente de confirmación humana». Que
 * la misma máquina las relea y diga «confirmado» no añade NADA: es el defecto
 * que este repositorio persigue —un veredicto automático ascendiéndose solo— con
 * otra ropa.
 *
 * Lo que sí añade información es contrastar cada etiqueta contra señales
 * DETERMINISTAS e independientes del juicio que la puso. Cada etiqueta hace una
 * predicción comprobable:
 *
 *   sin-fuente-publica  nombra un documento          → `claseDocumentalDe`
 *   no-municipal        nombra otro ámbito           → `deAmbitoAjeno` / entidad ajena
 *   no-factual          no trae proposición medible  → sin cifra Y sin documento
 *   comprobable         trae algo que casar          → cifra, fecha o entidad
 *
 * Donde la señal contradice a la etiqueta hay una fila que mirar. No es que la
 * etiqueta esté mal: es que no se apoya en lo que dice apoyarse.
 *
 * ## Lo que este cotejo NO demuestra
 *
 * Que una etiqueta case con un proxy léxico no la hace correcta: acota UN modo
 * de fallo (la etiqueta puesta contra la evidencia del propio literal), no el
 * sesgo de quien etiquetó. Se dice aquí porque un cotejo que se vendiera como
 * validación sería justo la ficción que el informe se negó a escribir.
 *
 * Cuatro desenlaces, y el fichero ausente NO es un aprobado.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { claseDocumentalDe } from '../src/scraper/clase-documental'
import { deAmbitoAjeno } from './lib/solicitud-borrador'

const RUTA = resolve('editorial/cobertura-sizing-etiquetado.md')

export const ETIQUETAS = [
  'comprobable',
  'sin-fuente-publica',
  'no-municipal',
  'no-factual',
] as const
export type Etiqueta = (typeof ETIQUETAS)[number]

export const DESENLACES = ['apoyada', 'sin-apoyo', 'contradicha', 'sin-senal'] as const
export type Desenlace = (typeof DESENLACES)[number]

/**
 * Algo que casar contra un dato: cifra, importe, año… o una cantidad EN LETRA.
 *
 * La primera versión exigía dígitos y mandaba a `contradicha` «un presupuesto de
 * dos millones y medio», que es perfectamente casable. Un instrumento que falla
 * así no mide el etiquetado: mide su propia estrechez, y publicar su titular
 * («24 % apoyadas») habría sido exactamente la cifra sin comprobar que este
 * informe se negó a escribir.
 */
const CIFRA =
  /(\d[\d.,]*\s*(%|euros?|€|habitantes|mil|millones|d[ií]as?|minutos?|horas?|a[ñn]os?|meses|puntos|viviendas|plazas|contratos?)|\b(19|20)\d{2}\b|\b\d[\d.,]{2,}\b|\b(un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|veinte|treinta|cuarenta|cincuenta|cien|ciento|mil)\s+(mill[oó]n|millones|mil|euros)\b)/i
/** Una fecha en palabras. */
const FECHA =
  /\b(\d{1,2} de \w+|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i
/**
 * Algo NOMBRADO que un corpus podría localizar: nombre propio compuesto, sigla,
 * o un identificador alfanumérico.
 *
 * El identificador se añadió porque «la rotonda CV336» salía sin señal: es
 * justo lo más casable que puede traer un literal, y el patrón no lo veía.
 */
const ENTIDAD =
  /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|[A-ZÁÉÍÓÚÑ]{3,}|[A-Z]{2,}[- ]?\d{2,})\b/

/**
 * Otra administración o un ámbito por encima del municipio.
 *
 * Ancha a propósito, al revés que `deAmbitoAjeno`: aquí una omisión no cuesta
 * una petición mal fundada, sólo una fila que mirar de más.
 */
const OTRA_ADMIN =
  /\b(generalitat|conseller|diputaci[oó]n|ministeri|gobierno de espa[ñn]a|gobierno central|estado|europ|comunitat|comunidad valenciana|auton[oó]mic|nacional|otros ayuntamientos|otras administraciones|salario m[íi]nimo|espa[ñn]a|sepe|seguridad social|mancomunitat|mancomunidad)\b/i

export interface Fila {
  n: number
  etiqueta: Etiqueta
  tipo: string
  tema: string
  literal: string
}

/** Lee la tabla del markdown. Las columnas son `| n | etiqueta | tipo | tema | literal |`. */
export function leerTabla(md: string): Fila[] {
  const filas: Fila[] = []
  for (const linea of md.split('\n')) {
    const m = /^\|\s*(\d+)\s*\|\s*`([^`]+)`\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*(.*?)\s*\|\s*$/.exec(
      linea,
    )
    if (!m) continue
    const etiqueta = m[2].trim() as Etiqueta
    if (!ETIQUETAS.includes(etiqueta)) continue
    filas.push({
      n: Number(m[1]),
      etiqueta,
      tipo: m[3].trim(),
      tema: m[4].trim(),
      literal: m[5].trim(),
    })
  }
  return filas
}

export interface Cotejo {
  fila: Fila
  desenlace: Desenlace
  senal: string
}

/**
 * La predicción que hace cada etiqueta, y si el literal la sostiene.
 *
 * `contradicha` se reserva para cuando la señal apunta a OTRA etiqueta concreta;
 * `sin-apoyo` es «no encuentro en el literal lo que esta etiqueta promete», que
 * es más débil y mucho más común.
 */
export function cotejar(fila: Fila): Cotejo {
  const t = fila.literal
  const clases = claseDocumentalDe(t)
  const ajeno = deAmbitoAjeno(t)
  const cifra = CIFRA.test(t)
  const fecha = FECHA.test(t)
  const entidad = ENTIDAD.test(t)
  const con = (desenlace: Desenlace, senal: string): Cotejo => ({ fila, desenlace, senal })

  if (fila.etiqueta === 'sin-fuente-publica') {
    if (clases.length > 0) return con('apoyada', `nombra ${clases.join('/')}`)
    if (!cifra && !fecha && !entidad) {
      return con(
        'contradicha',
        'no nombra documento y no trae cifra, fecha ni entidad: parece no-factual',
      )
    }
    return con('sin-apoyo', 'no nombra ningún documento')
  }

  if (fila.etiqueta === 'no-municipal') {
    // Señal PROPIA y más ancha que `deAmbitoAjeno`, que se calibró para las
    // cartas —donde excluir de más cuesta caro— y aquí daba 18 % apoyadas
    // cuando lo que fallaba era el instrumento. Una misma palabra no puede
    // servir a dos umbrales distintos sin decirlo.
    if (OTRA_ADMIN.test(t))
      return con('apoyada', 'nombra otra administración o ámbito supramunicipal')
    if (ajeno) return con('apoyada', 'nombra otro ámbito y no el nuestro')
    if (entidad)
      return con('sin-apoyo', 'hay entidad, pero nada dice que sea de otra administración')
    return con('sin-senal', 'sin marcador de ámbito en el literal')
  }

  if (fila.etiqueta === 'no-factual') {
    if (!cifra && !fecha && clases.length === 0)
      return con('apoyada', 'sin cifra, sin fecha, sin documento')
    if (clases.length > 0 && (cifra || fecha)) {
      return con('contradicha', `nombra ${clases.join('/')} y trae ${cifra ? 'cifra' : 'fecha'}`)
    }
    return con(
      'sin-apoyo',
      cifra ? 'trae una cifra' : fecha ? 'trae una fecha' : `nombra ${clases.join('/')}`,
    )
  }

  // comprobable
  if (cifra || fecha) return con('apoyada', cifra ? 'trae cifra' : 'trae fecha')
  if (entidad) return con('sin-apoyo', 'sólo una entidad: casar eso contra un corpus es más frágil')
  return con('contradicha', 'sin cifra, sin fecha y sin entidad: no hay nada que casar')
}

function main(): void {
  const asJson = process.argv.includes('--json')
  if (!existsSync(RUTA)) {
    process.stdout.write(
      '[cotejar-etiquetado] 0 fila(s) · SALTADO: no existe editorial/cobertura-sizing-etiquetado.md.\n' +
        '  No se ha comprobado nada, que no es lo mismo que estar todo bien.\n' +
        '  Genéralo con `npm run report:claim-coverage` y etiqueta la muestra.\n',
    )
    return
  }
  const filas = leerTabla(readFileSync(RUTA, 'utf8'))
  if (filas.length === 0) {
    process.stdout.write(
      '[cotejar-etiquetado] 0 fila(s) · SALTADO: el fichero está, pero no encuentro la tabla.\n',
    )
    return
  }

  const cotejos = filas.map(cotejar)
  const porDesenlace = (d: Desenlace) => cotejos.filter((c) => c.desenlace === d)
  const porEtiqueta: Record<string, Record<string, number>> = {}
  for (const c of cotejos) {
    ;(porEtiqueta[c.fila.etiqueta] ??= {})[c.desenlace] =
      ((porEtiqueta[c.fila.etiqueta] ??= {})[c.desenlace] ?? 0) + 1
  }

  if (asJson) {
    process.stdout.write(JSON.stringify({ filas: cotejos, porEtiqueta }, null, 2) + '\n')
    return
  }

  const apoyadas = porDesenlace('apoyada').length
  process.stdout.write(
    `[cotejar-etiquetado] ${filas.length} fila(s) · ${apoyadas} apoyada(s) · ` +
      `${porDesenlace('sin-apoyo').length} sin apoyo · ${porDesenlace('contradicha').length} contradicha(s) · ` +
      `${porDesenlace('sin-senal').length} sin señal\n\n`,
  )
  for (const e of ETIQUETAS) {
    const d = porEtiqueta[e] ?? {}
    const total = Object.values(d).reduce((a, b) => a + b, 0)
    if (total === 0) continue
    const pct = (((d.apoyada ?? 0) / total) * 100).toFixed(0)
    process.stdout.write(
      `  ${e.padEnd(20)} ${String(total).padStart(3)} fila(s) · ${pct}% apoyadas` +
        `${d.contradicha ? ` · ${d.contradicha} CONTRADICHA(S)` : ''}\n`,
    )
  }

  const malas = porDesenlace('contradicha')
  if (malas.length > 0) {
    process.stdout.write(`\n  Filas donde la señal apunta a otra etiqueta:\n`)
    for (const c of malas) {
      process.stdout.write(
        `   #${String(c.fila.n).padStart(3)} \`${c.fila.etiqueta}\` — ${c.senal}\n` +
          `        «${c.fila.literal.slice(0, 96)}»\n`,
      )
    }
  }
  process.stdout.write(
    `\n  Esto acota UN modo de fallo —la etiqueta contra la evidencia del propio literal—,\n` +
      `  no el sesgo de quien etiquetó. No es una validación, y no sale 1: lo que produce\n` +
      `  es una lista de filas que mirar.\n`,
  )
}

if (process.argv[1]?.endsWith('cotejar-etiquetado.ts')) main()
