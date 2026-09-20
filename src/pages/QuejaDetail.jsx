import { Link, useParams } from 'react-router-dom'
import { Card, ExtLink, Pill, SectionHead, ShareWA } from '../components/Primitives'
import { useQuejas, useQuejaResponses, STATE_TONE, prettyNeighborhood } from '../hooks/useQuejas'
import {
  useQuejaContractRelations,
  useQuejaRelationApprovals,
  relationsForQueja,
} from '../hooks/useQuejaContractRelations'
import { useOfficials, partyColor } from '../hooks/useOfficials'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fmtDateLong, rellena } from '../lib/formatters'
import { conHuecos } from '../lib/huecos'
import { rotuloDe, useLocale } from '../i18n'
import { CLAVE_RELACION } from '../scraper/relation-labels'
import { diasDePlazo, plazoDeResolucion } from '../scraper/queja-router'
import { DEPARTMENT_LABEL } from '../scraper/departments'

const SINDIC_PORTAL = 'https://www.elsindic.com/es/presenta-una-queja'

function fmt(iso, idioma) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(idioma === 'ca' ? 'ca-ES' : 'es-ES', {
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

function fmtDate(iso, idioma) {
  return fmtDateLong(iso, idioma) || '—'
}

function daysSince(iso) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

/**
 * El plazo máximo de resolución, leído del enrutador y no copiado de él.
 *
 * Esto eran dos números a mano —30 y 90— que repetían los de `profileFor`, y
 * además los daban por días cuando la norma los fija en MESES: art. 21.3
 * LPACAP «tres meses», art. 20 de la Ley 19/2013 «un mes». El art. 30.4 manda
 * contar los meses de fecha a fecha, así que tres meses duran 90 o 91 días
 * según cuándo empiecen y el contador se desviaba por ahí.
 *
 * Devuelve las dos cosas porque la ficha necesita las dos: el plazo se PUBLICA
 * en meses, que es lo que dice la ley, y se CUENTA en los días que de verdad
 * tiene esa queja.
 */
function plazoFor(category, registeredAt) {
  const limite = plazoDeResolucion(category)
  return {
    limite,
    dias: registeredAt ? diasDePlazo(limite, registeredAt) : null,
  }
}

/** «3 meses» / «1 mes», con el catálogo poniendo las palabras. */
function plazoHumano(t, limite) {
  return limite.amount === 1
    ? t('quejas.detalle.reloj.mes')
    : rellena(t('quejas.detalle.reloj.meses'), { n: limite.amount })
}

function TimelineItem({ date, label, tone = 'neutral', detail, idioma }) {
  const color =
    tone === 'ok'
      ? 'var(--ok)'
      : tone === 'warn'
        ? 'var(--warn)'
        : tone === 'crit'
          ? 'var(--crit)'
          : tone === 'civic'
            ? 'var(--civic)'
            : 'var(--ink50)'
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 12px 1fr',
        gap: 12,
        alignItems: 'flex-start',
        padding: '10px 0',
      }}
    >
      <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
        {fmtDate(date, idioma)}
      </div>
      <div style={{ position: 'relative', height: '100%' }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            position: 'absolute',
            top: 6,
            left: 0,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 16,
            bottom: -10,
            left: 3.5,
            width: 1,
            background: 'var(--border2)',
          }}
        />
      </div>
      <div>
        <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 500 }}>{label}</div>
        {detail && (
          <div
            className="mono"
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
          >
            {detail}
          </div>
        )}
      </div>
    </div>
  )
}

