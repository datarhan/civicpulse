/**
 * <DataAsOf> — small "Datos al …" chip surfaced on data-heavy pages
 * so readers can gauge how fresh the snapshot they're looking at is.
 *
 * Renders inside the existing <Pill> primitive with tone derived from
 * `freshnessTone()`. The visible label is the relative-time string from
 * `timeAgo()` (reused — single source of truth across the SPA). Tooltip
 * carries the absolute ISO so a curator can audit precisely.
 *
 * Props:
 *   iso    — generatedAt from the snapshot envelope; missing/invalid
 *            renders an honest "—" with `crit` tone.
 *   label  — optional short context (e.g. "Presupuesto"). When omitted,
 *            the chip shows just the relative time.
 *   size   — 'xs' | 'sm' (default 'xs' — these chips live in card
 *            headers, where space is tight).
 *   file   — opcional: el fichero del snapshot («promises.json»). Con él, el
 *            tono se juzga contra el plazo que ese fichero tiene registrado en
 *            `DEFAULT_EXPECTATIONS` en vez de contra el umbral plano de 30
 *            días. Sin él, nada cambia — por eso las quince páginas que ya
 *            usan esta píldora siguen exactamente igual.
 *   tone   — opcional: un tono ya calculado aguas arriba. Lo necesitan las
 *            páginas que agregan VARIAS fuentes, donde el tono correcto es el
 *            peor de todas y no el de la fecha que se enseña (ver
 *            `worstFreshness`).
 *   title  — opcional: sustituye al tooltip por defecto, para poder desglosar
 *            esas fuentes una a una.
 */
import { Pill } from './Primitives'
import { timeAgo } from '../hooks/usePress'
import { freshnessTone } from '../lib/data-freshness'
import { expectationFor } from '../scraper/snapshot-cadence'

export default function DataAsOf({ iso, label, size = 'xs', file = null, tone: toneProp, title }) {
  const tone = toneProp ?? freshnessTone(iso, Date.now(), expectationFor(file)?.maxAgeDays ?? null)
  const rel = iso ? timeAgo(iso) : ''
  const text = rel || '—'
  const display = label ? `${label} · ${text}` : `Datos · ${text}`
  return (
    <span title={title || iso || 'sin fecha de generación'} style={{ display: 'inline-flex' }}>
      <Pill tone={tone} size={size}>
        {display}
      </Pill>
    </span>
  )
}
