#!/usr/bin/env node
/**
 * Renders the LinkedIn card series to images/*.png (1080×1350).
 *
 * Every figure on a card is read from the committed snapshots in public/data/
 * at render time, never typed in — a card re-rendered after the nightly moves a
 * number says the new number. The two external figures (news deserts, total
 * municipalities) carry their citation in SOURCES below.
 *
 *   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node marketing/linkedin/render.mjs
 *
 * Fonts are vendored in fonts/ (SIL OFL), so a render needs no network.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT = join(HERE, 'images')
const BUILD = join(HERE, '.build')
mkdirSync(OUT, { recursive: true })
mkdirSync(BUILD, { recursive: true })

const data = (f) => JSON.parse(readFileSync(join(ROOT, 'public', 'data', f), 'utf8'))

// ── Figures, derived ───────────────────────────────────────────────────────
const exec = data('budget-execution.json').latest
const g = exec.gastos.total
const M = (v) => (v / 1e6).toFixed(2)
const budget = {
  year: exec.year,
  asOf: exec.fechaListado,
  inicial: M(g.inicial),
  mods: M(g.modificaciones),
  definitivo: M(g.actual),
  obligaciones: M(g.ejecutado),
  ratio: (g.actual / g.ejecutado).toFixed(1),
  raw: g,
}

const geo = data('tender-geo.json').universe
const map = {
  located: M(geo.locatedAmount),
  total: M(geo.totalAmount),
  pct: ((100 * geo.locatedAmount) / geo.totalAmount).toFixed(1),
  share: geo.locatedAmount / geo.totalAmount,
  nLocated: geo.locatedContracts,
  nTotal: geo.totalContracts,
  from: geo.dateMin.slice(0, 4),
  to: geo.dateMax.slice(0, 4),
}

const cob = data('coste-efectivo.json').cobertura
const dea = data('dea.json')

// Negreira-Rey, Vázquez-Herrero & López-García, Media and Communication 11(3), 2023.
const DESERTS = { n: 6304, of: 8131, pct: '77.53', people: '11.6' }

// ── Card shell ─────────────────────────────────────────────────────────────
const FONTS = pathToFileURL(join(HERE, 'fonts', 'fonts.css')).href
const TOTAL = 12

function card({ n, track, h1, dek = '', viz, answer = '', src }) {
  const issue =
    n === 0 ? '<b>Style sheet</b>' : `<b>Nº ${String(n).padStart(2, '0')}</b> / ${TOTAL}`
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${pathToFileURL(join(HERE, 'brand.css'))}">
</head><body><div class="card">
<header class="mast"><div class="brand"><span class="mark"></span>CIVICPULSE</div>
<div class="issue">${issue} · Riba-roja de Túria</div></header>
<div class="eyebrow">${track}</div>
<h1>${h1}</h1>
${dek ? `<p class="dek">${dek}</p>` : ''}
<div class="viz">${viz}</div>
${answer ? `<div class="answer"><span class="who">CivicPulse →</span><span>${answer}</span></div>` : ''}
<footer class="foot"><div class="src">${src}</div><div class="url">civicpulse.es</div></footer>
</div></body></html>`
}

const fn = (k, cls = '') => `<span class="fn ${cls}">${k}</span>`
const TRACK = {
  idea: 'Idea',
  civic: 'Civic problem',
  gov: 'How local government works',
  method: 'Method',
  build: 'Build',
}

// ── The series ─────────────────────────────────────────────────────────────
const cards = []

// 00 · style sheet
cards.push({
  n: 0,
  track: 'The graphic system',
  h1: 'Paper, ink, petróleo — and a footnote on every figure.',
  viz: `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:40px">
 ${[
   ['Paper', '#FAF8F2', 'var(--ink)', '1px solid var(--hair)'],
   ['Ink', '#0B0F19', '#fff', 'none'],
   ['Petróleo', '#0E5B62', '#fff', 'none'],
   ['Accent', '#B0291F', '#fff', 'none'],
 ]
   .map(
     ([
       name,
       hex,
       fg,
       bd,
     ]) => `<div style="background:${hex};color:${fg};border:${bd};height:170px;padding:18px;display:flex;flex-direction:column;justify-content:flex-end">
   <div style="font-weight:600;font-size:24px">${name}</div><div class="mono" style="font-size:17px;opacity:.8">${hex}</div></div>`,
   )
   .join('')}
</div>
<div style="display:grid;grid-template-columns:1.25fr 1fr;gap:40px;margin-top:44px;align-items:start">
 <div>
  <div class="mono" style="font-size:16px;color:var(--ink60);letter-spacing:.12em">HEADLINE · FRAUNCES 700</div>
  <div style="font-family:var(--serif);font-weight:700;font-size:54px;line-height:1.05;margin:8px 0 26px">A missing year is <em style="color:var(--accent);font-weight:600">not</em> a zero.</div>
  <div class="mono" style="font-size:16px;color:var(--ink60);letter-spacing:.12em">BODY · OUTFIT 400</div>
  <div style="font-size:26px;line-height:1.4;color:var(--ink80);margin:8px 0 26px">Plain sentences, short lines, no jargon without a gloss.</div>
  <div class="mono" style="font-size:16px;color:var(--ink60);letter-spacing:.12em">FIGURES · DM MONO</div>
  <div class="mono" style="font-size:54px;font-weight:500;margin-top:6px">€${budget.obligaciones}M${fn(1)}</div>
 </div>
 <div style="border-left:1px solid var(--ink);padding-left:30px;font-size:22px;line-height:1.5;color:var(--ink80)">
  <div style="font-weight:600;color:var(--ink);margin-bottom:10px">Rules</div>
  1 · Every figure carries a ${fn('1', 'sm')} marker and its source sits in the footer.<br>
  2 · Red marks the one thing to look at. Never decoration.<br>
  3 · Show the gap: absence is drawn, not hidden.<br>
  4 · No person is ever named on a card.<br>
  5 · 1080 × 1350, masthead + double rule, footer + URL.
 </div>
</div>`,
  answer: `Every card ends here: how the project answers the problem the card names.`,
  src: `${fn(1)}Figures are read from the site's own snapshots at render time.`,
})

// 01 · IDEA — intro
cards.push({
  n: 1,
  track: TRACK.idea,
  h1: 'You fund it every year. Have you ever <em>read its accounts?</em>',
  dek: 'The town hall decides your street, your water bill and who collects your bins. You pay for it whether you look or not.',
  viz: `<div style="margin-top:36px;border-top:1px solid var(--ink20)">
${[
  ['Who runs each area?', 'Portal de transparencia'],
  ['What does a service cost?', 'MinHac · coste efectivo'],
  ['Who got the contract?', 'PLACSP'],
  ['What was voted?', 'Actas de pleno'],
  ['What was promised?', 'Programas electorales'],
]
  .map(
    (
      [q, s],
      i,
    ) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 0;border-bottom:1px solid var(--ink20)">
  <span style="font-family:var(--serif);font-size:36px;font-weight:600">${q}</span>
  <span class="mono" style="font-size:20px;color:var(--civic)">${fn(i + 1, 'sm')} ${s}</span></div>`,
  )
  .join('')}
</div>`,
  answer: `rebuilds one town hall from the resident’s side: every question answered from a public source, and cited.`,
  src: `${fn('1–5')}All public-sector or open-licensed data (Ley 19/2013, datos.gob.es CC-BY). Methodology: civicpulse.es/metodologia`,
})

// 02 · CIVIC — news deserts
{
  const filled = Math.round(Number(DESERTS.pct))
  const cells = Array.from(
    { length: 100 },
    (_, i) =>
      `<div style="aspect-ratio:1;${i < filled ? 'background:var(--ink)' : 'border:2px solid var(--hair)'}"></div>`,
  ).join('')
  cards.push({
    n: 2,
    track: TRACK.civic,
    h1: 'Most of Spain’s town halls are watched by <em>nobody.</em>',
    dek: `The national press covers national politics. The level that decides your street, your water bill and your bin contract has, in most places, no local newsroom at all.`,
    viz: `<div style="display:grid;grid-template-columns:430px 1fr;gap:52px;align-items:center;margin-top:10px">
  <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:7px">${cells}</div>
  <div>
   <div class="mono" style="font-size:96px;font-weight:500;line-height:1;letter-spacing:-.03em;white-space:nowrap">${DESERTS.pct}%${fn(1)}</div>
   <div style="font-size:28px;line-height:1.35;margin-top:18px;color:var(--ink80)">of municipalities — <b style="color:var(--ink)">${DESERTS.n.toLocaleString('en')} of ${DESERTS.of.toLocaleString('en')}</b> — are news deserts, home to <b style="color:var(--ink)">${DESERTS.people} million</b> people.</div>
   <div class="mono" style="font-size:17px;color:var(--ink60);margin-top:20px">■ one square ≈ 1% of Spain’s municipalities</div>
  </div></div>`,
    answer: `does the missing newsroom’s homework for one town — contracts, budgets, votes, promises — and is built to scale to all ${DESERTS.of.toLocaleString('en')}.`,
    src: `${fn(1)}Negreira-Rey, Vázquez-Herrero & López-García, “Media and Communication” 11(3), 2023. doi.org/10.17645/mac.v11i3.6727`,
  })
}

// 03 · GOV — two tiers, checked differently
{
  const col = (
    title,
    who,
    rows,
    tone,
  ) => `<div style="background:var(--paper);border:1px solid var(--hair);padding:34px 34px 30px">
   <div class="mono" style="font-size:18px;letter-spacing:.12em;color:${tone};text-transform:uppercase">${who}</div>
   <div style="font-family:var(--serif);font-size:38px;font-weight:700;margin:10px 0 22px;line-height:1.1">${title}</div>
   ${rows.map(([ok, t]) => `<div style="display:flex;gap:14px;font-size:25px;line-height:1.35;padding:10px 0;border-top:1px solid var(--ink20)"><span class="mono" style="color:${ok ? 'var(--civic)' : 'var(--ink60)'};width:28px">${ok ? '✓' : '—'}</span><span style="color:${ok ? 'var(--ink)' : 'var(--ink60)'}">${t}</span></div>`).join('')}
  </div>`
  cards.push({
    n: 3,
    track: TRACK.gov,
    h1: 'The auditor needs a degree and a national exam. The councillor needs <em>your vote.</em>',
    viz: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:10px">
  ${col(
    'Checked technically',
    'Secretary · Interventor',
    [
      [1, 'University degree'],
      [1, 'National competitive exam'],
      [1, 'Audits the money, certifies decisions'],
    ],
    'var(--civic)',
  )}
  ${col(
    'Checked electorally',
    'Elected councillor',
    [
      [1, 'Of age, on the electoral roll'],
      [1, 'Not disqualified'],
      [0, 'No qualification required — by design'],
    ],
    'var(--accent)',
  )}
 </div>`,
    answer: `publishes what each office-holder declared beside what the law asks of the post. If the check is the vote, the voter needs the facts.`,
    src: `${fn(1)}RD 128/2018, arts. 17–19 (funcionarios de habilitación nacional) · ${fn(2)}LOREG, art. 6.1 (eligibility)`,
  })
}

// 04 · CIVIC — publication is not legibility
cards.push({
  n: 4,
  track: TRACK.civic,
  h1: 'Transparency law produces documents. People have <em>questions.</em>',
  viz: `<div style="display:grid;grid-template-columns:1fr 90px 1fr;align-items:center;margin-top:26px">
  <div>
   <div class="mono" style="font-size:18px;letter-spacing:.12em;color:var(--ink60);margin-bottom:18px">WHAT THE PORTAL PUBLISHES${fn(1, 'sm')}</div>
   ${[
     'Staffing table.pdf',
     'Budget_2025.pdf',
     'Works_file_17.pdf',
     'CV_councillor.pdf',
     'Acta_pleno_03.pdf',
   ]
     .map(
       (d, i) =>
         `<div class="mono" style="background:var(--paper);border:1px solid var(--hair);padding:16px 20px;font-size:21px;margin:0 0 10px ${i * 14}px;box-shadow:3px 3px 0 var(--hair)">▤ ${d}</div>`,
     )
     .join('')}
  </div>
  <div style="text-align:center;font-family:var(--serif);font-size:64px;color:var(--civic)">→</div>
  <div>
   <div class="mono" style="font-size:18px;letter-spacing:.12em;color:var(--civic);margin-bottom:18px">WHAT A RESIDENT ASKS</div>
   ${['Is this expensive?', 'Did that get done?', 'Is it getting worse?', 'Who do I ask?']
     .map(
       (q) =>
         `<div style="font-family:var(--serif);font-size:38px;font-weight:600;padding:14px 0;border-bottom:1px solid var(--ink20)">${q}</div>`,
     )
     .join('')}
  </div></div>`,
  answer: `turns the documents into series, denominators and comparisons — what a service costs per unit against towns of the same size.`,
  src: `${fn(1)}Active-publicity duties, Ley 19/2013 de Transparencia, arts. 5–8.`,
})

// 05 · GOV — the budget words
{
  const W = 880
  const s = (v) => (W * v) / budget.raw.actual
  const bar = (label, val, x, w, color, strong) => `<div style="margin-bottom:26px">
    <div style="display:flex;justify-content:space-between;font-size:24px;margin-bottom:8px;width:${W}px">
     <span style="${strong ? 'font-weight:600' : 'color:var(--ink80)'}">${label}</span>
     <span class="mono" style="font-weight:500;${strong ? 'color:var(--accent)' : ''}">€${val}M${fn(1, 'sm')}</span></div>
    <div style="position:relative;height:46px;width:${W}px;background:var(--ink20)">
     <div style="position:absolute;left:${x}px;width:${w}px;top:0;bottom:0;background:${color}"></div></div></div>`
  cards.push({
    n: 5,
    track: TRACK.gov,
    h1: 'A budget is not what was <em>spent.</em>',
    dek: `Riba-roja’s ${budget.year} spending budget, four honest numbers. Read the biggest one as “spent” and you are wrong by ${budget.ratio}×.`,
    viz: `<div style="margin-top:20px">
     ${bar('Initial credit — what was approved', budget.inicial, 0, s(budget.raw.inicial), 'var(--ink60)')}
     ${bar('+ Modifications during the year', budget.mods, s(budget.raw.inicial), s(budget.raw.modificaciones), 'var(--hair)')}
     ${bar('= Definitive credit — the ceiling', budget.definitivo, 0, s(budget.raw.actual), 'var(--ink)')}
     ${bar('Recognised obligations — actually spent', budget.obligaciones, 0, s(budget.raw.ejecutado), 'var(--accent)', true)}
    </div>`,
    answer: `an automatic check flags the word “spent” whenever it sits beside a figure that is not spending.`,
    src: `${fn(1)}Ayuntamiento de Riba-roja de Túria, estado de ejecución del presupuesto de gastos, listing of ${budget.asOf}.`,
  })
}

// 06 · GOV — concessions never enter the books
cards.push({
  n: 6,
  track: TRACK.gov,
  h1: 'Some public services never appear in the <em>council’s books.</em>',
  dek: 'When a concessionaire bills residents directly, the municipal accounts show nothing. The blank cell is not missing data — it is a different fact.',
  viz: `<svg viewBox="0 0 936 470" width="936" height="470" style="margin-top:24px;font-family:Outfit">
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0,0L10,5L0,10z" fill="#0B0F19"/></marker>
  <marker id="r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0,0L10,5L0,10z" fill="#B0291F"/></marker></defs>
  <rect x="330" y="20" width="276" height="120" fill="#fff" stroke="#DCD7C8"/>
  <text x="468" y="72" text-anchor="middle" font-size="28" font-weight="600">Town hall</text>
  <text x="468" y="108" text-anchor="middle" font-size="20" font-family="DM Mono" fill="rgba(11,15,25,.62)">awards the concession</text>
  <rect x="20" y="320" width="276" height="120" fill="#fff" stroke="#DCD7C8"/>
  <text x="158" y="388" text-anchor="middle" font-size="28" font-weight="600">Resident</text>
  <rect x="640" y="320" width="276" height="120" fill="#fff" stroke="#DCD7C8"/>
  <text x="778" y="372" text-anchor="middle" font-size="28" font-weight="600">Concessionaire</text>
  <text x="778" y="408" text-anchor="middle" font-size="20" font-family="DM Mono" fill="rgba(11,15,25,.62)">runs the service</text>
  <path d="M530 140 L700 318" stroke="#0B0F19" stroke-width="2.5" fill="none" marker-end="url(#a)"/>
  <path d="M298 380 L636 380" stroke="#B0291F" stroke-width="5" fill="none" marker-end="url(#r)"/>
  <text x="467" y="362" text-anchor="middle" font-size="24" font-weight="600" fill="#B0291F">pays the bill directly</text>
  <path d="M400 140 L230 318" stroke="#0B0F19" stroke-width="2" stroke-dasharray="8 8" fill="none"/>
  <rect x="190" y="200" width="200" height="44" fill="#FAF8F2"/>
  <text x="290" y="229" text-anchor="middle" font-size="21" font-family="DM Mono" fill="rgba(11,15,25,.62)">€0 in the accounts</text>
 </svg>`,
  answer: `names the company, the award and the amount — instead of a dash that reads like ignorance.`,
  src: `${fn(1)}Service-cost fichas at civicpulse.es/eficiencia, built on MinHac’s coste efectivo returns (Orden HAP/2075/2014).`,
})

// 07 · METHOD — the map shows 1.8%
{
  const S = 560
  const side = Math.round(S * Math.sqrt(map.share))
  cards.push({
    n: 7,
    track: TRACK.method,
    h1: `Our spending map shows ${map.pct}% of the money. <em>It says so.</em>`,
    viz: `<div style="display:grid;grid-template-columns:${S}px 1fr;gap:48px;align-items:end;margin-top:20px">
     <div style="position:relative;width:${S}px;height:${S}px;background:var(--ink20)">
      <div style="position:absolute;left:0;bottom:0;width:${side}px;height:${side}px;background:var(--accent)"></div>
      <div class="mono" style="position:absolute;left:${side + 14}px;bottom:8px;font-size:18px;color:var(--accent);font-weight:500">← on the map</div>
      <div class="mono" style="position:absolute;right:18px;top:16px;font-size:18px;color:var(--ink60)">all contracts · area = €</div>
     </div>
     <div style="font-size:26px;line-height:1.4;color:var(--ink80)">
      <div class="mono" style="font-size:64px;font-weight:500;color:var(--ink);line-height:1">€${map.located}M${fn(1, 'sm')}</div>
      <div style="margin:6px 0 24px">of <b class="mono" style="color:var(--ink)">€${map.total}M</b> contracted, ${map.from}–${map.to}</div>
      A pin needs a contract whose own title names a place: <b style="color:var(--ink)">${map.nLocated} of ${map.nTotal}</b>. Most public money is town-wide services with nowhere to put a pin.
     </div></div>`,
    answer: `prints on the map itself how much it cannot show. An honest miss beats a wrong pin.`,
    src: `${fn(1)}PLACSP public-procurement contracts, ${map.from}–${map.to}, matched to OpenStreetMap places.`,
  })
}

// 08 · METHOD — a missing year is not a zero
{
  const years = cob.entregasPublicadas
  const miss = new Set(cob.entregasNoPresentadas)
  const cells = years
    .map((y) =>
      miss.has(y)
        ? `<div style="text-align:center"><div style="height:260px;border:3px solid var(--accent);background:repeating-linear-gradient(135deg,transparent 0 10px,rgba(176,41,31,.18) 10px 12px)"></div><div class="mono" style="font-size:20px;margin-top:10px;color:var(--accent);font-weight:500">${y}</div></div>`
        : `<div style="text-align:center"><div style="height:260px;background:var(--civic)"></div><div class="mono" style="font-size:20px;margin-top:10px;color:var(--ink60)">${String(y).slice(2)}</div></div>`,
    )
    .join('')
  const missing = cob.entregasNoPresentadas.join(', ')
  cards.push({
    n: 8,
    track: TRACK.method,
    h1: 'A missing year is <em>not</em> a zero.',
    dek: `Every year the ministry publishes what each town declared its services cost. For ${missing}, Riba-roja’s return isn’t there. That gap is a fact about the council — not a blank in our chart.`,
    viz: `<div style="display:grid;grid-template-columns:repeat(${years.length},1fr);gap:10px;margin-top:30px">${cells}</div>
     <div style="display:flex;gap:40px;margin-top:26px;font-size:22px;color:var(--ink80)">
      <span><span style="display:inline-block;width:18px;height:18px;background:var(--civic);margin-right:10px;vertical-align:-2px"></span>return filed${fn(1, 'sm')}</span>
      <span><span style="display:inline-block;width:18px;height:18px;border:3px solid var(--accent);margin-right:10px;vertical-align:-3px"></span>no return filed</span>
     </div>`,
    answer: `draws “zero”, “not declared” and “never filed” as three different things — because they are.`,
    src: `${fn(1)}Ministerio de Hacienda, coste efectivo de los servicios (Orden HAP/2075/2014), returns ${years[0]}–${years.at(-1)}.`,
  })
}

// 09 · IDEA — we don't score
{
  const specs = dea.especificaciones
  const box = (s) => {
    const ok = s.estado === 'publicada'
    const gl = s.gradosLibertad
    return `<div style="background:var(--paper);border:1px solid ${ok ? 'var(--hair)' : 'var(--accent)'};padding:24px 26px;${ok ? '' : 'background-image:repeating-linear-gradient(135deg,transparent 0 12px,rgba(176,41,31,.06) 12px 14px)'}">
     <div class="mono" style="font-size:17px;letter-spacing:.1em;color:${ok ? 'var(--civic)' : 'var(--accent)'};font-weight:500">${ok ? 'PUBLISHED' : 'FAILED · PUBLISHED AS FAILED'}</div>
     <div style="font-size:26px;font-weight:600;margin:10px 0 8px;line-height:1.2">${s.titulo}</div>
     <div class="mono" style="font-size:18px;color:var(--ink60)">${gl.n} comparable towns · needs ${gl.minimo}</div></div>`
  }
  cards.push({
    n: 9,
    track: TRACK.idea,
    h1: 'We built an efficiency model. We publish the method — <em>not a ranking.</em>',
    dek: 'Equally defensible choices of which services to compare move the score across half the scale. A league table would describe our choices, not the town.',
    viz: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:26px">${specs.map(box).join('')}</div>`,
    answer: `ships the method, failed specifications included. No other town is named, and the model never produces a finding.`,
    src: `${fn(1)}DEA experiment at civicpulse.es/laboratorio/frontera — ${dea.stats.especificaciones} specifications, ${dea.stats.publicadas} published, ${dea.stats.insuficientes} failed; MinHac returns for ${dea.stats.entrega}.`,
  })
}

// 10 · IDEA — machines retract, humans publish
{
  const step = (
    k,
    t,
    sub,
    tone,
  ) => `<div style="display:flex;gap:26px;align-items:center;background:var(--paper);border:1px solid var(--hair);border-left:8px solid ${tone};padding:24px 28px">
    <div class="mono" style="font-size:44px;font-weight:500;color:${tone};width:56px">${k}</div>
    <div><div style="font-size:30px;font-weight:600">${t}</div><div class="mono" style="font-size:19px;color:var(--ink60);margin-top:4px">${sub}</div></div></div>`
  const arrow = `<div style="text-align:center;font-size:34px;color:var(--ink60);line-height:1.2">↓</div>`
  cards.push({
    n: 10,
    track: TRACK.idea,
    h1: 'Machines may retract. Only a human <em>may publish.</em>',
    viz: `<div style="display:grid;grid-template-columns:1fr 200px;gap:26px;align-items:stretch;margin-top:10px">
     <div>
      ${step('01', 'Machine suggestion', 'requiresHumanApproval: true', 'var(--ink60)')}${arrow}
      ${step('02', 'Citation check', 'source exists · quote verbatim · URL alive', 'var(--civic)')}${arrow}
      ${step('03', 'Human curator signs', 'bloc-level unless a person is verified', 'var(--civic)')}${arrow}
      ${step('04', 'Published — with right of reply', 'every correction is a public git commit', 'var(--ink)')}
     </div>
     <div style="position:relative;border-left:4px solid var(--accent);padding-left:20px;display:flex;align-items:center">
      <div style="font-size:24px;line-height:1.35;color:var(--accent);font-weight:600">↑ An automated verdict can only go <u>down</u>: retract, never promote.</div>
     </div></div>`,
    answer: `keeps machine output in a separate file, labelled “pending review”, that can never overwrite a published status.`,
    src: `${fn(1)}Editorial contract published at civicpulse.es/metodologia and /aviso-legal. Schema validators enforce each gate.`,
  })
}

// 11 · BUILD — green is not right
cards.push({
  n: 11,
  track: TRACK.build,
  h1: 'Our tests were green. They were <em>measuring nothing.</em>',
  viz: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">
    <div style="background:var(--paper);border:1px solid var(--hair);padding:30px">
     <div class="mono" style="font-size:18px;color:var(--ink60)">accessibility · colour contrast</div>
     <div class="mono" style="font-size:58px;color:var(--ok, #15803D);font-weight:500;margin:14px 0">✓ 0</div>
     <div style="font-size:24px">violations found</div>
     <div class="mono" style="font-size:22px;color:var(--accent);margin-top:22px;border-top:1px solid var(--ink20);padding-top:14px;font-weight:500">elements checked: 0</div>
    </div>
    <div style="background:var(--paper);border:1px solid var(--hair);padding:30px">
     <div class="mono" style="font-size:18px;color:var(--ink60)">mobile · 375px layout</div>
     <div class="mono" style="font-size:58px;color:#15803D;font-weight:500;margin:14px 0">✓ pass</div>
     <div style="font-size:24px">nothing overflows</div>
     <div class="mono" style="font-size:22px;color:var(--accent);margin-top:22px;border-top:1px solid var(--ink20);padding-top:14px;font-weight:500">because it was clipped</div>
    </div></div>`,
  answer: `every gate must now prove it evaluated something — and no page ships until a human has looked at it in a browser.`,
  src: `${fn(1)}From the project’s engineering notes. Open source, AGPL-3.0 — github.com/datarhan/civicpulse`,
})

// 12 · IDEA — May 2027, one of 8,131
{
  const cols = 130
  const pitch = 7.2
  const rows = Math.ceil(DESERTS.of / cols)
  const hi = Math.floor(rows / 2) * cols + Math.floor(cols * 0.55)
  let dots = ''
  for (let i = 0; i < DESERTS.of; i++) {
    const x = (i % cols) * pitch + 4
    const y = Math.floor(i / cols) * pitch + 4
    if (i !== hi)
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="#0B0F19" fill-opacity=".3"/>`
  }
  const hx = (hi % cols) * pitch + 4
  const hy = Math.floor(hi / cols) * pitch + 4
  const H = rows * pitch + 8
  cards.push({
    n: 12,
    track: TRACK.idea,
    h1: `May 2027: ${DESERTS.of.toLocaleString('en')} town halls face the voters. <em>One</em> is fully mapped.`,
    viz: `<svg viewBox="0 0 936 ${H}" width="936" height="${H}" style="margin-top:28px;overflow:visible">${dots}
      <circle cx="${hx}" cy="${hy}" r="16" fill="#B0291F"/><circle cx="${hx}" cy="${hy}" r="30" fill="none" stroke="#B0291F" stroke-width="2"/>
      <rect x="${hx + 40}" y="${hy - 22}" width="250" height="44" fill="#FAF8F2"/>
      <text x="${hx + 52}" y="${hy + 8}" font-family="DM Mono" font-size="22" font-weight="500" fill="#B0291F">← Riba-roja de Túria</text>
     </svg>`,
    answer: `Riba-roja is the depth; Spain is the breadth. Open source, no ads, no investors, no money from any government it watches.`,
    src: `${fn(1)}One dot per Spanish municipality (${DESERTS.of.toLocaleString('en')}). Open source, AGPL-3.0. Join, fork, or bring it to your town.`,
  })
}

// ── Render ─────────────────────────────────────────────────────────────────
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const browser = await chromium
  .launch({ executablePath: '/opt/pw-browsers/chromium' })
  .catch(() => chromium.launch())
const page = await browser.newPage({
  viewport: { width: 1080, height: 1350 },
  deviceScaleFactor: 2,
})
const only = process.argv[2]
for (const c of cards) {
  if (only !== undefined && String(c.n) !== only) continue
  const name = `post-${String(c.n).padStart(2, '0')}`
  const html = join(BUILD, `${name}.html`)
  writeFileSync(html, card(c))
  await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  // A card whose content spills past the footer is a broken card: fail loudly.
  const spill = await page.evaluate(() => {
    const c = document.querySelector('.card')
    const f = document.querySelector('.foot').getBoundingClientRect()
    const kids = [...document.querySelectorAll('.viz > *')]
    const bottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom))
    return { over: c.scrollHeight - c.clientHeight, gap: f.top - 24 - bottom }
  })
  if (spill.over > 0 || spill.gap < 0)
    console.warn(`! ${name} overflows by ${Math.max(spill.over, -spill.gap)}px`)
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log(`✓ ${name}`)
}
await browser.close()
