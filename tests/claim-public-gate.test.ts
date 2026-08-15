import { describe, it, expect } from 'vitest'
import { classifyClaimVisibility, gateItemsForPublic } from '../src/scraper/claim-public-gate'

const item = (
  type: string,
  verdict: string | undefined,
  accusationSubtype?: string,
  // Por defecto, un verificador anotado: es lo que deja el verificador real en
  // todos sus caminos, y un fixture sin él estaría probando el caso raro
  // creyendo probar el normal.
  checkedAgainst: string[] = ['tenders'],
) => ({
  claim: {
    type,
    accusationSubtype,
    plenoId: 'p1',
    plenoDate: '2026-04-20',
    verbatim: 'x',
    segmentIndex: 0,
  },
  verification: { verdict, confidence: 1, checkedAgainst },
})

describe('classifyClaimVisibility', () => {
  it('hides opinativa accusations regardless of verdict', () => {
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'sin-datos', 'opinativa') as never),
    ).toBe('hidden')
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'verificado', 'opinativa') as never),
    ).toBe('hidden')
  })
  it('hides factual/contra-datos accusations that are NOT data-grounded', () => {
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'sin-datos', 'factual') as never),
    ).toBe('hidden')
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'sin-datos', 'contra-datos') as never),
    ).toBe('hidden')
  })
  it('shows data-grounded factual/contra-datos accusations', () => {
    // `contradicho` is now curator-gated on its own (see the machine-contradicho
    // block below), so a data-grounded accusation is exercised here with
    // `parcial` — the strongest verdict the machine may publish unaided.
    expect(classifyClaimVisibility(item('acusacion_publica', 'parcial', 'factual') as never)).toBe(
      'shown',
    )
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'verificado', 'contra-datos') as never),
    ).toBe('shown')
  })
  it('treats a missing accusation subtype as opinativa (hidden)', () => {
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'verificado', undefined) as never),
    ).toBe('hidden')
  })
  it('shows data-grounded non-accusation claims', () => {
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'verificado') as never)).toBe(
      'shown',
    )
    expect(classifyClaimVisibility(item('cita_obra', 'parcial') as never)).toBe('shown')
    expect(classifyClaimVisibility(item('promesa', 'promesa-repetida') as never)).toBe('shown')
  })
  it('puts non-grounded non-accusation claims behind the toggle', () => {
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'sin-datos') as never)).toBe(
      'toggle',
    )
  })
  it('fail-safe: unknown verdict never resolves to shown', () => {
    expect(classifyClaimVisibility(item('acusacion_publica', undefined, 'factual') as never)).toBe(
      'hidden',
    )
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'weird-verdict') as never)).toBe(
      'toggle',
    )
  })
})

describe('gateItemsForPublic', () => {
  it('drops hidden items and stamps visibility on survivors', () => {
    const out = gateItemsForPublic([
      item('acusacion_publica', 'sin-datos', 'opinativa') as never, // hidden
      item('afirmacion_numerica', 'verificado') as never, // shown
      item('afirmacion_numerica', 'sin-datos') as never, // toggle
    ])
    expect(out).toHaveLength(2)
    expect(out.map((x) => x.visibility)).toEqual(['shown', 'toggle'])
  })
})

describe('claim-public-gate — machine contradicho', () => {
  it('hides a contradicho the machine assigned', () => {
    // The matcher fires on a strong name match with a mismatched amount, which
    // is indistinguishable from an unrelated contract. It published a €2.36bn
    // regional DANA figure as "refuted" by a municipal rubble-clearing job.
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'contradicho') as never)).toBe(
      'hidden',
    )
  })

  it('shows a contradicho a curator stands behind', () => {
    const machine = item('afirmacion_numerica', 'contradicho')
    expect(
      classifyClaimVisibility({
        ...machine,
        verification: { ...machine.verification, source: 'curator' },
      } as never),
    ).toBe('shown')
  })
})

