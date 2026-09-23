import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  arranqueDelPlazo,
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
/**
 * Con asiento de registro, el plazo deja de ser «contado desde el envío».
 *
 * De un correo consta el ENVÍO y no la recepción por el órgano competente, y por
 * eso la frase de siempre dice de dónde cuenta. Un asiento de registro sí prueba
 * la entrada: el 21-09-2026 el escrito a Turisme CV se presentó por la sede de la
 * Generalitat con el número GVRTE/2026/4309357. Publicar entonces la misma
 * salvedad sería disculparse por algo que ya consta, y no publicar el número
 * sería quedarse sin la prueba de que consta.
 *
 * Ese mismo escrito se REMITIÓ después a otro órgano, y el asiento dejó de
 * acreditar su vencimiento: el bloque siguiente. Esta regla sigue siendo la de
 * una solicitud que resuelve quien la recibe.
 */
describe('una solicitud con registro dice su número y vence de verdad', () => {
  const conRegistro: EnvioSolicitud = {
    organismo: 'Turisme Comunitat Valenciana',
    enviadaEl: '2026-09-21',
    via: 'el registro electrónico de la Generalitat',
    registro: 'GVRTE/2026/4309357',
    respuesta: null,
  }

  it('la frase trae el número de registro', () => {
    expect(fraseDeEnvio(conRegistro, '2026-09-30')).toContain('GVRTE/2026/4309357')
  })

  it('y el vencimiento se afirma, sin «contado desde el envío»', () => {
    const f = fraseDeEnvio(conRegistro, '2026-09-30')
    expect(f).toContain('21 de octubre de 2026')
    expect(f).not.toMatch(/contado desde el envío/)
  })

  it('sin registro, la salvedad sigue intacta', () => {
    // El control: si la frase perdiera la cautela para TODAS, esta prueba lo
    // dice. Las tres del coste efectivo y dos del conteo salieron por correo.
    const porCorreo: EnvioSolicitud = { ...conRegistro, registro: undefined }
    expect(fraseDeEnvio(porCorreo, '2026-09-30')).toMatch(/contado desde el envío/)
  })
})

/**
 * Un asiento acredita la entrada donde se presentó. Si quien la recibe la REMITE
 * a otro por considerarlo competente, el mes ya no se deduce de él.
 *
 * Le pasó al escrito del bloque anterior. Presentado el 21-09-2026 con el número
 * GVRTE/2026/4309357, su fila afirmaba «vence el 21 de octubre». El 23-09 la
 * Generalitat comunicó que la información no obraba en poder de la Conselleria
 * de Industria, Turismo, Innovación y Comercio y que había remitido la solicitud
 * a Turisme Comunitat Valenciana (expediente GVAGIP/2026/774). El art. 20.1
 * cuenta el mes «desde la recepción de la solicitud por el órgano competente
 * para resolver», y de esa recepción no consta la fecha: el número seguía siendo
 * cierto y el vencimiento que se sacaba de él había dejado de estar acreditado.
 *
 * Hasta que conste, se cuenta desde la comunicación de la remisión —la primera
 * fecha en que consta que se le había remitido— y se dice así, igual que un
 * correo se cuenta «desde el envío». Qué fecha manda después de una remisión no
 * lo zanja ningún texto (el art. 34.1 de la Ley 1/2022 cuenta desde la entrada
 * en el registro del organismo competente), así que la frase no toma partido:
 * no afirma nada hasta que el órgano diga cuándo la recibió.
 */
