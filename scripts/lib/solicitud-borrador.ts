/**
 * `npm run solicitud -- borrador [--clase <c>]` — redacta el escrito.
 *
 * Existe porque las cuatro cartas se escribieron A MANO, con las cifras dentro:
 * «68 afirmaciones». Eso es justo lo que este repositorio prohíbe en un
 * documento —toda cifra escrita a mano estaba mal cuando se auditó— y aquí el
 * documento va a una administración pública. Una carta que dice 68 cuando el
 * manifiesto dice 71 es una afirmación falsa en un escrito registrado.
 *
 * Así que la carta se DERIVA, y de la misma población que la cuenta: los
 * literales publicados (post-puerta editorial) sin ningún corpus real detrás,
 * agrupados por el documento que nombran. Y se COTEJA con el manifiesto antes de
 * escribir nada: si las dos cifras no coinciden, aborta en vez de publicar la
 * suya. Reproducir un cálculo y no compararlo es cómo se publica una cifra que
 * nadie ha comprobado.
 *
 * Sale a `editorial/` —gitignorado— en dos formatos: `.md` para leerlo y `.txt`
 * para pegarlo en el campo libre de la sede electrónica, que se come el
 * marcado.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { corpusReales } from '../../src/scraper/claim-verdicts'
import {
  CLASES_PEDIBLES,
  CLASE_ETIQUETA,
  claseDocumentalDe,
  type ClasePedible,
} from '../../src/scraper/clase-documental'

const DIR_CHUNKS = resolve('public/data/pleno-claims')
const MANIFIESTO = resolve(DIR_CHUNKS, 'index.json')
const SALIDA = resolve('editorial/solicitudes')

/** Cuántos literales de ejemplo lleva el escrito. */
const EJEMPLOS = 6
/** Un literal largo se recorta EN PALABRA, y se dice que se recortó. */
const CORTE = 190

interface Fila {
  verbatim: string
  fecha: string
}

/**
 * Las filas de una clase: publicadas, sin corpus real, y que nombran ese
 * documento. Es la MISMA condición que usa el manifiesto para contar; si se
 * separan, la carta enseña ejemplos de una población y una cifra de otra.
 */
function filasDe(clase: ClasePedible): Fila[] {
  const out: Fila[] = []
  for (const f of readdirSync(DIR_CHUNKS)) {
    if (!f.endsWith('.json') || f === 'index.json') continue
    const chunk = JSON.parse(readFileSync(resolve(DIR_CHUNKS, f), 'utf8')) as {
      plenoDate?: string
      items?: Array<{
        claim?: { verbatim?: string; plenoDate?: string }
        verification?: { checkedAgainst?: readonly string[] }
      }>
    }
    for (const it of chunk.items ?? []) {
      if (corpusReales(it.verification?.checkedAgainst ?? []).length > 0) continue
      const v = it.claim?.verbatim
      if (typeof v !== 'string' || !v.trim()) continue
      if (!claseDocumentalDe(v).includes(clase)) continue
      out.push({ verbatim: v.trim(), fecha: it.claim?.plenoDate ?? chunk.plenoDate ?? '' })
    }
  }
  // Orden estable y reproducible: sesión más reciente primero, y a igualdad, el
  // literal por orden alfabético — para que dos ejecuciones den la misma carta.
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.verbatim.localeCompare(b.verbatim))
}

/**
 * Marcadores de que el documento es de ESTE Ayuntamiento.
 *
 * No se usan para exigir señal municipal —eso rechaza de más: en un pleno lo
 * municipal es el caso por defecto, y «un informe técnico y jurídico donde
 * resolvemos con el anterior contrato» es obviamente de aquí sin decir la
 * palabra—. Se usan sólo para NO excluir por error algo que sí lo es. Es la
 * misma regla del place-resolver: una omisión honesta antes que un acierto
 * inventado.
 */
const MUNICIPAL =
  /\b(pleno|plenari|ayuntamiento|ajuntament|ayto|municipi|municipal|concejal|regidor|secretar[ií]a|vicesecretar|intervenci[oó]n|mesa de contrataci|junta de gobierno|alcald|este consistorio)/i

