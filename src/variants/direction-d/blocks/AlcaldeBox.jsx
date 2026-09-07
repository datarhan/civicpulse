import { useOfficials, partyColor } from '../../../hooks/useOfficials'
import { usePromises } from '../../../hooks/usePromises'
import { usePlenoAgendas } from '../../../hooks/usePlenoAgendas'
import { useBudget, formatEuros as formatBudgetEuros } from '../../../hooks/useBudget'
import { useTenders } from '../../../hooks/useTenders'
import { useBdns } from '../../../hooks/useBdns'
import { isCommittedContract } from '../../../lib/contract-status'
import { yearSpan } from '../../../lib/year-span'
import { canonicalizeDepartment, DEPARTMENT_LABEL } from '../../../scraper/departments'
import { PALETTE, MONO } from '../tokens'
import { useT } from '../../../i18n'

export function AlcaldeBox() {
  const t = useT()
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

  // Both accumulations below sit under a "Gobierno municipal · <año>" heading
  // beside a one-year budget, so each has to carry its own period in the
  // VISIBLE string. The span is measured over exactly the rows behind each
  // figure — committed contracts for the contract count, granted subsidies for
  // the subsidy count — so the period can never describe a different set than
  // the number it labels.
  const tendersYears = yearSpan(
    (tendersData?.contracts ?? []).filter(isCommittedContract).map((c) => c.awardDate),
  )
  const bdnsYears = yearSpan(
    (bdnsData?.items ?? []).filter((g) => g.direction === 'granted').map((g) => g.date),
  )

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
              borderRadius: 'var(--r-input)',
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
              fontSize: 'var(--fs-micro)',
              color: PALETTE.ink60,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
            }}
          >
            {t('landing.alcalde.role')}
          </div>
          <h2
            style={{
              fontSize: 'var(--fs-card)',
              fontWeight: 700,
              margin: '2px 0 0',
              letterSpacing: '-.01em',
            }}
          >
            {mayor.name}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                background: partyColor(mayor.party),
                color: 'white',
                padding: '2px 6px',
                borderRadius: 'var(--r-pill)',
              }}
            >
              {mayor.party}
            </span>
            <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: PALETTE.ink60 }}>
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
            fontSize: 'var(--fs-micro)',
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
                fontSize: 'var(--fs-micro)',
                padding: '2px 7px',
                background: '#EEF4FF',
                color: PALETTE.civic,
                borderRadius: 'var(--r-input)',
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
              fontSize: 'var(--fs-micro)',
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
              fontSize: 'var(--fs-micro)',
              fontFamily: MONO,
              color: PALETTE.ink60,
            }}
          >
            {budgetEuros && (
              <a
                href="/presupuesto"
                style={{ color: PALETTE.ink80, textDecoration: 'none' }}
                title="Presupuesto de gastos aprobado del ejercicio, según CONPREL (Ministerio de Hacienda). No es lo ejecutado."
              >
                <span style={{ fontWeight: 700 }}>{formatBudgetEuros(budgetEuros)}</span>{' '}
                {/*
                  El año va AQUÍ, no sólo en el encabezado. Era la única cifra
                  de la fila sin período propio —los contratos llevan
                  «2017–2026» y las subvenciones el suyo—, así que el «· 2025»
                  del título quedaba gobernando un presupuesto anual pegado a un
                  acumulado de diez años. El lector que compara 41,5 M€ con
                  123,7 M€ concluye lo que no es.
                  Es la misma lección de tres líneas más abajo, aplicada a la
                  cifra de al lado: el período tiene que estar donde se lee.
                */}
                {/*
                  Y la ETAPA junto al período, por lo mismo. El ejercicio tiene
                  tres cifras que se llaman «presupuesto» —crédito inicial
                  37,6 M€, definitivo tras modificaciones 62,1 M€ y los
                  41,58 M€ que el ayuntamiento rindió a CONPREL, que es ésta— y
                  «presupuesto 2025» a secas no dice cuál. Lo señaló la revisión
                  lectora cuando /presupuesto pasó a distinguir las tres: la
                  portada se quedó siendo la superficie que usaba la palabra
                  sola. Las dos cifras «aprobadas» no se reconcilian, y esa
                  discrepancia se publica entera al otro lado de este enlace.
                */}
                <span style={{ color: PALETTE.ink50 }}>
                  presupuesto aprobado{budgetYear ? ` ${budgetYear}` : ''}
                </span>
              </a>
            )}
            {tendersAwarded && (
              <a
                href="/presupuesto"
                style={{ color: PALETTE.ink80, textDecoration: 'none' }}
                // NOT "durante el mandato": the figure is every award in the
                // registry. It also sits beside an ANNUAL budget under a
                // "Gobierno municipal · <año>" heading, so without the period a
                // reader concludes the town awards more than it budgets.
                //
                // The period lives in the visible string, NOT in this title.
                // The first fix for this shipped the years into a `title`
                // tooltip, which no touch device shows, no scanning reader
                // sees, and no `innerText` carries — so the surface reviewer
                // structurally could not observe it and re-flagged the page
                // every run. A fix applied where it cannot be read is the
                // front-end twin of a test that is green while measuring
                // nothing.
                title="Contratos adjudicados registrados en el portal de contratación, no solo los de este mandato"
              >
                <span style={{ fontWeight: 700 }}>{tendersAwarded}</span>{' '}
                <span style={{ color: PALETTE.ink50 }}>
                  {/* «acumulados», no sólo el período: es la palabra que llevan las
              otras dos superficies que publican este mismo par —la tira de KPI
              («acumulado · Gobierto/PLACSP») y FeedBlocks («Acumulado
              2017–2026»)—, y ésta era la única de las tres sin ella. */}
                  contratos acumulados{tendersYears ? ` ${tendersYears}` : ''}
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
                <span style={{ color: PALETTE.ink50 }}>
                  subvenciones{bdnsYears ? ` ${bdnsYears}` : ''}
                </span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
