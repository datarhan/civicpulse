/**
 * Los cortes de un audio, para scripts/transcribe-pleno.sh.
 *
 *   npx tsx scripts/cortes-audio.ts --filtro
 *       imprime el filtro de ffmpeg que hay que pasar (`-af`) para los silencios
 *   npx tsx scripts/cortes-audio.ts --duracion <s> --silencios <stderr-de-ffmpeg>
 *       imprime dos líneas: los cortes separados por comas (vacía si no se
 *       trocea) y cuántos fueron a ciegas
 *
 * La lógica y su porqué, en src/scraper/cortes-audio.ts.
 */
import { readFileSync } from 'node:fs'
import { FILTRO_SILENCIOS, elegirCortes, parseSilencios } from '../src/scraper/cortes-audio'

const args = process.argv.slice(2)
if (args.includes('--filtro')) {
  console.log(FILTRO_SILENCIOS)
  process.exit(0)
}
const valor = (k: string) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : undefined
}
const duracion = Number(valor('--duracion'))
const fichero = valor('--silencios')
if (!(duracion > 0) || !fichero) {
  console.error('uso: cortes-audio.ts --duracion <s> --silencios <fichero> | --filtro')
  process.exit(2)
}
const { cortes, ciegos } = elegirCortes(
  duracion,
  parseSilencios(readFileSync(fichero, 'utf8'), duracion),
)
console.log(cortes.join(','))
console.log(String(ciegos))
