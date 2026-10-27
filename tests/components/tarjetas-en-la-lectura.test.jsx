/**
 * Dónde acaba una tarjeta y empieza la siguiente, en el texto que lee la revisión.
 *
 * El 26-10-2026 la revisión lectora señaló /plenos/c8kr44 con una cita que
 * empezaba en el pie de una declaración —«Fuentes comprobadas: contratos» y su
 * «Veredicto: subido por una persona · firmado por …»— y seguía con la cabecera
 * de la siguiente —«Afirmación numérica / 2025-09-08 / 92 €»—, y concluyó que
 * la cabecera de UNA tarjeta nombraba una fuente y su resumen cuatro. Eran dos
 * tarjetas, c8kr44-142-cit-b8c30e y c8kr44-008-afi-abc45b, cada una en su
 * recuadro. La revisión leía `innerText`, que aplana los recuadros en una tira
 * de líneas: el borde que separa dos tarjetas no es texto, así que no llegaba.
 * Y no era la primera vez: las notas del curador ya decían que, cuando la cita
 * señalada es cierta, el problema suele estar en la tarjeta de al lado.
 *
 * Aquí se montan tarjetas de verdad —el `Card` de Primitives, el mismo que
 * pintan ClaimLedger, PlenoFindings y Hallazgos— y se leen como la revisión,
 * por sus dos caminos: la página entera y lo que va tras la barra de pestañas.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { Card } from '../../src/components/Primitives'
import { MARCAS_DE_TARJETA, textoConTarjetas } from '../../src/scraper/reader-review'

afterEach(cleanup)

const lineas = (t) =>
  t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/** Lo que va entre la última línea de una tarjeta y la primera de la siguiente. */
function entre(texto, ultimaDeUna, primeraDeOtra) {
  const ls = lineas(texto)
  const a = ls.indexOf(ultimaDeUna)
  const b = ls.indexOf(primeraDeOtra)
  expect(a, `no está «${ultimaDeUna}»: no hay nada que medir`).toBeGreaterThanOrEqual(0)
  expect(b, `«${primeraDeOtra}» no va detrás`).toBeGreaterThan(a)
  return ls.slice(a + 1, b)
}

/** Dos tarjetas seguidas con la forma de las de c8kr44: el pie de una, la cabecera de la otra. */
function DosTarjetas() {
  return (
    <>
      <Card>
        <div>Fuentes comprobadas: contratos</div>
        <div>Veredicto: subido por una persona</div>
      </Card>
      <Card>
        <div>Afirmación numérica</div>
        <div>Fuentes comprobadas: contratos · presupuesto · subvenciones · empleo</div>
      </Card>
    </>
  )
}

/** Una barra de pestañas y, tras ella, el panel abierto, como /plenos/:id. */
function ConPestanas({ children }) {
  return (
    <main>
      <h1>Pleno</h1>
      <div>
        <div role="tablist">
          <button data-pestana="resumen">Resumen</button>
          <button data-pestana="declaraciones">Declaraciones contrastadas</button>
        </div>
        <div>{children}</div>
      </div>
    </main>
  )
}

