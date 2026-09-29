import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead } from '../components/Primitives'
import { useQuejas, useEtiquetasDeQueja, STATE_TONE, prettyNeighborhood } from '../hooks/useQuejas'
import { useOfficials, partyColor } from '../hooks/useOfficials'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useT } from '../i18n'
import { diasTranscurridos, plazoDeResolucion, relojDelPlazo } from '../scraper/queja-router'
import { contadoresDeCargo } from '../lib/reloj-lpacap'

const TELEGRAM_BOT_URL = 'https://t.me/munigraph_bot'

function StatTile({ label, value, tone = 'neutral', sub }) {
  const color =
    tone === 'ok'
      ? 'var(--ok)'
      : tone === 'warn'
        ? 'var(--warn)'
        : tone === 'crit'
          ? 'var(--crit)'
          : tone === 'civic'
            ? 'var(--civic)'
            : 'var(--ink)'
  return (
    <Card>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-page)',
          fontWeight: 800,
          color,
          marginTop: 4,
          letterSpacing: '-.02em',
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 3 }}>
          {sub}
        </div>
      )}
    </Card>
  )
}

function Bar({ label, n, max, color, subline }) {
  const pct = max > 0 ? Math.round((n / max) * 100) : 0
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr min-content',
        alignItems: 'center',
        gap: 10,
        padding: '4px 0',
      }}
    >
      <span style={{ fontSize: 'var(--fs-aux)' }}>{label}</span>
      <div
        style={{
          position: 'relative',
          height: 8,
          background: 'var(--border2)',
          borderRadius: 'var(--r-pill)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            transition: 'width .3s ease',
          }}
        />
      </div>
      <span
        className="mono"
        style={{
          fontSize: 'var(--fs-meta)',
          color: 'var(--ink50)',
          minWidth: 24,
          textAlign: 'right',
        }}
      >
        {n}
      </span>
      {subline && (
        <div
          style={{
            gridColumn: '1 / 4',
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            marginTop: -2,
          }}
        >
          {subline}
        </div>
      )}
    </div>
  )
}

/**
 * Resueltas, pendientes y silencios por cargo — y «—» cuando esas tres cifras no
 * significan nada todavía.
 *
 * Contaban respuestas del ayuntamiento aunque ninguna queja hubiera llegado a su
 * registro, que es desde donde corre el plazo de la LPACAP: con la única queja
 * publicada, capturada y sin registrar, la fila decía «⏳ 1 · ⚠ 0» junto al
 * nombre de una concejala. El cero se leía como un aprobado y el uno como una
 * deuda del ayuntamiento; ninguno de los dos era una afirmación sostenible.
 * `contadoresDeCargo` decide, y el motivo se publica: corto en la fila, entero
 * al pie una vez por motivo presente.
 */
const TITULO_SLA = 'Quejas por responsable político'

