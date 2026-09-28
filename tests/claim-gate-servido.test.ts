import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DATA_GROUNDED_VERDICTS,
  classifyClaimVisibility,
  type ClaimVisibilityInput,
} from '../src/scraper/claim-public-gate'

/**
 * Una declaración servida `toggle` con un veredicto fundado no tiene rótulo
 * honesto en ninguna superficie.
 *
 * Medido el 28-09-2026 sobre los trozos servidos: 5 de 4.960 salían así, las
 * cinco «parcial» firmadas por un curador con `downgrade-verdict`. /plenos las
 * rotulaba «Parcial» y las contaba entre las «contrastadas» —ClaimLedger lee el
 * veredicto—; /hallazgos citaba una con «sin contraste en los datos» y «el
 * verificador no halló ningún dato municipal», que es falso: el curador dejó la
 * evidencia del contrato y escribió por qué sólo es parcial. La misma frase con
 * dos rótulos que se contradicen, y ninguno de los dos cierto para ese estado.
 *
 * Por eso no se arregla re-rotulando una superficie para que copie a la otra,
 * sino impidiendo el estado. Tras el arreglo no se alcanza por construcción:
 * el suelo de evidencia de `applyOverlayEntries` obliga a todo canal automático
 * a nombrar un corpus real para un veredicto fuerte, y la única fila exenta —la
 * bajada de curador— pasa por la vía del curador. Si vuelve a aparecer es una
 * regresión, y esto se pone en rojo en vez de publicarla.
 *
 * Se leen los ficheros servidos, no se escriben aquí.
 */
const ROOT = join(__dirname, '..')
const TROZOS = join(ROOT, 'public/data/pleno-claims')

type Servida = ClaimVisibilityInput & {
  claim: { id: string; type?: string }
  verification: { verdict?: string }
  visibility?: string
}

const servidas: Servida[] = readdirSync(TROZOS)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .flatMap((f) => JSON.parse(readFileSync(join(TROZOS, f), 'utf8')).items as Servida[])

const overlay = JSON.parse(
  readFileSync(join(ROOT, 'public/data/pleno-claims-overlay.json'), 'utf8'),
) as { entries: Record<string, { source: string }> }

/** Las firmadas por un curador, según el overlay y no según el trozo. */
const firmadasPorCurador = new Set(
  Object.entries(overlay.entries)
    .filter(([, e]) => e.source === 'curator-downgrade')
    .map(([id]) => id),
)

const fundada = (it: Servida) => DATA_GROUNDED_VERDICTS.has(String(it.verification.verdict))

describe('lo servido: ninguna declaración se pliega con un veredicto fundado', () => {
  it('mide algo: hay trozos, veredictos fundados y firmas de curador entre lo servido', () => {
    expect(servidas.length).toBeGreaterThan(0)
    expect(servidas.filter(fundada).length).toBeGreaterThan(0)
    // La clase para la que se escribió esto tiene que estar entre lo evaluado:
    // sin ella, la invariante pasaría sin haber mirado el caso.
    expect(
      servidas.filter((it) => fundada(it) && firmadasPorCurador.has(it.claim.id)).length,
    ).toBeGreaterThan(0)
  })

  it('ninguna fila `toggle` lleva un veredicto fundado', () => {
    const plegadasFundadas = servidas
      .filter((it) => it.visibility === 'toggle' && fundada(it))
      .map((it) => `${it.claim.id} (${it.verification.verdict})`)
    expect(plegadasFundadas).toEqual([])
  })

  it('el sello de cada trozo es lo que la puerta dice hoy de esa misma fila', () => {
    // El navegador vuelve a pasar la puerta sobre lo que recibe (defensa en
    // profundidad). Si el trozo no lleva un campo que la puerta lee, o se
    // cambió la puerta sin regenerar los trozos, las dos respuestas se separan.
    const discrepan = servidas
      .map((it) => ({ it, viva: classifyClaimVisibility(it) }))
      .filter(({ it, viva }) => viva !== it.visibility)
      .map(({ it, viva }) => `${it.claim.id}: sello ${it.visibility}, puerta ${viva}`)
    expect(discrepan).toEqual([])
  })
})
