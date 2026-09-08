import { Link } from 'react-router-dom'
import { Card, ExtLink, LegendDot, PartyTag, SectionHead } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useOfficials, partyColor } from '../hooks/useOfficials'
import { barItems } from '../lib/party-order'
import {
  useIspa,
  ispaLatest,
  formatEuros,
  formatEurosCents,
  retribucionesSplit,
  alcaldeSerie,
} from '../hooks/useIspa'
import { useDedicaciones, dedicacionForSlug, fijadoTramos } from '../hooks/useDedicaciones'
import { useJsonFetch } from '../hooks/useJsonFetch'
import { useBioReportRoutes } from '../hooks/useBioReportRoutes'
import { useQuejas } from '../hooks/useQuejas'
import { useSocialFor, SOCIAL_PLATFORM_META } from '../hooks/useOfficialsSocial'
import { canonicalizeDepartments, DEPARTMENT_LABEL } from '../scraper/departments'
import { EncajeCard } from '../components/EncajeDeclarado'
import { mailboxKinds } from '../lib/mailboxes'
import { fmtDateLong } from '../lib/formatters'
import { useT, useLocale } from '../i18n'

/**
 * Verified public accounts for this official.
 *
 * Renders ONLY curator-promoted rows (public/data/officials-social.json); the
 * machine suggestions are never fetched by the app. Nothing renders when an
 * official has no verified account — an absent row means "not verified", not
 * "no presence", and an honest blank beats a guess on a named person's card.
 */
