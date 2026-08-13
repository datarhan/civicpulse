import { Link } from 'react-router-dom'
import { Pill, ExtLink } from './Primitives'
import { canonicalizeDepartment } from '../scraper/departments'
import { useT, useLocale } from '../i18n'
import {
  useAreaFit,
  useRequisitosCargo,
  fitRowsForSlug,
  relatedAreaNames,
  relatedCredentials,
  isPartialRelation,
  overallValue,
  sharedRespaldo,
  citesNothing,
  avisosForSlug,
} from '../hooks/useAreaFit'

/**
 * «Encaje declarado» — what the holder of an área declares having studied and
 * done, against the área's subject matter.
 *
 * Three rules are load-bearing and none of them is cosmetic:
 *
 *  · NO SCORE, EVER. The card names the credential a relation was found in, and
 *    names áreas only to say where that relation stops. It never counts either,
 *    never renders "4 de 7", and never sorts anyone. A percentage here would
 *    grade an elected official against a rubric no statute contains — and the
 *    law requires no qualification at all for the office, which is what
 *    QueExigeLaLey says out loud.
 *
 *  · EACH AXIS SAYS ITS OWN THING. «Formación» and «Experiencia» both used to
 *    print the área list, so on 4 of 11 cards they rendered identical text — a
 *    third and fourth copy of the portfolios already above them. Two labels over
 *    one fact reads as two findings. The card now prints what each axis is
 *    actually about (the título; the puesto) and adds «solo en …» ONLY where
 *    `isPartialRelation` holds. Where the relation reaches every área the person
 *    holds there is nothing to qualify, and the list was pure repetition. The
 *    full form with its institution or company stays on the área view, which has
 *    the room and the citations.
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
 *
 *  · THE BACKING IS STATED ONCE, NOT ONCE PER CHIP. While every assessment on a
 *    card rests on the same kind of source — today they all do — one sentence
 *    says so. A badge repeated identically beside every chip distinguishes
 *    nothing; that is how the cargoPublicoPrevio chip died. `sharedRespaldo`
 *    returns null the moment they diverge, and only then do per-item marks
 *    appear, where they would actually tell two items apart.
 *
 *  · BUT EVERY CARD SAYS WHAT IT COMPARED. The card whose every assessment is
 *    negative is the one a reader will judge hardest, and it was the one that
 *    ended up with no provenance at all: nothing cites, so no backing sentence
 *    applied, so two bare negative labels stood alone under a warning frame.
 *    `ComparadoLine` covers that case. Stating what was read is not the same as
 *    claiming a check nobody ran.
 */

const TONE = {
  relacionada: 'ok',
  'sin-relacion-declarada': 'neutral',
  'no-consta': 'ghost',
}

/**
 * Backing values that have published copy.
 *
 * `sin-clasificar` is deliberately absent: the published validator refuses it,
 * and `t()` falls back to the raw key, so an unexpected value would print
 * "encaje.respaldo.sin-clasificar" on a page about a named person instead of
 * rendering nothing. The gate is here, not in the translation table.
 */
const RESPALDO_CON_COPIA = ['autodeclarada', 'corroborada', 'discrepancia-documentada']

function valueLabel(t, value) {
  return t(`encaje.value.${value}`)
}

/**
 * A curator-signed biography warning.
 *
 * Attribution is the whole design, and THE EYEBROW FOLLOWS WHAT IS ACTUALLY
 * PRINTED. `verbatim` is read from the report at publication time — nothing here
 * is written by a model — but one branch does not print it: `eje: 'area'` on the
 * compact card renders a fixed sentence of OUR OWN, because the caveat has to
 * fit under two chip rows. Labelling that sentence "Advertencia de la biografía"
 * attributed a CivicPulse sentence to a document that did not write it. The
 * paraphrase was faithful, so nothing false was published — but on a page that
 * names living people, who said a sentence is part of what the sentence says.
 *
 * So: the biography is credited only where the biography is quoted. Everywhere
 * else the warning is labelled as ours, about this ficha. The « » quotes are the
 * attribution device, and the eyebrow must not outrun them.
 *
 * `eje: 'area'` gets its own fixed sentence because it is not a note about the
 * person at all: it says the ROW may be judging an área they no longer hold.
 */
