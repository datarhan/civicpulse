/**
 * scripts/lib/claude-probe.sh — el preflight de claude-code conserva el MOTIVO.
 *
 * Tres planificadores sondean a claude con un `-p "ok"` antes de trabajar, y los
 * tres mandaban la respuesta a `/dev/null`. Lo que quedaba en el log era una
 * conjetura escrita a mano: «(quota or auth)», «(cuota o auth)» y, en press-lab,
 * «Max login may have lapsed (run: claude, then /login)».
 *
 * El 18 y el 19 de septiembre de 2026 el motivo real era
 * «You've hit your weekly limit · resets Sep 19 at 8pm (Europe/Madrid)». El CLI
 * lo decía; el sondeo lo tiraba. Al móvil llegó «extract-pleno-claims: se espera
 * cada 48h, última hace 49h», que no dice ni qué pasa ni qué hacer — y lo que
 * había que hacer era NADA, esperar a las ocho. El único sitio donde constaba la
 * frase era el log de otro agente (`auto-curate-promises.err.log`), porque
 * `src/llm/client.ts` sí la conserva desde el PR #22.
 *
 * Es la cuarta vez del mismo patrón —el parte, el cliente LLM, el log del
 * nocturno y ahora el sondeo—: el diagnóstico existe y se pierde por el camino.
 * Y un aviso con el remedio equivocado es peor que ninguno: «then /login» manda
 * a re-autenticar una sesión que está perfectamente autenticada.
 *
 * Aquí no se reimplementa nada: se hace `source` del fichero real contra un
 * `claude` falso en el PATH.
 */
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { claudeCodeArgs } from '../../src/llm/client'

const REPO = resolve(__dirname, '../..')
const LIB = join(REPO, 'scripts/lib/claude-probe.sh')

/** El literal que el CLI imprimió de verdad aquellas dos mañanas. */
const MOTIVO_REAL = "You've hit your weekly limit · resets Sep 19 at 8pm (Europe/Madrid)"

/** Un `claude` falso. `cuerpo` es el script entero tras el shebang. */
function claudeFalso(cuerpo: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'claude-probe-'))
  const bin = join(dir, 'bin')
  mkdirSync(bin, { recursive: true })
  const p = join(bin, 'claude')
  writeFileSync(p, `#!/bin/sh\n${cuerpo}\n`)
  chmodSync(p, 0o755)
  return bin
}

/**
 * Sondea y devuelve lo que un llamador vería: el código y el motivo.
 *
 * Bajo `set -euo pipefail`, que es como corren los tres planificadores: un
 * ayudante que sólo funciona sin `-e` se llevaría la pasada por delante en el
 * primer fallo, que es justo cuando hace falta.
 */
function sondear(bin: string): { rc: number; motivo: string } {
  const guion = [
    'set -euo pipefail',
    `. "${LIB}"`,
    'if claude_probe claude modelo-de-prueba; then rc=0; else rc=$?; fi',
    'printf "%s\\n%s" "$rc" "$CLAUDE_PROBE_MOTIVO"',
  ].join('\n')
  const out = execFileSync('bash', ['-c', guion], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  })
  const [rc, ...resto] = out.split('\n')
  return { rc: Number(rc), motivo: resto.join('\n') }
}

