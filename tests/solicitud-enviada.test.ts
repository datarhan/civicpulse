import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  enCastellano,
  estadoDeEnvio,
  fraseDeEnvio,
  resumirEnvios,
  type EnvioSolicitud,
} from '../src/scraper/solicitud-enviada'
import { SENTIDOS_RESPUESTA } from '../src/scraper/solicitud-acceso'

/**
 * Las solicitudes que salieron POR CORREO, contadas en el propio reportaje.
 *
 * Por qué un módulo aparte y no `solicitud-acceso.ts`: aquel registro es un
 * instrumento de cobertura del corpus —«tenemos 67 afirmaciones que citan
 * informes técnicos y nunca los hemos pedido»—, exige número de registro de la
 * sede («sin él no consta que se presentara») y su `frasePublica` dice
 * literalmente «El Ayuntamiento». Estas tres solicitudes no tienen número
 * porque salieron por correo, y dos de las tres no van al Ayuntamiento. Meterlas
 * en aquel molde no las registra: las deforma.
 *
 * LA REGLA QUE MÁS IMPORTA, y es de derecho, no de estilo: el artículo 17.2 de
 * la Ley 19/2013 admite «cualquier medio que permita tener constancia» de la
 * identidad, lo pedido y una dirección de contacto — así que un correo es una
 * vía válida de presentación. Pero el artículo 20.1 cuenta el mes «desde la
 * recepción de la solicitud POR EL ÓRGANO COMPETENTE PARA RESOLVER», y de un
 * correo tenemos constancia del envío, no de esa recepción. La frase publicada
 * tiene que decir las dos cosas: la fecha que sí probamos y el hecho de que el
 * cómputo arranca en una que no.
 */

const base: EnvioSolicitud = {
  organismo: 'Ayuntamiento de Riba-roja de Túria',
  enviadaEl: '2026-09-09',
  via: 'correo electrónico',
  respuesta: null,
}

const ministerio: EnvioSolicitud = {
  ...base,
  organismo: 'Secretaría de Estado de Turismo',
}

describe('estadoDeEnvio · tres desenlaces, y ninguno es «pendiente»', () => {
  it('dentro del mes, en-plazo — y el último día todavía cuenta', () => {
    expect(estadoDeEnvio(base, '2026-09-20')).toBe('en-plazo')
    expect(estadoDeEnvio(base, '2026-10-09')).toBe('en-plazo')
  })

  it('pasado el mes sin contestar, vencida-sin-respuesta', () => {
    expect(estadoDeEnvio(base, '2026-10-10')).toBe('vencida-sin-respuesta')
  })

  it('con respuesta, respondida — aunque llegue tarde', () => {
    const r: EnvioSolicitud = {
      ...base,
      respuesta: { fecha: '2026-11-02', sentido: 'parcial' },
    }
    expect(estadoDeEnvio(r, '2026-11-30')).toBe('respondida')
  })
})

