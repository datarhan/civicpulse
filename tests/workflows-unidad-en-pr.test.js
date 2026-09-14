import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'

/**
 * ¿Corre ALGUIEN la suite de unidad en un PR?
 *
 * El 2026-09-14 la respuesta era no (#23). `e2e.yml`, el workflow que se dispara
 * en todo PR, hacía `npm ci → lint → typecheck → build → test:e2e`, y ningún
 * otro workflow de `pull_request` ejecutaba `npm test`: `bot.yml` corre la suite
 * DEL BOT y sólo cuando el PR toca `bot/**`, y la nocturna corre la de la raíz
 * en `main`, de madrugada y con `continue-on-error`. Las más de seis mil pruebas
 * de unidad eran una puerta local, y sólo si quien abría el PR se acordaba de
 * pasarlas. Cuando la nocturna avisaba, el commit ya estaba dentro.
 *
 * Así llegó a `main` una prueba frágil de la portada, verde en su PR porque allí
 * no la ejecutó nadie, y la encontró el PR de otro subsistema.
 *
 * Es la tercera puerta de la misma familia, y las otras dos ya tienen su
 * prueba: `bot-tests-cubiertos` (las del bot no corrían en ningún sitio) y
 * `deploy-triggers` (una bandera que se despliega sin que su spec se ejecute).
 * Ésta hereda la lección de la primera, cuya versión inicial buscaba dos
 * cadenas en el mismo fichero y pasaba sin que existiera ningún workflow. Aquí
 * se exige el PASO: en un workflow que se dispara en cualquier PR, uno que
 * ejecuta la suite de la RAÍZ, que no se traga su fallo y que corre después de
 * instalar el navegador que una de sus pruebas levanta.
 *
 * Se lee con un parser de YAML y no con expresiones regulares: lo que importa es
 * a qué paso pertenece cada clave, y eso un grep no lo sabe.
 */
const WF = join(__dirname, '..', '.github', 'workflows')

const workflows = readdirSync(WF)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ nombre: f, doc: load(readFileSync(join(WF, f), 'utf8')) }))

/** ¿Se dispara en cualquier PR, y no sólo en los que tocan una carpeta? */
function disparaEnTodoPR(doc) {
  const on = doc?.on
  if (on === 'pull_request') return true
  if (Array.isArray(on)) return on.includes('pull_request')
  if (!on || typeof on !== 'object' || !('pull_request' in on)) return false
  // `paths:` es la lista de lo ÚNICO que lo dispara —`bot.yml` sólo con
  // `bot/**`—, así que no guarda el PR que no la toque. `paths-ignore:` de datos
  // y prosa, como el de `e2e.yml`, sí deja una puerta general.
  return !on.pull_request?.paths
}

/**
 * La orden que ejecuta la suite de la raíz. `npm test` o vitest; nunca
 * `npm run test:e2e`, que es Playwright, ni `test:watch`, que no termina.
 */
const CORRE_LA_SUITE = /\bnpm\s+(?:run\s+)?test(?![\w:-])|\bvitest\s+run\b/

/** El directorio de un paso: el suyo, o el `defaults` del trabajo o del workflow. */
function directorio(doc, trabajo, paso) {
  return (
    paso['working-directory'] ??
    trabajo?.defaults?.run?.['working-directory'] ??
    doc?.defaults?.run?.['working-directory'] ??
    '.'
  )
}

/** Cada paso que ejecuta la suite, con lo que decide si de verdad hace de puerta. */
function pasosDeLaSuite({ nombre, doc }) {
  const out = []
  for (const [idTrabajo, trabajo] of Object.entries(doc?.jobs ?? {})) {
    const pasos = trabajo?.steps ?? []
    pasos.forEach((paso, i) => {
      if (typeof paso?.run !== 'string' || !CORRE_LA_SUITE.test(paso.run)) return
      out.push({
        nombre,
        idTrabajo,
        i,
        paso,
        pasos,
        // `--prefix bot` o `cd bot &&` corren la de OTRO proyecto aunque el
        // paso esté en la raíz: es la trampa que ya tuvo la prueba del bot.
        enLaRaiz:
          ['.', './'].includes(String(directorio(doc, trabajo, paso)).trim()) &&
          !/--prefix\b|\bcd\s/.test(paso.run),
        // Un fallo tragado deja el PR en verde: la nocturna lo hace a propósito,
        // porque lo pliega en su puerta de salud, pero en un PR no guarda nada.
        tragaFallo: paso['continue-on-error'] === true || trabajo?.['continue-on-error'] === true,
        condicionado: paso.if !== undefined || trabajo?.if !== undefined,
      })
    })
  }
  return out
}

