import { describe, it, expect } from 'vitest'
import { archivosDe, esArchivoDe, nombrePrincipal } from '../src/scraper/superseded-archive'
import { classifyClaimProvenance } from '../src/scraper/claim-provenance'

/**
 * El archivo de sustituidas tenía UNA ranura y una sesión se re-transcribe más
 * de una vez.
 *
 * Medido el 4-09-2026 sobre las 24 declaraciones «sin rastro» del corpus
 * publicado: k4olcs pasó por el transcriptor el 24-abr, el 28-abr y el 1-ago, y
 * ma87e0 dos veces el 21-abr y otra el 1-ago. En las dos, la segunda
 * re-transcripción pisó el archivo de la primera y tres citas publicadas se
 * quedaron sin procedencia — dos de ellas a nombre del PSOE, que es la peor
 * mitad: publicamos el bloc y no podíamos enseñar de dónde salía la frase.
 */
describe('nombres del archivo de sustituidas', () => {
  it('reconoce la ranura principal y las etiquetadas', () => {
    expect(esArchivoDe('k4olcs.txt', 'k4olcs')).toBe(true)
    expect(esArchivoDe('k4olcs.06764492.txt', 'k4olcs')).toBe(true)
    expect(esArchivoDe('k4olcs.2026-04-28.txt', 'k4olcs')).toBe(true)
  })

  /**
   * Exige el id como PRIMER SEGMENTO ENTERO, no como prefijo. Hoy ninguno de
   * los 22 ids es prefijo de otro, pero el día que lo sea, `startsWith`
   * archivaría las citas de una sesión bajo otra y nadie lo notaría hasta que
   * una procedencia apareciera donde no debe.
   */
  it('no confunde una sesión cuyo id empieza igual', () => {
    expect(esArchivoDe('k4olcsX.txt', 'k4olcs')).toBe(false)
    expect(esArchivoDe('k4olcsX.06764492.txt', 'k4olcs')).toBe(false)
    expect(esArchivoDe('otra.txt', 'k4olcs')).toBe(false)
  })

  it('descarta lo que no es una transcripción', () => {
    expect(esArchivoDe('README.md', 'README')).toBe(false)
    expect(esArchivoDe('k4olcs.json', 'k4olcs')).toBe(false)
    // Etiqueta vacía: no identifica ninguna versión.
    expect(esArchivoDe('k4olcs..txt', 'k4olcs')).toBe(false)
    // Más segmentos de los que la convención define.
    expect(esArchivoDe('k4olcs.a.b.txt', 'k4olcs')).toBe(false)
  })

  it('devuelve la principal primero y el resto en orden estable', () => {
    const entradas = [
      'ma87e0.txt',
      'k4olcs.2026-04-28.txt',
      'README.md',
      'k4olcs.06764492.txt',
      'k4olcs.txt',
    ]
    expect(archivosDe(entradas, 'k4olcs')).toEqual([
      'k4olcs.txt',
      'k4olcs.06764492.txt',
      'k4olcs.2026-04-28.txt',
    ])
    expect(nombrePrincipal('k4olcs')).toBe('k4olcs.txt')
  })

  it('sin ranura principal devuelve sólo las etiquetadas', () => {
    expect(archivosDe(['k4olcs.06764492.txt'], 'k4olcs')).toEqual(['k4olcs.06764492.txt'])
    expect(archivosDe(['otra.txt'], 'k4olcs')).toEqual([])
  })
})

describe('procedencia con varias sustituidas', () => {
  const VIGENTE = 'lo que se dice hoy en la sesion'
  const CITA = 'quedo como primera clasificada la firma'

  it('encuentra la cita en una sustituida que no es la principal', () => {
    expect(
      classifyClaimProvenance({
        verbatim: CITA,
        current: VIGENTE,
        superseded: ['la principal no la trae', `y aqui si: ${CITA}, dijo`],
      }),
    ).toBe('solo-superseded')
  })

  /**
   * CONTROL: con la lista recortada a la principal —que es exactamente lo que
   * hacía el código anterior— la misma cita vuelve a salir sin rastro. Sin
   * este control la prueba de arriba pasaría igual con el arreglo deshecho.
   */
  it('con sólo la principal, esa misma cita sale sin rastro', () => {
    expect(
      classifyClaimProvenance({
        verbatim: CITA,
        current: VIGENTE,
        superseded: ['la principal no la trae'],
      }),
    ).toBe('sin-rastro')
  })

  it('sigue aceptando una sola sustituida como string', () => {
    expect(
      classifyClaimProvenance({ verbatim: CITA, current: VIGENTE, superseded: `dijo ${CITA}, si` }),
    ).toBe('solo-superseded')
  })

  it('la vigente manda sobre cualquier sustituida', () => {
    expect(
      classifyClaimProvenance({
        verbatim: CITA,
        current: `hoy dice ${CITA}, tambien`,
        superseded: [`y ayer ${CITA}`],
      }),
    ).toBe('vigente')
  })

  /** Sin acta no se ha comprobado nada, y eso no es «no se encontró». */
  it('sin transcripción vigente no juzga, aunque haya sustituidas', () => {
    expect(
      classifyClaimProvenance({ verbatim: CITA, current: null, superseded: [`trae ${CITA}`] }),
    ).toBe('sin-transcripcion')
  })

  it('lista vacía es lo mismo que no haber archivo', () => {
    expect(classifyClaimProvenance({ verbatim: CITA, current: VIGENTE, superseded: [] })).toBe(
      'sin-rastro',
    )
    expect(classifyClaimProvenance({ verbatim: CITA, current: VIGENTE, superseded: null })).toBe(
      'sin-rastro',
    )
  })
})
