import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead } from '../components/Primitives'
import { useDepartmentStats } from '../hooks/useDepartmentStats'
import { usePromises, isPromiseFrozen, PARTY_TONE } from '../hooks/usePromises'
import { useT, useLocale } from '../i18n'

function DepartmentCard({ bucket, frozen }) {
  const t = useT()
  const { locale } = useLocale()
  const label = locale === 'ca' ? bucket.labelCa : bucket.labelEs
  const official = bucket.responsableOfficial
  const partyColor = official?.party ? PARTY_TONE[official.party] || 'var(--ink60)' : null
  const vencidos = bucket.plenoVotes.plazosVencidos + bucket.promesas.plazosVencidos

  return (
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
          />
          <Stat
            label={t('departamentos.card.promesas')}
            value={bucket.promesas.total}
            muted={bucket.promesas.total === 0}
          />
          <Stat
            label={t('departamentos.card.quejas')}
            value={bucket.quejas.abiertas}
            tone={bucket.quejas.silencios > 0 ? 'crit' : undefined}
            muted={bucket.quejas.total === 0}
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
  )
}

function Stat({ label, value, tone, muted }) {
  const color =
    tone === 'warn'
      ? 'var(--warn-ink)'
      : tone === 'crit'
        ? 'var(--crit-ink)'
        : 'var(--ink)'
  return (
    <div style={{ opacity: muted ? 0.55 : 1 }}>
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
      <div className="mono" style={{ fontSize: 16, fontWeight: 600, color }}>
        {value}
      </div>
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
      <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 13 }}>
        {t('common.loading')}
      </div>
    )
  }
  if (stats.error) {
    return (
      <div style={{ padding: 32, color: 'var(--crit)', fontSize: 13 }}>
        {stats.error.message}
      </div>
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
          !frozen && totalVencidos > 0 ? (
            <Pill tone="warn" size="sm">
              ⚠ {totalVencidos} {t('liveTicker.plazosVencidos')}
            </Pill>
          ) : null
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
