/**
 * La solicitud de acceso que cualquier lector puede presentar con las preguntas
 * de una pieza (src/lib/solicitud-lector.js).
 *
 * Dos cosas pueden salir mal sin que ninguna otra prueba lo vea. La primera, que
 * el escrito se ofrezca en una pieza cuyas preguntas el proyecto YA registró:
 * cada lector que lo presentara duplicaría una solicitud viva. La segunda, que
 * lo que el lector firma con su DNI diga algo más que preguntar —una afirmación
 * de la pieza, un cargo que sólo ocupa una persona—: en un escrito a su nombre,
 * esa frase sería suya.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { textoSolicitudLector, debeOfrecerSolicitud, CORREO } from '../src/lib/solicitud-lector'
import { APARTADAS, preguntasDe, solicitables } from '../src/lib/solicitud-apartadas'
import { REPORTAJE_SLUGS } from '../src/reportajes'

const pieza = {
  titulo: 'Inteligencia turística',
  url: 'https://civicpulse.es/reportajes/inteligencia-turistica',
  publicadoEl: '2026-07-15',
  preguntas: ['¿Uno?', '¿Dos?'],
}

const leerPieza = (slug) =>
  JSON.parse(
    readFileSync(join(__dirname, '..', 'public', 'data', 'reportajes', `${slug}.json`), 'utf8'),
  )

describe('textoSolicitudLector', () => {
  const t = textoSolicitudLector(pieza)
  it('cita la ley y deja huecos de identificación', () => {
    expect(t).toMatch(/Ley 19\/2013/)
    expect(t).toMatch(/Ley 1\/2022/)
    expect(t).toMatch(/\[Nombre y apellidos\]/)
    expect(t).toMatch(/\[DNI\/NIE\]/)
    expect(t).toMatch(/\[Dirección o correo para notificaciones\]/)
  })
  it('las preguntas van literales y numeradas', () => {
    expect(t).toMatch(/1\. ¿Uno\?/)
    expect(t).toMatch(/2\. ¿Dos\?/)
  })
  it('va al Área de Transparencia y cita los artículos que la sostienen', () => {
    expect(t).toMatch(/Ayuntamiento de Riba-roja de Túria — Área de Transparencia/)
    for (const art of ['12', '13', '17', '20.1']) {
      expect(t, `art. ${art}`).toMatch(new RegExp(`\\b${art.replace('.', '\\.')}\\b`))
    }
    expect(t).toMatch(/arts?\. 20\.1/)
    expect(t).toMatch(/formato electrónico/)
  })
  it('cita el reportaje como contexto, con título y dirección', () => {
    expect(t).toMatch(/a raíz de la información publicada en «Inteligencia turística»/)
    expect(t).toContain(pieza.url)
  })
  it('las comillas del título pasan a ser de segundo nivel dentro de la cita', () => {
    const c = textoSolicitudLector({
      ...pieza,
      titulo: 'Dos millones para el «destino inteligente»',
    })
    expect(c).toContain('en «Dos millones para el “destino inteligente”» (')
  })
  it('fecha lo que las preguntas dan por sentado, justo tras citar la pieza', () => {
    expect(t).toContain(
      `(${pieza.url}). Las preguntas se reproducen literalmente de ese reportaje, publicado el 15 de julio de 2026, y lo que en ellas se da por sentado se refiere a esa fecha. Si algo ha cambiado desde entonces, se solicita la información que conste a la fecha de esta solicitud.`,
    )
  })
  it('sin preguntas no hay escrito', () => {
    expect(() => textoSolicitudLector({ ...pieza, preguntas: [] })).toThrow()
  })
  it('sin fecha de publicación tampoco: lo que se da por sentado quedaría sin fechar', () => {
    expect(() => textoSolicitudLector({ ...pieza, publicadoEl: undefined })).toThrow()
    expect(() => textoSolicitudLector({ ...pieza, publicadoEl: '15 de julio' })).toThrow()
  })
})

describe('debeOfrecerSolicitud', () => {
  it('no se ofrece donde ya se pidió', () => {
    expect(debeOfrecerSolicitud({ preguntas: ['¿a?'], solicitudes: { items: [{}] } })).toBe(false)
  })
  it('se ofrece con preguntas y sin solicitud', () => {
    expect(debeOfrecerSolicitud({ preguntas: ['¿a?'] })).toBe(true)
  })
  it('sin preguntas en lista, no', () => {
    expect(debeOfrecerSolicitud({ preguntas: { bloques: [] } })).toBe(false)
  })
  it('una lista vacía o con algo que no es texto, no', () => {
    expect(debeOfrecerSolicitud({ preguntas: [] })).toBe(false)
    expect(debeOfrecerSolicitud({ preguntas: ['¿a?', { q: '¿b?' }] })).toBe(false)
    expect(debeOfrecerSolicitud({})).toBe(false)
  })
  it('un bloque de solicitudes sin filas tampoco: la pieza ya se ocupa de pedirlo', () => {
    expect(debeOfrecerSolicitud({ preguntas: ['¿a?'], solicitudes: { items: [] } })).toBe(false)
  })
})

/**
 * Las piezas publicadas, tal como están en disco. No restata qué piezas lo
 * ofrecen: lo DERIVA de sus datos y comprueba que las que ya registraron sus
 * preguntas quedan fuera y que las dos que no, quedan dentro.
 */
