// @ts-check
import { useMemo } from 'react'
import { useOfficials } from './useOfficials'
import { usePromises } from './usePromises'
import { usePlenoAgendas } from './usePlenoAgendas'
import { usePlenoVotes } from './usePlenoVotes'
import { useQuejas } from './useQuejas'
import { useTenders } from './useTenders'
import { usePlenoClaimsManifest } from './usePlenoClaims'
import { computeDepartmentStats } from '../lib/department-stats'
import { worstFreshness } from '../lib/data-freshness'

/**
 * Aggregates six upstream snapshots into per-department stats keyed by
 * canonical DepartmentSlug. The heavy lifting lives in
 * src/lib/department-stats.js — this hook only fetches + memoizes.
 *
 * Sources: officials, promises, pleno-agendas, pleno-votes, quejas, and
 * the pleno-claims chunk manifest's totals.byTopicVerdict cross-tab
 * (~12 KB) — the same numbers the full chunk corpus would produce,
 * without downloading it (LLM-second-pass-aware: the chunker runs after
 * the base ⊕ overlay merge).
 *
 * Claims are NOT a blocker for the loading state — when the manifest is
 * missing or still loading, we render the rest of the page with
 * declaraciones=zero. This keeps /departamentos working while a long
 * verify run is in progress (it rewrites the files mid-run).
 *
 * Returns:
 *   { loading, error, data, generatedAt, freshness }
 * donde `freshness` es el agregado de `worstFreshness` (tono, entrada que lo
 * fija y desglose por fuente).
 */
export function useDepartmentStats() {
  const officials = useOfficials()
  const promises = usePromises()
  const agendas = usePlenoAgendas()
  const votes = usePlenoVotes()
  const quejas = useQuejas()
  const tenders = useTenders()
  const manifest = usePlenoClaimsManifest()

  // Required sources gate the loading state. Claims are best-effort —
  // a missing/erroring chunk manifest shouldn't block the dept page.
  const loading =
    officials.loading || promises.loading || agendas.loading || votes.loading || quejas.loading
  const error =
    officials.error || promises.error || agendas.error || votes.error || quejas.error || null

  const data = useMemo(() => {
    if (loading || error) return null
    return computeDepartmentStats({
      officials: officials.data,
      promises: promises.data,
      agendas: agendas.data,
      votes: votes.data,
      quejas: quejas.data,
      // Best-effort like claims: contracts enrich the page but must not gate it.
      tenders: tenders.error ? null : tenders.data,
      claimsSummary: manifest.error ? null : (manifest.data?.totals?.byTopicVerdict ?? null),
    })
  }, [
    loading,
    error,
    officials.data,
    promises.data,
    agendas.data,
    votes.data,
    quejas.data,
    tenders.data,
    tenders.error,
    manifest.data,
    manifest.error,
  ])

  // Frescura de las 5 entradas obligatorias.
  //
  // Esto era `stamps.sort()[0]` —la más vieja— pintada con el umbral plano de
  // 30 días, y decía dos cosas falsas. Fijaba la píldora en `promises.json`,
  // que es curado y tiene 120 días de plazo, y gritaba «likely broken» sobre
  // una página cuyas fuentes automáticas se habían refrescado esa madrugada. Y
  // al revés: un raspador nocturno parado cuarenta días habría quedado tapado
  // debajo del curado, que es más viejo todavía y está en su derecho.
  //
  // `worstFreshness` mide cada fuente contra SU plazo registrado. La fecha que
  // se publica sigue siendo la más vieja —no se esconde nada—, pero el tono es
  // el peor de las cinco, y `pinnedBy` dice cuál lo provoca.
  const freshness = useMemo(
    () =>
      worstFreshness([
        { file: 'officials.json', label: 'cargos', iso: officials.data?.generatedAt },
        { file: 'promises.json', label: 'promesas', iso: promises.data?.generatedAt },
        { file: 'plenos-agendas.json', label: 'órdenes del día', iso: agendas.data?.generatedAt },
        { file: 'pleno-votes.json', label: 'votos de pleno', iso: votes.data?.generatedAt },
        { file: 'quejas.json', label: 'quejas', iso: quejas.data?.generatedAt },
      ]),
    [officials.data, promises.data, agendas.data, votes.data, quejas.data],
  )

  return { loading, error, data, generatedAt: freshness.oldestIso, freshness }
}
