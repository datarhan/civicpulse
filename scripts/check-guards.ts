#!/usr/bin/env tsx
/**
 * Are the guards guarding?
 *
 *   npm run check:guards            # wiring audit — free, safe, no data touched
 *   npm run check:guards -- --inject   # + fault injection: break it, watch it scream
 *   npm run check:guards -- --json
 *
 * ## Why
 *
 * On 2026-08-02 every guard in this repo was audited by hand: instead of
 * checking that they pass, what each one watches was broken ON PURPOSE to see
 * whether it fires. It found `pleno-votes-suggestions.json` sitting on `main`
 * with literal `<<<<<<< Updated upstream` markers from an unresolved
 * `git stash pop` — invalid JSON, nine hours old, and not one of ten checks had
 * noticed, because all ten validated SEMANTICS and none asked whether the bytes
 * were a document. That audit produced `check:json`.
 *
 * It has never run again, because it lived in a commit message.
 *
 * ## The three failure modes this catches and unit tests cannot
 *
 *   1. NOT WIRED — the guard is correct and nothing invokes it. `check:automation`
 *      was hooked to nothing at all; a measurement expiring downgraded a class
 *      to curator-only with no other signal.
 *   2. NO TEETH — the guard fires and the caller ignores it. `check:corpus`
 *      needed `PIPESTATUS[0]` because a pipe to `tail` was eating its exit code;
 *      the nightly's `&&`/`|| true` pair hid failures for 25 days.
 *   3. PARTIAL COVERAGE — the guard runs, watches a fraction, and reports its
 *      silence as health. `check:drift` watched 2 figures from one of two
 *      published pieces and said "2 watched · 0 divergent".
 *
 * Mode 3 is not mechanically checkable from here; each guard has to report its
 * own coverage. This script checks 1 and 2, and lists which guards report
 * coverage at all.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  auditFails,
  classifyInjection,
  classifyWiring,
  summarise,
  scriptTargets,
  sinComentarios,
  testsForScript,
  wiringFor,
  type InjectionVerdict,
} from '../src/scraper/guard-audit'

interface GuardRow {
  name: string
  wiredIn: string[]
  /** Test files that import a module this guard's script depends on. */
  testedBy: string[]
  /** null = not exercised this run. Falso si CUALQUIERA de sus inyecciones no disparó. */
  firesOnFault: boolean | null
  injection?: string
  /**
   * Una fila por inyección escrita para esta guarda.
   *
   * La tabla admite varias inyecciones con el mismo `guard` —una guarda con dos
   * responsabilidades necesita dos— y el bucle las ejecutaba todas, pero
   * escribía el resultado en el MISMO campo: la segunda pisaba a la primera y
   * su veredicto se tiraba. Una inyección que se ejecuta y cuyo resultado nadie
   * lee es el patrón que este script existe para cazar, cometido por el script.
   */
  injections?: { describe: string; fired: boolean | null; note?: string }[]
  note?: string
  verdict?: InjectionVerdict
}

/**
 * Guards that no pipeline invokes ON PURPOSE, and why.
 *
 * Without this table `check:contract-drift` was reported as an orphan and the
 * audit exited 1 — correctly, by its old rules, on a guard whose whole design
 * says it must not run unattended. A reason is mandatory: no call sites and no
 * entry here is still an orphan and still fails.
 */
const MANUAL_ONLY: Record<string, string> = {
  'check:contract-drift':
    'necesita un modelo y CI no lo tiene — en un cron nocturno informaría de una salud que nunca midió',
}

/**
 * Guards with no injection, and why there cannot be one HERE.
 *
 * The distinction this table exists for: «nobody wrote one» and «nobody can
 * write one from a nightly» are different facts, and collapsing them makes the
 * first look excusable and the second look like negligence. Anything not listed
 * here and not in INJECTIONS is reported as a genuine to-do.
 */