function SlaPanel({ quejas, officials }) {
  const t = useT()
  const entries = Object.entries(quejas?.stats?.byConcejal || {})
    .map(([slug]) => {
      const off = officials?.officials?.find((o) => o.slug === slug)
      return {
        slug,
        name: off?.name || slug,
        party: off?.party || '',
        ...contadoresDeCargo(quejas, slug),
      }
    })
    .sort((a, b) => b.total - a.total)
  if (entries.length === 0) return null
  // Los motivos presentes, para explicarlos una vez al pie en vez de repetir la
  // misma frase en cada fila.
  const motivos = [...new Set(entries.filter((e) => !e.medible).map((e) => e.motivo))]
  return (
    <Card role="region" aria-label={TITULO_SLA} style={{ marginTop: 14 }}>
      <SectionHead eyebrow="Rendición de cuentas · concejalía" title={TITULO_SLA} />
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.map((e) => (
          <div
            key={e.slug}
            // La rejilla vive en `index.css` (`.cp-sla-fila`): necesita un punto
            // de ruptura para partirse en el móvil, y una @media no cabe en el
            // prop `style`.
            className="cp-sla-fila"
            style={{
              padding: '8px 0',
              borderBottom: '1px dotted var(--border2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {e.party && (
                <span
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-micro)',
                    fontWeight: 700,
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                    background: partyColor(e.party),
                    color: 'white',
                    padding: '2px 5px',
                    borderRadius: 'var(--r-pill)',
                    flexShrink: 0,
                  }}
                >
                  {e.party}
                </span>
              )}
              <div
                style={{
                  fontSize: 'var(--fs-aux)',
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {e.name}
              </div>
              {!e.medible && (
                <span
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-micro)',
                    color: 'var(--ink50)',
                    flexShrink: 0,
                  }}
                >
                  {t(`quejas.reloj.${e.motivo}.corto`)}
                </span>
              )}
            </div>
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-meta)', color: 'var(--ok-ink)', textAlign: 'right' }}
            >
              {e.medible ? `✓ ${e.resueltas}` : '—'}
            </div>
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-meta)', color: 'var(--civic)', textAlign: 'right' }}
            >
              {e.medible ? `⏳ ${e.pendientes}` : '—'}
            </div>
            <div
              className="mono"
              style={{
                fontSize: 'var(--fs-meta)',
                color: e.medible && e.silencios > 0 ? 'var(--crit)' : 'var(--ink50)',
                textAlign: 'right',
              }}
            >
              {e.medible ? `⚠ ${e.silencios}` : '—'}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          marginTop: 10,
          lineHeight: 1.5,
        }}
      >
        {/* La leyenda de los símbolos sólo si hay alguna fila que los use: una
            clave de ✓ ⏳ ⚠ sobre una tabla entera de «—» explica lo que no está. */}
        {entries.some((e) => e.medible) && (
          <>
            ✓ resueltas · ⏳ pendientes (capturadas + registradas + en trámite) · ⚠ silencios
            (&gt;plazo LPACAP sin respuesta).{' '}
          </>
        )}
        Las quejas se asignan al área municipal competente automáticamente; el responsable político
        figura como titular de esa área.
        {motivos.map((m) => (
          <div key={m} style={{ marginTop: 6 }}>
            <span className="mono">—</span> {t(`quejas.reloj.${m}`)}
          </div>
        ))}
      </div>
    </Card>
  )
}

function StateBreakdown({ byState, total }) {
  const etiqueta = useEtiquetasDeQueja()
  if (total === 0) return null
  const order = [
    'capturada',
    'apoyada_verificada',
    'registrada',
    'notificada_10d',
    'en_tramite',
    'resuelta',
    'silencio_negativo',
    'escalada_sindic',
    'cerrada_no_registrada',
  ]
  const max = Math.max(...Object.values(byState || {}), 1)
  return (
    <Card>
      <SectionHead eyebrow="Estado legal" title="Ciclo de vida LPACAP" />
      <div style={{ marginTop: 12 }}>
        {order.map((s) => {
          const n = byState?.[s] ?? 0
          if (n === 0) return null
          const tone = STATE_TONE[s] || 'neutral'
          const color =
            tone === 'ok'
              ? 'var(--ok)'
              : tone === 'warn'
                ? 'var(--warn)'
                : tone === 'crit'
                  ? 'var(--crit)'
                  : tone === 'civic'
                    ? 'var(--civic)'
                    : tone === 'intel'
                      ? 'var(--civic)'
                      : 'var(--ink50)'
          return <Bar key={s} label={etiqueta.estado(s)} n={n} max={max} color={color} />
        })}
      </div>
    </Card>
  )
}

function CategoryBreakdown({ byCategory }) {
  const etiqueta = useEtiquetasDeQueja()
  const entries = Object.entries(byCategory || {}).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  const max = Math.max(...entries.map((e) => e[1]))
  return (
    <Card>
      <SectionHead eyebrow="Qué se reporta" title="Categorías" />
      <div style={{ marginTop: 12 }}>
        {entries.map(([cat, n]) => (
          <Bar key={cat} label={etiqueta.categoria(cat)} n={n} max={max} color="var(--civic)" />
        ))}
      </div>
    </Card>
  )
}

