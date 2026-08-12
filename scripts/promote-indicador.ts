#!/usr/bin/env tsx
/**
 * La puerta de /eficiencia: convertir un candidato de desviación en una ficha
 * publicada, con firma.
 *
 *   npm run draft:indicadores                       # levanta la cola
 *   npm run promote-indicador -- <candidatoId> \
 *     --curator "<nombre>" \
 *     --titulo "<titular>" \
 *     --cuerpo-file editorial/mi-texto.md           # o --cuerpo "<texto>"
 *   npm run promote-indicador -- <candidatoId> --dry-run --curator x --titulo … --cuerpo …
 *
 * ## Por qué el texto lo escribe una persona y no este script
 *
 * El borrador que genera `draft:indicadores` es determinista y sale de las
 * cifras: dice el cociente, el reparto, el modo de gestión y la n. Existe para
 * copiarse y editarse, no para publicarse tal cual, y por eso este CLI **no
 * tiene bandera para usarlo verbatim**. La regla de la casa es que nada
 * automático escribe la prosa publicada, y una ficha que dice que el gasto de
 * un servicio municipal se sale de su banda es de las que hay que haber leído
 * antes de firmarlas.
 *
 * Por la escalera de automatización medida esto es Tier C —gasto municipal bajo
 * un alcalde con nombre—, y el CLI lo vuelve a preguntar en cada pasada en vez
 * de darlo por sabido: si algún día alguien registrara una medición que lo
 * bajase de tier, esto lo diría en voz alta en vez de cambiar en silencio.
 *
 * Reescribe el fichero entero a través del validador, así que
 * `guard-curated-writes.mjs` y el historial de git siguen siendo la autoridad.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateEficienciaFindingsSnapshot,
  type EficienciaFinding,
  type EficienciaFindingsSnapshot,
} from '../src/scraper/eficiencia-finding'
import type { Candidato } from '../src/scraper/indicador-desviacion'
import { decideAutomation, loadMeasurements } from '../src/scraper/automation-policy'

const COLA = resolve('editorial/indicador-candidates.json')
const PUBLICADOS = resolve('public/data/eficiencia-findings.json')
const PROMESAS = resolve('public/data/promises.json')

const argv = process.argv.slice(2)
const VALUE_FLAGS = new Set(['--curator', '--titulo', '--cuerpo', '--cuerpo-file', '--caveat'])

const flag = (f: string): string | undefined => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}
const flagAll = (f: string): string[] => {
  const out: string[] = []
  argv.forEach((t, i) => {
    if (t === f && argv[i + 1]) out.push(argv[i + 1])
  })
  return out
}
const positionals = (): string[] => {
  const out: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i]
    if (t.startsWith('--')) {
      if (VALUE_FLAGS.has(t)) i += 1
      continue
    }
    out.push(t)
  }
  return out
}

function fail(msg: string, code = 1): never {
  process.stderr.write(`[promote-indicador] ${msg}\n`)
  process.exit(code)
}

/**
 * La congelación electoral para antes que cualquier otra consideración, igual
 * que en /promesas y en auto-curate-findings. Y si no se puede leer el estado,
 * no se publica: negarse es reversible, publicar en periodo electoral no.
 */
function comprobarCongelacion(): void {
  if (!existsSync(PROMESAS)) {
    fail('no puedo leer promises.json, así que no sé si hay congelación LOREG — no publico')
  }
  const p = JSON.parse(readFileSync(PROMESAS, 'utf8')) as { frozenUntil?: string | null }
  if (!p.frozenUntil) return
  const hasta = new Date(p.frozenUntil)
  if (!Number.isNaN(hasta.getTime()) && hasta.getTime() >= Date.now()) {
    fail(`congelación electoral LOREG activa hasta ${p.frozenUntil} — nada se publica`)
  }
}

function cargarPublicados(): EficienciaFindingsSnapshot {
  if (!existsSync(PUBLICADOS)) fail(`falta ${PUBLICADOS}; créalo con la cabecera vacía`)
  return validateEficienciaFindingsSnapshot(readFileSync(PUBLICADOS, 'utf8'))
}

function cargarCandidato(id: string): Candidato {
  if (!existsSync(COLA)) {
    fail('no hay cola: corre `npm run draft:indicadores` antes de promocionar', 2)
  }
  const cola = JSON.parse(readFileSync(COLA, 'utf8')) as { candidatos?: Candidato[] }
  const c = (cola.candidatos ?? []).find((x) => x.id === id)
  if (!c) {
    const hay = (cola.candidatos ?? []).map((x) => x.id).join('\n  ')
    fail(
      `«${id}» no está en la cola actual. Los umbrales viven en el id, así que una cola vieja ` +
        `promociona una desviación que ya no existe. Regenera con \`npm run draft:indicadores\`.\n` +
        `  En la cola ahora:\n  ${hay || '(ninguno)'}`,
    )
  }
  return c
}

