// English engineering blog post — canonical home for the Hacker News / civic-tech
// piece. Deliberately NOT in the sidebar NAV and NOT in i18n: the citizen-facing
// chrome stays Spanish; this is funder/engineer-facing content, like /about.
// Long-form editorial typography mirrors the /reportajes pattern.

const SERIF = "'Fraunces', Georgia, serif"

function SecHead({ num, kicker, title }) {
  return (
    <div style={{ margin: '38px 0 12px' }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          letterSpacing: '.04em',
          marginBottom: 6,
        }}
      >
        {num} · {kicker}
      </div>
      <h2
        style={{
          fontFamily: SERIF,
          fontSize: 'var(--fs-page)',
          fontWeight: 600,
          letterSpacing: '-.01em',
          lineHeight: 1.15,
          margin: 0,
        }}
      >
        {title}
      </h2>
    </div>
  )
}

// A bold-led point in the libel-firewall section.
function Point({ lead, children }) {
  return (
    <p style={{ margin: '0 0 14px' }}>
      <b style={{ color: 'var(--ink)' }}>{lead}</b> {children}
    </p>
  )
}

const LINK = { color: 'var(--civic)' }

// Published 2026-07-09. On 2026-10-15 section 04 was corrected: it said no
// machine output reached the public and that verification had no LLM in it,
// and neither was true on the day it went up (auto-curate-findings.ts dates
// from 2026-04-27, auto-curate-promises.ts from 2026-07-02, the LLM second-pass
// verifier from 2026-04-25). The corrected text is in place; the sentences it
// replaced are quoted, verbatim, in the corrections log at the end, because a
// correction that leaves no record is a silent rewrite (CLAUDE.md, rule 4).
// The same correction went to docs/blog/2026-building-a-town-watchdog-solo-with-ai.md.
const PUBLICADO = '9 July 2026'
const ANCLA_CORRECCIONES = 'corrections'

const CORRECCION = {
  borderLeft: '3px solid var(--crit)',
  background: 'var(--crit-soft)',
  borderRadius: 'var(--r-input)',
}

