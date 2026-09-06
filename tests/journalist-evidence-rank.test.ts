import { describe, it, expect } from 'vitest'
import { rankEvidenceForSynth } from '../src/scraper/journalist-agent/evidence-rank'

/**
 * La síntesis sólo ve las 18 primeras filas de evidencia (tope de prompt). El
 * orden era confianza alta primero y luego fecha — así que una captura de
 * prensa sembrada por la curaduría (confianza media, la única fuente
 * independiente de un concejal de a pie) caía fuera del tope detrás de
 * dieciocho actas. Lo sembrado va primero: alguien ya decidió que importa.
 */
const row = (
  id: string,
  trust: 'high' | 'medium' | 'low',
  publishedAt?: string,
  seeded?: boolean,
) => ({
  citationId: id,
  kind: 'web',
  title: id,
  trust,
  ...(publishedAt ? { publishedAt } : {}),
  ...(seeded ? { seeded: true as const } : {}),
})

describe('rankEvidenceForSynth', () => {
  it('lo sembrado va delante aunque su confianza sea menor', () => {
    const out = rankEvidenceForSynth(
      [row('acta', 'high'), row('prensa', 'medium', '2024-01-01', true)],
      18,
    )
    expect(out.map((r) => r.citationId)).toEqual(['prensa', 'acta'])
  })

  it('después de lo sembrado, confianza alta primero y luego lo más reciente', () => {
    const out = rankEvidenceForSynth(
      [
        row('low-viejo', 'low', '2019-01-01'),
        row('high-viejo', 'high', '2015-01-01'),
        row('high-nuevo', 'high', '2024-01-01'),
        row('medium', 'medium', '2023-01-01'),
      ],
      18,
    )
    expect(out.map((r) => r.citationId)).toEqual([
      'high-nuevo',
      'high-viejo',
      'medium',
      'low-viejo',
    ])
  })

  it('respeta el tope y no descarta lo sembrado al recortar', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      row(`acta-${i}`, 'high', `2020-01-${String(i + 1).padStart(2, '0')}`),
    )
    const out = rankEvidenceForSynth([...many, row('sembrada', 'low', undefined, true)], 18)
    expect(out).toHaveLength(18)
    expect(out[0].citationId).toBe('sembrada')
  })

  it('no muta la entrada', () => {
    const input = [row('b', 'low'), row('a', 'high')]
    const copy = JSON.parse(JSON.stringify(input))
    rankEvidenceForSynth(input, 18)
    expect(input).toEqual(copy)
  })
})
