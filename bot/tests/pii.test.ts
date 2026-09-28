import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLASES_PII, MARCA_RETIRADO, limpiarDatosPersonales } from '../src/services/pii'

/**
 * Lo que el texto de una queja no guarda: los teléfonos, correos, DNI, NIE, IBAN
 * y matrículas que reconoce, sustituidos por una marca. Los casos viven en
 * fixtures/pii-casos.json, con los intactos: ids de queja, fechas, códigos
 * postales, importes en euros, el NIF de una empresa, y un DNI y un IBAN con el
 * dígito de control mal. Quitar un importe corrompe la queja tanto como dejar un
 * teléfono la expone.
 */
const casos = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'pii-casos.json'), 'utf8')) as {
  retirados: Array<{ texto: string; clase: string }>
  intactos: string[]
}

describe('limpiarDatosPersonales', () => {
  it('los casos cubren cada clase que se retira', () => {
    expect([...new Set(casos.retirados.map((c) => c.clase))].sort()).toEqual([...CLASES_PII].sort())
  })

  it.each(casos.retirados.map((c) => [c.clase, c.texto]))('retira un %s: «%s»', (clase, texto) => {
    const r = limpiarDatosPersonales(texto)
    expect(r.texto).toContain(MARCA_RETIRADO)
    expect(r.retirados).toEqual({ [clase]: 1 })
    // Lo que queda no conserva ni un trozo reconocible del dato.
    expect(r.texto.replaceAll(MARCA_RETIRADO, '')).not.toMatch(/\d{3,}|@/)
  })

  it.each(casos.intactos.map((t) => [t]))('deja intacto «%s»', (texto) => {
    expect(limpiarDatosPersonales(texto)).toEqual({ texto, retirados: {} })
  })

  it('cuenta cada clase por separado, y no devuelve nunca lo que retira', () => {
    const r = limpiarDatosPersonales(
      'Llamad al 600 000 001 o al 600 000 002, o escribid a vecina.prueba@example.com (DNI 12345678Z).',
    )
    expect(r.retirados).toEqual({ telefono: 2, correo: 1, dni: 1 })
    expect(JSON.stringify(r)).not.toMatch(/600|example|12345678/)
  })

  it('un texto sin nada que retirar sale igual, sin clases vacías', () => {
    const texto = 'La farola de la plaza lleva apagada desde el lunes.'
    expect(limpiarDatosPersonales(texto)).toEqual({ texto, retirados: {} })
  })
})