describe('las piezas publicadas', () => {
  // Derivadas del registro de piezas, como en la e2e: una pieza nueva con su
  // bloque de solicitudes entra sola en la comprobación.
  const yaPedidas = REPORTAJE_SLUGS.filter((s) => leerPieza(s).solicitudes != null)

  it('las que ya presentaron sus solicitudes no lo ofrecen', () => {
    expect(yaPedidas.length).toBeGreaterThan(0)
    for (const slug of yaPedidas) {
      const d = leerPieza(slug)
      expect(d.solicitudes?.items?.length, `${slug} tiene solicitudes`).toBeGreaterThan(0)
      expect(debeOfrecerSolicitud(d), slug).toBe(false)
    }
  })

  for (const slug of ['inteligencia-turistica', 'basuras']) {
    describe(slug, () => {
      const d = leerPieza(slug)
      // Lo que su página pone en el escrito, con las mismas dos funciones.
      const preguntas = solicitables(slug, preguntasDe(d))
      const enLaPieza = JSON.stringify(d.preguntas)

      it('lo ofrece', () => {
        expect(preguntas.length).toBeGreaterThan(0)
        expect(debeOfrecerSolicitud({ preguntas, solicitudes: d.solicitudes })).toBe(true)
      })
      it('cada pregunta es literal de la pieza', () => {
        for (const q of preguntas) expect(enLaPieza, q).toContain(JSON.stringify(q).slice(1, -1))
      })
      it('ninguna nombra un cargo que ocupa una sola persona', () => {
        for (const q of preguntas) expect(q).not.toMatch(/alcald|concejal|regidor/i)
      })
      it('ninguna afirma nada fuera de sus signos de interrogación', () => {
        // Lo que queda al quitar cada «¿…?» es, como mucho, una condición
        // («Si hay prórrogas,»). Una frase entera fuera de ellos —«Las dos
        // cosas no pueden ser verdad a la vez:»— es una afirmación. Es un
        // INDICIO, no la regla: una premisa insinuante DENTRO de los signos
        // («una unidad por debajo del umbral…») no la ve, y por eso la decisión
        // es la lista editorial de src/lib/solicitud-apartadas.js, no esto.
        for (const q of preguntas) {
          const fuera = q.replace(/¿[^?]*\?/g, '').trim()
          expect(fuera.length, q).toBeLessThanOrEqual(30)
        }
      })

      it('cada apartada casa con UNA pregunta de la pieza y lleva su porqué', () => {
        // La lista editorial es un pin DELIBERADO por el comienzo literal: si se
        // reescribe una apartada en el JSON, su comienzo deja de casar y
        // entraría en el escrito sin que nadie la hubiera mirado. Aquí se pone
        // rojo, y alguien vuelve a decidir.
        const todas = preguntasDe(d)
        const apartadas = Object.entries(APARTADAS[slug])
        expect(apartadas.length).toBeGreaterThan(0)
        for (const [comienzo, motivo] of apartadas) {
          expect(todas.filter((q) => q.startsWith(comienzo)).length, comienzo).toBe(1)
          expect(motivo.trim().length, comienzo).toBeGreaterThan(0)
          expect(
            preguntas.some((q) => q.startsWith(comienzo)),
            comienzo,
          ).toBe(false)
        }
        expect(preguntas.length + apartadas.length).toBe(todas.length)
      })
    })
  }

  it('basuras aparta las que valoran, afirman, señalan o piden una intención', () => {
    expect(Object.keys(APARTADAS.basuras)).toEqual([
      '¿Sabía el Ayuntamiento, al firmar',
      '¿La resolución fue por incumplimiento',
      '¿Cuánto cuesta el contrato de emergencia de FCC',
      'Los 685.296 €',
      '¿A qué hora hay que sacar los enseres',
      '¿Se va a aplicar la rebaja',
      '¿Quién es responsable de que',
      '¿Consta en las actas alguna advertencia',
    ])
  })

  it('inteligencia turística aparta las ya pedidas en conteo-visitantes y las que insinúan', () => {
    const it_ = APARTADAS['inteligencia-turistica']
    expect(Object.keys(it_)).toEqual([
      '¿Por qué el criterio de juicio de valor',
      '¿Se planteó el Ayuntamiento, tras la DANA',
      '¿Cuál es el grado de ejecución final',
      '¿Considera el Ayuntamiento publicar',
    ])
    for (const yaPedida of [
      '¿Se planteó el Ayuntamiento, tras la DANA',
      '¿Cuál es el grado de ejecución final',
    ]) {
      expect(it_[yaPedida]).toMatch(/^ya pedida en conteo-visitantes/)
    }
  })
})

describe('el correo al que se manda la respuesta', () => {
  it('es el que publica /aviso-legal', () => {
    const aviso = readFileSync(join(__dirname, '..', 'src', 'pages', 'AvisoLegal.jsx'), 'utf8')
    expect(aviso).toContain(`mailto:${CORREO}`)
  })
})
