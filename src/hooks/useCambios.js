// @ts-check
import { useMemo } from 'react'
import { useQuejas, CATEGORY_LABEL, STATE_LABEL, prettyNeighborhood } from './useQuejas'
import { usePlenos } from './usePlenos'
import { usePress } from './usePress'
import { useTenders, formatDate } from './useTenders'
import { useBdns } from './useBdns'
import { useParticipa, KIND_LABEL } from './useParticipa'
import { contractAmount } from '../lib/tender-geo'
import { isCommittedContract } from '../lib/contract-status.js'

/**
 * Hook that aggregates "what changed" across every real-data corpus into a
 * single sorted list of events.
 *
 * NOT a network fetch — the roadmap originally proposed a nightly
 * compute-cambios.ts, but every item already carries a date field, so the
 * simplest correct implementation is just filtering each corpus's items by
 * a rolling window and merging the result. Zero extra infrastructure, zero
 * stale-snapshot risk.
 *
 * Events shape:
 *   { kind, date, title, subtitle, url, canonicalPath, shareText }
 *
 * Returns:
 *   { loading, changes, byKind, totalCount, windowDays }
 */

const DEFAULT_WINDOW_DAYS = 7

function inWindow(iso, cutoffIso) {
  if (!iso) return false
  return iso >= cutoffIso
}

function cutoff(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export function useCambios(days = DEFAULT_WINDOW_DAYS) {
  const { data: quejas, loading: qL } = useQuejas()
  const { data: plenos, loading: pL } = usePlenos()
  const { data: press, loading: prL } = usePress()
  const { data: tenders, loading: tL } = useTenders()
  const { data: bdns, loading: bL } = useBdns()
  const { data: participa, loading: paL } = useParticipa()

  const loading = qL || pL || prL || tL || bL || paL

  const changes = useMemo(() => {
    const cut = cutoff(days)
    const out = []

    // Quejas — only non-deleted, recent. Exporter already filters deleted rows
    // (bot/src/db/queries.ts softDelete guard), so snapshot never has them.
    for (const q of quejas?.items || []) {
      if (!inWindow(q.requested_datetime?.slice(0, 10), cut)) continue
      out.push({
        kind: 'queja',
        date: q.requested_datetime.slice(0, 10),
        title: (q.description || '').split('\n')[0].slice(0, 120),
        subtitle: [
          CATEGORY_LABEL[q.service_code] || q.service_code,
          q.address_string ? prettyNeighborhood(q.address_string) : null,
          STATE_LABEL[q.status] || q.status,
        ]
          .filter(Boolean)
          .join(' · '),
        url: `/quejas/${q.service_request_id.toLowerCase()}`,
        shareText: `Queja ${q.service_request_id} · ${CATEGORY_LABEL[q.service_code] || q.service_code}\n${(q.description || '').slice(0, 160)}`,
      })
    }

    // Plenos — new sessions.
    for (const p of plenos?.items || []) {
      if (!inWindow(p.date, cut)) continue
      out.push({
        kind: 'pleno',
        date: p.date,
        title: p.title,
        subtitle: p.kind ? `Sesión ${p.kind}` : 'Sesión municipal',
        url: p.link,
        external: true,
        shareText: `${p.title} — ${p.date}`,
      })
    }

    // Press — Google News aggregation.
    for (const it of press?.items || []) {
      if (!inWindow(it.date?.slice(0, 10), cut)) continue
      out.push({
        kind: 'prensa',
        date: it.date.slice(0, 10),
        title: it.title,
        subtitle: it.source || it.sourceHost,
        url: it.link,
        external: true,
        shareText: `"${it.title}" — ${it.source || ''} (${it.date.slice(0, 10)})`,
      })
    }

    // Tenders — new adjudications (awardDate fresh).
    for (const c of tenders?.contracts || []) {
      if (!inWindow(c.awardDate, cut)) continue
      // A void/abandoned/revoked award is not news of an adjudication. Latent
      // today (none of the 32 contracts in the last 90 days is cancelled) but
      // the feed would have announced one as if it stood. Same predicate the
      // money totals use, so "adjudicado" means one thing across the site.
      if (!isCommittedContract(c)) continue
      const amt = contractAmount(c) // sin IVA (PLACSP)
      const amount = amt > 0 ? `€${amt.toLocaleString('es-ES')}` : ''
      out.push({
        kind: 'licitacion',
        date: c.awardDate,
        title: c.title,
        subtitle: [c.contractor, amount, c.assignee].filter(Boolean).join(' · '),
        url: c.permalink,
        external: true,
        shareText: `Contrato adjudicado · ${c.title}${amount ? ' · ' + amount : ''}`,
      })
    }

    // BDNS — new subsidies.
    for (const b of bdns?.items || []) {
      if (!inWindow(b.date?.slice(0, 10), cut)) continue
      out.push({
        kind: 'subvencion',
        date: b.date.slice(0, 10),
        title: b.description,
        subtitle: b.organ,
        url: b.sourceUrl,
        external: true,
        shareText: `Subvención · ${b.description}`,
      })
    }

    // Participa — new posts.
    for (const pi of participa?.items || []) {
      if (!inWindow(pi.date?.slice(0, 10), cut)) continue
      out.push({
        kind: 'participa',
        date: pi.date.slice(0, 10),
        title: pi.title,
        subtitle: KIND_LABEL[pi.kind] || pi.kind,
        url: pi.link,
        external: true,
        shareText: `${KIND_LABEL[pi.kind] || 'Participación'} · ${pi.title}`,
      })
    }

    out.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return out
  }, [quejas, plenos, press, tenders, bdns, participa, days])

  const byKind = useMemo(() => {
    const m = {}
    for (const c of changes) {
      if (!m[c.kind]) m[c.kind] = []
      m[c.kind].push(c)
    }
    return m
  }, [changes])

  return { loading, changes, byKind, totalCount: changes.length, windowDays: days, formatDate }
}

export const KIND_LABEL_ES = {
  queja: 'Queja ciudadana',
  pleno: 'Pleno municipal',
  prensa: 'Prensa',
  licitacion: 'Contrato adjudicado',
  subvencion: 'Subvención',
  participa: 'Participación ciudadana',
}

export const KIND_TONE = {
  queja: 'warn',
  pleno: 'civic',
  prensa: 'neutral',
  licitacion: 'intel',
  subvencion: 'ok',
  participa: 'ok',
}
