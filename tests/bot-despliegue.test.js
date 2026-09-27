import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'

import { VARIABLE_VERSION } from '../bot/src/services/health.ts'

/**
 * ¿Despliega ALGUIEN el bot cuando su código cambia?
 *
 * El 2026-09-09 la respuesta era no, y costó lo que tenía que costar. Ese día se
 * añadió al calendario un premio que cerraba en 36 días y se comprobó que el
 * aviso salía bien; la máquina de Fly seguía sirviendo la versión de las
 * 08:16Z, anterior a los cuatro commits del día. El aviso del 15 de septiembre
 * no iba a salir de ninguna manera, y nada lo decía: `bot.yml` corre las
 * pruebas —verde—, `main` tenía el código —verde—, y el bot en producción era
 * de otra hora.
 *
 * Y ya había pasado: el 8-09 el bot se quedó MUDO al rotar el token porque Fly
 * no se actualizó. Dos veces es el patrón, no el accidente.
 *
 * Comitear no es desplegar. Esa distancia la cubría una persona acordándose, y
 * acordarse no es un mecanismo.
 *
 * Esta prueba NO exige que el despliegue funcione —eso depende de un secreto
 * que vive en GitHub— sino que EXISTA y se dispare solo. Es la misma pregunta
 * que `bot-tests-cubiertos.test.js` hace de las pruebas: ¿quién ejecuta esto?
 */
const WF = join(__dirname, '..', '.github', 'workflows')

const workflows = readdirSync(WF)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({
    nombre: f,
    // Sin comentarios: dentro de uno hay órdenes falsas y explicaciones que
    // nombran justo lo que se busca.
    texto: readFileSync(join(WF, f), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n'),
  }))

const BOT_SRC = join(__dirname, '..', 'bot', 'src')

/** Los .ts de bot/src que se ejecutan (no las pruebas), recorridos a mano. */
function fuentesDelBot(dir = BOT_SRC) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? fuentesDelBot(join(dir, e.name))
      : /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)
        ? [readFileSync(join(dir, e.name), 'utf8')]
        : [],
  )
}

/**
 * Lo que el bot lee o importa de la raíz del repositorio, como rutas relativas a
 * ella: `resolve(HERE, '..', '..', '..', 'public', 'data', 'x.json')` y
 * `from '../../../src/…'`.
 */
function leidoFueraDeBot() {
  const rutas = new Set()
  for (const texto of fuentesDelBot()) {
    for (const m of texto.matchAll(
      /resolve\(HERE,\s*'\.\.',\s*'\.\.',\s*'\.\.',\s*'public',\s*'data',\s*'([^']+)'\)/g,
    ))
      rutas.add(`public/data/${m[1]}`)
    for (const m of texto.matchAll(/from '\.\.\/\.\.\/\.\.\/(src\/[^']+)'/g)) rutas.add(m[1])
  }
  return [...rutas].sort()
}

/** Desplegar el bot es invocar a flyctl, no mencionarlo. */
const DESPLIEGA = /(?:flyctl|fly)\s+deploy|superfly\/flyctl-actions/

