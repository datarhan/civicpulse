/**
 * La revisión de la subida firmada del 19-10-2026: lo que un contrato puede
 * sostener de una declaración, y lo que su fila dice de él.
 *
 * Lo que se encontró ese día en main, con las 13 subidas que citan un contrato:
 *
 *  · Un contrato no tenía fecha para esta vía (`fecha: null`), y la guarda que ya
 *    negaba un orden del día posterior a la declaración se lo saltaba. 10 de las
 *    13 citan una adjudicación publicada DESPUÉS de lo que se dijo; cuatro son
 *    `verificado` (c8kr44-045, -229, -230 y -231, dichas el 08-09-2025) y una
 *    (ma87e0-157) es una PROMESA, que se sigue en /promesas.
 *  · Cualquier importe en la fila dejaba llegar a `verificado`, sin mirar si era
 *    el que dijo la declaración; y el «valor estimado por todo su plazo» de una
 *    concesión contaba como importe.
 *  · Una enajenación o la explotación de un bar se habrían escrito «adjudicado a
 *    <persona> por X €», como si el Ayuntamiento le pagara; las adjudicatarias
 *    con entidades HTML salían tal cual («Arnau&amp;March»); y 11 contratos
 *    citables tienen por título un código CPV.
 *
 * Con las filas reales (tests/fixtures/subida-firmada-revision_2026-10-19.json).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ingresoMunicipal } from '../src/lib/contract-status'
import {
  comprobarRegistrosConLaDeclaracion,
  evidenciaDelRegistro,
  registroDeLaSubida,
  type RegistroDeLaSubida,
} from '../src/scraper/subida-firmada'

const F = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/subida-firmada-revision_2026-10-19.json'), 'utf8'),
)
const CORPUS = { tenders: F.tenders, bdns: F.bdns, agendas: F.agendas }
const NBSP = ' '

interface Contrato {
  id: string
  permalink: string
  title: string
}
const contrato = (id: string): Contrato => {
  const c = F.tenders.contracts.find((r: Contrato) => r.id === id)
  if (!c) throw new Error(`${id} no está en el fixture`)
  return c
}
const licitacionDe = (id: string) =>
  F.tenders.tenders.find((t: { id: string }) => String(t.id) === id) ?? null

/** La primera fila citada por una subida firmada, como pedida a la vía hoy. */
const pedidaDe = (claimId: string, n = 0) => {
  const fila = F.subidas[claimId].verification.evidence[n]
  const lote = /\blote (\d+)\b/.exec(fila.snippet)
  return { enlace: fila.ref, lote: lote ? Number(lote[1]) : null }
}
const registrosDe = (claimId: string): RegistroDeLaSubida[] =>
  F.subidas[claimId].verification.evidence.map((_: unknown, i: number) =>
    registroDeLaSubida(pedidaDe(claimId, i), CORPUS),
  )
const declaracion = (claimId: string) => {
  const d = F.declaraciones[claimId]
  return { fecha: d.plenoDate, tipo: d.type, importe: d.amountEuros }
}

describe('un contrato tiene fecha: el día en que se publicó su adjudicación', () => {
  it('la del registro, la misma que imprime la fila', () => {
    const r = registroDeLaSubida(pedidaDe('c8kr44-229-cit-1356bf'), CORPUS)
    expect(r.fecha).toBe('2026-04-01')
    expect(r.fila.snippet).toContain('adjudicación publicada el 01-04-2026')
  })

  it('sin fecha de adjudicación no se cita: no se sabría si es anterior a lo dicho', () => {
    const sinFecha = contrato('1794430#24')
    expect(() => registroDeLaSubida({ enlace: sinFecha.permalink, lote: null }, CORPUS)).toThrow(
      /fecha/,
    )
  })

  it('una convocatoria de la BDNS también la tiene: la de su publicación', () => {
    const r = registroDeLaSubida(pedidaDe('ma87e0-152-cit-786d7e'), CORPUS)
    expect(r.fecha).toBe('2024-04-04')
  })
})

