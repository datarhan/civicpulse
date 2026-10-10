/**
 * `downgrade-verdict --amend-reason` sobre una retractación del motor, como en
 * la terminal: la explicación firmada, que cambia lo que la tarjeta imprime y
 * no el veredicto.
 *
 * Cada prueba monta en un directorio temporal un corpus de cuatro declaraciones
 * de una sesión —la retractación cuya explicación se firma, una vecina que no
 * debe moverse, una acusación y una bajada de curador—, con su base, su overlay
 * (y una entrada huérfana, de una declaración que ya no está en la base), su
 * publicado, la transcripción de la sesión y la suspensión electoral; lanza la
 * CLI con ese directorio como raíz y mira lo que escribe. Ninguna toca
 * `public/data/` del repositorio.
 *
 * Desde esta vía, la enmienda del motivo de un curador pasa también por la
 * suspensión electoral y por el cotejo de la composición: lo decidió el
 * operador el 06-10-2026, con el diseño
 * (docs/superpowers/specs/2026-10-10-explicacion-firmada-design.md).
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mergeVerified, type VerifiedItem } from '../src/scraper/verified-merge'
import { RESUMENES_RETIRADOS } from '../src/lib/resumenes-retirados.js'

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
/** En src/lib/resumenes-retirados.js: la tarjeta dice hoy «Explicación retirada». */
const RETRACTADA = '19gax3o-143-cit-a3a7a1'
const VECINA = '19gax3o-150-cit-bbbbbb'
const ACUSACION = '19gax3o-126-acu-cccccc'
const CURADA = '19gax3o-019-afi-0a4414'
/** Re-extraída el 18-08-2026 con otro id: está en el overlay y no en la base. */
const HUERFANA = 'brxx5g-132-cit-39416c'

const LITERAL =
  'esa piscina, ese complexo esportivo de la Mallá que ha dicho todas las deficiencias que tenían'
const VECINO_LITERAL = 'la piscina cubierta no se puede usar para competiciones oficiales'
const ACUSA_LITERAL = 'que eran problemas en el agua y desde entonces no se ha subsanado'
const CURADO_LITERAL = 'si lo hubiéramos hecho entonces ahora no estaríamos hablando de esto'

const DEL_MOTOR =
  'Task completed: provided skeptical fact-check reasoning in Spanish (2-4 sentences) concluding none of the four candidates (bar catering tenders and pool cleaning service tenders) genuinely support the claim about exterior investment addressing reported deficiencies at the C.D. La Mallá sports comple'
const HUELLA_DEL_MOTOR = 'motivo · sha256:61a8088eb03e'
const MOTIVO_DEL_MOTOR = `verdict-engine (claude-code) re-judged parcial→sin-datos: ${DEL_MOTOR}`
const EXPLICACION =
  'La transcripción vigente lo dice en futuro: el exterior «va a tener» una inversión de este gobierno, de un millón de euros, este año. Ningún registro cotejado es esa inversión: la pavimentación del paseo Pacadar entre el complejo y el pabellón se adjudicó en 2023 y 2024 (93.023,59 € y 50.260,40 €), y la reforma del edificio La Mallà licitada en 2026 no tiene contrato adjudicado.'
const PORQUE =
  'La explicación publicada era un parte del modelo sobre su tarea; se escribe desde los registros cotejados, sin mover el veredicto.'
const MOTIVO_EN =
  'Gold review (ai): false contradicho: garbled conditional; the cited contracts are unrelated to the claim'
const MOTIVO_ES =
  'Se retiró el «Contradicho» que figuraba antes: la frase es un condicional mal transcrito, y los contratos que se citaban no tratan de lo que dice.'
const DESCARGO = 'Un «sin datos» no es un desmentido: la afirmación puede ser cierta.'
const PERSONA = 'María de la Fuente Llorens'