describe('la frontera entre dos tarjetas llega al texto que lee la revisión', () => {
  it('`innerText` a secas —lo que leía hasta ahora— pega el pie de una a la cabecera de la otra', () => {
    // Lo que motiva todo lo de abajo, y sigue siendo cierto después: el borde
    // de un recuadro no es texto. Por eso la frontera hay que escribirla.
    render(
      <main>
        <DosTarjetas />
      </main>,
    )
    expect(
      entre(document.body.innerText, 'Veredicto: subido por una persona', 'Afirmación numérica'),
    ).toEqual([])
  })

  it('la página entera: entre el pie de una y la cabecera de la siguiente van las dos marcas', () => {
    render(
      <main>
        <DosTarjetas />
      </main>,
    )
    const texto = textoConTarjetas({ ambito: 'pagina', marcas: MARCAS_DE_TARJETA })
    expect(entre(texto, 'Veredicto: subido por una persona', 'Afirmación numérica')).toEqual([
      MARCAS_DE_TARJETA.fin,
      MARCAS_DE_TARJETA.inicio,
    ])
  })

  it('tras la barra de pestañas, el camino por el que llegó la cita de c8kr44, igual', () => {
    render(
      <ConPestanas>
        <DosTarjetas />
      </ConPestanas>,
    )
    const texto = textoConTarjetas({ ambito: 'tras-la-barra', marcas: MARCAS_DE_TARJETA })
    expect(lineas(texto)).not.toContain('Pleno')
    expect(entre(texto, 'Veredicto: subido por una persona', 'Afirmación numérica')).toEqual([
      MARCAS_DE_TARJETA.fin,
      MARCAS_DE_TARJETA.inicio,
    ])
  })

  it('cada tarjeta abre y cierra: lo que va fuera de todas no se lee como parte de la última', () => {
    render(
      <main>
        <h2>Declaraciones</h2>
        <DosTarjetas />
        <p>Metodología del contraste</p>
      </main>,
    )
    const ls = lineas(textoConTarjetas({ ambito: 'pagina', marcas: MARCAS_DE_TARJETA }))
    const { inicio, fin } = MARCAS_DE_TARJETA
    expect(ls).toEqual([
      'Declaraciones',
      inicio,
      'Fuentes comprobadas: contratos',
      'Veredicto: subido por una persona',
      fin,
      inicio,
      'Afirmación numérica',
      'Fuentes comprobadas: contratos · presupuesto · subvenciones · empleo',
      fin,
      'Metodología del contraste',
    ])
  })

  it('una tarjeta dentro de otra lleva sus marcas dentro de las de la de fuera', () => {
    render(
      <Card>
        <div>Fuera, antes</div>
        <Card>
          <div>Dentro</div>
        </Card>
        <div>Fuera, después</div>
      </Card>,
    )
    const { inicio, fin } = MARCAS_DE_TARJETA
    expect(lineas(textoConTarjetas({ ambito: 'pagina', marcas: MARCAS_DE_TARJETA }))).toEqual([
      inicio,
      'Fuera, antes',
      inicio,
      'Dentro',
      fin,
      'Fuera, después',
      fin,
    ])
  })

  it('una tarjeta oculta no deja marcas: no se lee lo que no se ve', () => {
    render(
      <main>
        <Card style={{ display: 'none' }}>
          <div>Oculta</div>
        </Card>
        <Card>
          <div>Visible</div>
        </Card>
      </main>,
    )
    const { inicio, fin } = MARCAS_DE_TARJETA
    expect(lineas(textoConTarjetas({ ambito: 'pagina', marcas: MARCAS_DE_TARJETA }))).toEqual([
      inicio,
      'Visible',
      fin,
    ])
  })

  it('leer no deja nada en la página: las marcas se quitan en la misma lectura', () => {
    // React no puede ver nodos ajenos dentro de los suyos entre dos renders: la
    // revisión pulsa pestañas después de leer, y un nodo que se quedara
    // quedaría dentro del árbol que React reconcilia.
    render(
      <ConPestanas>
        <DosTarjetas />
      </ConPestanas>,
    )
    const antes = document.body.innerHTML
    textoConTarjetas({ ambito: 'pagina', marcas: MARCAS_DE_TARJETA })
    textoConTarjetas({ ambito: 'tras-la-barra', marcas: MARCAS_DE_TARJETA })
    expect(document.body.innerHTML).toBe(antes)
  })
})

describe('qué es una tarjeta: un atributo, no la clase con que se pinta', () => {
  it('el `Card` de Primitives lleva `data-tarjeta`', () => {
    const { container } = render(<Card>texto</Card>)
    expect(container.querySelectorAll('[data-tarjeta]')).toHaveLength(1)
  })

  /**
   * Hay cajas que se pintan con la clase `cp-card` a mano, sin el componente.
   * Para la revisión son tarjetas igual —el lector ve el mismo recuadro—, así
   * que llevan el mismo atributo. Se mira el fuente y no la página porque
   * montar cada una pide sus datos; contar basta para que una caja nueva sin
   * atributo no pase callada.
   */
  it('cada caja pintada a mano con `cp-card` lleva también `data-tarjeta`', () => {
    const raiz = join(__dirname, '..', '..', 'src')
    const ficheros = []
    const recorre = (dir) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n)
        if (statSync(p).isDirectory()) recorre(p)
        else if (/\.(jsx|tsx|js)$/.test(n)) ficheros.push(p)
      }
    }
    recorre(raiz)
    let cajas = 0
    const sinAtributo = []
    for (const f of ficheros) {
      const fuente = readFileSync(f, 'utf8')
      const conClase = [...fuente.matchAll(/className=\{?["'`]([^"'`]*)["'`]/g)].filter(([, c]) =>
        /(^|\s)cp-card(?![\w-])/.test(c),
      ).length
      const conAtributo = [...fuente.matchAll(/\bdata-tarjeta=/g)].length
      cajas += conClase
      if (conAtributo < conClase) {
        sinAtributo.push(`${relative(raiz, f)}: ${conClase} caja(s), ${conAtributo} atributo(s)`)
      }
    }
    expect(cajas, 'ninguna caja a mano: la búsqueda no mide nada').toBeGreaterThan(0)
    expect(sinAtributo).toEqual([])
  })
})
