import { describe, it, expect } from 'vitest'
import {
  ESTADOS_SOLICITUD,
  ESTADO_SOLICITUD_ETIQUETA,
  ESTADO_SOLICITUD_TONO,
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
    expect(venceEl('2026-09-01')).toEqual({
      cuenta: 'calculada',
      nominal: '2026-10-01',
      ultimoDia: '2026-10-01',
    })
    expect(venceEl('2026-01-31').nominal).toBe('2026-02-28') // no inventa un 31 de febrero
  })
})

/**
 * El último día inhábil pasa al primer día hábil siguiente (art. 30.5 LPACAP).
 *
 * `venceEl` sumaba el mes y se paraba ahí, así que un plazo que acababa en
 * sábado o en festivo se daba por vencido ese mismo día a medianoche, cuando el
 * Ayuntamiento tiene todavía el primer día hábil siguiente entero. En una página
 * que publica «no han contestado» junto a una administración, eso es acusarla
 * antes de tiempo. La cuenta es la de las quejas (`finDelPlazoEnMeses`) con el
 * calendario de la sede.
 */
describe('venceEl · el último día inhábil se prorroga (art. 30.5)', () => {
  it('un sábado pasa al lunes: el mes desde el 31-01-2026 acaba el sábado 28-02', () => {
    expect(venceEl('2026-01-31')).toEqual({
      cuenta: 'calculada',
      nominal: '2026-02-28',
      ultimoDia: '2026-03-02',
    })
  })

  it('un festivo, al primer día hábil: el 9-10 es el Día de la Comunitat Valenciana y el 12 la Fiesta Nacional', () => {
    expect(venceEl('2026-09-09')).toEqual({
      cuenta: 'calculada',
      nominal: '2026-10-09',
      ultimoDia: '2026-10-13',
    })
  })

  const alDiaNueve: SolicitudAcceso = { ...base, presentadaEl: '2026-09-09' }

  it('el estado sigue en plazo hasta ese día hábil, y vence al acabar', () => {
    expect(estadoDeSolicitud(alDiaNueve, '2026-10-10')).toBe('en-plazo')
    expect(estadoDeSolicitud(alDiaNueve, '2026-10-13')).toBe('en-plazo')
    expect(estadoDeSolicitud(alDiaNueve, '2026-10-14')).toBe('vencida-sin-respuesta')
  })

  it('la frase da el último día de verdad, y por qué no es el nominal', () => {
    const f = frasePublica(alDiaNueve, '2026-09-20')
    expect(f).toContain('hasta el 2026-10-13')
    expect(f).toMatch(/prorrogado: el 2026-10-09, Día de la Comunitat Valenciana, es inhábil/i)
    expect(f).toMatch(/art\. 30\.5 de la Ley 39\/2015/)
  })

  it('sin prórroga, la frase no la menciona (el control)', () => {
    expect(frasePublica(base, '2026-09-20')).not.toMatch(/prorrogad/i)
  })
})

/**
 * Sin el calendario del año en que acaba, no hay último día: falla cerrado.
 *
 * Si el mes acaba en un año cuyos festivos no están en la tabla, no se sabe si
 * ese día se prorroga. Hasta el día nominal la solicitud está en plazo seguro
 * —la prórroga sólo alarga—; después no se sabe, y eso es un estado propio:
 * darla por vencida sería tomar «no tengo el calendario» por «no hay festivos».
 */
describe('venceEl · un año sin calendario no es un año sin festivos', () => {
  const en2099: SolicitudAcceso = { ...base, presentadaEl: '2098-12-15' }

  it('venceEl dice qué año falta y cuál era el día nominal', () => {
    expect(venceEl('2098-12-15')).toEqual({
      cuenta: 'sin-calendario',
      anio: 2099,
      nominal: '2099-01-15',
    })
  })

  it('hasta el día nominal, en plazo; después, sin calendario — nunca vencida', () => {
    expect(estadoDeSolicitud(en2099, '2099-01-15')).toBe('en-plazo')
    expect(estadoDeSolicitud(en2099, '2099-01-16')).toBe('sin-calendario')
    expect(estadoDeSolicitud(en2099, '2099-12-31')).toBe('sin-calendario')
  })

  it('la frase no dice que venciera ni que no contestaran, y dice qué falta', () => {
    const f = frasePublica(en2099, '2099-02-01')
    expect(f).not.toMatch(/Venció|no (han )?contestad/)
    expect(f).toContain('2099-01-15 o, si ese día es inhábil, el primer día hábil siguiente')
    expect(f).toMatch(/calendario de días inhábiles de 2099/)
  })

  it('una fecha que no se puede leer es un fallo, no un plazo', () => {
    expect(() => venceEl('el martes')).toThrow(/el martes/)
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
      [
        'en-plazo',
        'reclamada',
        'respondida',
        'sin-calendario',
        'sin-solicitar',
        'vencida-sin-respuesta',
      ].sort(),
    )
  })

  // Las etiquetas y los tonos vivían en /laboratorio/cobertura como literales sin
  // tipar, y un estado nuevo sin su fila pinta «undefined» con el gris por
  // defecto. Se recorren en EJECUCIÓN: vitest despoja los tipos.
  it('cada estado tiene etiqueta y tono, sin huecos', () => {
    for (const e of ESTADOS_SOLICITUD) {
      expect(ESTADO_SOLICITUD_ETIQUETA[e], `falta etiqueta de ${e}`).toBeTruthy()
      expect(ESTADO_SOLICITUD_TONO[e], `falta tono de ${e}`).toBeTruthy()
    }
    expect(Object.keys(ESTADO_SOLICITUD_ETIQUETA).sort()).toEqual([...ESTADOS_SOLICITUD].sort())
    // Sin calendario no es un retraso de nadie: neutro, como en /quejas/dashboard.
    expect(ESTADO_SOLICITUD_ETIQUETA['sin-calendario']).toBe('sin calendario')
    expect(ESTADO_SOLICITUD_TONO['sin-calendario']).toBe('neutral')
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
