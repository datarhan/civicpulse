/**
 * Una enmienda del motivo de una corrección publicada la firma una persona, con
 * su nombre: nunca una cuenta de rol, un proceso ni un modelo.
 *
 * Lo que motiva la regla está en los datos. La bitácora de /hallazgos lleva
 * firmas `civicpulse-curator`, `claude-opus-5` y `claude-fable-5.1`, y la lista
 * de retiradas una `retirada-pasada-llm`: rótulos que no dicen quién decidió.
 * Enmendar el motivo de una corrección es reescribir la explicación que la
 * página dio de un cambio sobre un grupo político con nombre, y eso lo firma
 * alguien a quien se le pueda pedir cuentas por su nombre.
 *
 * `rechazoDeFirma` mira la FORMA de la firma. No puede saber si el nombre es de
 * verdad el de quien ejecuta la orden; lo que sí hace imposible es el despiste
 * común —firmar con la cuenta de rol, con el identificador de un modelo o con
 * el marcador que traía la orden preparada—.
 */
import { describe, expect, it } from 'vitest'

import { claseDeFirma, nombraAUnaPersona, rechazoDeFirma } from '../src/scraper/firma-de-persona'
import { HUMAN_CURATORS } from '../src/scraper/finding-authorship'

describe('rechazoDeFirma — firmas que nombran a una persona', () => {
  it.each([
    'María de la Fuente Llorens',
    'Josep Vicent Martí i Pons',
    'Ana Pérez-Llorca',
    'Núria d’Alòs Moner',
    'Ángel Ruiz',
    '  Àngels   Ferrer  ',
    'María J. Fuente',
  ])('acepta «%s»', (nombre) => {
    expect(rechazoDeFirma(nombre)).toBeNull()
    expect(nombraAUnaPersona(nombre)).toBe(true)
  })
})

describe('rechazoDeFirma — firmas que no nombran a nadie', () => {
  it.each([
    // Las formas que ya han firmado filas publicadas, tal cual.
    ['civicpulse-curator', /cuenta, un rol o un proceso/],
    ['civicpulse-auto', /cuenta, un rol o un proceso/],
    ['auto-curation-v1', /marcador o un identificador/],
    ['claude-opus-5', /marcador o un identificador/],
    ['claude-fable-5.1', /marcador o un identificador/],
    ['retirada-pasada-llm', /cuenta, un rol o un proceso/],
    ['datarhan', /forma de nombre propio/],
    // El marcador de una orden preparada, sin rellenar.
    ['<nombre y apellidos>', /marcador o un identificador/],
    ['<nombre>', /marcador o un identificador/],
    ['Nombre Apellido', /marcador de una orden sin rellenar/],
    ['Tu Nombre', /marcador de una orden sin rellenar/],
    // Rótulos y modelos escritos como si fueran nombres.
    ['Curador A', /cuenta, un rol o un proceso/],
    ['Claude', /cuenta, un rol o un proceso/],
    ['Claude Opus', /cuenta, un rol o un proceso/],
    ['Equipo CivicPulse', /cuenta, un rol o un proceso/],
    ['Redacción', /cuenta, un rol o un proceso/],
    // Formas que no son un nombre y apellido.
    ['María', /nombre y al menos un apellido/],
    ['maría fuente', /forma de nombre propio/],
    ['MARÍA FUENTE', /forma de nombre propio/],
    ['', /vacía/],
    ['   ', /vacía/],
  ])('rechaza «%s»', (editor, motivo) => {
    expect(rechazoDeFirma(editor)).toMatch(motivo)
    expect(nombraAUnaPersona(editor)).toBe(false)
  })

  it('rechaza las identidades que el proyecto cuenta como humanas: son rótulos, no nombres', () => {
    // `HUMAN_CURATORS` responde a otra pregunta —¿lo publicó una persona o un
    // proceso?— y para ella basta la cuenta del operador. Para decir QUIÉN
    // enmendó un motivo, no: la cuenta es la misma se siente quien se siente.
    expect(HUMAN_CURATORS.size).toBeGreaterThan(0)
    for (const cuenta of HUMAN_CURATORS) {
      expect(rechazoDeFirma(cuenta), cuenta).not.toBeNull()
    }
  })

  it('no acepta lo que no es texto', () => {
    expect(rechazoDeFirma(undefined as unknown as string)).toMatch(/vacía/)
    expect(rechazoDeFirma(42 as unknown as string)).toMatch(/vacía/)
  })
})

/**
 * Quién decidió una bajada, dicho desde su firma: una persona, un proceso o un
 * modelo, o no consta.
 *
 * Las 69 bajadas de curador del overlay (medido el 30-09-2026) llevan cinco
 * firmas, y la tarjeta las rotulaba todas «corregido por un curador». Cuarenta
 * y tres las firmó una revisión con un modelo, y cuatro, «sergei», no dicen
 * quién: `rechazoDeFirma` las rechaza por la forma, sin ninguna palabra de
 * proceso. Llamarlas «automáticas» sería afirmar lo que no sabemos; llamarlas
 * «de un curador», también.
 */
describe('claseDeFirma — quién decidió, según la firma', () => {
  it.each([
    // Las firmas de las bajadas publicadas, tal cual.
    ['Sergei Lutchenko', 'persona'],
    ['ai-gold-review', 'automatica'],
    ['claude-fable-5.1', 'automatica'],
    ['Claude (revisión 17-08, aprobada en plan)', 'automatica'],
    ['sergei', 'no-consta'],
    // Las de otras capas, por si llegan a firmar una bajada.
    ['María de la Fuente Llorens', 'persona'],
    ['claude-opus-5', 'automatica'],
    ['auto-curation-v1', 'automatica'],
    ['civicpulse-auto', 'automatica'],
    ['retirada-pasada-llm', 'automatica'],
    ['verdict-engine:gpt-5.4-mini', 'automatica'],
    // Lo que firma sin decir quién: el valor por defecto de la CLI, la cuenta
    // de rol (la misma se siente quien se siente), un alias y un marcador.
    ['curator', 'no-consta'],
    ['civicpulse-curator', 'no-consta'],
    ['datarhan', 'no-consta'],
    ['<nombre y apellidos>', 'no-consta'],
    ['Nombre Apellido', 'no-consta'],
    ['', 'no-consta'],
  ])('«%s» → %s', (editor, clase) => {
    expect(claseDeFirma(editor)).toBe(clase)
  })

  it('una firma que falta no es de nadie', () => {
    expect(claseDeFirma(undefined)).toBe('no-consta')
    expect(claseDeFirma(null)).toBe('no-consta')
    expect(claseDeFirma(42)).toBe('no-consta')
  })
})
