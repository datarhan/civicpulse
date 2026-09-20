/**
 * Una copia de Wayback no desaparece.
 *
 * Medido el 20-09-2026 sobre las últimas catorce pasadas de `press-link-rot.json`,
 * sin red: de las once URLs que mostraron copia en alguna pasada, nueve la
 * «perdieron» en una posterior y la recuperaron después. Esos `null` no eran «sin
 * copia». En /promesas eso es el enlace «copia archivada» de una cita apareciendo
 * y desapareciendo de un día para otro, y un `stats.archived` que baila entre 2 y
 * 9 sobre el mismo conjunto de URLs.
 *
 * La API de disponibilidad falla de DOS maneras, y las dos se vieron ese día:
 * rechaza la consulta (429), o contesta un 200 limpio con `archived_snapshots: {}`
 * para una URL que sí tiene captura (el par real está en
 * `fixtures/wayback_available_ninguna_…` y `fixtures/wayback_cdx_la_tiene_…`). Por
 * eso no basta con heredar cuando la consulta FALLA: un «ninguna» tampoco prueba
 * que la copia de ayer ya no esté. Tres reglas:
 *   1. la copia que encontró una pasada anterior se conserva mientras la de hoy no
 *      encuentre otra, y la fila dice que es heredada y qué contestó hoy Wayback;
 *   2. en una página que ya tiene copia conocida no se gasta un Save Page Now —
 *      y menos si el original está muerto: se archivaría la página de error;
 *   3. la pasada cuenta lo que no pudo mirar — un `archived` bajo con
 *      `lookupFailed` alto no es «hay pocas copias», es «hoy no se pudo mirar».
 */
import { describe, expect, it } from 'vitest'
import { archiveStats, knownCopies, maybeArchive } from '../scripts/audit-press-links'

const URL_ = 'https://example.org/a'
const COPIA = `https://web.archive.org/web/20260901000000/${URL_}`
const CONOCIDA = { archivedUrl: COPIA, archivedAt: '2026-09-01T10:00:00.000Z' }

const base = {
  ok: false,
  archivedUrl: null,
  timestamp: null,
  archivedAt: '2026-09-20T00:00:00.000Z',
  error: null,
}
/** Wayback falso: qué contesta la consulta, si el guardado sale bien, y cuántos guardados se pidieron. */
const wayback = (lookup: 'found' | 'none' | 'failed', guardadoOk = true) => {
  const cuenta = { guardados: 0 }
  return {
    cuenta,
    io: {
      find: async () =>
        lookup === 'found'
          ? { ...base, ok: true, archivedUrl: `${COPIA}-hoy`, lookup }
          : { ...base, error: lookup === 'none' ? 'no snapshot available' : 'HTTP 429', lookup },
      save: async () => {
        cuenta.guardados++
        return guardadoOk
          ? { ...base, ok: true, archivedUrl: `${COPIA}-guardada` }
          : { ...base, error: 'HTTP 500' }
      },
    },
  }
}

describe('maybeArchive — una copia conocida no desaparece', () => {
  it('consulta RECHAZADA + copia conocida → se conserva, marcada, y dice que hoy no se pudo mirar', async () => {
    const w = wayback('failed')
    expect(await maybeArchive(URL_, 'alive', false, w.io, CONOCIDA)).toEqual({
      ...CONOCIDA,
      archiveLookup: 'failed',
      archiveCarried: true,
    })
  })

  it('«ninguna» + copia conocida → también se conserva: ese «ninguna» no es fiable', async () => {
    const w = wayback('none')
    expect(await maybeArchive(URL_, 'alive', false, w.io, CONOCIDA)).toEqual({
      ...CONOCIDA,
      archiveLookup: 'none',
      archiveCarried: true,
    })
  })

  it('enlace MUERTO con copia conocida → no gasta un guardado en archivar la página de error', async () => {
    const w = wayback('none')
    const r = await maybeArchive(URL_, 'dead', false, w.io, CONOCIDA)
    expect(w.cuenta.guardados).toBe(0)
    expect(r.archivedUrl).toBe(COPIA)
  })

  it('--archive con copia conocida → tampoco', async () => {
    const w = wayback('none')
    await maybeArchive(URL_, 'alive', true, w.io, CONOCIDA)
    expect(w.cuenta.guardados).toBe(0)
  })

  it('copia hallada hoy → manda la de hoy, sin marca de heredada', async () => {
    const w = wayback('found')
    expect(await maybeArchive(URL_, 'alive', false, w.io, CONOCIDA)).toEqual({
      archivedUrl: `${COPIA}-hoy`,
      archivedAt: '2026-09-20T00:00:00.000Z',
      archiveLookup: 'found',
    })
  })
})

