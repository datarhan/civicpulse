import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'

/**
 * ¿Ejecuta ALGUIEN las pruebas del bot?
 *
 * El 2026-09-09 la respuesta era no. `bot/tests/` tenía 124 pruebas y ninguna
 * corría en CI: el `vitest.config.js` de la raíz incluye `tests/**` y `src/**`
 * y nada más, así que `npm test` —lo que mira la puerta de salud de la
 * nocturna— nunca las veía, y no había ningún workflow que entrara en `bot/`.
 * Se ejecutaban a mano o no se ejecutaban.
 *
 * Es el defecto de cableado de esta casa otra vez, y en su forma más barata de
 * pasar por alto: la suite existe, pasa cuando la corres, y por eso nadie
 * sospecha que no la corre nadie. Verde por no ejecutarse.
 *
 * Esta prueba NO exige que las del bot vivan en la suite de la raíz —no deben:
 * la raíz corre en `happy-dom` con su propio setup, y meter ahí 124 pruebas con
 * SQLite nativo haría la nocturna más frágil, que es justo lo contrario de lo
 * que se acaba de arreglar—. Exige lo único que importa: que algún workflow las
 * ejecute.
 */
const WF = join(__dirname, '..', '.github', 'workflows')
const RAIZ = join(__dirname, '..')

/** Los ficheros de workflow, sin comentarios: dentro de uno hay órdenes falsas. */
const workflows = readdirSync(WF)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({
    nombre: f,
    texto: readFileSync(join(WF, f), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n'),
  }))

/**
 * Correr las pruebas DEL BOT significa correrlas CON `bot` de directorio, y hay
 * que ser preciso o la guarda se firma su propio visto bueno: la primera
 * versión de esta prueba buscaba «bot» y «npm test» en el mismo fichero, y
 * pasaba en verde el día que no existía ningún workflow del bot — porque la
 * nocturna dice «civicpulse-bot» al comitear y corre `npm test`, el de la RAÍZ.
 * Dos cadenas ciertas, conclusión falsa.
 */
const CORRE_EL_BOT =
  /working-directory:\s*\.?\/?bot\b|cd\s+bot\s*&&[^\n]*\btest\b|npm[^\n]*--prefix[= ]\.?\/?bot[^\n]*\btest\b/

describe('las pruebas del bot las ejecuta alguien', () => {
  // Si esto deja de existir, la prueba de abajo se volvería vacua: estaría
  // comprobando la cobertura de un directorio sin pruebas y pasaría sola.
  it('el bot tiene pruebas que cubrir', () => {
    const dir = join(RAIZ, 'bot', 'tests')
    expect(existsSync(dir)).toBe(true)
    const suites = readdirSync(dir).filter((f) => /\.test\.[jt]sx?$/.test(f))
    expect(suites.length, 'bot/tests sin ficheros de prueba').toBeGreaterThan(0)
  })

  // El workflow nació ROJO por esto, y en local no se podía ver: sin
  // configuración propia, `cd bot && vitest` sube por el árbol y carga la de la
  // RAÍZ, que importa `vitest` y sus `setupFiles`. En un portátil resuelve
  // —están las dos instaladas y encima— y en CI, donde sólo se instalan las
  // dependencias del bot, revienta antes de recoger un fichero:
  // «Cannot find package 'vitest' imported from …/vitest.config.ts».
  //
  // Heredar la configuración de otro proyecto sólo funciona mientras los dos
  // estén instalados, así que la independencia del bot hay que afirmarla.
  it('el bot tiene configuración propia de vitest y no hereda la de la raíz', () => {
    const cfgs = readdirSync(join(RAIZ, 'bot')).filter((f) => /^vitest\.config\.[jt]s$/.test(f))
    expect(
      cfgs,
      'sin config propia el bot carga la de la raíz, que en CI no tiene node_modules al lado',
    ).not.toEqual([])
  })

  it('algún workflow entra en bot/ y corre su suite', () => {
    const cubren = workflows.filter((w) => CORRE_EL_BOT.test(w.texto))
    expect(
      cubren.map((w) => w.nombre),
      'ningún workflow ejecuta las pruebas del bot: existen, pasan a mano, y CI no las mira',
    ).not.toEqual([])
  })

  // Un workflow que sólo se dispara a mano no es cobertura: nadie lo lanza.
  it('ese workflow se dispara solo, no sólo a mano', () => {
    const cubren = workflows.filter((w) => CORRE_EL_BOT.test(w.texto))
    const automaticos = cubren.filter((w) => /^\s*(push|pull_request|schedule):/m.test(w.texto))
    expect(
      automaticos.map((w) => w.nombre),
      'el único que corre las pruebas del bot es de disparo manual',
    ).not.toEqual([])
  })
})

