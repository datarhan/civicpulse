import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  estaDescartado,
  sinDescartar,
  descartesHuerfanos,
  validarDescartes,
  type RegistroDescartes,
  descartesInertes,
  SOLAPE_MINIMO,
} from '../src/scraper/surface-dismissals'
import type { ReaderFinding } from '../src/scraper/reader-review'

const f = (quote: string): ReaderFinding => ({
  quote,
  inference: 'x'.repeat(12),
  contradictedBy: 'y'.repeat(6),
  severity: 'misleading',
})

const registro: RegistroDescartes = {
  version: 1,
  items: [
    {
      route: '/datos',
      quote: 'Contratos públicos\n805 contratos\nFuente: Gobierto · PLACSP',
      reason: '/datos es un catálogo de snapshots y 805 es el número de filas del fichero',
      editor: 'Sergei Lutchenko',
      at: '2026-08-13',
    },
  ],
}

describe('descartar un señalamiento revisado', () => {
  it('silencia exactamente la frase revisada', () => {
    expect(estaDescartado('/datos', f(registro.items[0].quote), registro)).toBe(true)
    // Espacios y mayúsculas no cuentan: la revisión reformatea saltos de línea.
    expect(
      estaDescartado(
        '/datos',
        f('contratos públicos 805 contratos fuente: gobierto · placsp'),
        registro,
      ),
    ).toBe(true)
  })

  it('NO silencia otra frase de la misma página', () => {
    // El control que importa. Descartar «/datos» entero taparía el defecto que
    // aparezca mañana ahí; un descarte vale para UNA frase.
    expect(estaDescartado('/datos', f('805 contratos adjudicados'), registro)).toBe(false)
    expect(sinDescartar('/datos', [f('otra cosa distinta')], registro)).toHaveLength(1)
  })

  it('NO silencia la misma frase en otra página', () => {
    expect(estaDescartado('/nosotros', f(registro.items[0].quote), registro)).toBe(false)
  })

  it('sin registro no silencia nada', () => {
    const findings = [f('cualquier cosa')]
    expect(sinDescartar('/datos', findings, null)).toEqual(findings)
    expect(sinDescartar('/datos', findings, { version: 1, items: [] })).toEqual(findings)
  })

  it('nombra los descartes que ya no corresponden a nada vivo', () => {
    // Un registro sólo crece si nadie lo mira, y un descarte huérfano queda
    // armado para silenciar esa frase si vuelve por otro motivo.
    const vivos = new Map([['/datos', [f('algo completamente distinto')]]])
    expect(descartesHuerfanos(registro, vivos).map((d) => d.route)).toEqual(['/datos'])

    const vivosConLaFrase = new Map([['/datos', [f(registro.items[0].quote)]]])
    expect(descartesHuerfanos(registro, vivosConLaFrase)).toEqual([])
  })

  it('rechaza un descarte sin motivo, sin editor o con motivo de coartada', () => {
    // Un descarte sin motivo no es un registro, es un silenciador.
    const base = registro.items[0]
    expect(() => validarDescartes({ version: 1, items: [{ ...base, reason: '' }] })).toThrow(
      /reason/,
    )
    expect(() => validarDescartes({ version: 1, items: [{ ...base, editor: '' }] })).toThrow(
      /editor/,
    )
    expect(() => validarDescartes({ version: 1, items: [{ ...base, reason: 'ok' }] })).toThrow(
      /demasiado corto/,
    )
    expect(() => validarDescartes({ items: [] })).not.toThrow()
    expect(validarDescartes(registro).items).toHaveLength(1)
  })
})