function NeighborhoodBreakdown({ byNeighborhood }) {
  const entries = Object.entries(byNeighborhood || {}).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  const max = Math.max(...entries.map((e) => e[1]))
  return (
    <Card>
      <SectionHead eyebrow="Dónde pasa" title="Barrios" />
      <div style={{ marginTop: 12 }}>
        {entries.map(([slug, n]) => (
          <Bar key={slug} label={prettyNeighborhood(slug)} n={n} max={max} color="var(--ok)" />
        ))}
      </div>
    </Card>
  )
}

/**
 * Los días que dura el plazo de ESA queja, leídos del enrutador.
 *
 * Eran los mismos 30 y 90 escritos a mano que tenía la ficha, y la norma los
 * fija en meses (art. 21.3 LPACAP y art. 20 de la Ley 19/2013), que de fecha a
 * fecha son 90 o 91 días según cuándo se registre. Aquí el número decide qué
 * quejas se llaman urgentes, así que la desviación no es sólo un rótulo.
 *
 * Y lo que queda, con la cuenta del enrutador: días del calendario de la sede y
 * el último entero. Aquí se contaban tandas de 24 horas desde la marca leída en
 * hora local, y la lista pintaba «Silencio» o lo callaba según la hora del
 * registro: registrada a las 00:30 del 31 de enero en Madrid, el 1 de mayo, con
 * el plazo vencido, decía «0d» y no «Silencio».
 *
 * El último día es el prorrogado si caía en inhábil (art. 30.5). Si el plazo
 * acaba en un año sin calendario de inhábiles, no hay cuenta (`sinCalendario`
 * dice qué año falta): la lista no puede pintar «Silencio», y tampoco callarla,
 * así que su parte consumida se mide contra el día nominal, que es lo que es
 * seguro que dura como poco.
 */
function relojDeQueja(q, now) {
  const reloj = relojDelPlazo(plazoDeResolucion(q.service_code), q.registered_at, now)
  if (reloj.cuenta === 'calculada') {
    return { plazo: reloj.dias, quedan: reloj.quedan, sinCalendario: null }
  }
  if (reloj.cuenta === 'sin-calendario') {
    const transcurridos = diasTranscurridos(q.registered_at, now)
    return {
      plazo: transcurridos + reloj.quedanAlNominal,
      quedan: reloj.quedanAlNominal,
      sinCalendario: reloj.anio,
    }
  }
  // Sin una fecha de registro que se pueda leer no hay plazo que medir.
  return { plazo: null, quedan: null, sinCalendario: null }
}

