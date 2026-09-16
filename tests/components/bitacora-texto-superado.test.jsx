/**
 * La bitácora de correcciones marcaba el texto retirado SÓLO con
 * `text-decoration: line-through`, y un estilo no existe en texto plano: el
 * rastreador, el lector de pantalla, el copia-pega y la revisión lectora ven la
 * frase vieja y la nueva pegadas, sin nada que diga cuál rige.
 *
 * La regla ya estaba escrita en este repositorio —`src/scraper/pleno-finding.ts`,
 * bloque REDACTION: «line-through is a style, not a redaction, and the crawler,
 * the screen reader and the copy-paste all still get the words»—, pero sólo la
 * aplicaba el camino de la redacción. La bitácora ordinaria, no.
 *
 * Lo enseñó la revisión lectora del 16-09-2026 sobre /hallazgos: leyó dentro de
 * la bitácora el sumario SUPERADO de `f-2025-12-01-cit-66cd62` —el del
 * 09-08-2026, que citaba de la transcripción sólo «El plan rehabilita más de
 * 900.000 euros»— como si fuera lo que la página afirma hoy, y señaló una
 * contradicción con la cita de al lado. En texto plano la contradicción es real,
 * y vuelve con CADA corrección de sumario mientras el único marcador sea un
 * estilo.
 *
 * Por eso todo se afirma sobre `textContent`: es exactamente lo que ven los
 * cuatro lectores de arriba.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  BitacoraCorrecciones,
  ROTULO_TEXTO_RETIRADO,
  ROTULO_TEXTO_VIGENTE,
} from '../../src/components/BitacoraCorrecciones'
import { FindingDetailCard } from '../../src/pages/Hallazgos'
import { CorrectionLog } from '../../src/pages/AgenteReporte'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'

const ROOT = join(__dirname, '..', '..')
const FINDINGS = JSON.parse(readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'))
const PROVENANCE = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
)

const realFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/data/finding-quote-provenance.json')) {
      return new Response(JSON.stringify(PROVENANCE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }
  invalidateSnapshots()
})

afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

/** Lo que lee quien no ve los estilos. */
const plano = (container) => container.textContent.replace(/\s+/g, ' ')

/**
 * El trozo donde las dos versiones EMPIEZAN a diferir. Una corrección de sumario
 * suele cambiar una frase dentro de un párrafo que por delante y por detrás es
 * idéntico, así que buscar el principio o el final emparejaría la versión
 * equivocada. Esto sale de los datos, no de una cadena escrita a mano.
 */
const trozoDistintivo = (a, b) => {
  let i = 0
  while (i < a.length && a[i] === b[i]) i += 1
  return a.slice(i, i + 40)
}

/** Una ficha real con bitácora, y dentro una corrección que de verdad cambió algo. */
const conBitacora = FINDINGS.items.find((f) =>
  (f.corrections ?? []).some((c) => c.original && c.corrected && c.original !== c.corrected),
)
const correccion = (conBitacora?.corrections ?? []).find(
  (c) => c.original && c.corrected && c.original !== c.corrected,
)

