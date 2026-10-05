/**
 * `subir-veredicto`, como en la terminal: la vía firmada para subir el veredicto
 * de una declaración (docs/superpowers/specs/2026-10-04-subida-firmada-design.md).
 *
 * Cada prueba monta en un directorio temporal un corpus de tres declaraciones
 * —la que se sube, una vecina que no debe moverse y una acusación—, con su
 * base, su overlay (la retractación del motor que hoy publican las ocho de la
 * lectura del 04-10-2026), su publicado, la transcripción de la sesión, los
 * registros de verdad de contratos y de la BDNS, y la suspensión electoral;
 * lanza la CLI con ese directorio como raíz y mira lo que escribe. Ninguna toca
 * `public/data/` del repositorio.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mergeVerified, type VerifiedItem } from '../src/scraper/verified-merge'

const RAIZ = resolve(__dirname, '..')
const TSX = join(RAIZ, 'node_modules/tsx/dist/cli.mjs')
/** Una recomposición entera por subproceso: más que los 5 s de vitest en la CI. */
const PLAZO = 60_000

const lanzar = (script: string, cwd: string, argv: string[]) =>
  spawnSync(process.execPath, [TSX, join(RAIZ, 'scripts', script), ...argv], {
    cwd,
    encoding: 'utf8',
  })

const REGISTROS = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/subida-firmada-registros_2026-10-04.json'), 'utf8'),
)
const JUEGOS =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=Dsw60vrWRmm5HQrHoP3G5A%3D%3D'
const LOTES =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=oE58TiRVCfAZDGvgaZEVxQ%3D%3D'

const GENERADO = '2026-10-04T07:37:32.197Z'
const SUBIDA = 'p1-034-cit-aaaaaa'
const VECINA = 'p1-050-cit-bbbbbb'
const ACUSACION = 'p1-126-acu-cccccc'
const LITERAL = 'renovación de juegos en el parque junto a la Asunción de Nuestra Señora'
const VECINO_LITERAL = 'la piscina cubierta no se puede usar para competiciones oficiales'
const ACUSA_LITERAL = 'que eran problemas en el agua y desde entonces no se ha subsanado'

const RESUMEN =
  'La renovación de los juegos del parque de la Asunción de Nuestra Señora se contrató: suministro e instalación adjudicados el 8-09-2026 por 40.727,10 € (contrato 36/2026).'
const MOTIVO_DEL_MOTOR =
  'verdict-engine (claude-code) re-judged parcial→sin-datos: ningún candidato respalda la afirmación con lo que muestra el extracto.'
const RETIRADA = 'El parque del contrato no es el que se cita en la sesión, sino otro del casco.'
const PERSONA = 'María de la Fuente Llorens'

const declaracion = (id: string, verbatim: string, type = 'cita_obra') => ({
  claim: {
    id,
    plenoId: 'p1',
    plenoDate: '2026-01-19',
    segmentIndex: Number(id.split('-')[1]),
    type,
    ...(type === 'acusacion_publica' ? { accusationSubtype: 'factual' } : {}),
    speakerGroup: null,
    verbatim,
    context: 'Contexto de prueba de la sesión.',
    topic: 'urbanismo',
    entities: {},
    confidence: 0.9,
    reasoning: 'Prueba.',
    requiresHumanApproval: true,
  },
  verification: {
    claimId: id,
    verdict: 'sin-datos',
    summary: 'Un «sin datos» no es un desmentido: la afirmación puede ser cierta.',
    evidence: [],
    checkedAgainst: ['tenders', 'bdns'],
  },
})

const BASE = {
  generatedAt: GENERADO,
  source: { description: 'prueba' },
  items: [
    declaracion(SUBIDA, LITERAL),
    declaracion(VECINA, VECINO_LITERAL),
    declaracion(ACUSACION, ACUSA_LITERAL, 'acusacion_publica'),
  ],
}

const retractacion = (id: string) => ({
  verification: {
    claimId: id,
    verdict: 'sin-datos',
    summary: MOTIVO_DEL_MOTOR,
    evidence: [],
    checkedAgainst: ['verdict-engine'],
  },
  source: 'verdict-engine',
  reason: MOTIVO_DEL_MOTOR,
  editor: 'verdict-engine:claude-code',
  appliedAt: '2026-08-02T00:00:00.000Z',
})

