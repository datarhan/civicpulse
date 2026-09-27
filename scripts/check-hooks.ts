#!/usr/bin/env tsx
/**
 * ¿Corren los ganchos de git en TODOS los worktrees, o git se los salta sin
 * decir nada?
 *
 *   npm run check:hooks                     mira; sale 1 si algo no los corre
 *   npm run check:hooks -- --fix            fija core.hooksPath absoluto si era
 *                                           relativo, y luego mira
 *   npm run check:hooks -- --desde-gancho   lo del pre-commit: repara, avisa,
 *                                           calla si todo está bien y NO
 *                                           bloquea nunca
 *
 * ## Lo que pasó
 *
 * El 27-09-2026 un push desde `.claude/worktrees/bot-barrios` no imprimió
 * ninguna línea `[pre-push]`. Medido ese día: nueve de doce worktrees no
 * ejecutaban NINGÚN gancho — ni el pre-commit (lint, formato, las tres puertas
 * de publicación, check:sparse) ni la revisión lectora del pre-push. Git no
 * dice nada cuando no encuentra un gancho: comitea y empuja como si no lo
 * hubiera.
 *
 * El mecanismo: husky escribe `core.hooksPath = .husky/_`, RELATIVO, en el
 * `.git/config` que comparten todos los worktrees, y git resuelve un valor
 * relativo contra la raíz de CADA worktree. `.husky/_` lo genera husky y está en
 * `.gitignore`, así que sólo existe donde alguien lo generó: en el checkout
 * principal sí, en un worktree recién creado no.
 *
 * CLAUDE.md decía desde el 23-08-2026 que el valor era absoluto, y leído desde
 * un worktree creado por la app de escritorio de Claude lo parece: la app, al
 * crear cada uno, le fija en su `config.worktree` el valor del repositorio
 * resuelto contra el principal — lo apunta en su log: «Configured worktree hooks
 * path to …/.husky/_ (from base repo config)». Un `git config core.hooksPath`
 * dentro de ese worktree devuelve esa fijación, no el config compartido. Los
 * worktrees creados de otro modo —la herramienta `EnterWorktree` de una sesión,
 * `git worktree add`— no la reciben y heredan el relativo.
 *
 * Quién lo reescribe: husky, cada vez que corre. No es dependencia, así que el
 * `prepare` de `npm install` no lo encuentra, y nada en el repositorio lo
 * invoca; aun así `.husky/_` se regeneró el 25-09 en el principal y el 27-09 en
 * un worktree. Alguien lo corre a mano, y cada vez deja el valor relativo.
 *
 * ## El arreglo
 *
 * `core.hooksPath` absoluto en el config compartido, apuntando al `.husky/_` del
 * checkout principal. Para el principal es el mismo directorio de siempre; para
 * un worktree, los ganchos del principal — que es lo que CLAUDE.md documenta:
 * un cambio en `.husky/` se prueba invocándolo, no empujando desde un worktree.
 * Lo fija `--fix`, lo repara el pre-commit en cada commit (husky puede volver a
 * correr a mano cuando sea) y lo reaplica el `prepare` justo detrás de husky.
 *
 * Se comprueba la cadena entera, no que exista un fichero: git → lanzador de
 * `.husky/_` → corredor `h` → guion de `.husky/`. Dos eslabones fallan callados
 * y uno falla ABIERTO: si `core.hooksPath` desaparece, la app de escritorio
 * apunta los worktrees nuevos a `.husky` a secas, git ejecuta el guion sin el
 * `sh -e` de husky y —medido— un paso que falla deja pasar el commit.
 *
 * ## Dónde corre, y dónde no
 *
 * - pre-commit, con `--desde-gancho`: repara el valor compartido y NO bloquea
 *   nunca, porque ese pre-commit es también el de los agentes de launchd en el
 *   checkout principal, y lo roto en OTRO worktree no puede parar sus commits de
 *   datos. Sólo corre donde ya hay ganchos, así que no ve lo que más importa: un
 *   worktree sin ganchos no llega a ejecutarlo.
 * - `monitor:health`, estricto: corre en el portátil por cron y su rojo llega al
 *   móvil. Es la puerta con dientes.
 * - NO en la nocturna: corre en GitHub Actions, donde no hay ganchos a propósito.
 *   Allí saldría verde sin haber mirado nada.
 */
