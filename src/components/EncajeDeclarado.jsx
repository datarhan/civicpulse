import { Link } from 'react-router-dom'
import { Pill, ExtLink } from './Primitives'
import { canonicalizeDepartment } from '../scraper/departments'
import { useT, useLocale } from '../i18n'
import {
  useAreaFit,
  useRequisitosCargo,
  fitRowsForSlug,
  relatedAreaNames,
  overallValue,
} from '../hooks/useAreaFit'

/**
 * «Encaje declarado» — what the holder of an área declares having studied and
 * done, against the área's subject matter.
 *
 * Three rules are load-bearing and none of them is cosmetic:
 *
 *  · NO SCORE, EVER. The block names the áreas a relation was found in. It
 *    never counts them, never renders "3 de 4", and never sorts anyone. A
 *    percentage here would grade an elected official against a rubric no
 *    statute contains — and the law requires no qualification at all for the
 *    office, which is what QueExigeLaLey says out loud.
 *
 *  · «No consta» ≠ «no». The two are different facts about a living person, so
 *    they get different words and different tones. `no-consta` links to the
 *    biography's own gaps section, so the blank reads as our limit rather than
 *    a finding about them.
 *
 *  · THE OPPOSITION BLANK IS EXPLAINED. 10 of 21 councillors hold no delegated
 *    área, so no row can exist for them. Rendering nothing would turn /cargos
 *    into "the governing party has credentials, everyone else is blank" — an
 *    artifact of who governs, not of who is qualified. SinDelegacion says so.
 */

const TONE = {
  relacionada: 'ok',
  'sin-relacion-declarada': 'neutral',
  'no-consta': 'ghost',
}

function valueLabel(t, value) {
  return t(`encaje.value.${value}`)
}

/**
 * Compact block for an /cargos card.
 *
 * `bioRoute` is passed in rather than resolved here: /laboratorio/agentes/:id
 * is gated by PERIODISTAS_ENABLED and simply does not exist in production
 * without the flag, so linking unconditionally would ship a dead link.
 */
export function EncajeCard({ official, bioRoute }) {
  const t = useT()
  const { data, frozen } = useAreaFit()
  const rows = fitRowsForSlug(data, official.slug)

  if (frozen) return null
  if (!official.portfolios?.length) return <SinDelegacion />
  if (!rows.length) return null

  const fields = ['formacion', 'experiencia']

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px dashed var(--border2)',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 9.5,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: 'var(--ink50)',
          marginBottom: 6,
        }}
      >
        {t('encaje.eyebrow')}
      </div>

      {fields.map((field) => {
        const value = overallValue(rows, field)
        if (!value) return null
        const areas = relatedAreaNames(rows, field)
        return (
          <div
            key={field}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              fontSize: 11.5,
              lineHeight: 1.5,
              marginBottom: 3,
            }}
          >
            <span style={{ color: 'var(--ink60)', flexShrink: 0, minWidth: 104 }}>
              {t(`encaje.field.${field}`)}
            </span>
            {value === 'relacionada' && areas.length > 0 ? (
              <span style={{ color: 'var(--ink)', minWidth: 0 }}>
                {areas.slice(0, 3).join(' · ')}
                {areas.length > 3 && (
                  <span style={{ color: 'var(--ink50)' }}>{` +${areas.length - 3}`}</span>
                )}
              </span>
            ) : (
              <Pill tone={TONE[value]} size="xs">
                {valueLabel(t, value)}
              </Pill>
            )}
          </div>
        )
      })}

      <div style={{ marginTop: 7, fontSize: 10.5, color: 'var(--ink50)', lineHeight: 1.45 }}>
        {t('encaje.card.source')}{' '}
        {/* Underlined, not just tinted. These sit INSIDE a sentence, and WCAG
          2.1 AA (link-in-text-block) requires a link in running text to be
          distinguishable without relying on colour — axe flags all 22 of them
          otherwise. Standalone links elsewhere on the card keep the house
          no-underline style; the rule is about links embedded in prose. */}
        {bioRoute && (
          <>
            ·{' '}
            <Link to={bioRoute} style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
              {t('encaje.card.gaps')}
            </Link>
          </>
        )}{' '}
        ·{' '}
        <Link
          to="/metodologia#encaje"
          style={{ color: 'var(--civic)', textDecoration: 'underline' }}
        >
          {t('encaje.card.law')}
        </Link>
      </div>
    </div>
  )
}

/** The explicit empty state for the 10 councillors with no delegated área. */
export function SinDelegacion() {
  const t = useT()
  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px dashed var(--border2)',
        fontSize: 11,
        color: 'var(--ink50)',
        lineHeight: 1.45,
      }}
    >
      <span className="mono" style={{ letterSpacing: '.06em', textTransform: 'uppercase' }}>
        {t('encaje.sinDelegacion.label')}
      </span>
      <div style={{ marginTop: 3 }}>{t('encaje.sinDelegacion.note')}</div>
    </div>
  )
}