describe('comprobarRegistrosConLaDeclaracion · un contrato posterior a lo dicho no lo sostiene', () => {
  it('c8kr44-229, -230 y -231 (dichas el 08-09-2025): adjudicación publicada el 01-04-2026', () => {
    for (const id of ['c8kr44-229-cit-1356bf', 'c8kr44-230-cit-56b068', 'c8kr44-231-cit-faf7d3']) {
      expect(F.subidas[id].verification.verdict).toBe('verificado')
      expect(() =>
        comprobarRegistrosConLaDeclaracion(registrosDe(id), declaracion(id), 'verificado'),
      ).toThrow(/01-04-2026.*posterior.*08-09-2025/s)
    }
  })

  it('c8kr44-045: publicada dos días después; el acuerdo puede ser anterior, y entonces lo dice otro registro', () => {
    const id = 'c8kr44-045-afi-8e7181'
    expect(() =>
      comprobarRegistrosConLaDeclaracion(registrosDe(id), declaracion(id), 'verificado'),
    ).toThrow(/10-09-2025.*posterior/s)
  })

  it('un contrato adjudicado antes de lo dicho sí la sostiene (k4olcs-018: 2024 frente a 2026)', () => {
    const id = 'k4olcs-018-afi-1077bc'
    expect(() =>
      comprobarRegistrosConLaDeclaracion(registrosDe(id), declaracion(id), 'verificado'),
    ).not.toThrow()
  })

  it('el mismo día que se dijo, también: no es posterior', () => {
    const r = registroDeLaSubida(pedidaDe('c8kr44-229-cit-1356bf'), CORPUS)
    expect(() =>
      comprobarRegistrosConLaDeclaracion(
        [r],
        { fecha: '2026-04-01', tipo: 'cita_obra', importe: null },
        'parcial',
      ),
    ).not.toThrow()
  })

  it('una convocatoria posterior tampoco', () => {
    const r = registroDeLaSubida(pedidaDe('ma87e0-152-cit-786d7e'), CORPUS)
    expect(() =>
      comprobarRegistrosConLaDeclaracion(
        [r],
        { fecha: '2024-01-01', tipo: 'cita_obra', importe: null },
        'parcial',
      ),
    ).toThrow(/posterior/)
  })
})

describe('una promesa no la sostiene un contrato', () => {
  it('ma87e0-157 (promesa): ni siquiera con un contrato anterior a lo prometido', () => {
    const id = 'ma87e0-157-pro-7ce20e'
    expect(F.declaraciones[id].type).toBe('promesa')
    const registros = registrosDe(id)
    expect(() => comprobarRegistrosConLaDeclaracion(registros, declaracion(id), 'parcial')).toThrow(
      /promesa/,
    )
    // Aunque el contrato fuera anterior: que se cumpla es otra afirmación.
    expect(() =>
      comprobarRegistrosConLaDeclaracion(
        registros,
        { fecha: '2026-12-31', tipo: 'promesa', importe: null },
        'parcial',
      ),
    ).toThrow(/promesa.*\/promesas/s)
  })

  it('un orden del día anterior a una promesa sigue valiendo: lo que se llevó al pleno', () => {
    const r = registroDeLaSubida(pedidaDe('rx4hb4-006-cit-13b19d'), CORPUS)
    expect(() =>
      comprobarRegistrosConLaDeclaracion(
        [r],
        { fecha: '2026-03-01', tipo: 'promesa', importe: null },
        'parcial',
      ),
    ).not.toThrow()
  })
})

describe('verificado con una cifra exige que la fila diga ESA cifra', () => {
  it('k4olcs-018-afi-7abae5: «80.666» y la fila 80.666,66 € → sí', () => {
    const id = 'k4olcs-018-afi-7abae5'
    expect(F.declaraciones[id].amountEuros).toBe(80666)
    expect(() =>
      comprobarRegistrosConLaDeclaracion(registrosDe(id), declaracion(id), 'verificado'),
    ).not.toThrow()
  })

  it('una cifra que ningún registro citado dice no llega a verificado; a parcial, sí', () => {
    const id = 'k4olcs-018-afi-7abae5'
    const otra = { ...declaracion(id), importe: 66666 }
    expect(() => comprobarRegistrosConLaDeclaracion(registrosDe(id), otra, 'verificado')).toThrow(
      /66\.666.*80\.666,66/s,
    )
    expect(() => comprobarRegistrosConLaDeclaracion(registrosDe(id), otra, 'parcial')).not.toThrow()
  })

  it('c8kr44-142: «330.000» frente a 296.195,90 € no es la misma cifra', () => {
    const r = registroDeLaSubida(pedidaDe('c8kr44-142-cit-b8c30e'), CORPUS)
    expect(() =>
      comprobarRegistrosConLaDeclaracion(
        [r],
        { fecha: '2026-09-30', tipo: 'cita_obra', importe: 330000 },
        'verificado',
      ),
    ).toThrow(/cifra/)
  })

  it('el valor estimado de una concesión por todo su plazo nunca establece una cifra', () => {
    const agua = registroDeLaSubida(pedidaDe('k4olcs-101-cit-ddd6c4'), CORPUS)
    expect(agua.fila.snippet).toContain(`55.685.178,79${NBSP}€`)
    expect(agua.importe).toBeNull()
    expect(() =>
      comprobarRegistrosConLaDeclaracion(
        [agua],
        { fecha: '2026-09-30', tipo: 'cita_obra', importe: 55685178.79 },
        'verificado',
      ),
    ).toThrow(/importe/)
  })

  it('basta con que lo diga uno de los registros citados (k4olcs-019: dos contratos)', () => {
    const id = 'k4olcs-019-cit-947479'
    expect(() =>
      comprobarRegistrosConLaDeclaracion(registrosDe(id), declaracion(id), 'verificado'),
    ).not.toThrow()
  })
})

