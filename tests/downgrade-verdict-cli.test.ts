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

import { rechazoDeMarcador } from '../src/scraper/firma-de-persona'

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

/**
 * `--literal-no-dicho`: retirar una declaración cuyo literal, escuchada la
 * sesión, no es lo que se dijo. La entrada que escribe se prueba en
 * tests/scraper/declaracion-retirada.test.ts; aquí, la orden y lo que la CLI
 * comprueba antes de escribir.
 */
const LITERAL =
  'el pabellón se presupuestó en el año 2006 y tuvieron que repararlo dentro de la obra'
const MOTIVO_RETIRADA =
  'Escuchada la sesión, donde el literal pone un año se oyen importes (audio y transcripción vigente, 6.475–6.486 s): no es lo que se dijo.'

describe('downgrade-verdict · leerOrden · --literal-no-dicho', () => {
  it('la retirada deja la declaración en sin-datos y la firma una persona', async () => {
    const { leerOrden } = await cargar()
    expect(
      leerOrden([
        ID,
        'sin-datos',
        '--literal-no-dicho',
        '--reason',
        MOTIVO_RETIRADA,
        '--editor',
        FIRMA,
        '--dry-run',
      ]),
    ).toEqual({
      modo: 'retirar',
      claimId: ID,
      veredicto: 'sin-datos',
      motivo: MOTIVO_RETIRADA,
      editor: FIRMA,
      dryRun: true,
    })
  })

  it.each<[string, string[], RegExp]>([
    [
      'sin firma: la de la CLI por defecto es una cuenta, no una persona',
      [ID, 'sin-datos', '--literal-no-dicho', '--reason', MOTIVO_RETIRADA],
      /persona/,
    ],
    [
      'a otro veredicto que sin-datos',
      [ID, 'parcial', '--literal-no-dicho', '--reason', MOTIVO_RETIRADA, '--editor', FIRMA],
      /sin-datos/,
    ],
    ['sin motivo', [ID, 'sin-datos', '--literal-no-dicho', '--editor', FIRMA], /--reason/],
    [
      'junto a --amend-reason: son dos órdenes distintas',
      [
        ID,
        'sin-datos',
        '--literal-no-dicho',
        '--amend-reason',
        '--new',
        MOTIVO_ES,
        '--reason',
        PORQUE,
        '--editor',
        FIRMA,
      ],
      /--amend-reason/,
    ],
    [
      'con un --new que se perdería',
      [
        ID,
        'sin-datos',
        '--literal-no-dicho',
        '--new',
        MOTIVO_ES,
        '--reason',
        MOTIVO_RETIRADA,
        '--editor',
        FIRMA,
      ],
      /--new/,
    ],
  ])('una retirada no pasa %s', async (_, argv, error) => {
    const { leerOrden } = await cargar()
    expect(() => leerOrden(argv)).toThrow(error)
  })
})

describe('downgrade-verdict · ejecutado · --literal-no-dicho', () => {
  const TSX = resolve(__dirname, '../node_modules/tsx/dist/cli.mjs')
  const SCRIPT = resolve(__dirname, '../scripts/downgrade-verdict.ts')
  const lanzar = (cwd: string, argv: string[]) =>
    spawnSync(process.execPath, [TSX, SCRIPT, ...argv], { cwd, encoding: 'utf8' })
  const ORDEN = [
    ID,
    'sin-datos',
    '--literal-no-dicho',
    '--reason',
    MOTIVO_RETIRADA,
    '--editor',
    FIRMA,
    '--dry-run',
  ]

  /** Un directorio con lo mínimo que la CLI lee; `hallazgos` null = el fichero no está. */
  function montar(hallazgos: unknown | null): { dir: string; data: string; ficheros: string[] } {
    const dir = mkdtempSync(join(tmpdir(), 'downgrade-retirada-'))
    const data = join(dir, 'public/data')
    mkdirSync(data, { recursive: true })
    const verification = {
      claimId: ID,
      verdict: 'parcial',
      summary: MOTIVO_EN,
      evidence: [{ kind: 'tender', ref: 'https://example.org/x', snippet: 'contrato' }],
      checkedAgainst: ['curator-downgrade'],
    }
    writeFileSync(
      join(data, 'pleno-claims-overlay.json'),
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
              appliedAt: '2026-06-24T07:18:12.464Z',
            },
          },
        },
        null,
        2,
      ) + '\n',
    )
    writeFileSync(
      join(data, 'pleno-claims-verified.json'),
      JSON.stringify(
        {
          generatedAt: '2026-09-28T07:54:32.262Z',
          items: [
            {
              claim: { id: ID, plenoId: '19gax3o', type: 'cita_obra', verbatim: LITERAL },
              verification: { ...verification, source: 'curator-downgrade' },
            },
          ],
        },
        null,
        2,
      ) + '\n',
    )
    const ficheros = ['pleno-claims-overlay.json', 'pleno-claims-verified.json']
    if (hallazgos !== null) {
      writeFileSync(join(data, 'pleno-findings.json'), JSON.stringify(hallazgos, null, 2) + '\n')
      ficheros.push('pleno-findings.json')
    }
    return { dir, data, ficheros }
  }

  const leer = (data: string, ficheros: string[]) =>
    ficheros.map((f) => readFileSync(join(data, f), 'utf8'))

  it('--dry-run enseña la entrada con la huella del literal y no escribe nada', () => {
    const { dir, data, ficheros } = montar({ items: [] })
    try {
      const antes = leer(data, ficheros)
      const r = lanzar(dir, ORDEN)
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout).toContain('literal retirado · sha256:976b23082562')
      expect(r.stdout).toContain('"verdict": "sin-datos"')
      expect(r.stdout).toContain('--dry-run')
      // El literal no sale ni en la entrada que se escribiría.
      expect(r.stdout).not.toContain('presupuestó en el año')
      expect(leer(data, ficheros)).toEqual(antes)
      expect(existsSync(join(data, 'pleno-claims'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('se niega mientras un hallazgo la cite, y dice qué cita retirar antes', () => {
    // La ficha preguntaría a la puerta por esa cita y pintaría «literal
    // retenido — acusación no contrastada» sobre una cita que no acusa a nadie.
    const { dir, data, ficheros } = montar({
      items: [
        {
          id: 'f-2026-01-19-cit-000000',
          quotes: [
            { text: 'otra cita', sourceClaimId: '19gax3o-051-cit-c80e68' },
            { text: LITERAL, sourceClaimId: ID },
          ],
        },
      ],
    })
    try {
      const antes = leer(data, ficheros)
      const r = lanzar(dir, ORDEN)
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('f-2026-01-19-cit-000000')
      expect(r.stderr).toContain('quote.1')
      expect(r.stderr).toContain('correct-pleno-finding')
      // La orden que imprime lleva la firma por rellenar, y copiada tal cual
      // `correct-pleno-finding` la rechaza (`rechazoDeMarcador`).
      const firma = r.stderr.match(/--editor "([^"]*)"/)?.[1]
      expect(firma).toBeDefined()
      expect(rechazoDeMarcador(firma!)).not.toBeNull()
      expect(leer(data, ficheros)).toEqual(antes)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('sin pleno-findings.json no se sabe si un hallazgo la cita: se niega', () => {
    const { dir, data, ficheros } = montar(null)
    try {
      const antes = leer(data, ficheros)
      const r = lanzar(dir, ORDEN)
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('pleno-findings.json')
      expect(leer(data, ficheros)).toEqual(antes)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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
