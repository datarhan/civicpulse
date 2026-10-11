/**
 * `subir-veredicto --backfill-sustituye`, como en la terminal: devuelve a una
 * subida ya escrita la entrada que sustituyó, leída del overlay en un commit.
 *
 * Cada prueba monta un repositorio git temporal con dos commits —el overlay con
 * la retractación del motor de rótulo corregido (como 6bee7650) y el overlay con
 * la subida que la pisó (como b30d27d7), con su publicado— y lanza la CLI con
 * ese directorio como raíz. Ninguna toca `public/data/` del repositorio.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mergeVerified, type OverlayEntry, type VerifiedItem } from '../src/scraper/verified-merge'

const RAIZ = resolve(__dirname, '..')
const TSX = join(RAIZ, 'node_modules/tsx/dist/cli.mjs')
const PLAZO = 60_000

const FX = JSON.parse(
  readFileSync(
    resolve(__dirname, 'fixtures/subida-sobre-rotulo-corregido_2026-10-06.json'),
    'utf8',
  ),
) as { claimId: string; motor: OverlayEntry; subida: OverlayEntry }
const ID = FX.claimId
const GENERADO = '2026-10-04T07:37:32.197Z'

const BASE = {
  generatedAt: GENERADO,
  source: { description: 'prueba' },
  items: [
    {
      claim: {
        id: ID,
        plenoId: 'c8kr44',
        plenoDate: '2025-10-30',
        segmentIndex: 229,
        type: 'cita_obra',
        speakerGroup: null,
        verbatim: 'cambio de juegos y suelo de protección en el Parque Bellavista',
        context: 'Contexto de prueba de la sesión.',
        topic: 'urbanismo',
        entities: {},
        confidence: 0.9,
        reasoning: 'Prueba.',
        requiresHumanApproval: true,
      },
      verification: {
        claimId: ID,
        verdict: 'parcial',
        summary: 'Un contrato del corpus nombra el parque.',
        evidence: [
          { kind: 'tender', ref: 'https://example.org/t', snippet: 'x', stance: 'checked' },
        ],
        checkedAgainst: ['tenders'],
      },
    },
  ],
}

const overlay = (e: OverlayEntry) => ({
  version: 1,
  generatedAt: e.appliedAt,
  entries: { [ID]: e },
})
const json = (x: unknown) => JSON.stringify(x, null, 2) + '\n'

const git = (dir: string, args: string[]) => {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

const escribir = (dir: string, ficheros: Record<string, string>) => {
  for (const [ruta, contenido] of Object.entries(ficheros)) {
    const destino = join(dir, ruta)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, contenido)
  }
}

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** El repositorio y el commit que aún tenía la retractación. */
function montar(): { dir: string; antes: string } {
  const dir = mkdtempSync(join(tmpdir(), 'recuperar-'))
  dirs.push(dir)
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'prueba@example.org'])
  git(dir, ['config', 'user.name', 'Prueba'])
  git(dir, ['config', 'commit.gpgsign', 'false'])
  git(dir, ['config', 'core.hooksPath', '/dev/null'])
  const publicado = (o: ReturnType<typeof overlay>) => ({
    generatedAt: GENERADO,
    source: BASE.source,
    items: mergeVerified(BASE.items as unknown as VerifiedItem[], o as never),
  })
  escribir(dir, {
    'public/data/pleno-claims-verified-base.json': json(BASE),
    'public/data/pleno-claims-overlay.json': json(overlay(FX.motor)),
    'public/data/pleno-claims-verified.json': json(publicado(overlay(FX.motor))),
    'public/data/promises.json': json({ frozenUntil: null, items: [] }),
  })
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-qm', 'motor'])
  const antes = git(dir, ['rev-parse', 'HEAD'])
  escribir(dir, {
    'public/data/pleno-claims-overlay.json': json(overlay(FX.subida)),
    'public/data/pleno-claims-verified.json': json(publicado(overlay(FX.subida))),
  })
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-qm', 'subida'])
  return { dir, antes }
}

const lanzar = (dir: string, argv: string[]) =>
  spawnSync(process.execPath, [TSX, join(RAIZ, 'scripts/subir-veredicto.ts'), ...argv], {
    cwd: dir,
    encoding: 'utf8',
  })

const leer = (dir: string, f: string) => readFileSync(join(dir, 'public/data', f), 'utf8')

describe('subir-veredicto --backfill-sustituye', () => {
  it(
    '--dry-run enseña lo que recuperaría y no escribe nada',
    () => {
      const { dir, antes } = montar()
      const overlayAntes = leer(dir, 'pleno-claims-overlay.json')
      const r = lanzar(dir, [
        '--backfill-sustituye',
        antes.slice(0, 8),
        ID,
        '--editor',
        'civicpulse-curator',
        '--dry-run',
      ])
      expect(r.stderr).toBe('')
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('"labelCorrections"')
      expect(r.stdout).toContain('ninguna declaración publicada cambia')
      expect(leer(dir, 'pleno-claims-overlay.json')).toBe(overlayAntes)
    },
    PLAZO,
  )

  it(
    'escribe `sustituye` con el commit entero, y lo publicado no cambia',
    () => {
      const { dir, antes } = montar()
      const publicadoAntes = leer(dir, 'pleno-claims-verified.json')
      const r = lanzar(dir, [
        '--backfill-sustituye',
        antes.slice(0, 8),
        ID,
        '--editor',
        'civicpulse-curator',
      ])
      expect(r.stderr).toBe('')
      expect(r.status).toBe(0)
      const e = JSON.parse(leer(dir, 'pleno-claims-overlay.json')).entries[ID]
      expect(e.sustituye).toMatchObject({
        source: 'verdict-engine',
        editor: 'verdict-engine:gpt-4o-mini',
        appliedAt: FX.motor.appliedAt,
        labelCorrections: FX.motor.labelCorrections,
        recuperada: { commit: antes, editor: 'civicpulse-curator' },
      })
      const { sustituye: _s, ...resto } = e
      expect(resto).toEqual(FX.subida)
      expect(leer(dir, 'pleno-claims-verified.json')).toBe(publicadoAntes)
    },
    PLAZO,
  )

  it(
    'se niega sin firma, con un commit que no tiene la entrada, o con lo de una subida',
    () => {
      const { dir, antes } = montar()
      const overlayAntes = leer(dir, 'pleno-claims-overlay.json')
      const sinFirma = lanzar(dir, ['--backfill-sustituye', antes, ID, '--editor', '<firma>'])
      expect(sinFirma.status).toBe(2)
      const conResumen = lanzar(dir, [
        '--backfill-sustituye',
        antes,
        ID,
        '--resumen',
        'x',
        '--editor',
        'civicpulse-curator',
      ])
      expect(conResumen.status).toBe(2)
      expect(conResumen.stderr).toMatch(/no sube nada/)
      const otra = lanzar(dir, [
        '--backfill-sustituye',
        antes,
        'c8kr44-999-cit-000000',
        '--editor',
        'civicpulse-curator',
      ])
      expect(otra.status).toBe(1)
      expect(otra.stderr).toMatch(/no tiene entrada/)
      // La subida, sobre sí misma: HEAD no tiene la retractación.
      const mismo = lanzar(dir, [
        '--backfill-sustituye',
        'HEAD',
        ID,
        '--editor',
        'civicpulse-curator',
      ])
      expect(mismo.status).toBe(1)
      expect(mismo.stderr).toMatch(/no es la que sustituyó|desde/)
      expect(leer(dir, 'pleno-claims-overlay.json')).toBe(overlayAntes)
    },
    PLAZO,
  )
})
