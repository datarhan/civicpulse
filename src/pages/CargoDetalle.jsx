import { Link, useParams } from 'react-router-dom'
import { Card, Pill, SectionHead, ExtLink } from '../components/Primitives'
import { useOfficials, partyColor } from '../hooks/useOfficials'
import { usePromises, STATUS_LABEL, STATUS_TONE } from '../hooks/usePromises'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { useQuejas } from '../hooks/useQuejas'
import { useBioReportRoutes } from '../hooks/useBioReportRoutes'
import { useDedicaciones, dedicacionForSlug } from '../hooks/useDedicaciones'
import { useDepartmentStats } from '../hooks/useDepartmentStats'
import { useElections } from '../hooks/useElections'
import { useTransparencyDocs } from '../hooks/useTransparencyDocs'
import { cvDocForOfficial } from '../lib/official-cv'
import { latestVoteShare } from '../lib/party-alias'
import { canonicalizeDepartment, DEPARTMENT_LABEL } from '../scraper/departments'
import { EncajeMatrix, QueExigeLaLey } from '../components/EncajeDeclarado'
import { useT, useLocale } from '../i18n'

function flattenAgendas(snap) {
  if (!snap?.plenos) return []
  const out = []
  for (const p of snap.plenos) {
    for (const it of p.agenda || []) {
      out.push({ plenoId: p.id, plenoDate: p.date, plenoTitle: p.title, ...it })
    }
  }
  return out
}

function portfolioSlugs(official) {
  const out = []
  const seen = new Set()
  for (const p of official?.portfolios ?? []) {
    const s = canonicalizeDepartment(p)
    if (s && !seen.has(s)) {
      out.push(s)
      seen.add(s)
    }
  }
  return out
}

/**
 * Money the ÁREA awarded — never framed as the person's own spending.
 *
 * A concejal does not personally award a contract; the department they head
 * does, under a mesa de contratación. The same distinction the project keeps
 * between `speakerGroup` (bloc) and an individual applies to euros, so this
 * block names the concejalía in its own heading and its own sub-labels.
 *
 * The figure UNDER-states: a contract is attributed from the CPV code its own
 * contracting authority filed (see departmentForTender), and only when that code
 * names an área — so a zero means "nothing attributable", never "spent nothing".
 * Gobierto's coarse category is the fallback for the rows that filed no code at
 * all; attributing on it put €355k of Christmas lighting and English classes
 * under Salud.
 */
function AreaSpend({ slugs }) {
  const t = useT()
  const { locale } = useLocale()
  const { data } = useDepartmentStats()
  if (!data || slugs.length === 0) return null
  const rows = slugs
    .map((sl) => data.bySlug?.[sl])
    .filter((b) => b && b.contratacion.contratos > 0)
    .sort((a, b) => b.contratacion.importeEur - a.contratacion.importeEur)
  if (rows.length === 0) return null
  const totalEur = rows.reduce((n, b) => n + b.contratacion.importeEur, 0)
  const totalN = rows.reduce((n, b) => n + b.contratacion.contratos, 0)
  return (
    <section style={{ marginBottom: 28 }}>
      <SectionHead
        eyebrow={t('cargos.detalle.area.eyebrow')}
        title={t('cargos.detalle.area.title')}
      />
      <Card>
        <div style={{ fontSize: 12.5, color: 'var(--ink70)', marginBottom: 12, lineHeight: 1.5 }}>
          {t('cargos.detalle.area.intro')}
        </div>
        {rows.map((b) => (
          <div
            key={b.slug}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              padding: '7px 0',
              borderTop: '1px solid var(--border2)',
              fontSize: 13,
            }}
          >
            <Link
              to={`/departamentos/${b.slug}`}
              style={{ color: 'var(--civic)', textDecoration: 'none' }}
            >
              {locale === 'ca' ? b.labelCa : b.labelEs}
            </Link>
            <span>
              <span className="mono" style={{ fontWeight: 600 }}>
                {(b.contratacion.importeEur / 1e6).toFixed(2).replace('.', ',')} M€
              </span>
              <span style={{ color: 'var(--ink50)', fontSize: 11, marginLeft: 8 }}>
                {b.contratacion.contratos} {t('departamentos.card.contratos')}
              </span>
            </span>
          </div>
        ))}
        <div
          style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 10, lineHeight: 1.5 }}
          className="mono"
        >
          {t('cargos.detalle.area.note')} · {totalN} ·{' '}
          {(totalEur / 1e6).toFixed(2).replace('.', ',')} M€
        </div>
      </Card>
    </section>
  )
}

