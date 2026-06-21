// @ts-check
/**
 * Build the /plenos index rows: one per session with cheap signal counts,
 * joined from the claim manifest (per-pleno byVerdict), findings, and agendas.
 * Pure — no I/O. Newest session first.
 */
export function summarizeSessions({
  plenos = [],
  manifestPlenos = [],
  findings = [],
  agendas = [],
} = {}) {
  const verdictById = new Map()
  for (const d of manifestPlenos) verdictById.set(d.plenoId, d.byVerdict || {})
  const agendaCountById = new Map()
  for (const a of agendas) agendaCountById.set(a.id, a.agendaCount || 0)
  const findingsById = new Map()
  for (const f of findings) findingsById.set(f.plenoId, (findingsById.get(f.plenoId) || 0) + 1)

  return plenos
    .map((p) => {
      const v = verdictById.get(p.id) || {}
      return {
        id: p.id,
        date: p.date,
        title: p.title,
        kind: p.kind,
        link: p.link,
        agendaCount: agendaCountById.get(p.id) || 0,
        verificado: v.verificado || 0,
        contradicho: v.contradicho || 0,
        findings: findingsById.get(p.id) || 0,
      }
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
}
