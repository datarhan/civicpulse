import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import { ClaimLedger } from '../src/components/ClaimLedger'
import { gateForDisplay, sortSignalFirst } from '../src/lib/claim-ledger'
import { CORPUS_IDS, corpusReales } from '../src/scraper/claim-verdicts'

/**
 * La explicación bajo la cita no dice que se buscó donde la tarjeta dice que no
 * consta búsqueda.
 *
 * El verificador determinista escribía la MISMA frase en todo `sin-datos` que
 * no encontraba nada, mirara lo que mirara: «No se encontró registro en tenders
 * / BDNS / presupuesto. El claim puede ser cierto pero no está atestiguado por
 * los datos abiertos publicados.» (claim-verifier.ts). Su `checkedAgainst`, en
 * cambio, sólo apunta un corpus cuando su comparador corre de verdad, y desde
 * #175 la tarjeta lo imprime debajo como «Fuentes comprobadas». Las dos líneas
 * se contradecían en la misma tarjeta.
 *
 * Medido el 29-09-2026 en /plenos/k4olcs, pestaña «Declaraciones
 * contrastadas», sobre las 20 primeras tarjetas: 8 imprimían la frase encima de
 * «Fuentes comprobadas: ninguna» —afirma una búsqueda que la tarjeta dice que
 * no hubo—, 10 encima de «no constan» —la búsqueda no consta, que no es lo
 * mismo que ninguna— y 1 encima de «tenders · tenders-ted», que no son las tres
 * que nombra. La revisión lectora lo señaló como `misleading` ahí y en
 * /departamentos/urbanismo. Sobre los 4.964 trozos servidos, 4.243 tarjetas
 * llevaban la frase y sólo 463 tenían detrás los corpus que nombra.
 *
 * Se pinta cada trozo servido con el componente de verdad, como lo pinta la
 * pestaña de /plenos/:id, y se lee cada tarjeta: lo que dice bajo la cita y lo
 * que lista «Fuentes comprobadas». Los ítems son los servidos, no una forma
 * recortada: así es como una prueba sigue verde mientras la página hace otra
 * cosa.
 *
 * Fuera de esta prueba, a propósito: la otra frase del verificador para un
 * `sin-datos` con fila CONTRATO («El objeto citado aparece en un expediente
 * municipal…»). No dice qué se consultó, sino que ese expediente —que la
 * tarjeta enseña— comparte objeto con la cita. Que su línea diga «ninguna» es
 * otra avería (el camino que la escribe no anota `tenders`), y va aparte.
 */

const TROZOS = join(__dirname, '..', 'public/data/pleno-claims')

const trozos = readdirSync(TROZOS)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => JSON.parse(readFileSync(join(TROZOS, f), 'utf8')))

const ROTULO = 'Fuentes comprobadas:'
const SIN_CORPUS = new Set(['ninguna', 'no constan'])

/**
 * Lo que dice que se buscó. Es una alarma, no una definición: si salta en una
 * tarjeta cuya línea dice «ninguna» o «no constan», alguien tiene que leerla.
 * Medida contra lo servido el 29-09-2026: no la dispara ninguna de las
 * explicaciones del motor ni de los curadores que caen sobre esas dos líneas.
 */
const AFIRMA_BUSQUEDA =
  /no se (ha )?encontr|registro en\b|se (consult|cotej|busc)|atestiguad[oa] por|datos abiertos publicados/i

/**
 * Las fuentes que la explicación dice haber mirado: lo que va tras «registro
 * en», hasta el punto o el «que». `null` si no nombra ninguna.
 */
