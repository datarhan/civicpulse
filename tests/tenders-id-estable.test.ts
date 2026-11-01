import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'csv-parse/sync'
import { parseRibalicitaContracts, exigeClaveDeFuente } from '../src/scraper/tenders'

/**
 * Un cambio de orden en la fuente no mueve ningún id.
 *
 * Gobierto repite el `id` en las filas de un mismo expediente —un SDA lleva
 * decenas de contratos derivados— y el parser las desempataba con `#1`, `#2`…
 * según salían. La consulta es `select * from contratos` sin `ORDER BY`, así
 * que aquel número era una posición. El 30-10-2026 una fila de 4889055 pasó de
 * `#7` a `#4` y 23 ids amanecieron en otro contrato, sin perderse ninguno. Nada
 * publicado apuntó mal porque lo derivado se rehace la misma noche, pero un
 * fichero curado con uno de esos ids se habría reapuntado solo y en silencio.
 *
 * Ninguna columna de contenido sirve de clave: `permalink` se repite en 66
 * grupos, `permalink`+lote en 9, y una pareja (43/2025 BSDA) es idéntica en
 * todo salvo `contract_id`, que es lo único que distingue 814 filas de 814.
 *
 * La fixture es el CSV tal cual se descargó el 01-11-2026.
 */
const CSV = readFileSync(join(__dirname, 'fixtures', 'ribalicita_contratos_2026-11-01.csv'), 'utf8')
const CSV_SIN_COLUMNA = readFileSync(
  join(__dirname, 'fixtures', 'ribalicita_contratos_2026-04-19.csv'),
  'utf8',
)

type Fila = Record<string, string>

const FILAS = parse(CSV, {
  columns: true,
  skip_empty_lines: true,
  relax_quotes: true,
  trim: true,
}) as Fila[]
const COLUMNAS = Object.keys(FILAS[0])

const aCsv = (filas: Fila[]) =>
  [
    COLUMNAS.join(','),
    ...filas.map((f) => COLUMNAS.map((c) => `"${f[c].replaceAll('"', '""')}"`).join(',')),
  ].join('\n') + '\n'

/** Cada id con la fila a la que apunta: lo que tiene que sobrevivir al orden. */
const aQueApunta = (filas: Fila[]) =>
  Object.fromEntries(
    parseRibalicitaContracts(aCsv(filas)).map(({ id, ...fila }) => [id, JSON.stringify(fila)]),
  )

