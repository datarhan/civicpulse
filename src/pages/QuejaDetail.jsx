import { Link, useParams } from 'react-router-dom'
import { Card, Pill, SectionHead } from '../components/Primitives'
import {
  useQuejas,
  useQuejaResponses,
  STATE_LABEL,
  STATE_TONE,
  CATEGORY_LABEL,
  prettyNeighborhood,
} from '../hooks/useQuejas'
import { useOfficials, partyColor } from '../hooks/useOfficials'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const SINDIC_PORTAL = 'https://www.elsindic.com/es/presenta-una-queja'

function fmt(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function daysSince(iso) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function plazoFor(category) {
  if (category === 'transparencia') return 30
  return 90
}

function TimelineItem({ date, label, tone = 'neutral', detail }) {
  const color =
    tone === 'ok' ? 'var(--ok)' :
    tone === 'warn' ? 'var(--warn)' :
    tone === 'crit' ? 'var(--crit)' :
    tone === 'civic' ? 'var(--civic)' :
    'var(--ink60)'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 12px 1fr', gap: 12, alignItems: 'flex-start', padding: '10px 0' }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--ink60)' }}>
        {fmtDate(date)}
      </div>
      <div style={{ position: 'relative', height: '100%' }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: color,
          position: 'absolute', top: 6, left: 0,
        }} />
        <div style={{
          position: 'absolute', top: 16, bottom: -10, left: 3.5, width: 1, background: 'var(--border2)',
        }} />
      </div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div>
        {detail && (
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 2 }}>{detail}</div>
        )}
      </div>
    </div>
  )
}