/**
 * What this person is paid, from the curated pleno acuerdo. A DIRECT
 * slug-keyed fact about the individual — unlike the área blocks — so it
 * belongs on their own page. It was previously visible only on the /cargos
 * index card, which meant the detail page held strictly less than the summary.
 *
 * 14 of 21 councillors hold no paid dedication; that renders as an explicit
 * "sin dedicación" rather than a blank, because a missing salary row and a
 * salary of zero are different claims.
 */
function Retribucion({ slug }) {
  const t = useT()
  const { data } = useDedicaciones()
  if (!data) return null
  const d = dedicacionForSlug(data, slug)
  return (
    <section style={{ marginBottom: 28 }}>
      <SectionHead
        eyebrow={t('cargos.detalle.pago.eyebrow')}
        title={t('cargos.detalle.pago.title')}
      />
      <Card>
        {d ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
              {d.amountEuros.toLocaleString('es-ES')} €
            </span>
            <Pill tone="neutral" size="xs">
              {d.dedicacion}
            </Pill>
            <span style={{ fontSize: 12, color: 'var(--ink50)' }}>{d.role}</span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--ink50)' }}>
            {t('cargos.detalle.pago.sinDedicacion')}
          </div>
        )}
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 10 }}>
          {data.source?.note || data.note || t('cargos.detalle.pago.fuente')}
        </div>
      </Card>
    </section>
  )
}

/**
 * Doorway to the group-level record, deliberately NOT a display of it.
 *
 * Votes, declarations and findings are bloc-level in the source data:
 * `pleno-votes` records per-party tallies rather than individual ballots, and
 * `speakerGroup` is a political group by explicit design. Rendering any of
 * their CONTENT under a person's photograph would manufacture individual
 * attribution the data cannot support. Counts of the área's activity, labelled
 * as the área's and linking to pages whose framing is already correct, carry
 * the reader across without making the claim here.
 */
function AreaActivity({ slugs }) {
  const t = useT()
  const { locale } = useLocale()
  const { data } = useDepartmentStats()
  if (!data || slugs.length === 0) return null
  const rows = slugs.map((sl) => data.bySlug?.[sl]).filter(Boolean)
  if (rows.length === 0) return null
  return (
    <section style={{ marginBottom: 28 }}>
      <SectionHead
        eyebrow={t('cargos.detalle.actividad.eyebrow')}
        title={t('cargos.detalle.actividad.title')}
      />
      <Card>
        <div style={{ fontSize: 12.5, color: 'var(--ink70)', marginBottom: 12, lineHeight: 1.5 }}>
          {t('cargos.detalle.actividad.intro')}
        </div>
        {rows.map((b) => (
          <div
            key={b.slug}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 10,
              flexWrap: 'wrap',
              padding: '8px 0',
              borderTop: '1px solid var(--border2)',
              fontSize: 13,
            }}
          >
            <Link
              to={`/departamentos/${b.slug}`}
              style={{ color: 'var(--civic)', textDecoration: 'none', fontWeight: 500 }}
            >
              {locale === 'ca' ? b.labelCa : b.labelEs} →
            </Link>
            <span style={{ fontSize: 11.5, color: 'var(--ink50)' }}>
              <span className="mono">{b.plenoVotes.total}</span>{' '}
              {t('cargos.detalle.actividad.votos')}
              {' · '}
              <span className="mono">{b.declaraciones.conEvidencia}</span>{' '}
              {t('cargos.detalle.actividad.declaraciones')}
              {' · '}
              {/* Underlined, not just recoloured: this link sits mid-sentence
                  after the declaraciones count, and colour alone fails
                  WCAG 1.4.1 (axe: link-in-text-block). */}
              <Link
                to={`/hallazgos?area=${b.slug}`}
                style={{ color: 'var(--civic)', textDecoration: 'underline' }}
              >
                {t('cargos.detalle.actividad.hallazgos')}
              </Link>
            </span>
          </div>
        ))}
      </Card>
    </section>
  )
}

/**
 * The mandate this councillor's list actually won.
 *
 * A party-level fact, labelled as such: it is the group's vote share, not a
 * personal score. Shown because "who put them there" is the first thing a
 * citizen checking a councillor wants, and because elections.json was scraped
 * nightly for months while reaching no page at all.
 */
