import { Card, SectionHead } from '../components/Primitives'

// English page for international funders/partners. Deliberately NOT in the
// sidebar NAV and NOT in i18n — the citizen-facing chrome stays Spanish, and
// this copy is funder-facing content, not chrome.
const CONTACT_EMAIL = 'slutchenko@gmail.com'

const TIER_ROWS = [
  [
    'T1 · Auto',
    'all ~8,100 municipalities',
    'budget, contracts, subsidies, census, unemployment, official-gazette mentions — national open sources, zero editorial claims',
  ],
  [
    'T2 · Semi',
    'hundreds',
    'full-council transcription + claim extraction where session video exists; machine-suggested, human-gated',
  ],
  [
    'T3 · Editorial',
    'per town',
    'verified findings, promise tracker, citizen complaints with legal clocks, right of reply — only with a named local curator',
  ],
]

export default function About() {
  return (
    <div
      className="cp-page"
      lang="en"
      style={{ padding: '24px', maxWidth: 860, margin: '0 auto', fontSize: 14, lineHeight: 1.6 }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        For international partners &amp; funders
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
        CivicPulse — municipal accountability infrastructure
      </h1>

      <Card style={{ marginTop: 22 }}>
        <SectionHead eyebrow="The problem" title="Spain's municipal news deserts" />
        <p>
          Roughly 6,800 of Spain's 8,100 municipalities have no dedicated press coverage. Local
          government there operates without systematic scrutiny: council sessions go untranscribed,
          contracts unexamined, electoral promises untracked. National watchdogs (Civio, Maldita,
          Newtral) work at state level; nobody does per-municipality accountability at scale.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="The proof" title="One town, covered completely" />
        <p>
          CivicPulse runs live for Riba-roja de Túria (pop. ~24,600, València): 28 nightly scrapers
          over public-sector open data, Whisper-transcribed council sessions, LLM-extracted claims
          verified deterministically against the procurement/budget/subsidy record, human-curated
          findings with a built-in right of reply, geolocated contract spending, and a Telegram
          complaints channel with statutory response clocks. Every editorial surface is gated by
          documented libel discipline (
          <a href="/metodologia" style={{ color: 'var(--civic)' }}>
            methodology, in Spanish
          </a>
          ).
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="The thesis" title="Scale what's safe to scale" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {['Tier', 'Scope', 'Content'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px 6px 0',
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--ink60)',
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIER_ROWS.map(([tier, scope, what]) => (
                <tr key={tier}>
                  <td style={{ padding: '6px 10px 6px 0', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {tier}
                  </td>
                  <td style={{ padding: '6px 10px 6px 0', whiteSpace: 'nowrap' }}>{scope}</td>
                  <td style={{ padding: '6px 0' }}>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginBottom: 0 }}>
          Rollout: the Camp de Túria comarca (9 municipalities) in late 2026, the province of
          València (266) before the May 2027 municipal elections, then national. The data layer is
          built on sources that already cover every municipality by INE code.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Who + funding" title="Operator and independence" />
        <p>
          Built and edited by <strong>Sergei Lutchenko</strong>, software developer, as an
          independent public-interest project — nonprofit direction, no ads, no venture capital, no
          money from any administration under active editorial investigation. All funding is
          disclosed publicly on{' '}
          <a href="/nosotros" style={{ color: 'var(--civic)' }}>
            /nosotros
          </a>
          . As of July 2026 the project is fully self-funded.
        </p>
        <p style={{ marginBottom: 0 }}>
          Contact:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--civic)' }}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </Card>
    </div>
  )
}
