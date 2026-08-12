import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateEficienciaFindingsSnapshot,
  cotejarMedicion,
  digestFinding,
  RESPONDENTES,
  type EficienciaFinding,
} from '../src/scraper/eficiencia-finding'
import { MOTIVOS_DESVIACION, FIABILIDADES } from '../src/scraper/indicador-desviacion'

const ROOT = join(__dirname, '..')
const panel = JSON.parse(readFileSync(join(ROOT, 'public/data/indicadores.json'), 'utf8'))

const CABECERA = {
  version: '1',
  generatedAt: '2026-08-12T00:00:00.000Z',
  legalNotice:
    'Cifras oficiales publicadas por el Ministerio de Hacienda. Derecho de réplica abierto.',
  contactUrl: 'https://github.com/datarhan/civicpulse/issues',
  methodologyUrl: '/metodologia',
}

/** Una ficha válida mínima, construida sobre el indicador real del panel. */
function ficha(over: Partial<EficienciaFinding> = {}): EficienciaFinding {
  const pmp = panel.municipales.find((m: { id: string }) => m.id === 'periodo-medio-pago')
  return {
    id: 'ef-2026-08-12-pmp',
    candidatoId: 'cand-periodo-medio-pago-v1-2026-08-12',
    indicadorId: 'periodo-medio-pago',
    familia: 'municipal',
    titulo: 'El plazo de pago a proveedores dobla el límite legal',
    cuerpo:
      'El periodo medio de pago del ayuntamiento a sus proveedores se sitúa en 62,68 días en el ' +
      'primer trimestre de 2026, frente a los 30 días que fija el Real Decreto 1040/2017. La cifra ' +
      'la publica el propio Ministerio de Hacienda a partir de la remisión del ayuntamiento.',
    motivos: ['umbral-legal', 'posicion-alta'],
    fiabilidad: 'alta',
    medicion: {
      indicadorId: 'periodo-medio-pago',
      periodo: pmp.periodo,
      valor: pmp.valor,
      unidad: 'días',
      referencia: { valor: 30, etiqueta: '30 días, plazo legal' },
      fuentes: [pmp.numerador.fuente, pmp.denominador.fuente],
    },
    caveats: [],
    citas: [{ url: 'https://www.hacienda.gob.es/', etiqueta: 'Ministerio de Hacienda' }],
    curatorName: 'curador',
    publishedAt: '2026-08-12',
    response: null,
    corrections: [],
    ...over,
  }
}

const snap = (items: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ ...CABECERA, items, ...extra })

describe('scraper/eficiencia-finding — el esquema publicado', () => {
  it('acepta una ficha completa y la normaliza', () => {
    const out = validateEficienciaFindingsSnapshot(snap([ficha()]))
    expect(out.items).toHaveLength(1)
    expect(out.items[0].medicion.fuentes.length).toBeGreaterThan(0)
    for (const m of out.items[0].motivos) expect(MOTIVOS_DESVIACION).toContain(m)
    expect(FIABILIDADES).toContain(out.items[0].fiabilidad)
  })

  it('acepta un fichero vacío, que es el estado normal antes de la primera firma', () => {
    const out = validateEficienciaFindingsSnapshot(snap([]))
    expect(out.items).toEqual([])
  })

  it('RECHAZA un borrador que llegue con requiresHumanApproval', () => {
    // Las dos capas independientes del diseño: el candidato lo lleva siempre y
    // el esquema publicado lo rechaza, así que un borrador no puede colarse a
    // publicado por descuido de un script.
    expect(() =>
      validateEficienciaFindingsSnapshot(
        snap([{ ...ficha(), requiresHumanApproval: true } as unknown]),
      ),
    ).toThrow(/BORRADOR/)
  })

  it('RECHAZA cualquier campo que nombre a una persona o a un grupo', () => {
    // Copiar una ficha de pleno-findings aquí traería su atribución, y un
    // JSON.parse no se queja de una clave de más.
    for (const campo of ['individualSpeaker', 'speakerGroup', 'quotes', 'plenoId', 'severity']) {
      expect(
        () => validateEficienciaFindingsSnapshot(snap([{ ...ficha(), [campo]: 'x' } as unknown])),
        `${campo} debería estar prohibido`,
      ).toThrow(/no de personas|servicios, no/)
    }
  })

  it('exige salvedad cuando la comparación es floja', () => {
    // Una comparación débil publicada sin decirlo es la mentira por vecindad:
    // el número es correcto y la conclusión que invita no lo es.
    expect(() =>
      validateEficienciaFindingsSnapshot(snap([ficha({ fiabilidad: 'debil', caveats: [] })])),
    ).toThrow(/salvedad/)
    const ok = validateEficienciaFindingsSnapshot(
      snap([
        ficha({
          fiabilidad: 'debil',
          caveats: ['Cada ayuntamiento declara esta magnitud a su manera.'],
        }),
      ]),
    )
    expect(ok.items[0].caveats).toHaveLength(1)
  })

  it('exige periodo, celdas y firma', () => {
    const sinPeriodo = ficha()
    delete (sinPeriodo.medicion as Partial<typeof sinPeriodo.medicion>).periodo
    expect(() => validateEficienciaFindingsSnapshot(snap([sinPeriodo]))).toThrow(/periodo/)

    expect(() =>
      validateEficienciaFindingsSnapshot(
        snap([ficha({ medicion: { ...ficha().medicion, fuentes: [] } })]),
      ),
    ).toThrow(/fuentes/)

    expect(() => validateEficienciaFindingsSnapshot(snap([ficha({ curatorName: '' })]))).toThrow(
      /curatorName/,
    )
    expect(() => validateEficienciaFindingsSnapshot(snap([ficha({ citas: [] })]))).toThrow(/citas/)
  })

  it('una cifra, un hallazgo: no deja dos fichas vivas del mismo indicador', () => {
    expect(() =>
      validateEficienciaFindingsSnapshot(snap([ficha(), ficha({ id: 'ef-2026-08-12-pmp-bis' })])),
    ).toThrow(/fichas vivas/)
  })

  it('sólo deja replicar a instituciones, nunca a una persona', () => {
    const ok = validateEficienciaFindingsSnapshot(
      snap([
        ficha({
          response: {
            from: 'intervencion',
            quote: 'El retraso responde a la acumulación de facturas del cierre del ejercicio.',
            respondedAt: '2026-08-20',
          },
        }),
      ]),
    )
    expect(RESPONDENTES).toContain(ok.items[0].response!.from)
    expect(() =>
      validateEficienciaFindingsSnapshot(
        snap([
          ficha({
            // @ts-expect-error justo lo que no se admite
            response: { from: 'PSOE', quote: 'x'.repeat(30), respondedAt: '2026-08-20' },
          }),
        ]),
      ),
    ).toThrow(/instituciones, no personas/)
  })

  it('publicado y retirado no es un estado', () => {
    const f = ficha()
    expect(() =>
      validateEficienciaFindingsSnapshot(
        snap([f], {
          retractions: [
            {
              findingId: f.id,
              digest: digestFinding(f),
              reason: 'La entrega del ministerio se corrigió a la baja tras la firma.',
              editor: 'curador',
              retractedAt: '2026-08-20',
            },
          ],
        }),
      ),
    ).toThrow(/both published and retracted/)
  })

  it('la lápida no publica el texto retirado, pero deja comprobarlo', () => {
    const d = digestFinding(ficha())
    expect(d).toMatch(/^hallazgo · sha256:[0-9a-f]{12}$/)
    expect(d).not.toContain('proveedores')
    // Reproducible: quien tenga la instantánea anterior recalcula el mismo hash.
    expect(digestFinding(ficha())).toBe(d)
  })
})