const declaracion = (id: string, verbatim: string, type = 'cita_obra') => ({
  claim: {
    id,
    plenoId: id.split('-')[0],
    plenoDate: '2026-01-19',
    segmentIndex: Number(id.split('-')[1]),
    type,
    ...(type === 'acusacion_publica' ? { accusationSubtype: 'factual' } : {}),
    speakerGroup: null,
    verbatim,
    context: 'Contexto de prueba de la sesión.',
    topic: 'deportes',
    entities: {},
    confidence: 0.9,
    reasoning: 'Prueba.',
    requiresHumanApproval: true,
  },
  verification: {
    claimId: id,
    verdict: 'sin-datos',
    summary: DESCARGO,
    evidence: [],
    checkedAgainst: [],
  },
})

const BASE = {
  generatedAt: GENERADO,
  source: { description: 'prueba' },
  items: [
    declaracion(RETRACTADA, LITERAL),
    declaracion(VECINA, VECINO_LITERAL),
    declaracion(ACUSACION, ACUSA_LITERAL, 'acusacion_publica'),
    declaracion(CURADA, CURADO_LITERAL, 'afirmacion_numerica'),
  ],
}

const retractacion = (id: string) => ({
  verification: {
    claimId: id,
    verdict: 'sin-datos',
    summary: DEL_MOTOR,
    evidence: [],
    checkedAgainst: ['verdict-engine'],
    confidence: 0.2,
  },
  source: 'verdict-engine',
  reason: MOTIVO_DEL_MOTOR,
  editor: 'verdict-engine:claude-code',
  appliedAt: '2026-08-02T05:38:45.146Z',
})