describe('el descarte sobrevive a que el modelo recorte distinto', () => {
  it('aplica cuando la cita nueva es un trozo de la descartada', () => {
    // Medido: se descartó «…805 contratos Fuente: Gobierto · PLACSP» y el
    // barrido siguiente citó «…805 contratos» a secas. Mismo defecto, recorte
    // distinto. Con igualdad exacta el descarte no valía nada.
    expect(estaDescartado('/datos', f('Contratos públicos\n805 contratos'), registro)).toBe(true)
  })

  it('aplica también al revés: la nueva contiene a la descartada', () => {
    expect(
      estaDescartado(
        '/datos',
        f('Contratos públicos\n805 contratos\nFuente: Gobierto · PLACSP\nAbrir →'),
        registro,
      ),
    ).toBe(true)
  })

  it('NO aplica a un fragmento demasiado corto', () => {
    // El suelo. Sin él, «805» caería dentro de la cita larga y silenciaría
    // cualquier señalamiento futuro que mencionara ese número.
    expect(estaDescartado('/datos', f('805'), registro)).toBe(false)
    expect(estaDescartado('/datos', f('contratos'), registro)).toBe(false)
  })
})

// ─── Y quién lo aplica ───────────────────────────────────────────────────────
//
// El módulo estaba escrito y probado desde el 13-08-2026, y `check:surfaces` lo
// honraba. `review:surfaces` —el comando que IMPRIME los señalamientos y el que
// lee una persona— no lo leyó nunca, así que un descarte silenciaba el parte de
// salud y no la salida. El falso positivo de `/gestion` iba a reimprimirse
// indefinidamente con el registro delante, sin usar.
//
// Es la lección de `project_wiring_gaps` en su forma pura: comprueba SIEMPRE
// quién ejecuta lo que construyes. Un módulo con tests y sin consumidor está
// tan roto como uno sin tests.