function SocialLinks({ slug }) {
  const { accounts } = useSocialFor(slug)
  if (accounts.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {accounts.map((a) => {
        const meta = SOCIAL_PLATFORM_META[a.platform] ?? { label: a.platform, glyph: '↗' }
        return (
          <ExtLink
            key={a.platform}
            href={a.url}
            title={`${meta.label}: @${a.handle} — verificado por ${a.curator ?? 'curación'}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              borderRadius: 'var(--r-pill)',
              border: '1px solid var(--border2)',
              background: 'var(--soft)',
              color: 'var(--ink70)',
              fontSize: 'var(--fs-micro)',
              textDecoration: 'none',
            }}
          >
            <span aria-hidden="true" className="mono">
              {meta.glyph}
            </span>
            <span>{meta.label}</span>
          </ExtLink>
        )
      })}
    </div>
  )
}

function QuejaBadge({ slug }) {
  const { data } = useQuejas()
  const stats = data?.stats?.byConcejal?.[slug]
  if (!stats || stats.total === 0) return null
  const ok = stats.resueltas
  const pending = stats.pendientes
  const silencios = stats.silencios
  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px dashed var(--border2)',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        fontSize: 'var(--fs-micro)',
        flexWrap: 'wrap',
      }}
    >
      <Link
        to="/quejas"
        className="mono"
        style={{
          color: 'var(--ink50)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          textDecoration: 'none',
        }}
      >
        Quejas asignadas
      </Link>
      <span className="mono" style={{ fontWeight: 700, color: 'var(--ink)' }}>
        {stats.total}
      </span>
      <span style={{ color: 'var(--ok-ink)' }}>✓ {ok}</span>
      <span style={{ color: 'var(--civic)' }}>⏳ {pending}</span>
      {silencios > 0 && <span style={{ color: 'var(--crit-ink)' }}>⚠ {silencios}</span>}
    </div>
  )
}

/**
 * Where this councillor's areas lead in the site, NOT what they hold.
 *
 * These are department pages, and a department is reachable from more than one
 * portfolio: several councillors legitimately show the same chip. Rendered bare
 * — a lone word under a person's name — the row reads as a list of their
 * competences instead, and on 2026-08-24 a reader took «Urbanismo →» on Rafael
 * Gómez Sánchez's card (from his área «Urbanizaciones») as a contradiction of
 * /eficiencia, which names Teresa Pozuelo Martín over the urbanismo figure.
 * Both pages were right; the unlabelled chip was not. The delegated areas
 * verbatim are printed above by the caller — this row is navigation, and now
 * says so.
 */
const MAX_CHIPS = 4

function DepartmentLinks({ portfolios }) {
  const { locale } = useLocale()
  const t = useT()
  // Collect unique slugs from all portfolios — some officials own 3-4
  // concejalías and the user should be able to jump to any of them.
  const slugs = []
  const seen = new Set()
  for (const p of portfolios ?? []) {
    // Every department a compound área names, not only the longest match:
    // «Juventud y Servicios Jurídicos» leads to Juventud too.
    for (const s of canonicalizeDepartments(p)) {
      if (!seen.has(s)) {
        slugs.push(s)
        seen.add(s)
      }
    }
  }
  if (slugs.length === 0) return null
  const shown = slugs.slice(0, MAX_CHIPS)
  const hidden = slugs.length - shown.length
  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px dashed var(--border2)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        gap: 6,
        fontSize: 'var(--fs-micro)',
      }}
    >
      <span
        className="mono"
        style={{
          color: 'var(--ink50)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          fontSize: 'var(--fs-micro)',
        }}
      >
        {t('cargos.card.departamentos')}
      </span>
      {shown.map((slug) => (
        <Link
          key={slug}
          to={`/departamentos/${slug}`}
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            padding: '2px 7px',
            background: 'var(--civic-soft)',
            color: 'var(--civic-ink)',
            borderRadius: 'var(--r-input)',
            letterSpacing: '.04em',
            textDecoration: 'none',
          }}
        >
          {locale === 'ca' ? DEPARTMENT_LABEL[slug].ca : DEPARTMENT_LABEL[slug].es} →
        </Link>
      ))}
      {/* Never a silent cap: a row that stops at four without saying so reads
          as "these are all of them". */}
      {hidden > 0 && (
        <span className="mono" style={{ color: 'var(--ink50)' }}>
          {t('cargos.card.departamentos.mas').replace('{n}', hidden)}
        </span>
      )}
    </div>
  )
}

// Per-councillor salary mapped by ROLE: the pleno acuerdo (Exp 4533/2023)
// assigns each dedicación exclusiva to a cargo + its delegated áreas, which
// match the officials.json portfolios verbatim → a named, cited figure for each
// of the 7.
//
// The 14 sin-dedicación councillors get NO figure here, and that is a rule
// rather than a gap: ISPA's councillor rows carry an amount and a dedicación
// but no name, so the only honest place for their money is the distribution in
// RetribucionesPanel. What this badge says instead is what régimen they are on
// — which the acuerdo does state — so the card never reads as "paid nothing".
function RetribucionBadge({ official }) {
  const { data } = useDedicaciones()
  const t = useT()
  const d = dedicacionForSlug(data, official.slug)
  if (!d) {
    return (
      <div
        style={{
          marginTop: 10,
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          flexWrap: 'wrap',
          fontSize: 'var(--fs-micro)',
        }}
      >
        <span className="mono" style={{ fontWeight: 700, color: 'var(--warn-ink)' }}>
          {t('cargos.retri.asistenciasCargo')}
        </span>
        <span style={{ color: 'var(--ink50)' }}>{t('cargos.retri.asistenciasCargoNota')}</span>
      </div>
    )
  }
  return (
    <div
      style={{
        marginTop: 10,
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        flexWrap: 'wrap',
        fontSize: 'var(--fs-micro)',
      }}
    >
      <span className="mono" style={{ fontWeight: 700, color: 'var(--ink)' }}>
        {formatEurosCents(d.amountEuros)}
      </span>
      <span style={{ color: 'var(--ink50)' }}>
        {t('cargos.retri.fijadoPor').replace('{dedicacion}', d.dedicacion)}
      </span>
      {data.source?.url && (
        <ExtLink
          href={data.source.url}
          title={`${d.role} — ${data.source.title}`}
          className="mono"
          style={{ color: 'var(--civic)', fontSize: 'var(--fs-micro)' }}
        >
          acuerdo ↗
        </ExtLink>
      )}
    </div>
  )
}

/**
 * The alcalde's ISPA series, with the year ISPA does not publish left OPEN.
 *
 * The page used to paint the four available years as a row of ↑↓ arrows, so
 * 2024's arrow compared against 2022 as though the two were consecutive:
 * 52.855,48 € → 48.647,50 € read as an 8 % annual fall when it spans two
 * years. A missing year is not a shorter axis. It gets a slot of its own, the
 * full width of the hole it leaves, and it is labelled — an electoral year has
 * two office-holders in one exercise, which is also why 2019 and 2023 are
 * never used as a comparison base.
 */
function AlcaldeSerie({ data }) {
  const slots = alcaldeSerie(data)
  const datos = slots.filter((s) => s.tipo === 'dato')
  if (datos.length < 2) return null
  const W = 640
  const n = slots.length
  const slotW = W / n
  const bw = Math.min(slotW * 0.56, 70)
  const suelo = 80
  const techo = 8
  const maxV = Math.max(...datos.map((d) => d.amountEuros))
  const cx = (i) => i * slotW + slotW / 2
  const alto = (v) => Math.max(2, (v / maxV) * (suelo - techo))
  const hueco = slots.find((s) => s.tipo === 'hueco')
  return (
    <div style={{ marginTop: 16 }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--ink50)',
        }}
      >
        Retribución del alcalde percibida por año · ISPA
      </div>
      {/* The bars carry no text. A <text> inside a viewBox is measured in
          viewBox units, so a label that reads at 12px on a desktop renders at
          five on a phone — which is why the type scale forbids one there. The
          labels are real HTML below, at a real token size, in a row of equal
          cells that lines up with the slots because both divide the same width
          into the same n. */}
      <svg
        viewBox={`0 0 ${W} ${suelo}`}
        width="100%"
        height="88"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Retribución percibida por el alcalde en cada entrega del ISPA${hueco ? `. La serie no publica ${hueco.desde}` : ''}.`}
        style={{ display: 'block', marginTop: 10 }}
      >
        <line x1="0" y1={suelo - 0.5} x2={W} y2={suelo - 0.5} stroke="var(--border)" />
        {slots.map((s, i) => {
          if (s.tipo !== 'hueco') return null
          // The band spans the hole EXACTLY: from the right edge of the bar
          // before it to the left edge of the bar after. A band narrower than
          // its own gap is the defect /eficiencia shipped — 90px of marker
          // floating inside a 181px hole, blank on both sides.
          const izq = cx(i - 1) + bw / 2
          const der = cx(i + 1) - bw / 2
          return (
            <rect
              key={`h${s.desde}`}
              x={izq}
              y={2}
              width={der - izq}
              height={suelo - 2}
              fill="var(--warn-soft)"
              stroke="var(--warn)"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
              data-hueco={`${s.desde}-${s.hasta}`}
            />
          )
        })}
        {slots.map((s, i) =>
          s.tipo === 'dato' ? (
            <rect
              key={s.year}
              x={cx(i) - bw / 2}
              y={suelo - alto(s.amountEuros)}
              width={bw}
              height={alto(s.amountEuros)}
              fill="var(--civic)"
              data-barra={s.year}
            >
              <title>{`${s.year}: ${formatEurosCents(s.amountEuros)}`}</title>
            </rect>
          ) : null,
        )}
      </svg>
      <div style={{ display: 'flex', marginTop: 6 }}>
        {slots.map((s) => (
          <div
            key={s.tipo === 'dato' ? s.year : `h${s.desde}`}
            style={{ flex: 1, minWidth: 0, textAlign: 'center' }}
            data-rotulo={s.tipo === 'dato' ? s.year : `hueco-${s.desde}`}
          >
            {s.tipo === 'dato' ? (
              <>
                <div
                  className="mono"
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                >
                  {s.year}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink70)', fontWeight: 700 }}
                >
                  {formatEuros(s.amountEuros)}
                </div>
              </>
            ) : (
              <>
                <div
                  className="mono"
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--warn-ink)' }}
                >
                  {s.desde === s.hasta ? s.desde : `${s.desde}–${s.hasta}`}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--warn-ink)' }}
                >
                  sin dato
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <p
        style={{
          margin: '10px 0 0',
          fontSize: 'var(--fs-meta)',
          lineHeight: 1.55,
          color: 'var(--ink50)',
          maxWidth: '78ch',
        }}
      >
        {hueco ? (
          <>
            La serie ISPA no publica{' '}
            {hueco.desde === hueco.hasta ? hueco.desde : `${hueco.desde}–${hueco.hasta}`}, así que{' '}
            <strong>no hay variación interanual</strong> entre las dos barras que rodean el hueco:
            son dos años de distancia y el hueco se dibuja. Los años electorales distorsionan el
            importe percibido —hay dos titulares en el mismo ejercicio—, y por eso no se usan como
            base de comparación.
          </>
        ) : (
          <>
            La serie no tiene huecos: cada barra es la entrega de su año. Los años electorales
            distorsionan el importe percibido —hay dos titulares en el mismo ejercicio—, y por eso
            no se usan como base de comparación.
          </>
        )}
      </p>
    </div>
  )
}

/**
 * What the corporación is paid, in the two forms it is paid in.
 *
 * Seven draw a salary the pleno fixed; fourteen are paid per session attended.
 * The page used to print only the first, so fourteen cards carried no figure at
 * all — and ISPA gives every one of them between 4.582,49 € and 16.858,04 €.
 * The data was already on the page and the layout hid it.
 *
 * Two things this panel will not do. It never adjudicates an asistencias figure
 * to a person: ISPA's councillor rows are anonymous, so they render as a
 * distribution. And it never prints a subtotal it has not reconciled —
 * `cuadra` re-derives the split against the counts and the total the parser
 * computed on its own, and the columns withhold their sums when they disagree.
 * A panel that prints its own all-clear is the `r?.findings ?? []` defect in
 * another costume.
 */
function RetribucionesPanel() {
  const t = useT()
  const { data } = useIspa()
  const { data: dedic } = useDedicaciones()
  const latest = ispaLatest(data)
  const split = retribucionesSplit(data)
  const fijado = fijadoTramos(dedic)
  if (!latest || !split) return null
  const alcaldeAcuerdo = (dedic?.byOfficial ?? []).find((o) => /alcald/i.test(o.role || ''))
  const alcaldeIspa = latest.alcalde?.amountEuros
  return (
    <Card style={{ marginTop: 18 }}>
      {/* Its own header rather than SectionHead's `right` slot: that slot is a
          flex child with no wrap, so at 375px the total kept its full width and
          squeezed the title column to ELEVEN pixels. Measured, not guessed. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              fontWeight: 700,
              letterSpacing: '.1em',
            }}
          >
            {t('cargos.retri.eyebrow').replace('{n}', split.con.count + split.sin.count)}
          </div>
          <h3 className="cp-sec-head cp-sec-head-xl" style={{ marginTop: 3 }}>
            {t('cargos.retri.title')}
          </h3>
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            className="mono"
            style={{ fontSize: 'var(--fs-card)', fontWeight: 700, letterSpacing: '-.02em' }}
          >
            {formatEurosCents(split.total)}
          </div>
          {/* «Retribuciones y asistencias», nunca «coste de la corporación»: el
              ISPA suma lo percibido por los electos y deja fuera las cuotas
              empresariales, el personal eventual y la asignación a los grupos.
              La palabra equivocada sobre la cifra correcta ya se corrigió una
              vez en esta misma página. */}
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
            {t('cargos.ispa.total')
              .replace('{n}', split.con.count + split.sin.count)
              .replace('{year}', latest.year)}
          </div>
        </div>
      </div>

      {!split.cuadra && (
        <div
          style={{
            margin: '4px 0 14px',
            padding: '10px 12px',
            border: '1px solid var(--warn-soft)',
            borderLeft: '3px solid var(--warn)',
            borderRadius: 'var(--r-input)',
            fontSize: 'var(--fs-aux)',
            color: 'var(--warn-ink)',
            lineHeight: 1.5,
          }}
        >
          {t('cargos.retri.noCuadra')}
        </div>
      )}

      <div className="cp-cargos-retri" style={{ marginTop: 14 }}>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--civic-ink)',
            }}
          >
            {split.con.count} con dedicación exclusiva
            {split.cuadra && ` · ${formatEuros(split.con.sum)} percibidos`}
          </div>
          {fijado && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingBottom: 6,
                  borderBottom: '1px solid var(--border2)',
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-micro)',
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    color: 'var(--ink50)',
                  }}
                >
                  Cargo
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-micro)',
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    color: 'var(--ink50)',
                    textAlign: 'right',
                  }}
                >
                  Fijado · acuerdo {String(dedic?.source?.date ?? '').slice(0, 4)}
                </span>
              </div>
              {fijado.tramos.map((tr) => (
                <div
                  key={tr.amountEuros}
                  style={{ padding: '8px 0', borderBottom: '1px solid var(--border2)' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <span style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
                      {tr.count > 1
                        ? `${tr.count} concejalías con dedicación`
                        : (tr.roles[0] ?? 'Cargo')}
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: 'var(--fs-body)',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {formatEurosCents(tr.amountEuros)}
                    </span>
                  </div>
                  {/* Verbatim from the acuerdo: it names the cargo, not the
                      person, and rewriting one to fit the column would be
                      paraphrasing a legal act. A single-role tramo already
                      carries that name on the line above, so listing it again
                      underneath just printed «Alcaldía / Alcaldía». */}
                  {tr.count > 1 && (
                    <div
                      style={{
                        fontSize: 'var(--fs-micro)',
                        color: 'var(--ink50)',
                        marginTop: 3,
                        lineHeight: 1.4,
                      }}
                    >
                      {tr.roles.join(' · ')}
                    </div>
                  )}
                </div>
              ))}
              <p
                style={{
                  margin: '11px 0 0',
                  fontSize: 'var(--fs-micro)',
                  lineHeight: 1.55,
                  color: 'var(--ink50)',
                }}
              >
                Los importes de arriba son lo <strong>fijado</strong> por cargo en el{' '}
                {dedic?.source?.url ? (
                  <ExtLink href={dedic.source.url} style={{ color: 'var(--civic)' }}>
                    acuerdo de pleno de {fmtDateLong(dedic.source.date)} ↗
                  </ExtLink>
                ) : (
                  'acuerdo de pleno'
                )}
                {dedic?.source?.expediente ? ` (exp. ${dedic.source.expediente})` : ''} y suman{' '}
                <span className="mono">{formatEurosCents(fijado.sum)}</span>. El total de la
                cabecera es otra serie: lo <strong>percibido</strong> en {latest.year} según el
                ISPA.
              </p>
            </div>
          )}
        </div>

        <div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--warn-ink)',
            }}
          >
            {split.sin.count} sin dedicación
            {split.cuadra && ` · ${formatEuros(split.sin.sum)} en asistencias`}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 3,
              height: 74,
              marginTop: 12,
            }}
          >
            {split.sin.amounts.map((v, i) => (
              <span
                key={i}
                title={`${formatEurosCents(v)} · concejal sin identificar (las filas del ISPA son anónimas)`}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: `${Math.max(6, (v / split.sin.max) * 100)}%`,
                  background: 'var(--warn)',
                }}
              />
            ))}
          </div>
          <div
            className="mono"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              marginTop: 6,
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
            }}
          >
            <span>{formatEurosCents(split.sin.min)}</span>
            <span style={{ textAlign: 'center' }}>
              {split.sin.count} concejales, de menor a mayor
            </span>
            <span>{formatEurosCents(split.sin.max)}</span>
          </div>
          <p
            style={{
              margin: '11px 0 0',
              fontSize: 'var(--fs-micro)',
              lineHeight: 1.55,
              color: 'var(--ink50)',
            }}
          >
            Asistencias por sesión: se cobra por acudir, así que la cifra varía con la asistencia de
            cada uno. <strong>Las filas de concejal del ISPA son anónimas</strong> —importe y
            dedicación, sin nombre—, por eso se muestran como reparto y no se adjudican a nadie.
          </p>
        </div>
      </div>

      {/* The finding that reorders this page: two correct figures for the same
          salary sat 300px apart with nothing saying they measure different
          things, so the only available reading was that one of them was wrong. */}
      {alcaldeAcuerdo && typeof alcaldeIspa === 'number' && (
        <div
          style={{
            marginTop: 18,
            padding: '13px 15px',
            background: 'var(--civic-soft)',
            borderLeft: '3px solid var(--civic)',
            borderRadius: '0 var(--r-input) var(--r-input) 0',
          }}
        >
          <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 700 }}>
            Por qué el alcalde tiene dos cifras
          </div>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 'var(--fs-meta)',
              lineHeight: 1.6,
              color: 'var(--ink70)',
              maxWidth: '86ch',
            }}
          >
            El acuerdo de pleno le <em>fija</em>{' '}
            <span className="mono">{formatEurosCents(alcaldeAcuerdo.amountEuros)}</span> brutos
            anuales. El ISPA publica lo que <em>percibió</em> en {latest.year}:{' '}
            <span className="mono">{formatEurosCents(alcaldeIspa)}</span>. No se contradicen —una es
            la asignación, la otra la nómina— y sumar o comparar las dos series es el error que esta
            página facilitaba.{' '}
            {/* Derived, never restated: the trienios clause renders only while
                the acuerdo's own quote still carries it. If «(+ trienios)»
                leaves the source, the sentence leaves the page with it. */}
            {/\(\+\s*trienios\)/.test(dedic?.source?.quote || '') && t('cargos.ispa.trienios')}
          </p>
        </div>
      )}

      <AlcaldeSerie data={data} />

      <div
        style={{
          marginTop: 14,
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          lineHeight: 1.5,
          maxWidth: '86ch',
        }}
      >
        {t('cargos.ispa.totalNota')} {data.source?.note}{' '}
        {data.source?.home && (
          <ExtLink href={data.source.home} style={{ color: 'var(--civic)' }}>
            Fuente: ISPA · Ministerio de Hacienda y Función Pública ↗
          </ExtLink>
        )}
      </div>
    </Card>
  )
}

