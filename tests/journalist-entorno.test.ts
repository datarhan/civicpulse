import { describe, it, expect } from 'vitest'
import {
  normalizarEmpresa,
  contrapartesDe,
  rolesDelAnuncio,
  cruzarEntorno,
  estadoFuente,
  type AnuncioEntorno,
} from '../src/scraper/journalist-entorno'

/**
 * `journalist:entorno` va del expediente a la persona, nunca al revés: parte
 * de las contrapartes del Ayuntamiento (adjudicatarios, beneficiarios, edictos
 * que nombran a alguien), resuelve quién administra cada sociedad en la caché
 * del BORME y sólo entonces pregunta si alguna de esas personas es el propio
 * cargo, un familiar DOCUMENTADO (llave) o alguien que comparte sus dos
 * apellidos (pista, que no es nada sin documento). Dos apellidos no son un
 * parentesco; una persona que no aparece en ningún expediente municipal no
 * sale con nombre en ninguna parte, ni siquiera en el fichero privado.
 */
const anuncio = (
  numero: number,
  denominacion: string,
  campos: Array<[string, string]>,
  texto: string,
  fecha = '12.03.24',
): AnuncioEntorno => ({
  numero,
  denominacion,
  campos: campos.map(([etiqueta, valor]) => ({
    etiqueta,
    valor,
    valores: valor.split(';').map((v) => v.trim()),
  })),
  datosRegistrales: {
    tomo: '11146',
    folio: '192',
    seccion: '8',
    hoja: 'V 203606',
    inscripcion: '3',
    fecha,
  },
  texto,
})

const CONCEJAL = { slug: 'alberto-gimeno-calvo', nombre: 'Alberto José Gimeno Calvo' }

const tenders = [
  {
    id: 't1',
    title: 'Obra de asfaltado',
    assignee: 'PAVASAL EMPRESA CONSTRUCTORA, S.A.',
    status: 'awarded',
    awardDate: '2024-03-01',
    finalAmount: 120000,
  },
  {
    id: 't2',
    title: 'Suministro de luminarias',
    assignee: 'Llop Proyectos Integrales SL',
    status: 'formalized',
    awardDate: '2025-01-10',
    finalAmount: 40000,
  },
  {
    id: 't3',
    title: 'Servicio de ocio',
    assignee: 'Gimeno Calvo Eventos SL',
    status: 'awarded',
    awardDate: '2023-09-01',
    finalAmount: 9000,
  },
  {
    id: 't4',
    title: 'Sin adjudicar',
    assignee: null,
    status: 'cancelled',
    awardDate: null,
    finalAmount: null,
  },
  {
    id: 't5',
    title: 'Asistencia técnica',
    assignee: 'María Gimeno Calvo',
    status: 'awarded',
    awardDate: '2022-05-05',
    finalAmount: 3000,
  },
]

const anuncios: AnuncioEntorno[] = [
  anuncio(
    101,
    'PAVASAL EMPRESA CONSTRUCTORA SA',
    [['Adm. Unico', 'FRAGA MARTINEZ LUIS']],
    'Nombramientos. Adm. Unico: FRAGA MARTINEZ LUIS. Datos registrales. T 1, L 1, F 1, S 8, H V 1, I/A 2 (12.03.24).',
  ),
  anuncio(
    102,
    'LLOP PROYECTOS INTEGRALES SOCIEDAD LIMITADA',
    [
      ['Ceses/Dimisiones', ''],
      ['Adm. Unico', 'LLOP SERRA PERE'],
      ['Apoderado', 'GIMENO CALVO ALBERTO JOSE;CALVO RUIZ ANA'],
    ],
    'Ceses/Dimisiones. Adm. Unico: LLOP SERRA PERE. Nombramientos. Apoderado: GIMENO CALVO ALBERTO JOSE;CALVO RUIZ ANA. Datos registrales. T 2, L 2, F 2, S 8, H V 2, I/A 5 (20.01.25).',
    '20.01.25',
  ),
  anuncio(
    103,
    'GIMENO CALVO EVENTOS SL',
    [['Adm. Solid.', 'GIMENO CALVO MARIA;PEREZ GIMENO JOAN']],
    'Constitución. Adm. Solid.: GIMENO CALVO MARIA;PEREZ GIMENO JOAN. Datos registrales. T 3, L 3, F 3, S 8, H V 3, I/A 1 (02.02.23).',
    '02.02.23',
  ),
  anuncio(
    104,
    'SAVOY HOUSE EUROPE SL EN LIQUIDACION',
    [
      ['FIRME', 'S'],
      ['Juez', 'FRANCISCO GIL MONZO'],
      ['Resoluciones', 'D'],
    ],
    'Situación concursal. Procedimiento concursal 631/2023.',
  ),
  anuncio(
    105,
    'OTRA EMPRESA AJENA SL',
    [['Adm. Unico', 'GIMENO CALVO PEDRO']],
    'Nombramientos. Adm. Unico: GIMENO CALVO PEDRO. Datos registrales. T 4, L 4, F 4, S 8, H V 4, I/A 1 (01.01.24).',
  ),
]