// ---------------------------------------------------------------------------
describe('claim-public-gate — un veredicto sin verificador anotado no está fundado', () => {
  /**
   * `checkedAgainst` es lo que el verificador anota sobre SU PROPIO trabajo: las
   * fuentes cuyo emparejador llegó a ejecutarse. Se llena así desde que se vio
   * que rellenarlo al LEER los ficheros hacía que cada fila afirmara haber
   * consultado PLACSP, TED, BDNS y el presupuesto cuando los bucles que los
   * consultan van condicionados (ver `note` en claim-verifier.ts). Vacío
   * significa, literalmente, que no consta nada — y una fila que trae evidencia
   * y no anota fuente afirma las dos cosas a la vez.
   *
   * No es una ampliación de la política de este fichero, es aplicarla: «lo que
   * no esté EXPLÍCITAMENTE fundado se oculta (acusaciones) o se pliega (el
   * resto)». Una fila que no dice quién la comprobó no está explícitamente
   * fundada.
   *
   * Lo que estaba en juego, medido el 2026-08-15 al regenerar el corpus:
   *
   *     veredictos fuertes             113 → 254
   *     ACUSACIONES PÚBLICAS fuertes    16 →  65
   *     de ésas, por coincidencia léxica  3 →  49
   *
   * Cuarenta y nueve acusaciones contra grupos municipales cuyo único respaldo
   * es que una palabra sale en el título de un contrato. El mismo emparejador
   * que da «verificado» a «Vox dice que no, que no» contra un contrato de voto
   * electrónico, y «parcial» a «Reducimos en cultura,» — un trozo de discurso.
   *
   * Este fichero ya documenta esa avería del emparejador para `contradicho` (el
   * «2.364 millones para la dana» refutado por un contrato de escombros) y por
   * eso lo oculta. `verificado` y `parcial` entraban por la puerta de al lado.
   */
  it('oculta una acusación cuyo veredicto no anota verificador', () => {
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'verificado', 'factual', []) as never),
    ).toBe('hidden')
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'parcial', 'contra-datos', []) as never),
    ).toBe('hidden')
  })

  it('pliega tras el desplegable una cita cuyo veredicto no anota verificador', () => {
    expect(classifyClaimVisibility(item('cita_obra', 'verificado', undefined, []) as never)).toBe(
      'toggle',
    )
    expect(classifyClaimVisibility(item('cita_obra', 'parcial', undefined, []) as never)).toBe(
      'toggle',
    )
  })

  it('falla del lado seguro cuando el campo ni siquiera está', () => {
    // Es el caso contra el que avisa `ClaimVisibilityInput`: un campo que quien
    // llama no reenvía llega `undefined`. Aquí eso tiene que OCULTAR, no
    // publicar.
    const sinCampo = {
      claim: { type: 'acusacion_publica', accusationSubtype: 'factual' },
      verification: { verdict: 'verificado' },
    }
    expect(classifyClaimVisibility(sinCampo as never)).toBe('hidden')
  })

  it('un curador sigue pudiendo publicar lo que firma', () => {
    // La promoción por curador es la vía sancionada para pasar esta puerta, y no
    // puede depender de que una máquina anotara algo.
    const c = item('acusacion_publica', 'verificado', 'factual', [])
    expect(
      classifyClaimVisibility({
        ...c,
        verification: { ...c.verification, source: 'curator' },
      } as never),
    ).toBe('shown')
  })

  it('sigue publicando lo que SÍ anota quién lo comprobó', () => {
    // Control: sin esto, un «oculta todo» pasaría estas pruebas y vaciaría la
    // página entera.
    expect(
      classifyClaimVisibility(
        item('acusacion_publica', 'verificado', 'factual', ['tenders', 'bdns']) as never,
      ),
    ).toBe('shown')
    expect(
      classifyClaimVisibility(
        item('cita_obra', 'parcial', undefined, ['llm-second-pass']) as never,
      ),
    ).toBe('shown')
  })
})
