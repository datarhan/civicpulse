import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRibalicitaContracts, type Contract } from '../src/scraper/tenders'
import {
  HISTORIAL_DE_MOVIMIENTOS,
  MUESTRA_POR_CLASE,
  contenidoDeFila,
  medirIdentidad,
  registrarIdentidad,
  renglonesDeIdentidad,
  type MedidaDeIdentidad,
} from '../src/scraper/identidad-de-filas'
import { clasificarGuarda } from '../src/scraper/health-monitor'

/**
 * ¿Sigue cada contrato bajo su `sourceRowId` de una pasada a la siguiente?
 *
 * Cada caso sale de la descarga real del 01-11-2026 (`ribalicita_contratos_`):
 * las ediciones se le aplican a esa fila, no a una forma inventada. Las gemelas
 * son de verdad: 4889055 lleva 98/2026 dos veces, con el mismo enlace, lote,
 * importe y fecha, y sólo `contract_id` las distingue.
 */
const CSV = readFileSync(join(__dirname, 'fixtures', 'ribalicita_contratos_2026-11-01.csv'), 'utf8')
const AYER = '2026-10-31T10:35:12.757Z'
const HOY = '2026-11-01T10:35:12.757Z'

const medida = (m: ReturnType<typeof medirIdentidad>): MedidaDeIdentidad => {
  if (!m.medida) throw new Error(`no se midió: ${m.motivo}`)
  return m
}

/** Lo que dice la cabecera de `MedidaDeIdentidad`: cada fila cae en una clase. */
function cuadra(m: MedidaDeIdentidad) {
  const comunes = m.conservan + m.editadas + m.reutilizadas + m.cambian
  expect(comunes + m.bajas).toBe(m.conClaveAntes)
  expect(comunes + m.altas).toBe(m.conClaveAhora)
  expect(m.comparables).toBe(m.conservan + m.cambian)
}

