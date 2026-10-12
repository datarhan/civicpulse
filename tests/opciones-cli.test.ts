/**
 * La guarda de opciones de los CLIs de curador (src/scraper/opciones-cli.ts),
 * por dentro. Por fuera, contra cada CLI, la prueba
 * tests/opciones-desconocidas-cli.test.ts.
 */
import { describe, expect, it } from 'vitest'

import { describirAdmitidas, opcionDesconocida, pareceOpcion } from '../src/scraper/opciones-cli'

const ADMITE = { banderas: ['--dry-run', '-h'], conValor: ['--reason', '--editor'] }

describe('pareceOpcion', () => {
  it.each(['--dry-run', '-n', '--reason=algo', '--x', '-h'])('%s es una opción', (t) => {
    expect(pareceOpcion(t)).toBe(true)
  })

  it.each([
    'una-declaracion',
    '-5',
    '--',
    '-',
    '- una cita que empieza por guion',
    '-Nosotros lo dijimos en el pleno',
    'https://example.org/--dry-run',
    '<nombre y apellidos>',
  ])('«%s» no lo es', (t) => {
    expect(pareceOpcion(t)).toBe(false)
  })
})

describe('opcionDesconocida', () => {
  it('una orden con sólo lo admitido pasa', () => {
    expect(
      opcionDesconocida(['id', 'parcial', '--reason', 'r', '--editor', 'e', '--dry-run'], ADMITE),
    ).toBeNull()
  })

  it('el valor de una opción no se mira como opción aunque lo parezca por fuera', () => {
    expect(opcionDesconocida(['--reason', '- un motivo con guion delante'], ADMITE)).toBeNull()
  })

  it('una opción que no admite se nombra', () => {
    expect(opcionDesconocida(['id', '--nonsense'], ADMITE)).toBe('opción desconocida: --nonsense.')
  })

  it('en cualquier sitio de la orden, también delante de los posicionales', () => {
    expect(opcionDesconocida(['--nonsense', 'id', 'tipo'], ADMITE)).toMatch(/--nonsense/)
  })

  it('--dry-run donde no lo hay avisa de que esto escribe', () => {
    const m = opcionDesconocida(['id', '--dry-run'], { conValor: ['--reason'] })
    expect(m).toMatch(/opción desconocida: --dry-run\./)
    expect(m).toMatch(/no tiene modo de prueba/)
  })

  it('una corta desconocida, también', () => {
    expect(opcionDesconocida(['id', '-n'], ADMITE)).toMatch(/opción desconocida: -n\./)
  })

  it('--x=valor no se admite aunque --x sí: ningún parser de estos lo lee', () => {
    expect(opcionDesconocida(['--reason=algo'], ADMITE)).toMatch(/--reason <valor>/)
  })

  it('una opción con valor sin valor detrás se rechaza', () => {
    expect(opcionDesconocida(['id', '--reason'], ADMITE)).toMatch(/--reason lleva un valor/)
  })

  it('una opción con valor seguida de otra opción se rechaza: se la habría tragado', () => {
    expect(opcionDesconocida(['--editor', '--dry-run'], ADMITE)).toMatch(
      /--editor lleva un valor detrás, y le sigue otra opción \(--dry-run\)/,
    )
  })

  it('sin nada que admitir, cualquier opción se rechaza', () => {
    expect(opcionDesconocida(['a', 'b', 'c'], {})).toBeNull()
    expect(opcionDesconocida(['a', '--dry-run'], {})).toMatch(/--dry-run/)
  })
})

describe('describirAdmitidas', () => {
  it('lista las de valor y las banderas', () => {
    expect(describirAdmitidas(ADMITE)).toBe(
      'Admite: --reason <valor>, --editor <valor>, --dry-run, -h.',
    )
  })

  it('o dice que no admite ninguna', () => {
    expect(describirAdmitidas({})).toBe('No admite ninguna opción: sólo argumentos posicionales.')
  })
})