export default function BuildingCivicPulse() {
  return (
    <div
      className="cp-page"
      lang="en"
      style={{
        padding: '24px',
        maxWidth: 760,
        margin: '0 auto',
        fontSize: 'var(--fs-head)',
        lineHeight: 1.62,
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
        Engineering notes · civic tech
      </div>
      <h1
        style={{
          fontFamily: SERIF,
          fontSize: 'var(--type-display)',
          fontWeight: 600,
          letterSpacing: '-.015em',
          lineHeight: 1.08,
          margin: '4px 0 14px',
        }}
      >
        I built a full accountability stack for my Spanish town, solo, with AI — the interesting
        part is what stops it from lying
      </h1>
      <p
        style={{
          fontSize: 'var(--fs-head)',
          color: 'var(--ink50)',
          lineHeight: 1.5,
          margin: '0 0 30px',
        }}
      >
        The headline is that an AI wrote most of the code. That&rsquo;s the least interesting thing
        here. The interesting thing is the engineering that keeps an AI-assisted watchdog from
        quietly manufacturing a defamation suit with a real person&rsquo;s name on it.
      </p>
      <p
        className="mono"
        style={{
          ...CORRECCION,
          padding: '8px 12px',
          margin: '-12px 0 30px',
          fontSize: 'var(--fs-meta)',
          lineHeight: 1.5,
          color: 'var(--ink70)',
        }}
      >
        Published {PUBLICADO} ·{' '}
        <strong style={{ color: 'var(--crit-ink)' }}>corrected 15 October 2026</strong> ·{' '}
        <a
          href={`#${ANCLA_CORRECCIONES}`}
          style={{ color: 'var(--crit-ink)', whiteSpace: 'nowrap' }}
        >
          see the correction ↓
        </a>
      </p>

      <article style={{ color: 'var(--ink70)' }}>
        <p>
          6,304 of Spain&rsquo;s 8,131 municipalities &mdash; 77.53% of them &mdash; are news
          deserts, home to 11.6 million people (
          <a href="https://doi.org/10.17645/mac.v11i3.6727" style={{ color: 'var(--civic)' }}>
            Negreira-Rey, Vázquez-Herrero &amp; López-García, 2023
          </a>
          ). Not &ldquo;declining&rdquo; coverage &mdash; none. No reporter sits through the council
          session, reads the contract register, or checks whether the thing a party promised at
          election time ever happened. The public data to do it mostly exists &mdash; budgets,
          contracts, subsidies, the census, the official gazettes &mdash; but nobody turns it into
          anything a resident would read.
        </p>
        <p>
          So I built the thing for one town:{' '}
          <a href="https://civicpulse.es" style={LINK}>
            Riba-roja de Túria
          </a>
          , ~24,600 people, near Valencia. Council sessions transcribed and turned into verifiable
          claims; an electoral-promise tracker with the verbatim quote and its source; a
          citizen-complaint pipeline with the actual legal deadlines the town hall is bound by; the
          public money the town awarded, mapped wherever a contract names a place. One person,
          mostly with an AI coding agent. Here is how it&rsquo;s built and, more importantly, how
          it&rsquo;s disciplined.
        </p>

        <SecHead num="01" kicker="Architecture" title="No backend, on purpose" />
        <p>
          CivicPulse is a front-end-only single-page app. Everything it shows is static JSON
          committed to the repo and served next to the app. There is no application server, no
          production database, no API to attack or pay for.
        </p>
        <pre
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 'var(--fs-aux)',
            lineHeight: 1.7,
            background: 'var(--soft)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '14px 16px',
            overflowX: 'auto',
            color: 'var(--ink70)',
            margin: '16px 0',
          }}
        >
          {`34 scrapers  ──►  public/data/*.json  ──►  React SPA
(nightly CI)      (committed to git)      (one hook per data domain)`}
        </pre>
        <p>
          A fleet of scrapers runs on a schedule. Each fetches a public source, parses it into a
          typed snapshot, and writes a JSON file. The commit lands, a static deploy fires, the site
          updates. If every scraper broke tomorrow, the site would keep serving the last good
          snapshot forever. This sounds too simple, and that&rsquo;s the point &mdash; for a solo,
          unfunded, hopefully long-lived project, boring and durable beats clever and fragile: cost
          is near zero, the entire data layer <i>is</i> the git history (the audit trail is free),
          and it scales linearly, because the national data sources are already indexed by
          municipality code. Adding a town is mostly engineering, not research.
        </p>

        <SecHead num="02" kicker="Data" title="Scrapers as a TDD contract" />
        <p>
          Thirty-four scrapers hitting thirty-four government portals is a maintenance nightmare
          waiting to happen. The thing that keeps it sane is a hard rule: the network code and the
          parsing code never touch. Every source is a thin fetch script plus a{' '}
          <b style={{ color: 'var(--ink)' }}>pure function</b> &mdash; bytes in, typed snapshot out,
          no network, no clock &mdash; pinned by a unit test against a{' '}
          <b style={{ color: 'var(--ink)' }}>real payload committed as a fixture</b>. Add a source,
          snapshot a real response, assert the exact values (925455.74, not &ldquo;a number&rdquo;),
          watch it fail, write the minimal parser. This is where an AI agent genuinely excels: given
          a real fixture and a failing test, &ldquo;make this pass&rdquo; is a task it nails, and
          the test is the spec that stops it drifting. When a town hall reformats a PDF six months
          from now, one parser test goes red and points at exactly what broke &mdash; instead of a
          wrong number quietly shipping to the public.
        </p>

        <SecHead num="03" kicker="Honesty" title="A wrong pin is worse than no pin" />
        <p>
          Spain&rsquo;s contract records have no address field. A contract is a title, a winner, and
          an amount. To map it, you infer the place from the <i>title</i>. The naive move &mdash;
          ask an LLM &ldquo;where is this?&rdquo; &mdash; is exactly what eventually drops a
          &euro;400,000 pin on the wrong street and turns your credibility into a correction. So the
          geocoder is deliberately timid: a deterministic resolver over a gazetteer of the
          town&rsquo;s real streets and public buildings, which places a pin{' '}
          <b style={{ color: 'var(--ink)' }}>
            only when the title literally names a matching place
          </b>
          , behind a stack of honesty gates (drop the municipality name itself, require a
          street-type word before trusting a street match, and so on). Most contracts stay unmapped.
          That is the correct outcome &mdash; an honest miss is free; a confident wrong pin costs
          you the whole project.
        </p>
        <p>
          I hit this in development: a school contract kept snapping to a football pitch, because
          after stripping the town name the leftover token matched a sports field before it matched
          the school. The fix wasn&rsquo;t a smarter prompt &mdash; it was restricting the candidate
          set to school buildings <i>before</i> matching. When the cost of a wrong answer is a real
          place misrepresented in public, you make the system under-reach and you make the failure
          visible, not silent. When I later added an LLM pass to improve recall on cross-language
          street names, I wired it under the same rule: the model reads the place <i>name</i>, but a
          real gazetteer supplies the coordinate &mdash; the LLM never emits a lat/long, and nothing
          it suggests reaches the map until a human promotes it.
        </p>

        <SecHead num="04" kicker="The firewall" title="Where the AI is not allowed to decide" />
        <p>
          This is the core. The site makes claims about named elected officials, so the parts that
          do are engineered as legal architecture. The principle:{' '}
          <b style={{ color: 'var(--ink)' }}>
            a model never gets the last word on a person or on a failure, and what it publishes on
            its own says so.
          </b>
        </p>
        <Point lead="Suggestions stay suggestions; machine text is labelled.">
          The promise tracker, the findings, and the AI-drafted reports each have a published file
          and a separate machine-written suggestions file. A suggestion renders as &ldquo;automatic
          proposal, pending review&rdquo; and never substitutes for a published status. A narrow
          band does publish without a human, and says so where it appears: a model-proposed promise
          whose quote is anchored verbatim to its source, or an advance to &ldquo;in progress&rdquo;
          anchored to a real contract, subsidy or budget row, goes live marked &ldquo;published
          automatically, review pending&rdquo;; an informational council finding whose title and
          summary a model wrote is marked &ldquo;automatic drafting,&rdquo; and that class publishes
          unattended only while its measured precision clears the bar. &ldquo;Partial,&rdquo;
          &ldquo;fulfilled,&rdquo; &ldquo;not carried out,&rdquo; every critical finding, and
          anything attributed to a named person need a human. A quote that isn&rsquo;t verbatim in
          its source is rejected; a schema validator enforces every invariant at write time.
        </Point>
        <Point lead="Bloc-level attribution by default.">
          An extracted claim is attributed to a party group, not a person &mdash; the field is
          enum-gated to blocs or null, and a write-time guard strips any individual name not backed
          by a high-confidence voice match whose party even agrees. Naming the individual is a
          separate step a human takes after checking the audio.
        </Point>
        <Point lead="The first verifier is deterministic; a model only gives a second opinion.">
          The first pass &mdash; the thing that checks whether &ldquo;we spent X on Y&rdquo; holds
          up &mdash; is a pure, deterministic function. No model, no network. It cross-references
          the claim against contracts, subsidies, budget, and prior claims, and returns a verdict
          with citations. On the claims it leaves unmatched, a model scores the shortlisted records
          it is handed and can cite nothing else; what it finds supported waits in an unpublished
          queue until a person signs the upgrade. A later model pass re-reads published verdicts and
          may only retract them. Opinion statements are hard-skipped as un-verifiable regardless of
          nearby evidence &mdash; policy, not a heuristic the model can talk itself out of.
        </Point>
        <Point lead="Right of reply, everywhere.">
          Every finding, promise, and report carries a structured right-of-reply path &mdash; a
          form, a validated CLI, a committed reply in the public record. During electoral-campaign
          windows, the tracker enforces its own legally-mandated freeze and goes read-only.
        </Point>
        <p>
          None of this is AI safety in the abstract. It&rsquo;s the concrete answer to &ldquo;what
          happens the first time the model is confidently wrong about a named human being?&rdquo;
          &mdash; the answer is that it cannot say anything new about that person on its own: naming
          an individual, every strong verdict, and every critical finding take a human signature,
          and the little a model does publish alone is labelled as machine-made and can be retracted
          without one.
        </p>

        <SecHead num="05" kicker="Honesty, part two" title="What the AI actually did" />
        <p>
          Since the title promises &ldquo;with AI,&rdquo; the honest split: the agent wrote the
          large majority of the code &mdash; parsers, components, scraper CLIs, test suites.
          It&rsquo;s a genuinely excellent implementer when the <i>contract</i> is precise:
          &ldquo;here&rsquo;s a real fixture and a failing test; make it pass.&rdquo; Where
          it&rsquo;s <i>not</i> trusted &mdash; and where the design reflects that &mdash; is
          judgment on legally-material output. The schemas, the validators, the honesty gates, the
          deterministic first-pass verifier, the suggestions files: those are the parts that assume
          the model <i>will</i> eventually be wrong and make that harmless. The interesting
          engineering was never &ldquo;prompt it better.&rdquo; It was building the rails so that
          being solo-plus-AI doesn&rsquo;t mean being one hallucination away from a lawsuit.
        </p>

        <SecHead num="06" kicker="Scale" title="Why one town is the whole point" />
        <p>
          Riba-roja is the depth demo &mdash; one town covered completely, with real data and libel
          discipline. The thesis is breadth: the national sources already cover every municipality
          by code, so the pipeline that produces one town&rsquo;s profile produces all of them. I
          think in three tiers gated by libel risk: <b style={{ color: 'var(--ink)' }}>T1</b> (all
          ~8,100 towns) is pure open data with zero editorial claims &mdash; fully automatable;{' '}
          <b style={{ color: 'var(--ink)' }}>T2</b> (hundreds) adds transcription and claim
          extraction, machine-suggested and human-gated; <b style={{ color: 'var(--ink)' }}>T3</b>{' '}
          (per town) is the legally-material surfaces &mdash; and requires a{' '}
          <i>named local curator</i>, non-negotiable. The tier model <i>is</i> the legal
          architecture: what scales carries no editorial claims, and what carries editorial claims
          doesn&rsquo;t scale without a human attached. The forcing function: Spain votes for its
          town halls again in May 2027, and &ldquo;before you vote, see what yours actually
          did&rdquo; is a deadline worth building toward.
        </p>

        <div
          style={{
            background: 'var(--soft)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '20px 22px',
            margin: '32px 0 0',
          }}
        >
          <h3
            style={{
              fontSize: 'var(--fs-meta)',
              textTransform: 'uppercase',
              letterSpacing: '.1em',
              color: 'var(--ink50)',
              margin: '0 0 12px',
              fontWeight: 700,
            }}
          >
            Try it / break it
          </h3>
          <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-body)' }}>
            It&rsquo;s live at{' '}
            <a href="https://civicpulse.es" style={LINK}>
              civicpulse.es
            </a>{' '}
            and open source (AGPL-3.0) at{' '}
            <a href="https://github.com/datarhan/civicpulse" style={LINK}>
              github.com/datarhan/civicpulse
            </a>
            . It runs fully offline on the committed snapshots &mdash;{' '}
            <span className="mono" style={{ fontSize: 'var(--fs-aux)' }}>
              npm install &amp;&amp; npm run dev
            </span>{' '}
            &mdash; no keys, no backend. The methodology is{' '}
            <a href="/metodologia" style={LINK}>
              published
            </a>
            , corrections are logged in the open, and the operator is{' '}
            <a href="/about" style={LINK}>
              fully named
            </a>
            .
          </p>
          <p style={{ margin: 0, fontSize: 'var(--fs-body)' }}>
            If you work in civic tech or data journalism &mdash; or just care about the 6,304 towns
            nobody&rsquo;s watching &mdash; I&rsquo;d like to hear where this breaks, technically or
            editorially. That&rsquo;s the whole point of doing it in the open.
          </p>
        </div>

        <p
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            margin: '18px 0 0',
            lineHeight: 1.5,
          }}
        >
          Sergei Lutchenko ·{' '}
          <a href="mailto:civicpulse_es@proton.me" style={LINK}>
            civicpulse_es@proton.me
          </a>{' '}
          · civicpulse.es
        </p>

        <section
          id={ANCLA_CORRECCIONES}
          aria-labelledby={`${ANCLA_CORRECCIONES}-title`}
          style={{ scrollMarginTop: 72, margin: '36px 0 0' }}
        >
          <h2
            id={`${ANCLA_CORRECCIONES}-title`}
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              fontWeight: 500,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              margin: '0 0 12px',
              paddingTop: 14,
              borderTop: '1px solid var(--border)',
            }}
          >
            Corrections
          </h2>
          <div
            style={{
              ...CORRECCION,
              borderRadius: 'var(--r-card)',
              padding: '12px 14px',
              fontSize: 'var(--fs-aux)',
              lineHeight: 1.55,
            }}
          >
            <p style={{ margin: '0 0 8px' }}>
              <strong style={{ color: 'var(--crit-ink)' }}>15 October 2026.</strong> Section 04
              overstated what the AI does not do. When this post went up on {PUBLICADO}, it said:
            </p>
            <ul style={{ margin: '0 0 8px', paddingLeft: 20 }}>
              <li>
                &ldquo;machine inference is never the last step before publication&rdquo; and
                &ldquo;Inference can only write to the suggestions file&rdquo;;
              </li>
              <li>
                &ldquo;The LLM extracts <i>candidate</i> claims; it never decides whether one is
                true&rdquo;;
              </li>
              <li>
                and, of a model confidently wrong about a named person, &ldquo;the answer is{' '}
                <i>nothing reaches the public</i>&rdquo;.
              </li>
            </ul>
            <p style={{ margin: '0 0 8px' }}>
              None of it was true that day, and the site&rsquo;s own{' '}
              <a href="/metodologia#auto-curacion-promesas" style={LINK}>
                methodology
              </a>{' '}
              said so. The promise tracker already published model-proposed promises, and advances
              to &ldquo;in progress&rdquo;, without a human; informational council findings with a
              model-written title and summary were already on the site; and a model second pass had
              already upgraded claims the deterministic verifier left without a match. What holds
              today is narrower, and section 04 now says that instead: machine text is labelled, a
              quote not verbatim in its source is rejected, a model may retract a verdict but only a
              person can raise one, and the strong verdicts, critical findings and anything
              attributed to a named person need a human.
            </p>
            <p style={{ margin: 0 }}>
              The original text stays in the{' '}
              <a
                href="https://github.com/datarhan/civicpulse/commits/main/src/pages/blog/BuildingCivicPulse.jsx"
                style={LINK}
              >
                public history of this page
              </a>
              .
            </p>
          </div>
        </section>
      </article>
    </div>
  )
}
