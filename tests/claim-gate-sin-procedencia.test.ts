import { describe, it, expect } from 'vitest'
import {
  classifyClaimVisibility,
  gateItemsForPublic,
  type ClaimVisibility,
} from '../src/scraper/claim-public-gate'
import { excesoDeRetirada, idsSinProcedencia } from '../scripts/chunk-pleno-claims'
import { quoteAppearsIn, quoteAppearsInPrepared, prepararHeno } from '../src/scraper/quote-match'

/**
 * Una cita que no consta en NINGUNA transcripción que tengamos no se publica.
 *
 * `check:claim-provenance` llevaba desde el 3-09-2026 contando en rojo unas
 * declaraciones publicadas cuyo literal no aparece ni en la transcripción
 * vigente ni en ninguna sustituida. Tres se arreglaron recuperando de git el
 * archivo que una segunda re-transcripción había pisado; las seis restantes no
 * existen en ningún texto, y para ésas no hay procedencia que recuperar. Lo que
 * sí se puede es dejar de publicarlas, que es lo que hace esta puerta.
 *
 * Se DERIVA de los mismos textos y el mismo emparejador que la comprobación —
 * nada de listas curadas de ids, que se quedan rancias— y por eso se cura sola
 * en la dirección buena: recupera el archivo y la cita vuelve.
 */
const item = (id: string) =>
  ({
    claim: {
      id,
      plenoId: id.split('-')[0],
      type: 'cita_obra',
      verbatim: 'lo que dijo el concejal aquella tarde',
    },
    verification: { verdict: 'verificado', confidence: 0.9, checkedAgainst: ['tenders'] },
  }) as never

describe('la puerta retira lo que no consta en ninguna transcripción', () => {
  it('oculta la declaración marcada, por fundada que esté', () => {
    // Control incluido: la MISMA fila, con veredicto fuerte y corpus anotado,
    // se publica cuando su procedencia consta. Sin este par, la prueba de
    // arriba pasaría también con la puerta ocultándolo todo.
    expect(classifyClaimVisibility(item('a-1'), { sinProcedencia: true })).toBe<ClaimVisibility>(
      'hidden',
    )
    expect(classifyClaimVisibility(item('a-1'), { sinProcedencia: false })).toBe<ClaimVisibility>(
      'shown',
    )
    expect(classifyClaimVisibility(item('a-1'))).toBe<ClaimVisibility>('shown')
  })

  it('gateItemsForPublic deja fuera exactamente los del conjunto', () => {
    const items = [item('a-1'), item('a-2'), item('a-3')]
    const fuera = gateItemsForPublic(items, { sinProcedencia: new Set(['a-2']) })
    expect(fuera.map((i) => i.claim.id)).toEqual(['a-1', 'a-3'])
    // Sin conjunto, no retira nada: la puerta nueva no cambia el resto.
    expect(gateItemsForPublic(items).map((i) => i.claim.id)).toEqual(['a-1', 'a-2', 'a-3'])
  })
})

describe('quién entra en el conjunto', () => {
  const vigente = 'el concejal dijo aquella tarde que las obras iban bien'
  const claims = [
    {
      claim: { id: 'p1-1', plenoId: 'p1', verbatim: 'dijo aquella tarde que las obras iban bien' },
    },
    { claim: { id: 'p1-2', plenoId: 'p1', verbatim: 'esto no lo dijo nadie en ninguna parte' } },
  ]

  it('marca la que no aparece y deja la que sí', () => {
    const out = idsSinProcedencia(
      claims,
      () => vigente,
      () => [],
    )
    expect([...out]).toEqual(['p1-2'])
  })

  it('la rescata una sustituida, aunque no esté en la vigente', () => {
    const out = idsSinProcedencia(
      claims,
      () => vigente,
      () => ['pues esto no lo dijo nadie en ninguna parte, dijo'],
    )
    expect([...out]).toEqual([])
  })

  /**
   * LA distinción que no se puede perder: sin transcripción no hemos mirado, y
   * tratarlo como «no se encontró» retiraría el corpus entero de una sesión el
   * día que un fichero no se descargue.
   */
  it('sin transcripción NO retira nada', () => {
    const out = idsSinProcedencia(
      claims,
      () => null,
      () => [],
    )
    expect([...out]).toEqual([])
  })
})

describe('el techo de retirada', () => {
  it('deja pasar una minoría', () => {
    // Los 7 de 6.919 reales: 0,1 %.
    expect(excesoDeRetirada(7, 6919)).toBeNull()
    expect(excesoDeRetirada(0, 6919)).toBeNull()
  })

  it('para cuando la retirada es masiva, que siempre es un fichero que falta', () => {
    const aviso = excesoDeRetirada(2300, 6919)
    expect(aviso).toBeTruthy()
    expect(aviso).toContain('33.2 %')
    expect(aviso).toContain('superseded/')
  })

  it('un corpus vacío no lo juzga esta guarda', () => {
    expect(excesoDeRetirada(0, 0)).toBeNull()
  })
})

/**
 * El heno preparado existe por el coste (42 s de 46 eran normalizar el mismo
 * texto una vez por declaración), así que lo único que hay que probar de él es
 * que NO cambia el veredicto. Un emparejador más rápido que empareja distinto
 * es un emparejador roto.
 */
describe('el heno preparado empareja igual que el crudo', () => {
  const heno = '[12.0 → 15.0] (SPEAKER_02) Pues señores, se ha aprobado por unanimidad la urgencia.'
  const casos = [
    'se ha aprobado por unanimidad la urgencia',
    'Se Ha Aprobado, por unanimidad, la urgencia',
    'esto no está en el texto de ninguna manera',
    '',
  ]
  for (const cita of casos) {
    it(`coincide para «${cita.slice(0, 40)}»`, () => {
      expect(quoteAppearsInPrepared(cita, prepararHeno(heno))).toBe(quoteAppearsIn(cita, heno))
    })
  }
})
