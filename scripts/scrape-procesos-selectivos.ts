import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseProcesosList } from '../src/scraper/procesos-selectivos'
import { fetchProcesosHtml, PROCESOS_URL } from '../src/scraper/procesos-selectivos-fetch'

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public/data/procesos-selectivos.json',
)

async function main() {
  const html = await fetchProcesosHtml()
  if (!html) throw new Error('procesos-selectivos: list page fetch failed')
  const procesos = parseProcesosList(html)
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), source: PROCESOS_URL, procesos },
      null,
      2,
    ),
  )
  console.log(`wrote ${procesos.length} procesos selectivos`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