function CorrelationsCard({ quejaId }) {
  const { locale, t } = useLocale()
  const { data } = useQuejaContractRelations()
  const { data: approvals } = useQuejaRelationApprovals()
  const items = relationsForQueja(data, quejaId, approvals?.approvals)
  if (items.length === 0) return null
  return (
    <Card style={{ marginTop: 14, borderLeft: '3px solid var(--intel)' }}>
      <SectionHead
        eyebrow={t('quejas.detalle.relacion.eyebrow')}
        title={t('quejas.detalle.relacion.titulo')}
      />
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          marginTop: 6,
          marginBottom: 10,
          lineHeight: 1.5,
        }}
      >
        {conHuecos(t('quejas.detalle.relacion.nota'), {
          '{zona}': <strong>{t('quejas.detalle.relacion.zona')}</strong>,
          '{materia}': <strong>{t('quejas.detalle.relacion.materia')}</strong>,
          '{no}': <strong>{t('quejas.detalle.relacion.no')}</strong>,
        })}
      </div>
      {items.map((l, i) => {
        const place = l.signals?.place?.slug
        const dept = l.signals?.department?.slug
        // El motor guarda slugs: el lugar se escribe como en el resto de la ficha, y la
        // materia con el nombre del departamento —o de la categoría, cuando el motor cae
        // al código de la queja— en el idioma de la interfaz.
        const materia = dept
          ? (DEPARTMENT_LABEL[dept]?.[locale] ?? rotuloDe(t, `quejas.categoria.${dept}`, dept))
          : null
        return (
          <div
            key={i}
            style={{
              padding: '10px 0',
              borderTop: i === 0 ? 'none' : '1px dashed var(--border2)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                marginBottom: 4,
                flexWrap: 'wrap',
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  padding: '1px 6px',
                  borderRadius: 'var(--r-input)',
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                  fontWeight: 700,
                  background: 'var(--ok-soft)',
                  color: 'var(--ok-ink)',
                }}
                title={t('quejas.detalle.relacion.pastilla')}
              >
                {rotuloDe(
                  t,
                  `contrato.relacion.${CLAVE_RELACION[l.relationLabel]}`,
                  l.relationLabel,
                )}
              </span>
            </div>
            <div
              style={{
                fontSize: 'var(--fs-aux)',
                color: 'var(--ink70)',
                marginBottom: 4,
                lineHeight: 1.4,
              }}
            >
              {place && (
                <>
                  {t('quejas.detalle.relacion.zona')}
                  {': '}
                  <strong>{prettyNeighborhood(place)}</strong>
                </>
              )}
              {place && materia && ' · '}
              {materia && (
                <>
                  {t('quejas.detalle.relacion.materia')}
                  {': '}
                  <strong>{materia}</strong>
                </>
              )}
            </div>
            <ExtLink
              href={l.tenderPermalink}
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--civic)',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >
              {t('quejas.detalle.relacion.verContrato')}
            </ExtLink>
          </div>
        )
      })}
    </Card>
  )
}

