import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * El mismo expediente vive DOS VECES en `tenders.json`, y sus dos copias se
 * contradicen. Esto fija cuál manda.
 *
 * `scrape:tenders` trae dos tablas de Gobierto —`licitaciones` y `contratos`—
 * y las guarda en `tenders` y `contracts`. Comparten espacio de ids, así que
 * un mismo expediente aparece en las dos con el MISMO título y, casi siempre,
 * con estados distintos: la licitación cuenta en qué fase quedó el
 * procedimiento y el contrato cuenta cómo acabó.
 *
 * El caso que destapó esto: la concesión del agua (id 46717) figura como
 * `revoked` entre las licitaciones y como `awarded` entre los contratos. Leer
 * la primera y publicar «concesión revocada» habría sido falso — la ficha de
 * PLACSP dice «Adjudicada», y el `revoked` viene de que el procedimiento
 * estuvo suspendido cinco años. Estuvo a punto de publicarse así.
 *
 * La regla, que este test convierte en gate:
 *
 *   1. La colisión es MASIVA, no una rareza: cientos de ids en las dos.
 *   2. `tenders` NUNCA trae adjudicatario. Quien quiera saber quién ganó no
 *      tiene siquiera la tentación de mirar ahí.
 *   3. Por tanto el adjudicatario, el importe adjudicado y el estado final se
 *      leen SIEMPRE de `contracts`.
 *
 * Si un día `tenders` empezara a traer `assignee`, este test se pone rojo — y
 * hay que decidir a conciencia cuál manda antes de que un consumidor elija
 * solo.
 */
const RAIZ = join(__dirname, '..')
const d = JSON.parse(readFileSync(join(RAIZ, 'public/data/tenders.json'), 'utf8')) as {
  tenders: Array<{ id: string | number; title?: string; status?: string; assignee?: string }>
  contracts: Array<{ id: string | number; title?: string; status?: string; assignee?: string }>
}

const porId = (arr: typeof d.tenders) => new Map(arr.map((x) => [String(x.id), x]))
const licitaciones = porId(d.tenders ?? [])
const contratos = porId(d.contracts ?? [])

/** Ids en las dos tablas cuyo título coincide: el mismo expediente, dos veces. */
const colisiones = [...contratos.entries()].filter(([id, c]) => {
  const l = licitaciones.get(id)
  return l && (l.title ?? '') === (c.title ?? '')
})

describe('tenders.json — licitaciones y contratos comparten ids', () => {
  it('mide algo: las dos tablas traen filas y colisionan de verdad', () => {
    expect(d.tenders?.length ?? 0).toBeGreaterThan(100)
    expect(d.contracts?.length ?? 0).toBeGreaterThan(100)
    expect(
      colisiones.length,
      'ya no hay ids compartidos: si las tablas se separaron, este gate sobra y hay que retirarlo a conciencia',
    ).toBeGreaterThan(100)
  })

  it('el estado DIVERGE en la mayoría: leer el de la licitación es leer otra cosa', () => {
    const divergen = colisiones.filter(([id, c]) => licitaciones.get(id)!.status !== c.status)
    // No es una anomalía que se pueda tratar como ruido: es lo normal.
    expect(divergen.length / colisiones.length).toBeGreaterThan(0.5)
  })

  it('la concesión del agua es el caso concreto que casi se publica al revés', () => {
    const l = licitaciones.get('46717')
    const c = contratos.get('46717')
    expect(l, 'el expediente 46717 ya no está entre las licitaciones').toBeTruthy()
    expect(c, 'el expediente 46717 ya no está entre los contratos').toBeTruthy()
    expect(l!.title).toBe(c!.title)
    // El contrato es el que sabe cómo acabó; la licitación, no.
    expect(c!.status).toBe('awarded')
    expect(c!.assignee, 'el contrato perdió su adjudicatario').toMatch(/HIDRAQUA/i)
    expect(l!.assignee, 'la licitación no puede traer adjudicatario').toBeUndefined()
  })

  it('NINGUNA licitación trae adjudicatario: el ganador sólo se lee de contracts', () => {
    const conAdjudicatario = (d.tenders ?? []).filter((x) => x.assignee)
    expect(
      conAdjudicatario.map((x) => String(x.id)),
      'una licitación ha empezado a traer assignee: decidir cuál manda ANTES de que un consumidor elija solo',
    ).toEqual([])
  })

  it('y los contratos sí lo traen, o el registro de empresas se quedaría vacío', () => {
    const conAdjudicatario = (d.contracts ?? []).filter((x) => x.assignee)
    expect(conAdjudicatario.length).toBeGreaterThan(100)
  })
})
