import { useOfficials, partyColor } from '../../hooks/useOfficials'
import { useTenders, formatDate as formatTenderDate } from '../../hooks/useTenders'
import { usePromises, isPromiseFrozen } from '../../hooks/usePromises'
import { useParticipa, KIND_ICON } from '../../hooks/useParticipa'
import { usePress, timeAgo as pressTimeAgo } from '../../hooks/usePress'
import { useBudget, formatEuros as formatBudgetEuros } from '../../hooks/useBudget'
import { useBdns } from '../../hooks/useBdns'
import { usePlenoAgendas } from '../../hooks/usePlenoAgendas'
import { canonicalizeDepartment, DEPARTMENT_LABEL } from '../../scraper/departments'
import { PALETTE, SERIF, SANS, MONO, fmtDateLong } from './tokens'

function EditorialMasthead({ now }) {
  return (
    <div style={{ marginBottom: 18, borderBottom: '2px solid ' + PALETTE.rule, paddingBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          fontFamily: MONO,
          fontSize: 10.5,
          color: PALETTE.ink60,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        <span>CivicPulse · Boletín</span>
        <span>{fmtDateLong(now)}</span>
      </div>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 34,
          fontWeight: 900,
          letterSpacing: '-.03em',
          lineHeight: 0.95,
        }}
      >
        El Mirador
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: PALETTE.accent,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginTop: 5,
        }}
      >
        Diario cívico · Riba-roja de Túria
      </div>
    </div>
  )
}

function Kicker({ tone = 'ink', children }) {
  const c = {
    ink: PALETTE.ink,
    red: PALETTE.accent,
    navy: PALETTE.accent2,
    green: PALETTE.ok,
    amber: PALETTE.amber,
    gray: PALETTE.ink60,
  }[tone]
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 10,
        color: c,
        fontWeight: 700,
        letterSpacing: '.14em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  )
}

function QuejaCTA() {
  // eslint-disable-next-line no-unused-vars
  const LOOM_URL = '' // TODO operator: paste Loom share URL here to enable the embed
  return (
    <div
      style={{
        marginTop: 10,
        padding: '14px 16px',
        background: '#EEF4FF',
        border: '1px solid #C7D7F8',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          color: PALETTE.civic,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        Voz ciudadana · canal directo
      </div>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 22,
          lineHeight: 1.15,
          fontWeight: 600,
          letterSpacing: '-.01em',
          color: PALETTE.ink,
          marginBottom: 10,
        }}
      >
        Denuncia un bache en 10 segundos.
      </div>
      <div style={{ fontSize: 12.5, color: PALETTE.ink60, marginBottom: 12, lineHeight: 1.45 }}>
        Abre el bot de Telegram, envía{' '}
        <span
          style={{
            fontFamily: MONO,
            background: '#fff',
            padding: '1px 5px',
            borderRadius: 3,
            border: '1px solid #DDE3EA',
          }}
        >
          /queja
        </span>
        , adjunta foto y ubicación. Si 10 vecinos la apoyan, entra al Registro Electrónico del
        Ayuntamiento como solicitud oficial. Reloj legal público, sin coste, sin datos personales
        publicados.
      </div>
      <a
        href="https://t.me/munigraph_bot?start=landing"
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 16px',
          background: PALETTE.civic,
          color: '#fff',
          fontFamily: SANS,
          fontSize: 13.5,
          fontWeight: 600,
          borderRadius: 7,
          textDecoration: 'none',
          boxShadow: '0 2px 6px rgba(36,99,235,.25)',
        }}
      >
        Abrir el bot →
      </a>
      <a
        href="/aviso-legal"
        style={{
          marginLeft: 10,
          fontSize: 11.5,
          color: PALETTE.civic,
          textDecoration: 'underline',
          textUnderlineOffset: 2,
        }}
      >
        Cómo protegemos tus datos
      </a>
    </div>
  )
}

