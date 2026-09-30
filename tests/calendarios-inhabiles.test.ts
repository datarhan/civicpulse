import { describe, it, expect } from 'vitest'
import {
  AMBITOS_DEL_FESTIVO,
  FESTIVOS_DE_LA_SEDE,
  problemasDelCalendario,
} from '../src/scraper/queja-router'
import {
  CALENDARIOS,
  CALENDARIO_ETIQUETA,
  FESTIVOS_POR_CALENDARIO,
  festivosDelCalendario,
} from '../src/scraper/calendarios-inhabiles'

/**
 * Los calendarios de días inhábiles de quien resuelve cada solicitud de acceso.
 *
 * Las solicitudes que publican los reportajes no van sólo al Ayuntamiento: van a
 * la Generalitat y a dos ministerios. El último día del mes del art. 20 de la
 * Ley 19/2013 se prorroga al primer día hábil siguiente cuando es inhábil
 * (art. 30.5 LPACAP), y cuál es inhábil lo dice el calendario de la
 * administración que resuelve, en el territorio de su sede (arts. 30.7 y 31.3):
 * el 9 de octubre, Día de la Comunitat Valenciana, lo es para el Ayuntamiento y
 * para la Generalitat, y no para un ministerio en Madrid; el 2 de noviembre de
 * 2026, al revés.
 *
 * Cada día se copia a mano de la disposición que lo declara, como
 * `FESTIVOS_DE_LA_SEDE`, y pasa el mismo validador: un año va entero o no va.
 */
describe('calendarios de inhábiles de quien resuelve', () => {
  it('cada calendario existe, pasa el validador de la sede y tiene algo que validar', () => {
    expect(Object.keys(FESTIVOS_POR_CALENDARIO).sort()).toEqual([...CALENDARIOS].sort())
    for (const c of CALENDARIOS) {
      const festivos = FESTIVOS_POR_CALENDARIO[c]
      expect(Object.keys(festivos).length, `${c}: sin ningún año`).toBeGreaterThan(0)
      expect(problemasDelCalendario(festivos), c).toEqual([])
      expect(CALENDARIO_ETIQUETA[c], `${c}: sin etiqueta`).toBeTruthy()
      for (const [anio, dias] of Object.entries(festivos)) {
        for (const ambito of AMBITOS_DEL_FESTIVO) {
          expect(
            dias.some((f) => f.ambito === ambito),
            `${c} ${anio}: sin ámbito ${ambito}`,
          ).toBe(true)
        }
      }
    }
  })

  it('el del Ayuntamiento es la tabla de la sede, no una copia', () => {
    expect(FESTIVOS_POR_CALENDARIO['ayuntamiento-de-riba-roja']).toBe(FESTIVOS_DE_LA_SEDE)
  })

  // La Generalitat tiene el calendario de la Comunitat (Decreto 100/2025 y las
  // nacionales que rigen en ella) —las mismas filas que la sede, no otra copia—
  // y las fiestas locales de València, donde tienen su sede los órganos que
  // resuelven (DOGV núm. 10238). Las de Riba-roja no rigen para ella.
  it('el de la Generalitat: las nacionales y autonómicas de la sede y las locales de València', () => {
    const g = FESTIVOS_POR_CALENDARIO['generalitat-en-valencia'][2026]
    const sede = FESTIVOS_DE_LA_SEDE[2026]
    expect(g.filter((f) => f.ambito !== 'local')).toEqual(sede.filter((f) => f.ambito !== 'local'))
    expect(
      g
        .filter((f) => f.ambito === 'local')
        .map((f) => f.fecha)
        .sort(),
    ).toEqual(['2026-01-22', '2026-04-13'])
    expect(g.map((f) => f.fecha)).not.toContain('2026-09-14')
  })

  // BOE-A-2025-23702 declara los inhábiles de la AGE por territorio: los de todo
  // el territorio nacional, los de cada comunidad autónoma y los locales. Para
  // un ministerio con sede en Madrid, los de Madrid; ninguno que sólo lo sea en
  // la Comunitat Valenciana.
  it('el del Estado en Madrid: los días de BOE-A-2025-23702 para Madrid y las fiestas locales de la capital', () => {
    const m = FESTIVOS_POR_CALENDARIO['estado-en-madrid'][2026].map((f) => f.fecha)
    for (const dia of [
      '2026-01-01',
      '2026-01-06',
      '2026-04-02',
      '2026-04-03',
      '2026-05-01',
      '2026-05-15',
      '2026-10-12',
      '2026-11-02',
      '2026-11-09',
      '2026-12-07',
      '2026-12-08',
      '2026-12-25',
    ]) {
      expect(m, dia).toContain(dia)
    }
    for (const dia of ['2026-03-19', '2026-04-06', '2026-06-24', '2026-10-09']) {
      expect(m, dia).not.toContain(dia)
    }
  })

  // Un calendario que no se dice, o que no existe, no es el de nadie: sin él
  // ningún año está, y el plazo falla cerrado. Si cayera al de la sede, una
  // fila mal escrita heredaría los festivos de Riba-roja en silencio.
  it('un calendario desconocido es ninguno', () => {
    expect(festivosDelCalendario('inventado')).toEqual({})
    expect(festivosDelCalendario(undefined)).toEqual({})
    expect(festivosDelCalendario('generalitat-en-valencia')).toBe(
      FESTIVOS_POR_CALENDARIO['generalitat-en-valencia'],
    )
  })
})