const NOT_INJECTABLE: Record<string, string> = {
  'check:retrieval':
    'necesita reconstruir un corpus de embeddings (backend medido) para fallar de verdad',
  'check:corpus':
    'es un orquestador: inyecta sus partes (check:transcripts, check:finding-quotes) por separado',
  'check:guards': 'es este mismo script — inyectarse a sí mismo no prueba nada',
  'check:transcription-health':
    'su fallo es el paso del TIEMPO (días sin avance), no un fichero corrupto',
  'check:runs':
    'lee .run-manifests/, que está en .gitignore — y este arnés restaura con git, así que no podría deshacer el daño',
  'check:vocabulary':
    'su fallo es que aparezca vocabulario NUEVO, y cualquier valor que inventemos aquí es exactamente eso: la inyección se probaría a sí misma',
  'check:contract-drift':
    'necesita un modelo, y su fallo es una FRASE que dejó de ser cierta: corromper un fichero no lo reproduce',
  'check:sparse':
    'su fallo vive en .git (core.sparseCheckout + info/sparse-checkout), no en un fichero rastreado — y este arnés restaura con git, así que no podría deshacer la poda. Se probó a mano en un repo de usar y tirar: `sparse-checkout set providers/claude/plugin` oculta docs/ y la guarda sale 1',
}

const ROOT = resolve('.')
const out = (s = '') => process.stdout.write(`${s}\n`)

/** Everywhere a guard could legitimately be invoked from. */
function callSites(): Map<string, string> {
  const files = new Map<string, string>()
  const add = (p: string) => {
    if (existsSync(p)) files.set(p, readFileSync(p, 'utf8'))
  }
  for (const f of readdirSync(resolve(ROOT, 'scripts'))) {
    if (f.endsWith('.sh')) add(resolve(ROOT, 'scripts', f))
  }
  const wf = resolve(ROOT, '.github/workflows')
  if (existsSync(wf)) for (const f of readdirSync(wf)) add(resolve(wf, f))
  const husky = resolve(ROOT, '.husky')
  if (existsSync(husky)) {
    for (const f of readdirSync(husky)) {
      if (!f.startsWith('_')) add(resolve(husky, f))
    }
  }
  // Un orquestador en TypeScript también es un sitio de llamada. `monitor:health`
  // corre dieciséis guardas con `runCheck()` y esta función sólo miraba `.sh`,
  // workflows y ganchos: `check:stamps` salía SIN INVOCAR mientras la nocturna
  // lo corría cada noche. Una auditoría que llama huérfana a una guarda viva
  // enseña a no creerse su rojo, que es cómo se apaga una puerta.
  //
  // Se reconocen POR EL MECANISMO, no por el nombre del fichero: quien ejecuta
  // guardas usa `runCheck(`. Y se leen sin comentarios, porque casi todo
  // `scripts/*.ts` menciona un `npm run` en su texto de ayuda y eso no ejecuta
  // nada.
  //
  // Y ESTE fichero queda fuera de su propio barrido. Nombra a las 34 guardas en
  // sus tablas de inyección, así que incluirse las declararía a todas
  // enchufadas aquí —incluida `check:contract-drift`, que es manual A PROPÓSITO
  // porque necesita un modelo—. Una auditoría que se cuenta a sí misma como el
  // sitio donde corre lo que audita da verde en todo por construcción.
  const AUDITOR = 'check-guards.ts'
  for (const f of readdirSync(resolve(ROOT, 'scripts'))) {
    if (!f.endsWith('.ts') || f === AUDITOR) continue
    const p = resolve(ROOT, 'scripts', f)
    const cuerpo = existsSync(p) ? readFileSync(p, 'utf8') : ''
    if (cuerpo.includes('runCheck(')) files.set(p, sinComentarios(cuerpo))
  }
  return files
}

const readIfExists = (p: string): string | null => {
  const abs = resolve(ROOT, p)
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null
}

/**
 * Reads every script an npm command reaches — following a shell orchestrator to
 * the tsx files it runs — then defers to the pure resolver in `guard-audit`.
 */
function testsForGuard(npmCommand: string, tests: Map<string, string>): string[] {
  const hits = new Set<string>()
  for (const target of scriptTargets(npmCommand, readIfExists)) {
    const body = readIfExists(target)
    if (!body || /\.(sh|bash)$/.test(target)) continue
    for (const h of testsForScript(body, target.replace(/\.(ts|js)$/, ''), tests)) hits.add(h)
  }
  return [...hits]
}

function testFiles(): Map<string, string> {
  const dir = resolve(ROOT, 'tests')
  const out = new Map<string, string>()
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir)) {
    if (!/\.test\.(ts|js|jsx)$/.test(f)) continue
    const p = resolve(dir, f)
    if (statSync(p).isFile()) out.set(f, readFileSync(p, 'utf8'))
  }
  return out
}

/**
 * Fault injections. Each names a real file, a way to corrupt it, and the guard
 * that must notice. Kept deliberately few: one per failure CLASS, each one a
 * shape that actually reached `main` at some point.
 */