function Mandato({ party }) {
  const t = useT()
  const { data } = useElections()
  const share = latestVoteShare(data, party)
  if (!share) return null
  return (
    <section style={{ marginBottom: 28 }}>
      <SectionHead
        eyebrow={t('cargos.detalle.mandato.eyebrow')}
        title={t('cargos.detalle.mandato.title')}
      />
      <Card>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
            {String(share.pct).replace('.', ',')} %
          </span>
          <span style={{ fontSize: 13, color: 'var(--ink70)' }}>
            {share.ballotLabel} · {t('cargos.detalle.mandato.municipales')} {share.year}
          </span>
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 8 }}>
          {t('cargos.detalle.mandato.note')}
          {share.abstencionPct
            ? ` · ${t('cargos.detalle.mandato.abstencion')} ${String(share.abstencionPct).replace('.', ',')} %`
            : ''}
        </div>
      </Card>
    </section>
  )
}

/**
 * The councillor's own biographic PDF from the transparency portal.
 *
 * `officials[].cvUrl` is byte-identical for all 21 — a single generic landing
 * page — while the portal publishes a per-person document for most of them.
 * This links the real one. Matching is strict and refuses on ambiguity (see
 * lib/official-cv), so 5 councillors with no published document simply show
 * nothing rather than inheriting somebody else's CV.
 */
function FichaOficial({ official, roster }) {
  const t = useT()
  const { data } = useTransparencyDocs()
  const doc = cvDocForOfficial(data, official, roster)
  if (!doc) return null
  return (
    <section style={{ marginBottom: 28 }}>
      <SectionHead
        eyebrow={t('cargos.detalle.ficha.eyebrow')}
        title={t('cargos.detalle.ficha.title')}
      />
      <Card>
        <ExtLink href={doc.url} style={{ color: 'var(--civic)', fontWeight: 500, fontSize: 13.5 }}>
          {doc.title} ↗
        </ExtLink>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 8 }}>
          {t('cargos.detalle.ficha.note')}
        </div>
      </Card>
    </section>
  )
}

function MiniStat({ label, value, tone }) {
  const color =
    tone === 'warn' ? 'var(--warn-ink)' : tone === 'crit' ? 'var(--crit-ink)' : 'var(--ink)'
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border2)',
        borderRadius: 8,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 9.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 600, color, marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}