describe('una solicitud remitida a otro órgano no vence desde su asiento', () => {
  const remitida: EnvioSolicitud = {
    organismo: 'Turisme Comunitat Valenciana',
    enviadaEl: '2026-09-21',
    via: 'el registro electrónico de la Generalitat',
    registro: 'GVRTE/2026/4309357',
    respuesta: null,
    remitida: { fecha: '2026-09-23', a: 'Turisme Comunitat Valenciana' },
  }
  const recibida: EnvioSolicitud = {
    ...remitida,
    remitida: { fecha: '2026-09-23', a: 'Turisme Comunitat Valenciana', recibidaEl: '2026-09-24' },
  }

  it('conserva el número de registro, que sigue siendo cierto', () => {
    expect(fraseDeEnvio(remitida, '2026-09-30')).toContain('GVRTE/2026/4309357')
  })

  it('no afirma el vencimiento que se deducía del asiento', () => {
    const f = fraseDeEnvio(remitida, '2026-09-30')
    expect(f).not.toContain('21 de octubre de 2026')
    expect(f).not.toMatch(/vence el/)
  })

  it('dice a quién se remitió, cuándo se comunicó y desde dónde se cuenta', () => {
    const f = fraseDeEnvio(remitida, '2026-09-30')
    expect(f).toContain(
      'El 23 de septiembre de 2026 se comunicó que se había remitido a Turisme Comunitat Valenciana',
    )
    expect(f).toMatch(/no consta todavía cuándo la recibió/)
    expect(f).toMatch(/órgano competente para resolver/)
    expect(f).toContain('contado desde esa comunicación, el 23 de octubre de 2026')
  })

  it('el estado se cuenta desde la comunicación, no desde el asiento', () => {
    expect(estadoDeEnvio(remitida, '2026-10-22')).toBe('en-plazo')
    expect(estadoDeEnvio(remitida, '2026-10-23')).toBe('en-plazo')
    expect(estadoDeEnvio(remitida, '2026-10-24')).toBe('vencida-sin-respuesta')
  })

  it('vencida, sigue diciendo desde dónde se contó', () => {
    expect(fraseDeEnvio(remitida, '2026-10-24')).toContain(
      'Contado desde esa comunicación, el mes del artículo 20 terminó el 23 de octubre de 2026 y no han contestado.',
    )
  })

  it('cuando consta que la recibió, el vencimiento se afirma desde ahí', () => {
    const f = fraseDeEnvio(recibida, '2026-09-30')
    expect(f).toContain('consta que la recibió el 24 de septiembre de 2026')
    expect(f).toContain('vence el 24 de octubre de 2026')
    expect(f).not.toMatch(/contado desde/i)
    expect(estadoDeEnvio(recibida, '2026-10-24')).toBe('en-plazo')
    expect(estadoDeEnvio(recibida, '2026-10-25')).toBe('vencida-sin-respuesta')
  })

  // La tabla entera, porque la nota del pie se guarda contra esta función: si
  // «acreditado» se equivoca, la nota promete o calla un vencimiento en falso.
  it('arranqueDelPlazo: acredita el asiento propio o la recepción del remitido, nada más', () => {
    const porCorreo: EnvioSolicitud = { ...remitida, registro: undefined, remitida: undefined }
    expect(arranqueDelPlazo(porCorreo)).toEqual({ desde: '2026-09-21', acreditado: false })
    expect(arranqueDelPlazo({ ...remitida, remitida: undefined })).toEqual({
      desde: '2026-09-21',
      acreditado: true,
    })
    expect(arranqueDelPlazo(remitida)).toEqual({ desde: '2026-09-23', acreditado: false })
    expect(arranqueDelPlazo(recibida)).toEqual({ desde: '2026-09-24', acreditado: true })
  })
})

/**
 * Una contestación que NO resuelve no es una respuesta, y no puede parar el reloj.
 *
 * El 21-09-2026 Turisme Comunitat Valenciana contestó al escrito del 9 de
 * septiembre que por correo no podía atenderlo y que había que presentarlo por su
 * trámite electrónico. Ni concede, ni deniega, ni dice que no le corresponda: no
 * resuelve. Meterlo en `respuesta` con cualquiera de los sentidos del enum
 * publicaría «respondida» sobre una solicitud que sigue sin contestar —y pararía
 * el cómputo del art. 20 por una contestación que no lo agota—, así que va en su
 * propio campo y el estado lo sigue mandando `respuesta` + la fecha.
 */