describe('el bot lo despliega alguien', () => {
  it('algún workflow despliega el bot', () => {
    const cubren = workflows.filter((w) => DESPLIEGA.test(w.texto))
    expect(
      cubren.map((w) => w.nombre),
      'ningún workflow despliega el bot: comitear no es desplegar, y la distancia la cubría alguien acordándose',
    ).not.toEqual([])
  })

  // Un despliegue manual no cierra la distancia: es la misma persona
  // acordándose, sólo que con otra interfaz.
  it('ese workflow se dispara con un push, no sólo a mano', () => {
    const cubren = workflows.filter((w) => DESPLIEGA.test(w.texto))
    const automaticos = cubren.filter((w) => /^\s*push:/m.test(w.texto))
    expect(
      automaticos.map((w) => w.nombre),
      'el único que despliega el bot es de disparo manual',
    ).not.toEqual([])
  })

  // Y tiene que mirar `bot/**`: un despliegue que sólo corre cuando cambia otra
  // cosa vuelve a dejar el bot atrás, que es exactamente el defecto.
  it('se dispara cuando cambia el código DEL BOT', () => {
    const cubren = workflows.filter((w) => DESPLIEGA.test(w.texto) && /^\s*push:/m.test(w.texto))
    const porRuta = cubren.filter((w) => /['"]?bot\/\*\*/.test(w.texto))
    expect(
      porRuta.map((w) => w.nombre),
      'el despliegue del bot no se dispara con los cambios de bot/**',
    ).not.toEqual([])
  })

  // La imagen del bot copia `src` y `public/data` (bot/Dockerfile) y lee de ahí
  // al arrancar. La congelación LOREG sale de `public/data/promises.json`: con
  // el disparador mirando sólo `bot/**`, `npm run freeze:set` cambiaba el sitio
  // y el bot seguía difundiendo en campaña con la imagen de antes. La lista se
  // DERIVA de lo que bot/src lee y de lo que importa fuera de bot/.
  it('se dispara también cuando cambia lo que el bot lee fuera de bot/', () => {
    const fuera = leidoFueraDeBot()
    // Si el detector dejara de casar, esto aprobaría sin mirar nada.
    expect(fuera).toContain('public/data/promises.json')
    const despliegue = workflows.filter(
      (w) => DESPLIEGA.test(w.texto) && /^\s*push:/m.test(w.texto),
    )
    const faltan = fuera.filter((r) => !despliegue.some((w) => w.texto.includes(`'${r}'`)))
    expect(faltan, 'cambian el bot en producción y no lo redespliegan').toEqual([])
  })

  // Un despliegue que no puede autenticarse tiene que DECIRLO, no pasar en
  // verde sin haber desplegado. Es la regla 2 de DATA_INTEGRITY: una pasada
  // tiene que probar que hizo el trabajo, y «no hice nada» no lo prueba.
  it('si falta el secreto, falla en vez de fingir que desplegó', () => {
    const cubren = workflows.filter((w) => DESPLIEGA.test(w.texto))
    const comprueban = cubren.filter((w) => /FLY_API_TOKEN/.test(w.texto) && /exit 1/.test(w.texto))
    expect(
      comprueban.map((w) => w.nombre),
      'sin comprobar el secreto, un despliegue que no ocurre se ve igual que uno que sí',
    ).not.toEqual([])
  })
})

/**
 * ¿Despliega el bot SÓLO lo que pasó sus pruebas, y comprueba que quedó
 * desplegado?
 *
 * Hasta el 2026-09-27 no: `bot.yml` (tipos y pruebas) y `bot-deploy.yml` se
 * disparaban con el mismo push y corrían en paralelo, sin `needs` entre ellos,
 * así que un arranque que no compila o una prueba en rojo llegaban a Fly igual.
 * Y el despliegue acababa en `flyctl status || true`, que imprime pero no
 * compara: «en verde» decía que `flyctl deploy` terminó, no qué commit servía
 * la máquina. Lo siguiente en la cola es una migración de la base de datos, y
 * contra la única copia de los datos no se despliega a ciegas.
 *
 * Se leen con un parser de YAML: lo que corre, no lo que dice un comentario.
 */
const leidos = readdirSync(WF)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ nombre: f, doc: load(readFileSync(join(WF, f), 'utf8')) }))

const DESPLIEGA_PASO = /(?:flyctl|fly)\s+deploy\b/
const despliegaPaso = (paso) => typeof paso?.run === 'string' && DESPLIEGA_PASO.test(paso.run)

