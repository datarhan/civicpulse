/**
 * Mide la invarianza contrafactual de la revisión automática: pregunta al modelo
 * k veces por cada texto de tests/fixtures/moderacion-contrafactual.json —las
 * bases del oro, sus variantes con un rasgo de quien escribe, los pares de lengua
 * y los controles—, con el mismo prompt que el bot y los cargos inventados del
 * oro, y dice la medida (src/services/medida-contrafactual.ts).
 *
 *   node --env-file=<fichero con GEMINI_API_KEY> --import tsx scripts/medir-contrafactual.ts \
 *     [--k 5] [--modelo gemini-2.5-flash] [--pausa-ms 0] [--reanudar] [--solo ESTRATO] \
 *     [--salida <dir>] [--simulacro]
 *
 * Se lanza a mano, nunca desde un cron. No registra nada en
 * .automation-measurements.json ni toca la publicación automática: de momento se
 * mide y una persona lee el informe (decisión del 18-11-2026, en
 * editorial/moderacion-contrafactual-2026-11-18/plan.md).
 *
 * Graba en editorial/moderacion-contrafactual-2026-11-18/datos/ (gitignorado):
 * las respuestas tal cual y un informe. Los textos son sintéticos. `--reanudar`
 * lee la grabación de la fecha y sólo pregunta lo que falta, para no pagar dos
 * veces una medida cortada. `--simulacro` construye todos los textos y dice
 * cuántas preguntas haría, sin clave y sin preguntar nada.
 *
 * Un fallo de paso se reintenta tres veces; uno que persiste se graba como error y
 * la medida lo cuenta como «sin juzgar», nunca como «igual». Un 429 que sobrevive a
 * los reintentos es la cuota agotada: se para, con lo preguntado ya grabado.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { consultarModelo, FalloDeRevision } from '../src/services/moderacion.ts'
import { MODELO_POR_DEFECTO, VERSION_PROMPT } from '../src/services/moderacion-criterios.ts'
import type { CasoDeOro, RespuestaGrabada } from '../src/services/medida-revision.ts'
import {
  ESTRATOS,
  K_POR_DEFECTO,
  medirInvarianza,
  paresDelFixture,
  textosAMedir,
  type FixtureContrafactual,
  type Grabacion,
  type MedidaInvarianza,
} from '../src/services/medida-contrafactual.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIX = join(HERE, '..', 'tests', 'fixtures')
const RAIZ = join(HERE, '..', '..')

const arg = (nombre: string) => {
  const i = process.argv.indexOf(nombre)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const bandera = (nombre: string) => process.argv.includes(nombre)

const k = Number(arg('--k') ?? K_POR_DEFECTO)
const modelo = arg('--modelo') ?? process.env.GEMINI_MODERACION_MODEL?.trim() ?? MODELO_POR_DEFECTO
const pausa = Number(arg('--pausa-ms') ?? 0)
const solo = arg('--solo')
const salida =
  arg('--salida') ?? join(RAIZ, 'editorial', 'moderacion-contrafactual-2026-11-18', 'datos')
const fecha = new Date().toISOString().slice(0, 10)

if (!Number.isInteger(k) || k < 1) {
  process.stderr.write('[medir-contrafactual] --k tiene que ser un entero ≥ 1\n')
  process.exit(2)
}
if (solo && !(ESTRATOS as readonly string[]).includes(solo)) {
  process.stderr.write(
    `[medir-contrafactual] --solo: ${solo} no es un estrato (${ESTRATOS.join(', ')})\n`,
  )
  process.exit(2)
}

const oro = JSON.parse(readFileSync(join(FIX, 'moderacion-oro.json'), 'utf8')) as {
  cargos: string[]
  casos: CasoDeOro[]
}
const fixture = JSON.parse(
  readFileSync(join(FIX, 'moderacion-contrafactual.json'), 'utf8'),
) as FixtureContrafactual

// Con --solo, sólo los textos de los pares (o positivos) de ese estrato.
let textos = textosAMedir(fixture, oro.casos)
if (solo) {
  const { pares, positivos } = paresDelFixture(fixture, oro.casos)
  const claves = new Set<string>(
    solo === 'CONTROL_POSITIVO'
      ? positivos.map((p) => p.clave)
      : pares.filter((p) => p.estrato === solo).flatMap((p) => [p.llano.clave, p.conRasgo.clave]),
  )
  textos = textos.filter((t) => claves.has(t.clave))
}

const fichero = join(salida, `respuestas-${fecha}.json`)
const grabacion: Grabacion =
  bandera('--reanudar') && existsSync(fichero)
    ? (JSON.parse(readFileSync(fichero, 'utf8')) as Grabacion)
    : { modelo, version_prompt: VERSION_PROMPT, k, respuestas: {} }
if (
  grabacion.version_prompt !== VERSION_PROMPT ||
  grabacion.modelo !== modelo ||
  grabacion.k !== k
) {
  process.stderr.write(
    `[medir-contrafactual] la grabación de ${fichero} es de otro modelo, prompt o k: no se reanuda sobre ella\n`,
  )
  process.exit(2)
}

const pendientes = textos.flatMap((t) =>
  Array.from({ length: Math.max(0, k - (grabacion.respuestas[t.clave]?.length ?? 0)) }, () => t),
)
process.stderr.write(
  `[medir-contrafactual] ${textos.length} textos × k ${k}: ${pendientes.length} preguntas por hacer ` +
    `(modelo ${modelo}, prompt ${VERSION_PROMPT})\n`,
)
if (bandera('--simulacro')) process.exit(0)

if (!process.env.GEMINI_API_KEY) {
  process.stderr.write('[medir-contrafactual] falta GEMINI_API_KEY en el entorno\n')
  process.exit(2)
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
const DE_PASO = /^(HTTP (429|5\d\d)|tiempo|red)$/

async function preguntar(texto: (typeof textos)[number]['texto']): Promise<RespuestaGrabada> {
  for (let intento = 0; ; intento++) {
    try {
      const r = await consultarModelo(texto, { env: process.env, modelo, cargos: oro.cargos })
      return r.tipo === 'texto'
        ? { tipo: 'texto', texto: r.texto }
        : { tipo: 'bloqueada', razon: r.razon }
    } catch (err) {
      const codigo = err instanceof FalloDeRevision ? err.codigo : 'fallo'
      if (intento < 3 && DE_PASO.test(codigo)) {
        await espera((codigo === 'HTTP 429' ? 30_000 : 5000) * (intento + 1))
        continue
      }
      return { tipo: 'error', codigo }
    }
  }
}

mkdirSync(salida, { recursive: true })
const grabar = () => writeFileSync(fichero, JSON.stringify(grabacion, null, 2) + '\n')

let hechas = 0
for (const t of pendientes) {
  const r = await preguntar(t.texto)
  ;(grabacion.respuestas[t.clave] ??= []).push(r)
  hechas += 1
  process.stderr.write(r.tipo === 'error' ? `\n${t.clave}: ${r.codigo}\n` : '.')
  // Se graba cada veinte: una medida cortada se reanuda, no se paga dos veces.
  if (hechas % 20 === 0) grabar()
  if (r.tipo === 'error' && r.codigo === 'HTTP 429') {
    grabar()
    process.stderr.write(
      `\n[medir-contrafactual] cuota agotada tras ${hechas} preguntas: grabado lo hecho en ${fichero}. ` +
        'Reanuda con --reanudar y una clave del nivel de pago.\n',
    )
    process.exit(3)
  }
  if (pausa > 0) await espera(pausa)
}
grabar()
process.stderr.write('\n')

const m = medirInvarianza(fixture, oro.casos, grabacion)
writeFileSync(join(salida, `informe-${fecha}.md`), informe(m))
writeFileSync(join(salida, `medida-${fecha}.json`), JSON.stringify(m, null, 2) + '\n')
process.stdout.write(resumen(m) + `\nGrabado en ${salida}.\n`)

function pct(x: number | null): string {
  return x === null ? '—' : `${(x * 100).toFixed(1)} %`
}

function resumen(m: MedidaInvarianza): string {
  const inv = m.invarianza
  return [
    `Modelo ${m.modelo}, prompt ${m.version_prompt}, k ${m.k}.`,
    `Invarianza (explícito + implícito + lengua): ${inv.invariantes} de ${inv.juzgados} juzgados ` +
      `(${pct(inv.tasa)}; límite inferior de Wilson al 95 %, ${pct(inv.limiteInferior)}).`,
    `Roturas hacia la retención ${m.mcnemar.haciaRetencion}, hacia la publicación ${m.mcnemar.haciaPublicacion} ` +
      `(McNemar exacto p = ${m.mcnemar.p.toFixed(4)}).`,
    `Ruido de un texto consigo mismo: ${m.ruido.noUnanimes} de ${m.ruido.textos} textos no unánimes; ` +
      `discordancia ${pct(m.ruido.discordanciaIntra)}.`,
    `Controles: positivos bien ${m.controles.positivosBien}, mal ${m.controles.positivosMal.length}; ` +
      `sensibilidad detectada ${m.controles.sensibilidadDetectada}, perdida ${m.controles.sensibilidadPerdida.length}.`,
    m.registrable.ok
      ? 'La medida se sostiene. NO se registra: se lee primero (decisión del 18-11-2026).'
      : `La medida NO se sostiene:\n  - ${m.registrable.porque.join('\n  - ')}`,
  ].join('\n')
}

function informe(m: MedidaInvarianza): string {
  const filas = (
    titulo: string,
    cuentas: Record<string, MedidaInvarianza['porEstrato'][keyof MedidaInvarianza['porEstrato']]>,
  ) => [
    `## ${titulo}`,
    '',
    '| | pares | intentados | juzgados | invariantes | rompen | → retención | → publicación | fragmentos | inestables | sin juzgar | nunca | rasgo quitado | sólo motivos | IC 95 % roturas |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...Object.entries(cuentas).map(
      ([n, c]) =>
        `| ${n} | ${c.pares} | ${c.intentados} | ${c.juzgados} | ${c.invariantes} | ${c.rompen} | ${c.haciaRetencion} | ` +
        `${c.haciaPublicacion} | ${c.porFragmentos} | ${c.inestables} | ${c.sinJuzgar} | ${c.nuncaIntentados} | ` +
        `${c.rasgoRetirado} | ${c.soloMotivos} | ${c.intervaloRoturas ? c.intervaloRoturas.map(pct).join(' – ') : '—'} |`,
    ),
    '',
  ]
  const textoDe = new Map(textosAMedir(fixture, oro.casos).map((t) => [t.clave, t.texto]))
  const { pares } = paresDelFixture(fixture, oro.casos)
  const parPorId = new Map(pares.map((p) => [p.id, p]))
  return [
    `# Invarianza contrafactual de la revisión — ${fecha}`,
    '',
    'Privado (editorial/). Generado por bot/scripts/medir-contrafactual.ts. Los textos son sintéticos.',
    'Por rasgo hay unas 24 parejas: las cifras por rasgo se listan, no se afirman. Una rotura se lee una a una.',
    '',
    '```',
    resumen(m),
    '```',
    '',
    `Exceso sobre el ruido (pares del listón con dos válidas por lado): ${m.exceso.pares} pares, mediana ` +
      `${m.exceso.mediana === null ? '—' : m.exceso.mediana.toFixed(3)}, ${m.exceso.positivos} por encima y ` +
      `${m.exceso.negativos} por debajo; prueba del signo de una cola p = ${m.exceso.p.toFixed(4)}.`,
    '',
    ...filas('Por estrato', m.porEstrato),
    ...filas('Por rasgo (sólo estratos del listón; no se afirma)', m.porRasgo),
    '## Roturas',
    '',
    ...(m.rompen.length === 0
      ? ['Ninguna.', '']
      : m.rompen.flatMap((r) => {
          const p = parPorId.get(r.id)
          const llano = p ? textoDe.get(p.llano.clave) : undefined
          const con = p ? textoDe.get(p.conRasgo.clave) : undefined
          return [
            `### ${r.id} — ${r.estrato}, ${r.rasgo ?? 'sin rasgo'}, ${r.direccion}`,
            '',
            `- Llano: **${r.resultadoLlano}** (${r.motivosLlano.join(', ') || 'sin motivos'})`,
            `- Con rasgo: **${r.resultadoConRasgo}** (${r.motivosConRasgo.join(', ') || 'sin motivos'})` +
              (r.rasgoRetirado ? ' — quitó la frase del rasgo' : '') +
              (r.porDatosSensibles ? ' — por datos sensibles' : ''),
            '',
            `> ${llano?.detalle ?? '—'}`,
            '',
            `> ${con?.detalle ?? '—'}`,
            '',
          ]
        })),
    '## Controles',
    '',
    `- Positivos mal: ${m.controles.positivosMal.join(', ') || 'ninguno'}`,
    `- Positivos sin juzgar: ${m.controles.positivosSinJuzgar.join(', ') || 'ninguno'}`,
    `- Sensibilidad perdida: ${m.controles.sensibilidadPerdida.join(', ') || 'ninguna'}`,
    '',
    '## Sólo cambian los motivos, o quitó la frase del rasgo',
    '',
    ...m.resultados
      .filter((r) => r.soloMotivos || (r.rasgoRetirado && r.desenlace !== 'rompe'))
      .map(
        (r) =>
          `- ${r.id}: ${r.soloMotivos ? `motivos ${r.motivosLlano.join(',')} → ${r.motivosConRasgo.join(',')}` : ''}` +
          `${r.rasgoRetirado ? ' quitó la frase del rasgo' : ''}`,
      ),
    '',
  ].join('\n')
}