describe('claude_probe · el sondeo dice por qué falló', () => {
  it('conserva la frase del CLI cuando claude sale con error', () => {
    // Por stdout y con stderr vacío: así vino el fallo de producción del 22-ago
    // (ver `describeClaudeFailure`), y preferir stderr no habría salvado nada.
    const r = sondear(claudeFalso(`echo "${MOTIVO_REAL}"\nexit 1`))
    expect(r.rc).toBe(1)
    expect(r.motivo).toContain(MOTIVO_REAL)
  })

  it('también la conserva si viene por stderr', () => {
    const r = sondear(claudeFalso(`echo "Not logged in · Please run /login" >&2\nexit 1`))
    expect(r.rc).toBe(1)
    expect(r.motivo).toContain('Not logged in')
  })

  it('no recorta por la cabeza: lo informativo va al FINAL', () => {
    // El defecto de `client.ts` (PR #22): `slice(0, 400)` y la frase caía en el
    // índice 1007. Aquí hay 1.500 caracteres de ruido delante del motivo.
    const ruido = 'x'.repeat(1500)
    const r = sondear(claudeFalso(`echo "${ruido}"\necho "${MOTIVO_REAL}"\nexit 1`))
    expect(r.motivo).toContain(MOTIVO_REAL)
    // Y sigue siendo un renglón de log, no el volcado entero.
    expect(r.motivo.length).toBeLessThan(500)
  })

  it('sin salida dice que no hubo salida, y el código — no una conjetura', () => {
    const r = sondear(claudeFalso('exit 3'))
    expect(r.rc).toBe(3)
    expect(r.motivo).toMatch(/sin salida/i)
    expect(r.motivo).toContain('3')
    // «cuota o auth» era una suposición escrita a mano; un sondeo que no sabe
    // el motivo tiene que decir que no lo sabe.
    expect(r.motivo).not.toMatch(/quota|cuota|auth|login/i)
  })

  it('un binario ausente se nombra como tal', () => {
    const vacio = mkdtempSync(join(tmpdir(), 'claude-probe-vacio-'))
    const guion = [
      'set -euo pipefail',
      `. "${LIB}"`,
      'if claude_probe no-existe-este-binario modelo; then rc=0; else rc=$?; fi',
      'printf "%s\\n%s" "$rc" "$CLAUDE_PROBE_MOTIVO"',
    ].join('\n')
    const out = execFileSync('bash', ['-c', guion], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${vacio}:${process.env.PATH}` },
    })
    const [rc, ...resto] = out.split('\n')
    expect(Number(rc)).not.toBe(0)
    expect(resto.join('\n')).toMatch(/no-existe-este-binario/)
  })

  it('con claude sano sale 0 y no deja motivo — control', () => {
    const r = sondear(claudeFalso('echo "ok"\nexit 0'))
    expect(r.rc).toBe(0)
    expect(r.motivo).toBe('')
  })
})

/**
 * El sondeo avala las llamadas de `src/llm/client.ts`, así que corre como ellas:
 * en un directorio temporal vacío y con sus mismas banderas de aislamiento.
 *
 * Hasta el 28-09-2026 corría en el checkout de los planificadores con la sesión
 * entera del CLI: su prompt de sistema, el CLAUDE.md del proyecto, el índice de
 * la memoria automática, el listado de skills y los ganchos de los plugins. En
 * los 30 días anteriores fueron 71 sondeos de ~51k tokens de contexto cada uno,
 * y el gasto era lo de menos:
 *
 *   · No probaba lo que avala. Con `claudeCodeArgs` compartía sólo
 *     `--strict-mcp-config` y `--model`: un CLI que rompiera `--system-prompt` o
 *     `--disallowedTools` dejaba el sondeo en verde y cada llamada en rojo.
 *   · Era un agente armado en el árbol vivo: el checkout principal pone
 *     `acceptEdits` y 214 órdenes permitidas en `.claude/settings.local.json`, y
 *     con `disableAllHooks` ya no le alcanzan los ganchos de guarda del
 *     proyecto. Ninguno de los 71 usó una herramienta —la pregunta es «ok»—,
 *     pero un sondeo no tiene por qué poder escribir.
 *
 * Las banderas se leen del cliente, no se copian aquí: una copia seguiría en
 * verde el día que el cliente añada otra.
 */
describe('claude_probe · corre como las llamadas que avala', () => {
  /**
   * Las banderas del cliente que son de su salida estructurada, no de su
   * aislamiento: el sondeo contesta en texto, porque su motivo es el último
   * renglón de lo que imprime claude (ver la cabecera del fichero).
   */
  const SOLO_SALIDA_ESTRUCTURADA = ['--json-schema', '--output-format', '--allowedTools']

  const cliente = claudeCodeArgs(
    { userPrompt: 'u', systemPrompt: 's', config: { claudeCodeModel: 'modelo-de-prueba' } },
    '{}',
  )
  const valor = (a: string[], bandera: string) => a[a.indexOf(bandera) + 1]

  /** Sondea con un `claude` falso que apunta su argv, su cwd y lo que hay en él. */
  function sondearGrabando(salida = 'echo ok\nexit 0') {
    const g = mkdtempSync(join(tmpdir(), 'claude-probe-grabacion-'))
    const r = sondear(
      claudeFalso(
        [
          `printf '%s\\0' "$@" > "${g}/argv"`,
          `pwd -P > "${g}/cwd"`,
          `ls -A > "${g}/contenido"`,
          salida,
        ].join('\n'),
      ),
    )
    return {
      rc: r.rc,
      argv: readFileSync(join(g, 'argv'), 'utf8').split('\0').slice(0, -1),
      cwd: readFileSync(join(g, 'cwd'), 'utf8').trim(),
      contenido: readFileSync(join(g, 'contenido'), 'utf8').trim(),
    }
  }

  it('pasa todas las banderas de aislamiento del cliente', () => {
    const { rc, argv } = sondearGrabando()
    expect(rc).toBe(0)
    const aislamiento = cliente
      .filter((a) => a.startsWith('--'))
      .filter((a) => !SOLO_SALIDA_ESTRUCTURADA.includes(a))
    // Control: un filtro que lo dejara todo fuera no probaría nada.
    expect(aislamiento).toEqual(expect.arrayContaining(['--system-prompt', '--disallowedTools']))
    for (const bandera of aislamiento) expect(argv, bandera).toContain(bandera)
  })

  it('con los mismos valores donde el valor es el aislamiento', () => {
    const { argv } = sondearGrabando()
    const ajustes = JSON.parse(valor(argv, '--settings'))
    expect(ajustes).toEqual(JSON.parse(valor(cliente, '--settings')))
    expect(ajustes.disableAllHooks).toBe(true)
    expect(valor(argv, '--disallowedTools').split(',')).toEqual(
      valor(cliente, '--disallowedTools').split(','),
    )
  })

  it('corre en un directorio vacío, fuera del checkout', () => {
    // Fuera del checkout no hay CLAUDE.md, ni memoria, ni `acceptEdits`.
    const { cwd, contenido } = sondearGrabando()
    expect(cwd.startsWith(realpathSync(REPO))).toBe(false)
    expect(contenido).toBe('')
  })

  it('no deja el directorio temporal detrás, tampoco cuando claude falla', () => {
    for (const salida of ['echo ok\nexit 0', `echo "${MOTIVO_REAL}"\nexit 1`]) {
      const { cwd } = sondearGrabando(salida)
      expect(cwd.startsWith(realpathSync(REPO)), salida).toBe(false)
      expect(existsSync(cwd), salida).toBe(false)
    }
  })

  it('no mueve el directorio de quien lo carga', () => {
    // Los planificadores lo cargan con `.` y siguen trabajando en REPO_DIR: un
    // `cd` fuera de la subshell se los llevaría al temporal, y luego al vacío.
    const guion = [
      'set -euo pipefail',
      `cd "${REPO}"`,
      `. "${LIB}"`,
      'claude_probe claude modelo-de-prueba',
      'pwd -P',
    ].join('\n')
    const out = execFileSync('bash', ['-c', guion], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${claudeFalso('echo ok\nexit 0')}:${process.env.PATH}` },
    })
    expect(out.trim()).toBe(realpathSync(REPO))
  })
})