function main(): void {
  const [candidatoId] = positionals()
  if (!candidatoId) {
    fail(
      'usage: promote-indicador <candidatoId> --curator "<nombre>" --titulo "<titular>" ' +
        '(--cuerpo "<texto>" | --cuerpo-file <ruta>) [--caveat "…"] [--dry-run]',
      2,
    )
  }
  const dryRun = argv.includes('--dry-run')
  const curator = flag('--curator')?.trim()
  const titulo = flag('--titulo')?.trim()
  const cuerpoFile = flag('--cuerpo-file')
  const cuerpo = (cuerpoFile ? readFileSync(resolve(cuerpoFile), 'utf8') : flag('--cuerpo'))?.trim()

  if (!curator) fail('--curator "<nombre>" es obligatorio: esta ficha lleva firma', 2)
  if (!titulo) fail('--titulo "<titular>" es obligatorio', 2)
  if (!cuerpo) {
    fail(
      '--cuerpo o --cuerpo-file es obligatorio. El borrador de la cola está para copiarlo y ' +
        'editarlo (editorial/indicador-candidates.md); no hay bandera para publicarlo verbatim, ' +
        'porque nada automático escribe la prosa publicada de este sitio.',
      2,
    )
  }

  if (!dryRun) comprobarCongelacion()
  const c = cargarCandidato(candidatoId)
  const snap = cargarPublicados()

  // Se vuelve a preguntar en cada pasada en vez de darlo por sabido. Si alguien
  // registrase una medición que bajase esta clase de tier, aquí se oiría.
  const decision = decideAutomation(
    {
      kind: 'publish-finding',
      legalSensitivity: 'high',
      measurementKey: 'eficiencia.desviacion',
      reversible: true,
    },
    loadMeasurements(),
  )
  if (decision.allow) {
    process.stdout.write(
      `[promote-indicador] AVISO: la escalera ya no considera esta clase Tier C ` +
        `(${decision.reason}). Sigue promocionando una persona: este CLI es esa persona.\n`,
    )
  }

  const vivo = snap.items.find((f) => f.indicadorId === c.indicadorId)
  if (vivo) {
    fail(
      `${c.indicadorId} ya tiene la ficha viva «${vivo.id}». Una cifra, un hallazgo: ` +
        `corrige con \`npm run correct-indicador\` o retírala con \`npm run retract-indicador\`.`,
    )
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const ficha: EficienciaFinding = {
    id: `ef-${hoy}-${c.indicadorId}`,
    candidatoId: c.id,
    indicadorId: c.indicadorId,
    familia: c.familia,
    titulo,
    cuerpo,
    motivos: c.desviaciones.map((d) => d.motivo),
    fiabilidad: c.fiabilidad,
    medicion: {
      indicadorId: c.indicadorId,
      periodo: c.periodo,
      valor: c.valor,
      unidad: c.unidad,
      ...(c.desviaciones.find((d) => d.motivo === 'umbral-legal')
        ? {
            referencia: {
              valor: c.desviaciones.find((d) => d.motivo === 'umbral-legal')!.referencia,
              etiqueta: c.desviaciones.find((d) => d.motivo === 'umbral-legal')!.etiquetaReferencia,
            },
          }
        : {}),
      ...(c.pares ? { pares: c.pares } : {}),
      fuentes: c.fuentes,
    },
    // Las salvedades del indicador viajan con la ficha: son parte de lo que el
    // lector necesita para no sacar la conclusión que la cifra no respalda.
    caveats: [...c.caveats, ...flagAll('--caveat')],
    citas: c.citas,
    curatorName: curator,
    publishedAt: hoy,
    response: null,
    corrections: [],
  }

  const siguiente = {
    ...snap,
    generatedAt: new Date().toISOString(),
    items: [...snap.items, ficha],
  }
  // Revalida el fichero ENTERO, no sólo la fila nueva: es lo que hace que el
  // validador siga siendo la autoridad y no una comprobación de trámite.
  const validado = validateEficienciaFindingsSnapshot(JSON.stringify(siguiente))

  if (dryRun) {
    process.stdout.write(
      `[promote-indicador] --dry-run: válida. Publicaría «${ficha.id}» ` +
        `(${ficha.motivos.join(', ')}, fiabilidad ${ficha.fiabilidad}).\n`,
    )
    return
  }
  writeFileSync(PUBLICADOS, JSON.stringify(validado, null, 2) + '\n')
  process.stdout.write(
    `[promote-indicador] publicada «${ficha.id}» firmada por ${curator} · ` +
      `${validado.items.length} ficha(s) vivas\n` +
      `[promote-indicador] comprueba con \`npm run check:eficiencia-findings\`\n`,
  )
}

main()
