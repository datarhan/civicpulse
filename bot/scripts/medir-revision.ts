/**
 * Mide la revisión automática contra los casos de oro (tests/fixtures/moderacion-oro.json):
 * pregunta al modelo por cada uno con el mismo prompt que el bot —y los cargos inventados
 * del fichero—, graba lo que contesta en tests/fixtures/moderacion-oro-respuestas.json y
 * dice la medida (src/services/medida-revision.ts).
 *
 *   GEMINI_API_KEY=… npx tsx scripts/medir-revision.ts [--modelo gemini-2.5-flash]
 *
 * No registra nada en .automation-measurements.json. Abrir la publicación automática es
 * una decisión de una persona: `npm run record-measurement` en la raíz, y en el mismo
 * cambio la frase de /quejas que dice que una persona revisa cada queja
 * (tests/contrato-quejas.test.js). Los casos son sintéticos, así que para medir no hace
 * falta el nivel de pago; la clave, sí.
 *
 * Un fallo de paso —un 429, un 5xx, la red— se reintenta dos veces. Uno que persiste se
 * graba como error y no cuenta ni a favor ni en contra: la medida lo dice aparte.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { consultarModelo, FalloDeRevision } from '../src/services/moderacion.ts'
import { MODELO_POR_DEFECTO, VERSION_PROMPT } from '../src/services/moderacion-criterios.ts'
import {
  medirRevision,
  textoGuardado,
  type CasoDeOro,
  type RespuestaGrabada,
} from '../src/services/medida-revision.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ORO = join(HERE, '..', 'tests', 'fixtures', 'moderacion-oro.json')
const SALIDA = join(HERE, '..', 'tests', 'fixtures', 'moderacion-oro-respuestas.json')

const i = process.argv.indexOf('--modelo')
const modelo =
  i >= 0 ? process.argv[i + 1] : process.env.GEMINI_MODERACION_MODEL?.trim() || MODELO_POR_DEFECTO
if (!process.env.GEMINI_API_KEY) {
  process.stderr.write('[medir-revision] falta GEMINI_API_KEY en el entorno\n')
  process.exit(2)
}

const oro = JSON.parse(readFileSync(ORO, 'utf8')) as { cargos: string[]; casos: CasoDeOro[] }
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
const DE_PASO = /^(HTTP (429|5\d\d)|tiempo|red)$/

async function preguntar(c: CasoDeOro): Promise<RespuestaGrabada> {
  for (let intento = 0; ; intento++) {
    try {
      const r = await consultarModelo(textoGuardado(c), {
        env: process.env,
        modelo,
        cargos: oro.cargos,
      })
      return r.tipo === 'texto'
        ? { tipo: 'texto', texto: r.texto }
        : { tipo: 'bloqueada', razon: r.razon }
    } catch (err) {
      const codigo = err instanceof FalloDeRevision ? err.codigo : 'fallo'
      if (intento < 2 && DE_PASO.test(codigo)) {
        await espera(3000 * (intento + 1))
        continue
      }
      return { tipo: 'error', codigo }
    }
  }
}

const respuestas: Record<string, RespuestaGrabada> = {}
for (const c of oro.casos) {
  respuestas[c.id] = await preguntar(c)
  process.stderr.write(respuestas[c.id].tipo === 'error' ? 'x' : '.')
  await espera(250)
}
process.stderr.write('\n')

const medida = medirRevision(oro.casos, respuestas)
writeFileSync(
  SALIDA,
  JSON.stringify(
    {
      _nota:
        'Lo que contestó el modelo a cada caso de oro, grabado por scripts/medir-revision.ts. ' +
        'tests/revision-oro.test.ts repite la medida con el código de hoy: si deja de cuadrar, ' +
        'el código decide otra cosa que lo medido, y hay que volver a medir.',
      modelo,
      version_prompt: VERSION_PROMPT,
      fecha: new Date().toISOString(),
      medida,
      respuestas,
    },
    null,
    2,
  ) + '\n',
)

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)} %`)
const lista = (xs: string[]) => (xs.length ? xs.join(', ') : 'ninguna')
process.stdout.write(
  [
    `Modelo ${modelo}, prompt ${VERSION_PROMPT}, ${medida.casos} casos.`,
    `Publicaría ${medida.publicaria}: seguras ${medida.seguras} (${pct(medida.precision)}; ` +
      `límite inferior al 95 %, ${pct(medida.limiteInferior)}).`,
    `Inseguras: ${lista(medida.inseguras)}.`,
    `Retenidas bien: ${medida.retenidasBien}. De más: ${lista(medida.retenidasDeMas)}.`,
    `Quitó de más: ${lista(medida.quitadoDeMas)}.`,
    `Inválidas: ${lista(medida.invalidas)}. Errores: ${lista(medida.errores)}.`,
    `Grabado en ${SALIDA}.`,
    '',
  ].join('\n'),
)
