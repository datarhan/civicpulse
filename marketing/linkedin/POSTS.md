# CivicPulse on LinkedIn — a 12-post series

One image per post in `images/post-NN.png` (1080×1350, 4:5 — the tallest
ratio LinkedIn shows uncropped in the feed). `images/post-00.png` is the style
sheet, for you, not for posting.

**Cadence.** Two posts a week (Tuesday and Thursday mornings, when LinkedIn
engagement peaks) runs six weeks. The tracks alternate on purpose, so the feed
never has two technical posts in a row:

| Nº  | Track                      | Hook                                                        |
| --- | -------------------------- | ----------------------------------------------------------- |
| 01  | Idea                       | You fund it every year. Have you ever read its accounts?    |
| 02  | Civic problem              | Most of Spain's town halls are watched by nobody.           |
| 03  | How local government works | The auditor needs a degree. The councillor needs your vote. |
| 04  | Civic problem              | Transparency law produces documents. People have questions. |
| 05  | How local government works | A budget is not what was spent.                             |
| 06  | How local government works | Some public services never appear in the council's books.   |
| 07  | Method                     | Our spending map shows 1.8% of the money. It says so.       |
| 08  | Method                     | A missing year is not a zero.                               |
| 09  | Idea                       | We publish the method, not a ranking.                       |
| 10  | Idea                       | Machines may retract. Only a human may publish.             |
| 11  | Build                      | Our tests were green. They were measuring nothing.          |
| 12  | Idea                       | May 2027: 8,131 town halls face the voters.                 |

**House rules for the copy** (the same ones the site keeps):

- Never name a councillor or official. The posts are about how the system
  works, and a LinkedIn post has no right of reply.
- Never write "spent" next to a budget figure unless it is obligaciones
  reconocidas.
- Every figure in a post appears on its image with a source in the footer.
  If the snapshot moves, re-render (see `README.md`) and update the number in
  the text.
- Put links in the first comment, not the post body — LinkedIn demotes posts
  with outbound links.

---

## Nº 01 · Idea — You fund it every year

Image: `images/post-01.png`

> You pay for your town hall every year. Have you ever read its accounts?

Your ayuntamiento decides your street, your water bill, your building licence,
the school run, and which company gets paid to collect your bins.

Nobody would invest in a company without seeing its accounts and knowing who
runs it. With this one you don't get a choice about funding it. And in most of
Spain, nobody is checking it for you.

The data to check it already exists. It is public, and it's scattered across a
dozen government portals, each written to show the law was followed rather than
to answer anything a resident would ask.

So I built **CivicPulse**: one town hall, Riba-roja de Túria (València), rebuilt
from the resident's side. Who runs each area. What each service costs. Who got
the contract. What was voted. What was promised.

Every figure on the site comes with its source, one click away. If we can't
cite it, we don't publish it.

Over the next few weeks I'll share what building it taught me about how local
government actually works, and about the places where the official data runs
out.

First comment: civicpulse.es

#CivicTech #OpenData #Transparency #LocalGovernment #Spain

---

## Nº 02 · Civic problem — Watched by nobody

Image: `images/post-02.png`

> 77.53% of Spain's municipalities have no local newsroom watching them.

That's 6,304 of 8,131 municipalities. 11.6 million people live in these "news
deserts" (Negreira-Rey, Vázquez-Herrero & López-García, 2023).

The national press covers national politics, and fact-checkers cover national
debate. The government that decides your street, your water bill and your
bin contract usually has no reporter at the plenary session, nobody reading the
budget, and nobody asking why a contract went where it did.

This isn't a complaint about journalists. A local newsroom costs money, and in
a town of 20,000 the ads that used to pay for one are gone.

**What CivicPulse does about it:** the routine part of that missing newsroom's
job can be done by machines, from public data. That means pulling every
contract, every budget line, every plenary transcript and every electoral
promise, and keeping the record up to date every night. A human curator keeps
the judgement calls.

We're doing it for one town first, completely. The data layer underneath comes
from national sources indexed by municipality code, so it's built to scale to
all 8,131.

#NewsDeserts #LocalNews #CivicTech #Journalism #Democracy

---

## Nº 03 · How local government works — Two tiers, two checks

Image: `images/post-03.png`

> The person who audits your town hall's money needs a degree and a national
> exam. The person who runs it needs your vote.

Most people don't know Spanish town halls have two tiers, and the law checks
each one in a completely different way:

🔹 **The secretary and the interventor**, who certify decisions and audit the
money, are checked _technically_: university degree plus a national competitive
exam (RD 128/2018, arts. 17–19).

🔹 **Elected councillors** are checked _electorally_: of age, on the roll, not
disqualified (LOREG art. 6.1). No qualification of any kind is required.

That second one isn't a loophole. It's by design, because representative
democracy doesn't hand out credentials. I'm not arguing it should.

My argument is smaller and harder to dispute: **if the check is the vote, the
voter needs the facts.**