import { execFileSync } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  esLanzadorDeHusky,
  estadoComun,
  ganchosDelRepo,
  problemasDe,
  QUE_PASA,
  reparacion,
  tine,
  worktreesDe,
  type MedidaGancho,
  type MedidaWorktree,
  type Problema,
} from '../src/scraper/hooks-guard'

const desdeGancho = process.argv.includes('--desde-gancho')
const arreglar = process.argv.includes('--fix') || desdeGancho
const out = (s = '') => process.stdout.write(`${s}\n`)

/** git; `null` si sale con error — en `config --get`, «no está puesto». */
function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

function medirGancho(dir: string, nombre: string): MedidaGancho {
  const fichero = join(dir, nombre)
  let estado: MedidaGancho['fichero'] = 'ausente'
  let texto = ''
  if (existsSync(fichero) && statSync(fichero).isFile()) {
    texto = readFileSync(fichero, 'utf8')
    try {
      accessSync(fichero, constants.X_OK)
      estado = 'presente'
    } catch {
      estado = 'no-ejecutable'
    }
  }
  return {
    nombre,
    fichero: estado,
    lanzador: esLanzadorDeHusky(texto),
    corredor: existsSync(join(dir, 'h')),
    // El corredor ejecuta `$(dirname "$(dirname "$0")")/<gancho>`.
    guion: existsSync(join(dirname(dir), nombre)),
  }
}

function medirWorktree(ruta: string, ganchos: string[]): MedidaWorktree {
  // Se le pregunta a git, que es quien decide: resuelve un valor relativo contra
  // la raíz de ESTE worktree y respeta el `config.worktree` que lo fije.
  const dir = git(['-C', ruta, 'rev-parse', '--path-format=absolute', '--git-path', 'hooks'])
  return { ruta, dir: dir || null, ganchos: dir ? ganchos.map((g) => medirGancho(dir, g)) : [] }
}