describe('scraper/eficiencia-finding — ¿sigue diciendo el panel lo que la ficha afirma?', () => {
  it('coincide cuando la ficha copia el panel vivo', () => {
    const c = cotejarMedicion(ficha(), panel)
    expect(c.estado).toBe('coincide')
    expect(c.actual).toBeCloseTo(c.publicado, 6)
  })

  it('«movido» cuando el panel avanza de periodo, y NO es un fallo', () => {
    // La ficha dice de qué periodo habla. Que llegue un trimestre nuevo es el
    // aviso de mirarla, no una contradicción.
    const vieja = ficha({ medicion: { ...ficha().medicion, periodo: '2019-T4' } })
    const c = cotejarMedicion(vieja, panel)
    expect(c.estado).toBe('movido')
    expect(c.periodoActual).toBe(
      panel.municipales.find((m: { id: string }) => m.id === 'periodo-medio-pago').periodo,
    )
    expect(c.detalle).toMatch(/Revisar si sigue vigente/)
  })

  it('«contradice» cuando el MISMO periodo pasa a valer otra cosa', () => {
    const revisada = ficha({ medicion: { ...ficha().medicion, valor: 41.2 } })
    const c = cotejarMedicion(revisada, panel)
    expect(c.estado).toBe('contradice')
    expect(c.detalle).toMatch(/la fuente se revisó/)
  })

  it('«sin-indicador» no se confunde con «coincide»', () => {
    // Colapsar «no lo encontré» dentro de «todo bien» es el defecto que este
    // repositorio ya pagó con `r?.findings ?? []`: un fallo que imprime su
    // propio visto bueno.
    const huerfana = ficha({ medicion: { ...ficha().medicion, indicadorId: 'no-existe' } })
    const c = cotejarMedicion(huerfana, panel)
    expect(c.estado).toBe('sin-indicador')
    expect(c.actual).toBeNull()
  })

  it('coteja también la familia de servicios, con su entrega', () => {
    const i = panel.indicadores.find((x: { valor: number | null }) => x.valor !== null)
    const servicio = ficha({
      id: 'ef-servicio',
      indicadorId: i.id,
      familia: 'servicio',
      medicion: {
        indicadorId: i.id,
        periodo: String(i.citas[0].entrega),
        valor: i.valor,
        unidad: i.unidad,
        fuentes: [i.numerador.fuente, i.denominador.fuente],
      },
    })
    expect(cotejarMedicion(servicio, panel).estado).toBe('coincide')
    expect(
      cotejarMedicion({ ...servicio, medicion: { ...servicio.medicion, periodo: '2016' } }, panel)
        .estado,
    ).toBe('movido')
  })
})
