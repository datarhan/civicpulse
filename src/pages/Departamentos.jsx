import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useDepartmentStats } from '../hooks/useDepartmentStats'
import { usePromises, isPromiseFrozen, PARTY_TONE } from '../hooks/usePromises'
import { useT, useLocale } from '../i18n'

/** Compact euros for a card stat: 61.262.695 € reads as "61,3 M€". */
function formatEurosCompact(eur) {
  if (!eur) return '—'
  if (eur >= 1e6) return `${(eur / 1e6).toFixed(1).replace('.', ',')} M€`
  if (eur >= 1e3) return `${Math.round(eur / 1e3)} k€`
  return `${Math.round(eur)} €`
}

function DepartmentCard({ bucket, frozen }) {
  const t = useT()
  const { locale } = useLocale()
  const label = locale === 'ca' ? bucket.labelCa : bucket.labelEs
  const official = bucket.responsableOfficial
  const partyColor = official?.party ? PARTY_TONE[official.party] || 'var(--ink60)' : null
  const vencidos = bucket.plenoVotes.plazosVencidos + bucket.promesas.plazosVencidos

  return (
    <>
      <Link
        to={`/departamentos/${bucket.slug}`}
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <Card hover style={{ height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 15,
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
                <div style={{ fontSize: 12, color: 'var(--ink60)' }}>
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: partyColor, fontWeight: 700, marginRight: 6 }}
                  >
                    {official.party}
                  </span>
                  {official.name}
                </div>
              ) : (
                <div
                  className="mono"
                  style={{ fontSize: 10.5, color: 'var(--ink50)', letterSpacing: '.04em' }}
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
              fontSize: 11.5,
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
              counted, so a blank means "not attributable", never "spent zero". */}
            <Stat
              label={t('departamentos.card.contratacion')}
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
          {/* Real, non-nested route to the person accountable for this área.
            Sits OUTSIDE the card-wide <Link> so it is a genuine anchor rather
            than nested anchors, and closes the graph: /cargos already pointed
            here, but a reader landing on a concejalía could not reach the
            councillor who answers for it. */}
        </Card>
      </Link>
      {official && (
        <div style={{ marginTop: 6, textAlign: 'right' }}>
          <Link
            to={`/cargos/${official.slug}`}
            style={{ fontSize: 11.5, color: 'var(--civic)', textDecoration: 'none' }}
          >
            {t('departamentos.card.verResponsable')} →
          </Link>
        </div>
      )}
    </>
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
          fontSize: 9.5,
          color: 'var(--ink80)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{ fontSize: 16, fontWeight: 600, color, opacity: muted ? 0.55 : 1 }}
      >
        {value}
      </div>
      {sub && (
        <div className="mono" style={{ fontSize: 9, color: 'var(--ink50)', marginTop: 1 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

export default function Departamentos() {
  const t = useT()
  const stats = useDepartmentStats()
  const promisesSnap = usePromises()
  const frozen = isPromiseFrozen(promisesSnap.data)

  if (stats.loading) {
    return (
      <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 13 }}>{t('common.loading')}</div>
    )
  }
  if (stats.error) {
    return (
      <div style={{ padding: 32, color: 'var(--crit)', fontSize: 13 }}>{stats.error.message}</div>
    )
  }

  const list = stats.data.list
  const totalVencidos = stats.data.plazosVencidosCount

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1180, margin: '0 auto' }}>
      <SectionHead
        eyebrow={t('departamentos.eyebrow')}
        title={t('departamentos.title')}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!frozen && totalVencidos > 0 && (
              <Pill tone="warn" size="sm">
                ⚠ {totalVencidos} {t('liveTicker.plazosVencidos')}
              </Pill>
            )}
            <DataAsOf iso={stats.generatedAt} label="Departamentos" />
          </div>
        }
      />
      <p
        style={{
          fontSize: 13,
          color: 'var(--ink60)',
          lineHeight: 1.55,
          maxWidth: 780,
          marginTop: 4,
          marginBottom: 24,
        }}
      >
        {t('departamentos.subtitle')}
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {list.map((bucket) => (
          <DepartmentCard key={bucket.slug} bucket={bucket} frozen={frozen} />
        ))}
      </div>
    </div>
  )
}