describe('una contestación que no resuelve deja el reloj corriendo', () => {
  const conIncidencia: EnvioSolicitud = {
    organismo: 'Turisme Comunitat Valenciana',
    enviadaEl: '2026-09-09',
    via: 'correo electrónico',
    respuesta: null,
    incidencias: [
      {
        fecha: '2026-09-21',
        texto: 'Contestan que por esta vía no pueden atenderla y que hay que usar su trámite.',
      },
    ],
  }

  it('sigue en plazo mientras el mes no vence', () => {
    expect(estadoDeEnvio(conIncidencia, '2026-09-30')).toBe('en-plazo')
  })

  it('y vence como cualquier otra, sin convertirse en respondida', () => {
    expect(estadoDeEnvio(conIncidencia, '2026-10-10')).toBe('vencida-sin-respuesta')
  })

  // Vencida, la frase NO puede decir «no han contestado»: justo debajo va la
  // incidencia que cuenta que sí contestaron. Lo que no hicieron es resolver, y
  // eso es lo que el art. 20 mide. El 23-09-2026 eran ya tres filas con
  // incidencia —Turisme CV y el Ayuntamiento en las dos piezas— y la primera
  // habría vencido el 9 de octubre diciendo lo contrario de su línea de debajo.
  it('vencida, dice que no la resolvieron — no que no contestaran', () => {
    const f = fraseDeEnvio(conIncidencia, '2026-10-10')
    expect(f).toContain('sin que la hayan resuelto')
    expect(f).not.toMatch(/no han contestado|no hubo respuesta/)
  })

  it('sin incidencia, el silencio sigue siendo silencio', () => {
    // El control: el cambio de arriba no puede alcanzar a una fila de la que no
    // consta contestación alguna.
    const sinNada: EnvioSolicitud = { ...conIncidencia, incidencias: undefined }
    expect(fraseDeEnvio(sinNada, '2026-10-10')).toMatch(/y no han contestado/)
  })
})

// Desde el 18-09-2026 son DOS las piezas que publican solicitudes con reloj
// (el conteo y el coste efectivo), y las dos usan este módulo. La prueba recorre
// las instantáneas en vez de fijar una: la siguiente pieza que publique un
// escrito entra sola, y no hereda un candado escrito sólo para la primera.
const PIEZAS = ['conteo-visitantes', 'coste-efectivo'] as const