function LeadStory() {
  const { loading, error, data } = usePress()
  if (loading || error || !data) return null
  const top = (data.items || [])[0]
  if (!top) return null
  const excerpt = (top.excerpt || '').trim()
  return (
    <article style={{ paddingBottom: 22, borderBottom: '1px solid ' + PALETTE.hair }}>
      <Kicker tone="red">{top.source}</Kicker>
      <h1
        style={{
          fontFamily: SERIF,
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: '-.02em',
          lineHeight: 1.1,
          margin: '8px 0 10px',
        }}
      >
        <a
          href={top.link}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          {top.title}
        </a>
      </h1>
      {excerpt && (
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 14.5,
            color: PALETTE.ink80,
            lineHeight: 1.45,
            fontStyle: 'italic',
            marginBottom: 12,
          }}
        >
          {excerpt.length > 260 ? excerpt.slice(0, 260) + '…' : excerpt}
        </div>
      )}
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          color: PALETTE.ink60,
          letterSpacing: '.06em',
        }}
      >
        {pressTimeAgo(top.date).toUpperCase()} ·{' '}
        <a
          href={top.link}
          target="_blank"
          rel="noreferrer"
          style={{ color: PALETTE.civic, textDecoration: 'none', fontWeight: 600 }}
        >
          Leer en {top.source} →
        </a>
      </div>
    </article>
  )
}