const transcripts = {
  '16ujrlm': [
    '[0.0 → 0.0] 3. Aprobación del convenio',
    '[913.9 → 919.6] (SPEAKER_04) Entonces mi pregunta es, ¿debe abstenerse de participar o puede participar?',
    '[933.0 → 945.4] (SPEAKER_05) el señor Gimeno me ha manifestado su deseo de abstenerse en este punto por tener un interés directo en el asunto.',
    '[2898.5 → 2902.5] (SPEAKER_41) uno en contra, siete abstenciones, Partido Popular,',
  ].join('\n'),
}
const plenos = [{ id: '16ujrlm', date: '2023-07-07', title: 'Pleno ordinario' }]

describe('normalizarEmpresa', () => {
  it('quita forma jurídica, puntuación y acentos, y pone mayúsculas', () => {
    expect(normalizarEmpresa('PAVASAL EMPRESA CONSTRUCTORA, S.A.')).toBe(
      'PAVASAL EMPRESA CONSTRUCTORA',
    )
    expect(normalizarEmpresa('Llop Proyectos Integrales SL')).toBe('LLOP PROYECTOS INTEGRALES')
    expect(normalizarEmpresa('INSDAGAR SOCIEDAD LIMITADA')).toBe('INSDAGAR')
    expect(normalizarEmpresa('Obras Públicas Montaner 1, S.L.U.')).toBe('OBRAS PUBLICAS MONTANER 1')
    expect(normalizarEmpresa('SAVOY HOUSE EUROPE SL EN LIQUIDACION')).toBe('SAVOY HOUSE EUROPE')
  })
})

describe('contrapartesDe', () => {
  it('saca una contraparte por adjudicatario, sin las filas sin adjudicatario, y dice de dónde viene cada una', () => {
    const c = contrapartesDe({ tenders, bdns: [], bop: [] })
    expect(c.map((x) => x.nombre)).toEqual([
      'PAVASAL EMPRESA CONSTRUCTORA, S.A.',
      'Llop Proyectos Integrales SL',
      'Gimeno Calvo Eventos SL',
      'María Gimeno Calvo',
    ])
    expect(c[0]).toMatchObject({
      tipo: 'contrato',
      clave: 'PAVASAL EMPRESA CONSTRUCTORA',
      refs: ['t1'],
    })
  })

  it('agrupa las adjudicaciones de la misma contraparte', () => {
    const c = contrapartesDe({
      tenders: [tenders[0], { ...tenders[0], id: 't9', awardDate: '2025-06-01' }],
      bdns: [],
      bop: [],
    })
    expect(c).toHaveLength(1)
    expect(c[0].refs).toEqual(['t1', 't9'])
  })

  it('un edicto del BOP que nombra a una persona entra como contraparte de tipo edicto', () => {
    const c = contrapartesDe({
      tenders: [],
      bdns: [],
      bop: [
        {
          id: 'b1',
          title:
            'Edicto del Ayuntamiento de Riba-roja de Túria sobre licencia de obra a D. Pedro Gimeno Calvo',
        },
        {
          id: 'b2',
          title:
            'Edicto del Ayuntamiento de Riba-roja de Túria sobre aprobación del padrón de basuras',
        },
      ],
    })
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ tipo: 'edicto', refs: ['b1'] })
  })
})

describe('rolesDelAnuncio', () => {
  it('devuelve las personas con cargo societario y deja fuera juez, firmeza y resoluciones', () => {
    expect(rolesDelAnuncio(anuncios[1])).toEqual([
      { etiqueta: 'Adm. Unico', persona: 'LLOP SERRA PERE' },
      { etiqueta: 'Apoderado', persona: 'GIMENO CALVO ALBERTO JOSE' },
      { etiqueta: 'Apoderado', persona: 'CALVO RUIZ ANA' },
    ])
    expect(rolesDelAnuncio(anuncios[3])).toEqual([])
  })
})

