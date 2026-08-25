import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead, PartyTag } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useDepartmentStats } from '../hooks/useDepartmentStats'
import { usePromises, isPromiseFrozen, PARTY_TONE } from '../hooks/usePromises'
import { useAreaFit, fitAggregate } from '../hooks/useAreaFit'
import { useT, useLocale } from '../i18n'

/** Compact euros for a card stat: 61.262.695 € reads as "61,3 M€". */
function formatEurosCompact(eur) {
  if (!eur) return '—'
  if (eur >= 1e6) return `${(eur / 1e6).toFixed(1).replace('.', ',')} M€`
  if (eur >= 1e3) return `${Math.round(eur / 1e3)} k€`
  return `${Math.round(eur)} €`
}

function DepartmentCard({ bucket, frozen, contratacionYears }) {
  const t = useT()
  const { locale } = useLocale()
  const label = locale === 'ca' ? bucket.labelCa : bucket.labelEs
  const official = bucket.responsableOfficial
  const partyColor = official?.party ? PARTY_TONE[official.party] || 'var(--ink50)' : null
  const vencidos = bucket.plenoVotes.plazosVencidos + bucket.promesas.plazosVencidos

  return (
    // ONE grid item per concejalía. This used to be a fragment, which put the
    // card and its "Ver responsable" link in two separate cells of the parent
    // grid: the link floated into the next column, and because a concejalía
    // with no responsable emits no link, the offset drifted down the list until
    // every link sat against a card belonging to somebody else. On a page whose
    // job is saying which councillor answers for which área, that is a
    // misattribution, not a spacing bug.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Link
        to={`/departamentos/${bucket.slug}`}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block', flex: 1 }}
      >
        <Card hover style={{ height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 'var(--fs-body)',
                  fontWeight: 600,
                  letterSpacing: '-.01em',
                  marginBottom: 4,
                }}
              >
                {label}
              </div>
              {official ? (
                // The graph used to be one-directional: /cargos linked out to
                // /departamentos, but the responsible official was rendered here
                // as plain text, so a reader who arrived at a concejalía could not
                // reach the person accountable for it.
                // Plain text on purpose. The whole card is already a <Link> to
                // the department, so a real <Link> here would be nested anchors —
                // invalid HTML that React Router renders but browsers mis-handle.
                // Colouring it like a link without it being one is worse still: a
                // false affordance that silently lands the reader on the
                // department page. The route to the person is the explicit row
                // below.
                <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
                  <PartyTag
                    tone={partyColor}
                    style={{ fontSize: 'var(--fs-micro)', marginRight: 6 }}
                  >
                    {official.party}
                  </PartyTag>
                  {official.name}
                </div>
              ) : (
                <div
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-micro)',
                    color: 'var(--ink50)',
                    letterSpacing: '.04em',
                  }}
                >
                  {t('departamentos.card.sinResponsable')}
                </div>
              )}
            </div>
            {!frozen && vencidos > 0 && (
              <Pill tone="warn" size="xs">
                ⚠ {vencidos}
              </Pill>
            )}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 8,
              fontSize: 'var(--fs-micro)',
            }}
          >
            <Stat
              label={t('departamentos.card.aprobados')}
              value={bucket.plenoVotes.aprobado}
              muted={bucket.plenoVotes.total === 0}
              sub={
                bucket.plenoVotes.total === 0
                  ? t('departamentos.card.sinVotoTranscrito')
                  : undefined
              }
            />
            <Stat
              label={t('departamentos.card.promesas')}
              value={bucket.promesas.total}
              muted={bucket.promesas.total === 0}
            />
            {/* Awarded spend this concejalía owns. Under-states by design: only
              contracts whose category maps unambiguously to a department are
              counted, so a blank means "not attributable", never "spent zero".

              The PERIOD is part of the label, not a footnote. Without it the
              card puts a nine-year accumulation beside a one-year municipal
              budget and a reader concludes one concejalía moves a large share
              of the annual spend. Read from the counted rows, never typed. */}
            <Stat
              label={
                contratacionYears
                  ? `${t('departamentos.card.contratacion')} ${contratacionYears.from}–${contratacionYears.to}`
                  : t('departamentos.card.contratacion')
              }
              value={
                bucket.contratacion.contratos > 0
                  ? formatEurosCompact(bucket.contratacion.importeEur)
                  : '—'
              }
              muted={bucket.contratacion.contratos === 0}
              sub={
                bucket.contratacion.contratos > 0
                  ? `${bucket.contratacion.contratos} ${t('departamentos.card.contratos')}`
                  : undefined
              }
            />
            <Stat
              label={t('departamentos.card.quejas')}
              value={bucket.quejas.abiertas}
              tone={bucket.quejas.silencios > 0 ? 'crit' : undefined}
              muted={bucket.quejas.total === 0}
            />
            <Stat
              label={t('departamentos.card.declaraciones')}
              value={bucket.declaraciones.conEvidencia}
              tone={bucket.declaraciones.contradicho > 0 ? 'crit' : undefined}
              muted={bucket.declaraciones.conEvidencia === 0}
              sub={
                bucket.declaraciones.sinDatos > 0
                  ? `${bucket.declaraciones.sinDatos} ${t('departamentos.card.sinContraste')}`
                  : undefined
              }
            />
            {!frozen && (
              <Stat
                label={t('departamentos.card.vencidos')}
                value={vencidos}
                tone={vencidos > 0 ? 'warn' : undefined}
                muted={vencidos === 0}
              />
            )}
          </div>
        </Card>
      </Link>
      {/* Real, non-nested route to the person accountable for this área. Sits
        OUTSIDE the card-wide <Link> so it is a genuine anchor rather than
        nested anchors, and closes the graph: /cargos already pointed here, but
        a reader landing on a concejalía could not reach the councillor who
        answers for it. The row is reserved whether or not there is a
        responsable, so every card in a row still ends on the same line. */}
      <div style={{ marginTop: 4, minHeight: 16, textAlign: 'right' }}>
        {official && (
          <Link
            to={`/cargos/${official.slug}`}
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--civic)', textDecoration: 'none' }}
          >
            {t('departamentos.card.verResponsable')} →
          </Link>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone, muted, sub }) {
  const color =
    tone === 'warn' ? 'var(--warn-ink)' : tone === 'crit' ? 'var(--crit-ink)' : 'var(--ink)'
  // Muting fades the numeric value only — the small uppercase label keeps full
  // opacity so 9.5px text stays above the WCAG AA 4.5:1 contrast floor.
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink70)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-head)', fontWeight: 600, color, opacity: muted ? 0.55 : 1 }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 1 }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

