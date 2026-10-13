/**
 * Corregir un desglose publicado deja constancia firmada.
 *
 * El 13-10-2026, con el acta de la sesión del 09-02 en la mano, rx4hb4-10 y
 * rx4hb4-11 publicaban el voto de PP y VOX al revés de lo que recoge el acta.
 * No había forma de corregirlo con rastro: `npm run pleno-vote` sustituía la
 * fila en silencio, y `retract-vote --breakdown` seguido de `--unretract`
 * devolvía el desglose equivocado. Estas pruebas fijan la tercera vía —el libro
 * de correcciones— y que el escritor se niegue a cambiar un desglose sin ella.
 *
 * Ninguna toca el public/data/ del repositorio: el corpus lo construyen los
 * validadores de producción (tests/helpers/pleno-votes-snapshot.ts) y los CLIs
 * se lanzan en un directorio temporal con su propia copia.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  correctVoteBreakdown,
  latestCorrection,
  retractVoteBreakdown,
  validateSnapshot,
  type VoteSourceRef,
} from '../src/scraper/pleno-votes'
import {
  buildSnapshot,
  buildSnapshotWithBreakdownRetracted,
  rx4hb4Item11,
} from './helpers/pleno-votes-snapshot'

const ACTA_URL =
  'https://regmeet.com/files/uploads/aytoribarroja/09-02-2026.Pleno2026-02-10_20-43-39/documentos/2026-07-30_13-45-56_0.pdf'
const fuenteActa: VoteSourceRef = {
  kind: 'acta',
  url: ACTA_URL,
  publisher: 'Ayuntamiento de Riba-roja de Túria',
  retrievedAt: '2026-10-13',
  verification: 'sin-verificar',
}
const VOTOS_ACTA = [
  { bloc: 'PSOE', direction: 'a_favor', seats: 11 },
  { bloc: 'EU-Podem', direction: 'a_favor', seats: 1 },
  { bloc: 'Compromís', direction: 'a_favor', seats: 1 },
  { bloc: 'PP', direction: 'en_contra', seats: 7 },
  { bloc: 'VOX', direction: 'abstencion', seats: 1 },
] as const
const SIG = {
  reason:
    'El acta de la sesión (punto 11, votación del fondo) recoge PP en contra y VOX abstención; publicábamos lo contrario, leído de la transcripción automática.',
  editor: 'Sergei Lutchenko',
  at: '2026-10-13T12:00:00.000Z',
}

describe('correctVoteBreakdown', () => {
  it('sustituye el desglose, cambia su fuente y deja constancia del original', () => {
    const snap = buildSnapshot()
    const out = validateSnapshot(
      correctVoteBreakdown(
        snap,
        'rx4hb4-11',
        { votes: [...VOTOS_ACTA], breakdownSource: fuenteActa },
        SIG,
      ),
    )
    const v = out.items.find((x) => x.id === 'rx4hb4-11')!
    expect(v.votes).toEqual(VOTOS_ACTA)
    expect(v.provenance!.breakdown!.url).toBe(ACTA_URL)
    expect(v.provenance!.outcome.kind).toBe('regmeet') // el resultado no se toca
    const c = latestCorrection(out, 'rx4hb4-11')!
    expect(c.originalVotes.find((b) => b.bloc === 'PP')!.direction).toBe('abstencion')
    expect(c.originalBreakdownSource!.kind).toBe('transcripcion')
    expect(c.editor).toBe('Sergei Lutchenko')
  })

  it('se niega a citar una fuente que no publica desglose', () => {
    const snap = buildSnapshot()
    const regmeet = {
      ...fuenteActa,
      kind: 'regmeet' as const,
      url: 'https://regmeet.com/aytoribarroja/participaciones/c5b270a763686e776039618cc709f3a6',
    }
    expect(() =>
      correctVoteBreakdown(
        snap,
        'rx4hb4-11',
        { votes: [...VOTOS_ACTA], breakdownSource: regmeet },
        SIG,
      ),
    ).toThrow(/desglose|breakdown/i)
  })

  it('se niega si el desglose no cambia (una corrección que no corrige nada)', () => {
    const snap = buildSnapshot()
    const actual = snap.items.find((x) => x.id === 'rx4hb4-11')!.votes
    expect(() =>
      correctVoteBreakdown(
        snap,
        'rx4hb4-11',
        { votes: [...actual], breakdownSource: fuenteActa },
        SIG,
      ),
    ).toThrow(/no cambia/)
  })

  it('se niega sin firma o con un motivo corto, y sobre un voto inexistente', () => {
    const snap = buildSnapshot()
    const input = { votes: [...VOTOS_ACTA], breakdownSource: fuenteActa }
    expect(() => correctVoteBreakdown(snap, 'rx4hb4-11', input, { ...SIG, editor: ' ' })).toThrow()
    expect(() =>
      correctVoteBreakdown(snap, 'rx4hb4-11', input, { ...SIG, reason: 'corto' }),
    ).toThrow()
    expect(() => correctVoteBreakdown(snap, 'nada-99', input, SIG)).toThrow()
  })

  it('se niega sobre un desglose retirado (primero hay que devolverlo con --unretract)', () => {
    const snap = buildSnapshotWithBreakdownRetracted('rx4hb4-11')
    expect(() =>
      correctVoteBreakdown(
        snap,
        'rx4hb4-11',
        { votes: [...VOTOS_ACTA], breakdownSource: fuenteActa },
        SIG,
      ),
    ).toThrow(/retirad/)
  })
})

describe('validateSnapshot — un desglose no cambia sin dejar rastro', () => {
  it('rechaza un desglose que difiere de su última corrección', () => {
    const snap = correctVoteBreakdown(
      buildSnapshot(),
      'rx4hb4-11',
      { votes: [...VOTOS_ACTA], breakdownSource: fuenteActa },
      SIG,
    )
    const v = snap.items.find((x) => x.id === 'rx4hb4-11')!
    v.votes = v.votes.map((b) => (b.bloc === 'VOX' ? { ...b, direction: 'en_contra' } : b))
    expect(() => validateSnapshot(snap)).toThrow(/corrección|correction/i)
  })
  it('acepta un snapshot sin `corrections` (los publicados antes de existir)', () => {
    const raw = JSON.parse(JSON.stringify(buildSnapshot()))
    delete raw.corrections
    expect(validateSnapshot(raw).corrections).toEqual([])
  })
  it('las correcciones son de solo añadir: dos sobre el mismo voto se aceptan en orden', () => {
    const una = correctVoteBreakdown(
      buildSnapshot(),
      'rx4hb4-11',
      { votes: [...VOTOS_ACTA], breakdownSource: fuenteActa },
      SIG,
    )
    const otraFuente = { ...fuenteActa, url: ACTA_URL.replace('_0.pdf', '_1.pdf') }
    const votos2 = VOTOS_ACTA.map((b) =>
      b.bloc === 'VOX' ? { ...b, direction: 'ausente' as const } : b,
    )
    const dos = correctVoteBreakdown(
      una,
      'rx4hb4-11',
      { votes: votos2, breakdownSource: otraFuente },
      { ...SIG, at: '2026-10-14T12:00:00.000Z' },
    )
    expect(validateSnapshot(dos).corrections).toHaveLength(2)
    expect(latestCorrection(dos, 'rx4hb4-11')!.correctedAt).toBe('2026-10-14T12:00:00.000Z')
  })
  it('rechaza correcciones del mismo voto fuera de orden', () => {
    const una = correctVoteBreakdown(
      buildSnapshot(),
      'rx4hb4-11',
      { votes: [...VOTOS_ACTA], breakdownSource: fuenteActa },
      SIG,
    )
    const otraFuente = { ...fuenteActa, url: ACTA_URL.replace('_0.pdf', '_1.pdf') }
    const votos2 = VOTOS_ACTA.map((b) =>
      b.bloc === 'VOX' ? { ...b, direction: 'ausente' as const } : b,
    )
    const dos = correctVoteBreakdown(
      una,
      'rx4hb4-11',
      { votes: votos2, breakdownSource: otraFuente },
      { ...SIG, at: '2026-10-12T12:00:00.000Z' },
    )
    expect(() => validateSnapshot(dos)).toThrow(/orden/)
  })
  it('una retirada del desglose posterior a una corrección sigue siendo posible', () => {
    // La corrección no puede bloquear la vía que debilita: el desglose
    // corregido se retira, y el libro de retiradas guarda el corregido.
    const corregido = validateSnapshot(
      correctVoteBreakdown(
        buildSnapshot(),
        'rx4hb4-11',
        { votes: [...VOTOS_ACTA], breakdownSource: fuenteActa },
        SIG,
      ),
    )
    const retirado = validateSnapshot(
      retractVoteBreakdown(corregido, 'rx4hb4-11', {
        reason: 'el desglose corregido se retira para revisarlo otra vez',
        editor: 'Test Curator',
        at: '2026-10-15T12:00:00.000Z',
      }),
    )
    expect(retirado.items.find((x) => x.id === 'rx4hb4-11')!.votes).toEqual([])
    expect(retirado.corrections).toHaveLength(1)
    const tumba = retirado.retractions.find((r) => r.voteId === 'rx4hb4-11')!
    expect(tumba.originalVotes).toEqual(VOTOS_ACTA)
  })
})

// ── Los CLIs, en un directorio temporal ─────────────────────────────────────

const RAIZ = resolve(__dirname, '..')
const TSX = join(RAIZ, 'node_modules/tsx/dist/cli.mjs')

/** Un directorio de trabajo con su propio public/data/pleno-votes.json. */
function montar(snapJson: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'corregir-voto-'))
  mkdirSync(join(dir, 'public/data'), { recursive: true })
  writeFileSync(join(dir, 'public/data/pleno-votes.json'), snapJson)
  return dir
}

