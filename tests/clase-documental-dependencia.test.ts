import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  agruparPorClaseDocumental,
  clasesQueCuentan,
  sesionesMencionadas,
  type FilaDocumental,
} from '../src/scraper/clase-documental'

/**
 * La columna de /laboratorio/cobertura que cuenta, por tipo de documento, las
 * declaraciones que lo NOMBRAN —y que es el material de una solicitud de
 * acceso— contaba por una expresión regular y nada más.
 *
 * Leídas una a una el 19-10-2026, de las 14 «actas» sólo 2 o 3 remitían de
 * verdad a un acta que no tengamos: las demás citaban plenos cuya acta ya
 * publicamos (public/data/pleno-actas.json) o no eran actas de pleno («un acta
 * pormenorizada de dicha reunión»). De los 53 «informes», una veintena los
 * firmaba otro órgano —el Consell Jurídic Consultiu, la Confederación
 * Hidrográfica, un ministerio— o era el del periodo medio de pago, que publica
 * Hacienda; de los 19 «planes», el europeo de recuperación, uno de 1959 y otros
 * de otras administraciones. Pedirle al Ayuntamiento lo que no es suyo, o lo
 * que ya publica, es la clase de ejemplo que deja inadmitir una petición
 * entera (art. 18.1.e de la Ley 19/2013).
 *
 * Las frases son las publicadas, con su sesión.
 */

const ACTAS = new Set(
  (
    JSON.parse(readFileSync('public/data/pleno-actas.json', 'utf8')) as {
      items: Array<{ fecha: string }>
    }
  ).items.map((x) => x.fecha),
)
const CTX = { sesionesConActa: ACTAS }
const cuenta = (verbatim: string, plenoDate: string) =>
  clasesQueCuentan({ verbatim, plenoDate }, CTX)

describe('acta · sólo la de un pleno cuya acta no publicamos', () => {
  // Las 14 filas que la columna contaba el 19-10-2026, con lo que les toca.
  const FILAS: Array<[string, string, string, boolean]> = [
    // [id, sesión, literal, ¿cuenta como acta?]
    [
      '15uvjew-009-afi-ed1e8f',
      '2026-07-27',
      'En el Pleno de febrero del 21 se acuerda la suspensión del procedimiento de contratación del servicio dada la sentencia.',
      true, // 2021: no hay acta publicada de entonces
    ],
    [
      '15uvjew-102-cit-054dbf',
      '2026-07-27',
      'Ya en el pleno celebrado el 3 de junio de 2024 acordamos la adhesión al convenio marco de colaboración entre la Generalitat,',
      false, // 2024-06-03 está en pleno-actas.json
    ],
    [
      '15uvjew-103-cit-69b285',
      '2026-07-27',
      'Ya en el pleno celebrado el 3 de junio de 2024 acordamos la adhesión al convenio marco de colaboración entre la Generalitat, la FEM y los municipios para el impulso de la promoción de viviendas de protección pública en suelo en las administraciones locales.',
      false,
    ],
    [
      '1tgd1h4-105-afi-71c577',
      '2024-07-29',
      'Acuerdo Plenario de fecha 26 de septiembre de 2016',
      true, // 2016
    ],
    [
      '1tgd1h4-128-cit-474a53',
      '2024-07-29',
      'solicitan a este Ayuntamiento remita acuerdo plenario proponiendo las dos festividades locales que, con carácter retribuido y no recuperable y por su carácter tradicional, habrán de celebrarse durante el año 2025',
      false, // sin fecha: la sesión en que se dice, cuya acta publicamos; 2025 es futuro
    ],
    [
      '1tgd1h4-176-afi-3349bc',
      '2024-07-29',
      'Por medio de una reunión presencial en el despacho de la Vicesecretaría (Plaza del Ayto. 9 de Ribaroja de Túria), siempre previa solicitud del denunciante, realizándose un acta pormenorizada de dicha reunión',
      false, // el acta de una reunión no es un acta de pleno
    ],
    [
      '1tgd1h4-210-afi-4cf05f',
      '2024-07-29',
      'mediante acuerdo plenario de fecha 15 de abril de 2024, se aprobó la declaración institucional presentada por todos los grupos políticos que componen la Corporación Municipal',
      false,
    ],
    [
      'brxx5g-008-cit-6bba81',
      '2026-07-06',
      'en el pleno de 1 de diciembre de 2025 iniciamos el expediente de resolución de oficio de la adjudicación de la mercantil a Trotavelladona para la gavina',
      false,
    ],
    [
      'brxx5g-008-cit-f78e66',
      '2026-07-06',
      'Por acuerdo plenario del 9 de febrero resolvimos dichas alegaciones y solicitamos dictamen al Consejo Jurídico Consultivo.',
      false, // 9 de febrero de 2026, publicada
    ],
    [
      'c8kr44-086-afi-9e9ab7',
      '2025-09-08',
      'En el Pleno de febrero nos pusimos un plazo de un año ampliable, incluso a dos',
      false, // febrero de 2025: el pleno del 10 está publicado
    ],
    [
      'c8kr44-249-cit-5da930',
      '2025-09-08',
      'tiene que hacer un acta, una reunión a cuatro bandas, Ayuntamiento, Diputación Provincial, Militares y Ministerio de Transporte y Movilidad Sostenible para que se encargue de la obra',
      false,
    ],
    [
      'k4olcs-014-afi-126921',
      '2026-04-20',
      'en julio del 24, en acuerdo plenario, se aprobó el documento referido a la política del sistema interno de información',
      false, // julio de 2024: sus tres plenos están publicados
    ],
    [
      'k4olcs-015-afi-45763f',
      '2026-04-20',
      'Más tarde, en julio del 24, en acuerdo plenario, se aprobó el documento referido a la política del sistema interno de información',
      false,
    ],
    ['k4olcs-151-afi-678cbf', '2026-04-20', 'En el 2023 se aprobó un acuerdo plenario', true],
  ]

  for (const [id, sesion, literal, esperado] of FILAS) {
    it(`${id}: ${esperado ? 'cuenta' : 'no cuenta'}`, () => {
      expect(cuenta(literal, sesion).includes('acta')).toBe(esperado)
    })
  }

  it('de las 14, quedan 3', () => {
    const r = agruparPorClaseDocumental(
      FILAS.map(([, plenoDate, verbatim]) => ({ verbatim, plenoDate })),
      CTX,
    )
    expect(r.porClase.acta).toBe(3)
  })

  it('sin el registro de actas, no se aparta ninguna por publicada', () => {
    // No poder leerlo no es saber que están todas: se cuentan.
    expect(
      clasesQueCuentan(
        { verbatim: FILAS[1][2], plenoDate: FILAS[1][1] },
        { sesionesConActa: null },
      ),
    ).toContain('acta')
  })
})