describe('maybeArchive — sin copia conocida dice QUÉ supo, no sólo que no hay', () => {
  it('consulta rechazada → failed: no es «sin copia»', async () => {
    const w = wayback('failed')
    expect(await maybeArchive(URL_, 'dead', false, w.io)).toEqual({
      archivedUrl: null,
      archivedAt: null,
      archiveLookup: 'failed',
    })
    expect(w.cuenta.guardados).toBe(0)
  })

  it('enlace vivo y «ninguna» → none, sin guardar', async () => {
    const w = wayback('none')
    expect(await maybeArchive(URL_, 'alive', false, w.io)).toEqual({
      archivedUrl: null,
      archivedAt: null,
      archiveLookup: 'none',
    })
    expect(w.cuenta.guardados).toBe(0)
  })

  it('enlace muerto y «ninguna»: guardado hecho → saved', async () => {
    const w = wayback('none')
    expect(await maybeArchive(URL_, 'dead', false, w.io)).toEqual({
      archivedUrl: `${COPIA}-guardada`,
      archivedAt: '2026-09-20T00:00:00.000Z',
      archiveLookup: 'saved',
    })
  })

  it('enlace muerto y «ninguna»: guardado fallido → none, sin copia', async () => {
    const w = wayback('none', false)
    expect(await maybeArchive(URL_, 'dead', false, w.io)).toEqual({
      archivedUrl: null,
      archivedAt: null,
      archiveLookup: 'none',
    })
    expect(w.cuenta.guardados).toBe(1)
  })
})

describe('archiveStats — la pasada prueba lo que hizo', () => {
  it('cuenta aparte las copias, las heredadas, los «ninguna» y lo que no se pudo mirar', () => {
    const filas = [
      { archivedUrl: COPIA, archiveLookup: 'found' as const },
      { archivedUrl: COPIA, archiveLookup: 'saved' as const },
      { archivedUrl: COPIA, archiveLookup: 'failed' as const, archiveCarried: true as const },
      { archivedUrl: COPIA, archiveLookup: 'none' as const, archiveCarried: true as const },
      { archivedUrl: null, archiveLookup: 'none' as const },
      { archivedUrl: null, archiveLookup: 'failed' as const },
      { archivedUrl: null, archiveLookup: 'failed' as const },
    ]
    expect(archiveStats(filas)).toEqual({
      archived: 4,
      archivedCarried: 2,
      lookupNone: 2,
      lookupFailed: 3,
    })
  })
})

describe('knownCopies — lo que sabía la pasada anterior', () => {
  it('sin instantánea anterior, o ilegible, no hay memoria — y no es un error', () => {
    expect(knownCopies(null).size).toBe(0)
    expect(knownCopies('<<<<<<< HEAD').size).toBe(0)
    expect(knownCopies('{"items": "no es una lista"}').size).toBe(0)
  })

  it('recuerda sólo las filas que tenían copia', () => {
    const anterior = JSON.stringify({
      items: [
        { articleUrl: URL_, ...CONOCIDA },
        { articleUrl: 'https://example.org/b', archivedUrl: null, archivedAt: null },
      ],
    })
    const m = knownCopies(anterior)
    expect([...m.keys()]).toEqual([URL_])
    expect(m.get(URL_)).toEqual(CONOCIDA)
  })
})
