/**
 * `subir-veredicto` citando la licitación de un sistema dinámico de adquisición,
 * como en la terminal.
 *
 * El caso que lo trajo: qz6weg-184 (pleno del 01-12-2025), que habla de los SDA
 * «abiertos a otros ayuntamientos»; lo que encaja es la licitación ESDA1/2025,
 * abierta el 08-08-2025 y sin contrato propio. Cada prueba monta en un
 * directorio temporal la base, el overlay (la retractación del motor que publica
 * hoy), lo publicado, la transcripción y un trozo real de `tenders.json`; lanza
 * la CLI con ese directorio como raíz y mira lo que escribe. Ninguna toca
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
const PLAZO = 60_000

const lanzar = (cwd: string, argv: string[]) =>
  spawnSync(process.execPath, [TSX, join(RAIZ, 'scripts', 'subir-veredicto.ts'), ...argv], {
    cwd,
    encoding: 'utf8',
  })

const SDA = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/sda-licitaciones_2026-10-10.json'), 'utf8'),
)
const ESDA1 =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=2N0awhGNBRR%2FR5QFTlaM4A%3D%3D'
const NO_SDA =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=2RZHIgcWJEKqb7rCcv76BA%3D%3D'

const GENERADO = '2026-10-04T07:37:32.197Z'
const SDA_ID = 'qz6weg-184-cit-8629f9'
/** De una sesión anterior a la licitación: el SDA no la puede sostener. */
const ANTES_ID = 'p0-010-cit-eeeeee'
const LITERAL =
  'Los sistemas dinámicos de adquisición, que se aprobaron hace poco aquí, y con la cesión de la bolsa de autónomos de Riva Roja a otros ayuntamientos para realizar proyectos.'
const ANTES_LITERAL = 'vamos a poner en marcha un sistema dinámico de adquisición para arquitectura'
const RESUMEN =
  'El Ayuntamiento licitó en agosto de 2025 un sistema dinámico de adquisición abierto a otras entidades públicas; la bolsa de autónomos no consta.'
const DEL_MOTOR =
  'Task was a Spanish-language fact-checking reasoning exercise (not a coding/agentic task), so I answered directly in the response body.'
const PERSONA = 'María de la Fuente Llorens'

const declaracion = (id: string, plenoId: string, plenoDate: string, verbatim: string) => ({
  claim: {
    id,
    plenoId,
    plenoDate,
    segmentIndex: Number(id.split('-')[1]),
    type: 'cita_obra',
    speakerGroup: null,
    verbatim,
    context: 'Contexto de prueba de la sesión.',
    topic: 'contratacion',
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
    checkedAgainst: [],
  },
})

const BASE = {
  generatedAt: GENERADO,
  source: { description: 'prueba' },
  items: [
    declaracion(SDA_ID, 'qz6weg', '2025-12-01', LITERAL),
    declaracion(ANTES_ID, 'p0', '2025-07-01', ANTES_LITERAL),
  ],
}

const OVERLAY = {
  version: 1,
  generatedAt: '2026-08-02T00:00:00.000Z',
  entries: {
    [SDA_ID]: {
      verification: {
        claimId: SDA_ID,
        verdict: 'sin-datos',
        summary: DEL_MOTOR,
        evidence: [],
        checkedAgainst: ['verdict-engine'],
      },
      source: 'verdict-engine',
      reason: `verdict-engine (claude-code) re-judged parcial→sin-datos: ${DEL_MOTOR}`,
      editor: 'verdict-engine:claude-code',
      appliedAt: '2026-08-02T13:30:43.172Z',
    },
  },
}

const json = (x: unknown) => JSON.stringify(x, null, 2) + '\n'

function montar(): string {
  const dir = mkdtempSync(join(tmpdir(), 'subir-sda-'))
  const ficheros: Record<string, string> = {
    'public/data/pleno-claims-verified-base.json': json(BASE),
    'public/data/pleno-claims-overlay.json': json(OVERLAY),
    'public/data/pleno-claims-verified.json': json({
      generatedAt: GENERADO,
      source: BASE.source,
      items: mergeVerified(BASE.items as unknown as VerifiedItem[], OVERLAY as never),
    }),
    'public/data/pleno-transcripts/qz6weg.txt': `[10.0 → 14.0] (SPEAKER_01) ${LITERAL}\n`,
    'public/data/pleno-transcripts/p0.txt': `[10.0 → 14.0] (SPEAKER_01) ${ANTES_LITERAL}.\n`,
    'public/data/tenders.json': json(SDA.tenders),
    'public/data/bdns.json': json({ generatedAt: GENERADO, items: [] }),
    'public/data/promises.json': json({ frozenUntil: null, items: [] }),
    'resumen.txt': RESUMEN + '\n',
  }
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
  opciones: { id?: string; enlace?: string } = {},
  extra: string[] = [],
) =>
  lanzar(dir, [
    opciones.id ?? SDA_ID,
    'parcial',
    '--evidencia',
    opciones.enlace ?? ESDA1,
    '--resumen-de',
    join(dir, 'resumen.txt'),
    '--editor',
    PERSONA,
    ...extra,
  ])

describe('subir-veredicto · la licitación de un SDA', { timeout: PLAZO }, () => {
  it('sube citando la licitación: la fila la escribe el registro, sin estado, importe ni «adjudicado»', () => {
    const dir = montar()
    try {
      const r = subir(dir)
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const entrada = leer(dir, 'pleno-claims-overlay.json').entries[SDA_ID]
      expect(entrada).toMatchObject({
        source: 'curator-upgrade',
        editor: PERSONA,
        desde: 'sin-datos',
      })
      expect(entrada.verification.checkedAgainst).toEqual(['tenders'])
      const [fila] = entrada.verification.evidence
      expect(fila).toMatchObject({ kind: 'licitacion', ref: ESDA1, stance: 'checked' })
      expect(fila.snippet).toMatch(
        /^Licitación de un sistema dinámico de adquisición · Sistema Dinámico de Adquisición para la contratación de SERVICIOS/,
      )
      expect(fila.snippet).toMatch(/ · expediente ESDA1\/2025 · ofertas desde el 08-08-2025$/)
      expect(fila.snippet).not.toMatch(/adjudicad|€/)
      const publicado = leer(dir, 'pleno-claims-verified.json').items.find(
        (it: { claim: { id: string } }) => it.claim.id === SDA_ID,
      )
      expect(publicado.verification).toMatchObject({ verdict: 'parcial', raisedBy: PERSONA })
    } finally {
      limpiar(dir)
    }
  })

  it('una declaración anterior a la licitación no la sostiene', () => {
    const dir = montar()
    try {
      const antes = huella(dir)
      const r = subir(dir, { id: ANTES_ID })
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toMatch(/posterior/)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('una licitación que no es un SDA sigue sin citarse', () => {
    const dir = montar()
    try {
      const antes = huella(dir)
      const r = subir(dir, { enlace: NO_SDA })
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toMatch(/adjudicado ni formalizado/)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })
})