describe('los dos consumidores del registro siguen enchufados', () => {
  const CONSUMIDORES = ['scripts/check-surfaces.ts', 'scripts/review-surfaces.ts'] as const

  it('mide algo: los ficheros existen y se leen', () => {
    for (const c of CONSUMIDORES) {
      expect(readFileSync(resolve(c), 'utf8').length, `${c} está vacío`).toBeGreaterThan(100)
    }
  })

  for (const c of CONSUMIDORES) {
    it(`${c} importa el registro y lo aplica`, () => {
      const src = readFileSync(resolve(c), 'utf8')
      expect(src, `${c} no importa surface-dismissals`).toContain('surface-dismissals')
      expect(src, `${c} no lee review-dismissals.json`).toContain('review-dismissals.json')
      // Importarlo y no llamarlo es el mismo hueco con un import de adorno.
      expect(
        /\bsinDescartar\s*\(|\bestaDescartado\s*\(|\bmedirFrescura\s*\(/.test(src),
        `${c} importa el módulo pero no lo llama`,
      ).toBe(true)
    })
  }
})

/**
 * Un descarte por debajo del suelo de solape no silencia NADA — y hasta hoy
 * tampoco decía que no lo hacía. Se quedaba en el fichero con su motivo y su
 * firma, con toda la pinta de trabajo hecho.
 *
 * Medido el 5-09-2026 auditando el registro: cuatro, dos anteriores a esa
 * sesión. Yo mismo escribí dos más ese día sin darme cuenta — «PRESUP. 2025»
 * (12 caracteres) e «INGRESOS PRESUPUESTADOS» (23)—, y sólo se vieron al
 * comprobar por qué el señalamiento seguía vivo después de descartarlo.
 */
describe('descartes que no pueden casar con nada', () => {
  it('los nombra, y no los confunde con los válidos', () => {
    const registro = {
      version: 1,
      items: [
        { route: '/x', quote: 'corto', reason: 'r'.repeat(20), editor: 'e', at: '2026-01-01' },
        {
          route: '/x',
          quote: 'una cita suficientemente larga para pasar el suelo',
          reason: 'r'.repeat(20),
          editor: 'e',
          at: '2026-01-01',
        },
      ],
    } as never
    const inertes = descartesInertes(registro)
    expect(inertes).toHaveLength(1)
    expect(inertes[0].quote).toBe('corto')
  })

  /** Justo en el borde: el suelo es el exportado, no uno recitado. */
  it('el corte va exactamente en SOLAPE_MINIMO', () => {
    const justo = 'x'.repeat(SOLAPE_MINIMO)
    const corta = 'x'.repeat(SOLAPE_MINIMO - 1)
    const reg = (q: string) =>
      ({
        version: 1,
        items: [{ route: '/x', quote: q, reason: 'r'.repeat(20), editor: 'e', at: '2026-01-01' }],
      }) as never
    expect(descartesInertes(reg(justo))).toHaveLength(0)
    expect(descartesInertes(reg(corta))).toHaveLength(1)
  })

  it('un registro vacío o ausente no inventa ninguno', () => {
    expect(descartesInertes(null)).toEqual([])
    expect(descartesInertes({ version: 1, items: [] } as never)).toEqual([])
  })

  /** Y que `check:surfaces` lo diga: una guarda que nadie invoca no existe. */
  it('check-surfaces lo informa', () => {
    const src = readFileSync(resolve(__dirname, '../scripts/check-surfaces.ts'), 'utf8')
    expect(src).toContain('descartesInertes(')
    expect(src).toContain('INERTE')
  })
})

// ---------------------------------------------------------------------------
// El apóstrofo que anulaba un juicio humano.
//
// El 2026-09-08 un descarte firmado sobre /reportajes/inteligencia-turistica no
// silenciaba nada, y el mismo descarte salía además en la lista de huérfanos —
// «comprueba si la frase sigue publicada». Las dos cosas a la vez y las dos
// falsas: la frase seguía publicada y el descarte le correspondía. Diferían en
// UN carácter, en la posición 67 de «l’Alfàs del Pi»: U+2019 en el descarte,
// U+0027 en el señalamiento. `normaliza` doblaba espacios y mayúsculas y dejaba
// pasar la comilla tipográfica.
//
// Quien las intercambia es el propio modelo, que reescribe la puntuación de una
// pasada a otra, así que sin esto vuelve en cuanto una página lleve un apóstrofo
// —y en valenciano y catalán los topónimos van llenos: l’Alfàs, l’Eliana,
// l’Horta.
//
// No es ensanchar el silenciador: dos citas que sólo se diferencian en la FORMA
// de la comilla son la misma frase, y el suelo de SOLAPE_MINIMO sigue en pie.
describe('la puntuación tipográfica no anula un descarte', () => {
  const conRecta: RegistroDescartes = {
    version: 1,
    items: [
      {
        route: '/reportajes/inteligencia-turistica',
        quote: "El mismo panel de Deepsense se implantó en Santa Pola, l'Alfàs del Pi y Caravaca",
        reason: 'La relación empresa/producto está dicha cuatro veces y sin ambigüedad',
        editor: 'Sergei Lutchenko',
        at: '2026-09-08',
      },
    ],
  }

  it('casa aunque el apóstrofo sea el tipográfico y el descarte lleve el recto', () => {
    expect(
      estaDescartado(
        '/reportajes/inteligencia-turistica',
        f('El mismo panel de Deepsense se implantó en Santa Pola, l’Alfàs del Pi y Caravaca'),
        conRecta,
      ),
    ).toBe(true)
  })

  it('y al revés: descarte con la tipográfica, señalamiento con la recta', () => {
    const conCurva: RegistroDescartes = {
      version: 1,
      items: [{ ...conRecta.items[0], quote: conRecta.items[0].quote.replace("l'", 'l’') }],
    }
    expect(
      estaDescartado(
        '/reportajes/inteligencia-turistica',
        f("El mismo panel de Deepsense se implantó en Santa Pola, l'Alfàs del Pi y Caravaca"),
        conCurva,
      ),
    ).toBe(true)
  })

  it('lo mismo con comillas latinas, guiones largos y espacio duro', () => {
    const reg: RegistroDescartes = {
      version: 1,
      items: [
        {
          route: '/gestion',
          quote: 'El plazo «medio» de pago —según la fuente— es de 62,68 días en el ejercicio',
          reason: 'la cifra es la del ministerio y el rótulo la glosa',
          editor: 'Sergei Lutchenko',
          at: '2026-09-08',
        },
      ],
    }
    expect(
      estaDescartado(
        '/gestion',
        f('El plazo "medio" de pago -según la fuente- es de 62,68 días en el ejercicio'),
        reg,
      ),
    ).toBe(true)
  })

  // El control: normalizar la comilla no puede volver el silenciador ancho.
  it('sigue SIN silenciar una frase distinta, con comillas o sin ellas', () => {
    expect(
      estaDescartado(
        '/reportajes/inteligencia-turistica',
        f('El panel de l’Alfàs del Pi costó 40.496 € y se adjudicó con seis ofertas'),
        conRecta,
      ),
    ).toBe(false)
  })

  it('y el suelo de solape sigue en pie tras normalizar', () => {
    expect(estaDescartado('/reportajes/inteligencia-turistica', f('l’Alfàs'), conRecta)).toBe(false)
  })

  // Un descarte que casa no puede seguir contándose como huérfano: era la
  // segunda mitad de la avería, y la que decía lo contrario de la verdad.
  it('deja de contarse como huérfano en cuanto casa', () => {
    const vivos = new Map([
      [
        '/reportajes/inteligencia-turistica',
        [f('El mismo panel de Deepsense se implantó en Santa Pola, l’Alfàs del Pi y Caravaca')],
      ],
    ])
    expect(descartesHuerfanos(conRecta, vivos)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Y la otra mitad del mismo aviso contradictorio.
//
// `estaDescartado` casa por CONTENCIÓN —lo tuvo que aprender cuando el modelo
// recortó «805 contratos» más corto que la cita descartada—, pero
// `descartesHuerfanos` seguía comparando por IGUALDAD. Un descarte que silencia
// por contención hace las dos cosas a la vez: silencia el señalamiento y se
// anuncia como huérfano, «comprueba si la frase sigue publicada». La frase
// sigue publicada y el descarte le corresponde: el aviso dice lo contrario de
// la verdad, que es peor que no decir nada.
//
// Medido el 2026-09-08 sobre el registro vivo: uno de los trece huérfanos era
// de éstos —/hallazgos, «Por su parte, un grupo no identificado defendió…»
// conteniendo al señalamiento «un grupo no identificado defendió…».
//
// Se arregla preguntándole a `estaDescartado` en vez de reimplementar el
// criterio al lado, que es la regla 1 de DATA_INTEGRITY: el que compara es uno
// solo, y los dos consumidores no pueden discrepar.
describe('un descarte que silencia no se anuncia además como huérfano', () => {
  const reg: RegistroDescartes = {
    version: 1,
    items: [
      {
        route: '/hallazgos',
        quote: 'Por su parte, un grupo no identificado defendió el impacto positivo de la campaña',
        reason: 'la ficha dice «sin atribuir» y el resumen lo llama grupo no identificado',
        editor: 'Sergei Lutchenko',
        at: '2026-09-08',
      },
    ],
  }
  // El señalamiento es un TROZO del descarte: casa por contención, no por igualdad.
  const recortado = f('un grupo no identificado defendió el impacto positivo de la campaña')

  it('sigue silenciándolo — control de que el caso es el de contención', () => {
    expect(estaDescartado('/hallazgos', recortado, reg)).toBe(true)
  })

  it('y ya no sale en la lista de huérfanos', () => {
    expect(descartesHuerfanos(reg, new Map([['/hallazgos', [recortado]]]))).toEqual([])
  })

  it('un descarte que de verdad no casa con nada SÍ sigue saliendo — control', () => {
    const otro = f('una frase completamente distinta que nadie ha descartado nunca aquí')
    expect(descartesHuerfanos(reg, new Map([['/hallazgos', [otro]]]))).toHaveLength(1)
  })
})