/**
 * Construir el ayudante no sirve de nada si nadie lo llama — el barrido de
 * «cosas no enchufadas» del 12-ago encontró media docena así. Los tres
 * planificadores que sondean tienen que usarlo, y ninguno puede volver a tirar
 * la respuesta.
 */
describe('claude_probe · está enchufado en los tres planificadores', () => {
  const PLANIFICADORES = [
    'scripts/hallazgos-pipeline.sh',
    'scripts/press-lab-pipeline.sh',
    'scripts/review-sweep.sh',
  ]

  /** Sin comentarios: el que explica el defecto cita la forma vieja. */
  const codigo = (rel: string) =>
    readFileSync(join(REPO, rel), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n')

  it.each(PLANIFICADORES)('%s sondea con claude_probe', (rel) => {
    const src = codigo(rel)
    expect(src).toMatch(/\.\s+"\$REPO_DIR\/scripts\/lib\/claude-probe\.sh"/)
    expect(src).toMatch(/claude_probe\s/)
  })

  it.each(PLANIFICADORES)('%s no manda el sondeo a /dev/null', (rel) => {
    expect(codigo(rel)).not.toMatch(/-p\s+"ok"[^\n]*>\s*\/dev\/null/)
  })

  it.each(PLANIFICADORES)('%s escribe el motivo en su log', (rel) => {
    expect(codigo(rel)).toMatch(/log\s+"[^"\n]*\$\{?CLAUDE_PROBE_MOTIVO/)
  })

  it('ninguno conserva el remedio adivinado', () => {
    for (const rel of PLANIFICADORES) {
      const src = codigo(rel)
      expect(src, rel).not.toMatch(/quota or auth|cuota o auth/i)
      expect(src, rel).not.toMatch(/login may have lapsed/i)
    }
  })

  it('no hay un cuarto planificador sondeando por su cuenta', () => {
    // Si nace otro, que nazca usando el ayudante. La lista de arriba se mide
    // contra el directorio, no contra la memoria de quien la escribió.
    const conSondeo = readdirSync(join(REPO, 'scripts'))
      .filter((f) => f.endsWith('.sh'))
      .filter((f) => /-p\s+"ok"/.test(codigo(`scripts/${f}`)))
    expect(conSondeo, 'un .sh sondea a claude sin pasar por claude_probe').toEqual([])
  })
})
