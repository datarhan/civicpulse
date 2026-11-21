#!/usr/bin/env tsx
/**
 * Mide el mapa de hablantes de texto contra el de Gemini y contra lo firmado.
 *
 *   npx tsx scripts/medir-mapa-texto.ts --gemini DIR --texto DIR [--json OUT]
 *        [--muestra-solo-texto N --muestra OUT.tsv]
 *
 * Lee los dos directorios de mapas (`<plenoId>.json`) SIN tocarlos. Sólo cuenta
 * las sesiones que están en LOS DOS: una sesión sin mapa de texto sumada como
 * «ninguno» rebajaría la cobertura del texto por algo que nunca se le pidió.
 *
 * ## La decisión, y lo que NO decide
 *
 * Unidad: la etiqueta publicada (ver `speaker-map-compare.ts`). Criterio:
 *
 *   1. contradicción con Gemini, sobre las etiquetas a las que ambos dan bloque:
 *      cota SUPERIOR de Wilson al 95 % ≤ `--max-contradiccion` (5 %);
 *   2. cobertura: etiquetas con bloque del texto ≥ `--min-cobertura` (80 %) de las
 *      de Gemini, sobre las etiquetas que los dos evaluaron;
 *   3. oro firmado: ningún tramo contradicho, y abstención en menos de la mitad.
 *
 * Sale con 1 si falla cualquiera. Pero que pase NO basta para cambiar el nocturno:
 * Gemini no es la verdad (contradice 2 de las 8 firmas), las 8 firmas son
 * correcciones elegidas por estar mal y no una muestra, y las etiquetas a las que
 * sólo el texto da bloque no se pueden juzgar contra nadie. La puerta real es una
 * muestra escuchada de ≥75 turnos — ver `editorial/mapa-hablantes-texto/`.
 * `--muestra-solo-texto` saca esas etiquetas para escucharlas.
 *
 * Los 16 mapas de Gemini son las sesiones más recientes, no una muestra al azar:
 * el informe va por sesión y no se extrapola a las que no tienen mapa.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SpeakerMap } from '../src/scraper/speaker-map'
import {
  compararCitas,
  compararConOro,
  compararMapas,
  cubosVacios,
  fraccion,
  tramosDeRelabels,
  wilson,
  type Cubos,
  type ResultadoOro,
} from '../src/scraper/speaker-map-compare'
import { parseDiarizedTranscript } from '../src/scraper/voice-id'

function arg(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}

const dirA = arg('--gemini')
const dirB = arg('--texto')
const jsonOut = arg('--json')
const nMuestra = Number(arg('--muestra-solo-texto') ?? 0)
const muestraOut = arg('--muestra')
const MAX_CONTRADICCION = Number(arg('--max-contradiccion') ?? 0.05)
const MIN_COBERTURA = Number(arg('--min-cobertura') ?? 0.8)
if (!dirA || !dirB || (nMuestra > 0 && !muestraOut)) {
  process.stderr.write(
    'uso: medir-mapa-texto.ts --gemini DIR --texto DIR [--json OUT] [--muestra-solo-texto N --muestra OUT.tsv]\n',
  )
  process.exit(2)
}

const ids = (dir: string) =>
  readdirSync(resolve(dir))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
const enA = new Set(ids(dirA))
const enB = new Set(ids(dirB))
const comunes = [...enA].filter((id) => enB.has(id)).sort()
const excluidas = {
  soloGemini: [...enA].filter((id) => !enB.has(id)).sort(),
  soloTexto: [...enB].filter((id) => !enA.has(id)).sort(),
}
if (comunes.length === 0) {
  process.stderr.write('ninguna sesión tiene los dos mapas: no hay nada que medir\n')
  process.exit(2)
}
const leer = (dir: string, id: string) =>
  JSON.parse(readFileSync(resolve(dir, `${id}.json`), 'utf8')) as SpeakerMap

const tramos = tramosDeRelabels(
  JSON.parse(readFileSync(resolve('public/data/pleno-claim-relabels.json'), 'utf8')),
).filter((t) => comunes.includes(t.plenoId))

const suma = (t: Cubos, c: Cubos) => {
  for (const k of Object.keys(t) as Array<keyof Cubos>) t[k] += c[k]
}
const totLinea = cubosVacios()
const totCitas = cubosVacios()
const contraCitas: Array<{ plenoId: string; id: string; a: string; b: string; verbatim: string }> =
  []
const totEtiqueta = cubosVacios()
const oro: Record<'gemini' | 'texto', ResultadoOro['tramos']> = { gemini: [], texto: [] }
const informe: Record<string, unknown> = {}
const soloTexto: Array<{ plenoId: string; label: string; bloc: string; start: number }> = []

const w = (x: number | string, n: number) => String(x).padStart(n)
process.stdout.write(
  `POR ETIQUETA PUBLICADA (la unidad de la decisión)\n` +
    `pleno     etiq  coinc CONTRA sóloG sóloT ningu mixto noEv | filasG filasT | ventT  llamT  sT\n`,
)
for (const id of comunes) {
  const a = leer(dirA, id)
  const b = leer(dirB, id)
  const published = parseDiarizedTranscript(
    readFileSync(resolve('public/data/pleno-transcripts', `${id}.txt`), 'utf8'),
  )
  const c = compararMapas(published, a, b)
  suma(totLinea, c.porLinea)
  suma(totEtiqueta, c.porEtiqueta)
  for (const s of c.soloB) soloTexto.push({ plenoId: id, ...s })
  const pc = resolve('public/data/pleno-claims', `${id}.json`)
  const citas = existsSync(pc)
    ? (
        JSON.parse(readFileSync(pc, 'utf8')).items as Array<{
          claim: { id: string; verbatim: string }
        }>
      ).map((x) => x.claim)
    : []
  const cc = compararCitas(published, a, b, citas)
  suma(totCitas, cc.cubos)
  for (const x of cc.contradicciones) contraCitas.push({ plenoId: id, ...x })
  const mios = tramos.filter((t) => t.plenoId === id)
  const oroA = compararConOro(published, a, mios)
  const oroB = compararConOro(published, b, mios)
  oro.gemini.push(...oroA.tramos)
  oro.texto.push(...oroB.tramos)
  const e = c.porEtiqueta
  const st = b.stats as SpeakerMap['stats'] & { segundosDeModelo?: number }
  process.stdout.write(
    `${id.padEnd(9)} ${w(e.total, 4)} ${w(e.coinciden, 6)} ${w(e.contradicen, 6)} ${w(e.soloA, 5)} ${w(e.soloB, 5)} ` +
      `${w(e.ninguno, 5)} ${w(e.mixto, 5)} ${w(e.noEvaluado, 4)} | ` +
      `${w(a.rows.filter((r) => !r.weak).length, 6)} ${w(b.rows.filter((r) => !r.weak).length, 6)} | ` +
      `${w(`${b.stats.chunksTranscribed}/${b.stats.chunksExpected}`, 5)} ${w(b.stats.apiCalls ?? '—', 5)} ${w(Math.round(st.segundosDeModelo ?? 0), 4)}\n`,
  )
  informe[id] = {
    porLinea: c.porLinea,
    porEtiqueta: c.porEtiqueta,
    contradicciones: c.contradicciones,
    soloTexto: c.soloB,
    oro: { gemini: oroA, texto: oroB },
    texto: {
      stats: b.stats,
      rows: b.rows.map((r) => ({ label: r.label, bloc: r.bloc, weak: r.weak, ev: r.evidence[0] })),
    },
  }
}

const e = totEtiqueta
const l = totLinea
const ambos = e.coinciden + e.contradicen
const wc = wilson(e.contradicen, ambos)
const evaluadas = e.total - e.noEvaluado - e.sinCitables
const cobG = e.coinciden + e.contradicen + e.soloA
const cobT = e.coinciden + e.contradicen + e.soloB
const pct = (x: number) => `${(100 * x).toFixed(1).replace('.', ',')} %`
process.stdout.write(
  `\nTOTAL POR ETIQUETA (${comunes.length} sesiones; denominador ${e.total}, ${e.noEvaluado} no evaluadas por uno de los dos, ${e.sinCitables} sin ninguna línea citable)\n` +
    `  coinciden          ${fraccion(e.coinciden, evaluadas)}\n` +
    `  CONTRADICEN        ${fraccion(e.contradicen, evaluadas)} · sobre las que ambos dan bloque ${fraccion(e.contradicen, ambos)}, Wilson 95 % [${pct(wc.inferior)}, ${pct(wc.superior)}]\n` +
    `  sólo Gemini        ${fraccion(e.soloA, evaluadas)}\n` +
    `  sólo texto         ${fraccion(e.soloB, evaluadas)}  ← no juzgable contra Gemini: escuchar\n` +
    `  ninguno            ${fraccion(e.ninguno, evaluadas)}\n` +
    `  mixto              ${fraccion(e.mixto, evaluadas)}  ← un mapa da dos bloques a la misma etiqueta\n` +
    `  cobertura Gemini   ${fraccion(cobG, evaluadas)}\n` +
    `  cobertura texto    ${fraccion(cobT, evaluadas)}\n` +
    `\nPOR LÍNEA (sólo descriptivo; las líneas de una etiqueta no son independientes)\n` +
    `  coinciden ${fraccion(l.coinciden, l.total)} · CONTRADICEN ${fraccion(l.contradicen, l.total)} · ` +
    `sólo G ${fraccion(l.soloA, l.total)} · sólo T ${fraccion(l.soloB, l.total)} · ninguno ${fraccion(l.ninguno, l.total)} · ` +
    `no evaluadas ${fraccion(l.noEvaluado, l.total)}\n` +
    `\nPOR CITA EXTRAÍDA (public/data/pleno-claims, vía blocResolverFor: lo que se publicaría; denominador ${totCitas.total})\n` +
    `  coinciden ${fraccion(totCitas.coinciden, totCitas.total)} · CONTRADICEN ${fraccion(totCitas.contradicen, totCitas.total)} ` +
    `(sobre las que ambos dan bloque ${fraccion(totCitas.contradicen, totCitas.coinciden + totCitas.contradicen)}) · ` +
    `sólo G ${fraccion(totCitas.soloA, totCitas.total)} · sólo T ${fraccion(totCitas.soloB, totCitas.total)} · ` +
    `ninguno ${fraccion(totCitas.ninguno, totCitas.total)}\n` +
    contraCitas
      .map((x) => `    ${x.id} Gemini ${x.a} · texto ${x.b} «${x.verbatim.slice(0, 90)}»\n`)
      .join('') +
    `\nORO FIRMADO (${tramos.length} tramos escuchados en estas sesiones; NO es una muestra: son correcciones)\n`,
)
const resumenOro = (k: 'gemini' | 'texto') => {
  const ts = oro[k]
  const n = (v: string) => ts.filter((t) => t.veredicto === v).length
  return {
    acierta: n('acierta'),
    contradice: n('contradice'),
    seAbstiene: n('se-abstiene'),
    sinLineas: n('sin-lineas'),
    noEvaluado: n('no-evaluado'),
    total: ts.length,
  }
}
for (const k of ['gemini', 'texto'] as const) {
  const r = resumenOro(k)
  const juzgables = r.total - r.sinLineas - r.noEvaluado
  const wo = wilson(r.contradice, r.acierta + r.contradice)
  process.stdout.write(
    `  ${k.padEnd(7)} acierta ${fraccion(r.acierta, juzgables)} · CONTRADICE ${fraccion(r.contradice, juzgables)} ` +
      `(Wilson sup. ${pct(wo.superior)}) · se abstiene ${fraccion(r.seAbstiene, juzgables)} · ` +
      `sin líneas ${r.sinLineas} · no evaluado ${r.noEvaluado}\n`,
  )
}
for (const t of tramos) {
  const g = oro.gemini.find((x) => x.id === t.id)
  const tx = oro.texto.find((x) => x.id === t.id)
  process.stdout.write(
    `    ${t.id.padEnd(26)} ${t.bloc.padEnd(6)} ${w(g?.lineas ?? 0, 3)} lín · Gemini ${g?.veredicto} · texto ${tx?.veredicto}\n`,
  )
}
if (excluidas.soloGemini.length || excluidas.soloTexto.length) {
  process.stdout.write(
    `\nFUERA DE LA MEDIDA (sin los dos mapas): sólo Gemini ${excluidas.soloGemini.join(' ') || '—'} · sólo texto ${excluidas.soloTexto.join(' ') || '—'}\n`,
  )
}

const oroT = resumenOro('texto')
const juzgablesT = oroT.total - oroT.sinLineas - oroT.noEvaluado
const ambosCitas = totCitas.coinciden + totCitas.contradicen
const wcc = wilson(totCitas.contradicen, ambosCitas)
const criterios = [
  {
    nombre: `contradicción con Gemini POR CITA publicable, Wilson sup. ≤ ${pct(MAX_CONTRADICCION)}`,
    pasa: ambosCitas > 0 && wcc.superior <= MAX_CONTRADICCION,
    valor: `${pct(wcc.superior)} (${totCitas.contradicen}/${ambosCitas})`,
  },
  {
    nombre: `contradicción con Gemini, Wilson sup. ≤ ${pct(MAX_CONTRADICCION)}`,
    pasa: ambos > 0 && wc.superior <= MAX_CONTRADICCION,
    valor: `${pct(wc.superior)} (${e.contradicen}/${ambos})`,
  },
  {
    nombre: `cobertura del texto ≥ ${pct(MIN_COBERTURA)} de la de Gemini`,
    pasa: cobG > 0 && cobT >= MIN_COBERTURA * cobG,
    valor: `${cobT}/${cobG} = ${cobG ? pct(cobT / cobG) : '—'}`,
  },
  {
    nombre: 'oro: ningún tramo contradicho',
    pasa: oroT.contradice === 0,
    valor: `${oroT.contradice}/${juzgablesT}`,
  },
  {
    nombre: 'oro: abstención en menos de la mitad',
    pasa: juzgablesT > 0 && oroT.seAbstiene < juzgablesT / 2,
    valor: `${oroT.seAbstiene}/${juzgablesT}`,
  },
]
process.stdout.write(`\nVEREDICTO PROVISIONAL (la puerta real es la muestra escuchada)\n`)
for (const c of criterios)
  process.stdout.write(`  ${c.pasa ? 'PASA ' : 'FALLA'} ${c.nombre}: ${c.valor}\n`)

if (nMuestra > 0 && muestraOut) {
  // Estratificada por sesión: una por sesión por turno hasta llenar, para que una
  // sesión con muchas no se coma la muestra. Orden fijo: reproducible.
  const porSesion = new Map<string, typeof soloTexto>()
  for (const s of soloTexto) porSesion.set(s.plenoId, [...(porSesion.get(s.plenoId) ?? []), s])
  const elegidas: typeof soloTexto = []
  for (let ronda = 0; elegidas.length < nMuestra; ronda++) {
    let alguna = false
    for (const lista of porSesion.values()) {
      if (lista[ronda] && elegidas.length < nMuestra) {
        elegidas.push(lista[ronda])
        alguna = true
      }
    }
    if (!alguna) break
  }
  const filas = elegidas.map((s) => {
    const r = (
      informe[s.plenoId] as {
        texto: {
          rows: Array<{ label: string; ev: { quote: string; at: number; relation: string } }>
        }
      }
    ).texto.rows.find((x) => x.label === s.label)
    return [
      s.plenoId,
      s.label,
      s.bloc,
      s.start.toFixed(1),
      r?.ev.relation ?? '',
      r?.ev.at.toFixed(1) ?? '',
      r?.ev.quote ?? '',
      '',
    ].join('\t')
  })
  writeFileSync(
    muestraOut,
    [
      'plenoId\tetiqueta\tbloque_texto\tprimera_linea_s\trelacion\tprueba_s\tprueba_cita\tescuchado_bloque',
      ...filas,
    ].join('\n') + '\n',
  )
  process.stdout.write(
    `\nmuestra «sólo texto»: ${elegidas.length} de ${soloTexto.length} etiquetas → ${muestraOut}\n`,
  )
}
if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        comunes,
        excluidas,
        porLinea: totLinea,
        porEtiqueta: totEtiqueta,
        porCita: totCitas,
        contraCitas,
        oro,
        criterios,
        plenos: informe,
      },
      null,
      2,
    ),
  )
  process.stdout.write(`→ ${jsonOut}\n`)
}
process.exit(criterios.every((c) => c.pasa) ? 0 : 1)