/**
 * ¿Comprueba ALGUIEN los tipos del bot?
 *
 * El 2026-09-14 la respuesta era no (#20). Al arreglar la promoción a los diez
 * apoyos se añadió una llamada a `reconcileApoyadas` en `bot/src/index.ts` sin
 * su import, y las pruebas del bot pasaron todas en verde: ninguna importa
 * `index.ts`, todas entran por `db/queries.ts`, los servicios o los comandos.
 * `tsc --noEmit` lo cazaba al primer intento —«Cannot find name
 * 'reconcileApoyadas'»—, pero no lo ejecutaba nadie: `bot/package.json` no tenía
 * script de tipos, `bot.yml` hacía `npm ci` y `npm test`, y el único `tsc` de CI
 * es el de la RAÍZ, cuyo tsconfig no cubre `bot/`. Un arranque que no compila se
 * fusionaba en verde y `bot-deploy.yml` lo desplegaba: el bot mudo que este
 * repositorio ya tuvo el 8-09 por otra puerta.
 *
 * Es el defecto que la cabecera de `bot.yml` se escribió para cerrar —verde por
 * no ejecutarse—, cerrado para las pruebas y abierto para los tipos. Y aquí
 * vuelve la trampa de arriba: buscar «tsc» y «bot» en el mismo fichero pasaría
 * con el `typecheck` de la raíz y la palabra «bot» en cualquier sitio. Así que
 * se exige el PASO, leído con un parser de YAML: con `bot` de directorio, que
 * ejecute los tipos, que no se trague el fallo ni cuelgue de un `if:`, en un
 * workflow que se dispare solo.
 */
const workflowsLeidos = readdirSync(WF)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ nombre: f, doc: load(readFileSync(join(WF, f), 'utf8')) }))

/** Ejecuta los tipos: el script del paquete o `tsc` a pelo. */
const TIPA = /\bnpm\s+(?:--prefix[= ]\S+\s+)?run\s+typecheck\b|\btsc\b/

/** ¿Corre DENTRO de bot/? Por su directorio, el del trabajo, o un `cd`/`--prefix`. */
function enElBot(doc, trabajo, paso) {
  const dir =
    paso['working-directory'] ??
    trabajo?.defaults?.run?.['working-directory'] ??
    doc?.defaults?.run?.['working-directory'] ??
    '.'
  return (
    /^\.?\/?bot\/?$/.test(String(dir).trim()) ||
    /\bcd\s+\.?\/?bot\/?\s*&&/.test(paso.run) ||
    /--prefix[= ]\.?\/?bot\b/.test(paso.run)
  )
}

/** Los pasos que comprueban los tipos del bot y cuyo fallo tumba el trabajo. */
function pasosDeTipos({ nombre, doc }) {
  const out = []
  for (const [idTrabajo, trabajo] of Object.entries(doc?.jobs ?? {})) {
    for (const paso of trabajo?.steps ?? []) {
      if (typeof paso?.run !== 'string' || !TIPA.test(paso.run)) continue
      if (!enElBot(doc, trabajo, paso)) continue
      if (paso['continue-on-error'] === true || trabajo?.['continue-on-error'] === true) continue
      if (paso.if !== undefined || trabajo?.if !== undefined) continue
      out.push({ nombre, idTrabajo, paso })
    }
  }
  return out
}

/** Por push, PR o calendario: no sólo a mano. */
function seDisparaSolo(doc) {
  const on = doc?.on
  const disparadores =
    typeof on === 'string' ? [on] : Array.isArray(on) ? on : Object.keys(on ?? {})
  return disparadores.some((d) => ['push', 'pull_request', 'schedule'].includes(d))
}