const OVERLAY = {
  version: 1,
  generatedAt: '2026-10-06T06:31:43.037Z',
  entries: {
    [RETRACTADA]: retractacion(RETRACTADA),
    [ACUSACION]: retractacion(ACUSACION),
    [HUERFANA]: retractacion(HUERFANA),
    [CURADA]: {
      verification: {
        claimId: CURADA,
        verdict: 'sin-datos',
        summary: MOTIVO_EN,
        evidence: [],
        checkedAgainst: ['curator-downgrade'],
      },
      source: 'curator-downgrade',
      reason: MOTIVO_EN,
      editor: 'ai-gold-review',
      appliedAt: '2026-06-24T07:41:17.000Z',
    },
  },
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
    /** La transcripción de la sesión; por defecto, con las cuatro declaraciones. */
    transcripcion?: string
    colaNli?: unknown
  } = {},
): string {
  const dir = mkdtempSync(join(tmpdir(), 'explicacion-'))
  const ficheros: Record<string, string> = {
    'public/data/pleno-claims-verified-base.json': json(BASE),
    'public/data/pleno-claims-overlay.json': json(OVERLAY),
    'public/data/pleno-claims-verified.json': json(opciones.publicado ?? publicado()),
    'public/data/pleno-transcripts/19gax3o.txt':
      opciones.transcripcion ??
      [
        `[10.0 → 14.0] (SPEAKER_01) ${LITERAL}, como el exterior.`,
        `[20.0 → 24.0] (SPEAKER_02) ${VECINO_LITERAL}.`,
        `[30.0 → 34.0] (SPEAKER_03) ${ACUSA_LITERAL}.`,
        `[40.0 → 44.0] (SPEAKER_04) ${CURADO_LITERAL}.`,
      ].join('\n') + '\n',
    'public/data/promises.json': json({ frozenUntil: opciones.frozenUntil ?? null, items: [] }),
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

const enmendar = (
  dir: string,
  opciones: { id?: string; texto?: string; editor?: string } = {},
  extra: string[] = [],
) =>
  lanzar('downgrade-verdict.ts', dir, [
    opciones.id ?? RETRACTADA,
    'sin-datos',
    '--amend-reason',
    '--new',
    opciones.texto ?? EXPLICACION,
    '--reason',
    PORQUE,
    '--editor',
    opciones.editor ?? PERSONA,
    ...extra,
  ])

const delCurador = (dir: string, extra: string[] = []) =>
  enmendar(dir, { id: CURADA, texto: MOTIVO_ES }, extra)

describe(
  'downgrade-verdict --amend-reason · la explicación de una retractación del motor',
  { timeout: PLAZO },
  () => {
    it('escribe la explicación en la entrada del motor; lo publicado y lo servido la llevan con quién la firmó; la vecina no se mueve', () => {
      const dir = montar()
      try {
        const vecinaAntes = delMonolito(dir, VECINA)
        const r = enmendar(dir)
        expect(r.status, r.stdout + r.stderr).toBe(0)

        const entrada = leer(dir, 'pleno-claims-overlay.json').entries[RETRACTADA]
        expect(entrada).toMatchObject({
          source: 'verdict-engine',
          editor: 'verdict-engine:claude-code',
          reason: MOTIVO_DEL_MOTOR,
          appliedAt: '2026-08-02T05:38:45.146Z',
        })
        expect(entrada.verification).toMatchObject({ verdict: 'sin-datos', summary: EXPLICACION })
        expect(entrada.reasonAmendments).toHaveLength(1)
        expect(entrada.reasonAmendments[0]).toMatchObject({
          previous: HUELLA_DEL_MOTOR,
          reason: PORQUE,
          editor: PERSONA,
        })
        expect(entrada.reasonAmendments[0].amendedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

        expect(delMonolito(dir, RETRACTADA).verification).toMatchObject({
          verdict: 'sin-datos',
          summary: EXPLICACION,
          source: 'verdict-engine',
          reasonSignedBy: PERSONA,
        })
        expect(delMonolito(dir, VECINA)).toEqual(vecinaAntes)

        // Y llega a lo que sirve el sitio.
        const servida = leer(dir, 'pleno-claims/19gax3o.json').items.find(
          (it: { claim: { id: string } }) => it.claim.id === RETRACTADA,
        )
        expect(servida.verification).toMatchObject({
          summary: EXPLICACION,
          reasonSignedBy: PERSONA,
        })

        expect(r.stdout).toContain(`explicación firmada por ${PERSONA}`)
        // La orden recuerda quitarla de src/lib/resumenes-retirados.js sólo si
        // está en esa lista, que es código y no del montaje: 19gax3o-143 salió
        // de ella el 10-10-2026, al firmarse su explicación de verdad. Se
        // comprueba contra la lista vigente, en los dos sentidos.
        const enLaLista = Object.prototype.hasOwnProperty.call(RESUMENES_RETIRADOS, RETRACTADA)
        if (enLaLista) expect(r.stdout).toContain('resumenes-retirados.js')
        else expect(r.stdout).not.toContain('resumenes-retirados.js')
      } finally {
        limpiar(dir)
      }
    })

    it('--dry-run enseña la entrada, la huella de lo que sustituye y lo que dirá la tarjeta, y no escribe nada', () => {
      const dir = montar()
      try {
        const antes = huella(dir)
        const r = enmendar(dir, {}, ['--dry-run'])
        expect(r.status, r.stdout + r.stderr).toBe(0)
        expect(r.stdout).toContain(EXPLICACION)
        expect(r.stdout).toContain(HUELLA_DEL_MOTOR)
        expect(r.stdout).toContain(`explicación firmada por ${PERSONA}`)
        expect(r.stdout).toMatch(/no se ha escrito nada/i)
        expect(huella(dir)).toEqual(antes)
      } finally {
        limpiar(dir)
      }
    })

    it('con la suspensión electoral activa no se enmienda nada: ni la explicación del motor ni el motivo de un curador', () => {
      const dir = montar({ frozenUntil: '2999-01-01' })
      try {
        const antes = huella(dir)
        for (const r of [enmendar(dir), delCurador(dir)]) {
          expect(r.status, r.stdout + r.stderr).toBe(1)
          expect(r.stderr).toMatch(/LOREG|suspensión/)
        }
        expect(huella(dir)).toEqual(antes)
      } finally {
        limpiar(dir)
      }
    })

    it('si lo publicado no es la composición de la base en disco, no se enmienda nada', () => {
      const dir = montar({ publicado: publicado('2026-09-01T00:00:00.000Z') })
      try {
        const antes = huella(dir)
        for (const r of [enmendar(dir), delCurador(dir)]) {
          expect(r.status, r.stdout + r.stderr).toBe(1)
          expect(r.stderr).toMatch(/compos/)
        }
        expect(huella(dir)).toEqual(antes)
      } finally {
        limpiar(dir)
      }
    })

    it('si recomponer moviera otra declaración, no se enmienda: republicaría lo que nadie miró', () => {
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
        const r = enmendar(dir)
        expect(r.status, r.stdout + r.stderr).toBe(1)
        expect(r.stderr).toContain(VECINA)
        expect(huella(dir)).toEqual(antes)
      } finally {
        limpiar(dir)
      }
    })

    it('una entrada huérfana no se enmienda: su declaración no está en la base y ninguna página la publica', () => {
      const dir = montar()
      try {
        const antes = huella(dir)
        const r = enmendar(dir, { id: HUERFANA })
        expect(r.status, r.stdout + r.stderr).toBe(1)
        expect(r.stderr).toMatch(/base/)
        expect(huella(dir)).toEqual(antes)
      } finally {
        limpiar(dir)
      }
    })

    it('una acusación no se explica por esta vía: sigue las reglas de /hallazgos', () => {
      const dir = montar()
      try {
        const antes = huella(dir)
        const r = enmendar(dir, { id: ACUSACION })
        expect(r.status, r.stdout + r.stderr).toBe(1)
        expect(r.stderr).toMatch(/acusaci/)
        expect(huella(dir)).toEqual(antes)
      } finally {
        limpiar(dir)
      }
    })

    it('una declaración que no consta en ninguna transcripción no se explica: la puerta la retiene', () => {
      const dir = montar({
        transcripcion: `[20.0 → 24.0] (SPEAKER_02) ${VECINO_LITERAL}.\n[40.0 → 44.0] (SPEAKER_04) ${CURADO_LITERAL}.\n`,
      })
      try {
        const antes = huella(dir)
        const r = enmendar(dir)
        expect(r.status, r.stdout + r.stderr).toBe(1)
        expect(r.stderr).toMatch(/transcripci/)
        expect(huella(dir)).toEqual(antes)
      } finally {
        limpiar(dir)
      }
    })

    it('la explicación no puede ser la de una máquina: ni la de la base ni la propuesta de NLI', () => {
      const PROPUESTA =
        'Los contratos del paseo Pacadar respaldan la inversión en el exterior del complejo deportivo.'
      const cola = {
        _comment: 'prueba',
        version: 1,
        generatedAt: GENERADO,
        entries: {
          [RETRACTADA]: {
            claimId: RETRACTADA,
            verification: {
              claimId: RETRACTADA,
              verdict: 'parcial',
              summary: PROPUESTA,
              evidence: [
                { kind: 'tender', ref: 'https://example.org/x', snippet: 'Paseo Pacadar' },
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
        for (const texto of [PROPUESTA, DESCARGO]) {
          const r = enmendar(dir, { texto })
          expect(r.status, r.stdout + r.stderr).toBe(1)
          expect(r.stderr).toMatch(/máquina/)
        }
        expect(huella(dir)).toEqual(antes)
      } finally {
        limpiar(dir)
      }
    })

    it('el motivo de un curador se sigue enmendando, ahora tras las mismas comprobaciones', () => {
      const dir = montar()
      try {
        const r = delCurador(dir)
        expect(r.status, r.stdout + r.stderr).toBe(0)
        const entrada = leer(dir, 'pleno-claims-overlay.json').entries[CURADA]
        expect(entrada).toMatchObject({
          source: 'curator-downgrade',
          editor: 'ai-gold-review',
          reason: MOTIVO_ES,
        })
        expect(entrada.reasonAmendments[0]).toMatchObject({
          previous: 'motivo · sha256:fc34a953749a',
          editor: PERSONA,
        })
        expect(delMonolito(dir, CURADA).verification).toMatchObject({
          summary: MOTIVO_ES,
          source: 'curator-downgrade',
          downgradedBy: 'automatica',
          reasonSignedBy: PERSONA,
        })
      } finally {
        limpiar(dir)
      }
    })
  },
)