export default function QuejaDetail() {
  const { id: rawId } = useParams()
  const { loading, data } = useQuejas()
  const { data: responses } = useQuejaResponses()
  const { data: officials } = useOfficials()

  const id = (rawId || '').toUpperCase()
  const queja = (data?.items || []).find((q) => q.service_request_id === id)
  useDocumentTitle(queja ? `${id} · ${queja.description?.slice(0, 60)}` : id)
  const qResponses = (responses?.items || []).filter((r) => r.queja_id === id)
  const concejal = officials?.officials?.find((o) => o.slug === queja?.concejal_slug)

  if (loading) {
    return (
      <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ color: 'var(--ink50)', fontSize: 13 }}>Cargando…</div>
      </div>
    )
  }

  if (!queja) {
    return (
      <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 900, margin: '0 auto' }}>
        <Card>
          <SectionHead eyebrow="No encontrada" title={`Queja ${id}`} />
          <div style={{ fontSize: 14, color: 'var(--ink70)', marginTop: 8 }}>
            Esta queja no aparece en el snapshot actual. Puede que haya sido archivada o que el identificador sea incorrecto.
          </div>
          <div style={{ marginTop: 12 }}>
            <Link to="/quejas" style={{ color: 'var(--civic)' }}>← Volver al feed público</Link>
          </div>
        </Card>
      </div>
    )
  }

  const category = queja.service_code
  const plazo = plazoFor(category)
  const registeredDays = daysSince(queja.registered_at)
  const diasRestantes = registeredDays != null ? plazo - registeredDays : null

  // Synthetic timeline derived from the row's timestamps + state.
  const timeline = []
  timeline.push({
    date: queja.requested_datetime,
    label: 'Capturada en CivicPulse',
    tone: 'neutral',
    detail: `Vía Telegram bot · barrio ${prettyNeighborhood(queja.address_string) || '—'}`,
  })
  if (queja.apoyos >= 10) {
    timeline.push({
      date: queja.updated_datetime,
      label: 'Verificada por la comunidad',
      tone: 'civic',
      detail: `${queja.apoyos} apoyos vecinales · incluida en el lote semanal`,
    })
  }
  if (queja.registered_at) {
    timeline.push({
      date: queja.registered_at,
      label: 'Registrada en sede electrónica',
      tone: 'civic',
      detail: `Asiento ${queja.registro_entry_number || '—'} · inicio del reloj legal (${plazo} días)`,
    })
  }
  if (queja.status === 'silencio_negativo') {
    timeline.push({
      date: queja.updated_datetime,
      label: 'Silencio administrativo negativo',
      tone: 'warn',
      detail: `Plazo legal vencido · art. 24 LPACAP`,
    })
  }
  if (queja.status === 'escalada_sindic') {
    timeline.push({
      date: queja.updated_datetime,
      label: 'Escalada al Síndic de Greuges CV',
      tone: 'crit',
      detail: `Ley 11/1988 · resoluciones públicas`,
    })
  }
  if (queja.status === 'resuelta') {
    timeline.push({
      date: queja.updated_datetime,
      label: 'Resuelta',
      tone: 'ok',
    })
  }

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 10 }}>
        <Link to="/quejas" style={{ fontSize: 12, color: 'var(--civic)' }}>← Feed de quejas</Link>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <div>
            <div
              className="mono"
              style={{ fontSize: 11, color: 'var(--ink50)', letterSpacing: '.08em', textTransform: 'uppercase' }}
            >
              Queja ciudadana · {queja.service_request_id}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.01em', marginTop: 4 }}>
              {queja.description.split('\n')[0].slice(0, 120)}
            </div>
          </div>
          <Pill tone={STATE_TONE[queja.status] || 'ghost'} size="xs">
            {STATE_LABEL[queja.status] || queja.status}
          </Pill>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--ink60)' }}>
          <span>📂 {CATEGORY_LABEL[category] || category}</span>
          {queja.address_string && <span>📍 {prettyNeighborhood(queja.address_string)}</span>}
          {queja.concejalia_area && <span>🏛 {queja.concejalia_area}</span>}
          <span>👍 {queja.apoyos} apoyos</span>
        </div>

        {concejal && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border2)' }}>
            {concejal.photoUrl && (
              <img
                src={concejal.photoUrl}
                alt={concejal.name}
                width={38}
                height={38}
                style={{ width: 38, height: 38, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink60)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Responsable político
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{concejal.name}</div>
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  background: partyColor(concejal.party),
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: 3,
                }}
              >
                {concejal.party}
              </span>
            </div>
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Texto de la queja" title="Detalle ciudadano (verbatim)" />
        <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink80)', marginTop: 8, whiteSpace: 'pre-wrap' }}>
          {queja.description}
        </div>
      </Card>

      {queja.registered_at && queja.status !== 'resuelta' && (
        <Card style={{ marginTop: 14 }}>
          <SectionHead eyebrow="Reloj legal" title="Plazo LPACAP en curso" />
          <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
            <div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Registrada
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{fmtDate(queja.registered_at)}</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Plazo máximo
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{plazo} días</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {diasRestantes >= 0 ? 'Días restantes' : 'Días excedidos'}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  marginTop: 2,
                  color: diasRestantes < 0 ? 'var(--crit)' : diasRestantes < 15 ? 'var(--warn)' : 'var(--ok)',
                }}
              >
                {diasRestantes >= 0 ? diasRestantes : Math.abs(diasRestantes)}
              </div>
            </div>
            {queja.registro_entry_number && (
              <div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Asiento sede
                </div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{queja.registro_entry_number}</div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Historial" title="Línea temporal" />
        <div style={{ marginTop: 10 }}>
          {timeline.map((t, i) => <TimelineItem key={i} {...t} />)}
        </div>
      </Card>

      {qResponses.length > 0 && (
        <Card style={{ marginTop: 14, borderLeft: '3px solid var(--civic)' }}>
          <SectionHead eyebrow="Derecho de réplica oficial" title="Respuesta del Ayuntamiento" />
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {qResponses.map((r) => (
              <div key={r.id} style={{ paddingBottom: 10, borderBottom: '1px dotted var(--border2)' }}>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink60)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  {r.role} · {r.firmante} · {fmt(r.appliedAt)}
                </div>
                <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{r.text}</div>
                {r.source_url && (
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    <a href={r.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--civic)' }}>
                      Fuente primaria →
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Acciones" title="¿Qué puedes hacer?" />
        <ul style={{ paddingLeft: 20, marginTop: 8, fontSize: 13.5, color: 'var(--ink70)', lineHeight: 1.6 }}>
          <li>
            <strong>Apoyar:</strong> escribe <code>/apoyar {queja.service_request_id}</code> al bot de Telegram.
          </li>
          {(queja.status === 'silencio_negativo' || queja.status === 'escalada_sindic') && (
            <li>
              <strong>Presentar queja al Síndic:</strong>{' '}
              <a href={SINDIC_PORTAL} target="_blank" rel="noreferrer" style={{ color: 'var(--civic)' }}>
                elsindic.com →
              </a>
            </li>
          )}
          <li>
            <strong>Responder como responsable público:</strong>{' '}
            <a
              href={`https://github.com/datarhan/civicpulse/issues/new?template=queja-response.yml&title=${encodeURIComponent(
                '[Respuesta] ' + queja.service_request_id
              )}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--civic)' }}
            >
              Abrir respuesta oficial (GitHub issue) →
            </a>
          </li>
        </ul>
      </Card>
    </div>
  )
}