/**
 * One line, no names.
 *
 * The house pattern from press-analytics: the aggregate carries the story
 * without any individual carrying a grade. Deliberately states counts and not a
 * rate — "4 de 11" invites a percentage, and a percentage about who governs a
 * town is a scoreboard. Anchored in check:drift so it cannot go stale.
 */
function EncajeAggregate() {
  const t = useT()
  const { data, frozen } = useAreaFit()
  const agg = fitAggregate(data)
  if (frozen || !agg) return null
  return (
    <p
      style={{
        fontSize: 'var(--fs-aux)',
        color: 'var(--ink50)',
        lineHeight: 1.55,
        maxWidth: 780,
        margin: '-12px 0 22px',
        paddingLeft: 10,
        borderLeft: '2px solid var(--border2)',
      }}
    >
      {t('departamentos.encaje')
        .replace('{cargos}', String(agg.cargos))
        .replace('{conFormacion}', String(agg.conFormacion))
        .replace('{sinRelacion}', String(agg.sinRelacion))}{' '}
      {/* Inside the sentence, so underlined — see EncajeDeclarado.jsx. */}
      <Link to="/metodologia#encaje" style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
        {t('encaje.card.law')} →
      </Link>
    </p>
  )
}

export default function Departamentos() {
  const t = useT()
  const stats = useDepartmentStats()
  const promisesSnap = usePromises()
  const frozen = isPromiseFrozen(promisesSnap.data)

  if (stats.loading) {
    return (
      <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>
        {t('common.loading')}
      </div>
    )
  }
  if (stats.error) {
    return (
      <div style={{ padding: 32, color: 'var(--crit-ink)', fontSize: 'var(--fs-aux)' }}>
        {stats.error.message}
      </div>
    )
  }

  const list = stats.data.list
  const totalVencidos = stats.data.plazosVencidosCount
  const unbucketed = stats.data.unbucketedOverdueVotes ?? 0

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1180, margin: '0 auto' }}>
      <SectionHead
        eyebrow={t('departamentos.eyebrow')}
        title={t('departamentos.title')}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* An overdue item whose vote carries no department lands in the
              page total and in NO card, so a reader who trusts the warning hunts
              through 28 concejalías all reading 0 and concludes the page
              contradicts itself. Say where it went instead of hiding it — the
              gap is a finding about our own data, not an embarrassment to round
              away.

              When EVERY overdue item is unlocatable the count is stated once:
              «1 plazo vencido · 1 sin concejalía asignada» reads as two
              separate things, which is a second wrong answer, not a fix. */}
            {!frozen && totalVencidos > 0 && (
              <Pill tone="warn" size="sm">
                ⚠ {totalVencidos}{' '}
                {totalVencidos === 1
                  ? t('departamentos.plazoVencido')
                  : t('liveTicker.plazosVencidos')}
                {/* Weight alone carries the de-emphasis. An `opacity` here
                  dropped this text under the WCAG AA contrast floor inside the
                  warn pill and axe caught it — fading a warning until it is hard
                  to read defeats the warning. */}
                {unbucketed > 0 && (
                  <span style={{ fontWeight: 400 }}>
                    {unbucketed === totalVencidos
                      ? `, ${t('departamentos.sinConcejalia')}`
                      : ` · ${unbucketed} ${t('departamentos.sinConcejalia')}`}
                  </span>
                )}
              </Pill>
            )}
            <DataAsOf iso={stats.generatedAt} label="Departamentos" />
          </div>
        }
      />
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          lineHeight: 1.55,
          maxWidth: 780,
          marginTop: 4,
          marginBottom: 24,
        }}
      >
        {t('departamentos.subtitle')}
      </p>
      <EncajeAggregate />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          // Row gap wider than the column gap on purpose: "Ver responsable"
          // hangs below its card, so the space under it must read as bigger
          // than the space above it. Proximity is what tells a reader which
          // concejalía the councillor belongs to.
          columnGap: 12,
          // Raised from 20 when CPV-based attribution left more cards without a
          // «N contratos» sub-line: shorter cards shrank the gap below «Ver
          // responsable» until it was only 2.8× the gap above it, and the
          // proximity that tells a reader which concejalía the link belongs to
          // started to blur. The e2e guard caught it at 2.82.
          rowGap: 26,
        }}
      >
        {list.map((bucket) => (
          <DepartmentCard
            key={bucket.slug}
            bucket={bucket}
            frozen={frozen}
            contratacionYears={stats.data.contratacionYears}
          />
        ))}
      </div>
    </div>
  )
}