function Aviso({ aviso, quote = false }) {
  const t = useT()
  const isArea = aviso.eje === 'area'
  // The single rule: is the biography's own text on screen in this block?
  const showsVerbatim = quote || !isArea
  return (
    <div
      style={{
        marginTop: 6,
        paddingLeft: 8,
        borderLeft: '2px solid var(--warn)',
        fontSize: 'var(--fs-micro)',
        color: 'var(--ink70)',
        lineHeight: 1.45,
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: 'var(--warn-ink)',
        }}
      >
        {showsVerbatim ? t('encaje.aviso.label') : t('encaje.aviso.label.ficha')}
        {!isArea &&
          ` · ${t(`encaje.field.${aviso.eje}`)} · ${t(`encaje.aviso.${aviso.direccion}`)}`}
      </span>
      {isArea && <div style={{ marginTop: 2 }}>{t('encaje.aviso.area')}</div>}
      {showsVerbatim && (
        <div
          style={{
            marginTop: 4,
            paddingLeft: 10,
            borderLeft: '3px solid var(--civic)',
            fontWeight: 500,
            color: 'var(--ink)',
            maxWidth: '68ch',
          }}
        >
          «&nbsp;{aviso.verbatim}&nbsp;»
        </div>
      )}
    </div>
  )
}

/** The one-line backing statement, or nothing when there is no citation to describe. */
function RespaldoLine({ value, style = {} }) {
  const t = useT()
  if (!RESPALDO_CON_COPIA.includes(value)) return null
  return (
    <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', lineHeight: 1.45, ...style }}>
      {t(`encaje.respaldo.${value}`)}
    </div>
  )
}

/**
 * What the card was compared against, for a card that cites nothing at all.
 *
 * Not a variant of `RespaldoLine`: every sentence there is about «lo que aquí se
 * cita», and with no citation none of them is true. This one names the document
 * the comparison was made against and stops. It must not say a source failed to
 * corroborate anything — nothing was cited, so nothing was checked, and an
 * absence published as a result is the exact defect the wording above was
 * narrowed to avoid.
 */
function ComparadoLine({ style = {} }) {
  const t = useT()
  return (
    <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', lineHeight: 1.45, ...style }}>
      {t('encaje.card.sinCita')}
    </div>
  )
}

/** The per-item mark, used ONLY where the items disagree. */
function RespaldoMark({ value }) {
  const t = useT()
  if (!RESPALDO_CON_COPIA.includes(value)) return null
  return (
    <span
      className="mono"
      style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', whiteSpace: 'nowrap' }}
    >
      {t(`encaje.respaldo.mark.${value}`)}
    </span>
  )
}

/** How many items of a list the card prints before it stops. */
const CARD_LIST_LIMIT = 3

/**
 * A source-ordered list, cut at three, with the remainder as «+N».
 *
 * «+2» is a count of what is HIDDEN, which is why it does not breach the
 * no-score rule: it says the line was truncated, not how the person scored.
 * What it must never become is a count of the áreas a relation was found in —
 * that is the same number a grade would print. Shared by both lists on purpose:
 * the credential line and the «solo en» line were two hand-copies of this
 * arithmetic, and the second one is exactly where an off-by-one lives unnoticed.
 */