function ReadyToEscalate({ items }) {
  const etiqueta = useEtiquetasDeQueja()
  const now = Date.now()
  const urgent = (items || [])
    .filter(
      (q) =>
        q.registered_at &&
        (q.status === 'registrada' ||
          q.status === 'notificada_10d' ||
          q.status === 'en_tramite' ||
          q.status === 'silencio_negativo'),
    )
    .map((q) => ({ q, ...relojDeQueja(q, now) }))
    // Sin una fecha de registro que se pueda leer no hay plazo que medir.
    .filter(({ plazo, quedan }) => plazo != null && quedan != null)
    .map((r) => ({ ...r, pct: r.plazo > 0 ? (r.plazo - r.quedan) / r.plazo : 0 }))
    .filter(({ pct }) => pct >= 0.8) // ≥80% of legal plazo consumed
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10)

  if (urgent.length === 0) return null

  return (
    <Card style={{ marginTop: 14, borderLeft: '3px solid var(--warn)' }}>
      <SectionHead
        eyebrow="Acción urgente · moderador"
        title="Quejas cerca de o en silencio administrativo"
      />
      <div
        style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', marginTop: 4, lineHeight: 1.5 }}
      >
        Quejas registradas en sede cuyo plazo LPACAP lleva ≥80% consumido. Candidatas para{' '}
        <code>/escalar Q-XXXX</code> si no llega respuesta antes del vencimiento — se generará el
        template para el Síndic de Greuges CV.
      </div>
      <div style={{ marginTop: 10 }}>
        {urgent.map(({ q, plazo, quedan, pct, sinCalendario }) => {
          const remaining = Math.max(0, quedan)
          // Sin calendario del año no se sabe si el plazo venció: nunca «Silencio».
          const overBy = sinCalendario ? 0 : Math.max(0, -quedan)
          const tone = sinCalendario ? 'neutral' : overBy > 0 ? 'crit' : 'warn'
          return (
            <Link
              key={q.service_request_id}
              to={`/quejas/${q.service_request_id.toLowerCase()}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'min-content 1fr min-content min-content',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px dotted var(--border2)',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                {q.service_request_id}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 'var(--fs-aux)',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {q.description}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
                >
                  {etiqueta.categoria(q.service_code)}
                  {q.concejalia_area ? ' · ' + q.concejalia_area : ''}
                  {sinCalendario
                    ? ` · sin calendario de días inhábiles de ${sinCalendario}`
                    : ' · plazo ' + plazo + ' días'}
                </div>
              </div>
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-meta)',
                  color: overBy > 0 ? 'var(--crit-ink)' : 'var(--warn-ink)',
                  fontWeight: 700,
                  textAlign: 'right',
                }}
              >
                {sinCalendario ? '—' : overBy > 0 ? `+${overBy}d` : `${remaining}d`}
              </span>
              <Pill tone={tone} size="xs">
                {sinCalendario
                  ? 'Sin calendario'
                  : overBy > 0
                    ? 'Silencio'
                    : `${Math.round(pct * 100)}%`}
              </Pill>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}

function TopPending({ items }) {
  const etiqueta = useEtiquetasDeQueja()
  const pending = (items || [])
    .filter((q) =>
      ['capturada', 'apoyada_verificada', 'registrada', 'notificada_10d', 'en_tramite'].includes(
        q.status,
      ),
    )
    .sort((a, b) => b.apoyos - a.apoyos)
    .slice(0, 10)
  if (pending.length === 0) return null
  return (
    <Card style={{ marginTop: 14 }}>
      <SectionHead eyebrow="Presión vecinal · top 10" title="Quejas pendientes con más apoyos" />
      <div style={{ marginTop: 10 }}>
        {pending.map((q) => (
          <Link
            key={q.service_request_id}
            to={`/quejas/${q.service_request_id.toLowerCase()}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'min-content 1fr min-content min-content',
              alignItems: 'center',
              gap: 12,
              padding: '10px 0',
              borderBottom: '1px dotted var(--border2)',
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              {q.service_request_id}
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 'var(--fs-aux)',
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {q.description}
              </div>
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
              >
                {etiqueta.categoria(q.service_code)}
                {q.address_string ? ` · ${prettyNeighborhood(q.address_string)}` : ''}
              </div>
            </div>
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-meta)',
                color: 'var(--civic)',
                fontWeight: 700,
                textAlign: 'right',
              }}
            >
              👍 {q.apoyos}
            </span>
            <Pill tone={STATE_TONE[q.status] || 'ghost'} size="xs">
              {etiqueta.estado(q.status)}
            </Pill>
          </Link>
        ))}
      </div>
    </Card>
  )
}

