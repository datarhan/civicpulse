import { Link } from 'react-router-dom'
import { useTenders, formatDate as formatTenderDate } from '../../../hooks/useTenders'
import { contractAmount } from '../../../lib/tender-geo'
import { isCommittedContract, isConcession, contractTermYears } from '../../../lib/contract-status'
import { yearSpan } from '../../../lib/year-span'
import { useParticipa, KIND_ICON } from '../../../hooks/useParticipa'
import { usePress, timeAgo as pressTimeAgo } from '../../../hooks/usePress'
import { useEvents, upcomingEvents, formatEventWhen } from '../../../hooks/useEvents'
import { useEmpleo } from '../../../hooks/useEmpleo'
import { PALETTE } from '../tokens'
import { SectionHeader } from '../SectionHeader'
import { ExtLink } from '../../../components/Primitives'
import { RetiredSourceNote } from '../../../components/RetiredSourceNote'
import { rellena } from '../../../lib/formatters'
import { rotuloDe, useLocale } from '../../../i18n'

/** Día y mes corto, en el idioma de la interfaz: «15 sept» salía igual en valencià. */
const diaYMes = (iso, locale) =>
  new Date(iso).toLocaleDateString(locale === 'ca' ? 'ca-ES' : 'es-ES', {
    day: 'numeric',
    month: 'short',
  })