/** Full per-área matrix with every citation, for /cargos/:slug. */
export function EncajeMatrix({ official, bioRoute }) {
  const t = useT()
  const { data, frozen } = useAreaFit()
  const rows = fitRowsForSlug(data, official.slug)
  if (frozen || !rows.length) return null

  return (
    <section style={{ marginTop: 28 }}>
      <div
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'var(--ink50)',
        }}
      >
        {t('encaje.eyebrow')}
      </div>
      <h2 style={{ fontSize: 19, fontWeight: 600, margin: '6px 0 4px' }}>
        {t('encaje.matrix.title')}
      </h2>
      <p style={{ fontSize: 13, color: 'var(--ink60)', lineHeight: 1.55, margin: '0 0 14px' }}>
        {t('encaje.matrix.intro')}
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((r) => {
          const dept = r.departmentSlug || canonicalizeDepartment(r.portfolio)
          return (
            <div
              key={r.portfolio}
              style={{
                border: '1px solid var(--border2)',
                borderRadius: 10,
                padding: '12px 14px',
                background: 'var(--card)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <strong style={{ fontSize: 14 }}>{r.portfolio}</strong>
                {dept && (
                  <Link
                    to={`/departamentos/${dept}`}
                    style={{ fontSize: 11.5, color: 'var(--civic)', textDecoration: 'none' }}
                  >
                    {t('encaje.matrix.dept')} →
                  </Link>
                )}
              </div>

              {['formacion', 'experiencia'].map((field) => {
                const a = r[field]
                if (!a) return null
                return (
                  <div key={field} style={{ marginTop: 9 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          letterSpacing: '.06em',
                          textTransform: 'uppercase',
                          color: 'var(--ink50)',
                          minWidth: 112,
                        }}
                      >
                        {t(`encaje.field.${field}`)}
                      </span>
                      <Pill tone={TONE[a.value]} size="xs">
                        {valueLabel(t, a.value)}
                      </Pill>
                    </div>
                    {a.evidence?.length > 0 && (
                      <ul
                        style={{
                          margin: '5px 0 0 120px',
                          padding: 0,
                          listStyle: 'none',
                          fontSize: 12,
                          color: 'var(--ink70)',
                          lineHeight: 1.5,
                        }}
                      >
                        {a.evidence.map((ev) => (
                          <li key={ev.label}>
                            {ev.label}{' '}
                            <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
                              [{ev.sourceIds.join(', ')}]
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {a.value === 'no-consta' && bioRoute && (
                      <div style={{ margin: '4px 0 0 120px', fontSize: 11.5 }}>
                        <Link
                          to={bioRoute}
                          style={{ color: 'var(--civic)', textDecoration: 'underline' }}
                        >
                          {t('encaje.card.gaps')}
                        </Link>
                      </div>
                    )}
                  </div>
                )
              })}

              {r.curatorNotes && (
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: '1px dashed var(--border2)',
                    fontSize: 11.5,
                    color: 'var(--ink60)',
                    lineHeight: 1.5,
                  }}
                >
                  {r.curatorNotes}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--ink50)' }}>
                {t('encaje.matrix.signed')} {r.curatedBy} · {r.curatedAt}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/**
 * What the law actually demands for each post.
 *
 * This is what keeps the block above from reading as a disqualification. The
 * contrast is the finding: the officials who sign off the town's legality and
 * its payments must pass a national oposición with a university degree; the
 * ones who decide how the money is spent need only be of age and on the roll.
 */
export function QueExigeLaLey() {
  const t = useT()
  const { locale } = useLocale()
  const { data } = useRequisitosCargo()
  const roles = data?.roles || []
  if (!roles.length) return null
  const sources = new Map((data.sources || []).map((s) => [s.id, s]))
  const L = (obj) => (obj ? (obj[locale] ?? obj.es) : null)

  return (
    <section style={{ marginTop: 28 }}>
      <div
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'var(--ink50)',
        }}
      >
        {t('encaje.ley.eyebrow')}
      </div>
      <h2 style={{ fontSize: 19, fontWeight: 600, margin: '6px 0 12px' }}>
        {t('encaje.ley.title')}
      </h2>

      <div style={{ display: 'grid', gap: 10 }}>
        {roles.map((role) => (
          <div
            key={role.id}
            style={{
              border: '1px solid var(--border2)',
              borderRadius: 10,
              padding: '12px 14px',
              background: 'var(--card)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <strong style={{ fontSize: 14 }}>{L(role.label)}</strong>
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink50)' }}>
                {L(role.acceso)}
              </span>
            </div>

            <ul
              style={{
                margin: '8px 0 0',
                paddingLeft: 18,
                fontSize: 12.5,
                color: 'var(--ink70)',
                lineHeight: 1.6,
              }}
            >
              {role.requisitos.map((req) => {
                const src = sources.get(req.sourceId)
                return (
                  <li key={req.es}>
                    {L(req)}{' '}
                    {src && (
                      <ExtLink
                        href={src.url}
                        title={src.excerpt}
                        style={{ color: 'var(--civic)', textDecoration: 'none', fontSize: 11 }}
                      >
                        ↗
                      </ExtLink>
                    )}
                  </li>
                )
              })}
            </ul>

            <div
              style={{
                marginTop: 9,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--ink50)',
                }}
              >
                {t('encaje.ley.titulacion')}
              </span>
              <Pill tone={role.titulacionExigida ? 'intel' : 'warn'} size="xs">
                {role.titulacionExigida ? L(role.titulacionExigida) : t('encaje.ley.ninguna')}
              </Pill>
            </div>
            {role.titulacionNota && (
              <p
                style={{
                  margin: '7px 0 0',
                  fontSize: 12,
                  color: 'var(--ink60)',
                  lineHeight: 1.55,
                }}
              >
                {L(role.titulacionNota)}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