describe('los tipos del bot los comprueba alguien', () => {
  it('el bot tiene un script de tipos, y es tsc sin emitir', () => {
    const pkg = JSON.parse(readFileSync(join(RAIZ, 'bot', 'package.json'), 'utf8'))
    expect(pkg.scripts?.typecheck, 'bot/package.json no tiene script `typecheck`').toBeTruthy()
    expect(pkg.scripts.typecheck).toMatch(/\btsc\b/)
    expect(pkg.scripts.typecheck).toMatch(/--noEmit\b/)
  })

  // El error del 14-09 salió de `src/`. Que un tipo mal puesto en una PRUEBA se
  // cace igual depende de que el tsconfig la incluya, y hoy la incluye.
  it('su tsconfig cubre el código y las pruebas', () => {
    const cfg = JSON.parse(readFileSync(join(RAIZ, 'bot', 'tsconfig.json'), 'utf8'))
    const incluye = cfg.include ?? []
    expect(
      incluye.some((g) => /^(\.\/)?src\//.test(g)),
      'no incluye bot/src',
    ).toBe(true)
    expect(
      incluye.some((g) => /^(\.\/)?tests\//.test(g)),
      'no incluye bot/tests',
    ).toBe(true)
  })

  it('el detector exige el directorio del bot, no la palabra', () => {
    const wf = (paso, trabajo = {}) => ({
      nombre: 'prueba.yml',
      doc: { on: { pull_request: {} }, jobs: { j: { ...trabajo, steps: [paso] } } },
    })
    const ve = (w) => pasosDeTipos(w).length
    expect(ve(wf({ run: 'npm run typecheck', 'working-directory': 'bot' }))).toBe(1)
    expect(ve(wf({ run: 'npx tsc --noEmit', 'working-directory': './bot' }))).toBe(1)
    expect(ve(wf({ run: 'cd bot && npm run typecheck' }))).toBe(1)
    expect(ve(wf({ run: 'npm --prefix bot run typecheck' }))).toBe(1)
    const conDefecto = { defaults: { run: { 'working-directory': 'bot' } } }
    expect(ve(wf({ run: 'npm run typecheck' }, conDefecto))).toBe(1)
    // El `typecheck` de la RAÍZ, que es el que ya corría en e2e.yml.
    expect(ve(wf({ run: 'npm run typecheck' })), 'los tipos de la raíz no son los del bot').toBe(0)
    // Las PRUEBAS del bot, en su directorio, no son sus tipos.
    expect(ve(wf({ run: 'npm test', 'working-directory': 'bot' }))).toBe(0)
    const enBot = { run: 'npm run typecheck', 'working-directory': 'bot' }
    expect(ve(wf({ ...enBot, 'continue-on-error': true })), 'un fallo tragado').toBe(0)
    expect(ve(wf({ ...enBot, if: "github.event_name == 'push'" }))).toBe(0)
  })

  it('algún workflow que se dispara solo comprueba los tipos DENTRO de bot/', () => {
    // Mide algo: el `typecheck` de la raíz de e2e.yml tiene que verse como paso
    // de tipos y descartarse por no ser del bot. Si el parser dejara de ver los
    // pasos, «nadie comprueba los tipos» sería cierto por no haber mirado.
    const deTipos = workflowsLeidos.flatMap(({ doc }) =>
      Object.values(doc?.jobs ?? {}).flatMap((j) =>
        (j?.steps ?? []).filter((s) => typeof s?.run === 'string' && TIPA.test(s.run)),
      ),
    )
    expect(
      deTipos.length,
      'el parser no ve ningún paso de tipos en ningún workflow',
    ).toBeGreaterThan(0)

    const cubren = workflowsLeidos.filter((w) => seDisparaSolo(w.doc)).flatMap(pasosDeTipos)
    expect(
      cubren.map((c) => `${c.nombre} · ${c.idTrabajo} · «${c.paso.name ?? c.paso.run}»`),
      'ningún workflow comprueba los tipos del bot: sus pruebas pasan con el arranque sin compilar',
    ).not.toEqual([])
  })
})
