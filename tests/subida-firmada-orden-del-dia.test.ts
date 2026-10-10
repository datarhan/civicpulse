/**
 * Un punto del orden del día como evidencia de una subida firmada.
 *
 * Una declaración sobre lo que se llevó a un pleno sólo la sostiene un orden del
 * día o un acta, y la subida firmada sólo citaba contratos adjudicados y
 * convocatorias de la BDNS. El caso: 1sqj7is-081 («ya comenté en el pleno
 * pasado que trajimos Santa Rosa 2»), que sostiene el punto 2 del orden del día
 * del 09-02-2026. Actas no hay que citar: no hay corpus.
 *
 * La fixture es un trozo de `public/data/plenos-agendas.json` del 10-10-2026,
 * tal cual: cinco sesiones —la de Santa Rosa, la de la declaración, una
 * posterior, una con partes de información y de ruegos, y la del punto más
 * largo—. Diseño: docs/superpowers/specs/2026-10-10-orden-del-dia-evidencia-design.md.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  comprobarRegistrosConLaDeclaracion,
  evidenciaDelRegistro,
  registroDeLaSubida,
  subirVeredicto,
} from '../src/scraper/subida-firmada'

const AGENDAS = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/plenos-agendas_2026-10-10.json'), 'utf8'),
)
const REGISTROS = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/subida-firmada-registros_2026-10-04.json'), 'utf8'),
)
const CORPUS = { tenders: REGISTROS.tenders, bdns: REGISTROS.bdns, agendas: AGENDAS }

const SESION = (id: string) => AGENDAS.plenos.find((p: { id: string }) => p.id === id)
const RX4HB4 =
  'https://regmeet.com/aytoribarroja/participaciones/c5b270a763686e776039618cc709f3a6?idioma=castellano'
const MA87E0 =
  'https://regmeet.com/aytoribarroja/participaciones/b5a1d925221b37e2e399f7b319038ba0?idioma=castellano'
const JUEGOS =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=Dsw60vrWRmm5HQrHoP3G5A%3D%3D'
const BDNS = 'https://www.pap.hacienda.gob.es/bdnstrans/GE/es/convocatoria/752816'
const PERSONA = 'María de la Fuente Llorens'

const punto = (enlace: string, n: number | null) => ({ enlace, lote: null, punto: n })

describe('evidenciaDelRegistro · un punto del orden del día', () => {
  it('la sesión, su fecha, su parte, el número y el título tal cual', () => {
    expect(evidenciaDelRegistro(punto(RX4HB4, 2), CORPUS)).toEqual({
      kind: 'agenda',
      ref: RX4HB4,
      snippet:
        'Orden del día del pleno ordinario del 09-02-2026 · parte resolutiva · punto 2: Expedient: 5543/2020/GEN, Acord relatiu al sotmetiment a informació pública de la versió inicial del PRI de la UE Santa Rosa 2',
      stance: 'checked',
    })
  })

  it('el título no se corta: el de un punto de 888 caracteres sale entero', () => {
    const titulo = SESION('1pe3qs8').agenda.find((i: { number: number }) => i.number === 2).title
    expect(titulo.length).toBeGreaterThan(800)
    const { snippet } = evidenciaDelRegistro(punto(SESION('1pe3qs8').link, 2), CORPUS)
    expect(
      snippet.startsWith(
        'Orden del día del pleno urgente del 07-01-2026 · parte resolutiva · punto 2: ',
      ),
    ).toBe(true)
    expect(snippet.endsWith(titulo.replace(/\s+/g, ' ').trim())).toBe(true)
  })

  it('reconoce la sesión con otra consulta en el enlace, y cita el del corpus', () => {
    const otro = RX4HB4.replace('idioma=castellano', 'idioma=valenciano')
    expect(evidenciaDelRegistro(punto(otro, 2), CORPUS).ref).toBe(RX4HB4)
    expect(evidenciaDelRegistro(punto(RX4HB4.split('?')[0], 2), CORPUS).ref).toBe(RX4HB4)
  })

  it('dice la parte como la convocatoria, o no la nombra', () => {
    const zrbgic = SESION('zrbgic').link
    expect(evidenciaDelRegistro(punto(zrbgic, 7), CORPUS).snippet).toContain(
      'del 05-10-2026 · parte de información y control · punto 7: ',
    )
    expect(evidenciaDelRegistro(punto(zrbgic, 8), CORPUS).snippet).toContain(
      'del 05-10-2026 · ruegos y preguntas · punto 8: ',
    )
  })

  it('lo que añade la fila nunca dice que se aprobara: eso lo dice otro registro', () => {
    for (const sesion of AGENDAS.plenos) {
      for (const item of sesion.agenda) {
        const { snippet } = evidenciaDelRegistro(punto(sesion.link, item.number), CORPUS)
        const propio = snippet.slice(
          0,
          snippet.length - item.title.replace(/\s+/g, ' ').trim().length,
        )
        expect(propio, `${sesion.id} punto ${item.number}`).not.toMatch(/aprob|aprov/i)
      }
    }
  })

  it('sin --punto no se sabe qué se cita: enumera los puntos', () => {
    expect(() => evidenciaDelRegistro(punto(RX4HB4, null), CORPUS)).toThrow(/--punto/)
    expect(() => evidenciaDelRegistro(punto(RX4HB4, null), CORPUS)).toThrow(
      /punto 2 · Expedient: 5543\/2020\/GEN/,
    )
  })

  it('un punto que la sesión no tiene se niega', () => {
    expect(() => evidenciaDelRegistro(punto(MA87E0, 1), CORPUS)).toThrow(/no tiene un punto 1/)
  })

  it('--lote con una sesión, o --punto con un contrato, se niegan', () => {
    expect(() => evidenciaDelRegistro({ enlace: RX4HB4, lote: 2, punto: null }, CORPUS)).toThrow(
      /--lote/,
    )
    expect(() => evidenciaDelRegistro({ enlace: JUEGOS, lote: null, punto: 2 }, CORPUS)).toThrow(
      /--punto/,
    )
  })

  it('sin órdenes del día en el corpus, una sesión no está en él', () => {
    const { agendas: _fuera, ...sin } = CORPUS
    expect(() => evidenciaDelRegistro(punto(RX4HB4, 2), sin)).toThrow(/no está/)
  })
})

describe('comprobarRegistrosConLaDeclaracion · lo que un registro puede sostener', () => {
  const agenda = (enlace: string, n: number) => registroDeLaSubida(punto(enlace, n), CORPUS)
  const contrato = () => registroDeLaSubida({ enlace: JUEGOS, lote: null }, CORPUS)
  const convocatoria = () => registroDeLaSubida({ enlace: BDNS, lote: null }, CORPUS)

  it('un orden del día posterior a la declaración no sostiene lo que se dijo antes', () => {
    expect(() =>
      comprobarRegistrosConLaDeclaracion(
        [agenda(MA87E0, 2)],
        { fecha: '2026-03-09', conImporte: false },
        'verificado',
      ),
    ).toThrow(/posterior/)
  })

  it('el de una sesión anterior, o de la misma, sí', () => {
    for (const fecha of ['2026-03-09', '2026-02-09']) {
      expect(() =>
        comprobarRegistrosConLaDeclaracion(
          [agenda(RX4HB4, 2)],
          { fecha, conImporte: false },
          'verificado',
        ),
      ).not.toThrow()
    }
  })

  it('la fecha no acota un contrato ni una convocatoria: esa vía no la miraba, y no cambia', () => {
    // El contrato de los juegos se adjudicó el 08-09-2026.
    expect(() =>
      comprobarRegistrosConLaDeclaracion(
        [contrato(), convocatoria()],
        { fecha: '2026-01-19', conImporte: false },
        'verificado',
      ),
    ).not.toThrow()
  })

  it('con una cifra en la declaración y ningún registro que diga un importe, no llega a verificado', () => {
    for (const registros of [[agenda(RX4HB4, 2)], [convocatoria()]]) {
      expect(() =>
        comprobarRegistrosConLaDeclaracion(
          registros,
          { fecha: '2026-03-09', conImporte: true },
          'verificado',
        ),
      ).toThrow(/importe/)
      expect(() =>
        comprobarRegistrosConLaDeclaracion(
          registros,
          { fecha: '2026-03-09', conImporte: true },
          'parcial',
        ),
      ).not.toThrow()
    }
  })

  it('un contrato con su importe sí la deja llegar a verificado', () => {
    expect(() =>
      comprobarRegistrosConLaDeclaracion(
        [agenda(RX4HB4, 2), contrato()],
        { fecha: '2026-09-30', conImporte: true },
        'verificado',
      ),
    ).not.toThrow()
  })
})

describe('la subida que cita un orden del día', () => {
  it('se escribe con el corpus de los órdenes del día, y nada más', () => {
    const overlay = subirVeredicto(
      { version: 1, generatedAt: '2026-10-10T00:00:00.000Z', entries: {} },
      {
        claimId: '1sqj7is-081-cit-50c5bb',
        veredicto: 'verificado',
        evidencia: [evidenciaDelRegistro(punto(RX4HB4, 2), CORPUS)],
        resumen:
          'El orden del día de la sesión del 9 de febrero de 2026 llevó, en su punto 2, la información pública de la versión inicial del PRI de la UE Santa Rosa 2.',
        editor: PERSONA,
      },
      { tipo: 'cita_obra', publicado: 'sin-datos', resumenesDeMaquina: [] },
      '2026-10-10T09:00:00.000Z',
    )
    const v = overlay.entries['1sqj7is-081-cit-50c5bb'].verification
    expect(v.checkedAgainst).toEqual(['plenos-agendas'])
    expect(v.evidence[0].kind).toBe('agenda')
  })
})
