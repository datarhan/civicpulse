/**
 * /lab-health — operational freshness audit for every public-data
 * snapshot. Lists each source with its generatedAt + age + count +
 * size + tone-coloured Pill so curators can spot a silently-broken
 * scraper at a glance.
 *
 * Hidden from main nav — discoverable from /datos + /metodologia.
 * Lives under the regular InnerShell, so the sidebar + topbar stay
 * consistent with /datos and /promesas.
 */
import { useMemo } from 'react'
import { Card, Pill, SectionHead } from '../components/Primitives'
import { useLabHealth } from '../hooks/useLabHealth'
import { ageHours, freshnessTone } from '../lib/data-freshness'
import { timeAgo } from '../hooks/usePress'

const GROUP_LABEL = {
  core: 'Corpus cívico (ciudadano)',
  curated: 'Curado · humano',
  quejas: 'Quejas (bot)',
  lab: 'Laboratorio de prensa',
  pleno: 'Editorial de plenos',
}

const TONE_ORDER = { crit: 0, warn: 1, civic: 2, ok: 3 }

function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} KB`
  return `${Math.round(n / (1024 * 102.4)) / 10} MB`
}

function HealthRow({ row }) {
  const tone = row.status === 'ok' ? freshnessTone(row.generatedAt) : 'crit'
  const age = row.generatedAt
    ? timeAgo(row.generatedAt)
    : row.status === 'missing'
      ? 'no encontrada'
      : '—'
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr 110px 110px 80px',
        gap: 12,
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
        fontSize: 'var(--fs-meta)',
      }}
    >
      <Pill tone={tone} size="xs">
        {tone === 'ok'
          ? 'fresco'
          : tone === 'civic'
            ? 'reciente'
            : tone === 'warn'
              ? 'desactualizado'
              : 'sin refresco'}
      </Pill>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{row.label}</div>
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={row.path}
        >
          {row.path}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink70)' }}>
        {age}
      </div>
      <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink70)' }}>
        {row.count != null ? `${row.count.toLocaleString('es-ES')} filas` : '—'}
      </div>
      <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
        {formatBytes(row.sizeBytes)}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 110,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <Pill tone={tone} size="sm">
        {value}
      </Pill>
    </div>
  )
}

export default function LabHealth() {
  const { loading, rows } = useLabHealth()

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ta = a.status === 'ok' ? freshnessTone(a.generatedAt) : 'crit'
      const tb = b.status === 'ok' ? freshnessTone(b.generatedAt) : 'crit'
      if (TONE_ORDER[ta] !== TONE_ORDER[tb]) return TONE_ORDER[ta] - TONE_ORDER[tb]
      // Within tone bucket: older first (so dead-and-very-old beats dead-only).
      return ageHours(b.generatedAt) - ageHours(a.generatedAt)
    })
  }, [rows])

  const stats = useMemo(() => {
    const out = { total: rows.length, ok: 0, civic: 0, warn: 0, crit: 0, oldestHours: 0 }
    for (const r of rows) {
      const tone = r.status === 'ok' ? freshnessTone(r.generatedAt) : 'crit'
      out[tone] = (out[tone] || 0) + 1
      const h = ageHours(r.generatedAt)
      if (Number.isFinite(h) && h > out.oldestHours) out.oldestHours = h
    }
    return out
  }, [rows])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const r of sorted) {
      if (!map.has(r.group)) map.set(r.group, [])
      map.get(r.group).push(r)
    }
    return Array.from(map.entries())
  }, [sorted])

  return (
    <div style={{ padding: '24px', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Diagnóstico de fuentes
        </div>
        <h1
          style={{
            fontSize: 'var(--fs-page)',
            fontWeight: 700,
            letterSpacing: '-.015em',
            marginTop: 2,
            marginBottom: 0,
          }}
        >
          Salud del laboratorio
        </h1>
        <p
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            marginTop: 6,
            maxWidth: 780,
            lineHeight: 1.55,
          }}
        >
          Inventario de cada snapshot público que alimenta el panel. Cada fila muestra cuándo fue
          generado por última vez, cuántas filas trae y su tamaño. Los desactualizados (&gt; 7 d) y
          sin refresco (&gt; 30 d) aparecen primero para que el equipo pueda detectar fallos
          silenciosos del scraper nocturno.
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>Comprobando fuentes…</div>
      ) : (
        <>
          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 'var(--fs-aux)' }}>
              <Stat label="Fuentes" value={stats.total} tone="neutral" />
              <Stat label="Frescas (<36h)" value={stats.ok} tone="ok" />
              <Stat label="Recientes (<7d)" value={stats.civic} tone="civic" />
              <Stat label="Desactualizadas" value={stats.warn} tone="warn" />
              <Stat label="Sin refresco" value={stats.crit} tone="crit" />
              <Stat
                label="Más antigua"
                value={stats.oldestHours > 0 ? `${Math.round(stats.oldestHours / 24)} d` : '—'}
                tone="neutral"
              />
            </div>
          </Card>

          {grouped.map(([group, list]) => (
            <Card key={group} style={{ marginBottom: 14 }}>
              <SectionHead
                eyebrow="Grupo"
                title={GROUP_LABEL[group] || group}
                right={
                  <Pill tone="neutral" size="xs">
                    {list.length}
                  </Pill>
                }
              />
              <div style={{ marginTop: 8 }}>
                {list.map((row) => (
                  <HealthRow key={row.path} row={row} />
                ))}
              </div>
            </Card>
          ))}

          <p
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              marginTop: 16,
              lineHeight: 1.55,
            }}
          >
            Los snapshots se refrescan vía GitHub Actions cada noche a las 04:30 UTC ·{' '}
            <a
              href="/metodologia#laboratorio-prensa"
              style={{ color: 'var(--civic)', textDecoration: 'underline' }}
            >
              Metodología →
            </a>
          </p>
        </>
      )}
    </div>
  )
}