const OVERLAY = {
  version: 1,
  generatedAt: '2026-08-02T00:00:00.000Z',
  entries: { [SUBIDA]: retractacion(SUBIDA) },
}

/** Lo publicado: la composición de la base y el overlay, con el sello de la base. */
const publicado = (generatedAt = GENERADO) => ({
  generatedAt,
  source: BASE.source,
  items: mergeVerified(BASE.items as unknown as VerifiedItem[], OVERLAY as never),
})

const json = (x: unknown) => JSON.stringify(x, null, 2) + '\n'

function montar(
  opciones: {
    frozenUntil?: string | null
    publicado?: unknown
    /** La transcripción de la sesión; por defecto, con las tres declaraciones. */
    transcripcion?: string
    colaNli?: unknown
  } = {},
): string {
  const dir = mkdtempSync(join(tmpdir(), 'subir-'))
  const ficheros: Record<string, string> = {
    'public/data/pleno-claims-verified-base.json': json(BASE),
    'public/data/pleno-claims-overlay.json': json(OVERLAY),
    'public/data/pleno-claims-verified.json': json(opciones.publicado ?? publicado()),
    'public/data/pleno-transcripts/p1.txt':
      opciones.transcripcion ??
      [
        `[10.0 → 14.0] (SPEAKER_01) ${LITERAL} es una de las obras de este año.`,
        `[20.0 → 24.0] (SPEAKER_02) ${VECINO_LITERAL}.`,
        `[30.0 → 34.0] (SPEAKER_03) ${ACUSA_LITERAL}.`,
      ].join('\n') + '\n',
    'public/data/tenders.json': json(REGISTROS.tenders),
    'public/data/bdns.json': json(REGISTROS.bdns),
    'public/data/promises.json': json({ frozenUntil: opciones.frozenUntil ?? null, items: [] }),
    'resumen.txt': RESUMEN + '\n',
    'retirada.txt': RETIRADA + '\n',
  }
  if (opciones.colaNli) {
    ficheros['editorial/pleno-claims-sugerencias-nli.json'] = json(opciones.colaNli)
  }
  for (const [ruta, contenido] of Object.entries(ficheros)) {
    const destino = join(dir, ruta)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, contenido)
  }
  return dir
}

const limpiar = (dir: string) => rmSync(dir, { recursive: true, force: true })

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
  )

const subir = (
  dir: string,
  extra: string[] = [],
  opciones: { id?: string; editor?: string } = {},
) =>
  lanzar('subir-veredicto.ts', dir, [
    opciones.id ?? SUBIDA,
    'parcial',
    '--evidencia',
    JUEGOS,
    '--resumen-de',
    join(dir, 'resumen.txt'),
    '--editor',
    opciones.editor ?? PERSONA,
    ...extra,
  ])

const retirar = (dir: string, extra: string[] = []) =>
  lanzar('subir-veredicto.ts', dir, [
    '--retirar',
    SUBIDA,
    '--motivo-de',
    join(dir, 'retirada.txt'),
    '--editor',
    PERSONA,
    ...extra,
  ])