export function EmpleoBlockD() {
  const { t, locale } = useLocale()
  const { loading, error, data } = useEmpleo()
  if (loading || error || !data) return null
  const items = data.items || []
  if (items.length === 0) return null
  // Closing-soon first (offers with a deadline), else newest.
  const withDeadline = items.filter((o) => o.deadline)
  const picks = (withDeadline.length ? withDeadline : items)
    .slice()
    .sort((a, b) => (a.deadline && b.deadline ? a.deadline.localeCompare(b.deadline) : 0))
    .slice(0, 3)
  return (
    <div>
      <SectionHeader
        tone="empleo"
        title={t('landing.section.empleo')}
        meta={`${data.stats.openTotal} ${t('landing.ofertas')}`}
      />
      {picks.map((o, i) => {
        const muni = (o.detail && o.detail.municipio) || o.location || ''
        return (
          <div
            key={o.id}
            style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair }}
          >
            <div
              style={{
                fontSize: 'var(--fs-aux)',
                fontWeight: 600,
                lineHeight: 1.35,
                marginBottom: 2,
              }}
            >
              <Link to={`/empleo/${o.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                {o.titulo}
              </Link>
            </div>
            <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: PALETTE.ink60 }}>
              {muni.length > 30 ? muni.slice(0, 30) + '…' : muni}
              {o.deadline
                ? ` · ${rellena(t('landing.empleo.cierra'), { fecha: diaYMes(o.deadline, locale) })}`
                : ''}
            </div>
          </div>
        )
      })}
      <Link
        to="/empleo"
        style={{
          display: 'inline-block',
          marginTop: 6,
          fontSize: 'var(--fs-micro)',
          color: PALETTE.civic,
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        {t('landing.empleo.all')}
      </Link>
    </div>
  )
}

export function LiveContracts() {
  const { t, locale } = useLocale()
  const { loading, error, data } = useTenders()
  if (loading || error || !data) return null
  const recent = (data.top?.recentAwarded || []).slice(0, 4)
  if (recent.length === 0) return null

  const fmtEur = (n) =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
      notation: n >= 100_000 ? 'compact' : 'standard',
    }).format(n)

  // The period, derived from the same rows the counter counts. The four
  // contracts listed below are the MOST RECENT awards — all of them July 2026 —
  // so an undated «698 · 68 M€» beside them reads as this summer's spending
  // rather than as nine exercises of accumulation. This block is the third
  // place on the landing to publish that pair, after AlcaldeBox and KpiStrip;
  // fixing the other two twice is how the defect survived two review rounds.
  const awardedYears = yearSpan(
    (data.contracts ?? []).filter(isCommittedContract).map((c) => c.awardDate),
  )

  return (
    <div>
      <SectionHeader
        tone="contratos"
        title={t('landing.section.contratos')}
        // awardedContracts, not totalContracts. Under a heading that says
        // ADJUDICADOS this paired the count of ALL 804 contracts — void,
        // abandoned and revoked included — with the money of only the 698
        // committed ones, while the same screen showed 698 elsewhere. Found by
        // the reader-review agent, on a page a human had already audited.
        //
        // The span rides in this VISIBLE string, never in a `title` tooltip: a
        // hover carries nothing to a phone, to a scanning reader, or to the
        // surface reviewer's `innerText`, so a period hidden there is a fix
        // that cannot be observed — the front-end twin of a green test that
        // measured nothing.
        meta={`${data.stats.awardedContracts} · ${fmtEur(data.stats.awardedTotalEuros)}`}
      />
      {awardedYears && (
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-aux)',
            color: PALETTE.ink60,
            marginTop: -6,
            marginBottom: 8,
            lineHeight: 1.35,
          }}
        >
          {t('landing.contratos.acumulado')} {awardedYears} · {t('landing.contratos.recientes')}
        </div>
      )}
      {recent.map((c, i) => (
        <div
          key={c.id}
          style={{
            padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                color: PALETTE.accent,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {/* La categoría de Gobierto es un token en inglés («architecture»): se
                  rotula por catálogo, y sin ella, el tipo de contrato. */}
              {(c.categoryTitle &&
                rotuloDe(t, `contrato.categoria.${c.categoryTitle}`, c.categoryTitle)) ||
                (c.contractType &&
                  rotuloDe(t, `contrato.tipo.${c.contractType}`, c.contractType)) ||
                t('landing.contratos.sinCategoria')}
            </span>
            <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: PALETTE.ink50 }}>
              {formatTenderDate(c.awardDate, locale)}
            </span>
          </div>
          <div
            style={{
              fontSize: 'var(--fs-aux)',
              fontWeight: 600,
              lineHeight: 1.35,
              marginBottom: 2,
            }}
          >
            <ExtLink href={c.permalink} style={{ color: 'inherit', textDecoration: 'none' }}>
              {c.title.length > 100 ? c.title.slice(0, 100) + '…' : c.title}
            </ExtLink>
          </div>
          <div
            style={{ display: 'flex', gap: 10, fontSize: 'var(--fs-micro)', color: PALETTE.ink60 }}
          >
            <span>{c.contractor || t('landing.contratos.sinAdjudicatario')}</span>
            <span
              style={{ marginLeft: 'auto', fontWeight: 700, color: PALETTE.ink }}
              className="mono"
            >
              {fmtEur(contractAmount(c))}
            </span>
          </div>
          {/* Una concesión se adjudica por TODO su plazo de una vez, así que su
              importe no es comparable con el de las filas que tiene al lado ni
              con el presupuesto anual impreso en esta misma pantalla. Sin esta
              línea, la del agua —55,7 M€ entre una de 7.500 € y otra de 418 k€,
              todas del mismo mes— se lee como un compromiso puntual reciente
              1,34 veces mayor que el presupuesto del año.

              Los años se calculan de `duration`, nunca se escriben: es
              exactamente el número que alguien teclea una vez y se queda viejo
              cuando el registro cambia una fecha. Mismo convenio que
              `committedAwardYearSpan` y que la ficha de /eficiencia. */}
          {isConcession(c) && (
            <div
              className="cp-concesion-nota"
              style={{
                marginTop: 4,
                fontSize: 'var(--fs-micro)',
                color: PALETTE.ink60,
                lineHeight: 1.35,
              }}
            >
              {contractTermYears(c)
                ? rellena(t('landing.contratos.concesionAnios'), { anios: contractTermYears(c) })
                : t('landing.contratos.concesion')}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function ParticipaBlockD() {
  const { t, locale } = useLocale()
  const { loading, error, data } = useParticipa()
  if (loading || error || !data) return null
  const items = (data.items || []).slice(0, 3)
  if (items.length === 0) return null
  return (
    <div>
      <SectionHeader
        tone="participa"
        title={t('landing.section.participa')}
        meta={data.stats.total}
      />
      <RetiredSourceNote upstream={data.upstream} />
      {items.map((it, i) => (
        <div
          key={it.id}
          style={{
            display: 'flex',
            gap: 10,
            padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair,
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--r-input)',
              background: it.kind === 'survey' ? 'rgba(14,91,98,.12)' : 'rgba(22,163,74,.12)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 'var(--fs-body)',
              flexShrink: 0,
            }}
          >
            {KIND_ICON[it.kind] || '📢'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--fs-aux)',
                fontWeight: 600,
                lineHeight: 1.3,
                marginBottom: 2,
              }}
            >
              <ExtLink href={it.link} style={{ color: 'inherit', textDecoration: 'none' }}>
                {it.title.length > 80 ? it.title.slice(0, 80) + '…' : it.title}
              </ExtLink>
            </div>
            <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: PALETTE.ink60 }}>
              {diaYMes(it.date, locale)} · {it.categories[0] || t('landing.participa.aviso')}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function PressBlockD() {
  const { t, locale } = useLocale()
  const { loading, error, data } = usePress()
  if (loading || error || !data) return null
  const items = (data.items || []).slice(0, 5)
  if (items.length === 0) return null
  return (
    <div>
      <SectionHeader
        tone="prensa"
        title={`${t('landing.section.prensa')} · ${data.stats.total} ${t('landing.titulares')}`}
        meta={`${data.stats.sources} ${t('landing.medios')}`}
      />
      {items.map((p, i) => (
        <div
          key={p.id}
          style={{
            padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                color: p.official ? PALETTE.civic : PALETTE.accent,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {p.source}
            </span>
            {p.official && (
              <span
                className="mono"
                title={t('landing.prensa.oficial.title')}
                style={{
                  fontSize: 'var(--fs-micro)',
                  fontWeight: 700,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: 'white',
                  background: PALETTE.civic,
                  padding: '1px 5px',
                  borderRadius: 'var(--r-input)',
                }}
              >
                {t('landing.prensa.oficial')}
              </span>
            )}
            <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: PALETTE.ink50 }}>
              {pressTimeAgo(p.date, { t, locale })}
            </span>
          </div>
          <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 600, lineHeight: 1.35 }}>
            <ExtLink href={p.link} style={{ color: 'inherit', textDecoration: 'none' }}>
              {p.title.length > 110 ? p.title.slice(0, 110) + '…' : p.title}
            </ExtLink>
          </div>
        </div>
      ))}
    </div>
  )
}

export function EventsBlockD() {
  const { t, locale } = useLocale()
  const { loading, error, data } = useEvents()
  if (loading || error || !data) return null
  const items = upcomingEvents(data).slice(0, 4)
  if (items.length === 0) return null
  return (
    <div>
      <SectionHeader
        tone="eventos"
        title={t('landing.section.eventos')}
        meta={data.stats?.upcoming ?? items.length}
      />
      {items.map((e, i) => (
        <div
          key={e.id}
          style={{
            display: 'flex',
            gap: 10,
            padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair,
            alignItems: 'flex-start',
          }}
        >
          <div
            className="mono"
            style={{
              flexShrink: 0,
              width: 46,
              fontSize: 'var(--fs-micro)',
              fontWeight: 700,
              color: PALETTE.civic,
              lineHeight: 1.2,
              textTransform: 'uppercase',
            }}
          >
            {formatEventWhen(e.eventDate, e.eventDateText, locale)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--fs-aux)',
                fontWeight: 600,
                lineHeight: 1.3,
                marginBottom: 2,
              }}
            >
              <ExtLink href={e.link} style={{ color: 'inherit', textDecoration: 'none' }}>
                {e.title.length > 80 ? e.title.slice(0, 80) + '…' : e.title}
              </ExtLink>
            </div>
            {e.eventDateText && (
              <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: PALETTE.ink60 }}>
                {e.eventDateText}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
