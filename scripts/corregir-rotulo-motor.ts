/**
 * corregir-rotulo-motor — corrige a nombre de quién está una retractación del
 * motor de veredictos, con lo que prueba la caché y dejando constancia.
 *
 *   npm run corregir-rotulo-motor -- --ids <fichero> --reason "<≥20>" \
 *       --editor "<firma>" [--dry-run]
 *
 * El 02-08-2026 el motor escribió como `verdict-engine:claude-code` 457
 * retractaciones que había contestado gpt-4o-mini, el respaldo de pago de la
 * cadena (la causa la cerró la PR #248). Esta CLI no re-juzga nada ni llama a
 * ningún modelo: lee en `.llm-cache` quién escribió el razonamiento que produjo
 * cada explicación publicada, y su extracción (`llmCacheEntrada`), y cambia sólo
 * el rótulo y el prefijo del motivo que lo copia. Cada corrección se queda en la
 * entrada (`labelCorrections`). El porqué de cada regla, en
 * src/scraper/correccion-de-rotulo.ts.
 *
 * `--ids` (un id por línea; `#` comenta) puede listar todas las retractaciones
 * del motor: las que la caché no prueba, o cuyo rótulo ya nombra a quien
 * contestó, se dejan y se dicen una a una.
 *
 * `--editor` no pide una persona: la prueba es mecánica, se rehace desde la
 * caché, y la firma el operador —con su nombre o con la cuenta de rol—, como
 * `correct-pleno-finding`. Sólo se rechaza el hueco de una orden sin rellenar
 * (`rechazoDeMarcador`), antes de leer nada.
 *
 * `--dry-run` enseña, fila a fila, el rótulo y el motivo de antes y de después
 * y la corrección que se apuntaría, y no escribe nada.
 *
 * No recompone verified.json: el rótulo y el motivo de una entrada del motor no
 * viajan a la verificación publicada (`mergeVerified`), sólo al overlay.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { llmCacheEntrada, loadConfigFromEnv } from '../src/llm/client'
import { rechazoDeMarcador } from '../src/scraper/firma-de-persona'
import {
  corregirRotulos,
  decidirCorreccionDeRotulo,
  MOTIVO_PARA_DEJAR_EL_ROTULO,
  type DecisionDeRotulo,
  type LectorDeCache,
  type MotivoParaDejarElRotulo,
} from '../src/scraper/correccion-de-rotulo'
import { loadOverlay, OVERLAY } from './verified-rebuild'

const USO =
  'uso: npm run corregir-rotulo-motor -- --ids <fichero> --reason "<≥20 caracteres>" --editor "<firma>" [--dry-run]'

function salir(codigo: number, mensaje: string): never {
  process.stderr.write(`[corregir-rotulo] ${mensaje}\n`)
  process.exit(codigo)
}

function leerOrden(argv: string[]) {
  let ids: string | null = null
  let motivo = ''
  let editor: string | null = null
  let dryRun = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--ids') ids = argv[++i] ?? null
    else if (a === '--reason') motivo = argv[++i] ?? ''
    else if (a === '--editor') editor = argv[++i] ?? ''
    else if (a === '--dry-run') dryRun = true
    else salir(2, `opción desconocida ${a}\n${USO}`)
  }
  // La firma y el porqué, antes de leer nada.
  if (editor === null) salir(2, `falta --editor: quién firma la corrección\n${USO}`)
  const hueco = rechazoDeMarcador(editor)
  if (hueco) salir(2, `--editor: ${hueco}`)
  if (motivo.trim().length < 20)
    salir(2, `--reason tiene que decir el porqué en ≥20 caracteres\n${USO}`)
  if (!ids) salir(2, `falta --ids <fichero>\n${USO}`)
  return { ids, motivo, editor, dryRun }
}

function main() {
  const orden = leerOrden(process.argv.slice(2))
  const pedidos = readFileSync(orden.ids, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  const overlay = loadOverlay()

  // Sólo lectura forense de la caché: ni una llamada, ni un acierto contado.
  const base = loadConfigFromEnv()
  const leer: LectorDeCache = (primario, pregunta) =>
    llmCacheEntrada({ ...pregunta, config: { ...base, ...primario } })

  const correcciones: Extract<DecisionDeRotulo, { accion: 'corregir' }>[] = []
  const dejadas: { id: string; porque: MotivoParaDejarElRotulo }[] = []
  for (const id of pedidos) {
    const d = decidirCorreccionDeRotulo({ claimId: id, entrada: overlay.entries[id], leer })
    if (d.accion === 'corregir') correcciones.push(d)
    else dejadas.push({ id, porque: d.porque })
  }

  const { overlay: nuevo, filas } = corregirRotulos(overlay, correcciones, {
    motivo: orden.motivo,
    editor: orden.editor,
    stamp: new Date().toISOString(),
  })

  for (const f of filas) {
    process.stdout.write(
      `${f.claimId}\n` +
        `  editor: ${f.antes.editor} → ${f.despues.editor}\n` +
        `  motivo antes:   ${f.antes.reason}\n` +
        `  motivo después: ${f.despues.reason}\n` +
        `  labelCorrections += ${JSON.stringify(f.despues.correccion)}\n`,
    )
  }
  for (const d of dejadas) {
    process.stdout.write(`dejada ${d.id}: ${d.porque} (${MOTIVO_PARA_DEJAR_EL_ROTULO[d.porque]})\n`)
  }

  const mixtas = filas.filter((f) => f.despues.editor.includes('+')).length
  const porMotivo = new Map<MotivoParaDejarElRotulo, number>()
  for (const d of dejadas) porMotivo.set(d.porque, (porMotivo.get(d.porque) ?? 0) + 1)
  const motivos = [...porMotivo].map(([m, n]) => `${m} ${n}`).join(' · ')
  process.stdout.write(
    `[corregir-rotulo] corregidas ${filas.length} (${filas.length - mixtas} de un modelo · ` +
      `${mixtas} de dos) · dejadas ${dejadas.length}${motivos ? ` (${motivos})` : ''} · ` +
      `de ${pedidos.length} pedidas` +
      `${orden.dryRun ? ' · DRY-RUN, nada escrito' : ''}\n`,
  )

  if (!orden.dryRun && filas.length > 0) {
    writeFileSync(OVERLAY, JSON.stringify(nuevo, null, 2) + '\n')
    process.stdout.write(`[corregir-rotulo] overlay escrito: ${OVERLAY}\n`)
  }

  // Que la caché no pruebe ni una fila no es «todo estaba bien»: o esta caché
  // no es la de la máquina que corrió las pasadas, o cambió cómo se guardan las
  // claves (CLAVES_DE_LAS_PASADAS). Sale con 1 para que nadie lo lea como limpio.
  if (
    pedidos.length > 0 &&
    filas.length === 0 &&
    dejadas.every((d) => d.porque === 'sin-procedencia')
  ) {
    process.stderr.write(
      `[corregir-rotulo] la caché no prueba ninguna de las ${pedidos.length} filas pedidas: ` +
        '¿es la .llm-cache de la máquina que corrió las pasadas, o cambiaron sus claves ' +
        '(CLAVES_DE_LAS_PASADAS en src/scraper/correccion-de-rotulo.ts)?\n',
    )
    process.exitCode = 1
  }
}

main()
