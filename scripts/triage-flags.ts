#!/usr/bin/env tsx
/**
 * triage:senalamientos — the decision sheet the review sweep leaves for a
 * person: every live reader-review flag, where its figures live in the data,
 * and a second reading of it that cites only figures that exist.
 *
 *   npm run triage:senalamientos
 *   npm run triage:senalamientos -- --dry-run   # locate figures, ask no model
 *
 * `check:surfaces` tells the operator «10 señalamiento(s) vivo(s) en 6
 * ruta(s)» and stops there; each one then cost a session of looking up where
 * its figures come from before anybody could say whether it was real. About
 * half were not (`revisar-superficies`: «si la citada es cierta, mira la
 * vecina»). This does the looking-up and a first reading, so the person starts
 * from a proposal instead of from a grep.
 *
 * It decides nothing. It never writes `review-dismissals.json` — silencing a
 * flag is the most dangerous operation the review offers and stays a person's
 * — and it never edits a page. It writes `editorial/senalamientos/<fecha>.md`
 * (gitignored: it quotes unreviewed model prose about pages that name people)
 * with a ready-to-paste dismissal where it proposes one.
 *
 * Same spending rule as the sweep that runs it: a free backend or nothing. On a
 * metered one every flag is DEFERRED and the sheet says so (deferred ≠ read).
 * Each flag lands in one bucket — read, deferred, ungrounded — counted apart
 * (DATA_INTEGRITY rule 2). A proposal whose reasoning cites a figure found
 * neither in the flag nor in the data is shown as UNGROUNDED, never as a
 * proposal.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

import { construirGrafoRutas, rutasRevisables } from './lib/route-graph'
import { leerDeDisco } from './lib/fichas-representativas'
import { medirFrescura } from '../src/scraper/surface-freshness'
import { validarDescartes, type RegistroDescartes } from '../src/scraper/surface-dismissals'
import type { ReaderFinding, ReviewCacheEntry } from '../src/scraper/reader-review'
import {
  anclada,
  cifrasDe,
  contextoDe,
  indexarCifras,
  localizar,
  type Localizada,
  type Texto,
} from '../src/scraper/flag-triage'
import { callLLMConProcedencia, isFreeBackend, loadConfigFromEnv } from '../src/llm/client'

const CACHE = resolve('.review-cache.json')
const DESCARTES = resolve('review-dismissals.json')
const DATA = resolve('public/data')
const OUT_DIR = resolve('editorial/senalamientos')
// The largest snapshots are claim corpora no page quotes a figure from; the
// sheet names what it did not search instead of pretending it searched all.
const MAX_BYTES = 8 * 1024 * 1024

export const TRIAGE_PROMPT_VERSION = 'triage-senalamientos-v3'

const VEREDICTOS = ['real', 'dos-cifras-ciertas', 'falso-positivo', 'indecidible'] as const
const ACCIONES = ['corregir-frase', 'publicar-puente', 'proponer-descarte', 'mirar'] as const

const TriajeSchema = z.object({
  veredicto: z.enum(VEREDICTOS),
  accion: z.enum(ACCIONES),
  porque: z.string().min(20).max(900),
  motivoDeDescarte: z.string().min(40).max(900).nullable(),
})

const SYSTEM = `Eres el segundo lector de un señalamiento de la revisión lectora de CivicPulse, un monitor cívico de Riba-roja de Túria. Un primer modelo leyó una página publicada y dijo: «un lector concluiría X, pero los datos dicen Y». Tu trabajo es decir si eso se sostiene.

Clasifica (veredicto):
- "real": la frase induce a error y los datos lo muestran.
- "dos-cifras-ciertas": las dos cifras enfrentadas son ciertas pero salen de campos o universos distintos (anual frente a acumulado, adjudicados frente a filas, una población frente a otra); lo que falta es el puente que las une.
- "falso-positivo": la frase no dice lo que el señalamiento le atribuye, o los datos la respaldan.
- "indecidible": con lo que tienes delante no se puede decir.

Acción: "corregir-frase" (real), "publicar-puente" (dos-cifras-ciertas), "proponer-descarte" (falso-positivo), "mirar" (indecidible, o cualquier duda).

Reglas:
- Cita SOLO cifras que aparezcan en el señalamiento o en las ubicaciones de datos que se te dan. Una cifra que no esté en ninguno de los dos invalida tu respuesta entera.
- Las ubicaciones dicen en qué campo de qué fichero aparece cada cifra; úsalas para decir de qué universo sale cada una. Que una cifra NO aparezca en ningún fichero NO la hace falsa: muchas cifras de las páginas son sumas, recuentos o filtros que la página calcula al vuelo. Dilo como «no se pudo situar», nunca como prueba en contra.
- Un recuento que parece no cuadrar puede estar bien si a la serie le falta un elemento (un año sin entrega, una fila sin importe). Si no ves la serie entera, eso es "indecidible", no "real". Antes de dar una frase por falsa, pregúntate qué tendría que faltar en los datos para que fuera cierta.
- El pasaje alrededor de la frase es lo que el lector tiene delante: si la propia página explica o matiza la frase en ese pasaje, el señalamiento no se sostiene.
- Ante la duda, "indecidible" y "mirar". Un descarte silencia el aviso para siempre; proponerlo sin estar seguro es peor que no proponer nada.
- motivoDeDescarte: sólo con "falso-positivo"; si no, null. Redáctalo para el registro de descartes: por qué la frase es cierta, nombrando el campo de datos que la sostiene.
- Escribe en castellano, en frases cortas.`

function cuerpo(
  route: string,
  f: ReaderFinding,
  loc: Localizada[],
  ctx: { file: string; pasaje: string } | null,
): string {
  const ubic = loc
    .map((l) =>
      l.cifra.esAnio
        ? `- ${l.cifra.raw}: un año; no se busca.`
        : l.comun
          ? `- ${l.cifra.raw}: aparece en demasiados sitios para situarla; no la uses como prueba.`
          : l.ubicaciones.length === 0
            ? `- ${l.cifra.raw}: NO aparece en ningún fichero buscado.`
            : `- ${l.cifra.raw}: ${l.ubicaciones.map((u) => `${u.file} → ${u.path}`).join(' · ')}`,
    )
    .join('\n')
  return [
    `Ruta: ${route}`,
    `Frase de la página: «${f.quote}»`,
    `Lo que concluiría un lector, según el primer modelo: ${f.inference}`,
    `Lo que dicen los datos, según el primer modelo: ${f.contradictedBy}`,
    '',
    'Dónde aparece cada cifra en public/data:',
    ubic || '- (el señalamiento no cita ninguna cifra)',
    '',
    ctx
      ? `Pasaje alrededor de la frase, tal como está en ${ctx.file}:\n${ctx.pasaje}`
      : 'La frase no se encontró ni en public/data ni en el código de las páginas: se compone al vuelo, así que no hay pasaje.',
  ].join('\n')
}

function cargarDatos(): { snapshots: Record<string, unknown>; omitidos: string[] } {
  const snapshots: Record<string, unknown> = {}
  const omitidos: string[] = []
  for (const name of readdirSync(DATA).filter((n) => n.endsWith('.json'))) {
    const p = resolve(DATA, name)
    if (statSync(p).size > MAX_BYTES) {
      omitidos.push(name)
      continue
    }
    try {
      snapshots[name] = JSON.parse(readFileSync(p, 'utf8'))
    } catch {
      omitidos.push(`${name} (no se lee)`)
    }
  }
  return { snapshots, omitidos }
}

// Where a flagged sentence can live: the published data (reportajes, fichas,
// corrections logs) first, then the pages' source for interface copy.
const SIN_TEXTO = new Set(['pleno-transcripts', 'pleno-claims', 'souls'])

function cargarTextos(): Texto[] {
  const out: Texto[] = []
  const recoger = (x: unknown, acc: string[]) => {
    if (typeof x === 'string') {
      if (x.length >= 40) acc.push(x)
    } else if (Array.isArray(x)) x.forEach((v) => recoger(v, acc))
    else if (x && typeof x === 'object') Object.values(x).forEach((v) => recoger(v, acc))
  }
  const datos = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name)
      if (e.isDirectory()) {
        if (!SIN_TEXTO.has(e.name)) datos(p)
      } else if (e.name.endsWith('.json') && statSync(p).size <= MAX_BYTES) {
        try {
          const acc: string[] = []
          recoger(JSON.parse(readFileSync(p, 'utf8')), acc)
          if (acc.length) out.push({ file: p.slice(resolve('.').length + 1), text: acc.join('\n') })
        } catch {
          // An unreadable snapshot has no passage to offer; cargarDatos names it.
        }
      }
    }
  }
  const fuente = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name)
      if (e.isDirectory()) fuente(p)
      else if (/\.(jsx|tsx)$/.test(e.name))
        out.push({ file: p.slice(resolve('.').length + 1), text: readFileSync(p, 'utf8') })
    }
  }
  datos(DATA)
  fuente(resolve('src'))
  return out
}

type Fila = {
  route: string
  flag: ReaderFinding
  loc: Localizada[]
  ctx: { file: string; pasaje: string } | null
  estado: 'leido' | 'diferido' | 'sin-anclaje'
  triaje?: z.infer<typeof TriajeSchema>
  sinAncla?: string[]
  quien?: string
}

function hoja(filas: Fila[], omitidos: string[], fecha: string, cuenta: string): string {
  const out: string[] = [
    `# Señalamientos vivos — hoja de decisiones ${fecha}`,
    '',
    `> ${cuenta}`,
    '> Generada por `npm run triage:senalamientos` tras el barrido. **No decide nada**: cada propuesta la confirma o la tira una persona. Nada de esto está publicado.',
    omitidos.length ? `> No se buscaron cifras en: ${omitidos.join(', ')}.` : '',
    '',
  ]
  for (const f of filas) {
    out.push(`## ${f.route}`, '', `> «${f.flag.quote}»`, '')
    out.push(`- **Señalamiento:** ${f.flag.inference}`)
    out.push(`- **Según el revisor, los datos dicen:** ${f.flag.contradictedBy}`)
    out.push(
      f.ctx
        ? `- **Dónde está la frase:** \`${f.ctx.file}\``
        : '- **Dónde está la frase:** en ningún fichero; se compone al vuelo',
    )
    for (const l of f.loc) {
      const donde = l.cifra.esAnio
        ? 'un año'
        : l.comun
          ? 'demasiado común para situarla'
          : l.ubicaciones.length === 0
            ? '**en ningún fichero**'
            : l.ubicaciones.map((u) => `\`${u.file} → ${u.path}\``).join(', ')
      out.push(`  - ${l.cifra.raw}: ${donde}`)
    }
    if (f.estado === 'diferido')
      out.push('', '**Sin segunda lectura** (no había backend gratuito).')
    else if (f.estado === 'sin-anclaje')
      out.push(
        '',
        `**Segunda lectura descartada:** citaba cifras que no están ni en el señalamiento ni en los datos (${f.sinAncla?.join(', ')}). Míralo a mano.`,
      )
    else if (f.triaje) {
      out.push(
        '',
        `**Segunda lectura (${f.quien}):** \`${f.triaje.veredicto}\` → \`${f.triaje.accion}\``,
      )
      out.push('', f.triaje.porque)
      if (f.triaje.accion === 'proponer-descarte' && f.triaje.motivoDeDescarte) {
        out.push(
          '',
          'Si lo confirmas, esta entrada va en `review-dismissals.json` (pon tu nombre):',
          '',
          '```json',
          JSON.stringify(
            {
              route: f.route,
              quote: f.flag.quote,
              reason: f.triaje.motivoDeDescarte,
              editor: '<tu nombre>',
              at: fecha,
            },
            null,
            2,
          ),
          '```',
        )
      }
    }
    out.push('')
  }
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const rutas = rutasRevisables(construirGrafoRutas(resolve('src')), leerDeDisco(DATA))
  const cache: Record<string, string | ReviewCacheEntry> = existsSync(CACHE)
    ? JSON.parse(readFileSync(CACHE, 'utf8'))
    : {}
  const descartes: RegistroDescartes | null = existsSync(DESCARTES)
    ? validarDescartes(JSON.parse(readFileSync(DESCARTES, 'utf8')))
    : null
  // The same live set `check:surfaces` counts, so the sheet and the digest
  // never disagree about how many there are.
  const vivos = medirFrescura(rutas, cache, new Date(), descartes).conSenalamientos

  const { snapshots, omitidos } = cargarDatos()
  const indice = indexarCifras(snapshots)
  const textos = cargarTextos()
  const config = loadConfigFromEnv()
  const gratis = isFreeBackend(config.backend)

  const filas: Fila[] = []
  for (const e of vivos) {
    for (const flag of e.findings) {
      const loc = localizar(cifrasDe(`${flag.quote} ${flag.contradictedBy}`), indice)
      const ctx = contextoDe(flag.quote, textos)
      if (dryRun || !gratis) {
        filas.push({ route: e.route, flag, loc, ctx, estado: 'diferido' })
        continue
      }
      const user = cuerpo(e.route, flag, loc, ctx)
      const { result, procedencia } = await callLLMConProcedencia({
        systemPrompt: SYSTEM,
        userPrompt: user,
        schema: TriajeSchema,
        promptVersion: TRIAGE_PROMPT_VERSION,
        input: { user },
        config,
      })
      if (!result) {
        filas.push({ route: e.route, flag, loc, ctx, estado: 'diferido' })
        continue
      }
      const a = anclada(
        `${result.porque} ${result.motivoDeDescarte ?? ''}`,
        flag,
        indice,
        ctx?.pasaje,
      )
      filas.push({
        route: e.route,
        flag,
        loc,
        ctx,
        estado: a.ok ? 'leido' : 'sin-anclaje',
        triaje: a.ok ? result : undefined,
        sinAncla: a.sinAncla,
        quien: procedencia ? `${procedencia.backend} · ${procedencia.model}` : undefined,
      })
    }
  }

  const n = (s: Fila['estado']) => filas.filter((f) => f.estado === s).length
  const porVeredicto = VEREDICTOS.map(
    (v) => `${v} ${filas.filter((f) => f.triaje?.veredicto === v).length}`,
  ).join(' · ')
  const cuenta =
    `${filas.length} señalamiento(s) vivo(s) en ${vivos.length} ruta(s) · ` +
    `leídos ${n('leido')} (${porVeredicto}) · diferidos ${n('diferido')} · ` +
    `sin anclaje ${n('sin-anclaje')}` +
    (!gratis ? ` · backend ${config.backend} no es gratuito: todo diferido` : '') +
    (dryRun ? ' · --dry-run: sin modelo' : '')

  const fecha = new Date().toISOString().slice(0, 10)
  mkdirSync(OUT_DIR, { recursive: true })
  const ruta = resolve(OUT_DIR, `${fecha}.md`)
  writeFileSync(ruta, hoja(filas, omitidos, fecha, cuenta) + '\n')
  process.stdout.write(
    `[triage:senalamientos] ${cuenta}\n[triage:senalamientos] hoja: editorial/senalamientos/${fecha}.md\n`,
  )
}

main().catch((err) => {
  process.stderr.write(`[triage:senalamientos] ${(err as Error).message}\n`)
  process.exit(2)
})