describe('sesionesMencionadas · la sesión de la que se habla', () => {
  it('fecha entera, mes con año de dos cifras, mes sin año y año suelto', () => {
    expect(sesionesMencionadas('el pleno celebrado el 3 de junio de 2024', '2026-07-27')).toEqual([
      { dia: '2024-06-03' },
    ])
    expect(sesionesMencionadas('En el Pleno de febrero del 21', '2026-07-27')).toEqual([
      { mes: '2021-02' },
    ])
    // Sin año: el último febrero que ya había pasado cuando se dijo.
    expect(sesionesMencionadas('En el Pleno de febrero', '2025-09-08')).toEqual([
      { mes: '2025-02' },
    ])
    expect(sesionesMencionadas('acuerdo plenario del 9 de febrero', '2026-07-06')).toEqual([
      { dia: '2026-02-09' },
    ])
    expect(sesionesMencionadas('En el 2023 se aprobó', '2026-04-20')).toEqual([{ anyo: '2023' }])
  })

  it('una fecha posterior a la sesión no es una sesión pasada', () => {
    expect(sesionesMencionadas('habrán de celebrarse durante el año 2025', '2024-07-29')).toEqual(
      [],
    )
  })
})

describe('informes, planes y expedientes de otro órgano no se cuentan', () => {
  const AJENAS: Array<[string, string, string]> = [
    [
      '15000go-021-afi-7899f2',
      '2023-05-24',
      "Rebut el 30 de juny de 2016, amb registre d'entrada núm. 009915 el dictamen emés pel Consell Jurídic Consultiu de la Comunitat Valenciana, en el qual conclou que",
    ],
    [
      '15000go-138-cit-a654ac',
      '2023-05-24',
      "el dictamen emés pel Consell Jurídic Consultiu de la Comunitat Valenciana, en el qual conclou que \"...procedeix que el Ple de l'Ajuntament de Riba-roja de Túria acorde resoldre l'adjudicació dels citats programes d'actuació i els convenis urbanístics, declaran",
    ],
    [
      '15000go-053-afi-fc4f93',
      '2023-05-24',
      'La CHJ emet informe el 12 de març de 2021 en el qual estableix les següents consideracions a tindre en compte',
    ],
    [
      '15000go-091-cit-dc0efc',
      '2023-05-24',
      "En data 15 de maig de 2003 s'emet informe per part de Confederació Hidrogràfica del Xúquer",
    ],
    [
      'rx4hb4-346-afi-809b1e',
      '2026-02-09',
      "Sempre estem sistemàticament per baix de la mitja espanyola en recursos per habitant, i ho reconeixen informes oficials que abans ha nomenat José Ángel i ho reconeix el propi Ministeri d'Hisenda.",
    ],
    [
      'qz6weg-215-afi-a05eaa',
      '2025-12-01',
      'el informe trimestral del periodo medio de pago y morosidad del tercer trimestre del 2025',
    ],
    [
      'rmtyr-223-afi-abe484',
      '2025-07-31',
      'El presupuesto de ejecución basado en los informes técnicos del Ayuntamiento de Mislata es entre el 50 y el 60%.',
    ],
    [
      'qz6weg-051-cit-b30734',
      '2025-12-01',
      'financiados por la Unión Europea en el marco del Plan de Recuperación, Transformación y Resiliencia.',
    ],
    [
      'qz6weg-084-afi-612adb',
      '2025-12-01',
      'En la tercera década, de 1959 a 1969, con el plan de estabilización económica del Opus Dei, se abandona el modelo autárquico falangista.',
    ],
    [
      'brxx5g-008-cit-51816d',
      '2026-07-06',
      'El consejo jurídico consultivo nos presentó expediente relativo a esa dicha resolución en el que confirman que procede la resolución de dicha adjudicación del programa.',
    ],
  ]
  for (const [id, sesion, literal] of AJENAS) {
    it(`${id}: nombra el órgano, no cuenta`, () => {
      const c = cuenta(literal, sesion)
      expect(c).not.toContain('informe-tecnico')
      expect(c).not.toContain('plan-interno')
      expect(c).not.toContain('expediente')
    })
  }

  const PROPIAS: Array<[string, string, string, string]> = [
    [
      '1tgd1h4-013-afi-46e105',
      '2024-07-29',
      'Visto el informe emitido por el Ingeniero Municipal en fecha 12 de julio de 2024',
      'informe-tecnico',
    ],
    [
      '1pe3qs8-009-afi-7e05ca',
      '2026-01-07',
      'Esto se recoge en el propio informe de la auditora externa, además de los informes técnicos y jurídicos del propio ayuntamiento',
      'informe-tecnico',
    ],
    [
      'otxq2c-189-cit-f57cd1',
      '2025-10-06',
      'Tenemos el expediente 3567, donde el contexto de la concesión de prórroga',
      'expediente',
    ],
    [
      '19gax3o-011-afi-add9e6',
      '2026-01-19',
      'desde el Grupo Municipal de Compromiso, vamos a recolzar este plan de contratación 2026',
      'plan-interno',
    ],
  ]
  for (const [id, sesion, literal, clase] of PROPIAS) {
    it(`${id}: documento del Ayuntamiento, cuenta`, () => {
      expect(cuenta(literal, sesion)).toContain(clase)
    })
  }
})

describe('agrupar · lo apartado no se reparte ni se pierde', () => {
  it('una fila cuyo único documento se aparta sale en `apartadas`, no en una clase', () => {
    const filas: FilaDocumental[] = [
      { verbatim: 'La CHJ emet informe el 12 de març de 2021', plenoDate: '2023-05-24' },
      { verbatim: 'Visto el informe emitido por el Ingeniero Municipal', plenoDate: '2024-07-29' },
      { verbatim: 'Vox dice que no, que no', plenoDate: '2024-07-29' },
    ]
    const r = agruparPorClaseDocumental(filas, CTX)
    expect(r.porClase['informe-tecnico']).toBe(1)
    expect(r.apartadas).toBe(1)
    expect(r.sinDocumento).toBe(1)
    expect(r.total).toBe(3)
  })
})