const INJECTIONS: Array<{
  guard: string
  file: string
  describe: string
  corrupt: (s: string) => string
}> = [
  {
    // El despiece se DERIVA del código: si el extractor deja de reconocer una
    // forma, no protesta — devuelve menos nodos y dibuja menos. Romper la
    // detección de rutas de App.jsx es la forma más limpia de comprobar que el
    // suelo por carril tiene dientes, porque un mapa a medias se lee igual de
    // completo que uno entero.
    guard: 'check:despiece',
    file: 'src/App.jsx',
    describe: 'un App.jsx cuyas rutas el grafo ya no reconoce',
    corrupt: (s) => s.replace(/<Route\s+path=/g, '<Ruta path='),
  },
  // Las cuatro de la tanda de procedencia de veredictos (2026-08-27). Las
  // cuatro se inyectaron a mano al construirlas; escribirlas aquí es lo que
  // hace que se sigan probando cuando nadie se acuerde.
  {
    guard: 'check:verified-compose',
    file: 'public/data/pleno-claims-verified.json',
    describe: 'un publicado MÁS NUEVO que su base, que es imposible por construcción',
    corrupt: (s) =>
      s.replace(/"generatedAt": "[^"]+"/, '"generatedAt": "2099-01-01T00:00:00.000Z"'),
  },
  {
    guard: 'check:cobertura',
    file: 'public/data/pleno-claims/index.json',
    describe: 'una casilla del cruce que ya no sale de los trozos',
    corrupt: (s) => s.replace(/"sinCorpus": (\d+)/, (_m, n) => `"sinCorpus": ${Number(n) + 7}`),
  },
  {
    guard: 'check:veredictos',
    file: 'public/data/pleno-claims/index.json',
    describe: 'un manifiesto sin el bloque de cobertura del que vive la guarda',
    corrupt: (s) => s.replace(/"cobertura"/, '"coberturaRota"'),
  },
  {
    guard: 'check:solicitudes',
    file: 'public/data/pleno-claims/index.json',
    describe: 'el cruce por clase documental vaciado — la guarda no puede medir nada',
    corrupt: (s) => s.replace(/"porClaseDocumental"/, '"porClaseDocumentalRota"'),
  },
  {
    guard: 'check:json',
    file: 'public/data/promise-suggestions.json',
    describe: 'a literal git merge-conflict marker',
    // The exact shape that sat on main for nine hours in ffab006.
    corrupt: (s) => `<<<<<<< Updated upstream\n${s}\n=======\n>>>>>>> Stashed changes\n`,
  },
  {
    guard: 'check:citations',
    file: 'public/data/journalist-reports.json',
    describe: 'a section citing a sourceId that does not exist',
    corrupt: (s) => {
      const d = JSON.parse(s)
      const r = d.items.find((x: { sections: Array<{ payload?: { sourceIds?: string[] } }> }) =>
        x.sections.some((sec) => Array.isArray(sec.payload?.sourceIds)),
      )
      const sec = r.sections.find((x: { payload?: { sourceIds?: string[] } }) =>
        Array.isArray(x.payload?.sourceIds),
      )
      sec.payload.sourceIds.push('src-injected-nonexistent')
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:relations',
    file: 'public/data/pleno-findings.json',
    describe: 'a published finding pointing at a claim id that does not exist',
    corrupt: (s) => {
      const d = JSON.parse(s)
      const f = d.items.find((x: { sourceClaimIds?: string[] }) => Array.isArray(x.sourceClaimIds))
      if (!f) throw new Error('no finding with sourceClaimIds to corrupt')
      f.sourceClaimIds.push('c-injected-nonexistent')
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:finding-quotes',
    file: 'public/data/pleno-findings.json',
    describe: 'a verbatim quote nobody ever said',
    corrupt: (s) => {
      const d = JSON.parse(s)
      const f = d.items.find(
        (x: { quotes?: Array<{ text?: string }> }) => x.quotes && x.quotes.length > 0,
      )
      if (!f) throw new Error('no finding with quotes to corrupt')
      f.quotes[0].text =
        'Esta frase no la pronunció nadie en ningún pleno de este municipio, jamás.'
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:cadence',
    file: 'public/data/tenders.json',
    describe: 'un snapshot fechado hace dos años — la forma exacta del cron congelado',
    // The three-act freeze saga: a scraper stops, the file stays, and every
    // semantic check keeps passing over stale data.
    corrupt: (s) => {
      const d = JSON.parse(s)
      d.generatedAt = new Date(Date.parse(d.generatedAt ?? '2026-01-01') - 730 * 86_400_000)
        .toISOString()
        .replace(/\.\d+Z$/, 'Z')
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:drift',
    file: 'public/data/reportajes/reconstruccion-dana.json',
    describe: 'una cifra congelada multiplicada por diez',
    // The 2026-08-02 incident in reverse: prose left behind by a data fix.
    corrupt: (s) => {
      const d = JSON.parse(s)
      if (typeof d?.totals?.totalAwarded !== 'number') throw new Error('sin totals.totalAwarded')
      d.totals.totalAwarded = d.totals.totalAwarded * 10
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:finding-entities',
    file: 'public/data/pleno-findings.json',
    describe: 'un hallazgo que afirma como registro una empresa que no consta en ningún dato',
    // The motivating shape, verbatim: «según el registro municipal … la empresa
    // FCC», where FCC appeared in zero of 1,231 contract rows. The trigger is
    // the ASSERTION phrase (empresa/mercantil/adjudicataria), not any mention of
    // a company — a first attempt at this injection said «adjudicado a X» and
    // the guard stayed silent, correctly: that is not the defect it watches.
    corrupt: (s) => {
      const d = JSON.parse(s)
      const f = d.items?.[0]
      if (!f) throw new Error('sin hallazgos que corromper')
      f.summary =
        `${f.summary ?? ''} Según el registro municipal, la empresa Inventadadelturia ` +
        `ejecutó las obras.`
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:transcripts',
    file: 'public/data/pleno-transcripts/yhp4sc.txt',
    describe: 'un transcript que se convierte en un bucle — la firma de Whisper alucinando',
    // The real shape: whisper-1 fed a multi-hour file loops one phrase for
    // thousands of lines. That published 7% of a pleno as if it were the whole
    // session (postmortem 9dd8f07).
    corrupt: () =>
      `${'Muchas gracias, señor alcalde.\n'.repeat(4000)}Y con esto levantamos la sesión.\n`,
  },
  {
    guard: 'check:automation',
    file: '.automation-measurements.json',
    describe: 'una medición de precisión caducada — el permiso para publicar solo, vencido',
    // Tier B is autonomous only while a RECORDED precision is current. Letting
    // a measurement expire unnoticed is how an unmeasured class keeps
    // publishing on the strength of a number nobody re-took.
    corrupt: (s) => {
      const d = JSON.parse(s)
      const rows = Array.isArray(d) ? d : (d.measurements ?? [])
      if (!rows.length) throw new Error('sin mediciones que caducar')
      const old = new Date(Date.now() - 400 * 86_400_000).toISOString()
      for (const m of rows) m.measuredAt = old
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:indicadores',
    file: 'public/data/indicadores.json',
    describe: 'un coste unitario que ya no sale de la celda que dice citar',
    // Toda cifra de /eficiencia lleva su celda (`cesel:2024:CE2:a1621:Econ14`)
    // y el gate la resuelve contra el volcado. Multiplicar el numerador por
    // diez sin tocar la celda es exactamente lo que pasaría si alguien editara
    // el snapshot a mano: el número publicado deja de tener detrás lo que dice
    // tener, y ninguna otra comprobación lo notaría.
    corrupt: (s) => {
      const d = JSON.parse(s)
      const i = d.indicadores?.find(
        (x: { valor: number | null; numerador?: { valor?: number } }) =>
          x.valor !== null && typeof x.numerador?.valor === 'number',
      )
      if (!i) throw new Error('sin indicador con cociente que corromper')
      i.numerador.valor *= 10
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:eficiencia-findings',
    file: 'public/data/eficiencia-findings.json',
    describe: 'una ficha firmada que afirma una cifra que su fuente ya no dice',
    // La avería propia de esta familia: el ministerio revisa una entrega y la
    // ficha se queda afirmando la de antes, sin que nadie toque la página. Se
    // inyecta una ficha entera porque el fichero puede estar vacío —cero fichas
    // es el estado normal antes de la primera firma— y un gate que sólo se
    // puede probar cuando ya hay algo publicado no está probado.
    corrupt: (s) => {
      const d = JSON.parse(s)
      const panel = JSON.parse(readFileSync(resolve(ROOT, 'public/data/indicadores.json'), 'utf8'))
      const m = panel.municipales?.find((x: { valor: number | null }) => x.valor !== null)
      if (!m) throw new Error('sin indicador municipal con valor')
      d.items = [
        {
          id: 'ef-inyectada',
          candidatoId: `cand-${m.id}-inyectada`,
          indicadorId: m.id,
          familia: 'municipal',
          titulo: 'Ficha inyectada por check:guards para comprobar que el gate tiene dientes',
          cuerpo:
            'Esta ficha existe sólo durante la inyección de fallos y afirma deliberadamente una ' +
            'cifra que el panel vivo no sostiene. Si el gate no se queja de ella, no está ' +
            'comprobando que lo publicado siga coincidiendo con su fuente.',
          motivos: ['umbral-legal'],
          fiabilidad: 'alta',
          medicion: {
            indicadorId: m.id,
            periodo: m.periodo,
            // La misma cifra, movida: mismo periodo, otro valor → `contradice`.
            valor: (m.formato === 'porcentaje' ? m.valor * 100 : m.valor) * 3 + 1,
            unidad: 'días',
            fuentes: [m.numerador.fuente, m.denominador.fuente],
          },
          caveats: [],
          citas: [{ url: 'https://www.hacienda.gob.es/', etiqueta: 'Ministerio de Hacienda' }],
          curatorName: 'check-guards',
          publishedAt: new Date().toISOString().slice(0, 10),
          response: null,
          corrections: [],
        },
      ]
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:dea',
    file: 'public/data/dea.json',
    describe: 'una puntuación de frontera que ya no se reproduce desde su fuente',
    // La avería propia de esta superficie: la cifra sale de un remuestreo de
    // dos mil réplicas, así que no hay documento con el que cotejarla. Lo único
    // que la sostiene es que se puede volver a calcular con la semilla
    // publicada. Se mueve θ un poco —no un orden de magnitud— porque el fallo
    // real es una revisión del ministerio que desplaza la cifra sin que nadie
    // toque la página, y un gate que sólo caza catástrofes no caza nada.
    corrupt: (s) => {
      const d = JSON.parse(s)
      const e = d.especificaciones?.find((x: { propia: unknown }) => x.propia)
      if (!e) throw new Error('sin especificación publicada que corromper')
      e.propia.theta = e.propia.theta * 0.97
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:dea',
    file: 'public/data/dea.json',
    describe: 'un municipio ajeno nombrado en el experimento de frontera',
    // La otra mitad del gate, y la que de verdad importa: la regla editorial de
    // esta página es que no se nombra a nadie salvo a Riba-roja. Se rompe sin
    // querer con un campo de diagnóstico —los `id` del conjunto de referencia
    // son códigos INE— y el efecto es publicar el veredicto de un modelo
    // nuestro sobre veinte ayuntamientos sin derecho de réplica. Se inyecta un
    // INE real de la banda, no uno inventado, para que el gate tenga que
    // buscarlo contra la fuente y no contra una lista suya.
    corrupt: (s) => {
      const d = JSON.parse(s)
      const fuente = JSON.parse(
        readFileSync(resolve(ROOT, 'public/data/coste-efectivo.json'), 'utf8'),
      )
      const ajeno = (fuente.pares.filas as { ine: string }[]).find((f) => f.ine !== '46214')
      if (!ajeno) throw new Error('sin municipio par con el que probar')
      const e = d.especificaciones?.find((x: { propia: unknown }) => x.propia)
      if (!e) throw new Error('sin especificación publicada que corromper')
      e.propia.referenciasDetalle = [{ ine: ajeno.ine, lambda: 0.5 }]
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:summary-gate',
    file: 'public/data/pleno-findings.json',
    describe: 'un sumario que reimprime, palabra por palabra, una cita que la puerta retiene',
    // La avería exacta que produjo este gate: `claim-public-gate.ts` promete
    // que una cita `hidden` «nunca entra en un fichero desplegado», y
    // pleno-findings.json ES un fichero desplegado. La puerta se aplicaba a la
    // LISTA DE CITAS y nadie miraba el sumario de al lado, así que la misma
    // acusación se publicaba sobre el mismo grupo con las mismas palabras,
    // perdiendo sólo las comillas. Se midieron 9 fugas en 7 hallazgos.
    //
    // La cita retenida se busca en la instantánea de procedencia, que es donde
    // vive el veredicto de la puerta — recomputarlo aquí sería un segundo
    // clasificador, y dos clasificadores es como una página y su cola de
    // revisión empiezan a discrepar sobre qué está oculto.
    corrupt: (s) => {
      const d = JSON.parse(s)
      const prov = JSON.parse(
        readFileSync(resolve(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
      ) as { quotes: Record<string, Array<{ gate?: string }>> }
      for (const [findingId, veredictos] of Object.entries(prov.quotes ?? {})) {
        const idx = veredictos.findIndex((q) => q.gate === 'hidden')
        if (idx < 0) continue
        const f = d.items?.find((x: { id: string }) => x.id === findingId)
        const texto = f?.quotes?.[idx]?.text
        if (!f || !texto) continue
        f.summary = `${f.summary} El grupo afirmó: «${texto}»`
        return JSON.stringify(d, null, 2) + '\n'
      }
      throw new Error('sin cita retenida que filtrar — ¿cambió el formato de la procedencia?')
    },
  },
  {
    guard: 'check:queues',
    file: 'public/data/pleno-findings.json',
    describe: 'una cola de curación que sigue hablando de un hallazgo que ya no está publicado',
    // El incidente del 2026-08-11: se retiraron once hallazgos y un tercio de
    // un backlog aparente de 175 filas pasó a ser filas sobre hallazgos que ya
    // no existían. Nada publicado estaba mal; la cola mentía sobre su propio
    // tamaño, que es como una cola deja de trabajarse.
    //
    // Se inyecta por el CORPUS y no por la cola: los worklists viven en
    // editorial/, que está gitignorado, y este arnés restaura con git — así que
    // no podría deshacer el daño. Quitar el hallazgo al que apuntan produce
    // exactamente la misma huérfana.
    corrupt: (s) => {
      const d = JSON.parse(s)
      const colaPath = resolve(ROOT, 'editorial/finding-support-queue.json')
      if (!existsSync(colaPath)) {
        // No es un defecto: editorial/ está gitignorado, así que en CI o en un
        // clon nuevo no hay colas y `check:queues` informa «sin fichero — nada
        // que revisar». Decirlo con estas palabras evita que alguien lo
        // depure como si fuera una avería.
        throw new Error(
          'no hay editorial/finding-support-queue.json (gitignorado; en CI nunca existe) — ' +
            'genera una cola con `npm run triage:finding-support` para ejercitar esta inyección',
        )
      }
      const cola = JSON.parse(readFileSync(colaPath, 'utf8')) as {
        rows?: Array<{ id?: string }>
        items?: Array<{ id?: string }>
      }
      const filas = cola.rows ?? cola.items ?? []
      const citado = filas
        .map((r) => r.id)
        .find((id) => d.items.some((f: { id: string }) => f.id === id))
      if (!citado) throw new Error('la cola no nombra ningún hallazgo vivo que quitar')
      d.items = d.items.filter((f: { id: string }) => f.id !== citado)
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:data-graph',
    file: 'src/scraper/data-graph.ts',
    describe: 'una arista declarada que el script no lee — el grafo describiendo otro código',
    // El grafo es una declaración de dependencias escrita a mano, y una
    // declaración a mano de algo que el código ya sabe es una forma reescrita:
    // se desfasa quedándose verde, que es la regla 1 de DATA_INTEGRITY y lo que
    // costó 53,5 M€ de una página publicada. Este gate es lo único que hace
    // creíble el grafo, así que tiene que gritar cuando el grafo miente.
    corrupt: (s) => {
      const marca = '    reads: ['
      const i = s.indexOf(marca)
      if (i < 0) throw new Error('no encuentro un bloque `reads:` que corromper')
      return (
        s.slice(0, i + marca.length) +
        "\n      'inventado-por-check-guards.json'," +
        s.slice(i + marca.length)
      )
    },
  },
  {
    guard: 'check:competencias',
    file: 'public/data/officials.json',
    describe: 'un concejal que desaparece del raspado con su competencia aún publicada',
    // La corrupción va en el fichero RASPADO, no en el curado, porque el daño
    // viaja en esa dirección: `competencias.json` se firma a mano y se queda
    // quieto; `officials.json` se rehace solo cada noche. Quitar a quien una
    // ficha publicada nombra es lo que pasaría si se reorganizaran las carteras
    // sin que aquí se enterara nadie — y el sitio seguiría pintando ese nombre
    // junto a una cifra. Por eso se prueba el desenlace que sale 1, no el aviso.
    corrupt: (s) => {
      const d = JSON.parse(s)
      const comp = JSON.parse(readFileSync(resolve(ROOT, 'public/data/competencias.json'), 'utf8'))
      const slug = comp.asignaciones?.[0]?.oficial
      if (!slug) throw new Error('competencias.json no trae ninguna asignación que romper')
      const antes = d.officials.length
      d.officials = d.officials.filter((o: { slug: string }) => o.slug !== slug)
      if (d.officials.length === antes) {
        throw new Error(`el slug ${slug} no estaba en officials.json`)
      }
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:officials-corrections',
    file: 'public/data/officials.json',
    describe:
      'un alta curada que desaparece del padrón publicado (una nocturna sin la capa, o una edición a mano)',
    // Corrompe el PUBLICADO, que es lo que una nocturna sin la capa haría: el
    // raspado vuelve a poner a la cesada y borra a quien tomó posesión, y el
    // fichero curado sigue intacto y firmado. Se prueba el eje que bloquea
    // (`no-aplicada`), no la vigencia, que contra una página en 403 dice
    // NO COMPROBADO y sale 0 a propósito.
    corrupt: (s) => {
      const d = JSON.parse(s)
      const corr = JSON.parse(
        readFileSync(resolve(ROOT, 'public/data/officials-corrections.json'), 'utf8'),
      )
      const slug = corr.altas?.[0]?.slug
      if (!slug) throw new Error('officials-corrections.json no trae ningún alta que borrar')
      const antes = d.officials.length
      d.officials = d.officials.filter((o: { slug: string }) => o.slug !== slug)
      if (d.officials.length === antes)
        throw new Error(`el alta ${slug} no estaba en officials.json`)
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
]

function gitIsClean(file: string): boolean {
  const r = spawnSync('git', ['diff', '--quiet', '--', file], { cwd: ROOT })
  return r.status === 0
}

function gitRestore(file: string): void {
  execFileSync('git', ['checkout', '--', file], { cwd: ROOT })
}

/** Run a guard and report only whether it exited non-zero. */
function guardFails(script: string): boolean {
  const r = spawnSync('npm', ['run', '--silent', script.replace(/^npm run /, '')], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return r.status !== 0
}

function main(): void {
  const argv = process.argv.slice(2)
  const inject = argv.includes('--inject')
  const asJson = argv.includes('--json')

  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
  const guards = Object.keys(pkg.scripts).filter((k) => k.startsWith('check:'))
  const sites = callSites()

  const tests = testFiles()
  const rows: GuardRow[] = guards.map((g) => {
    const wiredIn = wiringFor(g, sites).map((p) => p.replace(`${ROOT}/`, ''))
    const testedBy = testsForGuard(pkg.scripts[g] as string, tests)
    return { name: g, wiredIn, testedBy, firesOnFault: null }
  })

  if (inject) {
    for (const inj of INJECTIONS) {
      const row = rows.find((r) => r.name === inj.guard)
      if (!row) continue
      row.injections = row.injections ?? []
      const registro: { describe: string; fired: boolean | null; note?: string } = {
        describe: inj.describe,
        fired: null,
      }
      row.injections.push(registro)
      const path = resolve(ROOT, inj.file)
      if (!existsSync(path)) {
        registro.note = `${inj.file} missing — not exercised`
        continue
      }
      if (!gitIsClean(inj.file)) {
        registro.note = `${inj.file} has uncommitted changes — refusing to inject`
        continue
      }
      const original = readFileSync(path, 'utf8')
      try {
        writeFileSync(path, inj.corrupt(original), 'utf8')
        registro.fired = guardFails(inj.guard)
      } catch (e) {
        registro.note = `injection failed: ${(e as Error).message}`
      } finally {
        // Restore from git, then PROVE it was restored. A fault-injection
        // harness that leaves the fault behind is worse than no harness.
        gitRestore(inj.file)
        if (!gitIsClean(inj.file)) {
          process.stderr.write(
            `\n[check:guards] FATAL: could not restore ${inj.file}. Fix before committing.\n`,
          )
          process.exit(2)
        }
      }
    }
  }

  // `hasInjection` is a static fact about the INJECTIONS table, NOT about
  // whether this run exercised it. Deriving it from `r.injection` — which is
  // only populated under --inject — made every guard report "no injection" on
  // a plain wiring run, so four written injections read as four missing ones.
  const defined = new Set(INJECTIONS.map((i) => i.guard))
  for (const r of rows) {
    // Una guarda con dos responsabilidades sólo está probada si las dos
    // inyecciones disparan. Quedarse con la última daría por probada una
    // guarda que caza la mitad de lo que promete.
    if (r.injections?.length) {
      r.injection = r.injections.map((i) => i.describe).join(' · ')
      r.note = r.injections.find((i) => i.note)?.note
      r.firesOnFault = r.injections.some((i) => i.fired === null)
        ? null
        : r.injections.every((i) => i.fired === true)
    }
    r.verdict = classifyInjection({
      hasInjection: defined.has(r.name),
      fired: r.firesOnFault,
      note: r.note ?? (inject ? undefined : 'definida; ejecuta con --inject para probarla'),
      notInjectableReason: NOT_INJECTABLE[r.name],
    })
  }
  const stats = summarise(
    rows.map((r) => ({ ...r, verdict: r.verdict!, manualReason: MANUAL_ONLY[r.name] })),
  )

  if (asJson) {
    out(JSON.stringify({ guards: rows, injected: inject, stats }, null, 2))
    return
  }

  const orphans = rows.filter((r) => classifyWiring(r.wiredIn, MANUAL_ONLY[r.name]) === 'orphan')
  const untested = rows.filter((r) => r.testedBy.length === 0)
  const w = Math.max(...rows.map((r) => r.name.length))
  out('[check:guards] wiring — where is each guard actually invoked?\n')
  for (const r of rows) {
    const state = classifyWiring(r.wiredIn, MANUAL_ONLY[r.name])
    const where =
      state === 'wired'
        ? r.wiredIn.join(', ')
        : state === 'manual'
          ? `manual, a propósito — ${MANUAL_ONLY[r.name]}`
          : '⚠ NO SE INVOCA EN NINGÚN SITIO'
    out(`  ${r.name.padEnd(w)}  ${where}`)
  }

  out('\n[check:guards] tests — does anything exercise its logic?\n')
  for (const r of rows) {
    out(`  ${r.name.padEnd(w)}  ${r.testedBy.length ? r.testedBy.join(', ') : '⚠ NO TEST'}`)
  }

  // Injection coverage is reported in THREE states, always — not only under
  // --inject. Before, a guard with no injection and a guard nobody can inject
  // from a nightly printed the same undifferentiated line, which reads as
  // negligence in one case and as coverage in neither.
  out('\n[check:guards] dientes — ¿salta cuando su propio fallo está presente?\n')
  for (const r of rows) {
    const v = r.verdict!
    const label =
      v.state === 'proven'
        ? 'FIRES'
        : v.state === 'silent'
          ? '⚠ SILENT'
          : v.state === 'not-run'
            ? `— ${v.detail}`
            : v.state === 'not-injectable'
              ? 'sin inyección, a propósito'
              : '⚠ sin inyección'
    out(`  ${r.name.padEnd(w)}  ${label}`)
    for (const i of r.injections ?? []) {
      const marca = i.fired === true ? '✓' : i.fired === false ? '✗' : '—'
      out(`  ${' '.repeat(w)}  ${marca} inyectado: ${i.describe}${i.note ? ` (${i.note})` : ''}`)
    }
    if (!r.injections?.length && r.injection) out(`  ${' '.repeat(w)}  inyectado: ${r.injection}`)
    else if (v.state === 'not-injectable') out(`  ${' '.repeat(w)}  ${v.detail}`)
  }
  if (!inject) {
    out('\n  (auditoría de cableado — con --inject además rompe cosas y mira si gritan)')
  }

  const silent = rows.filter((r) => r.verdict!.state === 'silent')
  out()
  out(
    `${stats.total} guarda(s) · ${stats.notInvoked} sin invocar · ${stats.manual} manual(es) ` +
      `con motivo · ${stats.untested} sin test · ` +
      `${inject ? `${stats.proven} probada(s)` : 'dientes sin probar'} · ` +
      `${stats.undefinedInjection} sin inyección · ${stats.notInjectable} no inyectable(s) con motivo`,
  )

  if (untested.length) {
    out(`SIN TEST (se informa, no falla): ${untested.map((r) => r.name).join(', ')}`)
  }
  const toWrite = rows.filter((r) => r.verdict!.state === 'undefined').map((r) => r.name)
  if (toWrite.length) {
    out(
      `SIN INYECCIÓN, PENDIENTE DE ESCRIBIR: ${toWrite.join(', ')}\n` +
        '  Añádela a INJECTIONS, o a NOT_INJECTABLE con el motivo — pero no la des por buena.',
    )
  }
  if (auditFails(stats)) {
    if (orphans.length) out(`\nSIN INVOCAR: ${orphans.map((r) => r.name).join(', ')}`)
    if (silent.length) out(`MUDA ANTE SU PROPIO FALLO: ${silent.map((r) => r.name).join(', ')}`)
    process.exit(1)
  }
}

main()