export default function QuejasDashboard() {
  const t = useT()
  useDocumentTitle(t('dashboard.title'))
  const { loading, error, data } = useQuejas()
  const { data: officials } = useOfficials()

  if (loading) {
    return (
      <div
        className="cp-page"
        style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}
      >
        <div style={{ color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>Cargando feed…</div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div
        className="cp-page"
        style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}
      >
        <Card>
          <div style={{ color: 'var(--warn-ink)', fontSize: 'var(--fs-aux)' }}>
            No se pudo cargar /data/quejas.json.
          </div>
        </Card>
      </div>
    )
  }

  const items = data.items || []
  const stats = data.stats || {
    total: 0,
    byState: {},
    byNeighborhood: {},
    byCategory: {},
    byConcejal: {},
  }
  const resueltas = stats.byState.resuelta || 0
  const silencios = (stats.byState.silencio_negativo || 0) + (stats.byState.escalada_sindic || 0)
  // See the same guard on /quejas. The LPACAP clock starts at registration in
  // sede, so with nothing registered this counter is pinned at 0 by arithmetic.
  // Worse here than there: the tile painted that 0 GREEN, turning "we have not
  // measured anything yet" into a clean bill of health for the Ayuntamiento.
  const conRelojEnMarcha = items.filter((q) => q.registered_at).length
  const pendientes =
    (stats.byState.capturada || 0) +
    (stats.byState.apoyada_verificada || 0) +
    (stats.byState.registrada || 0) +
    (stats.byState.notificada_10d || 0) +
    (stats.byState.en_tramite || 0)
  const resolucionPct = stats.total > 0 ? Math.round((resueltas / stats.total) * 100) : 0

  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}
    >
      <div style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {t('dashboard.eyebrow')}
        </div>
        <div
          style={{
            fontSize: 'var(--fs-page)',
            fontWeight: 700,
            letterSpacing: '-.015em',
            marginTop: 2,
          }}
        >
          {t('dashboard.title')}
        </div>
        <div
          style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', marginTop: 4, maxWidth: 720 }}
        >
          Vista agregada de todas las quejas capturadas vía{' '}
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--civic)' }}
          >
            Telegram
          </a>
          . Métricas LPACAP, concejalía responsable y presión vecinal.{' '}
          <Link
            to="/quejas"
            style={{ color: 'var(--civic)', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            ← Feed público
          </Link>
        </div>
      </div>

      {stats.total === 0 ? (
        <Card>
          <SectionHead eyebrow="Sin datos" title="El canal está abierto, aún no hay quejas" />
          <div
            style={{
              fontSize: 'var(--fs-body)',
              color: 'var(--ink70)',
              marginTop: 8,
              lineHeight: 1.55,
            }}
          >
            Este dashboard muestra métricas cuando haya quejas registradas. Presenta la primera vía{' '}
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--civic)' }}
            >
              @munigraph_bot
            </a>{' '}
            con el comando <code>/queja</code>.
          </div>
        </Card>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 14,
            }}
          >
            <StatTile label="Total quejas" value={stats.total} sub="desde el inicio del canal" />
            <StatTile
              label="Resueltas"
              value={resueltas}
              tone="ok"
              sub={`${resolucionPct}% del total`}
            />
            <StatTile
              label="Pendientes"
              value={pendientes}
              tone="civic"
              sub="en trámite o capturadas"
            />
            <StatTile
              label="Silencios + escaladas"
              value={conRelojEnMarcha === 0 ? '—' : silencios}
              tone={conRelojEnMarcha === 0 ? 'ghost' : silencios > 0 ? 'crit' : 'ok'}
              sub={
                conRelojEnMarcha === 0
                  ? 'ninguna queja registrada en sede todavía'
                  : `>plazo LPACAP · sobre ${conRelojEnMarcha} registrada${conRelojEnMarcha === 1 ? '' : 's'}`
              }
            />
          </div>

          {/* El `min(…, 100%)` es para la columna que queda sola: sin él
              conservaba sus 320 px en una caja de 272 (320 px de pantalla). */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
              gap: 14,
            }}
          >
            <StateBreakdown byState={stats.byState} total={stats.total} />
            <CategoryBreakdown byCategory={stats.byCategory} />
            <NeighborhoodBreakdown byNeighborhood={stats.byNeighborhood} />
          </div>

          <ReadyToEscalate items={items} />
          <SlaPanel quejas={data} officials={officials} />
          <TopPending items={items} />
        </>
      )}
    </div>
  )
}
