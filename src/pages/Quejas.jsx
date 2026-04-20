import { Card, Pill, SectionHead } from '../components/Primitives'
import {
  useQuejas,
  STATE_LABEL,
  STATE_TONE,
  CATEGORY_LABEL,
  prettyNeighborhood,
  timeAgo,
} from '../hooks/useQuejas'

const TELEGRAM_BOT_URL = 'https://t.me/civicpulse_ribarroja_bot'

function EmptyState() {
  return (
    <>
      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <Pill tone="civic" size="xs">Canal abierto · sin datos aún</Pill>
          <Pill tone="ghost" size="xs">Telegram · SQLite · Open311</Pill>
        </div>
        <SectionHead
          eyebrow="Estado"
          title="El canal de quejas ciudadanas ya está abierto — no hay datos todavía"
        />
        <div style={{ fontSize: 14, color: 'var(--ink70)', lineHeight: 1.55, marginTop: 8 }}>
          <p>
            CivicPulse opera su propio canal de quejas ciudadanas vía el bot de Telegram{' '}
            <a href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--civic)' }}>
              @civicpulse_ribarroja_bot
            </a>
            . Cada vecino puede presentar una queja en 2 minutos y seguir su estado en tiempo real.
          </p>
          <p>
            Esta página publica el feed agregado — categoría, barrio, plazo legal y estado —{' '}
            <strong>nunca identifica al vecino</strong>. Las quejas con 10 apoyos vecinales entran
            en el lote semanal al Registro Electrónico del Ayuntamiento. Si el Ayuntamiento no
            responde en 3 meses, escalamos al Síndic de Greuges de la Comunitat Valenciana.
          </p>
        </div>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Cómo funciona" title="De la queja al escalado" />
        <ol style={{ fontSize: 13.5, color: 'var(--ink70)', marginTop: 8, lineHeight: 1.6, paddingLeft: 20 }}>
          <li>
            <strong>Presenta</strong> tu queja al bot: <code>/queja</code> — categoría, foto, ubicación.
          </li>
          <li>
            <strong>Tus vecinos la apoyan</strong> con <code>/apoyar Q-XXXX</code>. A 10 apoyos entra al lote oficial.
          </li>
          <li>
            <strong>Lote semanal al sede</strong>: cada lunes un voluntario firma las quejas verificadas con Cl@ve.
          </li>
          <li>
            <strong>3 meses legales</strong> (1 mes si es transparencia). Base legal: art. 21.3 y 24 LPACAP.
          </li>
          <li>
            <strong>Silencio → Síndic de Greuges CV</strong>: plantilla autogenerada y pública.
          </li>
        </ol>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Contratos editoriales" title="Qué publicamos y qué no" />
        <div style={{ fontSize: 13, color: 'var(--ink70)', marginTop: 8, lineHeight: 1.55 }}>
          <ul style={{ paddingLeft: 20 }}>
            <li>Publicamos: categoría, barrio (agregado), estado, apoyos, área municipal responsable, concejal político.</li>
            <li>No publicamos: identidad del denunciante, foto sin anonimizar, lat/lng exactas, personal técnico municipal.</li>
            <li>Los plazos y bases legales provienen del BOE. El escalado externo es al Síndic CV / CTBG, instituciones con autoridad estatutaria.</li>
            <li>Ver <a href="/metodologia" style={{ color: 'var(--civic)' }}>Metodología</a> y <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>Aviso legal</a> para el contrato completo.</li>
          </ul>
        </div>
      </Card>
    </>
  )
}

function StatCard({ label, value, tone = 'neutral', sub }) {
  const color =
    tone === 'ok' ? 'var(--ok)' :
    tone === 'warn' ? 'var(--warn)' :
    tone === 'crit' ? 'var(--crit)' :
    tone === 'civic' ? 'var(--civic)' :
    'var(--ink)'
  return (
    <Card>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 800, color, marginTop: 4, letterSpacing: '-.02em' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--ink50)', marginTop: 3 }}>{sub}</div>
      )}
    </Card>
  )
}

