import { describe, it, expect } from 'vitest'
import {
  ESTADOS_SOLICITUD,
  estadoDeSolicitud,
  venceEl,
  frasePublica,
  SENTIDOS_RESPUESTA,
  validarRegistroSolicitudes,
  type SolicitudAcceso,
} from '../src/scraper/solicitud-acceso'

const base: SolicitudAcceso = {
  id: 'solicitud-2026-09-informe-tecnico',
  clase: 'informe-tecnico',
  titulo: 'Los informes técnicos citados en las sesiones de 2026',
  presentadaEl: '2026-09-01',
  registro: 'REG-2026-004512',
  respuesta: null,
  reclamacion: null,
}

describe('estadoDeSolicitud · cinco desenlaces', () => {
  it('sin solicitud, sin-solicitar — y NO «pendiente»', () => {
    // Doblar «no lo hemos pedido» dentro de «esperando respuesta» es el defecto
    // que este repositorio ya ha pagado tres veces.
    expect(estadoDeSolicitud(null, '2026-09-15')).toBe('sin-solicitar')
  })

  it('dentro del mes del art. 20, en-plazo', () => {
    expect(estadoDeSolicitud(base, '2026-09-15')).toBe('en-plazo')
    // El último día todavía está en plazo.
    expect(estadoDeSolicitud(base, '2026-10-01')).toBe('en-plazo')
  })

  it('pasado el mes sin contestar, vencida-sin-respuesta', () => {
    expect(estadoDeSolicitud(base, '2026-10-02')).toBe('vencida-sin-respuesta')
  })

  it('con respuesta, respondida — aunque haya vencido el plazo', () => {
    const r = { ...base, respuesta: { fecha: '2026-10-20', sentido: 'parcial' as const } }
    expect(estadoDeSolicitud(r, '2026-11-30')).toBe('respondida')
  })

  it('con reclamación, reclamada — manda sobre todo lo demás', () => {
    const r = {
      ...base,
      respuesta: { fecha: '2026-10-20', sentido: 'denegado' as const },
      reclamacion: { fecha: '2026-11-02', organo: 'consell-cv' as const },
    }
    expect(estadoDeSolicitud(r, '2026-12-01')).toBe('reclamada')
  })

  it('venceEl suma un mes natural, como el art. 20', () => {
    expect(venceEl('2026-09-01')).toBe('2026-10-01')
    expect(venceEl('2026-01-31')).toBe('2026-02-28') // no inventa un 31 de febrero
  })
})

describe('frasePublica · el silencio no es una denegación', () => {
  it('el silencio dice que NO CONTESTARON, nunca «denegado»', () => {
    // El art. 20.4 hace el silencio negativo en derecho. La frase honesta es el
    // hecho ocurrido, no la ficción jurídica: publicar «denegado» sería
    // atribuir al Ayuntamiento un acto que no realizó.
    const f = frasePublica(base, '2026-10-15')
    expect(f).toMatch(/no (han )?contestad/i)
    expect(f).not.toMatch(/deneg/i)
  })

  it('una denegación de verdad sí se llama denegación', () => {
    const r = { ...base, respuesta: { fecha: '2026-09-20', sentido: 'denegado' as const } }
    expect(frasePublica(r, '2026-10-15')).toMatch(/deneg/i)
  })

  it('y una clase sin pedir no habla de plazos', () => {
    const f = frasePublica(null, '2026-10-15')
    expect(f).not.toMatch(/plazo|contestad|deneg/i)
  })
})

describe('validarRegistroSolicitudes', () => {
  it('acepta un registro bien formado', () => {
    expect(() => validarRegistroSolicitudes({ version: 1, items: [base] })).not.toThrow()
  })

  it('rechaza una clase que no se puede pedir', () => {
    // `contrato` se nombra mucho, pero de eso ya tenemos corpus: pedirlo sería
    // pedir algo publicado y debilitar las cuatro que sí hacen falta.
    expect(() =>
      validarRegistroSolicitudes({
        version: 1,
        items: [{ ...base, clase: 'contrato' as never }],
      }),
    ).toThrow(/no es una clase pedible|contrato/i)
  })

  it('rechaza una reclamación sin órgano', () => {
    expect(() =>
      validarRegistroSolicitudes({
        version: 1,
        items: [{ ...base, reclamacion: { fecha: '2026-11-02' } as never }],
      }),
    ).toThrow()
  })

  it('el enum se exporta, no se recita', () => {
    expect([...ESTADOS_SOLICITUD].sort()).toEqual(
      ['en-plazo', 'reclamada', 'respondida', 'sin-solicitar', 'vencida-sin-respuesta'].sort(),
    )
  })
})

/**
 * Cada sentido del enum tiene su frase, EN EJECUCIÓN.
 *
 * El 2026-09-17 entró `no-les-corresponde` y `frasePublica` llevaba su propia
 * copia de la tabla de frases como literal sin tipar. Con `"strict": false` en
 * el tsconfig, indexar ese literal con la unión ampliada da `any` en silencio:
 * tsc aprobó y la frase habría salido «undefined el …» en `/laboratorio/cobertura`
 * en cuanto alguien registrara una respuesta así con el CLI, cuyo validador ya
 * la aceptaba. Dos copias escritas a mano de la misma tabla se separaron en el
 * mismo commit que las necesitaba juntas.
 */
describe('frasePublica · cada sentido compone una frase entera', () => {
  it.each([...SENTIDOS_RESPUESTA])('«%s»', (sentido) => {
    const r = { ...base, respuesta: { fecha: '2026-10-02', sentido } }
    const f = frasePublica(r, '2026-10-20')
    expect(f).not.toMatch(/undefined/)
    // La fecha delante del verbo: «no les corresponde el 2026-10-02» se lee como
    // si dejara de corresponderles ese día.
    expect(f).toMatch(/El 2026-10-02 [a-záéíóú]/)
  })
})
