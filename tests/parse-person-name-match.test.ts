import { describe, it, expect } from 'vitest'
import {
  tokenize,
  matchesAnyToken,
  matchesPersonName,
} from '../src/scraper/journalist-tools/internal'

const EVA = tokenize('Eva Lara Catalá')
const PLA = tokenize('Alfredo Plá Gimenez')
const POZUELO = tokenize('Teresa Pozuelo Martín')

describe('matchesAnyToken — whole words, not substrings', () => {
  it('no longer fires on a token buried inside another word', () => {
    // The defect: a bare `includes()` on tokens as short as two characters.
    // Measured on the published corpus, this gave Eva Lara 534 pleno-claim
    // hits and Alfredo Plá 742, nearly all of them false.
    expect(matchesAnyToken('Evaluación del plan de movilidad', EVA)).toBe(false)
    expect(matchesAnyToken('Se renueva el convenio', EVA)).toBe(false)
    expect(matchesAnyToken('Plaza mayor', PLA)).toBe(false)
    expect(matchesAnyToken('Plan general de ordenación', PLA)).toBe(false)
  })

  it('still finds the real thing', () => {
    expect(matchesAnyToken('Eva Lara Catalá interviene en el pleno', EVA)).toBe(true)
    expect(matchesAnyToken('Intervención de Pozuelo sobre urbanismo', POZUELO)).toBe(true)
  })

  it('ignores accents and case, as before', () => {
    expect(matchesAnyToken('LA CONCEJALA CATALA TOMA LA PALABRA', EVA)).toBe(true)
  })
})

describe('matchesPersonName — a lone weak token needs to look like a name', () => {
  it('accepts a distinctive token on its own', () => {
    expect(matchesPersonName('Informe firmado por Pozuelo', POZUELO)).toBe(true)
  })

  it('accepts two tokens of the same name', () => {
    expect(matchesPersonName('interviene Eva Lara', EVA)).toBe(true)
  })

  it('accepts a lone SHORT token when it is capitalised — a real first-name mention', () => {
    // The stricter "needs two tokens" rule threw these away, and they are
    // exactly how a transcript refers to someone.
    expect(matchesPersonName('en este caso no estaba Eva, estaba Sáfira', EVA)).toBe(true)
    expect(matchesPersonName('como dice Eva, está solventado', EVA)).toBe(true)
  })

  it('rejects a lone short token that is just a lowercase word', () => {
    // `pla` is Valencian for "plan". This branch is why the rule exists, so it
    // has to be exercised — a rule that never fires is not a rule.
    expect(matchesPersonName('aprovació del pla general', PLA)).toBe(false)
    expect(matchesPersonName('el pla urbanístic es va aprovar', PLA)).toBe(false)
  })

  it('still accepts that same token once the name is really there', () => {
    expect(matchesPersonName('El regidor Plá defensa el pla general', PLA)).toBe(true)
  })

  it('rejects text naming nobody', () => {
    expect(matchesPersonName('Aprobación del presupuesto municipal', EVA)).toBe(false)
    expect(matchesPersonName('', EVA)).toBe(false)
    expect(matchesPersonName('Eva Lara', [])).toBe(false)
  })
})
