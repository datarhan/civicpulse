/**
 * ¿Se está comiteando algo NUESTRO y privado a un repositorio público?
 *
 *   npm run check:privado -- --staged   → sólo lo estampado (pre-commit)
 *   npm run check:privado               → todo lo rastreado (auditoría)
 *
 * La hermana de `check:secrets`, y hace falta aparte porque un secreto se
 * reconoce por su FORMA y esto no: la referencia de la propuesta de NLnet no se
 * parece a nada. La lógica y el porqué de cada patrón están en
 * `src/scraper/privado.ts`; aquí sólo se enumeran ficheros y se cuenta.
 *
 * Se mira sólo lo ESTAMPADO en el gancho, para que siga costando milisegundos,
 * igual que `check:secrets`.
 *
 * Y como aquella: **borrar la línea no lo saca de git**. Si algo ya se empujó,
 * esta puerta impide que crezca y que llegue a `main`, no lo despublica.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { buscarPrivado, resumirPrivado, type HallazgoPrivado } from '../src/scraper/privado.ts'

/**
 * Ficheros que legítimamente contienen cadenas con esta pinta.
 *
 * La guarda tiene que nombrar lo que caza y la prueba tiene que alimentarla con
 * algo con esa forma —con valores obviamente falsos, que es lo que impide que
 * la prueba vuelva a comitear el dato real—. Excluirlos es lo que evita que
 * esta puerta llore en el propio código que cierra el agujero.
 */
const ALLOW = [
  'scripts/check-privado.ts',
  'src/scraper/privado.ts',
  'tests/privado.test.ts',
  // La suite del calendario tiene que probar que un aviso de convocatoria ya
  // presentada dice CON QUÉ referencia, así que necesita una: usa `REF-123`,
  // que no es de nadie. Misma razón por la que `check:secrets` excluye la suya.
  'bot/tests/convocatorias.test.ts',
]

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|tgz|woff2?|ttf|otf|eot|mp[34]|m4a|ogg|opus|wav|mov|mp4|webm)$/i

function trackedFiles(stagedOnly: boolean): string[] {
  const args = stagedOnly ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR'] : ['ls-files']
  return execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean)
}

function main(): void {
  const stagedOnly = process.argv.includes('--staged')
  const files = trackedFiles(stagedOnly)

  // Una pasada tiene que PROBAR que hizo el trabajo: escaneados / saltados con
  // su motivo, nunca plegados juntos. «0 hallazgos» sobre 0 ficheros es el
  // visto bueno que no significa nada.
  let scanned = 0
  let skippedBinary = 0
  let skippedAllowed = 0
  let skippedMissing = 0
  const hallazgos: HallazgoPrivado[] = []

  for (const f of files) {
    if (ALLOW.includes(f)) {
      skippedAllowed += 1
      continue
    }
    if (BINARY_EXT.test(f)) {
      skippedBinary += 1
      continue
    }
    let texto: string
    try {
      statSync(f)
      texto = readFileSync(f, 'utf8')
    } catch {
      skippedMissing += 1
      continue
    }
    scanned += 1
    hallazgos.push(...buscarPrivado(f, texto))
  }

  const r = resumirPrivado(hallazgos, scanned)
  const scope = stagedOnly ? 'estampado(s)' : 'rastreado(s)'

  if (!r.bloquea) {
    console.log(
      `[check:privado] ${scanned} fichero(s) ${scope} · 0 dato(s) privado(s) · ` +
        `saltados ${skippedBinary} binarios, ${skippedAllowed} en la lista, ${skippedMissing} ilegibles`,
    )
    if (!r.concluyente) {
      // Nada escaneado no es nada encontrado.
      console.log('[check:privado] no se escaneó ningún fichero: esto NO es un visto bueno')
    }
    return
  }

  console.error(`\n[check:privado] ${r.hallazgos} dato(s) privado(s) en ${scanned} fichero(s):\n`)
  for (const h of hallazgos) {
    console.error(`  ${h.fichero}:${h.linea}  [${h.clase}]`)
    console.error(`    ${h.fragmento}`)
    console.error(`    → ${h.motivo}\n`)
  }
  console.error(
    'Este repositorio es PÚBLICO desde el 8-09-2026. Borrar la línea no lo saca de\n' +
      'git: si ya se empujó, esto sólo impide que crezca. El material de campaña vive\n' +
      'en editorial/, que está gitignorado.\n\n' +
      'Si un aviso es falso, el arreglo suele ser decir el hecho de QUIEN CONVOCA en\n' +
      'lugar de nuestra conclusión sobre él. Si de verdad procede publicarlo, la lista\n' +
      'está en ALLOW de scripts/check-privado.ts y se toca con un comentario que lo\n' +
      'justifique.\n',
  )
  process.exit(1)
}

main()