describe('fraseDeEnvio · lo que el lector lee', () => {
  // El defecto que este módulo existe para no cometer: `frasePublica` del
  // registro curado dice «El Ayuntamiento tiene de plazo hasta el …». Publicar
  // eso bajo una carta al Ministerio sería una frase falsa sobre un organismo
  // nombrado, en una página que promete una cita por afirmación.
  it('nombra al organismo de la fila, nunca al Ayuntamiento por defecto', () => {
    const f = fraseDeEnvio(ministerio, '2026-09-20')
    expect(f).toContain('Secretaría de Estado de Turismo')
    expect(f).not.toContain('Ayuntamiento')
  })

  // Las fechas van en castellano largo, no en ISO. Esto no es cosmética: la
  // pieza dice «19 de enero de 2026» tres párrafos más arriba, y un
  // «2026-09-09» en medio de la prosa se lee como salida de máquina, que es
  // justo lo que un reportaje no debe parecer. Se vio mirando la página, que es
  // lo único que lo ve.
  it('da la fecha de envío y la del vencimiento, en castellano', () => {
    const f = fraseDeEnvio(base, '2026-09-20')
    expect(f).toContain('9 de septiembre de 2026')
    expect(f).toContain('9 de octubre de 2026')
    expect(f).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('enCastellano no inventa meses ni pierde el día', () => {
    expect(enCastellano('2026-01-01')).toBe('1 de enero de 2026')
    expect(enCastellano('2026-12-31')).toBe('31 de diciembre de 2026')
    // Sin ceros a la izquierda: «09 de octubre» no se dice.
    expect(enCastellano('2026-10-09')).toBe('9 de octubre de 2026')
  })

  // LA PRUEBA DE DERECHO. De un correo probamos el envío, no la recepción por
  // el órgano competente, que es donde el art. 20.1 arranca el mes. Si esta
  // frase afirma el vencimiento a secas, la página está firmando un plazo que
  // no puede acreditar.
  it('no afirma que el plazo legal arrancase el día del envío', () => {
    const f = fraseDeEnvio(base, '2026-09-20')
    expect(f).toMatch(/órgano competente/i)
    expect(f).toMatch(/contado desde el envío|si se cuenta desde el envío/i)
  })

  it('el silencio se cuenta como lo que es: no contestaron', () => {
    const f = fraseDeEnvio(base, '2026-10-20')
    expect(f).toMatch(/no (han|ha) contestado|sin respuesta/i)
    // «Desestimada» sería trasladar el efecto jurídico del silencio a un hecho
    // que no ocurrió. Lo ocurrido es que no contestaron.
    expect(f).not.toMatch(/\bdesestimad/i)
  })

  it('respondida dice cuándo y en qué sentido', () => {
    const r: EnvioSolicitud = {
      ...base,
      respuesta: { fecha: '2026-10-02', sentido: 'concedido' },
    }
    const f = fraseDeEnvio(r, '2026-10-20')
    expect(f).toContain('2 de octubre de 2026')
    expect(f).toMatch(/conced/i)
  })
})

describe('resumirEnvios · una pasada tiene que demostrar que hizo algo', () => {
  it('cuenta cada desenlace por separado', () => {
    const r = resumirEnvios(
      [base, ministerio, { ...base, respuesta: { fecha: '2026-10-01', sentido: 'denegado' } }],
      '2026-10-20',
    )
    expect(r.total).toBe(3)
    expect(r.porEstado['vencida-sin-respuesta']).toBe(2)
    expect(r.porEstado.respondida).toBe(1)
    expect(r.concluyente).toBe(true)
  })

  // Sin esto, «no hay solicitudes que mostrar» y «el bloque no se ha cargado»
  // se ven igual: un hueco. Y un hueco se lee como limpio.
  it('una lista vacía NO es concluyente', () => {
    const r = resumirEnvios([], '2026-10-20')
    expect(r.total).toBe(0)
    expect(r.concluyente).toBe(false)
  })
})

describe('etiquetas y tonos · derivados, no a mano', () => {
  it('cada estado tiene etiqueta y tono, sin huecos', async () => {
    const { ESTADOS_ENVIO, ESTADO_ENVIO_ETIQUETA, ESTADO_ENVIO_TONO } =
      await import('../src/scraper/solicitud-enviada')
    // Un estado nuevo sin etiqueta pintaría `undefined` en la página, y un
    // estado sin tono caería al gris de por defecto: las dos cosas se leen como
    // «no pasa nada», que es justo lo contrario de lo que un estado nuevo dice.
    for (const e of ESTADOS_ENVIO) {
      expect(ESTADO_ENVIO_ETIQUETA[e], `falta etiqueta de ${e}`).toBeTruthy()
      expect(ESTADO_ENVIO_TONO[e], `falta tono de ${e}`).toBeTruthy()
    }
    expect(Object.keys(ESTADO_ENVIO_ETIQUETA).sort()).toEqual([...ESTADOS_ENVIO].sort())
  })

  // El mismo reloj se pinta en /laboratorio/cobertura con este vocabulario. Dos
  // superficies que dicen lo mismo con colores distintos es una de las dos
  // mintiendo, y no se sabe cuál.
  it('usa el vocabulario de tonos que ya usa Cobertura', async () => {
    const { ESTADO_ENVIO_TONO } = await import('../src/scraper/solicitud-enviada')
    expect(ESTADO_ENVIO_TONO['en-plazo']).toBe('civic')
    expect(ESTADO_ENVIO_TONO['vencida-sin-respuesta']).toBe('warn')
    expect(ESTADO_ENVIO_TONO.respondida).toBe('ok')
  })
})

/**
 * La primera respuesta que llegó no cabía en ninguno de los tres sentidos.
 *
 * El 16-09-2026 contestó la Secretaría de Estado de Turismo. No concedió acceso
 * a nada —no entregó un solo documento— ni lo denegó: dijo que no le
 * corresponde y que preguntemos al Ayuntamiento y a la Generalitat. Meter eso en
 * «parcial» («lo concedieron en parte») publicaría un acceso que no hubo, y en
 * «denegado», una negativa que tampoco. Es la regla del centinela: se nombra la
 * cosa o no se escribe.
 *
 * Y el verbo tiene trampa. En la Ley 19/2013 «remitir» es REENVIAR la solicitud
 * al competente (art. 19.1), y eso es justo lo que no hicieron. Escribir
 * «remitieron» sería falso aunque suene a lo que pasó.
 */
describe('respuesta · «no les corresponde»', () => {
  const ministerio: EnvioSolicitud = {
    organismo: 'Secretaría de Estado de Turismo',
    enviadaEl: '2026-09-09',
    via: 'correo electrónico',
    respuesta: { fecha: '2026-09-16', sentido: 'no-les-corresponde' as never },
  }

  it('es un sentido propio, no uno forzado', () => {
    expect(SENTIDOS_RESPUESTA).toContain('no-les-corresponde')
  })

  it('dice lo que contestaron, sin conceder ni denegar', () => {
    const f = fraseDeEnvio(ministerio, '2026-09-17')
    expect(f).toMatch(/no les corresponde/i)
    expect(f).not.toMatch(/conced|deneg/i)
  })

  it('no dice «remitieron», que en esta ley significa otra cosa', () => {
    expect(fraseDeEnvio(ministerio, '2026-09-17')).not.toMatch(/\bremit/i)
  })

  it('la fecha va delante: «no les corresponde el 16» se leería como otra cosa', () => {
    expect(fraseDeEnvio(ministerio, '2026-09-17')).toContain(
      'El 16 de septiembre de 2026 contestaron que no les corresponde.',
    )
  })

  // vitest despoja los tipos: que `QUE_HICIERON` sea un Record completo lo
  // comprueba tsc, pero en ejecución una clave olvidada imprime «undefined» en
  // una página pública. Se recorre el enum EXPORTADO, así que un sentido nuevo
  // entra aquí solo.
  it.each([...SENTIDOS_RESPUESTA])('el sentido «%s» compone una frase entera', (sentido) => {
    const f = fraseDeEnvio(
      { ...ministerio, respuesta: { fecha: '2026-10-02', sentido: sentido as never } },
      '2026-10-20',
    )
    expect(f).not.toMatch(/undefined/)
    expect(f).toMatch(/El 2 de octubre de 2026 [a-záéíóú]/)
  })
})

/**
 * Lo que está PUBLICADO tiene que usar sentidos que existen.
 *
 * El bloque `solicitudes` del reportaje no pasa por ningún validador: es JSON
 * escrito a mano. Un sentido mal tecleado no rompería nada en el build y sí
 * imprimiría «undefined» delante de los lectores. Se lee la instantánea real, no
 * un fixture que la copie.
 */
describe('instantánea publicada · conteo-visitantes', () => {
  const d = JSON.parse(readFileSync('public/data/reportajes/conteo-visitantes.json', 'utf8')) as {
    solicitudes: { items: EnvioSolicitud[] }
  }

  it('trae solicitudes que mirar (si no, esta prueba aprobaría por no ver nada)', () => {
    expect(d.solicitudes.items.length).toBeGreaterThan(0)
  })

  // El 17-09-2026 un mismo organismo pasó a tener DOS filas (la solicitud y su
  // seguimiento). El componente usa `organismo + enviadaEl` como clave de React,
  // y dos filas con la misma clave no dan error visible: React reutiliza una y la
  // otra desaparece de la página, que es la forma más silenciosa de perder un
  // reloj legal.
  it('no hay dos solicitudes al mismo organismo el mismo día (la clave de la fila)', () => {
    const claves = d.solicitudes.items.map((e) => `${e.organismo}-${e.enviadaEl}`)
    const repetidas = claves.filter((k, i) => claves.indexOf(k) !== i)
    expect(repetidas).toEqual([])
  })

  it('toda respuesta publicada usa un sentido del enum', () => {
    const malos = d.solicitudes.items
      .filter((e) => e.respuesta)
      .map((e) => e.respuesta!.sentido)
      .filter((s) => !(SENTIDOS_RESPUESTA as readonly string[]).includes(s))
    expect(malos).toEqual([])
  })
})
