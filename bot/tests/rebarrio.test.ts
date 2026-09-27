import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import { createQueja, listEvents, softDeleteQueja } from '../src/db/queries'
import { planearRebarrio, aplicarRebarrio, EVENTO_BARRIO_CORREGIDO } from '../src/services/rebarrio'
import { situar } from '../src/services/neighborhoods'

/**
 * Las quejas guardadas con la regla vieja conservan su barrio hasta que una
 * persona decide cambiarlo, queja a queja y con rastro.
 *
 * El barrio de una queja publicada es un dato publicado, y la regla vieja lo
 * sacaba del centroide más cercano a menos de 2 km: el Ajuntament era
 * Entrevías. Recalcularlo en silencio sería reescribir lo publicado sin
 * registro; por eso el plan se enseña primero, y cada cambio aplicado deja un
 * evento con el antes y el después.
 */
const AJUNTAMENT = { lat: 39.5467, lng: -0.5697 }
const VALENCIA = { lat: 39.4699, lng: -0.3763 }

describe('rebarrio', () => {
  let db: Db
  let ids: Record<string, string>
  const barrioDe = (id: string) =>
    (
      db.prepare('SELECT neighborhood FROM quejas WHERE id = ?').get(id) as {
        neighborhood: string | null
      }
    ).neighborhood

  beforeEach(() => {
    db = openDb(':memory:')
    const nueva = (
      datos: { lat?: number; lng?: number; neighborhood: string | null },
      usuario = 1001,
    ) =>
      createQueja(db, {
        telegram_user_id: usuario,
        category: 'alumbrado',
        title: 'Farola apagada',
        detail: 'La farola lleva apagada desde el lunes y la calle queda a oscuras.',
        ...datos,
      }).id
    const centro = situar(AJUNTAMENT.lat, AJUNTAMENT.lng)
    expect(centro.situacion).toBe('sin-barrio') // el control: la regla nueva no le da barrio
    ids = {
      centro: nueva({ ...AJUNTAMENT, neighborhood: 'poligono-industrial-entrevias' }),
      fuera: nueva({ ...VALENCIA, neighborhood: 'urbanitzacio-la-reva' }),
      sinUbicacion: nueva({ neighborhood: null }),
      retirada: nueva({ ...AJUNTAMENT, neighborhood: 'poligono-industrial-entrevias' }, 1002),
    }
    softDeleteQueja(db, ids.retirada, 1002)
  })

  it('en seco dice qué cambiaría, y no toca nada', () => {
    const plan = planearRebarrio(db)
    expect(plan.revisadas).toBe(2)
    expect(plan.sinUbicacion).toBe(1)
    expect(plan.cambios).toEqual([
      {
        id: ids.centro,
        antes: 'poligono-industrial-entrevias',
        despues: null,
        situacion: 'sin-barrio',
      },
      {
        id: ids.fuera,
        antes: 'urbanitzacio-la-reva',
        despues: null,
        situacion: 'fuera-del-termino',
      },
    ])
    expect(barrioDe(ids.centro)).toBe('poligono-industrial-entrevias')
  })

  it('una retirada no se revisa: ya no tiene ubicación ni se publica', () => {
    const plan = planearRebarrio(db)
    expect(plan.cambios.map((c) => c.id)).not.toContain(ids.retirada)
  })

  it('aplicado, cada cambio deja un evento con el antes y el después', () => {
    const r = aplicarRebarrio(db, planearRebarrio(db).cambios)
    expect(r).toEqual({ intentados: 2, aplicados: 2, yaCambiados: 0 })
    expect(barrioDe(ids.centro)).toBeNull()
    const ev = listEvents(db, ids.centro).filter((e) => e.kind === EVENTO_BARRIO_CORREGIDO)
    expect(ev).toHaveLength(1)
    expect(JSON.parse(ev[0].payload!)).toMatchObject({
      antes: 'poligono-industrial-entrevias',
      despues: null,
      situacion: 'sin-barrio',
    })
    // Y otra pasada ya no tiene nada que cambiar.
    expect(planearRebarrio(db).cambios).toEqual([])
  })

  it('si el barrio cambió entre el plan y la aplicación, no lo pisa', () => {
    const plan = planearRebarrio(db)
    db.prepare('UPDATE quejas SET neighborhood = ? WHERE id = ?').run('el-molinet', ids.centro)
    const r = aplicarRebarrio(db, plan.cambios)
    expect(r).toEqual({ intentados: 2, aplicados: 1, yaCambiados: 1 })
    expect(barrioDe(ids.centro)).toBe('el-molinet')
  })

  it('sin geo.json no hay plan: no se puede recalcular nada', () => {
    expect(() => planearRebarrio(db, () => ({ situacion: 'sin-geo' }))).toThrow(/geo\.json/)
  })
})