/**
 * The municipal workforce — deliberately below the elected members, and framed
 * as a different subject.
 *
 * It used to sit in the same column as the 21 electos, which put a 2021 press
 * figure for EMPLOYEES beside a 2024 count of authorised POSTS and invited a
 * reader to subtract one from the other. The two magnitudes never met a
 * sentence saying they are not comparable.
 */
function PlantillaBanda() {
  const t = useT()
  const { data } = useJsonFetch('/data/plantilla.json', null)
  if (!data || !data.total) return null
  const pct = (n) => Math.round((n / data.total) * 100)
  const anio = data.asOf ? String(data.asOf).slice(0, 4) : null
  return (
    <div
      style={{
        marginTop: 26,
        background: 'var(--soft)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card)',
        padding: 20,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--ink50)',
        }}
      >
        {t('cargos.plantilla.eyebrow')}
      </div>
      <div className="cp-cargos-duo" style={{ marginTop: 12 }}>
        <div>
          <h3 style={{ fontSize: 'var(--fs-head)', fontWeight: 700, margin: 0 }}>
            {t('cargos.plantilla.title')}
          </h3>
          <div
            style={{
              display: 'flex',
              gap: 26,
              marginTop: 10,
              alignItems: 'baseline',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div className="mono" style={{ fontSize: 'var(--fs-card)', fontWeight: 700 }}>
                {data.total}
              </div>
              <div
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
              >{`${t('cargos.plantilla.personas')}${anio ? ` · ${anio}` : ''}`}</div>
            </div>
            {data.authorized && typeof data.authorized.plazas === 'number' && (
              <div>
                <div
                  className="mono"
                  style={{ fontSize: 'var(--fs-card)', fontWeight: 700, color: 'var(--ink50)' }}
                >
                  {data.authorized.approx ? '≈' : ''}
                  {data.authorized.plazas}
                </div>
                <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
                  {t('cargos.plantilla.plazas')}
                  {data.authorized.asOf ? ` · ${data.authorized.asOf}` : ''}
                </div>
              </div>
            )}
          </div>
          {typeof data.women === 'number' && typeof data.men === 'number' && (
            <>
              {/* Two tones a reader can actually tell apart. The second
                  segment was --intel-soft, which is a #f5f0ff wash: against the
                  band's own light ground it vanished, so a 52/48 split read as
                  a bar filled to 52 % and nothing else. Each figure carries its
                  own swatch, so the mapping never depends on reading order. */}
              <div
                style={{
                  display: 'flex',
                  height: 10,
                  borderRadius: 'var(--r-pill)',
                  overflow: 'hidden',
                  marginTop: 14,
                }}
              >
                <span style={{ flex: data.women, background: 'var(--intel)' }} />
                <span style={{ flex: data.men, background: 'var(--ink30)' }} />
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  marginTop: 7,
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink70)',
                  flexWrap: 'wrap',
                }}
              >
                <LegendDot
                  color="var(--intel)"
                  label={
                    <span>
                      <span className="mono" style={{ fontWeight: 700 }}>
                        {data.women}
                      </span>{' '}
                      {t('cargos.plantilla.mujeres')} · {pct(data.women)} %
                    </span>
                  }
                />
                <LegendDot
                  color="var(--ink30)"
                  label={
                    <span>
                      <span className="mono" style={{ fontWeight: 700 }}>
                        {data.men}
                      </span>{' '}
                      {t('cargos.plantilla.hombres')} · {pct(data.men)} %
                    </span>
                  }
                />
              </div>
            </>
          )}
        </div>
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--fs-meta)',
              lineHeight: 1.6,
              color: 'var(--ink70)',
            }}
          >
            {data.note}
          </p>
          {data.authorized?.note && (
            <p
              style={{
                margin: '9px 0 0',
                fontSize: 'var(--fs-micro)',
                lineHeight: 1.55,
                color: 'var(--ink50)',
              }}
            >
              {data.authorized.note}{' '}
              {data.authorized.source?.url && (
                <ExtLink href={data.authorized.source.url} style={{ color: 'var(--civic)' }}>
                  Fuente: {data.authorized.source.publisher} ↗
                </ExtLink>
              )}
            </p>
          )}
          {data.source?.url && (
            <p
              style={{
                margin: '9px 0 0',
                fontSize: 'var(--fs-micro)',
                lineHeight: 1.55,
                color: 'var(--ink50)',
              }}
            >
              {t('cargos.plantilla.fuenteSexo')}{' '}
              <ExtLink href={data.source.url} style={{ color: 'var(--civic)' }}>
                {data.source.publisher}, {fmtDateLong(data.source.date)} ↗
              </ExtLink>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The published address, said to be what it is.
 *
 * Three of the twenty-one have their own address. Eleven share the alcaldía's
 * counter and six the PP group's Gmail — which is not even a municipal domain.
 * Printed bare under a face, a shared counter reads as that person's direct
 * line. The label is COUNTED from the roster, never listed by hand, so it
 * disappears on its own the day the council publishes individual addresses.
 */
function Correo({ o, kinds }) {
  const t = useT()
  const info = kinds.get(o.slug)
  if (!info) {
    return (
      <span className="mono" style={{ color: 'var(--ink50)' }}>
        {t('cargos.card.sinCorreo')}
      </span>
    )
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: 6,
        alignItems: 'baseline',
        flexWrap: 'wrap',
        minWidth: 0,
      }}
    >
      {/* The address breaks rather than overflows. In the five-column
          opposition grid a card is ~188px and popularesribarroja@gmail.com
          needs ~205, so an unbroken token pushed 15px of horizontal scroll
          into the grid and clipped the last characters of the address —
          which is the one thing the line exists to show. */}
      <a
        href={`mailto:${info.email}`}
        className="mono"
        style={{
          color: 'var(--ink70)',
          textDecoration: 'none',
          overflowWrap: 'anywhere',
          minWidth: 0,
        }}
      >
        {info.email}
      </a>
      {info.compartido && (
        <span style={{ color: 'var(--ink50)', fontSize: 'var(--fs-micro)' }}>
          {t('cargos.card.buzonCompartido').replace('{n}', info.n)}
        </span>
      )}
    </span>
  )
}