describe('cruzarEntorno', () => {
  const base = {
    concejal: CONCEJAL,
    contrapartes: contrapartesDe({ tenders, bdns: [], bop: [] }),
    anuncios,
    llaves: [],
    transcripts,
    plenos,
  }

  it('el propio cargo con un poder en una adjudicataria es «propio», con el anuncio y el expediente', () => {
    const r = cruzarEntorno(base)
    expect(r.propio).toHaveLength(1)
    expect(r.propio[0]).toMatchObject({
      persona: 'GIMENO CALVO ALBERTO JOSE',
      etiqueta: 'Apoderado',
      empresa: 'LLOP PROYECTOS INTEGRALES SOCIEDAD LIMITADA',
      contraparte: 'Llop Proyectos Integrales SL',
      refs: ['t2'],
      bormeNumero: 102,
    })
    expect(r.propio[0].texto).toContain('Apoderado: GIMENO CALVO ALBERTO JOSE')
  })

  it('dos apellidos en una adjudicataria son pista, no llave; un apellido no es nada', () => {
    const r = cruzarEntorno(base)
    const pistas = r.pistaApellidos.map((p) => [p.persona, p.contraparte])
    expect(pistas).toContainEqual(['GIMENO CALVO MARIA', 'Gimeno Calvo Eventos SL'])
    // CALVO RUIZ ANA comparte un apellido: ruido, sin nombre.
    expect(r.pistaApellidos.some((p) => p.persona === 'CALVO RUIZ ANA')).toBe(false)
    expect(r.recuento.ruidoUnApellido).toBeGreaterThanOrEqual(1)
  })

  it('una contraparte que es persona física con los dos apellidos también es pista', () => {
    const r = cruzarEntorno(base)
    expect(
      r.pistaApellidos.some((p) => p.persona === 'María Gimeno Calvo' && p.refs.includes('t5')),
    ).toBe(true)
  })

  it('una sociedad que no es contraparte no aparece con nombres aunque comparta apellidos: sólo cuenta', () => {
    const r = cruzarEntorno(base)
    expect(JSON.stringify(r)).not.toContain('GIMENO CALVO PEDRO')
    expect(JSON.stringify(r)).not.toContain('OTRA EMPRESA AJENA')
    expect(r.recuento.fueraDeExpedientes).toBe(1)
  })

  it('RAGA no es FRAGA: la palabra entera manda', () => {
    const r = cruzarEntorno({
      ...base,
      concejal: { slug: 'robert-raga-gadea', nombre: 'Robert Raga Gadea' },
      anuncios: [
        anuncio(
          201,
          'PAVASAL EMPRESA CONSTRUCTORA SA',
          [['Adm. Unico', 'FRAGA GADEA LUIS']],
          'Nombramientos. Adm. Unico: FRAGA GADEA LUIS.',
        ),
      ],
    })
    expect(r.pistaApellidos).toEqual([])
    expect(r.propio).toEqual([])
  })

  it('un familiar documentado (llave) con cargo en una adjudicataria sale como llave, con su documento', () => {
    const r = cruzarEntorno({
      ...base,
      llaves: [
        {
          nombre: 'María Gimeno Calvo',
          parentesco: 'hermana',
          documento: {
            titulo: 'Acta del Pleno de 03-07-2023, punto 5: abstención por parentesco',
            url: 'https://www.ribarroja.es/acta.pdf',
            fecha: '2023-07-03',
            extracto: 'se abstiene por parentesco con la administradora',
          },
        },
      ],
    })
    expect(r.llaveDocumentada).toHaveLength(2)
    expect(r.llaveDocumentada.map((l) => l.refs.join(','))).toEqual(['t3', 't5'])
    expect(r.llaveDocumentada[0]).toMatchObject({
      persona: 'GIMENO CALVO MARIA',
      parentesco: 'hermana',
      documento: { fecha: '2023-07-03' },
    })
    // ya no cuenta como pista
    expect(r.pistaApellidos.some((p) => p.persona === 'GIMENO CALVO MARIA')).toBe(false)
  })

  it('las abstenciones con motivo salen por sesión, con la línea y si mencionan al cargo', () => {
    const r = cruzarEntorno(base)
    expect(r.abstenciones).toHaveLength(1)
    expect(r.abstenciones[0]).toMatchObject({
      sesion: '16ujrlm',
      fecha: '2023-07-07',
      linea: 3,
      mencionaAlCargo: true,
    })
    expect(r.abstenciones[0].texto).toContain('interés directo')
  })

  it('una abstención política no es una abstención con motivo: «vinculant» no es «vínculo familiar»', () => {
    // Línea real del pleno de 19-01-2026: la primera versión la marcó por «vincul».
    const r = cruzarEntorno({
      ...base,
      transcripts: {
        '19gax3o': [
          '[1407.3 → 1420.6] (SPEAKER_21) nosaltres el que anem a fer és votar una abstenció a este punt, perquè considerem que no ha hagut una bona pràctica, no ha sigut vinculant.',
          "[1500.0 → 1502.0] (SPEAKER_21) el senyor Gimeno s'absté per parentiu amb l'adjudicatària.",
        ].join('\n'),
      },
      plenos: [{ id: '19gax3o', date: '2026-01-19' }],
    })
    expect(r.abstenciones.map((a) => a.linea)).toEqual([2])
  })

  it('un recuento que no invente: cada nivel con su n', () => {
    const r = cruzarEntorno(base)
    expect(r.recuento).toMatchObject({
      contrapartes: 4,
      empresasResueltasEnBorme: 3,
      propio: 1,
      llaveDocumentada: 0,
      pistaApellidos: 2,
      abstenciones: 1,
    })
  })
})

describe('estadoFuente', () => {
  it('found / empty / failed, con motivo, nunca undefined', () => {
    expect(estadoFuente(3)).toEqual({ estado: 'found', n: 3 })
    expect(estadoFuente(0)).toEqual({ estado: 'empty', n: 0 })
    expect(estadoFuente(null, 'fichero ausente')).toEqual({
      estado: 'failed',
      n: 0,
      motivo: 'fichero ausente',
    })
  })
})
