/**
 * `relabel-attribution`, como en la terminal: la vía firmada para escribir el
 * grupo de una declaración (docs/superpowers/specs/2026-10-04-atribucion-firmada-design.md).
 *
 * Cada prueba monta en un directorio temporal un corpus de dos declaraciones
 * —la que se firma y una vecina que no debe moverse—, con su base, su
 * publicado, la transcripción de la sesión, la composición de la corporación y
 * la suspensión electoral; lanza la CLI con ese directorio como raíz y mira lo
 * que escribe. Ninguna toca `public/data/` del repositorio.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = resolve(__dirname, '..')
const TSX = join(RAIZ, 'node_modules/tsx/dist/cli.mjs')
/** Una recomposición entera por subproceso: más que los 5 s de vitest en la CI. */
const PLAZO = 60_000

const lanzar = (script: string, cwd: string, argv: string[]) =>
  spawnSync(process.execPath, [TSX, join(RAIZ, 'scripts', script), ...argv], {
    cwd,
    encoding: 'utf8',
  })

const GENERADO = '2026-10-04T07:37:32.197Z'
const LITERAL = 'trabajamos no para un conservatorio para dos conservatorios y lo hicimos'
const FIRMADA = 'p1-039-cit-aaaaaa'
const VECINA = 'p1-050-cit-bbbbbb'
const VECINO_LITERAL = 'la piscina cubierta no se puede usar para competiciones oficiales'

const TRANSCRIPCION = [
  '[4010.0 → 4015.9] (SPEAKER_03) Gracias. Tiene la palabra el portavoz del grupo popular.',
  '[4016.2 → 4060.0] (SPEAKER_07) Nosotros pedimos el segundo conservatorio hace años y no se hizo.',
  `[4061.0 → 4064.5] (SPEAKER_01) ${LITERAL}`,
  '[4064.6 → 4095.0] (SPEAKER_01) con el presupuesto de este ayuntamiento.',
  `[5000.0 → 5010.0] (SPEAKER_02) ${VECINO_LITERAL}`,
].join('\n')

const declaracion = (id: string, verbatim: string, speakerGroup: string | null) => ({
  claim: {
    id,
    plenoId: 'p1',
    plenoDate: '2025-12-01',
    segmentIndex: Number(id.split('-')[1]),
    type: 'cita_obra',
    speakerGroup,
    verbatim,
    context: 'Contexto de prueba de la sesión.',
    topic: 'educacion',
    entities: {},
    confidence: 0.9,
    reasoning: 'Prueba.',
    requiresHumanApproval: true,
  },
  verification: {
    claimId: id,
    verdict: 'sin-datos',
    confidence: 0.5,
    summary: 'Un «sin datos» no es un desmentido: la afirmación puede ser cierta.',
    evidence: [],
    checkedAgainst: [],
  },
})

const corpus = (generatedAt = GENERADO) =>
  JSON.stringify(
    {
      generatedAt,
      source: { description: 'prueba' },
      items: [declaracion(FIRMADA, LITERAL, null), declaracion(VECINA, VECINO_LITERAL, 'PP')],
    },
    null,
    2,
  ) + '\n'

const MOTIVO =
  'La intervención es del grupo de gobierno: responde al portavoz popular, a quien la presidencia acaba de dar la palabra.'
const PERSONA = 'María de la Fuente Llorens'

function montar(
  opciones: {
    frozenUntil?: string | null
    publicadoGeneradoEn?: string
    /** Lo publicado, si no es la composición de la base. */
    publicado?: string
  } = {},
): string {
  const dir = mkdtempSync(join(tmpdir(), 'relabel-'))
  const ficheros: Record<string, string> = {
    'pleno-claims-verified-base.json': corpus(),
    'pleno-claims-verified.json':
      opciones.publicado ?? corpus(opciones.publicadoGeneradoEn ?? GENERADO),
    'pleno-transcripts/p1.txt': TRANSCRIPCION + '\n',
    'officials.json': JSON.stringify({
      composition: { PSOE: 11, PP: 7, VOX: 1, 'EU-Podem': 1, Compromís: 1 },
      officials: [],
    }),
    'promises.json': JSON.stringify({ frozenUntil: opciones.frozenUntil ?? null, items: [] }),
  }
  for (const [ruta, contenido] of Object.entries(ficheros)) {
    const destino = join(dir, 'public/data', ruta)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, contenido)
  }
  return dir
}