function DashboardView({ data }) {
  const items = data.items || []
  const stats = data.stats || { total: 0, byState: {}, byNeighborhood: {}, byCategory: {} }

  const resueltas = stats.byState.resuelta || 0
  const silencios = stats.byState.silencio_negativo || 0
  const pendientes =
    (stats.byState.capturada || 0) +
    (stats.byState.apoyada_verificada || 0) +
    (stats.byState.registrada || 0) +
    (stats.byState.notificada_10d || 0) +
    (stats.byState.en_tramite || 0)
  const resolucionPct = stats.total > 0 ? Math.round((resueltas / stats.total) * 100) : 0

  const sortedCats = Object.entries(stats.byCategory || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  const sortedNeigh = Object.entries(stats.byNeighborhood || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard label="Total quejas" value={stats.total} sub="desde el inicio del canal" />
        <StatCard label="Resueltas" value={resueltas} tone="ok" sub={`${resolucionPct}% del total`} />
        <StatCard label="Pendientes" value={pendientes} tone="civic" sub="capturadas + en trámite" />
        <StatCard label="Silencios" value={silencios} tone="warn" sub=">90 días sin respuesta" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Card>
          <SectionHead eyebrow="Por categoría" title="Qué se reporta más" />
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedCats.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink50)' }}>—</div>
            )}
            {sortedCats.map(([cat, n]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{CATEGORY_LABEL[cat] || cat}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink60)', minWidth: 24, textAlign: 'right' }}>{n}</span>
                <div style={{ width: 80, height: 6, background: 'var(--border2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (n / Math.max(...sortedCats.map((c) => c[1]))) * 100)}%`, height: '100%', background: 'var(--civic)' }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionHead eyebrow="Por barrio" title="Dónde pasa" />
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedNeigh.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink50)' }}>—</div>
            )}
            {sortedNeigh.map(([slug, n]) => (
              <div key={slug} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{prettyNeighborhood(slug)}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink60)', minWidth: 24, textAlign: 'right' }}>{n}</span>
                <div style={{ width: 80, height: 6, background: 'var(--border2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (n / Math.max(...sortedNeigh.map((c) => c[1]))) * 100)}%`, height: '100%', background: 'var(--ok)' }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionHead eyebrow="Quejas recientes · feed público" title="Últimas 30 quejas" />
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink50)' }}>Aún no hay quejas registradas.</div>
          )}
          {items.slice(0, 30).map((it) => (
            <div
              key={it.service_request_id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'min-content 1fr min-content min-content',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px dotted var(--border2)',
              }}
            >
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink60)' }}>
                {it.service_request_id}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.description}
                </div>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 2 }}>
                  {CATEGORY_LABEL[it.service_code] || it.service_code}
                  {it.address_string ? ` · ${prettyNeighborhood(it.address_string)}` : ''}
                  {it.concejalia_area ? ` · ${it.concejalia_area}` : ''}
                </div>
              </div>
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink60)', textAlign: 'right' }}>
                👍 {it.apoyos}
              </span>
              <Pill tone={STATE_TONE[it.status] || 'ghost'} size="xs">
                {STATE_LABEL[it.status] || it.status}
              </Pill>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink50)', marginTop: 12 }}>
          Snapshot: {data.generatedAt ? new Date(data.generatedAt).toLocaleString('es-ES') : '—'} ·{' '}
          Fuente: {data.source?.platform} · Formato: {data.source?.spec}
        </div>
      </Card>
    </>
  )
}

export default function Quejas() {
  const { loading, error, data } = useQuejas()

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Voz ciudadana
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          Quejas ciudadanas
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink60)', marginTop: 4, maxWidth: 620 }}>
          Canal público de quejas para Riba-roja. Presenta vía Telegram ·{' '}
          <a href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--civic)' }}>
            @civicpulse_ribarroja_bot
          </a>
          . Feed agregado y anónimo — base legal LPACAP + Ley 19/2013.
        </div>
      </div>

      {loading && <div style={{ color: 'var(--ink50)', fontSize: 13 }}>Cargando feed…</div>}
      {error && (
        <Card>
          <div style={{ color: 'var(--warn)', fontSize: 13 }}>
            No se pudo cargar /data/quejas.json. Puede que el bot aún no haya publicado su primer snapshot.
          </div>
        </Card>
      )}
      {!loading && !error && data && (data.stats?.total ?? 0) === 0 && <EmptyState />}
      {!loading && !error && data && (data.stats?.total ?? 0) > 0 && <DashboardView data={data} />}
    </div>
  )
}