function Retrato({ o, size, radius = 'var(--r-card)' }) {
  const color = partyColor(o.party)
  if (o.photoUrl) {
    return (
      <img
        src={o.photoUrl}
        alt={o.name}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: 'cover',
          flexShrink: 0,
          border: `2px solid ${color}22`,
        }}
      />
    )
  }
  return (
    <div
      title={o.photoNote || undefined}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--soft)',
        color: 'var(--ink50)',
        fontWeight: 700,
      }}
    >
      {o.name
        .split(' ')
        .slice(0, 2)
        .map((x) => x[0])
        .join('')}
    </div>
  )
}

/**
 * One card per person, in the register the page is reading them in.
 *
 * `former` is a different card, not a dimmed one: every block below the header
 * — salary, department chips, encaje, quejas, social — is a present-tense
 * claim about a seat, and none of them may be painted over someone who no
 * longer holds it. What a former member keeps is what is history: name, party,
 * photograph, biography, and the acta that records the departure. A row the
 * corrections ADDED (`o.correccion`) carries its own provenance line and, when
 * the source publishes no portrait, says why the initials are there instead of
 * letting them read as a failed image.
 *
 * `oposicion` is a third register, and the same argument: a councillor with no
 * delegated área has no portfolio, no department chip and no encaje to assess,
 * and the compact card exists so that absence reads as the institutional fact
 * it is rather than as a card somebody forgot to fill in.
 */
