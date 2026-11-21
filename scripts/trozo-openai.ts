/**
 * Añade a la transcripción en curso las líneas de UN trozo devuelto por OpenAI,
 * para scripts/transcribe-pleno.sh. Lee RESP_JSON, OFFSET_S, CHUNK_IDX,
 * N_CHUNKS y OUT_PATH del entorno. Sale 1 —y no escribe nada— si el trozo vino
 * sin texto. La lógica, en src/scraper/trozo-diarizado.ts.
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { lineasDeTrozoOpenAI } from '../src/scraper/trozo-diarizado'

const env = process.env
const indice = Number(env.CHUNK_IDX)
const desplazamiento = Number(env.OFFSET_S)
const datos = JSON.parse(readFileSync(String(env.RESP_JSON), 'utf8'))
let r
try {
  r = lineasDeTrozoOpenAI(datos, { desplazamiento, indice })
} catch (e) {
  console.error(`[transcribe] ${(e as Error).message}`)
  process.exit(1)
}
if (!r.ok) {
  console.error(`[transcribe] ${r.motivo}`)
  process.exit(1)
}
appendFileSync(String(env.OUT_PATH), r.lineas.join('\n') + '\n')
const s = r.resumen
console.error(
  `[transcribe]   chunk ${indice + 1}/${env.N_CHUNKS}: ${s.segmentos} segs · +${desplazamiento}s offset · ` +
    `${s.oradores} speaker cluster(s) · habla ${s.desde.toFixed(0)}–${s.hasta.toFixed(0)} s · mayor hueco ${s.mayorHueco} s`,
)