const puertas = (lista) =>
  lista
    .filter((w) => disparaEnTodoPR(w.doc))
    .flatMap(pasosDeLaSuite)
    .filter((p) => p.enLaRaiz && !p.tragaFallo && !p.condicionado)

const describe_ = (p) => `${p.nombre} · ${p.idTrabajo} · «${p.paso.name ?? p.paso.run}»`

describe('la suite de unidad es una puerta de PR', () => {
  // Regla 2 de DATA_INTEGRITY: si el parser dejara de ver los disparadores,
  // «ningún workflow de PR corre la suite» sería cierto por no haber mirado.
  it('lee los workflows y reconoce uno de PR general y uno acotado a su carpeta', () => {
    expect(workflows.length).toBeGreaterThanOrEqual(10)
    const generales = workflows.filter((w) => disparaEnTodoPR(w.doc)).map((w) => w.nombre)
    expect(generales).toContain('e2e.yml')
    // El negativo real: `bot.yml` se dispara en PR, pero sólo si tocan `bot/**`.
    expect(generales).not.toContain('bot.yml')
  })

  it('el detector distingue la suite de la raíz de lo que se le parece', () => {
    const wf = (paso, trabajo = {}) => ({
      nombre: 'prueba.yml',
      doc: { on: { pull_request: {} }, jobs: { j: { ...trabajo, steps: [paso] } } },
    })
    const guarda = (w) => puertas([w])
    expect(guarda(wf({ run: 'npm test' }))).toHaveLength(1)
    expect(guarda(wf({ run: 'npx vitest run' }))).toHaveLength(1)
    expect(guarda(wf({ run: 'npm run test:e2e' })), 'Playwright no es la de unidad').toHaveLength(0)
    expect(guarda(wf({ run: 'npm run test:watch' }))).toHaveLength(0)
    expect(
      guarda(wf({ run: 'npm test', 'working-directory': 'bot' })),
      'la suite del bot no es la de la raíz',
    ).toHaveLength(0)
    expect(
      guarda(wf({ run: 'npm test' }, { defaults: { run: { 'working-directory': 'bot' } } })),
    ).toHaveLength(0)
    expect(guarda(wf({ run: 'npm test --prefix bot' }))).toHaveLength(0)
    expect(guarda(wf({ run: 'cd bot && npm test' }))).toHaveLength(0)
    expect(
      guarda(wf({ run: 'npm test', 'continue-on-error': true })),
      'un fallo tragado no es una puerta',
    ).toHaveLength(0)
    expect(guarda(wf({ run: 'npm test', if: "github.event_name == 'push'" }))).toHaveLength(0)
    expect(disparaEnTodoPR({ on: { pull_request: { paths: ['bot/**'] } } })).toBe(false)
    expect(disparaEnTodoPR({ on: { pull_request: { 'paths-ignore': ['**/*.md'] } } })).toBe(true)
    expect(disparaEnTodoPR({ on: ['push', 'pull_request'] })).toBe(true)
    expect(disparaEnTodoPR({ on: { schedule: [{ cron: '30 4 * * *' }] } })).toBe(false)
  })

  it('algún workflow de PR ejecuta la suite de la raíz, y su fallo tumba el PR', () => {
    expect(
      puertas(workflows).map(describe_),
      'ningún workflow de pull_request ejecuta `npm test` en la raíz sin tragarse el fallo: ' +
        'las pruebas de unidad no guardan ningún PR',
    ).not.toEqual([])
  })

  // `tests/reader-review-resiliencia.test.ts` levanta chromium de verdad, y sin
  // navegador no falla por lo que vigila: falla con «Executable doesn't exist»,
  // que tuvo la nocturna en rojo desde el 14-08-2026 sin parecerse a su causa.
  // Un paso de unidad movido por delante de la instalación volvería a eso.
  it('y la ejecuta después de instalar el navegador que una de sus pruebas levanta', () => {
    const conNavegador = puertas(workflows).filter((p) =>
      p.pasos
        .slice(0, p.i)
        .some((s) => typeof s?.run === 'string' && /playwright\s+install/.test(s.run)),
    )
    expect(
      conNavegador.map(describe_),
      'la suite corre antes de instalar Chromium: reader-review-resiliencia fallará por no tener navegador',
    ).not.toEqual([])
  })
})
