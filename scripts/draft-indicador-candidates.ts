#!/usr/bin/env tsx
/**
 * La cola de curación de /eficiencia: qué cifra del panel merece una firma.
 *
 *   npm run draft:indicadores
 *   npm run draft:indicadores -- --json
 *
 * Lee `public/data/indicadores.json`, pasa el detector de desviaciones y deja
 * la cola en `editorial/` — que está GITIGNORADO, y eso es el punto entero:
 *
 *   «Cualquier cosa bajo public/ está publicada. Vercel sirve el directorio
 *   entero, así que un fichero ahí es alcanzable por URL lo enlace una página
 *   o no. "No renderizado" no es "no publicado".»
 *
 * Eso ya costó 24 borradores sobre concejales con nombre alcanzables desde
 * fuera durante semanas. Un borrador de este pipeline dice que el gasto de un
 * servicio municipal se sale de su banda antes de que nadie lo haya
 * comprobado, y esa frase no se sirve a nadie hasta que alguien la firme.
 *
 * No escribe nada bajo `public/`. No llama a ningún modelo. No publica: para
 * eso está `npm run promote-indicador`, que es el que quita
 * `requiresHumanApproval` y deja firma.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectarDesviaciones, UMBRALES, type Candidato } from '../src/scraper/indicador-desviacion'
import { validateEficienciaFindingsSnapshot } from '../src/scraper/eficiencia-finding'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PANEL = join(ROOT, 'public/data/indicadores.json')
const PUBLICADOS = join(ROOT, 'public/data/eficiencia-findings.json')
const COLA_JSON = join(ROOT, 'editorial/indicador-candidates.json')
const COLA_MD = join(ROOT, 'editorial/indicador-candidates.md')

const leerPublicados = (): { indicadores: Set<string>; retirados: Set<string> } => {
  try {
    const s = validateEficienciaFindingsSnapshot(readFileSync(PUBLICADOS, 'utf8'))
    return {
      indicadores: new Set(s.items.map((f) => f.indicadorId)),
      retirados: new Set((s.retractions ?? []).map((r) => r.findingId)),
    }
  } catch {
    return { indicadores: new Set(), retirados: new Set() }
  }
}

function markdown(
  candidatos: Candidato[],
  det: ReturnType<typeof detectarDesviaciones>,
  yaPublicados: Set<string>,
): string {
  const l: string[] = []
  l.push('# Cola de curación · desviaciones de /eficiencia')
  l.push('')
  l.push(`Umbrales \`${UMBRALES.version}\`. Regenerar con \`npm run draft:indicadores\`.`)
  l.push('')
  l.push(
    'Un candidato **no es un hallazgo**: dice dónde se sale una cifra y contra qué se mide, ' +
      'y no afirma ninguna causa. Publicar exige comprobar el expediente y firmar con ' +
      '`npm run promote-indicador`.',
  )
  l.push('')
  l.push('## Qué se comprobó')
  l.push('')
  l.push(`- Indicadores evaluados: **${det.evaluados}**`)
  l.push(
    `- Veces que corrió cada regla: posición ${det.reglas.posicion} · ` +
      `umbral legal ${det.reglas.umbralLegal} · movimiento ${det.reglas.movimiento}`,
  )
  l.push(
    `- No llegaron a evaluarse: ${Object.entries(det.descartes)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}`,
  )
  l.push(
    `- Reglas que corrieron y dijeron que no: ${Object.entries(det.rechazos)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}`,
  )
  l.push('')
  l.push(
    'Los dos últimos renglones dicen cosas distintas a propósito: «no llegó a comprobarse» ' +
      'no es «se comprobó y no era». Un cero en el primero significa que la regla no corrió.',
  )
  l.push('')
  if (!candidatos.length) {
    l.push('## Sin candidatos')
    l.push('')
    l.push(
      `Ninguno de los ${det.evaluados} indicadores evaluados se sale de los umbrales ` +
        `\`${UMBRALES.version}\`. Eso es un resultado, no un fallo — y las cuentas de arriba ` +
        'dicen cuántas veces se comprobó de verdad.',
    )
    return l.join('\n') + '\n'
  }
  l.push(`## ${candidatos.length} candidato(s)`)
  l.push('')
  for (const c of candidatos) {
    const ya = yaPublicados.has(c.indicadorId)
    l.push(`### ${c.borrador.titulo}`)
    l.push('')
    l.push(
      `\`${c.id}\` · fiabilidad **${c.fiabilidad}** · ${c.familia}` +
        (ya ? ' · ⚠️ YA HAY UNA FICHA VIVA DE ESTE INDICADOR' : ''),
    )
    l.push('')
    for (const d of c.desviaciones) l.push(`- **${d.motivo}** (${d.fiabilidad}) — ${d.detalle}`)
    l.push('')
    l.push(c.borrador.cuerpo)
    l.push('')
    l.push(`Celdas: ${c.fuentes.map((f) => `\`${f}\``).join(' · ')}`)
    l.push('')
    l.push(
      ya
        ? `Ya publicado: corrige con \`npm run correct-indicador\` o retira con ` +
            `\`npm run retract-indicador\`. Dos fichas vivas del mismo número las rechaza el validador.`
        : `Promocionar: \`npm run promote-indicador -- ${c.id} --curator "<nombre>"\``,
    )
    l.push('')
  }
  return l.join('\n') + '\n'
}

function main() {
  const asJson = process.argv.includes('--json')
  const panel = JSON.parse(readFileSync(PANEL, 'utf8'))
  const rec = startRun('draft-indicador-candidates', {
    mode: 'compose',
    getStats: () => NO_LLM_STATS,
  })

  const det = detectarDesviaciones({
    indicadores: panel.indicadores,
    municipales: panel.municipales,
    anioBase: panel.anioBase,
  })
  const { indicadores: yaPublicados } = leerPublicados()

  // Attempted = todo el panel. Judged = lo que llegó a evaluarse de verdad.
  // Skipped lleva SU razón: doblar «nunca se intentó» dentro de «sin cambios»
  // es lo que dejó a una pasada informar de «re-judged 1017» sin una sola
  // llamada (DATA_INTEGRITY, regla 2).
  rec.attempt(panel.indicadores.length + panel.municipales.length)
  rec.judge(det.evaluados)
  for (const [motivo, n] of Object.entries(det.descartes)) rec.skip(motivo, n)
  rec.record('candidatos', det.candidatos.length)

  mkdirSync(resolve(ROOT, 'editorial'), { recursive: true })
  writeFileSync(
    COLA_JSON,
    JSON.stringify(
      {
        _comentario:
          'Cola de curación de /eficiencia. GITIGNORADO a propósito: un borrador que dice ' +
          'que el gasto de un servicio se sale de su banda no se sirve a nadie sin firma.',
        generatedAt: new Date().toISOString(),
        umbrales: det.umbrales,
        evaluados: det.evaluados,
        reglas: det.reglas,
        descartes: det.descartes,
        rechazos: det.rechazos,
        candidatos: det.candidatos,
      },
      null,
      2,
    ) + '\n',
  )
  writeFileSync(COLA_MD, markdown(det.candidatos, det, yaPublicados))
  rec.finish()

  if (asJson) {
    process.stdout.write(JSON.stringify(det, null, 2) + '\n')
    return
  }
  process.stdout.write(
    `[draft-indicadores] ${det.evaluados} evaluados · ${det.candidatos.length} candidato(s) · ` +
      `umbrales ${UMBRALES.version}\n` +
      `[draft-indicadores] reglas: posición ${det.reglas.posicion} · legal ${det.reglas.umbralLegal} · ` +
      `movimiento ${det.reglas.movimiento}\n`,
  )
  for (const c of det.candidatos) {
    const marca = yaPublicados.has(c.indicadorId) ? ' [ya publicado]' : ''
    process.stdout.write(
      `  ${c.fiabilidad.padEnd(5)} ${c.id}${marca}\n         ${c.borrador.titulo}\n`,
    )
  }
  process.stdout.write(`[draft-indicadores] → editorial/indicador-candidates.md\n`)
}

main()
