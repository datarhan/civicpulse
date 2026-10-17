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

import { textoSolicitudLector, debeOfrecerSolicitud } from '../src/lib/solicitud-lector'
import { preguntasSolicitables, APARTADAS } from '../src/pages/reportajes/Basuras'

const pieza = {
  titulo: 'Inteligencia turística',
  url: 'https://civicpulse.es/reportajes/inteligencia-turistica',
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
  it('sin preguntas no hay escrito', () => {
    expect(() => textoSolicitudLector({ ...pieza, preguntas: [] })).toThrow()
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
  it('las que ya presentaron sus solicitudes no lo ofrecen', () => {
    for (const slug of ['matriculas-y-moviles', 'conteo-visitantes', 'coste-efectivo']) {
      const d = leerPieza(slug)
      expect(d.solicitudes?.items?.length, `${slug} tiene solicitudes`).toBeGreaterThan(0)
      expect(debeOfrecerSolicitud(d), slug).toBe(false)
    }
  })

  /** Lo que cada pieza que lo ofrece pone en el escrito, como lo calcula su página. */
  const ofrecidas = {
    'inteligencia-turistica': (d) => d.preguntas,
    basuras: (d) => preguntasSolicitables(d.preguntas),
  }

  for (const [slug, deLaPagina] of Object.entries(ofrecidas)) {
    describe(slug, () => {
      const d = leerPieza(slug)
      const preguntas = deLaPagina(d)
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
        // cosas no pueden ser verdad a la vez:»— es una afirmación.
        for (const q of preguntas) {
          const fuera = q.replace(/¿[^?]*\?/g, '').trim()
          expect(fuera.length, q).toBeLessThanOrEqual(30)
        }
      })
    })
  }

  it('basuras deja fuera las que valoran o afirman, y lo dice en su número', () => {
    const d = leerPieza('basuras')
    const total = d.preguntas.bloques.reduce((s, b) => s + b.items.length, 0)
    const elegidas = preguntasSolicitables(d.preguntas)
    expect(elegidas.length).toBeLessThan(total)
    // Las apartadas, por su comienzo literal, para que un cambio de orden en el
    // JSON no cambie en silencio cuáles se piden.
    for (const fuera of [
      '¿Sabía el Ayuntamiento, al firmar',
      '¿La resolución fue por incumplimiento',
      'Los 685.296 €',
      '¿Se va a aplicar la rebaja',
      '¿Quién es responsable de que',
      '¿Consta en las actas alguna advertencia',
    ]) {
      expect(
        elegidas.some((q) => q.startsWith(fuera)),
        fuera,
      ).toBe(false)
    }
  })

  it('cada apartada de basuras casa con UNA pregunta de la pieza', () => {
    // Si se reescribe una apartada en el JSON, su comienzo deja de casar y
    // entraría en el escrito sin que nadie la hubiera mirado: aquí se pone rojo.
    const todas = leerPieza('basuras').preguntas.bloques.flatMap((b) => b.items.map((it) => it.q))
    expect(Object.keys(APARTADAS).length).toBeGreaterThan(0)
    for (const [comienzo, motivo] of Object.entries(APARTADAS)) {
      expect(todas.filter((q) => q.startsWith(comienzo)).length, comienzo).toBe(1)
      expect(motivo.length, comienzo).toBeGreaterThan(0)
    }
  })
})