describe.each(PIEZAS)('instantánea publicada · %s', (slug) => {
  const d = JSON.parse(readFileSync(`public/data/reportajes/${slug}.json`, 'utf8')) as {
    solicitudes: { nota: string; items: EnvioSolicitud[] }
  }

  it('trae solicitudes que mirar (si no, esta prueba aprobaría por no ver nada)', () => {
    expect(d.solicitudes.items.length).toBeGreaterThan(0)
  })

  // `via` es lo que hace legible el plazo: de un correo consta el envío y no la
  // recepción (art. 20.1), y de un registro sí. Sin ella la frase publicada
  // diría «enviada el … por undefined».
  it('cada envío dice por dónde salió y cuándo', () => {
    for (const e of d.solicitudes.items) {
      expect(e.via, `${e.organismo}: falta la vía`).toBeTruthy()
      expect(e.enviadaEl).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
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

  // UNA FILA PRESENTADA POR REGISTRO PERO SIN ASIENTO APUNTADO es el caso que
  // hace mentir a la nota del pie. El canal promete un vencimiento acreditado
  // —por eso se presentó por ahí— y la fila, sin número, lo sigue contando desde
  // el envío. El 18-09-2026 la solicitud a la Comisión de Precios quedó así y la
  // nota del coste efectivo decía «se presentó en el registro electrónico de la
  // Generalitat, que sí deja asiento» y ahí se paraba: el lector salía creyendo
  // acreditado un plazo que no lo está.
  //
  // Lo comprobable no es la implicatura —para eso está `review:surfaces`, que lee
  // la página como un visitante— sino que la salvedad esté ESCRITA. Y se guarda
  // la dirección peligrosa: quitarla deja otra vez la página afirmando de más.
  //
  // Se guarda en LAS DOS direcciones, y la segunda no es teórica: el 22-09-2026
  // llegó el asiento de la Comisión de Precios y la salvedad pasó a ser falsa el
  // mismo día. Una cautela que sobrevive a su motivo dice que no sabemos algo que
  // sí sabemos, y en una página cuyo trato con el lector es una cita por
  // afirmación eso cuesta tanto como la afirmación de más.
  //
  // De ahí el «si y sólo si»: la nota lleva la salvedad exactamente cuando hay
  // una fila que la necesita. Así la prueba tampoco puede aprobar por no ver nada.
  it('la nota advierte de un asiento que falta si y sólo si falta alguno', () => {
    const sinAsiento = d.solicitudes.items.filter(
      (e) => /registro|sede/i.test(e.via) && !e.registro,
    )
    const loDice = /no consta/.test(d.solicitudes.nota)
    expect(
      loDice,
      sinAsiento.length > 0
        ? `${sinAsiento.map((e) => e.organismo).join(', ')}: presentada por registro sin asiento ` +
            'apuntado, y la nota no advierte de que ese número no consta'
        : 'ninguna fila espera asiento y la nota sigue diciendo que uno «no consta»',
    ).toBe(sinAsiento.length > 0)
  })

  // LA OTRA MITAD DE LA NOTA: «se puede afirmar». Es una promesa sobre las filas
  // —que alguna tiene el vencimiento acreditado— y el 23-09-2026 se quedó sin
  // objeto en el conteo: la única fila con asiento se remitió a otro órgano, su
  // frase dejó de afirmar y la nota lo seguía prometiendo. Mismo «si y sólo si»
  // que la salvedad de arriba, y contra la función que decide, no contra una
  // copia de su regla.
  it('la nota dice que un plazo «se puede afirmar» si y sólo si alguna fila lo tiene acreditado', () => {
    const acreditadas = d.solicitudes.items.filter((e) => arranqueDelPlazo(e).acreditado)
    const loDice = /se puede afirmar/.test(d.solicitudes.nota)
    expect(
      loDice,
      acreditadas.length > 0
        ? `${acreditadas.map((e) => e.organismo).join(', ')}: vencimiento acreditado y la nota no lo dice`
        : 'ninguna fila tiene el vencimiento acreditado y la nota dice que uno «se puede afirmar»',
    ).toBe(acreditadas.length > 0)
  })

  // Una remisión mueve el reloj, así que tiene que poder leerse: a quién, cuándo,
  // y lo que dijeron al comunicarla, que va en una incidencia con su misma fecha.
  // Sin la incidencia la frase diría «se remitió» sin que la página contara quién
  // lo dijo ni por qué.
  it('cada remisión nombra a quién, va después del envío y consta dicha', () => {
    for (const e of d.solicitudes.items.filter((x) => x.remitida)) {
      const r = e.remitida!
      expect(r.a.trim(), `${e.organismo}: remitida sin decir a quién`).not.toBe('')
      expect(r.fecha >= e.enviadaEl, `${e.organismo}: remitida antes de enviarse`).toBe(true)
      if (r.recibidaEl) expect(r.recibidaEl >= e.enviadaEl).toBe(true)
      expect(
        (e.incidencias ?? []).some((i) => i.fecha === r.fecha),
        `${e.organismo}: la remisión del ${r.fecha} no consta en ninguna incidencia`,
      ).toBe(true)
    }
  })

  it('toda respuesta publicada usa un sentido del enum', () => {
    const malos = d.solicitudes.items
      .filter((e) => e.respuesta)
      .map((e) => e.respuesta!.sentido)
      .filter((s) => !(SENTIDOS_RESPUESTA as readonly string[]).includes(s))
    expect(malos).toEqual([])
  })
})

// Las comprobaciones de remisión de arriba recorren sólo las filas que la tienen,
// y sobre ninguna aprobarían sin mirar nada. Ésta dice que miraron algo.
it('mide algo: alguna instantánea publica una remisión', () => {
  const conRemision = PIEZAS.flatMap(
    (slug) =>
      (
        JSON.parse(readFileSync(`public/data/reportajes/${slug}.json`, 'utf8')) as {
          solicitudes: { items: EnvioSolicitud[] }
        }
      ).solicitudes.items,
  ).filter((e) => e.remitida)
  expect(conRemision.length).toBeGreaterThan(0)
})