function AlcaldeBox() {
  const { loading, error, data } = useOfficials()
  const { data: promisesData } = usePromises()
  const { data: agendasData } = usePlenoAgendas()
  const { data: budgetData } = useBudget()
  const { data: tendersData } = useTenders()
  const { data: bdnsData } = useBdns()
  if (loading || error || !data) return null
  const mayor = data.officials.find((o) => o.role === 'alcalde')
  if (!mayor) return null

  // Municipal-government-level stats for the mandate. These are NOT
  // attributed personally to the mayor — they are the numbers of the
  // government he presides over. The strip label "Gobierno municipal ·
  // <year>" makes this explicit.
  const budgetYear = budgetData?.snapshot?.year
  const budgetEuros = budgetData?.snapshot?.totalExpense
  const tendersAwarded = tendersData?.stats?.awardedContracts
  const tendersEuros = tendersData?.stats?.awardedTotalEuros
  const bdnsGranted = bdnsData?.stats?.granted

  // Canonicalise mayor's portfolios to dept slugs (dedup). The mayor owns
  // several concejalías; surface all of them as chips so the reader can
  // drill into any of his accountability surfaces.
  const slugs = []
  const seenSlugs = new Set()
  for (const p of mayor.portfolios ?? []) {
    const slug = canonicalizeDepartment(p)
    if (slug && !seenSlugs.has(slug)) {
      slugs.push(slug)
      seenSlugs.add(slug)
    }
  }

  const partyPromises = (promisesData?.items ?? []).filter((p) => p.party === mayor.party).length

  // Count agenda items that fall inside the mayor's portfolio slugs — these
  // are the pleno points his concejalías proposed. Doesn't attribute votes
  // to him personally (that's a libel line), just "items from his areas".
  let agendaHits = 0
  if (agendasData?.plenos && seenSlugs.size > 0) {
    for (const p of agendasData.plenos) {
      for (const it of p.agenda || []) {
        const s = it.departmentSlug || canonicalizeDepartment(it.department)
        if (s && seenSlugs.has(s)) agendaHits += 1
      }
    }
  }

  return (
    <div
      style={{
        padding: '12px 0',
        borderTop: '1px solid ' + PALETTE.hair,
        borderBottom: '1px solid ' + PALETTE.hair,
        margin: '14px 0',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {mayor.photoUrl ? (
          <img
            src={mayor.photoUrl}
            alt={mayor.name}
            width={52}
            height={52}
            style={{
              width: 52,
              height: 52,
              borderRadius: 8,
              objectFit: 'cover',
              border: `2px solid ${partyColor(mayor.party)}44`,
              flexShrink: 0,
            }}
          />
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="mono"
            style={{
              fontSize: 9.5,
              color: PALETTE.ink60,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
            }}
          >
            Alcalde
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, letterSpacing: '-.01em' }}>
            {mayor.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span
              className="mono"
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                background: partyColor(mayor.party),
                color: 'white',
                padding: '2px 6px',
                borderRadius: 3,
              }}
            >
              {mayor.party}
            </span>
            <span className="mono" style={{ fontSize: 10, color: PALETTE.ink60 }}>
              {mayor.email}
            </span>
          </div>
        </div>
      </div>

      {(partyPromises > 0 || agendaHits > 0) && (
        <div
          style={{
            display: 'flex',
            gap: 14,
            marginTop: 10,
            fontSize: 11,
            color: PALETTE.ink80,
            fontFamily: MONO,
          }}
        >
          {partyPromises > 0 && (
            <a
              href="/promesas"
              style={{ color: PALETTE.ink80, textDecoration: 'none' }}
              title={`Promesas documentadas del grupo ${mayor.party}`}
            >
              <span style={{ fontWeight: 700 }}>{partyPromises}</span>
              <span style={{ color: PALETTE.ink50, marginLeft: 5 }}>promesas · {mayor.party}</span>
            </a>
          )}
          {agendaHits > 0 && slugs[0] && (
            <a
              href={`/departamentos/${slugs[0]}`}
              style={{ color: PALETTE.ink80, textDecoration: 'none' }}
              title="Puntos de orden del día gestionados por concejalías del Alcalde"
            >
              <span style={{ fontWeight: 700 }}>{agendaHits}</span>
              <span style={{ color: PALETTE.ink50, marginLeft: 5 }}>puntos en pleno</span>
            </a>
          )}
        </div>
      )}

      {slugs.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 5,
            marginTop: 8,
          }}
        >
          {slugs.map((slug) => (
            <a
              key={slug}
              href={`/departamentos/${slug}`}
              className="mono"
              style={{
                fontSize: 9.5,
                padding: '2px 7px',
                background: '#EEF4FF',
                color: PALETTE.civic,
                borderRadius: 3,
                letterSpacing: '.04em',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              {DEPARTMENT_LABEL[slug].es} →
            </a>
          ))}
        </div>
      )}

      {(budgetEuros || tendersAwarded || bdnsGranted) && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed ' + PALETTE.hair }}>
          <div
            className="mono"
            style={{
              fontSize: 8.5,
              color: PALETTE.ink50,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Gobierno municipal{budgetYear ? ` · ${budgetYear}` : ''}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              columnGap: 14,
              rowGap: 4,
              fontSize: 10.5,
              fontFamily: MONO,
              color: PALETTE.ink60,
            }}
          >
            {budgetEuros && (
              <a
                href="/presupuesto"
                style={{ color: PALETTE.ink80, textDecoration: 'none' }}
                title="Presupuesto municipal total de gasto"
              >
                <span style={{ fontWeight: 700 }}>{formatBudgetEuros(budgetEuros)}</span>{' '}
                <span style={{ color: PALETTE.ink50 }}>presupuesto</span>
              </a>
            )}
            {tendersAwarded && (
              <a
                href="/presupuesto"
                style={{ color: PALETTE.ink80, textDecoration: 'none' }}
                title="Contratos adjudicados por el Ayuntamiento durante el mandato"
              >
                <span style={{ fontWeight: 700 }}>{tendersAwarded}</span>{' '}
                <span style={{ color: PALETTE.ink50 }}>
                  contratos
                  {tendersEuros ? ` · ${formatBudgetEuros(tendersEuros)}` : ''}
                </span>
              </a>
            )}
            {bdnsGranted && (
              <a
                href="/presupuesto"
                style={{ color: PALETTE.ink80, textDecoration: 'none' }}
                title="Subvenciones concedidas por el Ayuntamiento (registro BDNS)"
              >
                <span style={{ fontWeight: 700 }}>{bdnsGranted}</span>{' '}
                <span style={{ color: PALETTE.ink50 }}>subvenciones</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CoalitionRing() {
  const { loading, error, data } = useOfficials()
  if (loading || error || !data) return null
  const order = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'Otro']
  const items = order.filter((p) => data.composition[p]).map((p) => ({ p, n: data.composition[p] }))
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        className="mono"
        style={{
          fontSize: 9.5,
          color: PALETTE.ink60,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        Pleno · {data.count} escaños
      </div>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 12,
          borderRadius: 6,
          overflow: 'hidden',
          border: `1px solid ${PALETTE.hair}`,
        }}
      >
        {items.map(({ p, n }) => (
          <div
            key={p}
            title={`${p}: ${n}`}
            style={{
              flex: n,
              background: partyColor(p),
              display: 'grid',
              placeItems: 'center',
              color: 'white',
              fontFamily: MONO,
              fontSize: 8.5,
              fontWeight: 700,
            }}
          >
            {n}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', fontSize: 10.5 }}>
        {items.map(({ p, n }) => (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: partyColor(p),
                display: 'inline-block',
              }}
            />
            <span style={{ fontWeight: 600 }}>{p}</span>
            <span className="mono" style={{ color: PALETTE.ink60 }}>
              {n}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function LiveContracts() {
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

  return (
    <div style={{ marginBottom: 18, borderTop: '1px solid ' + PALETTE.hair, paddingTop: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: PALETTE.ink60,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Contratos adjudicados
        </div>
        <div className="mono" style={{ fontSize: 10, color: PALETTE.ink60 }}>
          {data.stats.totalContracts} · {fmtEur(data.stats.awardedTotalEuros)}
        </div>
      </div>
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
                fontSize: 10,
                color: PALETTE.accent,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {c.categoryTitle || c.contractType || 'Contrato'}
            </span>
            <span className="mono" style={{ fontSize: 10, color: PALETTE.ink50 }}>
              {formatTenderDate(c.awardDate)}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginBottom: 2 }}>
            {c.permalink ? (
              <a
                href={c.permalink}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {c.title.length > 100 ? c.title.slice(0, 100) + '…' : c.title}
              </a>
            ) : (
              c.title
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 11.5, color: PALETTE.ink60 }}>
            <span>{c.contractor || 'Sin adjudicatario'}</span>
            <span
              style={{ marginLeft: 'auto', fontWeight: 700, color: PALETTE.ink }}
              className="mono"
            >
              {fmtEur(c.finalAmount)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ParticipaBlockD() {
  const { loading, error, data } = useParticipa()
  if (loading || error || !data) return null
  const items = (data.items || []).slice(0, 3)
  if (items.length === 0) return null
  const fmt = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return (
    <div
      style={{
        marginBottom: 18,
        borderTop: '1px solid ' + PALETTE.hair,
        paddingTop: 14,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: PALETTE.ink60,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Participación ciudadana · {data.stats.total}
      </div>
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
              borderRadius: 6,
              background: it.kind === 'survey' ? 'rgba(36,99,235,.12)' : 'rgba(22,163,74,.12)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {KIND_ICON[it.kind] || '📢'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 2 }}>
              <a
                href={it.link}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {it.title.length > 80 ? it.title.slice(0, 80) + '…' : it.title}
              </a>
            </div>
            <div className="mono" style={{ fontSize: 10, color: PALETTE.ink60 }}>
              {fmt(it.date)} · {it.categories[0] || 'aviso'}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PressBlockD() {
  const { loading, error, data } = usePress()
  if (loading || error || !data) return null
  const items = (data.items || []).slice(0, 5)
  if (items.length === 0) return null
  return (
    <div
      style={{
        marginBottom: 18,
        borderTop: '1px solid ' + PALETTE.hair,
        paddingTop: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: PALETTE.ink60,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Prensa · {data.stats.total} titulares
        </div>
        <div className="mono" style={{ fontSize: 10, color: PALETTE.ink50 }}>
          {data.stats.sources} medios
        </div>
      </div>
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
                fontSize: 10,
                color: PALETTE.accent,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {p.source}
            </span>
            <span className="mono" style={{ fontSize: 10, color: PALETTE.ink50 }}>
              {pressTimeAgo(p.date)}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
            <a
              href={p.link}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {p.title.length > 110 ? p.title.slice(0, 110) + '…' : p.title}
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}

function PromesasBlockD() {
  const { loading, error, data } = usePromises()
  if (loading || error || !data) return null
  const frozen = isPromiseFrozen(data)
  const total = data.items?.length ?? 0
  if (total === 0) return null
  const byParty = (data.items || []).reduce((acc, p) => {
    acc[p.party] = (acc[p.party] || 0) + 1
    return acc
  }, {})
  const parties = Object.entries(byParty).sort((a, b) => b[1] - a[1])
  return (
    <div
      style={{
        marginBottom: 18,
        borderTop: '1px solid ' + PALETTE.hair,
        paddingTop: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: PALETTE.ink60,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Seguimiento de promesas
        </div>
        {frozen && (
          <span
            className="mono"
            style={{
              fontSize: 9,
              color: PALETTE.crit,
              background: 'rgba(220,38,38,.08)',
              padding: '1px 6px',
              borderRadius: 3,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            LOREG · congelado
          </span>
        )}
        <span className="mono" style={{ fontSize: 10, color: PALETTE.ink50, marginLeft: 'auto' }}>
          {total}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, marginBottom: 8 }}>
        {parties.map(([party, n]) => (
          <span
            key={party}
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              fontWeight: 700,
              color: 'white',
              background:
                party === 'PSOE'
                  ? '#D01832'
                  : party === 'PP'
                    ? '#2463EB'
                    : party === 'VOX'
                      ? '#3A8018'
                      : party === 'Compromís'
                        ? '#A06116'
                        : '#64748B',
              padding: '2px 7px',
              borderRadius: 3,
            }}
          >
            {party} · {n}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: PALETTE.ink80, lineHeight: 1.45, marginBottom: 6 }}>
        Compromisos públicos documentados con cita verbatim y fuente primaria. Sin juicios
        automáticos de cumplimiento.
      </div>
      <a
        href="/promesas"
        style={{ color: PALETTE.accent, textDecoration: 'none', fontSize: 11.5, fontWeight: 600 }}
      >
        Ver tracker completo →
      </a>
    </div>
  )
}

function DepartamentosBlockD() {
  const { data: agendas } = usePlenoAgendas()
  const officialsSnap = useOfficials()
  const promisesSnap = usePromises()
  if (!agendas?.stats) return null
  const frozen = isPromiseFrozen(promisesSnap.data)
  const vencidos = frozen ? 0 : (agendas.stats.plazosVencidosCount ?? 0)
  const coverage = agendas.stats.deptCoverage ?? null
  const totalDepts = 28
  const totalOfficials = officialsSnap.data?.officials?.length ?? null
  return (
    <div
      style={{
        marginBottom: 18,
        borderTop: '1px solid ' + PALETTE.hair,
        paddingTop: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: PALETTE.ink60,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Rendición de cuentas por concejalía
        </div>
        {!frozen && vencidos > 0 && (
          <span
            className="mono"
            style={{
              fontSize: 9.5,
              color: PALETTE.warn,
              background: 'rgba(217,119,6,.10)',
              padding: '1px 6px',
              borderRadius: 3,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            ⚠ {vencidos} plazos vencidos
          </span>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div>
          <div
            className="mono"
            style={{
              fontSize: 9,
              color: PALETTE.ink50,
              textTransform: 'uppercase',
              letterSpacing: '.1em',
            }}
          >
            Concejalías
          </div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: PALETTE.ink }}>
            {totalDepts}
          </div>
        </div>
        {coverage !== null && (
          <div>
            <div
              className="mono"
              style={{
                fontSize: 9,
                color: PALETTE.ink50,
                textTransform: 'uppercase',
                letterSpacing: '.1em',
              }}
            >
              Con responsable
            </div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: PALETTE.ink }}>
              {coverage}/{totalDepts}
            </div>
          </div>
        )}
        {totalOfficials !== null && (
          <div>
            <div
              className="mono"
              style={{
                fontSize: 9,
                color: PALETTE.ink50,
                textTransform: 'uppercase',
                letterSpacing: '.1em',
              }}
            >
              Concejales
            </div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: PALETTE.ink }}>
              {totalOfficials}
            </div>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: PALETTE.ink80, lineHeight: 1.45, marginBottom: 6 }}>
        Cruza votos de pleno, promesas electorales y quejas ciudadanas por concejalía. Un plazo
        vencido se marca como aviso editorial — el estado nunca se modifica de forma automática.
      </div>
      <a
        href="/departamentos"
        style={{ color: PALETTE.accent, textDecoration: 'none', fontSize: 11.5, fontWeight: 600 }}
      >
        Ver dashboard por departamento →
      </a>
    </div>
  )
}

function EditorialColumn({ now }) {
  return (
    <aside
      style={{
        width: 420,
        flexShrink: 0,
        background: PALETTE.bg,
        borderLeft: '1px solid ' + PALETTE.hair,
        overflowY: 'auto',
        padding: '24px 26px',
        fontFamily: SANS,
        color: PALETTE.ink,
      }}
    >
      <EditorialMasthead now={now} />
      <QuejaCTA />
      <LeadStory />
      <AlcaldeBox />
      <CoalitionRing />
      <PromesasBlockD />
      <DepartamentosBlockD />
      <PressBlockD />
      <LiveContracts />
      <ParticipaBlockD />
    </aside>
  )
}
export { EditorialColumn }