**What CivicPulse does:** for every office-holder, it puts what they declared
(education, experience, dedication, what the post was set to pay) next to what
the law asks of the post and the areas they run. It adds no commentary and no
score, and every item is cited to the council's own publication. The
conclusion is the voter's to draw.

#LocalGovernment #Democracy #Spain #Transparency #CivicTech

---

## Nº 04 · Civic problem — Documents vs. questions

Image: `images/post-04.png`

> Transparency law produces documents. People have questions.

Every Spanish municipality has to run a transparency portal (Ley 19/2013,
arts. 5–8). Most do, and they publish staffing tables, budget PDFs, works
files, councillors' CVs and plenary minutes. Every file is real.

But a resident's questions sound like this:

- Is this expensive?
- Did that get done?
- Is it getting better or worse?
- Who do I ask?

None of those can be answered from a document. They need a **series** (the
same figure across years), a **denominator** (per resident, per tonne, per
streetlight) and a **comparison** (towns of the same size). The law was written
to be audited for compliance, so it produces files, not answers.

**What CivicPulse does:** it takes the same public data and does the
engineering the portal was never asked to do. For example, it prices each
municipal service per unit against similar-sized towns, using the Ministry of
Finance's own effective-cost returns. It turns a stack of PDFs into a figure
you can follow over time.

The gap between "published" and "legible" is an engineering problem, and it
only needs solving once per country.

#Transparency #OpenData #GovTech #PublicSector #DataEngineering

---

## Nº 05 · How local government works — A budget is not what was spent

Image: `images/post-05.png`

> A town's budget and what the town actually spent are different numbers. For
> Riba-roja in 2025 the gap was more than 3×.

A municipal budget has several magnitudes, and news stories, press releases
and political speeches routinely blur them into one word: "spent."

From the council's own 2025 execution statement (listing of 31/12/2025):

- **Initial credit**, what the plenary approved: €37.60M
- **Modifications** during the year: +€24.52M
- **Definitive credit**, the ceiling it was allowed to spend: €62.12M
- **Recognised obligations**, what was actually spent: **€18.91M**

Read €62.12M as "spent" and you're wrong by 3.3×. Every number above is
correct. The word is what makes it wrong, and no data check can catch a wrong
word.

We caught this mistake on our own site, seven times in one day.

**What CivicPulse does:** a deterministic check runs every time our page copy
is reviewed. It knows these magnitudes, and it flags any execution word
("spent", "gastado") that sits beside a figure that isn't execution. No AI is
involved, so there's nothing for it to hallucinate.

#PublicFinance #Budget #DataLiteracy #LocalGovernment #FactChecking

---

## Nº 06 · How local government works — Services outside the books

Image: `images/post-06.png`

> Some public services never appear in the council's accounts, and that's
> legal.

When a town hall contracts a service out as a concession (water, for example),
the concessionaire often bills residents directly. The money goes from your
bank account to the company. It never passes through the municipal budget.

So when you look up what your town "spends" on that service, you may find a
blank or a zero, and it's easy to conclude someone is hiding something or the
data is broken.

Usually neither is true. The zero is **a different fact**: the service exists
and you pay for it, but the council's books were never the place that money
would appear.

**What CivicPulse does:** where the Ministry's cost returns show that gap, we
don't leave a blank that reads as ignorance. The service's page names the
company, the award and the amount, so the resident sees who is actually being
paid and on what terms.

To me, an unexplained blank is worse than a wrong number, because the reader
can't tell it's there.

#PublicServices #Procurement #LocalGovernment #Transparency #Spain

---

## Nº 07 · Method — The map shows 1.8% of the money

Image: `images/post-07.png`

> Our spending map shows 1.8% of the money, and it tells you that on the map.

People love a map of where public money goes. So do I. Here's the honest
version.

Out of €124.04M of Riba-roja contracts on the public procurement platform
(2017–2026), only €2.23M can be put on a map: 47 of 706 contracts. That's how
many name a specific place in their own title.

The rest is street cleaning, lighting, maintenance and IT. That money is spent
across the whole town, so there's nowhere to put a pin.

We could have guessed. A geocoder would happily put a pin on every contract,
and the map would look full and impressive. It would also be fiction.

**What CivicPulse does:** our place-matcher deliberately under-matches, because
an honest miss beats a wrong pin. The map computes its coverage from the
snapshot and prints it on the map itself. A layer that shows part of its data
has to say which part.

That 1.8% isn't an embarrassment. It tells you something true about how
municipal money works.

#DataVisualization #Maps #OpenData #DataEthics #CivicTech

---

## Nº 08 · Method — A missing year is not a zero

Image: `images/post-08.png`

> A missing year is not a zero. A lot of public data dashboards get this
> wrong.

Every year the Ministry of Finance publishes what each municipality declared
its services cost. The return for 2020 was published. Riba-roja's isn't in it.

Most dashboards would draw that as a gap in the line, a zero or a dash. All
three tell the reader something false.

We now distinguish three things that used to look identical:

- **"Zero"**: the service was declared and cost nothing
- **"Not declared"**: a return was filed, but this service wasn't in it
- **"Never filed"**: no return was submitted for that year