describe('subir-veredicto', { timeout: PLAZO }, () => {
  it.each(['<nombre y apellidos>', 'Nombre Apellido', 'civicpulse-curator', 'claude-opus-5'])(
    'firmada «%s», se niega antes de leer nada',
    (editor) => {
      // Una raíz sin datos: si llegara a leer, fallaría por otra cosa.
      const dir = mkdtempSync(join(tmpdir(), 'subir-vacio-'))
      try {
        const r = subir(dir, [], { editor })
        expect(r.status, r.stdout + r.stderr).toBe(2)
        expect(r.stderr).toContain('--editor')
      } finally {
        limpiar(dir)
      }
    },
  )

  it('sube: el overlay lleva la entrada firmada; lo publicado y lo servido, el veredicto y quién lo subió; la vecina no se mueve', () => {
    const dir = montar()
    try {
      const vecinaAntes = delMonolito(dir, VECINA)
      const r = subir(dir)
      expect(r.status, r.stdout + r.stderr).toBe(0)

      const entrada = leer(dir, 'pleno-claims-overlay.json').entries[SUBIDA]
      expect(entrada).toMatchObject({
        source: 'curator-upgrade',
        editor: PERSONA,
        desde: 'sin-datos',
        reason: RESUMEN,
      })
      expect(entrada.verification).toMatchObject({
        verdict: 'parcial',
        summary: RESUMEN,
        checkedAgainst: ['tenders'],
        derivedBy: ['curator-upgrade'],
      })
      expect(entrada.verification.evidence).toHaveLength(1)
      expect(entrada.verification.evidence[0]).toMatchObject({ kind: 'tender', ref: JUEGOS })
      expect(entrada.verification.evidence[0].snippet).toContain('URBEADAPTA S. L.')

      expect(delMonolito(dir, SUBIDA).verification).toMatchObject({
        verdict: 'parcial',
        source: 'curator-upgrade',
        raisedBy: PERSONA,
      })
      expect(delMonolito(dir, VECINA)).toEqual(vecinaAntes)

      // Y llega a lo que sirve el sitio.
      const servida = leer(dir, 'pleno-claims/p1.json').items.find(
        (it: { claim: { id: string } }) => it.claim.id === SUBIDA,
      )
      expect(servida.visibility).toBe('shown')
      expect(servida.verification).toMatchObject({ verdict: 'parcial', raisedBy: PERSONA })
    } finally {
      limpiar(dir)
    }
  })

  it('--dry-run enseña la entrada, el registro y lo que dirá la tarjeta, y no escribe nada', () => {
    const dir = montar()
    try {
      const antes = huella(dir)
      const r = subir(dir, ['--dry-run'])
      expect(r.status, r.stdout + r.stderr).toBe(0)
      expect(r.stdout).toContain('URBEADAPTA S. L.')
      expect(r.stdout).toContain(`subido por una persona · firmado por ${PERSONA}`)
      expect(r.stdout).toMatch(/no se ha escrito nada/)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('check:veredictos reconoce la firma: la subida por encima de su base se lista y sale 0', () => {
    const dir = montar()
    try {
      expect(subir(dir).status).toBe(0)
      const r = lanzar('check-veredictos.ts', dir, [])
      expect(r.status, r.stdout + r.stderr).toBe(0)
      expect(r.stdout).toMatch(/1 subida\(s\) firmada\(s\)/)
      // Y el primer cotejo la cuenta como lo que es, en la línea del parte.
      expect(r.stdout).toMatch(/1 subido\(s\) por una persona/)
      expect(r.stdout + r.stderr).not.toMatch(/\[por-encima\]/)
    } finally {
      limpiar(dir)
    }
  })

  it('--retirar baja a lo que había, con la firma y el motivo de una persona', () => {
    const dir = montar()
    try {
      expect(subir(dir).status).toBe(0)
      const r = retirar(dir)
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const entrada = leer(dir, 'pleno-claims-overlay.json').entries[SUBIDA]
      expect(entrada).toMatchObject({
        source: 'curator-downgrade',
        editor: PERSONA,
        reason: RETIRADA,
      })
      expect(delMonolito(dir, SUBIDA).verification).toMatchObject({
        verdict: 'sin-datos',
        source: 'curator-downgrade',
        downgradedBy: 'persona',
      })
    } finally {
      limpiar(dir)
    }
  })

  it('con la suspensión electoral activa no sube nada, y retirar una subida sí se puede', () => {
    const dir = montar()
    try {
      expect(subir(dir).status).toBe(0)
      writeFileSync(
        join(dir, 'public/data/promises.json'),
        json({ frozenUntil: '2999-01-01', items: [] }),
      )
      const antes = huella(dir)
      const otra = subir(dir, [], { id: VECINA })
      expect(otra.status, otra.stdout + otra.stderr).toBe(1)
      expect(otra.stderr).toMatch(/LOREG|suspensión/)
      expect(huella(dir)).toEqual(antes)

      const r = retirar(dir)
      expect(r.status, r.stdout + r.stderr).toBe(0)
    } finally {
      limpiar(dir)
    }
  })

  it('si lo publicado no es la composición de la base en disco, no sube', () => {
    const dir = montar({ publicado: publicado('2026-09-01T00:00:00.000Z') })
    try {
      const antes = huella(dir)
      const r = subir(dir)
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toMatch(/compos/)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('si recomponer moviera otra declaración, no sube: republicaría lo que nadie miró', () => {
    // Mismo sello que la base —el cotejo dice «coincide»—, pero lo publicado
    // lleva a la vecina con otro resumen: recomponer la devolvería al de la base.
    const p = publicado()
    p.items = p.items.map((it) =>
      it.claim.id === VECINA
        ? { ...it, verification: { ...it.verification, summary: 'Otro resumen distinto.' } }
        : it,
    )
    const dir = montar({ publicado: p })
    try {
      const antes = huella(dir)
      const r = subir(dir)
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toContain(VECINA)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('una acusación no se sube por esta vía: sigue las reglas de /hallazgos', () => {
    const dir = montar()
    try {
      const antes = huella(dir)
      const r = subir(dir, [], { id: ACUSACION })
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toMatch(/acusaci/)
      expect(r.stderr).toMatch(/hallazgos/)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('un enlace que no está en el corpus, o uno de varios lotes sin --lote, se niega', () => {
    const dir = montar()
    try {
      const antes = huella(dir)
      const fuera = lanzar('subir-veredicto.ts', dir, [
        SUBIDA,
        'parcial',
        '--evidencia',
        'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=NOESTA',
        '--resumen-de',
        join(dir, 'resumen.txt'),
        '--editor',
        PERSONA,
      ])
      expect(fuera.status, fuera.stdout + fuera.stderr).toBe(1)
      expect(fuera.stderr).toMatch(/no está/)

      const lotes = lanzar('subir-veredicto.ts', dir, [
        SUBIDA,
        'parcial',
        '--evidencia',
        LOTES,
        '--resumen-de',
        join(dir, 'resumen.txt'),
        '--editor',
        PERSONA,
      ])
      expect(lotes.status, lotes.stdout + lotes.stderr).toBe(1)
      expect(lotes.stderr).toMatch(/--lote/)
      expect(lotes.stderr).toMatch(/AUDITESA/)
      expect(huella(dir)).toEqual(antes)

      // Con el lote, sí.
      const conLote = lanzar('subir-veredicto.ts', dir, [
        SUBIDA,
        'parcial',
        '--evidencia',
        LOTES,
        '--lote',
        '2',
        '--resumen-de',
        join(dir, 'resumen.txt'),
        '--editor',
        PERSONA,
        '--dry-run',
      ])
      expect(conLote.status, conLote.stdout + conLote.stderr).toBe(0)
      expect(conLote.stdout).toContain('AUDITESA SL')
    } finally {
      limpiar(dir)
    }
  })

  it('el resumen no puede ser el de una máquina: ni el del motor ni el de la cola de NLI', () => {
    const cola = {
      _comment: 'prueba',
      version: 1,
      generatedAt: GENERADO,
      entries: {
        [SUBIDA]: {
          claimId: SUBIDA,
          verification: {
            claimId: SUBIDA,
            verdict: 'parcial',
            summary: RESUMEN,
            evidence: [
              { kind: 'tender', ref: JUEGOS, snippet: 'Suministro con instalación de juegos' },
            ],
            checkedAgainst: ['tenders'],
            derivedBy: ['nli-grounding'],
          },
          source: 'nli',
          desde: 'sin-datos',
          contradiccionNli: false,
          requiresHumanApproval: true,
          propuestaEn: GENERADO,
        },
      },
    }
    const dir = montar({ colaNli: cola })
    try {
      const antes = huella(dir)
      const r = subir(dir)
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toMatch(/máquina/)

      writeFileSync(join(dir, 'resumen.txt'), MOTIVO_DEL_MOTOR + '\n')
      rmSync(join(dir, 'editorial'), { recursive: true, force: true })
      const delMotor = subir(dir)
      expect(delMotor.status, delMotor.stdout + delMotor.stderr).toBe(1)
      expect(delMotor.stderr).toMatch(/máquina/)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('una declaración que no consta en ninguna transcripción no se sube: la puerta la retiene', () => {
    const dir = montar({
      transcripcion: `[20.0 → 24.0] (SPEAKER_02) ${VECINO_LITERAL}.\n[30.0 → 34.0] (SPEAKER_03) ${ACUSA_LITERAL}.\n`,
    })
    try {
      const antes = huella(dir)
      const r = subir(dir)
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toMatch(/transcripci/)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('sólo sube: pedir lo que ya publica se niega', () => {
    const dir = montar()
    try {
      expect(subir(dir).status).toBe(0)
      const antes = huella(dir)
      const r = subir(dir)
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toMatch(/sube|subida/)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })
})