export default function CargoDetalle() {
  const { slug } = useParams()
  const t = useT()
  const { locale } = useLocale()
  const officialsSnap = useOfficials()
  const promisesSnap = usePromises()
  const agendasSnap = usePlenoAgendas()
  const quejasSnap = useQuejas()
  const bioRoutes = useBioReportRoutes()

  if (officialsSnap.loading) {
    return (
      <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 13 }}>{t('common.loading')}</div>
    )
  }

  const officialsList = officialsSnap.data?.officials ?? []
  const official = officialsList.find((o) => o.slug === slug)
  if (!official) {
    return (
      <div style={{ padding: '28px 28px 48px', maxWidth: 920, margin: '0 auto' }}>
        <Link
          to="/cargos"
          style={{
            fontSize: 12,
            color: 'var(--civic)',
            textDecoration: 'none',
            marginBottom: 18,
            display: 'inline-block',
          }}
        >
          ← {t('cargos.title')}
        </Link>
        <p style={{ color: 'var(--crit)' }}>{t('cargos.detalle.notFound')}</p>
      </div>
    )
  }

  const color = partyColor(official.party)
  const slugs = portfolioSlugs(official)
  const slugsSet = new Set(slugs)

  // Party-level promises. We never misattribute individual promises to one
  // councillor — even the mayor. The card shows N promesas del grupo X.
  const partyPromises = (promisesSnap.data?.items ?? []).filter((p) => p.party === official.party)

  // Agenda items whose canonical departmentSlug is in this official's
  // portfolio set. Count + flat list (trimmed).
  const agendaItems = flattenAgendas(agendasSnap.data).filter(
    (it) => it.departmentSlug && slugsSet.has(it.departmentSlug),
  )
  agendaItems.sort((a, b) => b.plenoDate.localeCompare(a.plenoDate))

  // Quejas assigned to this official (via the pre-aggregated byConcejal stats
  // from quejas.json). Never fabricate: if absent, render 0.
  const quejaStats = quejasSnap.data?.stats?.byConcejal?.[slug] ?? {
    total: 0,
    resueltas: 0,
    pendientes: 0,
    silencios: 0,
  }

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 920, margin: '0 auto' }}>
      <Link
        to="/cargos"
        style={{
          fontSize: 12,
          color: 'var(--civic)',
          textDecoration: 'none',
          marginBottom: 18,
          display: 'inline-block',
        }}
      >
        ← {t('cargos.title')}
      </Link>

      <div
        style={{
          display: 'flex',
          gap: 18,
          alignItems: 'center',
          padding: '18px 0',
          borderBottom: '1px solid var(--border2)',
          marginBottom: 20,
        }}
      >
        {official.photoUrl && (
          <img
            src={official.photoUrl}
            alt={official.name}
            width={88}
            height={88}
            style={{
              width: 88,
              height: 88,
              borderRadius: 12,
              objectFit: 'cover',
              border: `2px solid ${color}33`,
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span
              className="mono"
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                background: color,
                color: 'white',
                padding: '2px 7px',
                borderRadius: 3,
              }}
            >
              {official.party}
            </span>
            {official.role === 'alcalde' && (
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                }}
              >
                Alcalde
              </span>
            )}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.01em' }}>
            {official.name}
          </div>
          {official.portfolios?.length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink50)', marginTop: 4, lineHeight: 1.4 }}>
              {official.portfolios.join(' · ')}
            </div>
          )}
          {/* Both links sit inside a run of text, so colour alone cannot
              distinguish them (axe: link-in-text-block, WCAG 1.4.1). The email
              is rendered in the body ink to begin with. Underline them. */}
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12 }}>
            <a
              href={`mailto:${official.email || 'alcaldia@ribarroja.es'}`}
              className="mono"
              style={{ color: 'var(--ink70)', textDecoration: 'underline' }}
            >
              {official.email || 'alcaldia@ribarroja.es'}
            </a>
            {bioRoutes.get(official.slug) ? (
              <Link
                to={bioRoutes.get(official.slug)}
                title="Informe biográfico del agente periodista de CivicPulse"
                style={{ color: 'var(--civic)', textDecoration: 'underline', fontWeight: 500 }}
              >
                Biografía →
              </Link>
            ) : (
              official.cvUrl && (
                <ExtLink
                  href={official.cvUrl}
                  style={{ color: 'var(--civic)', textDecoration: 'underline', fontWeight: 500 }}
                >
                  Biografía →
                </ExtLink>
              )
            )}
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 24,
        }}
      >
        <MiniStat label={t('cargos.detalle.stat.portfolios')} value={slugs.length} />
        <MiniStat label={t('cargos.detalle.stat.partyPromises')} value={partyPromises.length} />
        <MiniStat label={t('cargos.detalle.stat.agendaItems')} value={agendaItems.length} />
        <MiniStat
          label={t('cargos.detalle.stat.quejas')}
          value={quejaStats.pendientes}
          tone={quejaStats.silencios > 0 ? 'crit' : undefined}
        />
      </div>

      <FichaOficial official={official} roster={officialsList} />
      <Mandato party={official.party} />
      {/* The matrix states what someone declares; QueExigeLaLey states what the
          law asks for, which is nothing for an elected post. The second is what
          keeps the first from reading as a disqualification, so they ship
          together and in this order. */}
      <EncajeMatrix official={official} bioRoute={bioRoutes.get(official.slug)} />
      <QueExigeLaLey />
      <Retribucion slug={official.slug} />
      <AreaSpend slugs={slugs} />
      <AreaActivity slugs={slugs} />

      {/* Portfolio department chips */}
      {slugs.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionHead
            eyebrow={t('cargos.detalle.portfolios.eyebrow')}
            title={t('cargos.detalle.portfolios.title')}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {slugs.map((s) => (
              <Link
                key={s}
                to={`/departamentos/${s}`}
                className="mono"
                style={{
                  fontSize: 11.5,
                  padding: '5px 10px',
                  background: 'var(--civic-soft)',
                  color: 'var(--civic)',
                  borderRadius: 5,
                  textDecoration: 'none',
                  fontWeight: 600,
                  letterSpacing: '.02em',
                }}
              >
                {locale === 'ca' ? DEPARTMENT_LABEL[s].ca : DEPARTMENT_LABEL[s].es} →
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Party promises (party-level attribution) */}
      <section style={{ marginBottom: 28 }}>
        <SectionHead
          eyebrow={t('cargos.detalle.promesas.eyebrow')}
          title={`${t('cargos.detalle.promesas.title')} · ${official.party}`}
          right={
            <Link
              to="/promesas"
              style={{ fontSize: 12, color: 'var(--civic)', textDecoration: 'none' }}
            >
              {t('cargos.detalle.promesas.viewAll')}
            </Link>
          }
        />
        {partyPromises.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--ink50)', marginTop: 8 }}>
            {t('cargos.detalle.promesas.empty')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {partyPromises.slice(0, 6).map((p) => (
              <Card key={p.id}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.title}</div>
                    <blockquote
                      style={{
                        margin: '6px 0 0',
                        padding: '6px 10px',
                        borderLeft: '3px solid var(--civic)',
                        fontSize: 14,
                        fontWeight: 500,
                        color: 'var(--ink)',
                        lineHeight: 1.5,
                        maxWidth: '68ch',
                      }}
                    >
                      «{p.quote}»
                    </blockquote>
                    <div
                      className="mono"
                      style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 6 }}
                    >
                      {p.madeAt} · {p.source.publisher}
                    </div>
                  </div>
                  <Pill tone={STATUS_TONE[p.status]} size="xs">
                    {STATUS_LABEL[p.status]}
                  </Pill>
                </div>
              </Card>
            ))}
            {partyPromises.length > 6 && (
              <Link
                to="/promesas"
                style={{ fontSize: 12, color: 'var(--civic)', textDecoration: 'none' }}
              >
                {t('cargos.detalle.promesas.more').replace('{n}', partyPromises.length - 6)}
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Agenda items in their portfolio depts */}
      <section style={{ marginBottom: 28 }}>
        <SectionHead
          eyebrow={t('cargos.detalle.agenda.eyebrow')}
          title={t('cargos.detalle.agenda.title')}
        />
        {agendaItems.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--ink50)', marginTop: 8 }}>
            {t('cargos.detalle.agenda.empty')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {agendaItems.slice(0, 12).map((it) => (
              <div
                key={`${it.plenoId}-${it.number}`}
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--border2)',
                  borderRadius: 8,
                  fontSize: 12.5,
                  lineHeight: 1.45,
                }}
              >
                <div
                  className="mono"
                  style={{ fontSize: 10, color: 'var(--ink50)', marginBottom: 2 }}
                >
                  {it.plenoDate} · punto {it.number}
                  {it.department ? ` · ${it.department}` : ''}
                  {it.expediente ? ` · exp. ${it.expediente}` : ''}
                </div>
                <div style={{ color: 'var(--ink70)' }}>{it.title}</div>
              </div>
            ))}
            {agendaItems.length > 12 && (
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink50)', paddingTop: 4 }}>
                {t('cargos.detalle.agenda.more').replace('{n}', agendaItems.length - 12)}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Quejas assigned */}
      <section style={{ marginBottom: 28 }}>
        <SectionHead
          eyebrow={t('cargos.detalle.quejas.eyebrow')}
          title={t('cargos.detalle.quejas.title')}
          right={
            quejaStats.total > 0 ? (
              <Link
                to="/quejas"
                style={{ fontSize: 12, color: 'var(--civic)', textDecoration: 'none' }}
              >
                {t('cargos.detalle.quejas.viewAll')}
              </Link>
            ) : null
          }
        />
        {quejaStats.total === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--ink50)', marginTop: 8 }}>
            {t('cargos.detalle.quejas.empty')}
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 10,
              marginTop: 10,
            }}
          >
            <MiniStat label="Total" value={quejaStats.total} />
            <MiniStat label="Resueltas" value={quejaStats.resueltas} />
            <MiniStat label="Pendientes" value={quejaStats.pendientes} />
            <MiniStat
              label="Silencios"
              value={quejaStats.silencios}
              tone={quejaStats.silencios > 0 ? 'crit' : undefined}
            />
          </div>
        )}
      </section>

      <div
        style={{
          marginTop: 20,
          padding: 14,
          background: 'var(--soft)',
          borderRadius: 8,
          fontSize: 11.5,
          color: 'var(--ink50)',
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: 'var(--ink)' }}>Atribución.</strong>{' '}
        {t('cargos.detalle.methodology')}{' '}
        <a href="/metodologia" style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
          {t('cargos.detalle.methodology.link')}
        </a>
      </div>
    </div>
  )
}
