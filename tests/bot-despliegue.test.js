import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'

import { VARIABLE_VERSION } from '../bot/src/services/health.ts'
import { PRUEBA, TIPA, TRAGA, enElBot } from './setup/workflows.js'

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
 * ella: `resolve(HERE, '..', '..', '..', 'public', 'data', 'x.json')` —o
 * cualquier otra ruta de la raíz, como `.automation-measurements.json`— y
 * `from '../../../src/…'`.
 */
function leidoFueraDeBot() {
  const rutas = new Set()
  for (const texto of fuentesDelBot()) {
    for (const m of texto.matchAll(
      /resolve\(HERE,\s*'\.\.',\s*'\.\.',\s*'\.\.',\s*((?:'[^']+'\s*,\s*)*'[^']+')\s*\)/g,
    ))
      rutas.add([...m[1].matchAll(/'([^']+)'/g)].map((s) => s[1]).join('/'))
    for (const m of texto.matchAll(/from '\.\.\/\.\.\/\.\.\/(src\/[^']+)'/g)) rutas.add(m[1])
  }
  return [...rutas].sort()
}

/** Lo que copia la imagen del bot desde la raíz: el origen de cada `COPY` de bot/Dockerfile. */
function copiadoEnLaImagen() {
  const dockerfile = readFileSync(join(__dirname, '..', 'bot', 'Dockerfile'), 'utf8')
  return [...dockerfile.matchAll(/^COPY\s+(?!--from)(\S+)\s+\S+\s*$/gm)].map((m) =>
    m[1].replace(/\/$/, ''),
  )
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

  // Y la imagen tiene que llevarlo. `.automation-measurements.json` vive en la
  // raíz, fuera de `src` y de `public/data`: sin su `COPY`, el bot no encontraría
  // la medición, la publicación automática se quedaría cerrada para siempre y
  // nada diría por qué (services/moderacion.ts).
  it('la imagen del bot copia todo lo que el bot lee fuera de bot/', () => {
    const fuera = leidoFueraDeBot()
    expect(fuera).toContain('.automation-measurements.json') // el control: el detector ve la raíz
    const copiado = copiadoEnLaImagen()
    expect(copiado).toContain('src') // el control: el detector lee los COPY
    const faltan = fuera.filter((r) => !copiado.some((c) => r === c || r.startsWith(`${c}/`)))
    expect(faltan, 'el bot lo lee y la imagen no lo lleva').toEqual([])
  })

  // Un despliegue que no puede autenticarse tiene que DECIRLO, no pasar en
  // verde sin haber desplegado. Es la regla 2 de DATA_INTEGRITY: una pasada
  // tiene que probar que hizo el trabajo, y «no hice nada» no lo prueba.
  //
  // Hasta el 2026-09-27 esto buscaba «FLY_API_TOKEN» y «exit 1» en cualquier
  // parte del fichero, y en cuanto el despliegue ganó un paso de comprobación
  // posterior —con su propio `exit 1`— la guarda aprobaba aunque se borrara el
  // paso del secreto. Ahora lee el YAML: un paso ANTES del despliegue, en el
  // mismo trabajo, que falla si el secreto está vacío.
  it('si falta el secreto, falla en vez de fingir que desplegó', () => {
    const despliegue = { run: 'flyctl deploy --remote-only' }
    const secreto = { run: 'if [ -z "$FLY_API_TOKEN" ]; then\n  echo falta\n  exit 1\nfi' }
    // El detector, con sus controles.
    expect(compruebaElSecreto({ steps: [secreto, despliegue] })).toBe(true)
    expect(compruebaElSecreto({ steps: [despliegue, secreto] }), 'después no sirve').toBe(false)
    expect(compruebaElSecreto({ steps: [{ ...secreto, if: 'false' }, despliegue] })).toBe(false)
    expect(compruebaElSecreto({ steps: [secreto, { ...despliegue, if: 'false' }] })).toBe(false)
    expect(compruebaElSecreto({ steps: [{ run: 'exit 1' }, despliegue] })).toBe(false)
    expect(compruebaElSecreto({ steps: [despliegue] })).toBe(false)

    const sinComprobar = trabajosDeDespliegue()
      .filter(({ doc, id }) => !compruebaElSecreto(doc.jobs[id]))
      .map(({ nombre, id }) => `${nombre} · ${id}`)
    expect(
      sinComprobar,
      'sin comprobar el secreto, un despliegue que no ocurre se ve igual que uno que sí',
    ).toEqual([])
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

/** Un `if:` que deja correr el trabajo aunque lo anterior haya fallado o se haya cancelado. */
const IGNORA_FALLOS = /\b(?:always|cancelled|failure)\s*\(/

/** Pasos que cuentan: en bot/, y que no se tragan su fallo ni cuelgan de un `if:`. */
const pasosQueCuentan = (doc, trabajo, pasos) =>
  pasos.filter(
    (p) =>
      typeof p?.run === 'string' &&
      enElBot(doc, trabajo, p) &&
      !TRAGA.test(p.run) &&
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
 *
 * No vale si el trabajo corre aunque lo anterior falle (`always()`,
 * `cancelled()`, `failure()`), ni si el trabajo de pruebas puede saltarse con un
 * `if:`: saltado, el despliegue se salta con él y el workflow sale en verde sin
 * haber probado nada.
 */
function esperaALasPruebas(doc, idTrabajo, vistos = new Set()) {
  const trabajo = doc.jobs?.[idTrabajo]
  if (!trabajo) return false
  if (typeof trabajo.if === 'string' && IGNORA_FALLOS.test(trabajo.if)) return false
  const pasos = trabajo.steps ?? []
  const i = pasos.findIndex(despliegaPaso)
  if (i > 0 && pruebanElBot(doc, trabajo, pasos.slice(0, i))) return true
  for (const id of necesita(trabajo)) {
    if (vistos.has(id)) continue
    vistos.add(id)
    const previo = doc.jobs?.[id]
    if (!previo || previo.if !== undefined) continue
    if (pruebanElBot(doc, previo, previo.steps ?? [])) return true
    const otro = llamado(previo)
    if (otro && Object.values(otro.jobs ?? {}).some((t) => pruebanElBot(otro, t, t.steps ?? [])))
      return true
    if (esperaALasPruebas(doc, id, vistos)) return true
  }
  return false
}

/** ¿Un paso ANTES del despliegue, en el mismo trabajo, falla si el secreto de Fly está vacío? */
function compruebaElSecreto(trabajo) {
  const pasos = trabajo?.steps ?? []
  const i = pasos.findIndex(despliegaPaso)
  if (i < 0 || pasos[i].if !== undefined) return false
  return pasos
    .slice(0, i)
    .some(
      (p) =>
        typeof p?.run === 'string' &&
        /-z\s+"?\$\{?FLY_API_TOKEN\}?"?/.test(p.run) &&
        /\bexit 1\b/.test(p.run) &&
        p.if === undefined &&
        p['continue-on-error'] !== true,
    )
}

/**
 * ¿Un paso DESPUÉS del despliegue pregunta a `/health` y COMPARA su `version` con
 * el commit, y falla si no coincide? Sin `if:`: un paso que puede saltarse no
 * comprueba nada. Imprimir el commit al lado de un curl no es compararlo.
 */
function compruebaLaVersion(trabajo) {
  const pasos = trabajo?.steps ?? []
  const i = pasos.findIndex(despliegaPaso)
  if (i < 0) return false
  return pasos.slice(i + 1).some((p) => {
    if (typeof p?.run !== 'string' || p.if !== undefined || p['continue-on-error'] === true)
      return false
    const texto = `${p.run}\n${JSON.stringify(p.env ?? {})}`
    return (
      /\/health\b/.test(texto) &&
      /\.version\b/.test(p.run) &&
      /github\.sha|GITHUB_SHA/.test(texto) &&
      /\bexit 1\b/.test(p.run)
    )
  })
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
    // Un fallo tragado no espera a nada, ni con `continue-on-error` ni en la línea.
    expect(
      ve({
        p: { steps: [tipos, { ...pruebas, 'continue-on-error': true }] },
        deploy: { needs: 'p', steps: [despliegue] },
      }),
    ).toBe(false)
    expect(
      ve({
        p: { steps: [tipos, { ...pruebas, run: 'npm test || true' }] },
        deploy: { needs: 'p', steps: [despliegue] },
      }),
    ).toBe(false)
    // Un despliegue que corre aunque las pruebas fallen.
    for (const si of ['always()', '!cancelled()', 'failure() || success()']) {
      expect(
        ve({
          p: { steps: [tipos, pruebas] },
          deploy: { needs: 'p', if: si, steps: [despliegue] },
        }),
        si,
      ).toBe(false)
    }
    // Por el workflow reutilizable DE VERDAD: bot.yml acepta que lo llamen y prueba el bot.
    expect(
      ve({
        p: { uses: './.github/workflows/bot.yml' },
        deploy: { needs: 'p', steps: [despliegue] },
      }),
    ).toBe(true)
    // …pero si el trabajo que lo llama puede saltarse, el despliegue se salta con él en verde.
    expect(
      ve({
        p: { if: "github.event_name == 'push'", uses: './.github/workflows/bot.yml' },
        deploy: { needs: 'p', steps: [despliegue] },
      }),
    ).toBe(false)
    // Un workflow que no acepta `workflow_call` no se puede llamar.
    expect(
      ve({
        p: { uses: './.github/workflows/e2e.yml' },
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
    const despliegue = { run: 'flyctl deploy --remote-only' }
    const compara = {
      env: { ESPERADA: '${{ github.sha }}' },
      run: 'v=$(curl -fsS "$B/health" | jq -r .version)\n[ "$v" = "$ESPERADA" ] || exit 1',
    }
    // El detector, con sus controles.
    expect(compruebaLaVersion({ steps: [despliegue, compara] })).toBe(true)
    expect(compruebaLaVersion({ steps: [compara, despliegue] }), 'antes no sirve').toBe(false)
    expect(
      compruebaLaVersion({ steps: [despliegue, { ...compara, if: "github.event_name == 'x'" }] }),
      'un paso que puede saltarse no comprueba nada',
    ).toBe(false)
    expect(
      compruebaLaVersion({
        steps: [despliegue, { run: 'curl -f "$B/health" || exit 1\necho ${{ github.sha }}' }],
      }),
      'imprimir el commit al lado de un curl no es compararlo',
    ).toBe(false)

    const sinComprobar = trabajosDeDespliegue()
      .filter(({ doc, id }) => !compruebaLaVersion(doc.jobs[id]))
      .map(({ nombre, id }) => `${nombre} · ${id}`)
    expect(
      sinComprobar,
      '«flyctl deploy» en verde no dice qué commit sirve la máquina: compáralo con el fusionado',
    ).toEqual([])
  })

  // La dirección del bot tiene una sola fuente, `WEBHOOK_URL` en bot/fly.toml. Una
  // copia a mano en el workflow se quedaría apuntando a otro sitio el día que se
  // renombre la app o se le ponga un dominio, y cada despliegue saldría en rojo.
  it('la comprobación lee la dirección del bot de bot/fly.toml, no de una copia', () => {
    const fly = readFileSync(join(__dirname, '..', 'bot', 'fly.toml'), 'utf8')
    expect(fly).toMatch(/^\s*WEBHOOK_URL\s*=\s*"https:\/\//m) // el control: la fuente existe
    for (const { doc, id } of trabajosDeDespliegue()) {
      const texto = JSON.stringify(doc.jobs[id].steps ?? [])
      expect(texto).toMatch(/bot\/fly\.toml/)
      expect(texto).toMatch(/WEBHOOK_URL/)
      expect(texto, 'una dirección escrita a mano').not.toMatch(/https:\/\/[a-z0-9.-]+\.fly\.dev/)
    }
  })

  // `workflow_dispatch` acepta cualquier rama, y el bot tiene una base de datos de
  // producción: lanzarlo desde una rama desplegaría código sin fusionar sobre ella.
  it('no despliega desde otra rama que main: lo comprueba un paso y falla', () => {
    for (const { nombre, doc, id } of trabajosDeDespliegue()) {
      const pasos = doc.jobs[id].steps ?? []
      const i = pasos.findIndex(despliegaPaso)
      const guarda = pasos
        .slice(0, i)
        .some(
          (p) =>
            typeof p?.run === 'string' &&
            p.if === undefined &&
            /GITHUB_REF|github\.ref/.test(`${p.run}${JSON.stringify(p.env ?? {})}`) &&
            /refs\/heads\/main/.test(`${p.run}${JSON.stringify(p.env ?? {})}`) &&
            /\bexit 1\b/.test(p.run),
        )
      expect(guarda, `${nombre} · ${id} despliega lo que le pidan desde cualquier rama`).toBe(true)
    }
  })

  // Un push nuevo no puede cortar un despliegue a medias: la máquina arrancaría
  // otra vez unos minutos después, y lo siguiente que corre al arrancar es una
  // migración de la base de datos. Se ponen en fila.
  it('un despliegue en curso no se cancela: se espera a que termine', () => {
    for (const { nombre, doc } of trabajosDeDespliegue()) {
      expect(doc.concurrency?.group, `${nombre} sin grupo de concurrencia`).toBeTruthy()
      expect(doc.concurrency?.['cancel-in-progress'], nombre).not.toBe(true)
    }
  })

  // Un cambio que va a disparar el despliegue —con sus pruebas por delante— tiene
  // que tener también su veredicto en la PR, no descubrirlo en main.
  it('las pruebas del bot corren en las PR que tocan lo que el bot lee fuera de bot/', () => {
    const fuera = leidoFueraDeBot()
    expect(fuera).toContain('public/data/promises.json') // el control
    const bot = leidos.find((w) => w.nombre === 'bot.yml')?.doc
    const rutas = bot?.on?.pull_request?.paths ?? []
    const faltan = fuera.filter((r) => !rutas.includes(r))
    expect(faltan, 'una PR que los cambia no pasa por las pruebas del bot').toEqual([])
  })
})
