/**
 * Cuando el canal de YouTube y la página de la sesión en regmeet dan vídeos
 * distintos a un pleno, ninguna fuente gana (`pleno-video-fuentes.ts`): la
 * sesión se queda sin vídeo y `check:relations` (`video-fuentes`) lo pone en
 * rojo para que lo lea una persona. Hasta el 08-11-2026 no había dónde dejar lo
 * que esa persona decidía, y la alerta no se podía apagar: estuvo roja desde el
 * 27-10 con dos sesiones de mayo de 2023, y una de ellas era de verdad.
 *
 * `buag5g` (02-05-2023, extraordinaria, 08:30, un solo punto: el sorteo de las
 * mesas electorales) llevaba desde el 01-08-2026 la transcripción del vídeo que
 * el canal titula «Ple extraordinari 2 de maig de 2023»: 66 minutos de OTRA
 * sesión de ese día, sobre el reglamento de carrera profesional. La de regmeet,
 * de 28:15, es la suya: su índice de intervenciones llega a 0:28:15.
 *
 * `pleno-video-decisiones.json` es esa decisión, curada: sólo la escribe
 * `npm run video:decidir`, y guarda lo que decía cada fuente ese día, para que
 * la decisión deje de valer —y la alerta vuelva— si cualquiera de las dos cambia.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  decisionVigente,
  prepararDecision,
  validarDecisiones,
  type DecisionVideo,
} from '../src/scraper/pleno-video-decisiones'
import { discrepanciasDeVideo, videoDeSesion } from '../src/scraper/pleno-video-fuentes'
import { resolveVideoForPleno } from '../src/scraper/pleno-video-match'

const leer = (f: string) => JSON.parse(readFileSync(resolve('public/data', f), 'utf8'))

// ─── Sintético: la forma de las filas reales, con ids inventados ─────────────

const SESION = { id: 'abc123', date: '2023-05-02', kind: 'extraordinario' }
const CANAL = [
  {
    ytId: 'CANAL000001',
    url: 'https://www.youtube.com/watch?v=CANAL000001',
    plenoDate: '2023-05-02',
    title: 'Ple extraordinari 2 de maig de 2023',
  },
]
const REGMEET = [
  {
    plenoId: 'abc123',
    fecha: '2023-05-02',
    lectura: 'con-video' as const,
    ytId: 'REGMEET0001',
    url: 'https://www.youtube.com/watch?v=REGMEET0001',
  },
]
const DECISION: DecisionVideo = {
  plenoId: 'abc123',
  fecha: '2023-05-02',
  elegido: 'REGMEET0001',
  canal: ['CANAL000001'],
  regmeet: 'REGMEET0001',
  razon:
    'El índice de intervenciones de la sesión en regmeet llega al final del vídeo que incrusta, y el del canal es de otra sesión.',
  evidencia: ['Acta de la sesión: un solo punto, el sorteo de mesas.'],
  decididoEl: '2026-11-08',
}

describe('validarDecisiones', () => {
  it('acepta una fila completa', () => {
    expect(validarDecisiones({ items: [DECISION] })).toEqual({ items: [DECISION], errores: [] })
  })

  it('rechaza lo que no deja leer por qué se decidió', () => {
    const malas: Array<[string, Partial<DecisionVideo> & Record<string, unknown>]> = [
      ['razón corta', { razon: 'Es el de regmeet.' }],
      ['sin evidencia', { evidencia: [] }],
      ['elegido fuera de lo que daban las fuentes', { elegido: 'OTRO0000001' }],
      ['fecha que no es un día', { decididoEl: '08/11/2026' }],
      ['un campo que no es del esquema', { curador: 'Alguien' }],
    ]
    for (const [nombre, cambio] of malas) {
      const { items, errores } = validarDecisiones({ items: [{ ...DECISION, ...cambio }] })
      expect(errores.length, nombre).toBeGreaterThan(0)
      expect(items, nombre).toEqual([])
    }
  })

  it('una sesión, una decisión', () => {
    const { errores } = validarDecisiones({ items: [DECISION, { ...DECISION }] })
    expect(errores.join(' ')).toMatch(/abc123/)
  })
})

describe('la decisión, en cada sitio que elige el vídeo de una sesión', () => {
  it('sin decisión, las fuentes discrepan y no se enseña ninguno', () => {
    const r = videoDeSesion(SESION, CANAL, REGMEET)
    expect(r.estado).toBe('discrepan')
    expect(r.video).toBeNull()
  })

  it('con decisión vigente, la página enseña el elegido y no queda discrepancia', () => {
    const r = videoDeSesion(SESION, CANAL, REGMEET, [DECISION])
    expect(r.estado).toBe('decidido')
    expect(r.video?.ytId).toBe('REGMEET0001')
    expect(r.discrepancias).toEqual([])
    expect(discrepanciasDeVideo([SESION], CANAL, REGMEET, [DECISION])).toEqual([])
  })

  it('si una fuente cambia, la decisión deja de valer y la alerta vuelve', () => {
    const regmeetNuevo = [{ ...REGMEET[0], ytId: 'REGMEET0002' }]
    expect(decisionVigente(DECISION, ['CANAL000001'], 'REGMEET0002')).toBe(false)
    const r = videoDeSesion(SESION, CANAL, regmeetNuevo, [DECISION])
    expect(r.estado).toBe('discrepan')
    expect(r.video).toBeNull()
    expect(r.discrepancias.map((d) => d.detalle).join(' ')).toMatch(/decisión del 2026-11-08/)
  })

  it('el transcriptor baja el elegido, también si sólo lo da regmeet', () => {
    const m = resolveVideoForPleno('abc123', [SESION], CANAL, REGMEET, [DECISION])
    expect(m.url).toBe('https://www.youtube.com/watch?v=REGMEET0001')
    expect(m.warnings.join(' ')).toMatch(/decisión del 2026-11-08/)
    // Y sin la decisión se sigue negando.
    expect(() => resolveVideoForPleno('abc123', [SESION], CANAL, REGMEET)).toThrow(/discrepan/)
  })
})

describe('prepararDecision, lo que la CLI comprueba antes de escribir', () => {
  const datos = { plenos: [SESION], canal: CANAL, regmeet: REGMEET, existentes: [] }
  const pide = {
    plenoId: 'abc123',
    elegido: 'REGMEET0001',
    razon: DECISION.razon,
    evidencia: DECISION.evidencia,
    hoy: '2026-11-08',
  }

  it('apunta lo que dice cada fuente hoy', () => {
    expect(prepararDecision(pide, datos)).toEqual(DECISION)
  })

  it('se niega a decidir lo que no discrepa, un vídeo que nadie da o una sesión ya decidida', () => {
    expect(() => prepararDecision(pide, { ...datos, canal: [] })).toThrow(/no discrepan/)
    expect(() => prepararDecision({ ...pide, elegido: 'OTRO0000001' }, datos)).toThrow(
      /ninguna fuente/,
    )
    expect(() => prepararDecision(pide, { ...datos, existentes: [DECISION] })).toThrow(
      /ya tiene una decisión/,
    )
    expect(() => prepararDecision({ ...pide, plenoId: 'nada' }, datos)).toThrow(/no existe/)
  })
})

// ─── Lo publicado ─────────────────────────────────────────────────────────────

const PLENOS = leer('plenos.json').items
const CANAL_PUB = leer('pleno-videos.json').items
const REGMEET_PUB = leer('pleno-videos-regmeet.json').items
const DECISIONES = leer('pleno-video-decisiones.json')

describe('las decisiones publicadas', () => {
  const { items, errores } = validarDecisiones(DECISIONES)

  it('son válidas', () => {
    expect(errores).toEqual([])
  })

  it('zanjan todas las discrepancias de hoy, y ninguna sobra', () => {
    const sin = discrepanciasDeVideo(PLENOS, CANAL_PUB, REGMEET_PUB)
    // La premisa, medida: sin ellas, las fuentes discrepan.
    expect(sin.length).toBeGreaterThan(0)
    expect(discrepanciasDeVideo(PLENOS, CANAL_PUB, REGMEET_PUB, items)).toEqual([])
    // Una decisión sobre una sesión que ya no discrepa está de más: o se
    // retira o se mira por qué las fuentes dejaron de discrepar.
    const discrepan = new Set(sin.map((d) => d.plenoId))
    for (const d of items) expect(discrepan.has(d.plenoId), d.plenoId).toBe(true)
  })
})

describe('buag5g publica la transcripción de su sesión', () => {
  it('es el acta del sorteo de mesas, no el reglamento de carrera profesional de otra sesión', () => {
    const t = readFileSync(resolve('public/data/pleno-transcripts/buag5g.txt'), 'utf8')
    expect(t).toMatch(/6840\/2022/)
    expect(t).toMatch(/Sorteo de Miembros de Mesa/)
    expect(t).not.toMatch(/carrera professional horitzontal/i)
  })

  it('sin la lista de particulares sorteados para las mesas, y diciendo que falta', () => {
    // El acta publicada hasta el 01-08-2026 traía las 27 mesas con el nombre y
    // el número de orden en el censo de cada miembro. Desde el 01-08 ya no se
    // publicaban, y al devolver el acta (08-11-2026) se decidió no volver a
    // publicarlas: son particulares, no cargos.
    const t = readFileSync(resolve('public/data/pleno-transcripts/buag5g.txt'), 'utf8')
    expect(t).not.toMatch(/ORDEN LISTA|\] Nombre:/)
    expect(t).toMatch(/Omitida por CivicPulse: la lista de miembros de las 27 mesas electorales/)
    // Lo demás del acta sigue: la apertura, el acuerdo y el cierre.
    expect(t).toMatch(/siendo las 08:30 horas/)
    expect(t).toMatch(/TERCERO\. Notificar la designación/)
    expect(t).toMatch(/08:38 horas del mismo día/)
  })
})
