/**
 * `downgrade-verdict --amend-reason`: enmendar el motivo de una bajada de
 * curador por su escritor sancionado, sin mover el veredicto.
 *
 * La CLI sólo sabía bajar, y una bajada al mismo veredicto es una subida
 * lateral que `isDowngrade` rechaza: con ella no había forma de sustituir el
 * motivo inglés de las 40 bajadas del 24-06-2026. La vía nueva escribe la
 * enmienda en la entrada (tests/scraper/verified-merge-enmienda.test.ts); aquí
 * se prueba la orden que la pide y lo que la CLI hace con ella.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Import dinámico: si la guarda de `main()` fallara, importar el script
// ejecutaría la CLI dentro del proceso de pruebas, y es mejor que falle este
// bloque solo que el fichero entero.
const cargar = () => import('../scripts/downgrade-verdict')

const ID = '19gax3o-019-afi-0a4414'
const MOTIVO_EN =
  'Gold review (ai): false contradicho: garbled conditional; the cited contracts are unrelated to the claim'
const MOTIVO_ES =
  'Se retiró el «Contradicho» que figuraba antes: la frase es un condicional mal transcrito, y los contratos que se citaban no tratan de lo que dice.'
const PORQUE =
  'El motivo se publicó en inglés y con jerga de revisión; se reescribe en castellano sin cambiar lo que afirma ni el veredicto.'
const FIRMA = 'María de la Fuente Llorens'
const RAZON = 'la evidencia citada no contradice la afirmación, sólo comparte una palabra'

describe('downgrade-verdict · leerOrden', () => {
  it('la bajada de siempre no cambia: --reason es el motivo, y sin --editor firma «curator»', async () => {
    const { leerOrden } = await cargar()
    expect(leerOrden([ID, 'sin-datos', '--reason', RAZON, '--editor', 'Sergei Lutchenko'])).toEqual(
      {
        modo: 'bajar',
        claimId: ID,
        veredicto: 'sin-datos',
        motivo: RAZON,
        editor: 'Sergei Lutchenko',
        dryRun: false,
      },
    )
    expect(leerOrden([ID, 'parcial', '--reason', RAZON]).editor).toBe('curator')
  })

  it('--amend-reason: el veredicto es el que se queda, --new el motivo nuevo y --reason el porqué', async () => {
    const { leerOrden } = await cargar()
    expect(
      leerOrden([
        ID,
        'sin-datos',
        '--amend-reason',
        '--new',
        MOTIVO_ES,
        '--reason',
        PORQUE,
        '--editor',
        FIRMA,
        '--dry-run',
      ]),
    ).toEqual({
      modo: 'enmendar',
      claimId: ID,
      veredicto: 'sin-datos',
      motivo: MOTIVO_ES,
      porque: PORQUE,
      editor: FIRMA,
      dryRun: true,
    })
  })

  it('--dry-run vale también para la bajada de siempre', async () => {
    const { leerOrden } = await cargar()
    expect(leerOrden(['--dry-run', ID, 'sin-datos', '--reason', RAZON]).dryRun).toBe(true)
  })

  it.each<[string, string[], RegExp]>([
    [
      'sin --new',
      [ID, 'sin-datos', '--amend-reason', '--reason', PORQUE, '--editor', FIRMA],
      /--new/,
    ],
    [
      'sin --reason',
      [ID, 'sin-datos', '--amend-reason', '--new', MOTIVO_ES, '--editor', FIRMA],
      /--reason/,
    ],
    [
      'sin firma: la de la CLI por defecto es una cuenta, no una persona',
      [ID, 'sin-datos', '--amend-reason', '--new', MOTIVO_ES, '--reason', PORQUE],
      /persona/,
    ],
    [
      'con el marcador de la orden preparada',
      [
        ID,
        'sin-datos',
        '--amend-reason',
        '--new',
        MOTIVO_ES,
        '--reason',
        PORQUE,
        '--editor',
        '<nombre y apellidos>',
      ],
      /marcador/,
    ],
    [
      'sin veredicto',
      [ID, '--amend-reason', '--new', MOTIVO_ES, '--reason', PORQUE, '--editor', FIRMA],
      /usage/,
    ],
    [
      'con un veredicto que ninguna bajada deja',
      [
        ID,
        'contradicho',
        '--amend-reason',
        '--new',
        MOTIVO_ES,
        '--reason',
        PORQUE,
        '--editor',
        FIRMA,
      ],
      /contradicho/,
    ],
    [
      // Sin `--amend-reason`, `--reason` se leería como el motivo de otra bajada
      // y `--new` se perdería: una orden mal copiada bajaría un veredicto.
      '--new sin --amend-reason',
      [ID, 'sin-datos', '--new', MOTIVO_ES, '--reason', PORQUE, '--editor', FIRMA],
      /--amend-reason/,
    ],
  ])('una enmienda no pasa %s', async (_, argv, error) => {
    const { leerOrden } = await cargar()
    expect(() => leerOrden(argv)).toThrow(error)
  })
})

describe('downgrade-verdict · ejecutado', () => {
  const TSX = resolve(__dirname, '../node_modules/tsx/dist/cli.mjs')
  const SCRIPT = resolve(__dirname, '../scripts/downgrade-verdict.ts')
  const lanzar = (cwd: string, argv: string[]) =>
    spawnSync(process.execPath, [TSX, SCRIPT, ...argv], { cwd, encoding: 'utf8' })

  it('con el marcador de la orden preparada se niega antes de leer nada', () => {
    // Un directorio sin datos: si la CLI llegara a leer, fallaría por otra cosa.
    const dir = mkdtempSync(join(tmpdir(), 'downgrade-firma-'))
    try {
      const r = lanzar(dir, [
        ID,
        'sin-datos',
        '--amend-reason',
        '--new',
        MOTIVO_ES,
        '--reason',
        PORQUE,
        '--editor',
        '<nombre y apellidos>',
      ])
      expect(r.stderr).toMatch(/marcador/)
      expect(r.status).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--dry-run valida la enmienda contra el overlay, la enseña y no escribe nada', () => {
    const dir = mkdtempSync(join(tmpdir(), 'downgrade-dry-'))
    try {
      const data = join(dir, 'public/data')
      mkdirSync(data, { recursive: true })
      const verification = {
        claimId: ID,
        verdict: 'sin-datos',
        summary: MOTIVO_EN,
        evidence: [],
        checkedAgainst: ['curator-downgrade'],
      }
      const overlay =
        JSON.stringify(
          {
            version: 1,
            generatedAt: '2026-09-21T05:53:59.613Z',
            entries: {
              [ID]: {
                verification,
                source: 'curator-downgrade',
                reason: MOTIVO_EN,
                editor: 'ai-gold-review',
                appliedAt: '2026-06-24T07:41:17.000Z',
              },
            },
          },
          null,
          2,
        ) + '\n'
      const verified =
        JSON.stringify(
          {
            generatedAt: '2026-09-28T07:54:32.262Z',
            items: [
              { claim: { id: ID }, verification: { ...verification, source: 'curator-downgrade' } },
            ],
          },
          null,
          2,
        ) + '\n'
      writeFileSync(join(data, 'pleno-claims-overlay.json'), overlay)
      writeFileSync(join(data, 'pleno-claims-verified.json'), verified)

      const r = lanzar(dir, [
        ID,
        'sin-datos',
        '--amend-reason',
        '--new',
        MOTIVO_ES,
        '--reason',
        PORQUE,
        '--editor',
        FIRMA,
        '--dry-run',
      ])
      expect(r.status, r.stderr).toBe(0)
      // La entrada que escribiría: el motivo nuevo y la huella del anterior.
      expect(r.stdout).toContain(MOTIVO_ES)
      expect(r.stdout).toContain('motivo · sha256:fc34a953749a')
      expect(r.stdout).toContain('--dry-run')
      // Y nada escrito.
      expect(readFileSync(join(data, 'pleno-claims-overlay.json'), 'utf8')).toBe(overlay)
      expect(readFileSync(join(data, 'pleno-claims-verified.json'), 'utf8')).toBe(verified)
      expect(existsSync(join(data, 'pleno-claims'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
