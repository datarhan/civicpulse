/**
 * El contrato editorial publicado tiene que decir lo que hace la copia servida
 * con la bitácora de /hallazgos (src/scraper/grupos-retenidos.ts): la versión
 * que nombraba a un grupo de un solo escaño no se reproduce, y el repositorio
 * público la conserva.
 *
 * Dos cosas que se rompen sin que ningún dato lo vea. El ancla: la nota al pie
 * de la bitácora y el campo `metodologia` de la copia servida apuntan a una
 * sección, y un enlace a un ancla que no existe deja al lector arriba de la
 * página sin explicación. Y la promesa: esta sección no puede decir «no se
 * publica» de algo que el repositorio sigue publicando —la misma vara que
 * /metodologia#citas-contraste lleva desde #155—.
 *
 * Se lee el texto RENDERIZADO, como en metodologia-citas-contraste.test.jsx.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import Metodologia from '../src/pages/Metodologia'
import AvisoLegal from '../src/pages/AvisoLegal'
import { retenerGruposDeUnEscano } from '../src/scraper/grupos-retenidos'
import { invalidateSnapshots } from '../src/lib/snapshot-store'

const realFetch = globalThis.fetch

/** El ancla a la que apunta la copia servida, leída de la transformación y no escrita aquí. */
const ANCLA = retenerGruposDeUnEscano({ items: [] }, []).snapshot.gruposRetenidos.metodologia

beforeAll(() => {
  globalThis.fetch = async () => new Response('not found', { status: 404 })
  invalidateSnapshots()
})

afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

describe('/metodologia explica la bitácora de un solo escaño', () => {
  it('la copia servida apunta a una sección de /metodologia', () => {
    expect(ANCLA).toMatch(/^\/metodologia#[a-z-]+$/)
  })

  it('la sección existe con el ancla a la que apuntan la bitácora y la copia servida', () => {
    const { container } = render(<Metodologia />)
    expect(container.querySelector(`#${ANCLA.split('#')[1]}`)).not.toBeNull()
  })

  it('dice que no se reproduce, por qué, y que el repositorio público la conserva', () => {
    const { container } = render(<Metodologia />)
    const texto = container
      .querySelector(`#${ANCLA.split('#')[1]}`)
      .textContent.replace(/\s+/g, ' ')
    expect(texto).toMatch(/no se reproduce/)
    expect(texto).toMatch(/un solo concejal/)
    expect(texto).toMatch(/repositorio/)
    expect(texto).toMatch(/público/)
    // Sigue en el repositorio: «no se publica» sería falso.
    expect(texto).not.toMatch(/no (?:la |lo |las |los |se )?publica/i)
  })
})

describe('/aviso-legal lo dice donde explica las correcciones', () => {
  it('la sección de rectificación enlaza la explicación', () => {
    const { container } = render(<AvisoLegal />)
    const rectificacion = container.querySelector('#rectificacion')
    expect(rectificacion).not.toBeNull()
    const enlaces = [...rectificacion.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(enlaces).toContain(ANCLA)
    expect(rectificacion.textContent.replace(/\s+/g, ' ')).toMatch(/un solo escaño/)
  })
})
