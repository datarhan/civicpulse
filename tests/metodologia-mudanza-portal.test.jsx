/**
 * /metodologia#mudanza-portal fecha cada lectura con la página que leyó.
 *
 * La sección cuenta dos páginas del portal del ayuntamiento, y la revisión
 * lectora del 30-09-2026 las leyó como una: «leyó 67 veces entre el 19 de junio
 * y el 1 de septiembre» y, un párrafo después, «el 2 de septiembre, en la última
 * lectura de la página anterior». Las dos fechas son ciertas y no son de la
 * misma página. Las 67 son de «Datos biográficos del alcalde/sa y concejales»,
 * del portal de transparencia (fuente `cv` de transparency-docs.json); el 2 es
 * el `generatedAt` de officials.json, la página del padrón. El puente es la
 * lectura del 2 de la de currículos, que falló en la misma pasada en la que la
 * del padrón contestó.
 *
 * Y la frase vecina sí estaba mal: «El raspado nocturno falló desde el 2 de
 * septiembre». La nocturna del 2 salió con `Scrape rc: 0` y leyó la página
 * vieja; las cinco rojas de la lista real de tests/health-monitor.test.ts son de
 * después de ese verde.
 *
 * Las lecturas son historia y van copiadas aquí, como la lista real de
 * tests/health-monitor.test.ts: viven en los commits, no en un fichero que la
 * página lea. Medidas el 04-10-2026 así:
 *
 *   git log --format=%h -- public/data/transparency-docs.json, y de cada commit
 *     la fuente `cv` (ok, count, url) con el `generatedAt` del fichero: 67
 *     lecturas buenas, siempre los mismos 17 documentos, y `ok: false` en la del
 *     2026-09-02T08:54:45Z (b38676c0);
 *   git show b38676c0:public/data/officials.json → `generatedAt`
 *     2026-09-02T08:54:41Z, `source` la dirección vieja del padrón.
 *
 * Se lee el texto RENDERIZADO, como en metodologia-citas-contraste.test.jsx: los
 * comentarios «Decía …» del JSX guardan a propósito la redacción vieja.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import Metodologia from '../src/pages/Metodologia'
import { invalidateSnapshots } from '../src/lib/snapshot-store'

const OFFICIALS = readFileSync(join(__dirname, '..', 'public/data/officials.json'), 'utf8')

/** Lo medido sobre la historia del repositorio (ver la cabecera). */
const LECTURAS = {
  curriculos: {
    url: 'https://www.ribarroja.es/es/portal_de_transparencia/informacion_sobre_la_corporacion_municipal/datos_biograficos_del_alcalde_sa_y_concejales/contenidos/864708/0835919',
    buenas: 67,
    primera: '2026-06-19',
    ultima: '2026-09-01',
    fallida: '2026-09-02',
  },
  padron: {
    url: 'https://www.ribarroja.es/es/ayuntamiento/corporacion_municipal',
    ultima: '2026-09-02',
  },
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** «2026-09-01» → «1 de septiembre», como lo escribe la prosa. */
function fecha(iso) {
  const [, mes, dia] = iso.split('-').map(Number)
  return `${dia} de ${MESES[mes - 1]}`
}

/** Sin el lookbehind, «2 de septiembre» casaría dentro de «12 de septiembre». */
const menciona = (texto, iso) => new RegExp(`(?<!\\d)${fecha(iso)}\\b`).test(texto)

const enFrases = (parrafo) => parrafo.split(/(?<=\.)\s+/)

const realFetch = globalThis.fetch
let parrafos = []
let frases = []

beforeAll(async () => {
  globalThis.fetch = async (url) =>
    String(url).endsWith('/data/officials.json')
      ? new Response(OFFICIALS, { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('not found', { status: 404 })
  invalidateSnapshots()
  const { container } = render(<Metodologia />)
  // Sin el padrón la sección no se monta: esperarla garantiza que se lee.
  await waitFor(() => {
    expect(container.querySelector('#mudanza-portal')).not.toBeNull()
  })
  parrafos = [...container.querySelector('#mudanza-portal').querySelectorAll('p')].map((p) =>
    p.textContent.replace(/\s+/g, ' ').trim(),
  )
  frases = parrafos.flatMap(enFrases)
})

afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

describe('/metodologia#mudanza-portal fecha cada lectura con su página', () => {
  it('parte de la premisa medida: dos páginas, y sus últimas lecturas buenas no coinciden', () => {
    expect(LECTURAS.curriculos.url).not.toBe(LECTURAS.padron.url)
    expect(LECTURAS.curriculos.ultima).not.toBe(LECTURAS.padron.ultima)
    // El puente existe: la lectura que falta en la cuenta de currículos es la
    // de la misma pasada en la que el padrón todavía contestó.
    expect(LECTURAS.curriculos.fallida).toBe(LECTURAS.padron.ultima)
  })

  it('lee la sección entera (si no, las demás pasarían sin mirar nada)', () => {
    expect(parrafos.length).toBeGreaterThanOrEqual(5)
    expect(frases.some((f) => f.includes(`${LECTURAS.curriculos.buenas} veces`))).toBe(true)
    expect(frases.some((f) => /correo/.test(f))).toBe(true)
  })

  it('las 67 lecturas nombran su página, que no es la del padrón', () => {
    const f = frases.find((x) => x.includes(`${LECTURAS.curriculos.buenas} veces`))
    expect(f).toMatch(/Datos biográficos/)
    expect(f).toMatch(/portal de transparencia/)
    expect(f).toMatch(/no vivían en la página del padrón/i)
    expect(menciona(f, LECTURAS.curriculos.primera)).toBe(true)
    expect(menciona(f, LECTURAS.curriculos.ultima)).toBe(true)
  })

  it('dice por qué las 67 acaban un día antes que la última lectura del padrón', () => {
    const parrafo = parrafos.find((p) => p.includes(`${LECTURAS.curriculos.buenas} veces`))
    const puente = enFrases(parrafo).find((x) => menciona(x, LECTURAS.curriculos.fallida))
    expect(puente).toMatch(/falló/)
    expect(puente).toMatch(/padrón/)
  })

  it('la última lectura que cuenta el correo es la de la página del padrón, y lo dice', () => {
    const f = frases.find((x) => /correo/.test(x) && menciona(x, LECTURAS.padron.ultima))
    expect(f).toBeDefined()
    expect(f).toMatch(/padrón/)
    expect(f).not.toMatch(/página anterior/)
  })

  it('no hace fallar al raspado el día en que leyó la página del padrón por última vez', () => {
    const fallaEseDia = new RegExp(`falló\\s+(?:desde\\s+)?el\\s+${fecha(LECTURAS.padron.ultima)}`)
    expect(frases.filter((x) => fallaEseDia.test(x))).toEqual([])
    const ultimaBuena = frases.filter(
      (x) => /raspado/.test(x) && /última vez/.test(x) && menciona(x, LECTURAS.padron.ultima),
    )
    expect(ultimaBuena).toHaveLength(1)
  })
})