function TruncatedList({ items }) {
  const shown = items.slice(0, CARD_LIST_LIMIT)
  const hidden = items.length - shown.length
  return (
    <>
      {shown.join(' · ')}
      {hidden > 0 && <span style={{ color: 'var(--ink50)' }}>{` +${hidden}`}</span>}
    </>
  )
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
  // One value for the whole card, or null when the assessments disagree — the
  // switch between "say it once" and "mark each item".
  const shared = sharedRespaldo(rows)
  // Signed only, and normally zero. An empty list renders nothing at all: an
  // empty warning box would imply something is missing when nothing is.
  const avisosArea = avisosForSlug(data, official.slug, 'area')

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
          fontSize: 'var(--fs-micro)',
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: 'var(--ink50)',
          marginBottom: 6,
        }}
      >
        {t('encaje.eyebrow')}
      </div>

      {/* Above the chips, never on one: the delegation changed, so the ROW may
          be judging an área this person no longer holds. That is a correctness
          caveat about our data, not a remark about them. */}
      {avisosArea.map((a) => (
        <Aviso key={`${a.reportId}#${a.avisoIndex}`} aviso={a} />
      ))}

      {fields.map((field) => {
        const value = overallValue(rows, field)
        if (!value) return null
        // What this axis is about, and — only where the relation stops short of
        // the person's whole delegation — where it was found.
        const credenciales = relatedCredentials(rows, field)
        const areas = isPartialRelation(rows, field) ? relatedAreaNames(rows, field) : []
        // Only when the card as a whole diverges, and only for the axis that
        // actually agrees with itself: marking every chip when they all say the
        // same thing is the noise this design exists to avoid.
        const mark = shared ? null : sharedRespaldo(rows, [field])
        const avisosCampo = avisosForSlug(data, official.slug, field)
        return (
          <div key={field} style={{ marginBottom: 3 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                fontSize: 'var(--fs-micro)',
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: 'var(--ink50)', flexShrink: 0, minWidth: 104 }}>
                {t(`encaje.field.${field}`)}
              </span>
              {/* The Pill remains the whole answer for `sin-relacion-declarada`
                  and `no-consta`: neither has a credential to name, and both are
                  statements the tone is carrying. A `relacionada` assessment
                  always cites at least one item (resolveAssessment refuses
                  otherwise), so the empty fallback is unreachable in published
                  data — it stays because a stub without evidence must degrade to
                  the label, never to a blank line beside a person's name. */}
              {value === 'relacionada' && credenciales.length > 0 ? (
                <span style={{ color: 'var(--ink)', minWidth: 0 }}>
                  <TruncatedList items={credenciales} />
                  {areas.length > 0 && (
                    <span
                      style={{
                        display: 'block',
                        color: 'var(--ink50)',
                        fontSize: 'var(--fs-micro)',
                      }}
                    >
                      {t('encaje.card.soloEn')} <TruncatedList items={areas} />
                    </span>
                  )}
                </span>
              ) : (
                <Pill tone={TONE[value]} size="xs">
                  {valueLabel(t, value)}
                </Pill>
              )}
              {mark && <RespaldoMark value={mark} />}
            </div>
            {avisosCampo.map((a) => (
              <Aviso key={`${a.reportId}#${a.avisoIndex}`} aviso={a} />
            ))}
          </div>
        )
      })}

      {/* Said once for the whole card, and SOMETHING is always said. `shared`
          null covers two different situations: the assessments disagree, and the
          marks above carry it; or nothing cites anything, and there is no
          backing to describe — but there is still a document all of it was
          compared against, and a card that stated neither read as a verdict.
          «no consta» is still not «autodeclarada»: the second line claims no
          citation and no corroboration check. */}
      {shared ? (
        <RespaldoLine value={shared} style={{ marginTop: 7 }} />
      ) : (
        citesNothing(rows) && <ComparadoLine style={{ marginTop: 7 }} />
      )}

      <div
        style={{
          marginTop: 4,
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          lineHeight: 1.45,
        }}
      >
        {/* Underlined, not just tinted. These sit INSIDE a sentence, and WCAG
          2.1 AA (link-in-text-block) requires a link in running text to be
          distinguishable without relying on colour — axe flags all 22 of them
          otherwise. Standalone links elsewhere on the card keep the house
          no-underline style; the rule is about links embedded in prose. */}
        {bioRoute && (
          <>
            <Link to={bioRoute} style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
              {t('encaje.card.gaps')}
            </Link>
            {' · '}
          </>
        )}
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
        fontSize: 'var(--fs-micro)',
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

  // Same rule as the card, one level down: while every cited assessment here
  // rests on the same kind of source, the section says it once above the áreas
  // instead of repeating a mark inside each one.
  const shared = sharedRespaldo(rows)
  // ALL of them, once, above the grid — not inside each área card. A warning is
  // a fact about the biography, so repeating it under all four áreas someone
  // holds would multiply one sentence into four apparent findings.
  const avisos = avisosForSlug(data, official.slug)

  return (
    <section style={{ marginTop: 28 }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'var(--ink50)',
        }}
      >
        {t('encaje.eyebrow')}
      </div>
      <h2 style={{ fontSize: 'var(--fs-card)', fontWeight: 600, margin: '6px 0 4px' }}>
        {t('encaje.matrix.title')}
      </h2>
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          lineHeight: 1.55,
          margin: '0 0 14px',
        }}
      >
        {t('encaje.matrix.intro')}
      </p>

      {avisos.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {avisos.map((a) => (
            <Aviso key={`${a.reportId}#${a.avisoIndex}`} aviso={a} quote />
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((r) => {
          const dept = r.departmentSlug || canonicalizeDepartment(r.portfolio)
          return (
            <div
              key={r.portfolio}
              style={{
                border: '1px solid var(--border2)',
                borderRadius: 'var(--r-card)',
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
                <strong style={{ fontSize: 'var(--fs-body)' }}>{r.portfolio}</strong>
                {dept && (
                  <Link
                    to={`/departamentos/${dept}`}
                    style={{
                      fontSize: 'var(--fs-micro)',
                      color: 'var(--civic)',
                      textDecoration: 'none',
                    }}
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
                          fontSize: 'var(--fs-micro)',
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
                      {/* Only where it tells two assessments apart. While the
                          section-level line above holds, this is silent. */}
                      {!shared && <RespaldoMark value={a.respaldo} />}
                    </div>
                    {a.evidence?.length > 0 && (
                      <ul
                        style={{
                          margin: '5px 0 0 120px',
                          padding: 0,
                          listStyle: 'none',
                          fontSize: 'var(--fs-meta)',
                          color: 'var(--ink70)',
                          lineHeight: 1.5,
                        }}
                      >
                        {a.evidence.map((ev) => (
                          <li key={ev.label}>
                            {ev.label}{' '}
                            <span
                              className="mono"
                              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                            >
                              [{ev.sourceIds.join(', ')}]
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {a.value === 'no-consta' && bioRoute && (
                      <div style={{ margin: '4px 0 0 120px', fontSize: 'var(--fs-micro)' }}>
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
                    fontSize: 'var(--fs-micro)',
                    color: 'var(--ink50)',
                    lineHeight: 1.5,
                  }}
                >
                  {r.curatorNotes}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                {t('encaje.matrix.signed')} {r.curatedBy} · {r.curatedAt}
              </div>
            </div>
          )
        })}
      </div>

      {/* BELOW the áreas, not above them. The sentence describes the citations
          listed in the grid; rendered before it, "lo que aquí se cita" pointed
          backwards at the intro paragraph, which cites nothing. */}
      {shared && (
        <RespaldoLine value={shared} style={{ fontSize: 'var(--fs-meta)', marginTop: 10 }} />
      )}
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
          fontSize: 'var(--fs-micro)',
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'var(--ink50)',
        }}
      >
        {t('encaje.ley.eyebrow')}
      </div>
      <h2 style={{ fontSize: 'var(--fs-card)', fontWeight: 600, margin: '6px 0 12px' }}>
        {t('encaje.ley.title')}
      </h2>

      <div style={{ display: 'grid', gap: 10 }}>
        {roles.map((role) => (
          <div
            key={role.id}
            style={{
              border: '1px solid var(--border2)',
              borderRadius: 'var(--r-card)',
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
              <strong style={{ fontSize: 'var(--fs-body)' }}>{L(role.label)}</strong>
              <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                {L(role.acceso)}
              </span>
            </div>

            <ul
              style={{
                margin: '8px 0 0',
                paddingLeft: 18,
                fontSize: 'var(--fs-meta)',
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
                        style={{
                          color: 'var(--civic)',
                          textDecoration: 'none',
                          fontSize: 'var(--fs-micro)',
                        }}
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
                  fontSize: 'var(--fs-micro)',
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
                  fontSize: 'var(--fs-meta)',
                  color: 'var(--ink50)',
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