/** Barajado de Fisher-Yates con semilla: una prueba roja se tiene que poder repetir. */
function barajado(filas: Fila[], semilla: number): Fila[] {
  const out = [...filas]
  let s = semilla
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const vecesPorId = new Map<string, number>()
for (const f of FILAS) vecesPorId.set(f.id, (vecesPorId.get(f.id) ?? 0) + 1)
const repetido = (f: Fila) => f.id !== '' && (vecesPorId.get(f.id) ?? 0) > 1
const porClave = (cid: string) => FILAS.findIndex((f) => f.contract_id === cid)

describe('scraper/tenders — el id de una fila no depende de su posición', () => {
  it('mide algo: la fixture trae expedientes multifila, y el rodeo por CSV no pierde filas', () => {
    const multifila = FILAS.filter(repetido)
    expect(multifila.length).toBeGreaterThan(200)
    expect(new Set(multifila.map((f) => f.id)).size).toBeGreaterThan(50)
    expect(FILAS.filter((f) => f.id === '4889055')).toHaveLength(18)
    expect(new Set(FILAS.map((f) => f.contract_id)).size).toBe(FILAS.length)
    expect(aQueApunta(FILAS)).toEqual(
      Object.fromEntries(
        parseRibalicitaContracts(CSV).map(({ id, ...fila }) => [id, JSON.stringify(fila)]),
      ),
    )
  })

  it('deshacer el movimiento del 30-10 en 4889055 no mueve ningún id', () => {
    // Hoy esa fila va antes que la 10717356; el 28-10 iba justo detrás.
    const antes = [...FILAS]
    const [movida] = antes.splice(porClave('10921271'), 1)
    antes.splice(antes.indexOf(FILAS[porClave('10717356')]) + 1, 0, movida)
    expect(antes.map((f) => f.contract_id)).not.toEqual(FILAS.map((f) => f.contract_id))

    expect(aQueApunta(antes)).toEqual(aQueApunta(FILAS))
  })

  it('el orden inverso no mueve ningún id', () => {
    expect(aQueApunta([...FILAS].reverse())).toEqual(aQueApunta(FILAS))
  })

  it.each([1, 7, 2026])('un barajado entero (semilla %i) no mueve ningún id', (semilla) => {
    expect(aQueApunta(barajado(FILAS, semilla))).toEqual(aQueApunta(FILAS))
  })

  it('dentro de un expediente multifila, el sufijo es la clave de fila de la fuente', () => {
    const contracts = parseRibalicitaContracts(CSV)
    const multifila = FILAS.flatMap((f, i) => (repetido(f) ? [[f, contracts[i]] as const] : []))
    expect(multifila.length).toBeGreaterThan(200)
    for (const [f, c] of multifila) expect(c.id).toBe(`${f.id}#${f.contract_id}`)
  })

  it('un expediente multifila no conserva el id a secas: lo viejo cuelga, no se reapunta', () => {
    const ids = new Set(parseRibalicitaContracts(CSV).map((c) => c.id))
    for (const f of FILAS.filter(repetido)) expect(ids.has(f.id)).toBe(false)
  })

  it('un id que no se repite queda como estaba, también el de contenido', () => {
    const contracts = parseRibalicitaContracts(CSV)
    const sueltas = FILAS.flatMap((f, i) => (repetido(f) ? [] : [[f, contracts[i]] as const]))
    expect(sueltas.length).toBeGreaterThan(500)
    for (const [f, c] of sueltas) {
      if (f.id) expect(c.id).toBe(f.id)
      else expect(c.id).toMatch(/^auto-[0-9a-z]+$/)
    }
  })

  it('una pareja idéntica salvo `contract_id` son dos ids, y no por su posición', () => {
    const [una, otra] = ['8998505', '9062945'].map((cid) => FILAS[porClave(cid)])
    const { contract_id: _a, ...restoUna } = una
    const { contract_id: _b, ...restoOtra } = otra
    expect(restoUna).toEqual(restoOtra)

    const ids = parseRibalicitaContracts(CSV).map((c) => c.id)
    expect(ids).toContain('1794430#8998505')
    expect(ids).toContain('1794430#9062945')
  })

  it('ningún id se repite', () => {
    const ids = parseRibalicitaContracts(CSV).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('scraper/tenders — una fila multifila sin `contract_id`', () => {
  const hermanas = FILAS.filter((f) => f.id === '4889055').slice(0, 3)
  const sinClave = hermanas.map((f, i) => (i === 0 ? { ...f, contract_id: '' } : f))

  it('toma la clave de su contenido: ni una posición, ni un `undefined`', () => {
    const [primera] = parseRibalicitaContracts(aCsv(sinClave))
    expect(primera.id).toMatch(/^4889055#auto-[0-9a-z]+$/)
  })

  it('tampoco ella depende del orden', () => {
    expect(aQueApunta([...sinClave].reverse())).toEqual(aQueApunta(sinClave))
  })
})

describe('scraper/tenders — exigeClaveDeFuente', () => {
  it('deja pasar el registro de hoy', () => {
    expect(() => exigeClaveDeFuente(parseRibalicitaContracts(CSV))).not.toThrow()
  })

  it('deja pasar unas pocas filas sin clave: no tumba la noche por ellas', () => {
    const pocas = FILAS.map((f, i) => (repetido(f) && i < 100 ? { ...f, contract_id: '' } : f))
    const contratos = parseRibalicitaContracts(aCsv(pocas))
    expect(contratos.filter((c) => c.id.includes('#auto-')).length).toBeGreaterThan(0)
    expect(() => exigeClaveDeFuente(contratos)).not.toThrow()
  })

  it('para la pasada si la columna desaparece: re-teclearía todo lo multifila de golpe', () => {
    const contratos = parseRibalicitaContracts(CSV_SIN_COLUMNA)
    expect(() => exigeClaveDeFuente(contratos)).toThrow(/contract_id/)
  })
})
