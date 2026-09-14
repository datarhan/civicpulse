import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { NetworkStationPopup } from '../../src/components/LiveCity/popups/NetworkStationPopup'
import { LocaleProvider } from '../../src/i18n'
import { detectorDeCastellano, loQueSeLee } from '../setup/castellano'

/**
 * El globo de una estación de la red completa de FGV —las que no son de
 * Riba-roja— decía «Ver horarios en metrovalencia.es →» en castellano también en
 * la portada valenciana. Salió mirando la portada en valencià con el navegador,
 * al comprobar los globos de estación: la prueba de aquellos globos no podía
 * verlo, porque éste vive en otro componente.
 */
const { castellanoEn } = detectorDeCastellano(['L1', 'L2', 'metrovalencia.es'])

const pinta = (idioma) => {
  localStorage.setItem('cp:lang', idioma)
  return render(
    <LocaleProvider>
      <NetworkStationPopup
        name="Benimàmet"
        refs={['L1', 'L2']}
        colors={{ L1: '#E4BE36', L2: '#B4397F' }}
      />
    </LocaleProvider>,
  )
}

afterEach(() => localStorage.clear())

describe('el globo de la red completa en valencià', () => {
  it('no deja nada en castellano', () => {
    const { container } = pinta('ca')
    const texto = loQueSeLee(container).join(' · ')
    // Mide algo: el globo trae su nombre, sus líneas y su enlace.
    expect(texto).toContain('Benimàmet')
    expect(texto).toContain('metrovalencia.es')
    expect(castellanoEn(texto)).toEqual([])
  })

  it('y en castellano, en castellano (el control)', () => {
    const { container } = pinta('es')
    expect(container.textContent).toContain('Ver horarios en metrovalencia.es')
  })
})
