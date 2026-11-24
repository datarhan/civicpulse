/**
 * Un atributo en cada capa vecinal: `data-lectura-vecinal` (plan revisado de
 * las dos lecturas, 4a.5).
 *
 * Hasta ahora sólo los bloques «En breve» se podían encontrar
 * (`data-en-breve-bloque`); la frase de /empleo, la de /cambios y la de /datos
 * no llevaban nada común, así que una medida de «la capa vecinal» no las veía.
 * Con un atributo, la medida y las pruebas buscan lo mismo en todas las
 * páginas, y cada página nueva con lectura vecinal lo añade a lo que construye.
 *
 * Y la cifra de una tarjeta se casa con su detalle por atributo, no por texto:
 * «En breve» imprime `eurosBreves` donde el detalle imprime `euros`, así que
 * comparar lo impreso daría desacuerdos falsos. La tarjeta dice qué cifra es
 * (`data-cifra`) y cuánto vale sin formato (`data-cifra-valor`); el detalle al
 * que enlaza lleva los mismos dos atributos.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import EnBreve, { TarjetaEnBreve } from '../../src/components/EnBreve'
import { FraseDeLaSemana } from '../../src/components/Cambios/FraseDeLaSemana'
import { LocaleProvider } from '../../src/i18n'

describe('data-lectura-vecinal', () => {
  it('el bloque «En breve» lo lleva', () => {
    const { container } = render(
      <EnBreve titulo="En breve" intro="Intro" saltarA="#todo" saltarTexto="Todo">
        <TarjetaEnBreve id="a" pregunta="¿Cuánto?" frases={['Una frase cualquiera.']} />
      </EnBreve>,
    )
    const capa = container.querySelector('[data-lectura-vecinal]')
    expect(capa, 'el bloque no lleva el atributo').not.toBeNull()
    expect(capa.hasAttribute('data-en-breve-bloque')).toBe(true)
  })

  it('la frase de /cambios lo lleva', () => {
    const { container } = render(
      <LocaleProvider>
        <FraseDeLaSemana byKind={{}} fuentes={{}} dias={7} hoy={Date.parse('2026-11-23')} />
      </LocaleProvider>,
    )
    const capa = container.querySelector('[data-lectura-vecinal]')
    expect(capa, 'la frase no lleva el atributo').not.toBeNull()
    expect(capa.hasAttribute('data-cambios-frase')).toBe(true)
  })
})

describe('la cifra de una tarjeta, por atributo', () => {
  it('con clave y valor, la cifra los lleva sin formato', () => {
    const { container } = render(
      <TarjetaEnBreve
        id="gastado"
        pregunta="¿Cuánto se ha gastado?"
        cifra="19,3 M€"
        cifraClave="ejecutado"
        cifraValor={19312345.67}
        frases={['Una frase cualquiera.']}
        ancla="#cascada"
        anclaTexto="Ver el detalle"
      />,
    )
    const cifra = container.querySelector('.cp-en-breve-cifra')
    expect(cifra.getAttribute('data-cifra')).toBe('ejecutado')
    expect(cifra.getAttribute('data-cifra-valor')).toBe('19312345.67')
  })

  it('sin clave, la cifra no inventa una', () => {
    const { container } = render(
      <TarjetaEnBreve id="x" pregunta="¿Cuántos?" cifra="12" frases={['Una frase cualquiera.']} />,
    )
    const cifra = container.querySelector('.cp-en-breve-cifra')
    expect(cifra.hasAttribute('data-cifra')).toBe(false)
    expect(cifra.hasAttribute('data-cifra-valor')).toBe(false)
  })
})