describe('la bitácora dice en TEXTO cuál es el texto retirado y cuál el vigente', () => {
  it('los datos traen una ficha corregida de verdad (el control de la medición)', () => {
    expect(conBitacora, 'ninguna ficha publicada tiene bitácora').toBeTruthy()
    expect(correccion, 'ninguna corrección cambia el texto').toBeTruthy()
    expect(trozoDistintivo(correccion.original, correccion.corrected).length).toBeGreaterThan(0)
    expect(trozoDistintivo(correccion.corrected, correccion.original).length).toBeGreaterThan(0)
  })

  it('leyendo sólo el texto, cada versión llega detrás de su rótulo', () => {
    const { container } = render(<BitacoraCorrecciones correcciones={[correccion]} />)
    const texto = plano(container)

    const iRetirado = texto.indexOf(ROTULO_TEXTO_RETIRADO)
    const iVigente = texto.indexOf(ROTULO_TEXTO_VIGENTE)
    const iOriginal = texto.indexOf(trozoDistintivo(correccion.original, correccion.corrected))
    const iCorregido = texto.indexOf(trozoDistintivo(correccion.corrected, correccion.original))

    expect(iRetirado, 'no hay rótulo de texto retirado').toBeGreaterThanOrEqual(0)
    expect(iVigente, 'no hay rótulo de texto vigente').toBeGreaterThanOrEqual(0)
    expect(iOriginal, 'el texto retirado no se publica').toBeGreaterThanOrEqual(0)
    expect(iCorregido, 'el texto vigente no se publica').toBeGreaterThanOrEqual(0)

    expect(iRetirado).toBeLessThan(iOriginal)
    expect(iOriginal).toBeLessThan(iVigente)
    expect(iVigente).toBeLessThan(iCorregido)
  })

  it('el texto retirado va en <del>, que es semántico y no sólo un estilo', () => {
    const { container } = render(<BitacoraCorrecciones correcciones={[correccion]} />)
    const del = container.querySelector('del')
    expect(del, 'el texto retirado no está en <del>').toBeTruthy()
    expect(del.textContent).toContain(trozoDistintivo(correccion.original, correccion.corrected))
  })

  it('con varias correcciones, cada una lleva su par de rótulos', () => {
    const varias = FINDINGS.items.find((f) => (f.corrections ?? []).length > 1)
    expect(varias, 'ninguna ficha acumula dos correcciones').toBeTruthy()
    const { container } = render(<BitacoraCorrecciones correcciones={varias.corrections} />)
    const texto = plano(container)
    const cuenta = (aguja) => texto.split(aguja).length - 1
    expect(cuenta(ROTULO_TEXTO_RETIRADO)).toBe(varias.corrections.length)
    expect(cuenta(ROTULO_TEXTO_VIGENTE)).toBe(varias.corrections.length)
  })

  it('la ficha de /hallazgos la monta de verdad, no sólo el componente suelto', async () => {
    const { container } = render(
      <FindingDetailCard f={conBitacora} permalink={`#${conBitacora.id}`} />,
    )
    await waitFor(() => {
      expect(plano(container)).toContain(ROTULO_TEXTO_RETIRADO)
    })
    expect(plano(container)).toContain(ROTULO_TEXTO_VIGENTE)
  })
  it('la bitácora del informe del agente rotula igual, y ahí se nombra a personas', () => {
    // Cuarta copia del mismo registro, en /laboratorio/agentes/:id. Separaba las
    // dos versiones con una flecha: un símbolo, no una palabra.
    const { container } = render(<CorrectionLog corrections={[correccion]} />)
    const texto = plano(container)
    expect(texto).toContain(ROTULO_TEXTO_RETIRADO)
    expect(texto).toContain(ROTULO_TEXTO_VIGENTE)
    expect(container.querySelector('del'), 'el texto retirado no está en <del>').toBeTruthy()
  })
})

describe('ningún componente deja el texto superado marcado sólo con CSS', () => {
  const fuentes = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? fuentes(join(dir, e.name))
        : /\.(jsx|js)$/.test(e.name)
          ? [join(dir, e.name)]
          : [],
    )

  /**
   * Se quitan los comentarios antes de buscar, como hace
   * `tests/prepush-range.test.js` por la misma razón: el texto que EXPLICA la
   * regla cita la forma prohibida, y si no se quitan, la explicación se delata a
   * sí misma.
   */
  const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('no queda ningún line-through en el código de src/, y se ha mirado el árbol entero', () => {
    const ficheros = fuentes(join(ROOT, 'src'))
    expect(ficheros.length, 'no ha leído el código de la interfaz').toBeGreaterThan(20)
    const culpables = ficheros
      .filter((f) => sinComentarios(readFileSync(f, 'utf8')).includes('line-through'))
      .map((f) => f.slice(ROOT.length + 1))
    expect(culpables).toEqual([])
  })

  it('la criba mide algo: con los comentarios dentro, el árbol sí trae coincidencias', () => {
    // Control de la medición. Sin él, un `sinComentarios` que vaciara el fichero
    // entero dejaría la prueba de arriba verde sin haber leído nada.
    const conComentarios = fuentes(join(ROOT, 'src')).filter((f) =>
      readFileSync(f, 'utf8').includes('line-through'),
    )
    expect(conComentarios.length).toBeGreaterThan(0)
  })
})