function fuentesNombradas(explicacion) {
  const m = explicacion.match(/registro en (.+?)(?: que |\.)/i)
  if (!m) return null
  return m[1]
    .split(/\s*(?:,|\/|·|\by\b|\bni\b)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Una tarjeta, leída por partes. La forma que se da por hecha —cabecera con la
 * cita, explicación, evidencia si la hay, y la línea de fuentes al final— se
 * comprueba en cada tarjeta: si cambiara, la prueba se rompe en vez de leer
 * otra cosa y pasar.
 */
function leerTarjeta(card) {
  const partes = [...card.children]
  const [cabecera, explicacion] = partes
  const linea = partes.at(-1)
  const fuentes = [...linea.children].find((s) => s.textContent.startsWith(ROTULO))
  expect(cabecera.querySelector('blockquote'), 'la cabecera lleva la cita').not.toBeNull()
  expect(fuentes, 'la última parte es la línea de fuentes').toBeDefined()
  expect(explicacion.querySelector('blockquote')).toBeNull()
  expect(explicacion).not.toBe(linea)
  return {
    cita: cabecera.querySelector('blockquote').textContent,
    explicacion: explicacion.textContent,
    fuentes: fuentes.textContent.slice(ROTULO.length).trim(),
  }
}

/** Pinta `items` como la pestaña de /plenos/:id y devuelve cada tarjeta leída. */
function pintarYLeer(items, limit) {
  // La tarjeta pide tenders.json para el puente de importes
  // (src/components/PuenteDeImporte.jsx). Aquí no se mide eso: un 404 lo calla
  // sin salir a la red. Dentro de cada pintado, porque la guarda de red
  // (tests/setup/no-network.ts) se reinstala antes de cada prueba.
  installFetchMock({})
  const { container, unmount } = render(
    <MemoryRouter>
      <ClaimLedger items={items} limit={limit} showSummary />
    </MemoryRouter>,
  )
  const tarjetas = [...container.querySelectorAll('.cp-card')].map(leerTarjeta)
  unmount()
  return tarjetas
}

/**
 * Todas las tarjetas servidas, con la fila de la que salen. El orden de las
 * tarjetas es el de la página (puerta y orden por señal), y la cita de cada una
 * se coteja con la de su fila: si no casan, la prueba no sabe qué está leyendo.
 */
let leidas = []

beforeAll(() => {
  leidas = trozos.flatMap((trozo) => {
    const filas = sortSignalFirst(gateForDisplay(trozo.items))
    const tarjetas = pintarYLeer(trozo.items, trozo.items.length)
    expect(tarjetas).toHaveLength(filas.length)
    return tarjetas.map((t, i) => {
      expect(t.cita).toBe(`«${filas[i].claim.verbatim}»`)
      return { ...t, fila: filas[i] }
    })
  })
  // Pintar los casi cinco mil de lo servido pasa del plazo por defecto de un
  // gancho.
}, 120_000)

const describir = (t) => `${t.fila.claim.id} [${t.fuentes}] ${t.explicacion.slice(0, 90)}`

describe('lo servido: la explicación y «Fuentes comprobadas» dicen lo mismo', () => {
  it('mide algo: se leyeron tarjetas con cada una de las tres líneas', () => {
    // Lo positivo primero: sin tarjetas «ninguna» o «no constan», la guarda de
    // abajo pasaría sin haber mirado nada.
    expect(leidas.length).toBeGreaterThan(0)
    expect(leidas.some((t) => t.fuentes === 'ninguna')).toBe(true)
    expect(leidas.some((t) => t.fuentes === 'no constan')).toBe(true)
    expect(leidas.some((t) => !SIN_CORPUS.has(t.fuentes))).toBe(true)
    expect(leidas.some((t) => t.fila.verification.verdict === 'sin-datos')).toBe(true)
  })

  it('ninguna tarjeta afirma una búsqueda sobre «ninguna» o «no constan»', () => {
    const contradichas = leidas
      .filter((t) => SIN_CORPUS.has(t.fuentes) && AFIRMA_BUSQUEDA.test(t.explicacion))
      .map(describir)
    expect(contradichas.slice(0, 5), `${contradichas.length} tarjetas`).toEqual([])
  })

  it('la explicación que nombra fuentes nombra las de la línea, y en su orden', () => {
    const nombran = leidas.filter((t) => fuentesNombradas(t.explicacion) !== null)
    // Sin ninguna que nombre fuentes, la comparación no habría comparado nada.
    expect(nombran.length).toBeGreaterThan(0)
    const distintas = nombran
      .filter((t) => fuentesNombradas(t.explicacion).join(' · ') !== t.fuentes)
      .map(describir)
    expect(distintas.slice(0, 5), `${distintas.length} tarjetas`).toEqual([])
  })

  it('lo que nombra es un corpus declarado, nunca una pasada ni un nombre suelto', () => {
    const sueltos = leidas
      .flatMap((t) => (fuentesNombradas(t.explicacion) ?? []).map((n) => [n, t]))
      .filter(([n]) => !CORPUS_IDS.includes(n))
      .map(([n, t]) => `${n} · ${describir(t)}`)
    expect(sueltos.slice(0, 5), `${sueltos.length} nombres`).toEqual([])
  })
})

describe('/plenos/k4olcs, pestaña «Declaraciones contrastadas»: las 20 que se ven', () => {
  it('ninguna de las 20 primeras contradice su línea de fuentes', () => {
    const trozo = trozos.find((t) => t.plenoId === 'k4olcs')
    expect(trozo, 'no se sirve el trozo de k4olcs').toBeDefined()
    // El `limit` de la página: lo que el lector ve sin pulsar «cargar más».
    const tarjetas = pintarYLeer(trozo.items, 20)
    expect(tarjetas).toHaveLength(20)
    // La muestra que se midió trae las tres líneas; si dejara de traerlas, esta
    // prueba ya no mira el caso que la originó.
    expect(tarjetas.some((t) => t.fuentes === 'ninguna')).toBe(true)
    expect(tarjetas.some((t) => t.fuentes === 'no constan')).toBe(true)
    expect(tarjetas.some((t) => !SIN_CORPUS.has(t.fuentes))).toBe(true)
    for (const t of tarjetas) {
      if (SIN_CORPUS.has(t.fuentes)) {
        expect(t.explicacion, t.fuentes).not.toMatch(AFIRMA_BUSQUEDA)
      } else if (fuentesNombradas(t.explicacion) !== null) {
        expect(fuentesNombradas(t.explicacion).join(' · ')).toBe(t.fuentes)
      }
    }
  })
})

describe('una explicación copiada a una verificación con otra procedencia', () => {
  it('no arrastra las fuentes de donde salió', () => {
    // Lo hace el motor: su retractación copia la verificación que recibe y
    // sustituye la lista, `{ ...r, checkedAgainst: ['verdict-engine'] }`
    // (scripts/verify-pleno-claims-engine.ts). Cuando no hubo candidatos, `r`
    // es la del determinista: su explicación viaja y su procedencia no.
    const origen = leidas.find(
      (t) =>
        t.fila.verification.verdict === 'sin-datos' &&
        t.fila.verification.evidence.length === 0 &&
        corpusReales(t.fila.verification.checkedAgainst).join(' · ') === 'tenders · tenders-ted',
    )
    expect(origen, 'no se sirve ningún sin-datos cotejado con tenders y tenders-ted').toBeDefined()
    // Lo positivo primero: en su tarjeta, la explicación nombra esas dos.
    expect(fuentesNombradas(origen.explicacion)).toEqual(['tenders', 'tenders-ted'])

    const copia = {
      ...origen.fila,
      verification: {
        ...origen.fila.verification,
        summary: origen.explicacion,
        checkedAgainst: ['verdict-engine'],
        source: 'verdict-engine',
      },
    }
    const [tarjeta] = pintarYLeer([copia], 1)
    expect(tarjeta.fuentes).toBe('no constan')
    expect(tarjeta.explicacion).not.toMatch(AFIRMA_BUSQUEDA)
  })
})
