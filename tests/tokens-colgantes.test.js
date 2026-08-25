import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Ningún `var(--token)` sin declarar, y ninguna cursiva sobre una tipografía
 * que no la tiene. Dos averías distintas con la misma firma: el navegador NO
 * avisa, la página sigue pintando, y lo que sale es plausible.
 *
 * ── 1 · el token colgante ────────────────────────────────────────────────
 * `background: var(--card)` sin `--card` declarada no es una declaración
 * inválida a medias: el navegador la descarta entera y la caja se queda
 * transparente. `color: var(--ink90)` hereda el color del padre. Las dos
 * cosas dan una página que se ve «bien» y miente sobre su jerarquía.
 *
 * Estaban las dos en producción cuando se midió esto, y con cuatro tokens:
 * `--ink90` en la bitácora de correcciones de /hallazgos —el «después» de una
 * corrección salía del mismo gris que el «antes» tachado—, `--card` en el
 * encaje declarado de /cargos, `--accent` en dos rutas de cargos y `--ok-bg`
 * en el curador.
 *
 * Ninguna suite podía verlo. `brand-tokens.test.js` compone alfas de los
 * tokens que EXISTEN; `contraste.spec.ts` sólo cazó los tres `var(--ink30)`
 * de /empleo de rebote, el día que declarar el token los encendió de golpe.
 * Un token colgante es invisible mientras siga colgando.
 *
 * Se permite el fallback explícito —`var(--x, #fff)`— porque ahí la decisión
 * está escrita y alguien la puede leer.
 *
 * ── 2 · la cursiva que no existe ─────────────────────────────────────────
 * Brandbook §03b, corrección 8 de 9. `index.html` carga
 * `Outfit:wght@400;500;600;700`, sin eje `ital`, así que un `font-style:
 * italic` hace que el navegador incline la romana por transformación
 * geométrica: contraformas deformadas, terminales rotas, peso aparente menor.
 * Había veintidós sitios, entre ellos el motivo de cada corrección publicada.
 * La cita no se inclina: se marca, y de eso se encarga `<Quote>`.
 */
const RAIZ = join(__dirname, '..')
const CSS = readFileSync(join(RAIZ, 'src/index.css'), 'utf8')

function fuentes(dir = join(RAIZ, 'src'), acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) fuentes(p, acc)
    else if (/\.(jsx?|tsx?|css)$/.test(e.name)) acc.push(p)
  }
  return acc
}

const FUENTES = fuentes()
const DECLARADOS = new Set([...CSS.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))

describe('los tokens que se usan existen', () => {
  it('el barrido miró ficheros y encontró tokens declarados', () => {
    expect(FUENTES.length, 'ningún fichero — ¿se rompió el recorrido?').toBeGreaterThan(100)
    expect(DECLARADOS.size, 'ningún token declarado — ¿cambió index.css?').toBeGreaterThan(30)
  })

  it('ningún var(--token) sin declarar y sin fallback', () => {
    const colgantes = []
    for (const p of FUENTES) {
      const txt = readFileSync(p, 'utf8')
      const lineas = txt.split('\n')
      lineas.forEach((l, i) => {
        for (const m of l.matchAll(/var\((--[\w-]+)(\s*,)?/g)) {
          if (DECLARADOS.has(m[1]) || m[2]) continue
          colgantes.push(`${relative(RAIZ, p)}:${i + 1} — ${m[1]}`)
        }
      })
    }
    expect(
      colgantes,
      'un var() sin declarar no da error: el navegador descarta la declaración ' +
        '(fondo transparente) o hereda (color del padre). Decláralo o dale fallback.',
    ).toEqual([])
  })

  it('la escala de tinta no gana un cuarto tier por la puerta de atrás', () => {
    // Los tres tiers de texto son ink / ink70 / ink50 y así lo prueba
    // brand-tokens.test.js. Aquí se vigila lo contrario: que nadie invente un
    // --ink60 o un --ink90 usándolo sin declararlo, que es como aparecieron
    // los cinco tiers que hubo que fusionar.
    const inventados = new Set()
    for (const p of FUENTES) {
      for (const m of readFileSync(p, 'utf8').matchAll(/var\((--ink\d+)/g)) {
        if (!DECLARADOS.has(m[1])) inventados.add(m[1])
      }
    }
    expect([...inventados]).toEqual([])
  })
})

describe('§03b · la cita no se inclina', () => {
  it('index.html no carga el eje ital de Outfit, así que nadie pide cursiva', () => {
    const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
    const outfit = /family=Outfit:([^&"']*)/.exec(html)
    expect(outfit, 'Outfit ya no se carga — revisa esta prueba').toBeTruthy()
    // Si algún día se carga el eje, esta prueba deja de tener sentido y hay
    // que borrarla a mano: eso es lo que se quiere, no que pase en silencio.
    expect(outfit[1]).not.toContain('ital')
  })

  it('<em> e <i> no heredan la cursiva de la hoja del navegador', () => {
    // La puerta grande, y la que se quedó abierta cuando se retiraron los
    // veintidós `fontStyle: 'italic'` del código: <em> y <i> traen
    // `font-style: italic` de la hoja del propio navegador. Sólo en
    // /metodologia había 82 elementos inclinados sintéticamente.
    const css = readFileSync(join(RAIZ, 'src/index.css'), 'utf8')
    const regla = /(^|\n)em,\s*\n\s*i\s*\{([^}]*)\}/m.exec(css)
    expect(regla, 'falta la regla que neutraliza la cursiva de <em> e <i>').toBeTruthy()
    expect(regla[2]).toMatch(/font-style:\s*normal/)
    // Y el énfasis no se pierde: pasa al peso, que Outfit sí tiene.
    expect(regla[2]).toMatch(/font-weight:\s*[5-9]00/)
  })

  it('ningún font-style: italic sobre la tipografía de interfaz', () => {
    // Se BORRAN los comentarios antes de mirar, no se saltan las líneas que
    // parecen comentario. Es la misma lección que `prepush-range.test.js`
    // lleva escrita: la prosa que explica una regla cita la forma prohibida,
    // y en un bloque `/* … */` de varias líneas sólo la primera empieza por
    // una marca de comentario. El docblock de <Quote> y el de la regla de
    // index.css nombran los dos la forma que vigilan, y las dos hacían saltar
    // esta puerta contra sí misma.
    const sinComentarios = (t) =>
      t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    const culpables = []
    for (const p of FUENTES) {
      const txt = sinComentarios(readFileSync(p, 'utf8'))
      txt.split('\n').forEach((l, i) => {
        if (/fontStyle: 'italic'|font-style:\s*italic/.test(l))
          culpables.push(`${relative(RAIZ, p)}:${i + 1}`)
      })
    }
    expect(
      culpables,
      'Outfit no tiene cursiva: el navegador inclina la romana por transformación. ' +
        'La cita se marca con <Quote>, no se inclina (brandbook §03b).',
    ).toEqual([])
  })
})