export default function QuejaDetail() {
  const { locale, t } = useLocale()
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
      <div
        className="cp-page"
        style={{ padding: '24px 24px 48px', maxWidth: 900, margin: '0 auto' }}
      >
        <div style={{ color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>
          {t('common.loading')}
        </div>
      </div>
    )
  }

  if (!queja) {
    return (
      <div
        className="cp-page"
        style={{ padding: '24px 24px 48px', maxWidth: 900, margin: '0 auto' }}
      >
        <Card>
          <SectionHead
            eyebrow={t('quejas.detalle.noEncontrada.eyebrow')}
            title={rellena(t('quejas.detalle.noEncontrada.titulo'), { id })}
          />
          <div style={{ fontSize: 'var(--fs-body)', color: 'var(--ink70)', marginTop: 8 }}>
            {t('quejas.detalle.noEncontrada.texto')}
          </div>
          <div style={{ marginTop: 12 }}>
            <Link to="/quejas" style={{ color: 'var(--civic)' }}>
              {t('quejas.detalle.noEncontrada.volver')}
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  const category = queja.service_code
  const categoria = rotuloDe(t, `quejas.categoria.${category}`, category)
  const estado = rotuloDe(t, `quejas.estado.${queja.status}`, queja.status)
  const plazo = plazoFor(category, queja.registered_at)
  const registeredDays = daysSince(queja.registered_at)
  const diasRestantes =
    registeredDays != null && plazo.dias != null ? plazo.dias - registeredDays : null

  // Synthetic timeline derived from the row's timestamps + state.
  const timeline = []
  timeline.push({
    date: queja.requested_datetime,
    label: t('quejas.detalle.hito.capturada'),
    tone: 'neutral',
    detail: rellena(t('quejas.detalle.hito.capturada.detalle'), {
      barrio: prettyNeighborhood(queja.address_string) || '—',
    }),
  })
  if (queja.apoyos >= 10) {
    timeline.push({
      // `updated_datetime` es la última vez que la fila cambió por cualquier
      // motivo, no cuándo llegó a los apoyos: en una queja ya registrada es la
      // fecha del registro, puesta encima del hito anterior. Sólo coincide
      // mientras ése siga siendo su estado, así que fuera de ahí no se fecha.
      date: queja.status === 'apoyada_verificada' ? queja.updated_datetime : null,
      label: t('quejas.detalle.hito.verificada'),
      tone: 'civic',
      detail: rellena(t('quejas.detalle.hito.verificada.detalle'), { n: queja.apoyos }),
    })
  }
  if (queja.registered_at) {
    timeline.push({
      date: queja.registered_at,
      label: t('quejas.detalle.hito.registrada'),
      tone: 'civic',
      detail: rellena(t('quejas.detalle.hito.registrada.detalle'), {
        asiento: queja.registro_entry_number || '—',
        plazo: plazoHumano(t, plazo.limite),
      }),
    })
  }
  if (queja.status === 'silencio_negativo') {
    timeline.push({
      date: queja.updated_datetime,
      label: t('quejas.detalle.hito.silencio'),
      tone: 'warn',
      detail: t('quejas.detalle.hito.silencio.detalle'),
    })
  }
  if (queja.status === 'escalada_sindic') {
    timeline.push({
      date: queja.updated_datetime,
      label: t('quejas.detalle.hito.sindic'),
      tone: 'crit',
      detail: t('quejas.detalle.hito.sindic.detalle'),
    })
  }
  if (queja.status === 'resuelta') {
    timeline.push({
      date: queja.updated_datetime,
      label: t('quejas.detalle.hito.resuelta'),
      tone: 'ok',
    })
  }

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 10 }}>
        <Link to="/quejas" style={{ fontSize: 'var(--fs-meta)', color: 'var(--civic)' }}>
          {t('quejas.detalle.volver')}
        </Link>
      </div>

      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            marginBottom: 10,
          }}
        >
          <div>
            <div
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                letterSpacing: '.08em',
                textTransform: 'uppercase',
              }}
            >
              {rellena(t('quejas.detalle.eyebrow'), { id: queja.service_request_id })}
            </div>
            <div
              style={{
                fontSize: 'var(--fs-card)',
                fontWeight: 700,
                letterSpacing: '-.01em',
                marginTop: 4,
              }}
            >
              {queja.description.split('\n')[0].slice(0, 120)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <ShareWA
              text={`${rellena(t('quejas.detalle.compartir'), {
                id: queja.service_request_id,
                categoria,
                estado,
              })}\n${queja.description.split('\n')[0].slice(0, 140)}`}
            />
            <Pill tone={STATE_TONE[queja.status] || 'ghost'} size="xs">
              {estado}
            </Pill>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            fontSize: 'var(--fs-meta)',
            color: 'var(--ink50)',
          }}
        >
          <span>📂 {categoria}</span>
          {queja.address_string && <span>📍 {prettyNeighborhood(queja.address_string)}</span>}
          {queja.concejalia_area && <span>🏛 {queja.concejalia_area}</span>}
          <span>👍 {rellena(t('quejas.detalle.apoyos'), { n: queja.apoyos })}</span>
        </div>

        {concejal && (
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 0',
              borderTop: '1px solid var(--border2)',
            }}
          >
            {concejal.photoUrl && (
              <img
                src={concejal.photoUrl}
                alt={concejal.name}
                width={38}
                height={38}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 'var(--r-input)',
                  objectFit: 'cover',
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                }}
              >
                {t('quejas.detalle.responsable')}
              </div>
              <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600 }}>{concejal.name}</div>
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  background: partyColor(concejal.party),
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: 'var(--r-pill)',
                }}
              >
                {concejal.party}
              </span>
            </div>
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead
          eyebrow={t('quejas.detalle.texto.eyebrow')}
          title={t('quejas.detalle.texto.titulo')}
        />
        <div
          style={{
            fontSize: 'var(--fs-body)',
            lineHeight: 1.55,
            color: 'var(--ink70)',
            marginTop: 8,
            whiteSpace: 'pre-wrap',
          }}
        >
          {queja.description}
        </div>
      </Card>

      {queja.photo && (
        <Card style={{ marginTop: 14 }}>
          <SectionHead
            eyebrow={t('quejas.detalle.foto.eyebrow')}
            title={t('quejas.detalle.foto.titulo')}
          />
          <figure style={{ margin: '10px 0 0' }}>
            <img
              src={queja.photo}
              alt={t('quejas.detalle.foto.alt')}
              loading="lazy"
              style={{
                width: '100%',
                maxHeight: 460,
                objectFit: 'contain',
                borderRadius: 'var(--r-card)',
                border: '1px solid var(--border)',
                background: 'var(--soft)',
              }}
            />
            <figcaption
              style={{
                fontSize: 'var(--fs-aux)',
                color: 'var(--ink50)',
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              {conHuecos(t('quejas.detalle.foto.pie'), {
                '{olvidar}': <code>/olvidar {queja.service_request_id}</code>,
                '{aviso}': (
                  <Link to="/aviso-legal" style={{ color: 'var(--civic)' }}>
                    {t('quejas.detalle.foto.avisoLegal')}
                  </Link>
                ),
              })}
            </figcaption>
          </figure>
        </Card>
      )}

      <CorrelationsCard quejaId={id} />

      {queja.registered_at && queja.status !== 'resuelta' && (
        <Card style={{ marginTop: 14 }}>
          <SectionHead
            eyebrow={t('quejas.detalle.reloj.eyebrow')}
            title={t('quejas.detalle.reloj.titulo')}
          />
          <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
            <div>
              <div
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                }}
              >
                {t('quejas.detalle.reloj.registrada')}
              </div>
              <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, marginTop: 2 }}>
                {fmtDate(queja.registered_at, locale)}
              </div>
            </div>
            <div>
              <div
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                }}
              >
                {t('quejas.detalle.reloj.plazoMaximo')}
              </div>
              <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, marginTop: 2 }}>
                {plazoHumano(t, plazo.limite)}
              </div>
            </div>
            <div>
              <div
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                }}
              >
                {diasRestantes >= 0
                  ? t('quejas.detalle.reloj.restantes')
                  : t('quejas.detalle.reloj.excedidos')}
              </div>
              <div
                style={{
                  fontSize: 'var(--fs-body)',
                  fontWeight: 700,
                  marginTop: 2,
                  color:
                    diasRestantes < 0
                      ? 'var(--crit)'
                      : diasRestantes < 15
                        ? 'var(--warn)'
                        : 'var(--ok)',
                }}
              >
                {diasRestantes >= 0 ? diasRestantes : Math.abs(diasRestantes)}
              </div>
            </div>
            {queja.registro_entry_number && (
              <div>
                <div
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-micro)',
                    color: 'var(--ink50)',
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                  }}
                >
                  {t('quejas.detalle.reloj.asiento')}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 'var(--fs-aux)', fontWeight: 600, marginTop: 2 }}
                >
                  {queja.registro_entry_number}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card style={{ marginTop: 14 }}>
        <SectionHead
          eyebrow={t('quejas.detalle.historial.eyebrow')}
          title={t('quejas.detalle.historial.titulo')}
        />
        <div style={{ marginTop: 10 }}>
          {timeline.map((hito, i) => (
            <TimelineItem key={i} {...hito} idioma={locale} />
          ))}
        </div>
      </Card>

      {qResponses.length > 0 && (
        <Card style={{ marginTop: 14, borderLeft: '3px solid var(--civic)' }}>
          <SectionHead
            eyebrow={t('quejas.detalle.replica.eyebrow')}
            title={t('quejas.detalle.replica.titulo')}
          />
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {qResponses.map((r) => (
              <div
                key={r.id}
                style={{ paddingBottom: 10, borderBottom: '1px dotted var(--border2)' }}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-micro)',
                    color: 'var(--ink50)',
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {r.role} · {r.firmante} · {fmt(r.appliedAt, locale)}
                </div>
                <div
                  style={{
                    fontSize: 'var(--fs-body)',
                    marginTop: 6,
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {r.text}
                </div>
                {r.source_url && (
                  <div style={{ marginTop: 6, fontSize: 'var(--fs-meta)' }}>
                    <ExtLink href={r.source_url} style={{ color: 'var(--civic)' }}>
                      {t('quejas.detalle.replica.fuente')}
                    </ExtLink>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ marginTop: 14 }}>
        <SectionHead
          eyebrow={t('quejas.detalle.acciones.eyebrow')}
          title={t('quejas.detalle.acciones.titulo')}
        />
        <ul
          style={{
            paddingLeft: 20,
            marginTop: 8,
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            lineHeight: 1.6,
          }}
        >
          <li>
            <strong>{t('quejas.detalle.acciones.apoyar')}</strong>{' '}
            {conHuecos(t('quejas.detalle.acciones.apoyar.texto'), {
              '{comando}': <code>/apoyar {queja.service_request_id}</code>,
            })}
          </li>
          {(queja.status === 'silencio_negativo' || queja.status === 'escalada_sindic') && (
            <li>
              <strong>{t('quejas.detalle.acciones.sindic')}</strong>{' '}
              <a
                href={SINDIC_PORTAL}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--civic)' }}
              >
                elsindic.com →
              </a>
            </li>
          )}
          <li>
            <strong>{t('quejas.detalle.acciones.responder')}</strong>{' '}
            {conHuecos(t('quejas.detalle.acciones.responder.texto'), {
              '{aviso}': (
                <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
                  /aviso-legal
                </a>
              ),
            })}
          </li>
        </ul>
      </Card>
    </div>
  )
}