function OfficialCard({ o, bioRoute, kinds, variant = 'gobierno' }) {
  const t = useT()
  const former = variant === 'former'
  const oposicion = variant === 'oposicion'
  const sourceUrl = former ? o.source?.url : o.correccion?.source?.url
  const sourceTitle = former ? o.source?.title : o.correccion?.source?.title
  return (
    <Card hover style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Retrato o={o} size={oposicion ? 44 : 52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <PartyTag tone={partyColor(o.party)}>{o.party}</PartyTag>
            {o.role === 'alcalde' && (
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'var(--civic-ink)',
                }}
              >
                Alcalde
              </span>
            )}
          </div>
          <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, lineHeight: 1.25 }}>
            <Link to={`/cargos/${o.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {o.name}
            </Link>
          </div>
          {former && (
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--warn-ink)', marginTop: 4 }}
            >
              {t(o.honorific === 'Sra.' ? 'cargos.card.hastaF' : 'cargos.card.hastaM').replace(
                '{fecha}',
                fmtDateLong(o.until),
              )}
              {' · '}
              {t(`cargos.baja.${o.reason}`)}
            </div>
          )}
          {!former && o.correccion?.tipo === 'alta' && (
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 4 }}
            >
              {t('cargos.card.altaDesde').replace('{fecha}', fmtDateLong(o.correccion.since))}
            </div>
          )}
          {o.photoNote && (
            <div
              className="mono"
              title={o.photoNote}
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
            >
              {t('cargos.card.sinRetrato')}
            </div>
          )}
        </div>
      </div>

      {/* Verbatim, as the council publishes them — the labelled list of what
          this person actually holds, above the navigation chips. */}
      {variant === 'gobierno' && o.portfolios.length > 0 && (
        <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border2)' }}>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--ink50)',
            }}
          >
            {t('cargos.gobierno.areas').replace('{n}', o.portfolios.length)}
          </div>
          <div
            style={{
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70)',
              marginTop: 5,
              lineHeight: 1.45,
            }}
          >
            {o.portfolios.join(' · ')}
          </div>
        </div>
      )}

      {variant === 'gobierno' && (
        <>
          <RetribucionBadge official={o} />
          <DepartmentLinks portfolios={o.portfolios} />
          <EncajeCard official={o} bioRoute={bioRoute} />
          <QuejaBadge slug={o.slug} />
          <SocialLinks slug={o.slug} />
        </>
      )}

      {oposicion && (
        <>
          <EncajeCard official={o} bioRoute={bioRoute} />
          <RetribucionBadge official={o} />
          <QuejaBadge slug={o.slug} />
        </>
      )}

      <div
        style={{
          marginTop: 'auto',
          paddingTop: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 10,
          flexWrap: 'wrap',
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
        }}
      >
        {/* Never a substitute address: the source published none, so the card
            says so instead of pointing a reader at somebody else's mailbox. */}
        <Correo o={o} kinds={kinds} />
        <span style={{ display: 'inline-flex', gap: 12, alignItems: 'baseline' }}>
          {sourceUrl && (
            <ExtLink
              href={sourceUrl}
              title={sourceTitle}
              className="mono"
              style={{ color: 'var(--civic)', textDecoration: 'none' }}
            >
              {t('cargos.card.acta')}
            </ExtLink>
          )}
          {/* Only the INTERNAL report is a link about this person. The council's
              `cvUrl` is the same transparency index for twenty of the twenty-one,
              so promising «Biografía» on each card and delivering a listing
              twenty times over is a promise the source cannot keep — the index
              is linked once, from the header. */}
          {bioRoute && (
            <Link
              to={bioRoute}
              title="Informe biográfico del agente periodista de CivicPulse"
              style={{ color: 'var(--civic)', textDecoration: 'none', fontWeight: 500 }}
            >
              Biografía →
            </Link>
          )}
        </span>
      </div>
    </Card>
  )
}

function CompositionBar({ composition, total }) {
  // The known parties fix the reading order; anything else in the snapshot is
  // APPENDED rather than dropped. A hard-coded allow-list here erased EU-Podem
  // — a party holding a real seat — so the bar painted 20 escaños under a label
  // reading «Total 21», and the councillor elected for it did not appear in the
  // corporation at all. A whitelist that silently discards live data is the
  // same defect this repo keeps finding in its enums; a party that wins a seat
  // must never depend on someone remembering to add it here.
  // The order and the painter live in lib/party-order and are imported by the
  // test that pins «every seat is painted», so neither can drift from the other.
  const items = barItems(composition)
  return (
    <div>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 15,
          borderRadius: 'var(--r-pill)',
          overflow: 'hidden',
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
              fontFamily: "'DM Mono', monospace",
              fontSize: 'var(--fs-micro)',
              fontWeight: 700,
            }}
          >
            {n}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 10,
          flexWrap: 'wrap',
          fontSize: 'var(--fs-micro)',
        }}
      >
        {items.map(({ p, n }) => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: partyColor(p) }} />
            <span style={{ fontWeight: 600 }}>{p}</span>
            <span className="mono" style={{ color: 'var(--ink50)' }}>
              {n}
            </span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', color: 'var(--ink50)' }} className="mono">
          Total {total} escaños
        </div>
      </div>
    </div>
  )
}

function CorporacionMunicipal() {
  const t = useT()
  const { loading, error, data } = useOfficials()
  const bioRoutes = useBioReportRoutes()
  const ispa = useIspa()
  const split = retribucionesSplit(ispa.data)
  // The mandate is the ACUERDO's own declaration, not a constant typed here:
  // officials.json does not carry one, and a hand-written «2023-2027» would
  // outlive the mandate it names.
  const { data: dedic } = useDedicaciones()

  if (loading) {
    return (
      <div style={{ marginBottom: 28, color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>
        Cargando Corporación Municipal…
      </div>
    )
  }
  if (error || !data) {
    return (
      <div
        style={{
          marginBottom: 28,
          padding: 12,
          border: '1px solid var(--warn-soft)',
          borderRadius: 'var(--r-input)',
          color: 'var(--warn-ink)',
          fontSize: 'var(--fs-aux)',
        }}
      >
        No se pudo cargar la Corporación Municipal. Ejecuta <code>npm run scrape:officials</code>{' '}
        para regenerar los datos.
      </div>
    )
  }

  const mayor = data.officials.find((o) => o.role === 'alcalde')
  // Who governs and who scrutinises, DERIVED from the delegated áreas rather
  // than from a party name: the sentence has to survive a coalition, a
  // reshuffle, and a councillor who leaves the governing group.
  const conAreas = data.officials.filter((o) => (o.portfolios ?? []).length > 0)
  const gobierno = [
    ...(mayor && conAreas.includes(mayor) ? [mayor] : []),
    ...conAreas.filter((o) => o !== mayor),
  ]
  const oposicion = data.officials.filter((o) => (o.portfolios ?? []).length === 0)
  const partidosGobierno = [...new Set(gobierno.map((o) => o.party))]
  const partidoUnico = partidosGobierno.length === 1 ? partidosGobierno[0] : null
  const former = data.formerOfficials ?? []
  const corr = data.corrections
  const kinds = mailboxKinds(data.officials)
  // Derived from the snapshot's own block, never typed: the second line of
  // the stamp exists exactly when a correction does, and counts what it counts.
  const nCorr = corr ? (corr.bajas ?? 0) + (corr.altas ?? 0) : 0
  const generatedDate = fmtDateLong(data.generatedAt)
  // La página que las publica TODAS, que es el propio origen del padrón.
  //
  // Esto salía de `officials.find(o => o.cvUrl).cvUrl`, y funcionaba mientras
  // los 21 cvUrl eran el MISMO índice del portal. Desde la mudanza cada uno es
  // el PDF de su persona, así que ese `find` devolvía el CV del alcalde bajo un
  // rótulo que promete «las 21 fichas»: el mismo defecto que este bloque vino a
  // arreglar, entrando por la puerta de atrás.
  const fichasUrl = data.source
  const conFicha = data.officials.filter((o) => o.cvUrl).length

  return (
    <div style={{ marginBottom: 28 }}>
      <div className="cp-cargos-hero">
        <div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            {t('cargos.eyebrow')}
            {dedic?.mandate ? ` · ${t('cargos.hero.mandato').replace('{m}', dedic.mandate)}` : ''}
          </div>
          <h1
            style={{
              fontSize: 'var(--fs-page)',
              fontWeight: 700,
              letterSpacing: '-.02em',
              margin: '6px 0 0',
              lineHeight: 1.15,
            }}
          >
            {t('cargos.title')}
          </h1>
          <p
            style={{
              margin: '14px 0 0',
              fontSize: 'var(--fs-head)',
              lineHeight: 1.5,
              color: 'var(--ink)',
              maxWidth: '62ch',
              textWrap: 'pretty',
            }}
          >
            {(partidoUnico ? t('cargos.hero.lead') : t('cargos.hero.leadVarios'))
              .replace('{total}', data.count)
              .replace('{nGob}', gobierno.length)
              .replace('{partido}', partidoUnico ?? '')
              .replace('{nOpo}', oposicion.length)}{' '}
            {/* Only while the data supports it: «ninguno a cero» is a claim
                about the smallest anonymous row, so it renders from that row
                and vanishes if one ever reads zero. */}
            {split?.cuadra && split.sin.min > 0 && (
              <>
                {t('cargos.hero.coste')
                  .replace('{importe}', formatEuros(split.total))
                  .replace('{n}', data.count)
                  .replace('{year}', split.year)}
              </>
            )}
          </p>
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 'var(--fs-aux)',
              lineHeight: 1.55,
              color: 'var(--ink50)',
              maxWidth: '66ch',
            }}
          >
            {t('cargos.intro')}{' '}
            {/* Said ONCE, y ahora con la cuenta REAL. El portal publica el CV
                de 18 de los 21 escaños; decir «las 21» era cierto cuando el
                enlace era un índice y dejó de serlo cuando pasó a ser un PDF
                por persona. La cifra se deriva, no se escribe. */}
            {fichasUrl && (
              <ExtLink href={fichasUrl} style={{ color: 'var(--civic)' }}>
                {t('cargos.hero.fichas').replace('{n}', conFicha).replace('{total}', data.count)} ↗
              </ExtLink>
            )}
          </p>
        </div>

        <Card>
          <div
            style={{
              fontSize: 'var(--fs-micro)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.05em',
              color: 'var(--ink50)',
              marginBottom: 12,
            }}
          >
            {t('cargos.composicion.title').replace('{n}', data.count)}
          </div>
          <CompositionBar composition={data.composition} total={data.count} />
          <div
            style={{
              marginTop: 13,
              paddingTop: 12,
              borderTop: '1px solid var(--border2)',
              display: 'flex',
              gap: 20,
            }}
          >
            <div>
              <div className="mono" style={{ fontSize: 'var(--fs-card)', fontWeight: 700 }}>
                {gobierno.length}
              </div>
              <div
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  marginTop: 2,
                  lineHeight: 1.35,
                }}
              >
                {t('cargos.composicion.gobiernan')}
              </div>
            </div>
            <div style={{ width: 1, background: 'var(--border)' }} />
            <div>
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-card)', fontWeight: 700, color: 'var(--ink50)' }}
              >
                {oposicion.length}
              </div>
              <div
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  marginTop: 2,
                  lineHeight: 1.35,
                }}
              >
                {t('cargos.composicion.fiscalizan')}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginTop: 18,
          flexWrap: 'wrap',
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Corporación Municipal
        </div>
        <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          · {t('cargos.corporacion.raspado').replace('{fecha}', generatedDate)}
        </div>
        <DataAsOf iso={data.generatedAt} label="Officials" />
      </div>
      {nCorr > 0 && (
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--warn-ink)',
            lineHeight: 1.5,
            maxWidth: '76ch',
            marginTop: 8,
          }}
        >
          {t('cargos.corporacion.correcciones')
            .replace('{n}', nCorr)
            .replace('{bajas}', corr.bajas ?? 0)
            .replace('{altas}', corr.altas ?? 0)}{' '}
          <Link
            to="/metodologia#corporacion"
            style={{ color: 'var(--civic)', textDecoration: 'underline' }}
          >
            {t('cargos.corporacion.correccionesLink')}
          </Link>
        </div>
      )}

      <RetribucionesPanel />

      <div style={{ marginTop: 26 }}>
        <SectionHead
          as="h2"
          eyebrow={t('cargos.gobierno.eyebrow').replace('{n}', gobierno.length)}
          title={t('cargos.gobierno.title')}
        />
        <div className="cp-cargos-gob">
          {gobierno.map((o) => (
            <OfficialCard
              key={o.slug}
              o={o}
              variant="gobierno"
              kinds={kinds}
              bioRoute={bioRoutes.get(o.slug)}
            />
          ))}
        </div>
      </div>

      {oposicion.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <SectionHead
            as="h2"
            eyebrow={t('cargos.oposicion.eyebrow').replace('{n}', oposicion.length)}
            title={t('cargos.oposicion.title')}
          />
          <p
            style={{
              margin: '0 0 14px',
              fontSize: 'var(--fs-aux)',
              lineHeight: 1.55,
              color: 'var(--ink70)',
              maxWidth: '88ch',
            }}
          >
            {t('cargos.oposicion.nota')}
          </p>
          <div className="cp-cargos-opo">
            {oposicion.map((o) => (
              <OfficialCard
                key={o.slug}
                o={o}
                variant="oposicion"
                kinds={kinds}
                bioRoute={bioRoutes.get(o.slug)}
              />
            ))}
          </div>
        </div>
      )}

      <PlantillaBanda />

      {former.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              marginBottom: 4,
            }}
          >
            {t('cargos.bajas.title')}
          </div>
          <div
            style={{
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink50)',
              marginBottom: 10,
              maxWidth: 620,
              lineHeight: 1.5,
            }}
          >
            {t('cargos.bajas.note')}
          </div>
          <div className="cp-cargos-gob">
            {former.map((o) => (
              <OfficialCard
                key={o.slug}
                o={o}
                variant="former"
                kinds={kinds}
                bioRoute={bioRoutes.get(o.slug)}
              />
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 26,
          paddingTop: 18,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 24,
          alignItems: 'baseline',
          flexWrap: 'wrap',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 'var(--fs-meta)',
            lineHeight: 1.55,
            color: 'var(--ink50)',
            maxWidth: '68ch',
          }}
        >
          {t('cargos.fuentes')
            .replace('{fecha}', generatedDate)
            .replace('{acuerdo}', fmtDateLong(dedic?.source?.date) || '—')}
        </p>
        <span style={{ flex: 1 }} />
        <div
          style={{
            display: 'flex',
            gap: 16,
            fontSize: 'var(--fs-aux)',
            whiteSpace: 'nowrap',
            flexWrap: 'wrap',
          }}
        >
          <Link to="/departamentos" style={{ color: 'var(--civic)' }}>
            Departamentos →
          </Link>
          <Link to="/promesas" style={{ color: 'var(--civic)' }}>
            Promesas →
          </Link>
          <Link to="/quejas" style={{ color: 'var(--civic)' }}>
            Quejas →
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function Cargos() {
  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}
    >
      <CorporacionMunicipal />
    </div>
  )
}