/**
 * `retract-claim-attribution` lee `public/data/` desde la carpeta de su script,
 * no desde el directorio de trabajo: lanzado desde `scripts/` del repositorio
 * leería los datos de verdad. Se lanza una copia desde la raíz temporal; `src/`
 * se enlaza y `package.json` se copia por su `"type": "module"`.
 */
function conScript(dir: string, script: string): string {
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  copyFileSync(join(RAIZ, 'scripts', script), join(dir, 'scripts', script))
  symlinkSync(join(RAIZ, 'src'), join(dir, 'src'), 'dir')
  copyFileSync(join(RAIZ, 'package.json'), join(dir, 'package.json'))
  return join(dir, 'scripts', script)
}

/** Borra el directorio temporal; antes, el enlace a `src/`, si lo hay. */
function limpiar(dir: string): void {
  try {
    if (lstatSync(join(dir, 'src')).isSymbolicLink()) unlinkSync(join(dir, 'src'))
  } catch {
    // No había enlace.
  }
  rmSync(dir, { recursive: true, force: true })
}

/** Cada fichero bajo `public/data/`, con la huella de sus bytes. */
function huella(dir: string): Record<string, string> {
  const raiz = join(dir, 'public/data')
  const out: Record<string, string> = {}
  const recorrer = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) recorrer(p)
      else out[relative(raiz, p)] = createHash('sha256').update(readFileSync(p)).digest('hex')
    }
  }
  recorrer(raiz)
  return out
}

const leer = (dir: string, fichero: string) =>
  JSON.parse(readFileSync(join(dir, 'public/data', fichero), 'utf8'))

const delMonolito = (dir: string, id: string) =>
  leer(dir, 'pleno-claims-verified.json').items.find(
    (it: { claim: { id: string } }) => it.claim.id === id,
  ).claim

const firmar = (dir: string, extra: string[] = [], editor = PERSONA) =>
  lanzar('relabel-attribution.ts', dir, [
    FIRMADA,
    '--grupo',
    'PSOE',
    '--segundos',
    '4016-4095',
    '--motivo',
    MOTIVO,
    '--editor',
    editor,
    ...extra,
  ])