/** Ejecuta los tipos del paquete o `tsc` a pelo (el criterio de bot-tests-cubiertos). */
const TIPA = /\bnpm\s+(?:--prefix[= ]\S+\s+)?run\s+typecheck\b|\btsc\b/
/** Ejecuta la suite: `npm test`, `npm run test` o vitest. */
const PRUEBA = /\bnpm\s+(?:--prefix[= ]\S+\s+)?(?:run\s+)?test\b|\bvitest\b/

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

/** Pasos que cuentan: en bot/, y que no se tragan su fallo ni cuelgan de un `if:`. */
const pasosQueCuentan = (doc, trabajo, pasos) =>
  pasos.filter(
    (p) =>
      typeof p?.run === 'string' &&
      enElBot(doc, trabajo, p) &&
      p['continue-on-error'] !== true &&
      p.if === undefined,
  )

/** ¿Estos pasos comprueban los tipos Y corren las pruebas del bot? */
function pruebanElBot(doc, trabajo, pasos) {
  if (trabajo?.['continue-on-error'] === true || trabajo?.if !== undefined) return false
  const cuentan = pasosQueCuentan(doc, trabajo, pasos)
  return cuentan.some((p) => TIPA.test(p.run)) && cuentan.some((p) => PRUEBA.test(p.run))
}

/** El workflow reutilizable del repositorio al que llama un trabajo, si acepta que lo llamen. */
function llamado(trabajo) {
  const uses = trabajo?.uses
  if (typeof uses !== 'string' || !uses.startsWith('./.github/workflows/')) return null
  const w = leidos.find((x) => `./.github/workflows/${x.nombre}` === uses)
  const on = w?.doc?.on
  const acepta = Array.isArray(on)
    ? on.includes('workflow_call')
    : typeof on === 'object' && on !== null
      ? 'workflow_call' in on
      : on === 'workflow_call'
  return acepta ? w.doc : null
}

const necesita = (trabajo) =>
  trabajo?.needs == null ? [] : Array.isArray(trabajo.needs) ? trabajo.needs : [trabajo.needs]

/**
 * ¿El despliegue espera a que pasen los tipos y las pruebas del bot? Vale que
 * el MISMO trabajo los corra antes del paso de despliegue, o que dependa (por
 * `needs`, aunque sea de segunda mano) de un trabajo que los corre, o de uno que
 * llama a un workflow reutilizable que los corre.
 */
function esperaALasPruebas(doc, idTrabajo, vistos = new Set()) {
  const trabajo = doc.jobs?.[idTrabajo]
  const pasos = trabajo?.steps ?? []
  const i = pasos.findIndex(despliegaPaso)
  if (i > 0 && pruebanElBot(doc, trabajo, pasos.slice(0, i))) return true
  for (const id of necesita(trabajo)) {
    if (vistos.has(id)) continue
    vistos.add(id)
    const previo = doc.jobs?.[id]
    if (!previo) continue
    if (pruebanElBot(doc, previo, previo.steps ?? [])) return true
    const otro = llamado(previo)
    if (otro && Object.values(otro.jobs ?? {}).some((t) => pruebanElBot(otro, t, t.steps ?? [])))
      return true
    if (esperaALasPruebas(doc, id, vistos)) return true
  }
  return false
}

/** Los trabajos que despliegan el bot, en workflows que se disparan con un push. */
const trabajosDeDespliegue = () =>
  leidos.flatMap(({ nombre, doc }) =>
    typeof doc?.on === 'object' && doc?.on !== null && 'push' in doc.on
      ? Object.entries(doc.jobs ?? {})
          .filter(([, t]) => (t?.steps ?? []).some(despliegaPaso))
          .map(([id]) => ({ nombre, doc, id }))
      : [],
  )