describe('medirIdentidad', () => {
  let ayer: Contract[]

  beforeAll(() => {
    ayer = parseRibalicitaContracts(CSV)
  })

  it('sobre dos pasadas iguales, toda fila conserva su clave', () => {
    const m = medida(medirIdentidad({ generatedAt: AYER, contracts: ayer }, ayer))
    expect(m.comparables).toBe(ayer.length)
    expect(m.conservan).toBe(ayer.length)
    expect(m.cambian + m.editadas + m.reutilizadas + m.retocadas + m.idMovidos).toBe(0)
    expect(m.comparadoCon).toBe(AYER)
    cuadra(m)
  })

  it('la fila que la fuente mueve renumera los ids y no las claves (el caso del 4889055)', () => {
    const lineas = CSV.trimEnd().split('\n')
    const delExpediente = lineas.flatMap((l, i) => (l.startsWith('"4889055"') ? [i] : []))
    expect(delExpediente.length).toBeGreaterThan(2)
    const [movida] = lineas.splice(delExpediente[0], 1)
    lineas.splice(delExpediente[delExpediente.length - 1], 0, movida)
    const hoy = parseRibalicitaContracts(lineas.join('\n'))

    const m = medida(medirIdentidad({ generatedAt: AYER, contracts: ayer }, hoy))
    expect(hoy).toHaveLength(ayer.length)
    expect(m.idMovidos).toBeGreaterThan(0)
    expect(m.conservan).toBe(ayer.length)
    expect(m.cambian).toBe(0)
    expect(m.muestras.idMovidos.length).toBeGreaterThan(0)
    cuadra(m)
  })

  it('la misma fila con otra clave se cuenta como cambio: la cifra que desmentiría la clave', () => {
    const hoy = ayer.map((c, i) => (i === 0 ? { ...c, sourceRowId: 'regenerada' } : c))
    const m = medida(medirIdentidad({ generatedAt: AYER, contracts: ayer }, hoy))
    expect(m.cambian).toBe(1)
    expect(m.conservan).toBe(ayer.length - 1)
    expect(m.altas).toBe(0)
    expect(m.bajas).toBe(0)
    expect(m.muestras.cambian).toEqual(['regenerada'])
    cuadra(m)
  })

  it('entre gemelas compara conjuntos: el orden no cuenta, una clave nueva sí', () => {
    const a = ayer.find((c) =>
      ayer.some((d) => d !== c && contenidoDeFila(d) === contenidoDeFila(c)),
    )
    const b = ayer.find((d) => d !== a && a && contenidoDeFila(d) === contenidoDeFila(a))
    if (!a || !b) throw new Error('la fixture ya no trae gemelas')

    const cruzadas = ayer.map((c) => {
      if (c === a) return { ...c, sourceRowId: b.sourceRowId }
      if (c === b) return { ...c, sourceRowId: a.sourceRowId }
      return c
    })
    const orden = medida(medirIdentidad({ generatedAt: AYER, contracts: ayer }, cruzadas))
    expect(orden.conservan).toBe(ayer.length)
    expect(orden.cambian).toBe(0)

    const nueva = ayer.map((c) => (c === b ? { ...c, sourceRowId: 'nueva' } : c))
    const cambio = medida(medirIdentidad({ generatedAt: AYER, contracts: ayer }, nueva))
    expect(cambio.cambian).toBe(1)
    cuadra(cambio)
  })

  it('misma clave y mismo enlace con otro importe es una edición que la clave aguantó', () => {
    const hoy = ayer.map((c, i) => (i === 0 ? { ...c, finalAmount: c.finalAmount + 1 } : c))
    const m = medida(medirIdentidad({ generatedAt: AYER, contracts: ayer }, hoy))
    expect(m.editadas).toBe(1)
    expect(m.conservan).toBe(ayer.length - 1)
    expect(m.cambian).toBe(0)
    expect(m.reutilizadas).toBe(0)
    cuadra(m)
  })

  it('misma clave en otro enlace es una clave reutilizada, no una edición', () => {
    const hoy = ayer.map((c, i) => (i === 0 ? { ...c, permalink: 'https://otra-ficha' } : c))
    const m = medida(medirIdentidad({ generatedAt: AYER, contracts: ayer }, hoy))
    expect(m.reutilizadas).toBe(1)
    expect(m.editadas).toBe(0)
    expect(m.muestras.reutilizadas).toEqual([ayer[0].sourceRowId])
    cuadra(m)
  })

  it('un título o una adjudicataria reescritos cuentan aparte: ahí se ve que la clave aguanta', () => {
    const hoy = ayer.map((c, i) => {
      if (i === 0) return { ...c, assignee: `${c.assignee} SAU` }
      if (i === 1) return { ...c, title: `${c.title}.` }
      return c
    })
    const m = medida(medirIdentidad({ generatedAt: AYER, contracts: ayer }, hoy))
    expect(m.conservan).toBe(ayer.length)
    expect(m.retocadas).toBe(2)
    cuadra(m)
  })

  it('una fila nueva o una que se va son altas y bajas, no un cambio de clave', () => {
    const [primera, ...resto] = ayer
    const m = medida(
      medirIdentidad({ generatedAt: AYER, contracts: resto }, [
        ...resto,
        { ...primera, sourceRowId: 'alta', permalink: 'https://nueva' },
      ]),
    )
    expect(m.altas).toBe(1)
    expect(m.bajas).toBe(0)
    expect(m.cambian).toBe(0)
    cuadra(m)
  })

  it('editada y re-claveada a la vez se lee como baja y alta: por eso la baja se guarda', () => {
    const hoy = ayer.map((c, i) =>
      i === 0 ? { ...c, sourceRowId: 'otra', finalAmount: c.finalAmount + 1 } : c,
    )
    const m = medida(medirIdentidad({ generatedAt: AYER, contracts: ayer }, hoy))
    expect(m.cambian).toBe(0)
    expect(m.altas).toBe(1)
    expect(m.bajas).toBe(1)
    expect(m.muestras.bajas).toEqual([ayer[0].sourceRowId])
    cuadra(m)
  })

  it('una clave repetida se cuenta y no se pierde en silencio', () => {
    const hoy = ayer.map((c, i) => (i === 1 ? { ...c, sourceRowId: ayer[0].sourceRowId } : c))
    const m = medida(medirIdentidad({ generatedAt: AYER, contracts: ayer }, hoy))
    expect(m.repetidasAhora).toBe(1)
    expect(m.repetidasAntes).toBe(0)
    cuadra(m)
  })

  it('las filas sin clave no entran en la cuenta, y se dicen', () => {
    const hoy = ayer.map((c, i) => (i === 0 ? { ...c, sourceRowId: null } : c))
    const m = medida(medirIdentidad({ generatedAt: AYER, contracts: ayer }, hoy))
    expect(m.sinClaveAhora).toBe(1)
    expect(m.sinClaveAntes).toBe(0)
    expect(m.conClaveAhora).toBe(ayer.length - 1)
    cuadra(m)
  })

  it('el corte de la muestra se ve: la lista no pasa del tope, la cuenta sí', () => {
    const hoy = ayer.map((c) => ({ ...c, sourceRowId: `n-${c.sourceRowId}` }))
    const m = medida(medirIdentidad({ generatedAt: AYER, contracts: ayer }, hoy))
    expect(m.cambian).toBe(ayer.length)
    expect(m.muestras.cambian.length).toBe(MUESTRA_POR_CLASE)
  })

  describe('lo que no se pudo medir no es «cero cambios» (regla 2)', () => {
    it('sin snapshot anterior', () => {
      expect(medirIdentidad(null, ayer)).toEqual({ medida: false, motivo: 'sin-snapshot-anterior' })
    })

    it('el snapshot anterior es de antes del campo', () => {
      const viejos = ayer.map(({ sourceRowId: _fuera, ...c }) => c)
      expect(medirIdentidad({ generatedAt: AYER, contracts: viejos }, ayer)).toEqual({
        medida: false,
        motivo: 'anterior-sin-clave',
      })
    })

    it('la fuente dejó de traer la clave', () => {
      const hoy = ayer.map((c) => ({ ...c, sourceRowId: null }))
      expect(medirIdentidad({ generatedAt: AYER, contracts: ayer }, hoy)).toEqual({
        medida: false,
        motivo: 'actual-sin-clave',
      })
    })
  })
})