describe('relabel-attribution', { timeout: PLAZO }, () => {
  it.each(['<nombre y apellidos>', 'Nombre Apellido', 'civicpulse-curator', 'claude-opus-5'])(
    'firmada «%s», se niega antes de leer nada',
    (editor) => {
      // Una raíz sin datos: si llegara a leer, fallaría por otra cosa.
      const dir = mkdtempSync(join(tmpdir(), 'relabel-vacio-'))
      try {
        const r = firmar(dir, [], editor)
        expect(r.status, r.stdout + r.stderr).toBe(2)
        expect(r.stderr).toContain('--editor')
      } finally {
        limpiar(dir)
      }
    },
  )

  it('firma: el sidecar lleva la entrada y lo publicado, el grupo con su marca; la vecina no se mueve', () => {
    const dir = montar()
    try {
      const vecinaAntes = delMonolito(dir, VECINA)
      const r = firmar(dir)
      expect(r.status, r.stdout + r.stderr).toBe(0)

      const entrada = leer(dir, 'pleno-claim-relabels.json').entries[FIRMADA]
      expect(entrada).toMatchObject({
        speakerGroup: 'PSOE',
        from: null,
        segundos: { desde: 4016, hasta: 4095 },
        fuente: 'current',
        reason: MOTIVO,
        editor: PERSONA,
      })
      expect(entrada.literal).toMatch(/^literal firmado · sha256:[0-9a-f]{12}$/)

      const firmada = delMonolito(dir, FIRMADA)
      expect(firmada.speakerGroup).toBe('PSOE')
      expect(firmada.atribucionFirmada).toEqual({ desde: 4016, hasta: 4095 })
      expect(delMonolito(dir, VECINA)).toEqual(vecinaAntes)

      // Y llega a lo que sirve el sitio.
      const servida = leer(dir, 'pleno-claims/p1.json').items.find(
        (it: { claim: { id: string } }) => it.claim.id === FIRMADA,
      )
      expect(servida.claim.speakerGroup).toBe('PSOE')
      expect(servida.claim.atribucionFirmada).toEqual({ desde: 4016, hasta: 4095 })
    } finally {
      limpiar(dir)
    }
  })

  it('--dry-run enseña la entrada y no escribe nada', () => {
    const dir = montar()
    try {
      const antes = huella(dir)
      const r = firmar(dir, ['--dry-run'])
      expect(r.status, r.stdout + r.stderr).toBe(0)
      expect(r.stdout).toContain('PSOE')
      expect(r.stdout).toContain('4016')
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('un grupo de un escaño se niega y no toca nada', () => {
    const dir = montar()
    try {
      const antes = huella(dir)
      const r = lanzar('relabel-attribution.ts', dir, [
        FIRMADA,
        '--grupo',
        'VOX',
        '--segundos',
        '4016-4095',
        '--motivo',
        MOTIVO,
        '--editor',
        PERSONA,
      ])
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toMatch(/un solo escaño/)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('unos segundos que no contienen la declaración se niegan y no tocan nada', () => {
    const dir = montar()
    try {
      const antes = huella(dir)
      const r = lanzar('relabel-attribution.ts', dir, [
        FIRMADA,
        '--grupo',
        'PSOE',
        '--segundos',
        '4990-5010',
        '--motivo',
        MOTIVO,
        '--editor',
        PERSONA,
      ])
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toMatch(/tramo|segundos/)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('si lo publicado no es la composición de la base en disco, no firma', () => {
    const dir = montar({ publicadoGeneradoEn: '2026-09-01T00:00:00.000Z' })
    try {
      const antes = huella(dir)
      const r = firmar(dir)
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toMatch(/compos/)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('si recomponer moviera otra declaración, no firma: republicaría lo que nadie miró', () => {
    // Mismo sello que la base —el cotejo dice «coincide»—, pero lo publicado
    // lleva a la vecina con otro grupo: recomponer la devolvería al de la base.
    const publicado = JSON.parse(corpus())
    publicado.items[1].claim.speakerGroup = 'PSOE'
    const dir = montar({ publicado: JSON.stringify(publicado, null, 2) + '\n' })
    try {
      const antes = huella(dir)
      const r = firmar(dir)
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toContain(VECINA)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('con la suspensión electoral activa no firma, y retirar una firma sí se puede', () => {
    const dir = montar()
    try {
      expect(firmar(dir).status).toBe(0)
      writeFileSync(
        join(dir, 'public/data/promises.json'),
        JSON.stringify({ frozenUntil: '2999-01-01', items: [] }),
      )
      const antes = huella(dir)
      const otra = lanzar('relabel-attribution.ts', dir, [
        VECINA,
        '--grupo',
        'PSOE',
        '--segundos',
        '4995-5010',
        '--motivo',
        MOTIVO,
        '--editor',
        PERSONA,
      ])
      expect(otra.status, otra.stdout + otra.stderr).toBe(1)
      expect(otra.stderr).toMatch(/LOREG|suspensión/)
      expect(huella(dir)).toEqual(antes)

      const r = lanzar('relabel-attribution.ts', dir, [
        '--retirar',
        FIRMADA,
        '--motivo',
        'El segundo firmado era el de otra intervención del mismo punto.',
        '--editor',
        PERSONA,
      ])
      expect(r.status, r.stdout + r.stderr).toBe(0)
    } finally {
      limpiar(dir)
    }
  })

  it('--retirar quita la entrada y la declaración vuelve a salir sin grupo', () => {
    const dir = montar()
    try {
      expect(firmar(dir).status).toBe(0)
      const r = lanzar('relabel-attribution.ts', dir, [
        '--retirar',
        FIRMADA,
        '--motivo',
        'El segundo firmado era el de otra intervención del mismo punto.',
        '--editor',
        PERSONA,
      ])
      expect(r.status, r.stdout + r.stderr).toBe(0)
      expect(leer(dir, 'pleno-claim-relabels.json').entries[FIRMADA]).toBeUndefined()
      const claim = delMonolito(dir, FIRMADA)
      expect(claim.speakerGroup).toBeNull()
      expect(claim.atribucionFirmada).toBeUndefined()
    } finally {
      limpiar(dir)
    }
  })

  it('retract-attribution no retira a escondidas una firmada: se niega y remite a --retirar', () => {
    const dir = montar()
    try {
      expect(firmar(dir).status).toBe(0)
      const antes = huella(dir)
      const r = spawnSync(
        process.execPath,
        [
          TSX,
          conScript(dir, 'retract-claim-attribution.ts'),
          '--claim',
          FIRMADA,
          '--motivo',
          'Retirada de prueba sobre una declaración con atribución firmada.',
        ],
        { cwd: dir, encoding: 'utf8' },
      )
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toContain('relabel-attribution')
      expect(r.stderr).toContain('--retirar')
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })
})