/**
 * Ámbito claramente AJENO: otra administración como sujeto, o historia general.
 *
 * Medido: excluye 2 de 172 filas en las cuatro clases —el Plan de Recuperación
 * europeo y «el plan de estabilización económica del Opus Dei» de 1959—, y cero
 * en las otras tres clases. Las dos aparecían como ejemplo en el escrito de
 * `plan-interno`, y pedirle a un ayuntamiento el plan del Opus Dei es la clase
 * de ejemplo que permite inadmitir por abusiva (art. 18.1.e) la petición entera.
 */
const AJENO =
  /\b(opus dei|falangist|aut[áa]rquic|franquis|d[ée]cada|siglo [xiv]+|gobierno de espa[ñn]a|uni[óo]n europea|directiva europea|salario m[íi]nimo|otros ayuntamientos|otras administraciones|estado espa[ñn]ol)\b/i

/** Conjunción a propósito: sólo cae lo que nombra otro ámbito Y no nombra el nuestro. */
export function deAmbitoAjeno(verbatim: string): boolean {
  return AJENO.test(verbatim) && !MUNICIPAL.test(verbatim)
}

/** ¿Nombra el literal una fecha? Un documento fechado es identificable. */
const FECHADO =
  /\b(\d{1,2} de \w+|de \d{4}|del? \d{1,2}|\d{1,2}\/\d{1,2}|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i

const norm = (t: string): string =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Los ejemplos que se enseñan, que NO son «los seis primeros».
 *
 * Dos defectos reales de la primera tanda, los dos visibles en el escrito: el
 * mismo literal salía dos veces —uno entero y otro recortado— y colaba una
 * frase retórica que sólo casaba por la palabra «pleno» («de cada hora
 * invertida en el pleno, 20 minutos son para el alcalde»). Un ejemplo frívolo
 * en un escrito registrado debilita la petición entera, y art. 18.1.e permite
 * inadmitir lo que parezca abusivo.
 *
 * Se prefiere lo IDENTIFICABLE: un literal que fecha el documento se puede
 * localizar en el archivo, que es exactamente lo que se pide. La carta dice «a
 * modo de ejemplo», así que elegir los más claros es ilustrar, no seleccionar
 * la prueba: la cifra sigue saliendo de la población entera.
 */
export function ejemplos(filas: readonly Fila[], n: number): Fila[] {
  // Dedupe por CONTENCIÓN, no por prefijo. Un prefijo no basta: «Más tarde, en
  // julio del 24, en acuerdo plenario…» y «en julio del 24, en acuerdo
  // plenario…» son el mismo ejemplo y difieren en los primeros 60 caracteres.
  // Se compara si uno contiene un tramo largo del otro, en los dos sentidos.
  const SOLAPE = 45
  const guardados: string[] = []
  const unicas: Fila[] = []
  for (const f of filas) {
    if (deAmbitoAjeno(f.verbatim)) continue
    const k = norm(f.verbatim)
    if (k.length < 10) continue
    const repetido = guardados.some(
      (g) => g.includes(k.slice(0, SOLAPE)) || k.includes(g.slice(0, SOLAPE)),
    )
    if (repetido) continue
    guardados.push(k)
    unicas.push(f)
  }
  const puntua = (f: Fila): number => (FECHADO.test(f.verbatim) ? 1 : 0)
  return [...unicas]
    .sort(
      (a, b) =>
        puntua(b) - puntua(a) ||
        b.fecha.localeCompare(a.fecha) ||
        b.verbatim.length - a.verbatim.length,
    )
    .slice(0, n)
}

function recorta(t: string): string {
  if (t.length <= CORTE) return t
  const corte = t.slice(0, CORTE)
  const ultimo = corte.lastIndexOf(' ')
  return `${corte.slice(0, ultimo > 80 ? ultimo : CORTE)}…`
}

export function redactar(clase: ClasePedible): { md: string; txt: string; n: number } {
  const filas = filasDe(clase)
  const manifiesto = JSON.parse(readFileSync(MANIFIESTO, 'utf8')) as {
    totals?: { cobertura?: { porClaseDocumental?: { porClase?: Record<string, number> } } }
  }
  const esperado = manifiesto.totals?.cobertura?.porClaseDocumental?.porClase?.[clase]
  if (typeof esperado !== 'number') {
    throw new Error(
      `[borrador] el manifiesto no cuenta «${clase}». Rederiva con \`npm run chunk-pleno-claims\`.`,
    )
  }
  if (esperado !== filas.length) {
    throw new Error(
      `[borrador] ABORTADO: cuento ${filas.length} filas de «${clase}» y el manifiesto dice ` +
        `${esperado}. La carta no se escribe con una cifra que no cuadra con la publicada — ` +
        `es un escrito registrado ante una administración.`,
    )
  }
  if (filas.length === 0) {
    throw new Error(`[borrador] «${clase}» no tiene ninguna fila: no hay nada que pedir.`)
  }

  const fechas = filas
    .map((f) => f.fecha)
    .filter(Boolean)
    .sort()
  const desde = fechas[0]
  const hasta = fechas[fechas.length - 1]
  const etiqueta = CLASE_ETIQUETA[clase]
  const ajenas = filas.filter((f) => deAmbitoAjeno(f.verbatim))
  const pedibles = filas.length - ajenas.length
  const muestra = ejemplos(filas, EJEMPLOS)
  // El cotejo de arriba compara la POBLACIÓN con el manifiesto; lo que la carta
  // cita es la cifra defendible, y dice cuántas apartó y por qué. Escribir 49
  // cuando dos de ellas hablan del Plan de Recuperación europeo y del plan de
  // estabilización del 59 sería pedirle a un ayuntamiento lo que no tiene.
  const notaAjenas =
    ajenas.length > 0
      ? [
          ``,
          `Se han descartado ${ajenas.length} intervención(es) más que nombran un documento de este tipo`,
          `pero de otra administración o de ámbito general, y que por tanto no obran en poder de ese`,
          `Ayuntamiento. No forman parte de lo solicitado.`,
        ]
      : []
  const cmd =
    `npm run solicitud -- add --clase ${clase} \\\n` +
    `  --titulo "${etiqueta} citados en sesión plenaria" \\\n` +
    `  --fecha AAAA-MM-DD --registro <nº que devuelve la sede>`

  const cuerpo = [
    `Solicito copia de ${etiqueta.toLowerCase()} citados en las sesiones plenarias`,
    `celebradas entre el ${desde} y el ${hasta}, en formato electrónico reutilizable.`,
    ``,
    `Si el volumen lo aconseja, acepto recibir la documentación por tandas y que se me`,
    `indique el índice de documentos disponibles para acotar la petición.`,
    ``,
    `MOTIVO (no obligatorio, art. 17.3)`,
    ``,
    `La solicitud no es genérica. En las intervenciones de esas sesiones hay ${pedibles}`,
    `afirmaciones —transcritas y publicadas en www.civicpulse.es/declaraciones— que remiten`,
    `expresamente a este tipo de documento y que hoy no pueden contrastarse contra ninguna`,
    `fuente publicada, porque el documento al que remiten no está disponible en el Portal de`,
    `Transparencia ni en el resto de fuentes abiertas que este proyecto consulta.`,
    ``,
    `A modo de ejemplo:`,
    ``,
    ...muestra.map((f, i) => `  ${i + 1}. Sesión de ${f.fecha}: «${recorta(f.verbatim)}»`),
    ``,
    ...notaAjenas,
    ``,
    `No se pide una valoración ni la elaboración de información nueva: son documentos que ya`,
    `existen y que se citan en sesión pública.`,
    ``,
    `AMPARO LEGAL`,
    ``,
    `  Art. 12 de la Ley 19/2013: derecho de todas las personas a acceder a la información`,
    `  pública.`,
    `  Art. 17: solicitud de acceso, sin necesidad de motivar la petición.`,
    `  Art. 20: la resolución debe notificarse en el plazo máximo de un mes.`,
    ``,
    `De no obtener respuesta en plazo, se interpondrá reclamación ante el Consell de`,
    `Transparència, Accés a la Informació Pública i Bon Govern de la Comunitat Valenciana,`,
    `conforme al art. 24 de la misma ley.`,
    ``,
    `DESTINO DE LO QUE SE RECIBA`,
    ``,
    `Se publicará como fuente citada en www.civicpulse.es, con enlace al documento original.`,
    `El propio estado de esta solicitud —presentada, contestada o sin contestar— se publica`,
    `en www.civicpulse.es/laboratorio/cobertura.`,
  ].join('\n')

  const txt = [
    `SOLICITUD DE ACCESO A LA INFORMACIÓN PÚBLICA`,
    `Ley 19/2013, de 9 de diciembre, arts. 12 y 17`,
    ``,
    `Destinatario: Ayuntamiento de Riba-roja de Túria — Registro electrónico`,
    `Asunto: ${etiqueta} citados en sesión plenaria`,
    ``,
    `SOLICITA`,
    ``,
    cuerpo,
    ``,
    `Medio de notificación preferente: electrónico, en la dirección asociada a esta`,
    `solicitud en la sede.`,
  ].join('\n')

  const md = [
    `# Solicitud de acceso · ${etiqueta.toLowerCase()} citados en sesión plenaria`,
    ``,
    `> **BORRADOR GENERADO. No se ha presentado.**`,
    `>`,
    `> Lo redacta \`npm run solicitud -- borrador --clase ${clase}\` desde los datos`,
    `> publicados; las cifras NO están escritas a mano y se cotejan con el manifiesto`,
    `> antes de escribir. Presentarlo es un acto humano: hace falta identificarse en`,
    `> la sede electrónica con certificado o Cl@ve, y el registro no se toca hasta`,
    `> que exista un número de asiento de verdad.`,
    `>`,
    `> **Dónde:** https://sede.ribarroja.es → instancia genérica / registro electrónico.`,
    `> El cuerpo listo para pegar está en \`${clase}.txt\`.`,
    `>`,
    `> **Al presentarlo:**`,
    `>`,
    `> \`\`\`bash`,
    ...cmd.split('\n').map((l) => `> ${l}`),
    `> \`\`\``,
    ``,
    `**A:** Ayuntamiento de Riba-roja de Túria — Registro electrónico`,
    `**Asunto:** Solicitud de acceso a la información pública (Ley 19/2013, arts. 12 y 17)`,
    ``,
    `---`,
    ``,
    ...cuerpo.split('\n'),
    ``,
    `---`,
    ``,
    `_Población: las ${filas.length} declaraciones publicadas sin ningún corpus detrás que nombran`,
    `${etiqueta.toLowerCase()} — la misma cifra que publica el manifiesto y que comprueba`,
    `\`npm run check:solicitudes\`. La carta pide ${pedibles}: se apartan ${ajenas.length} de ámbito ajeno,`,
    `y el escrito lo dice en vez de callarlo._`,
  ].join('\n')

  return { md, txt, n: filas.length }
}

export function generarBorradores(clases: readonly ClasePedible[]): void {
  if (!existsSync(SALIDA)) mkdirSync(SALIDA, { recursive: true })
  for (const c of clases) {
    const { md, txt, n } = redactar(c)
    writeFileSync(resolve(SALIDA, `${c}.md`), md + '\n')
    writeFileSync(resolve(SALIDA, `${c}.txt`), txt + '\n')
    process.stdout.write(
      `[borrador] ${c.padEnd(16)} ${String(n).padStart(4)} declaración(es) → editorial/solicitudes/${c}.{md,txt}\n`,
    )
  }
  process.stdout.write(
    `[borrador] ${clases.length} escrito(s). Ninguno presentado: hace falta identificarse en\n` +
      `           https://sede.ribarroja.es. Al registrarlo, anótalo con \`npm run solicitud -- add\`.\n`,
  )
}

export { CLASES_PEDIBLES }