describe('registrarIdentidad', () => {
  let ayer: Contract[]

  beforeAll(() => {
    ayer = parseRibalicitaContracts(CSV)
  })

  const conMovimiento = () => ayer.map((c, i) => (i === 0 ? { ...c, title: `${c.title}.` } : c))

  it('una pasada con movimiento entra en el historial, con su fecha', () => {
    const r = registrarIdentidad({ generatedAt: AYER, contracts: ayer }, HOY, conMovimiento())
    expect(r.ultima.medida).toBe(true)
    expect(r.movimientos).toHaveLength(1)
    expect(r.movimientos[0]).toMatchObject({ medidoEn: HOY, comparadoCon: AYER, retocadas: 1 })
  })

  it('una segunda pasada tranquila no borra la que midió la edición', () => {
    const primera = registrarIdentidad({ generatedAt: AYER, contracts: ayer }, HOY, conMovimiento())
    const tras = conMovimiento()
    const segunda = registrarIdentidad(
      { generatedAt: HOY, contracts: tras, identidadDeFilas: primera },
      '2026-11-02T10:35:12.757Z',
      tras,
    )
    expect((segunda.ultima as MedidaDeIdentidad).retocadas).toBe(0)
    expect(segunda.movimientos).toEqual(primera.movimientos)
  })

  it('una pasada que no pudo medir tampoco lo borra', () => {
    const primera = registrarIdentidad({ generatedAt: AYER, contracts: ayer }, HOY, conMovimiento())
    const sinClave = ayer.map((c) => ({ ...c, sourceRowId: null }))
    const r = registrarIdentidad(
      { generatedAt: HOY, contracts: ayer, identidadDeFilas: primera },
      '2026-11-02T10:35:12.757Z',
      sinClave,
    )
    expect(r.ultima).toMatchObject({ medida: false, motivo: 'actual-sin-clave' })
    expect(r.movimientos).toEqual(primera.movimientos)
  })

  it('el historial tiene tope y gana lo reciente', () => {
    let doc: Parameters<typeof registrarIdentidad>[0] = { generatedAt: AYER, contracts: ayer }
    let contratos = ayer
    let ultima = AYER
    for (let i = 0; i < HISTORIAL_DE_MOVIMIENTOS + 3; i++) {
      const siguiente = contratos.map((c, j) => (j === 0 ? { ...c, title: `${c.title}.` } : c))
      ultima = new Date(Date.parse(AYER) + (i + 1) * 86_400_000).toISOString()
      const r = registrarIdentidad(doc, ultima, siguiente)
      doc = { generatedAt: ultima, contracts: siguiente, identidadDeFilas: r }
      contratos = siguiente
    }
    expect(doc.identidadDeFilas?.movimientos).toHaveLength(HISTORIAL_DE_MOVIMIENTOS)
    expect(doc.identidadDeFilas?.movimientos[0].medidoEn).toBe(ultima)
  })
})