They're three different facts, and "never filed" is itself a fact about the
council.

**What CivicPulse does:** absence is drawn, not hidden. Each case has its own
visual. Data that is late by law (the cost return comes out over a year after
the year it describes) is labelled with the rule that makes it late, so the
page doesn't look abandoned.

For a watchdog, the gaps are where the accountability lives.

#DataQuality #OpenData #DataVisualization #PublicSector #Accountability

---

## Nº 09 · Idea — Method, not a ranking

Image: `images/post-09.png`

> We built an efficiency model for our town hall, and we decided not to
> publish a ranking.

Everyone wants a league table: "your town is the 14th most efficient." It's
the most shareable thing a civic project can publish.

We built the model, a Data Envelopment Analysis over the Ministry's cost data
for similar-sized towns. Then we tried equally defensible choices of which
services to compare, and the score moved across half the scale.

A number that shifts that much with our own choices describes our choices more
than it describes the town. Publishing it as a verdict would be dishonest,
however good it looked.

**What CivicPulse does instead:**

- Publishes the **full method**, so anyone can rebuild the table themselves
- Publishes **failed specifications as failed**: two of our four didn't have
  enough comparable towns, and they're on the page with the reason
- **Never names another municipality** that has no right of reply on our site
- **Never turns a model output into a finding.** A model's verdict is ours,
  not the Ministry's

Declining to score isn't timidity. It's the only version of this I think holds
up.

#DataScience #Statistics #ResponsibleAI #PublicPolicy #Ethics

---

## Nº 10 · Idea — Machines retract, humans publish

Image: `images/post-10.png`

> On our site a machine can take a claim down, but only a human can put one up.

CivicPulse uses AI to transcribe plenary sessions, extract claims, spot
contradictions and suggest when an electoral promise may have been kept. That
work is useful, and it's also where a civic project can quietly turn into a
libel machine.

So the rules are built into the architecture:

1️⃣ Machine output goes into a **separate file**, marked
`requiresHumanApproval`, and the published schema rejects that field.
2️⃣ A **citation check** blocks publication if the source is missing, the
quote isn't verbatim, or the link is dead.
3️⃣ A **human curator** signs. Attribution stays at party-group level unless a
person is individually verified.
4️⃣ Everything published carries a **right of reply**, and every correction is
a public git commit.

And the key one: **an automated verdict can only go down.** It can retract a
claim, but it can never promote one. Opinion is never marked "verified". It's
marked "no data".

AI can speed up the work, but the accountability stays with a person.

#ResponsibleAI #AIethics #Journalism #CivicTech #TrustAndSafety

---

## Nº 11 · Build — Green isn't right

Image: `images/post-11.png`

> Two of our test suites were green, and both were measuring nothing.

1️⃣ Our accessibility gate reported **zero colour-contrast violations**. It
turned out the rule had evaluated **zero elements**, because map tiles defeated
background detection. It found nothing because it looked at nothing.

2️⃣ Our mobile layout test checked that nothing overflowed at 375px. It passed
**because of** the clipping bug it was supposed to catch.

Both were green for weeks.

**What CivicPulse changed:**

- Every gate must now prove it **evaluated something**, not just that it found
  nothing
- Every enum check pairs with a ceiling on its fallback ("unknown" must stay
  under 10%). A copied enum once made €53.5M of contracts vanish while the
  test stayed green
- **No front-end change is done until a human has looked at it in a
  browser**, in dark mode and at 375px. Tests check data and text, and they
  can't see a layout

For a site whose whole promise is accuracy, "the tests pass" and "the page is
right" are different claims.

The project is open source (AGPL-3.0). Link in the first comment.

#SoftwareTesting #QA #Accessibility #WebDev #OpenSource

---

## Nº 12 · Idea — May 2027

Image: `images/post-12.png`

> In May 2027, 8,131 Spanish town halls face the voters. Only one has been
> mapped end to end like this.

Every voter should be able to decide from facts, not campaign speeches. They
should be able to see what their town hall did, what it cost, what was
promised and what the record shows.

Riba-roja de Túria is where we went deep: budget, contracts, service costs,
plenary votes, promises, citizen complaints with legal deadlines, and who holds
each post. Every figure is cited, and there's a right of reply on every claim.

The national layer (budgets, effective service costs, contracts, subsidies,
census, unemployment, official gazettes) is already indexed by municipality
code for **every town in Spain**. Scaling it is engineering, not research.

**How CivicPulse is set up:**

- No ads, no investors, no money from any government it watches
- Open source (AGPL-3.0). Fork it, run it for your town, or tell us where our
  data runs out
- An operator named on the site, a published methodology, and a public record
  of every correction

If you work in civic tech, data journalism, public administration or open
data, and especially if you live in one of the other 8,130 towns, I'd like to
hear from you.

First comment: civicpulse.es · github.com/datarhan/civicpulse

#CivicTech #Elections2027 #OpenSource #Democracy #OpenData #Spain