function main() {
  const porcelain = git(['worktree', 'list', '--porcelain'])
  const worktrees = porcelain === null ? [] : worktreesDe(porcelain)
  const principal = worktrees.find((w) => w.principal)
  if (!principal) {
    out('[hooks] no estamos en un repositorio git — nada que mirar')
    return
  }
  const enDisco = worktrees.filter((w) => w.enDisco)

  const leerComun = () => git(['config', '--local', '--type=path', '--get', 'core.hooksPath'])
  const valor = leerComun()
  // Sin valor compartido, ¿tiene esta máquina ganchos? El `.husky/_` generado en
  // el principal, o un worktree que fija el suyo (la app de escritorio lo hace).
  const hayGanchos =
    Boolean(valor) ||
    existsSync(join(principal.ruta, '.husky', '_')) ||
    enDisco.some((w) =>
      (git(['-C', w.ruta, 'config', '--show-scope', '--get', 'core.hooksPath']) ?? '').startsWith(
        'worktree',
      ),
    )
  let comun = estadoComun(valor, principal.ruta, hayGanchos)

  const destino = arreglar ? reparacion(comun, existsSync) : null
  if (destino && comun.tipo === 'relativo') {
    if (git(['config', '--local', 'core.hooksPath', destino]) === null) {
      out(`[hooks] NO se pudo escribir core.hooksPath = ${destino} en el config compartido.`)
    } else {
      out(`[hooks] core.hooksPath compartido: «${comun.valor}» → ${destino} (era relativo)`)
    }
    comun = estadoComun(leerComun(), principal.ruta, hayGanchos)
  }

  if (comun.tipo === 'sin-ganchos') {
    out(
      '[hooks] esta máquina no tiene ganchos de git: core.hooksPath sin poner y ningún `.husky/_` generado. ' +
        'Nada que mirar — es lo normal en CI y en un clon nuevo, porque `husky` no es dependencia.',
    )
    return
  }

  const ganchos = ganchosDelRepo(git(['ls-files', '--full-name', '--', ':/.husky']) ?? '')
  if (ganchos.length === 0) {
    out('[hooks] el repositorio no trae ganchos en `.husky/`: nada que comprobar.')
    return
  }

  const medidas = enDisco.map((w) => medirWorktree(w.ruta, ganchos))
  const rotos = medidas
    .map((m) => ({ m, problemas: problemasDe(m) }))
    .filter((r) => r.problemas.length > 0)
  const huskyApagado = process.env.HUSKY === '0'

  // Desde un gancho, callado cuando no hay nada que decir: una línea de «todo
  // bien» en cada commit es cómo una guarda se gana que dejen de leerla.
  if (desdeGancho && comun.tipo === 'absoluto' && rotos.length === 0 && !huskyApagado) return

  if (comun.tipo === 'relativo') {
    out(
      `[hooks] core.hooksPath compartido es RELATIVO («${comun.valor}»): git lo resuelve contra la raíz de ` +
        'CADA worktree, y `.husky/_` sólo existe donde alguien lo generó.',
    )
    out(
      existsSync(comun.destino)
        ? '  Se arregla con: npm run check:hooks -- --fix'
        : `  --fix no puede: ${comun.destino} no existe, porque husky no ha corrido en el checkout ` +
            'principal. Córrelo allí y repite --fix.',
    )
  } else if (comun.tipo === 'sin-poner') {
    out(
      '[hooks] core.hooksPath no está puesto en el config compartido y esta máquina tiene ganchos: ' +
        'ningún worktree sin valor propio los corre.',
    )
    out(`  Si no fue a propósito: git config core.hooksPath ${join(principal.ruta, '.husky', '_')}`)
  }

  if (rotos.length === 0) {
    const dirs = [...new Set(medidas.map((m) => m.dir))]
    out(
      `[hooks] ${medidas.length} de ${medidas.length} worktree(s) corren ${ganchos.join(', ')} ` +
        `desde ${dirs.length === 1 ? dirs[0] : `${dirs.length} directorios: ${dirs.join(', ')}`}`,
    )
  } else {
    out(`[hooks] ${rotos.length} de ${medidas.length} worktree(s) NO corren sus ganchos:`)
    const vistos = new Set<Problema>()
    for (const { m, problemas } of rotos) {
      out(`  · ${m.ruta}`)
      const porProblema = new Map<Problema, string[]>()
      for (const { gancho, problema } of problemas) {
        vistos.add(problema)
        porProblema.set(problema, [
          ...(porProblema.get(problema) ?? []),
          ...(gancho ? [gancho] : []),
        ])
      }
      for (const [problema, nombres] of porProblema) {
        const donde = m.dir ? ` (git los busca en ${m.dir})` : ''
        out(`      ${nombres.length ? `${nombres.join(', ')}: ` : ''}${problema}${donde}`)
      }
    }
    for (const p of vistos) out(`    ${p} — ${QUE_PASA[p]}`)
  }

  const fuera = worktrees.length - enDisco.length
  if (fuera > 0) out(`  ⓘ ${fuera} worktree(s) registrados sin carpeta en disco: no se miran.`)
  if (huskyApagado) {
    out(
      '  ⓘ HUSKY=0 en este entorno: el corredor de husky sale sin ejecutar nada aunque git encuentre el gancho.',
    )
  }

  if (tine(comun, rotos.length, { desdeGancho })) process.exit(1)
}

main()
