import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { render } from '@testing-library/react'
import { CitaRetenida, QuoteProvenanceNote } from '../src/components/PlenoFindings'
import { ROTULO_CITA_RETENIDA } from '../src/lib/cita-retenida'
import { SPEAKER_GROUPS } from '../src/scraper/pleno-votes'
import { blocLabel } from '../src/lib/party-label.js'
import {
  estaDescartado,
  sinDescartar,
  descartesHuerfanos,
  validarDescartes,
  type RegistroDescartes,
  descartesInertes,
  rastroDeDescartes,
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

/**
 * El tercer desenlace que faltaba: ¿sigue publicada la frase?
 *
 * `descartesHuerfanos` contesta «hoy no silencia nada», que no es lo mismo, y el
 * aviso que imprime lo reconoce: «comprueba si la frase sigue publicada antes de
 * quitarlos». Le pide a una persona una comprobación que la herramienta tiene a
 * un paso — el texto renderizado de cada ruta ya lo ha leído para revisarla.
 *
 * Sin ella, un descarte cuya frase ya no existe y otro armado y correcto salen
 * escritos igual, y se leen igual: una lista que hay que repasar entera a mano
 * cada vez. El 21-09-2026 eran 23 descartes y 3 huérfanos; al comprobar las
 * citas con un script tosco —que pedía `/ [capas]` como si fuera una URL y no
 * encendía ninguna capa— 7 de los 23 «no aparecían». La mayoría era el script,
 * no el registro: por eso la comprobación tiene que hacerla quien SÍ sabe montar
 * la página, que es el propio barrido.
 *
 * Tres desenlaces, sin plegar ninguno:
 *
 *   vigente     la frase está en el texto de esa ruta → armado y correcto
 *   sin-rastro  la ruta se leyó y la frase NO está    → sobra, que lo mire alguien
 *   no-mirada   esta pasada no visitó esa ruta        → no se sabe, y se dice
 *
 * Plegar «no la he mirado» dentro de «no está» es la regla 2 de DATA_INTEGRITY
 * —la que dejó a una pasada declarando «re-juzgados 1017» sin una sola llamada—
 * aplicada al silenciador.
 */
describe('rastroDeDescartes — ¿sigue publicada la frase que se descartó?', () => {
  const reg: RegistroDescartes = {
    version: 1,
    items: [
      {
        route: '/datos',
        quote: '805 contratos indexados en el registro municipal',
        reason: 'r'.repeat(12),
        editor: 'Alguien',
        at: '2026-09-01',
      },
      {
        route: '/datos',
        quote: 'una frase que ya no está en ninguna parte de la página',
        reason: 'r'.repeat(12),
        editor: 'Alguien',
        at: '2026-09-01',
      },
      {
        route: '/plenos',
        quote: 'otra frase, de una ruta que esta pasada no ha visitado',
        reason: 'r'.repeat(12),
        editor: 'Alguien',
        at: '2026-09-01',
      },
    ],
  }

  const texto = new Map([
    [
      '/datos',
      'Datos abiertos\n805 contratos indexados en el registro municipal\nFuente: Gobierto',
    ],
  ])

  it('separa los tres desenlaces y no pliega ninguno', () => {
    const r = rastroDeDescartes(reg, texto)
    expect(r.map((x) => x.rastro)).toEqual(['vigente', 'sin-rastro', 'no-mirada'])
  })

  it('«no mirada» no es «no está»: una ruta ausente del mapa no se juzga', () => {
    // El defecto que esto evita: con el mapa vacío —una pasada que no visitó
    // nada— todos los descartes saldrían como sobrantes y alguien los borraría.
    expect(rastroDeDescartes(reg, new Map()).every((x) => x.rastro === 'no-mirada')).toBe(true)
  })

  it('usa la MISMA normalización que el silenciador, no una parecida', () => {
    // Si divergieran, un descarte podría silenciar un señalamiento y salir a la
    // vez como «sin rastro»: dos cosas contrarias del mismo registro. Ya pasó
    // con `descartesHuerfanos`, que comparaba por igualdad mientras el
    // silenciador casaba por contención.
    const tipografico: RegistroDescartes = {
      version: 1,
      items: [
        {
          route: '/x',
          quote: 'l’Alfàs del Pi — «un ejemplo» con comillas de las otras',
          reason: 'r'.repeat(12),
          editor: 'Alguien',
          at: '2026-09-01',
        },
      ],
    }
    const conOtraPuntuacion = new Map([
      ['/x', 'Texto: l\'Alfàs del Pi - "un ejemplo" con comillas de las otras. Y más.'],
    ])
    expect(rastroDeDescartes(tipografico, conOtraPuntuacion)[0].rastro).toBe('vigente')
  })

  it('casa por contención: la página es mucho más larga que la cita', () => {
    const largo = new Map([
      [
        '/datos',
        'a'.repeat(4000) + '805 contratos indexados en el registro municipal' + 'b'.repeat(4000),
      ],
    ])
    expect(rastroDeDescartes(reg, largo)[0].rastro).toBe('vigente')
  })

  it('sin registro no inventa filas', () => {
    expect(rastroDeDescartes(null, texto)).toEqual([])
  })
})

/**
 * Una segunda ancla limita un descarte a la ficha que una persona miró.
 *
 * La nota del hueco «Literal retenido» abre igual en todas las fichas con una
 * cita retenida —veinte el 29-09-2026—: «es una acusación pública que el
 * verificador no ha podido contrastar». El 28-09 la revisión la leyó en
 * f-2025-12-01-cit-66709b como si hablara de la cita impresa de al lado —la
 * [3], puerta toggle, «no es una acusación»—, cuando habla de las dos
 * retenidas. Descartarla por la frase sola la callaría en todas, incluidas las
 * cuatro retenidas que NO son acusaciones, donde el mismo señalamiento sería
 * cierto. Por eso `anchor`: un literal que tiene que aparecer además en el
 * razonamiento del señalamiento (`inference` o `contradictedBy`).
 */
describe('una segunda ancla limita el descarte a la ficha que se miró', () => {
  const FRASE = 'es una acusación pública que el verificador no ha podido contrastar'
  // El señalamiento real de la relectura del 28-09-2026, copiado tal cual.
  const EN_66709B: ReaderFinding = {
    quote: FRASE,
    inference:
      'El lector concluiría que el PSOE hizo una acusación pública contra alguien que no consta en ningún registro. La cita que se muestra es un anuncio neutro de una propuesta de acuerdo, no acusa a nadie.',
    contradictedBy:
      "La cita visible, «Avui duem a ple una proposta d'acord que parteix d'una demanda ciutadana», anuncia una propuesta y no acusa a nadie. La propia página dice justo antes: «sin contraste en los datos — no es una acusación».",
    severity: 'misleading',
  }
  // La misma frase señalada en OTRA ficha, y ahí con razón: la retenida [1] de
  // f-2026-04-20-cit-947479 es la presidencia leyendo el resultado de una
  // votación, que no acusa a nadie.
  const EN_947479: ReaderFinding = {
    quote: FRASE,
    inference:
      'El lector concluiría que la cita retenida acusa a alguien, y es la presidencia leyendo el resultado de una votación.',
    contradictedBy:
      'La cita retenida de la ficha, «Se ha aprobado por este hecho, a vuestro favor, y 8 abstenciones», no acusa a nadie.',
    severity: 'misleading',
  }
  const base = {
    route: '/hallazgos',
    quote: FRASE,
    reason: 'el revisor lee la nota del hueco como si hablara de la cita impresa de al lado',
    editor: 'claude-opus-5.5',
    at: '2026-09-29',
  }
  const sinAncla: RegistroDescartes = { version: 1, items: [base] }
  const anclado: RegistroDescartes = {
    version: 1,
    items: [{ ...base, anchor: "Avui duem a ple una proposta d'acord" }],
  }

  it('un descarte sin ancla sigue casando como hasta ahora: por la frase, en cualquier ficha', () => {
    expect(estaDescartado('/hallazgos', EN_66709B, sinAncla)).toBe(true)
    expect(estaDescartado('/hallazgos', EN_947479, sinAncla)).toBe(true)
  })

  it('con ancla, calla el señalamiento de 66709b', () => {
    expect(estaDescartado('/hallazgos', EN_66709B, anclado)).toBe(true)
  })

  it('con ancla, la misma frase señalada en otra ficha sigue viva', () => {
    expect(estaDescartado('/hallazgos', EN_947479, anclado)).toBe(false)
    expect(sinDescartar('/hallazgos', [EN_66709B, EN_947479], anclado)).toEqual([EN_947479])
  })

  it('el ancla se busca con el mismo plegado que la cita', () => {
    const tipografica: ReaderFinding = {
      ...EN_66709B,
      contradictedBy: EN_66709B.contradictedBy.replace("d'acord", 'd’acord'),
    }
    expect(estaDescartado('/hallazgos', tipografica, anclado)).toBe(true)
  })

  it('un descarte anclado sin señalamiento vivo que lo cumpla sale como huérfano', () => {
    // El mismo criterio que silencia: si sólo vive el de otra ficha, este
    // descarte no calla nada y tiene que decirlo.
    expect(descartesHuerfanos(anclado, new Map([['/hallazgos', [EN_947479]]]))).toHaveLength(1)
    expect(descartesHuerfanos(anclado, new Map([['/hallazgos', [EN_66709B]]]))).toHaveLength(0)
  })

  it('valida el ancla: si está, es texto y llega al suelo de solape', () => {
    expect(() => validarDescartes(anclado)).not.toThrow()
    const corta = { version: 1, items: [{ ...base, anchor: 'Avui' }] }
    expect(() => validarDescartes(corta)).toThrow(/ancla/)
    const vacia = { version: 1, items: [{ ...base, anchor: '   ' }] }
    expect(() => validarDescartes(vacia)).toThrow(/ancla/)
    expect('Avui'.length).toBeLessThan(SOLAPE_MINIMO)
  })

  it('en el registro real, ningún descarte calla sin ancla la frase de la nota de acusación', () => {
    const real = validarDescartes(
      JSON.parse(readFileSync(resolve('review-dismissals.json'), 'utf8')),
    )
    // Decía «el descarte de la nota de acusación va anclado» y exigía que
    // existiera. El 29-09-2026 se retiró, con los demás de la lectura aplanada
    // del hueco: la nota dice ya de qué citas habla (`nombrarCitas`). Lo que se
    // vigila no cambia —que no vuelva uno que la calle en todas las fichas—, y
    // para que la guarda no pase en vacío se prueba antes contra uno que sí.
    const sinAnclaSobreLaNota = (reg: RegistroDescartes) =>
      reg.items.filter(
        (d) =>
          d.route === '/hallazgos' &&
          !d.anchor &&
          estaDescartado('/hallazgos', f(FRASE), { version: 1, items: [d] }),
      )
    expect(sinAnclaSobreLaNota(sinAncla), 'la guarda no ve un descarte sin ancla').toHaveLength(1)
    expect(
      sinAnclaSobreLaNota(real).map((d) => `«${d.quote}» (${d.at})`),
      'descarte sin ancla sobre la frase de todas las fichas',
    ).toEqual([])
  })
})

/**
 * Los cuatro señalamientos de lectura aplanada del hueco «Literal retenido» que
 * leyó la relectura del 29-09-2026 (#179): el revisor pegaba el pie del hueco a
 * la cita impresa de al lado. Dos de f-2026-05-11-cit-a0a379, uno de
 * f-2026-05-11-cit-73d3cf y uno de f-2025-12-01-cit-66709b.
 *
 * Se callaron primero con dos descartes que casaban por la frase sola —«La
 * ficha la atribuye a PSOE.» (4-09) y «Es una acusación que el verificador no
 * ha podido contrastar con ningún registro municipal» (20-09)—, que habrían
 * callado igual uno cierto en cualquier otra ficha; luego, el mismo día, con
 * uno anclado por ficha (#186). Ninguna de las dos cosas lo arreglaba: cada
 * composición nueva de citas y huecos traía el señalamiento de vuelta con otra
 * redacción. Desde el 29-09-2026 lo arregla la página —cada cita abre con su
 * número y el pie del hueco dice de cuál habla (`CitaRetenida`)— y los nueve
 * descartes de la familia se retiraron. Si el revisor vuelve a levantar uno,
 * se relee: no lo calla nadie.
 */
describe('los señalamientos de lectura aplanada del hueco ya no los calla un descarte', () => {
  const real = validarDescartes(JSON.parse(readFileSync(resolve('review-dismissals.json'), 'utf8')))
  const texto = (el: ReturnType<typeof createElement>) => {
    const { container, unmount } = render(el)
    const t = container.textContent ?? ''
    unmount()
    return t
  }
  // Los cuatro, tal cual los guardó la caché de aquella relectura. Ninguno
  // comparte más de 12 caracteres seguidos con el literal de una retenida: el
  // repositorio es público, y ese literal es lo que la ficha no reproduce.
  const HUECO =
    'Es una acusación que el verificador no ha podido contrastar con ningún registro municipal, así que la ficha no reproduce su literal'
  const PSOE = 'La ficha la atribuye a PSOE.'
  const LEIDOS: Record<string, ReaderFinding> = {
    'hueco en 73d3cf': {
      quote: HUECO,
      inference:
        'El lector concluye que lo dicho sobre la vivienda es una acusación y que su literal no aparece en la ficha.',
      contradictedBy:
        'La misma ficha muestra la cita entre comillas («De fet, la vivenda que ens construís…»), con la etiqueta «sin contraste en los datos — no es una acusación». Es una afirmación general sobre vivienda, no una acusación, y el literal sí se reproduce.',
      severity: 'misleading',
    },
    'hueco en a0a379': {
      quote: HUECO,
      inference:
        'El lector entiende que las frases retenidas son acusaciones. Pero una es un dato histórico (la Fira nació en 2001) y otra es una valoración positiva de una campaña. Ninguna acusa a nadie.',
      contradictedBy:
        'El texto de las citas: «la Fira de Comercio nació en el año 2001, hace ya 25 años» y «la campaña 22 Fira de Comercio 2024 fue recibida muy positivamente…». La propia página dice en otro punto «no es una acusación» para las etiquetas de este tipo.',
      severity: 'misleading',
    },
    'grupo en a0a379': {
      quote: PSOE,
      inference:
        'El lector concluye que la ficha atribuye esta cita al PSOE. Sin embargo, la misma cita lleva la etiqueta «sin atribuir», y el resumen la pone en boca de «un grupo no identificado». Se nombra a un grupo concreto donde el resto de la ficha dice que no hay atribución.',
      contradictedBy:
        'La etiqueta «sin atribuir» de la misma cita y el resumen «un grupo no identificado defendió el impacto positivo de la campaña de 2024».',
      severity: 'misleading',
    },
    'grupo en 66709b': {
      quote: PSOE,
      inference:
        'Un lector concluiría que el PSOE pidió publicar el convenio en el portal de transparencia. Esa cita aparece como «sin atribuir», y el resumen habla de «un grupo no identificado».',
      contradictedBy:
        'La misma ficha marca la cita como «sin atribuir» y el resumen dice «un grupo no identificado señala la necesidad de publicar el convenio».',
      severity: 'misleading',
    },
  }

  it('ninguno de los cuatro lo calla ya el registro', () => {
    for (const [cual, s] of Object.entries(LEIDOS)) {
      expect(estaDescartado('/hallazgos', s, real), cual).toBe(false)
    }
  })

  it('porque el hueco ya no imprime las frases sueltas que el revisor pegaba a la vecina', () => {
    // Con cada número que puede llevar una cita en su ficha y cada grupo que
    // puede nombrar, y sin ninguno. Leído del componente, no recitado.
    for (const numero of [1, 2, 3, 4]) {
      for (const g of [null, ...SPEAKER_GROUPS]) {
        const t = texto(
          createElement(CitaRetenida, { numero, attribution: g ? blocLabel(g) : null }),
        )
        const cual = `cita ${numero}, ${g ?? 'sin grupo'}`
        // La de 4-09 era «La ficha la atribuye a PSOE.»: sin número de cita.
        expect(t, cual).not.toContain('La ficha la atribuye')
        expect(t, cual).toContain(`La cita ${numero} es una acusación que el verificador`)
        expect(t, cual).not.toMatch(/(?:^|[.:]\s*)Es una acusación/)
      }
    }
  })

  it('ningún descarte calla por la frase sola un texto que la página repite en cada ficha', () => {
    // Se LEE de los componentes, no se recita: el hueco de una retenida con cada
    // número y cada grupo que puede nombrar, y sin ninguno; y la nota con sus
    // dos ejes, con una retenida y con dos. Es la guarda del bloque de arriba,
    // extendida a todo lo que se repite de ficha en ficha.
    const repetidos = [
      ...[1, 2, 3, 4].flatMap((numero) =>
        [null, ...SPEAKER_GROUPS].map((g) =>
          texto(createElement(CitaRetenida, { numero, attribution: g ? blocLabel(g) : null })),
        ),
      ),
      ...[
        [{ gate: 'hidden' }, { gate: 'toggle', status: 'solo-en-sustituida' }],
        [
          { gate: 'hidden' },
          { gate: 'toggle', status: 'sin-determinar' },
          { gate: 'hidden' },
          { gate: 'toggle' },
        ],
      ].map((entries) =>
        texto(createElement(QuoteProvenanceNote, { entries, curatorName: 'auto-curation-v1' })),
      ),
    ]
    expect(repetidos.join(' ')).toContain(ROTULO_CITA_RETENIDA)
    const sinAnclaSobreLoRepetido = (reg: RegistroDescartes) =>
      reg.items.filter(
        (d) =>
          d.route === '/hallazgos' &&
          !d.anchor &&
          repetidos.some((t) => estaDescartado('/hallazgos', f(t), { version: 1, items: [d] })),
      )
    // Decía «Midió algo: hay descartes sobre el texto repetido», y desde el
    // 29-09-2026 no queda ninguno. Para que no pase en vacío, la guarda se
    // prueba antes contra uno sin ancla sobre el pie de un hueco.
    const control: RegistroDescartes = {
      version: 1,
      items: [
        {
          route: '/hallazgos',
          quote:
            'La cita 2 es una acusación que el verificador no ha podido contrastar con ningún registro municipal',
          reason: 'control de la prueba',
          editor: 'prueba',
          at: '2026-09-29',
        },
      ],
    }
    expect(sinAnclaSobreLoRepetido(control), 'la guarda no ve el control').toHaveLength(1)
    expect(
      sinAnclaSobreLoRepetido(real).map((d) => `«${d.quote}» (${d.at})`),
      'descartes sin ancla sobre texto de todas las fichas',
    ).toEqual([])
  })
})