describe('ingresoMunicipal · contratos por los que el Ayuntamiento cobra', () => {
  it('una enajenación: 31583 y 285030', () => {
    expect(ingresoMunicipal(contrato('31583'))).toBe('enajenacion')
    expect(ingresoMunicipal(contrato('285030'))).toBe('enajenacion')
  })

  it('la explotación de un bar municipal, la tipe Gobierto como la tipe: 9554, 33712, 130643, 1538292', () => {
    for (const id of ['9554', '33712', '130643', '1538292']) {
      expect(ingresoMunicipal(contrato(id)), id).toBe('explotacion')
    }
  })

  it('un lote de una concesión de uso privativo, por el título de su licitación: 1892773#1', () => {
    const lote = contrato('1892773#1')
    expect(ingresoMunicipal(lote)).toBeNull()
    expect(ingresoMunicipal(lote, licitacionDe('1892773')?.title)).toBe('explotacion')
  })

  it('pagar por un inmueble no es cobrar: un arrendamiento (72576), una adquisición (4684840), una obra', () => {
    for (const id of ['72576', '4684840', '685889', '46717']) {
      expect(ingresoMunicipal(contrato(id)), id).toBeNull()
    }
  })
})

describe('la fila de lo que cobra el Ayuntamiento', () => {
  it('una enajenación dice que la paga la adjudicataria al Ayuntamiento, nunca «adjudicado … por»', () => {
    for (const id of ['31583', '285030']) {
      const { snippet } = evidenciaDelRegistro(
        { enlace: contrato(id).permalink, lote: null },
        CORPUS,
      )
      expect(snippet, id).toMatch(/enajenación adjudicada a .+, que paga al Ayuntamiento [\d.,]+/)
      expect(snippet, id).not.toMatch(/adjudicado a .+ por/)
    }
  })

  it('la explotación de un bar no se cita: el registro no dice qué es su importe ni hacia dónde va', () => {
    for (const id of ['9554', '33712', '130643']) {
      expect(
        () => evidenciaDelRegistro({ enlace: contrato(id).permalink, lote: null }, CORPUS),
        id,
      ).toThrow(/explotación.*no el Ayuntamiento/s)
    }
  })
})

describe('las entidades HTML del registro no pasan a la fila', () => {
  it('«Arnau&amp;March», «RESEARCH &amp; STRATEGY», «OIL &amp; STEEL» se leen con su «&»', () => {
    const casos: Array<[string, string]> = [
      ['7483049', 'Construcciones Arnau&March, S.L.'],
      ['685889', 'Construcciones Arnau&March, S.L.'],
      ['2801214', 'EQUALITY RESEARCH & STRATEGY CONSULTING, S.L.'],
      ['23513', 'PM OIL & STEEL IBERICA SL'],
    ]
    for (const [id, nombre] of casos) {
      const { snippet } = evidenciaDelRegistro(
        { enlace: contrato(id).permalink, lote: null },
        CORPUS,
      )
      expect(snippet, id).toContain(`adjudicado a ${nombre} por`)
      expect(snippet, id).not.toContain('&amp;')
    }
  })
})

describe('un título que es un código CPV toma el de su licitación', () => {
  it('1794430#23: el contrato derivado del SDA ESDA2/2022, con el objeto que dice su CPV', () => {
    const c = contrato('1794430#23')
    expect(c.title).toMatch(/^92000000-/)
    const { snippet } = evidenciaDelRegistro({ enlace: c.permalink, lote: null }, CORPUS)
    expect(snippet).toMatch(
      /^Contrato derivado del sistema dinámico de adquisición ESDA2\/2022 · objeto según su CPV: Servicios de esparcimiento, culturales y deportivos · adjudicado a GRUPO A RIURE por/,
    )
    expect(snippet).not.toMatch(/\d{8}-/)
  })

  it('4889055#1: el de ESDA1/2025', () => {
    const c = contrato('4889055#1')
    const { snippet } = evidenciaDelRegistro({ enlace: c.permalink, lote: null }, CORPUS)
    expect(snippet).toMatch(
      /^Contrato derivado del sistema dinámico de adquisición ESDA1\/2025 · objeto según su CPV: Servicios de arquitectura, construcción, ingeniería e inspección · adjudicado a José Luis Moreno Delgado por/,
    )
  })

  it('sin licitación que diga qué es, no se cita: un código no dice de qué es el contrato', () => {
    const c = contrato('1794430#23')
    const sinSda = {
      tenders: {
        contracts: [c],
        tenders: F.tenders.tenders.filter((t: { id: string }) => String(t.id) !== '1794430'),
      },
      bdns: F.bdns,
    }
    expect(() => evidenciaDelRegistro({ enlace: c.permalink, lote: null }, sinSda)).toThrow(/CPV/)
  })
})
