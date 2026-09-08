import { Card, SectionHead } from '../components/Primitives'

// English page for international funders/partners. Deliberately NOT in the
// sidebar NAV and NOT in i18n — the citizen-facing chrome stays Spanish, and
// this copy is funder-facing content, not chrome.
const CONTACT_EMAIL = 'slutchenko@gmail.com'

const TIER_ROWS = [
  [
    'T1 · Auto',
    'all ~8,100 municipalities',
    'service costs, budget, contracts, subsidies, census, unemployment, official-gazette mentions — national open sources, zero editorial claims',
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
      style={{
        padding: '24px',
        maxWidth: 860,
        margin: '0 auto',
        fontSize: 'var(--fs-body)',
        lineHeight: 1.6,
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
        For international partners &amp; funders
      </div>
      <h1
        style={{
          fontSize: 'var(--fs-page)',
          fontWeight: 700,
          letterSpacing: '-.015em',
          marginTop: 2,
        }}
      >
        CivicPulse — municipal accountability infrastructure
      </h1>

      <Card style={{ marginTop: 22 }}>
        <SectionHead
          eyebrow="What it is"
          title="Who runs your town hall, what it does, what it costs"
        />
        <p>
          Information is not scarce; verification is. And the organisation almost nobody verifies is
          the one that matters most locally — your town hall decides your street, your water bill,
          your licence. It complies with transparency law, and what that produces is a folder of
          PDFs ordered by the article compelling each file. Publishing is not the same as being
          legible.
        </p>
        <p style={{ marginBottom: 0 }}>
          CivicPulse rebuilds that obligation from the reader&rsquo;s side, for any Spanish
          municipality. <strong>Who runs it:</strong> who holds each post, what education and
          experience they declared and whether it relates to what they run, what the post was set to
          pay, and what the law actually requires — of a councillor, no qualification at all; of the
          officer who audits the money, a degree and a national examination.{' '}
          <strong>What it does and what it costs:</strong> each service priced against similar-sized
          towns on the ministry&rsquo;s own data, supplier-payment periods, budget execution,
          electoral promises against the record, council votes, public contracts, and citizen
          complaints with statutory clocks. On that base it publishes deep, fully-cited local
          journalism, with a right of reply — and a published map of where the official data runs
          out. The goal: that before Spain&rsquo;s May 2027 municipal elections, voters can decide
          from facts, not campaign speeches.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="The gap" title="Spain's municipal news deserts" />
        <p>
          <strong>
            6,304 of Spain&rsquo;s 8,147 municipalities &mdash; 77.53% &mdash; are news deserts
          </strong>
          , home to 11.6 million people, roughly a quarter of the country. A further 523 are at risk
          of becoming one. (Negreira-Rey, Vázquez-Herrero &amp; López-García,{' '}
          <a
            href="https://doi.org/10.17645/mac.v11i3.6727"
            style={{ color: 'var(--civic)' }}
            rel="noreferrer"
          >
            <em>Media and Communication</em> 11(3), 2023
          </a>
          .) Local government there operates without systematic scrutiny: council sessions go
          untranscribed, contracts unexamined, electoral promises untracked. National watchdogs
          (Civio, Maldita, Newtral) work at state level; nobody does per-municipality accountability
          at scale.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="The proof" title="The first municipality, covered completely" />
        <p>
          CivicPulse runs live, end to end, in its first municipality — Riba-roja de Túria (pop.
          ~24,600, València): who holds each post and whether the education and experience they
          declared relates to the areas they run — 40 curator-signed rows, published beside what the
          law actually requires for the post — the effective cost of each municipal service against
          the ministry&rsquo;s own peer data, supplier-payment periods and budget execution, 34
          nightly scrapers over public-sector open data, Whisper-transcribed council sessions,
          LLM-extracted claims verified deterministically against the procurement/budget/subsidy
          record, human-curated findings with a built-in right of reply, geolocated contract
          spending, and a Telegram complaints channel with statutory response clocks — plus four
          published investigations, from the DANA reconstruction money to the waste-collection
          contract. Every editorial surface is gated by documented libel discipline (
          <a href="/metodologia" style={{ color: 'var(--civic)' }}>
            methodology, in Spanish
          </a>
          ).
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="The thesis" title="Scale what's safe to scale" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--fs-aux)' }}>
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
                      color: 'var(--ink50)',
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
          Rollout: the Camp de Túria comarca (16 municipalities) in late 2026, the province of
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
