/**
 * `subir-veredicto` citando un punto del orden del día, como en la terminal.
 *
 * El caso que lo trajo: 1sqj7is-081 (pleno del 09-03-2026, «ya comenté en el
 * pleno pasado que trajimos Santa Rosa 2»), que sostiene el punto 2 del orden
 * del día del 09-02-2026. Cada prueba monta en un directorio temporal la base,
 * el overlay (la retractación del motor que publica hoy), lo publicado, la
 * transcripción, los registros de contratos y de la BDNS, y un trozo real de
 * `plenos-agendas.json`; lanza la CLI con ese directorio como raíz y mira lo que
 * escribe. Ninguna toca `public/data/` del repositorio.
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
const PLAZO = 60_000

const lanzar = (cwd: string, argv: string[]) =>
  spawnSync(process.execPath, [TSX, join(RAIZ, 'scripts', 'subir-veredicto.ts'), ...argv], {
    cwd,
    encoding: 'utf8',
  })

const AGENDAS = readFileSync(resolve(__dirname, 'fixtures/plenos-agendas_2026-10-10.json'), 'utf8')
const REGISTROS = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/subida-firmada-registros_2026-10-04.json'), 'utf8'),
)
const RX4HB4 =
  'https://regmeet.com/aytoribarroja/participaciones/c5b270a763686e776039618cc709f3a6?idioma=castellano'
const MA87E0 =
  'https://regmeet.com/aytoribarroja/participaciones/b5a1d925221b37e2e399f7b319038ba0?idioma=castellano'

const GENERADO = '2026-10-04T07:37:32.197Z'
const SANTA_ROSA = '1sqj7is-081-cit-50c5bb'
const CON_CIFRA = '1sqj7is-090-afi-dddddd'
const LITERAL = 'ya comenté en el pleno pasado que trajimos Santa Rosa 2'
const CIFRA_LITERAL = 'llevamos al pleno una modificación de crédito de un millón de euros'
const RESUMEN =
  'El orden del día de la sesión del 9 de febrero de 2026 llevó, en su punto 2, la información pública de la versión inicial del PRI de la UE Santa Rosa 2.'
const DEL_MOTOR =
  'Task completed: provided the requested 2-4 sentence skeptical reasoning in Spanish about whether candidates support the claim, without issuing a final verdict, per instructions.'
const PERSONA = 'María de la Fuente Llorens'

const declaracion = (id: string, verbatim: string, type: string, entities = {}) => ({
  claim: {
    id,
    plenoId: '1sqj7is',
    plenoDate: '2026-03-09',
    segmentIndex: Number(id.split('-')[1]),
    type,
    speakerGroup: null,
    verbatim,
    context: 'Contexto de prueba de la sesión.',
    topic: 'urbanismo',
    entities,
    confidence: 0.9,
    reasoning: 'Prueba.',
    requiresHumanApproval: true,
  },
  verification: {
    claimId: id,
    verdict: 'sin-datos',
    summary: 'Un «sin datos» no es un desmentido: la afirmación puede ser cierta.',
    evidence: [],
    checkedAgainst: [],
  },
})

const BASE = {
  generatedAt: GENERADO,
  source: { description: 'prueba' },
  items: [
    declaracion(SANTA_ROSA, LITERAL, 'cita_obra'),
    declaracion(CON_CIFRA, CIFRA_LITERAL, 'afirmacion_numerica', { amountEuros: 1000000 }),
  ],
}

const OVERLAY = {
  version: 1,
  generatedAt: '2026-08-02T00:00:00.000Z',
  entries: {
    [SANTA_ROSA]: {
      verification: {
        claimId: SANTA_ROSA,
        verdict: 'sin-datos',
        summary: DEL_MOTOR,
        evidence: [],
        checkedAgainst: ['verdict-engine'],
      },
      source: 'verdict-engine',
      reason: `verdict-engine (claude-code) re-judged parcial→sin-datos: ${DEL_MOTOR}`,
      editor: 'verdict-engine:claude-code',
      appliedAt: '2026-08-02T05:17:03.490Z',
    },
  },
}

const json = (x: unknown) => JSON.stringify(x, null, 2) + '\n'

function montar(opciones: { sinAgendas?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'subir-orden-'))
  const ficheros: Record<string, string> = {
    'public/data/pleno-claims-verified-base.json': json(BASE),
    'public/data/pleno-claims-overlay.json': json(OVERLAY),
    'public/data/pleno-claims-verified.json': json({
      generatedAt: GENERADO,
      source: BASE.source,
      items: mergeVerified(BASE.items as unknown as VerifiedItem[], OVERLAY as never),
    }),
    'public/data/pleno-transcripts/1sqj7is.txt':
      `[10.0 → 14.0] (SPEAKER_01) ${LITERAL}, y hoy seguimos.\n` +
      `[20.0 → 24.0] (SPEAKER_02) ${CIFRA_LITERAL}.\n`,
    'public/data/tenders.json': json(REGISTROS.tenders),
    'public/data/bdns.json': json(REGISTROS.bdns),
    'public/data/promises.json': json({ frozenUntil: null, items: [] }),
    'resumen.txt': RESUMEN + '\n',
  }
  if (!opciones.sinAgendas) ficheros['public/data/plenos-agendas.json'] = AGENDAS
  for (const [ruta, contenido] of Object.entries(ficheros)) {
    const destino = join(dir, ruta)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, contenido)
  }
  return dir
}

const limpiar = (dir: string) => rmSync(dir, { recursive: true, force: true })

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

const subir = (
  dir: string,
  opciones: { id?: string; veredicto?: string; enlace?: string; punto?: string | null } = {},
  extra: string[] = [],
) =>
  lanzar(dir, [
    opciones.id ?? SANTA_ROSA,
    opciones.veredicto ?? 'verificado',
    '--evidencia',
    opciones.enlace ?? RX4HB4,
    ...(opciones.punto === null ? [] : ['--punto', opciones.punto ?? '2']),
    '--resumen-de',
    join(dir, 'resumen.txt'),
    '--editor',
    PERSONA,
    ...extra,
  ])

describe('subir-veredicto · un punto del orden del día', { timeout: PLAZO }, () => {
  it('sube citando el punto: la fila la escribe el registro, y lo publicado lleva el corpus de los órdenes del día', () => {
    const dir = montar()
    try {
      const r = subir(dir)
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const entrada = leer(dir, 'pleno-claims-overlay.json').entries[SANTA_ROSA]
      expect(entrada).toMatchObject({
        source: 'curator-upgrade',
        editor: PERSONA,
        desde: 'sin-datos',
      })
      expect(entrada.verification.checkedAgainst).toEqual(['plenos-agendas'])
      expect(entrada.verification.evidence).toEqual([
        {
          kind: 'agenda',
          ref: RX4HB4,
          snippet:
            'Orden del día del pleno ordinario del 09-02-2026 · parte resolutiva · punto 2: Expedient: 5543/2020/GEN, Acord relatiu al sotmetiment a informació pública de la versió inicial del PRI de la UE Santa Rosa 2',
          stance: 'checked',
        },
      ])
      const publicado = leer(dir, 'pleno-claims-verified.json').items.find(
        (it: { claim: { id: string } }) => it.claim.id === SANTA_ROSA,
      )
      expect(publicado.verification).toMatchObject({ verdict: 'verificado', raisedBy: PERSONA })
      expect(r.stdout).toContain(`subido por una persona · firmado por ${PERSONA}`)
    } finally {
      limpiar(dir)
    }
  })

  it('sin --punto enumera los puntos de la sesión y no escribe nada', () => {
    const dir = montar()
    try {
      const antes = huella(dir)
      const r = subir(dir, { punto: null })
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toMatch(/--punto/)
      expect(r.stderr).toContain('punto 2 · Expedient: 5543/2020/GEN')
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('un orden del día posterior a la declaración no la sostiene', () => {
    const dir = montar()
    try {
      const antes = huella(dir)
      const r = subir(dir, { enlace: MA87E0, punto: '2' })
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toMatch(/posterior/)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('con una cifra en la declaración, el orden del día solo no llega a verificado; a parcial, sí', () => {
    const dir = montar()
    try {
      const antes = huella(dir)
      const verificado = subir(dir, { id: CON_CIFRA })
      expect(verificado.status, verificado.stdout + verificado.stderr).toBe(1)
      expect(verificado.stderr).toMatch(/importe/)
      const parcial = subir(dir, { id: CON_CIFRA, veredicto: 'parcial' }, ['--dry-run'])
      expect(parcial.status, parcial.stdout + parcial.stderr).toBe(0)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('sin plenos-agendas.json en disco, la sesión no está en el corpus: se dice, no revienta', () => {
    const dir = montar({ sinAgendas: true })
    try {
      const r = subir(dir)
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toMatch(/no está/)
    } finally {
      limpiar(dir)
    }
  })
})