describe('el despliegue del bot espera a sus pruebas y comprueba lo que quedó', () => {
  it('hay un trabajo que despliega el bot con un push (si no, lo de abajo no mira nada)', () => {
    expect(trabajosDeDespliegue().length).toBeGreaterThan(0)
  })

  it('el detector distingue esperar a las pruebas del bot de no esperar', () => {
    const tipos = { run: 'npm run typecheck', 'working-directory': 'bot' }
    const pruebas = { run: 'npm test', 'working-directory': 'bot' }
    const despliegue = { run: 'flyctl deploy --remote-only' }
    const ve = (jobs) => esperaALasPruebas({ jobs }, 'deploy')
    expect(
      ve({ p: { steps: [tipos, pruebas] }, deploy: { needs: 'p', steps: [despliegue] } }),
    ).toBe(true)
    expect(ve({ deploy: { steps: [tipos, pruebas, despliegue] } })).toBe(true)
    // Sin `needs`, en paralelo: lo que había.
    expect(ve({ p: { steps: [tipos, pruebas] }, deploy: { steps: [despliegue] } })).toBe(false)
    // Las pruebas DESPUÉS de desplegar no protegen nada.
    expect(ve({ deploy: { steps: [despliegue, tipos, pruebas] } })).toBe(false)
    // Las de la RAÍZ no son las del bot.
    expect(
      ve({
        p: { steps: [{ run: 'npm run typecheck' }, { run: 'npm test' }] },
        deploy: { needs: 'p', steps: [despliegue] },
      }),
    ).toBe(false)
    // Pruebas sin tipos: el 14-09 un arranque que no compilaba pasó todas las pruebas.
    expect(ve({ p: { steps: [pruebas] }, deploy: { needs: ['p'], steps: [despliegue] } })).toBe(
      false,
    )
    // Un fallo tragado no espera a nada.
    expect(
      ve({
        p: { steps: [tipos, { ...pruebas, 'continue-on-error': true }] },
        deploy: { needs: 'p', steps: [despliegue] },
      }),
    ).toBe(false)
  })

  it('no despliega sin haber pasado los tipos y las pruebas del bot', () => {
    const sinEsperar = trabajosDeDespliegue()
      .filter(({ doc, id }) => !esperaALasPruebas(doc, id))
      .map(({ nombre, id }) => `${nombre} · ${id}`)
    expect(
      sinEsperar,
      'estos despliegues corren en paralelo con las pruebas: un bot en rojo llega a Fly igual',
    ).toEqual([])
  })

  it('le dice a la máquina qué commit lleva', () => {
    // El nombre sale de health.ts: si dejara de exportarse, lo de abajo buscaría «undefined=».
    expect(VARIABLE_VERSION).toMatch(/^[A-Z][A-Z0-9_]+$/)
    const sinVersion = trabajosDeDespliegue()
      .filter(({ doc, id }) =>
        (doc.jobs[id].steps ?? [])
          .filter(despliegaPaso)
          .every((p) => !new RegExp(`(?:--env|-e)[= ]${VARIABLE_VERSION}=`).test(p.run)),
      )
      .map(({ nombre, id }) => `${nombre} · ${id}`)
    expect(
      sinVersion,
      `el despliegue no pasa ${VARIABLE_VERSION}, así que /health no puede decir qué corre`,
    ).toEqual([])
  })

  it('después de desplegar, comprueba que /health dice ESE commit, y falla si no', () => {
    const sinComprobar = trabajosDeDespliegue()
      .filter(({ doc, id }) => {
        const pasos = doc.jobs[id].steps ?? []
        const i = pasos.findIndex(despliegaPaso)
        return !pasos.slice(i + 1).some((p) => {
          const texto = `${p?.run ?? ''}\n${JSON.stringify(p?.env ?? {})}`
          return (
            typeof p?.run === 'string' &&
            p['continue-on-error'] !== true &&
            /\/health\b/.test(texto) &&
            /github\.sha|GITHUB_SHA/.test(texto) &&
            /\bexit 1\b/.test(p.run)
          )
        })
      })
      .map(({ nombre, id }) => `${nombre} · ${id}`)
    expect(
      sinComprobar,
      '«flyctl deploy» en verde no dice qué commit sirve la máquina: compáralo con el fusionado',
    ).toEqual([])
  })
})