function lanzar(script: string, dir: string, argv: string[]) {
  return spawnSync(process.execPath, [TSX, join(RAIZ, 'scripts', script), ...argv], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      TMPDIR: process.env.TMPDIR ?? tmpdir(),
    },
    timeout: 60_000,
  })
}

describe('pleno-vote no cambia un desglose publicado en silencio', () => {
  it('sale con 1 y remite a corregir-voto', () => {
    const original = JSON.stringify(buildSnapshot(), null, 2) + '\n'
    const dir = montar(original)
    try {
      const entrante = {
        ...rx4hb4Item11(),
        votes: [...VOTOS_ACTA],
        provenance: { ...rx4hb4Item11().provenance!, breakdown: fuenteActa },
      }
      writeFileSync(join(dir, 'voto.json'), JSON.stringify(entrante))
      const r = lanzar('apply-pleno-vote.ts', dir, ['--file', 'voto.json'])
      const salida = `${r.stdout}\n${r.stderr}`
      expect(r.status, salida).toBe(1)
      expect(r.stderr).toContain(
        '[pleno-vote] rx4hb4-11 ya está publicado con otro desglose. Cambiar un desglose publicado deja constancia: npm run corregir-voto -- rx4hb4-11',
      )
      expect(readFileSync(join(dir, 'public/data/pleno-votes.json'), 'utf8')).toBe(original)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('corregir-voto', () => {
  const VOTOS_ARG =
    'PSOE:a_favor:11,EU-Podem:a_favor:1,Compromís:a_favor:1,PP:en_contra:7,VOX:abstencion:1'
  const argv = (extra: string[] = []) => [
    'rx4hb4-11',
    '--votos',
    VOTOS_ARG,
    '--fuente',
    ACTA_URL,
    '--reason',
    SIG.reason,
    '--editor',
    SIG.editor,
    ...extra,
  ]

  it('--dry-run enseña el desglose viejo y el nuevo y no escribe', () => {
    const original = JSON.stringify(buildSnapshot(), null, 2) + '\n'
    const dir = montar(original)
    try {
      const r = lanzar('corregir-desglose-voto.ts', dir, argv(['--dry-run']))
      const salida = `${r.stdout}\n${r.stderr}`
      expect(r.status, salida).toBe(0)
      expect(r.stdout).toMatch(/PP\s+abstencion \(7\)\s+→\s+en_contra \(7\)/)
      expect(r.stdout).toMatch(/VOX\s+en_contra \(1\)\s+→\s+abstencion \(1\)/)
      expect(readFileSync(join(dir, 'public/data/pleno-votes.json'), 'utf8')).toBe(original)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('sin --dry-run escribe el desglose corregido y la corrección firmada', () => {
    const dir = montar(JSON.stringify(buildSnapshot(), null, 2) + '\n')
    try {
      const r = lanzar('corregir-desglose-voto.ts', dir, argv())
      expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0)
      const escrito = validateSnapshot(
        JSON.parse(readFileSync(join(dir, 'public/data/pleno-votes.json'), 'utf8')),
      )
      const v = escrito.items.find((x) => x.id === 'rx4hb4-11')!
      expect(v.votes).toEqual(VOTOS_ACTA)
      expect(v.provenance!.breakdown).toMatchObject({ kind: 'acta', url: ACTA_URL })
      expect(latestCorrection(escrito, 'rx4hb4-11')!.editor).toBe(SIG.editor)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('se niega a una fuente que no sabe clasificar', () => {
    const original = JSON.stringify(buildSnapshot(), null, 2) + '\n'
    const dir = montar(original)
    try {
      const a = argv()
      a[a.indexOf('--fuente') + 1] = 'https://example.org/acta.pdf'
      const r = lanzar('corregir-desglose-voto.ts', dir, a)
      expect(r.status).not.toBe(0)
      expect(r.stderr).toMatch(/fuente/)
      expect(readFileSync(join(dir, 'public/data/pleno-votes.json'), 'utf8')).toBe(original)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