describe('renglonesDeIdentidad', () => {
  let ayer: Contract[]

  beforeAll(() => {
    ayer = parseRibalicitaContracts(CSV)
  })

  it('dice cuántas filas conservan su clave y de cuántas', () => {
    const r = registrarIdentidad({ generatedAt: AYER, contracts: ayer }, HOY, ayer)
    const texto = renglonesDeIdentidad({ identidadDeFilas: r }).join('\n')
    expect(texto).toContain(`${ayer.length} de ${ayer.length}`)
    expect(texto).toContain('sourceRowId')
    expect(clasificarGuarda(0, texto)).toEqual({ desenlace: 'limpia' })
  })

  it('lista los movimientos guardados aunque la última pasada fuera tranquila', () => {
    const tocado = ayer.map((c, i) => (i === 0 ? { ...c, title: `${c.title}.` } : c))
    const r1 = registrarIdentidad({ generatedAt: AYER, contracts: ayer }, HOY, tocado)
    const r2 = registrarIdentidad(
      { generatedAt: HOY, contracts: tocado, identidadDeFilas: r1 },
      '2026-11-02T00:00:00.000Z',
      tocado,
    )
    const texto = renglonesDeIdentidad({ identidadDeFilas: r2 }).join('\n')
    expect(texto).toContain(HOY.slice(0, 10))
    expect(texto).toContain('retocadas 1')
  })

  it('lo que no midió lo dice con la marca que el parte lee', () => {
    const r = registrarIdentidad(null, HOY, ayer)
    const salida = renglonesDeIdentidad({ identidadDeFilas: r }).join('\n')
    expect(clasificarGuarda(0, salida).desenlace).toBe('sin-comprobar')
  })

  it('un snapshot sin el bloque tampoco pasa por medido: la pasada no lo escribió', () => {
    const salida = renglonesDeIdentidad({}).join('\n')
    expect(clasificarGuarda(0, salida).desenlace).toBe('sin-comprobar')
  })

  it('no le tapa al parte el motivo de un rojo de la corrección', () => {
    const r = registrarIdentidad({ generatedAt: AYER, contracts: ayer }, HOY, ayer)
    const salida = [
      '  ✗ [sobra] 123 (lote 0) sobra',
      ...renglonesDeIdentidad({ identidadDeFilas: r }),
    ].join('\n')
    const d = clasificarGuarda(1, salida)
    expect(d.desenlace).toBe('fallo')
    expect(d).toHaveProperty('mensaje', expect.stringContaining('sobra'))
  })
})
