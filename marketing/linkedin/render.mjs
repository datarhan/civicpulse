#!/usr/bin/env node
/**
 * Renders the LinkedIn card series (1080×1350): English to images/, Spanish to
 * images/es/. One source for both, so the two series can never disagree on a
 * figure — every card holds its copy as T(english, spanish).
 *
 * Every figure on a card is read from the committed snapshots in public/data/
 * at render time, never typed in — a card re-rendered after the nightly moves a
 * number says the new number. The two external figures (news deserts, total
 * municipalities) carry their citation in SOURCES below.
 *
 *   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node marketing/linkedin/render.mjs [--lang es] [N]
 *
 * Fonts are vendored in fonts/ (SIL OFL), so a render needs no network.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const args = process.argv.slice(2)
const ES = args.includes('--lang') && args[args.indexOf('--lang') + 1] === 'es'
const only = args.find((a, i) => /^\d+$/.test(a) && args[i - 1] !== '--lang')
const T = (en, es) => (ES ? es : en)
const OUT = join(HERE, 'images', ES ? 'es' : '')
const BUILD = join(HERE, '.build', ES ? 'es' : 'en')
mkdirSync(OUT, { recursive: true })
mkdirSync(BUILD, { recursive: true })

const data = (f) => JSON.parse(readFileSync(join(ROOT, 'public', 'data', f), 'utf8'))

// ── Figures, derived ───────────────────────────────────────────────────────
const exec = data('budget-execution.json').latest
const g = exec.gastos.total
// Locale-aware figures: «62,12 M€», «77,53 %», «8.131» in Spanish.
const dec = (v, d) => (ES ? v.toFixed(d).replace('.', ',') : v.toFixed(d))
const M = (v) => dec(v / 1e6, 2)
const eur = (m) => (ES ? `${m} M€` : `€${m}M`)
const pctf = (p) => (ES ? `${p}\u202f%` : `${p}%`)
const int = (n) => n.toLocaleString(ES ? 'de-DE' : 'en')
const budget = {
  year: exec.year,
  asOf: exec.fechaListado,
  inicial: M(g.inicial),
  mods: M(g.modificaciones),
  definitivo: M(g.actual),
  obligaciones: M(g.ejecutado),
  ratio: dec(g.actual / g.ejecutado, 1),
  raw: g,
}

const geo = data('tender-geo.json').universe
const map = {
  located: M(geo.locatedAmount),
  total: M(geo.totalAmount),
  pct: dec((100 * geo.locatedAmount) / geo.totalAmount, 1),
  share: geo.locatedAmount / geo.totalAmount,
  nLocated: geo.locatedContracts,
  nTotal: geo.totalContracts,
  from: geo.dateMin.slice(0, 4),
  to: geo.dateMax.slice(0, 4),
}

const cob = data('coste-efectivo.json').cobertura
const dea = data('dea.json')

// Negreira-Rey, Vázquez-Herrero & López-García, Media and Communication 11(3), 2023.
const DESERTS = { n: 6304, of: 8131, pct: dec(77.53, 2), share: 0.7753, people: dec(11.6, 1) }

// ── Card shell ─────────────────────────────────────────────────────────────
const FONTS = pathToFileURL(join(HERE, 'fonts', 'fonts.css')).href
const TOTAL = 12

function card({ n, track, h1, dek = '', viz, answer = '', src }) {
  const issue =
    n === 0
      ? `<b>${T('Style sheet', 'Hoja de estilo')}</b>`
      : `<b>Nº ${String(n).padStart(2, '0')}</b> / ${TOTAL}`
  return `<!doctype html><html lang="${T('en', 'es')}"><head><meta charset="utf-8">
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
  civic: T('Civic problem', 'Problema cívico'),
  gov: T('How local government works', 'Cómo funciona el ayuntamiento'),
  method: T('Method', 'Método'),
  build: T('Build', 'Ingeniería'),
}

// ── The series ─────────────────────────────────────────────────────────────
const cards = []

// 00 · style sheet
cards.push({
  n: 0,
  track: T('The graphic system', 'El sistema gráfico'),
  h1: T(
    'Paper, ink, petróleo — and a footnote on every figure.',
    'Papel, tinta, petróleo — y una nota en cada cifra.',
  ),
  viz: `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:40px">
 ${[
   [T('Paper', 'Papel'), '#FAF8F2', 'var(--ink)', '1px solid var(--hair)'],
   [T('Ink', 'Tinta'), '#0B0F19', '#fff', 'none'],
   ['Petróleo', '#0E5B62', '#fff', 'none'],
   [T('Accent', 'Acento'), '#B0291F', '#fff', 'none'],
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
  <div class="mono" style="font-size:16px;color:var(--ink60);letter-spacing:.12em">${T('HEADLINE', 'TITULAR')} · FRAUNCES 700</div>
  <div style="font-family:var(--serif);font-weight:700;font-size:54px;line-height:1.05;margin:8px 0 26px">${T('A missing year is <em style="color:var(--accent);font-weight:600">not</em> a zero.', 'Un año que falta <em style="color:var(--accent);font-weight:600">no</em> es un cero.')}</div>
  <div class="mono" style="font-size:16px;color:var(--ink60);letter-spacing:.12em">${T('BODY', 'CUERPO')} · OUTFIT 400</div>
  <div style="font-size:26px;line-height:1.4;color:var(--ink80);margin:8px 0 26px">${T('Plain sentences, short lines, no jargon without a gloss.', 'Frases llanas, líneas cortas, ninguna jerga sin glosa.')}</div>
  <div class="mono" style="font-size:16px;color:var(--ink60);letter-spacing:.12em">${T('FIGURES', 'CIFRAS')} · DM MONO</div>
  <div class="mono" style="font-size:54px;font-weight:500;margin-top:6px">${eur(budget.obligaciones)}${fn(1)}</div>
 </div>
 <div style="border-left:1px solid var(--ink);padding-left:30px;font-size:22px;line-height:1.5;color:var(--ink80)">
  <div style="font-weight:600;color:var(--ink);margin-bottom:10px">${T('Rules', 'Reglas')}</div>
  ${T(
    `1 · Every figure carries a ${fn('1', 'sm')} marker and its source sits in the footer.<br>
  2 · Red marks the one thing to look at. Never decoration.<br>
  3 · Show the gap: absence is drawn, not hidden.<br>
  4 · No person is ever named on a card.<br>
  5 · 1080 × 1350, masthead + double rule, footer + URL.`,
    `1 · Cada cifra lleva su marca ${fn('1', 'sm')} y su fuente va en el pie.<br>
  2 · El rojo señala lo único que hay que mirar. Nunca decora.<br>
  3 · Mostrar el hueco: la ausencia se dibuja, no se esconde.<br>
  4 · Ninguna tarjeta nombra a una persona.<br>
  5 · 1080 × 1350, cabecera + doble filete, pie + URL.`,
  )}
 </div>
</div>`,
  answer: T(
    'Every card ends here: how the project answers the problem the card names.',
    'Cada tarjeta termina aquí: cómo responde el proyecto al problema que nombra.',
  ),
  src: `${fn(1)}${T("Figures are read from the site's own snapshots at render time.", 'Las cifras se leen de los propios datos del sitio al generar la imagen.')}`,
})

// 01 · IDEA — intro
cards.push({
  n: 1,
  track: TRACK.idea,
  h1: T(
    'You fund it every year. Have you ever <em>read its accounts?</em>',
    'Lo pagas cada año. ¿Has leído alguna vez <em>sus cuentas?</em>',
  ),
  dek: T(
    'The town hall decides your street, your water bill and who collects your bins. You pay for it whether you look or not.',
    'El ayuntamiento decide tu calle, tu recibo del agua y quién recoge tu basura. Lo pagas lo mires o no.',
  ),
  viz: `<div style="margin-top:36px;border-top:1px solid var(--ink20)">
${[
  [T('Who runs each area?', '¿Quién lleva cada área?'), 'Portal de transparencia'],
  [T('What does a service cost?', '¿Cuánto cuesta un servicio?'), 'MinHac · coste efectivo'],
  [T('Who got the contract?', '¿Quién se llevó el contrato?'), 'PLACSP'],
  [T('What was voted?', '¿Qué se votó?'), 'Actas de pleno'],
  [T('What was promised?', '¿Qué se prometió?'), 'Programas electorales'],
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
  answer: T(
    'rebuilds one town hall from the resident’s side: every question answered from a public source, and cited.',
    'reconstruye un ayuntamiento desde el lado del vecino: cada pregunta, respondida con una fuente pública y citada.',
  ),
  src: `${fn('1–5')}${T('All public-sector or open-licensed data (Ley 19/2013, datos.gob.es CC-BY). Methodology: civicpulse.es/metodologia', 'Solo datos del sector público o con licencia abierta (Ley 19/2013, datos.gob.es CC-BY). Metodología: civicpulse.es/metodologia')}`,
})

// 02 · CIVIC — news deserts
{
  const filled = Math.round(100 * DESERTS.share)
  const cells = Array.from(
    { length: 100 },
    (_, i) =>
      `<div style="aspect-ratio:1;${i < filled ? 'background:var(--ink)' : 'border:2px solid var(--hair)'}"></div>`,
  ).join('')
  cards.push({
    n: 2,
    track: TRACK.civic,
    h1: T(
      'Most of Spain’s town halls are watched by <em>nobody.</em>',
      'A la mayoría de ayuntamientos de España <em>no los vigila nadie.</em>',
    ),
    dek: T(
      'The national press covers national politics. The level that decides your street, your water bill and your bin contract has, in most places, no local newsroom at all.',
      'La prensa nacional cubre la política nacional. El nivel que decide tu calle, tu recibo del agua y tu contrato de basuras no tiene, casi nunca, una redacción local.',
    ),
    viz: `<div style="display:grid;grid-template-columns:430px 1fr;gap:52px;align-items:center;margin-top:10px">
  <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:7px">${cells}</div>
  <div>
   <div class="mono" style="font-size:96px;font-weight:500;line-height:1;letter-spacing:-.03em;white-space:nowrap">${pctf(DESERTS.pct)}${fn(1)}</div>
   <div style="font-size:28px;line-height:1.35;margin-top:18px;color:var(--ink80)">${T(
     `of municipalities — <b style="color:var(--ink)">${int(DESERTS.n)} of ${int(DESERTS.of)}</b> — are news deserts, home to <b style="color:var(--ink)">${DESERTS.people} million</b> people.`,
     `de los municipios — <b style="color:var(--ink)">${int(DESERTS.n)} de ${int(DESERTS.of)}</b> — son desiertos informativos, donde viven <b style="color:var(--ink)">${DESERTS.people} millones</b> de personas.`,
   )}</div>
   <div class="mono" style="font-size:17px;color:var(--ink60);margin-top:20px">■ ${T('one square ≈ 1% of Spain’s municipalities', 'un cuadrado ≈ 1 % de los municipios de España')}</div>
  </div></div>`,
    answer: T(
      `does the missing newsroom’s homework for one town — contracts, budgets, votes, promises — and is built to scale to all ${int(DESERTS.of)}.`,
      `hace para un municipio los deberes de la redacción que falta — contratos, presupuestos, votaciones, promesas — y está hecho para escalar a los ${int(DESERTS.of)}.`,
    ),
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
    h1: T(
      'The auditor needs a degree and a national exam. The councillor needs <em>your vote.</em>',
      'El interventor necesita una carrera y una oposición nacional. El concejal necesita <em>tu voto.</em>',
    ),
    viz: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:10px">
  ${col(
    T('Checked technically', 'Control técnico'),
    T('Secretary · Interventor', 'Secretaría · Intervención'),
    [
      [1, T('University degree', 'Titulación universitaria')],
      [1, T('National competitive exam', 'Oposición de habilitación nacional')],
      [1, T('Audits the money, certifies decisions', 'Fiscaliza el dinero, da fe de los acuerdos')],
    ],
    'var(--civic)',
  )}
  ${col(
    T('Checked electorally', 'Control electoral'),
    T('Elected councillor', 'Concejal electo'),
    [
      [1, T('Of age, on the electoral roll', 'Mayor de edad, en el censo electoral')],
      [1, T('Not disqualified', 'No estar inhabilitado')],
      [0, T('No qualification required — by design', 'Ninguna titulación exigida — por diseño')],
    ],
    'var(--accent)',
  )}
 </div>`,
    answer: T(
      'publishes what each office-holder declared beside what the law asks of the post. If the check is the vote, the voter needs the facts.',
      'publica lo que declaró cada cargo junto a lo que la ley exige al puesto. Si el control es el voto, el votante necesita los hechos.',
    ),
    src: `${fn(1)}RD 128/2018, arts. 17–19 (${T('funcionarios de habilitación nacional', 'habilitación nacional')}) · ${fn(2)}LOREG, art. 6.1 (${T('eligibility', 'elegibilidad')})`,
  })
}

// 04 · CIVIC — publication is not legibility
cards.push({
  n: 4,
  track: TRACK.civic,
  h1: T(
    'Transparency law produces documents. People have <em>questions.</em>',
    'La ley de transparencia produce documentos. La gente tiene <em>preguntas.</em>',
  ),
  viz: `<div style="display:grid;grid-template-columns:1fr 90px 1fr;align-items:center;margin-top:26px">
  <div>
   <div class="mono" style="font-size:18px;letter-spacing:.12em;color:var(--ink60);margin-bottom:18px">${T('WHAT THE PORTAL PUBLISHES', 'LO QUE PUBLICA EL PORTAL')}${fn(1, 'sm')}</div>
   ${T(
     [
       'Staffing_table.pdf',
       'Budget_2025.pdf',
       'Works_file_17.pdf',
       'CV_councillor.pdf',
       'Acta_pleno_03.pdf',
     ],
     [
       'RPT_plantilla.pdf',
       'Presupuesto_2025.pdf',
       'Ficha_obra_17.pdf',
       'CV_concejal.pdf',
       'Acta_pleno_03.pdf',
     ],
   )
     .map(
       (d, i) =>
         `<div class="mono" style="background:var(--paper);border:1px solid var(--hair);padding:16px 20px;font-size:21px;margin:0 0 10px ${i * 14}px;box-shadow:3px 3px 0 var(--hair)">▤ ${d}</div>`,
     )
     .join('')}
  </div>
  <div style="text-align:center;font-family:var(--serif);font-size:64px;color:var(--civic)">→</div>
  <div>
   <div class="mono" style="font-size:18px;letter-spacing:.12em;color:var(--civic);margin-bottom:18px">${T('WHAT A RESIDENT ASKS', 'LO QUE PREGUNTA UN VECINO')}</div>
   ${T(
     ['Is this expensive?', 'Did that get done?', 'Is it getting worse?', 'Who do I ask?'],
     ['¿Es caro esto?', '¿Se llegó a hacer?', '¿Va a peor?', '¿A quién pregunto?'],
   )
     .map(
       (q) =>
         `<div style="font-family:var(--serif);font-size:38px;font-weight:600;padding:14px 0;border-bottom:1px solid var(--ink20)">${q}</div>`,
     )
     .join('')}
  </div></div>`,
  answer: T(
    'turns the documents into series, denominators and comparisons — what a service costs per unit against towns of the same size.',
    'convierte los documentos en series, denominadores y comparaciones — cuánto cuesta un servicio por unidad frente a municipios de su tamaño.',
  ),
  src: `${fn(1)}${T('Active-publicity duties, Ley 19/2013 de Transparencia, arts. 5–8.', 'Obligaciones de publicidad activa, Ley 19/2013 de Transparencia, arts. 5–8.')}`,
})

// 05 · GOV — the budget words
{
  const W = 880
  const s = (v) => (W * v) / budget.raw.actual
  const bar = (label, val, x, w, color, strong) => `<div style="margin-bottom:26px">
    <div style="display:flex;justify-content:space-between;font-size:24px;margin-bottom:8px;width:${W}px">
     <span style="${strong ? 'font-weight:600' : 'color:var(--ink80)'}">${label}</span>
     <span class="mono" style="font-weight:500;${strong ? 'color:var(--accent)' : ''}">${eur(val)}${fn(1, 'sm')}</span></div>
    <div style="position:relative;height:46px;width:${W}px;background:var(--ink20)">
     <div style="position:absolute;left:${x}px;width:${w}px;top:0;bottom:0;background:${color}"></div></div></div>`
  cards.push({
    n: 5,
    track: TRACK.gov,
    h1: T(
      'A budget is not what was <em>spent.</em>',
      'Un presupuesto no es lo que se <em>gastó.</em>',
    ),
    dek: T(
      `Riba-roja’s ${budget.year} spending budget, four honest numbers. Read the biggest one as “spent” and you are wrong by ${budget.ratio}×.`,
      `El presupuesto de gastos de Riba-roja de ${budget.year}, cuatro cifras honestas. Lee la mayor como «gastado» y te equivocas por ${budget.ratio}×.`,
    ),
    viz: `<div style="margin-top:20px">
     ${bar(T('Initial credit — what was approved', 'Crédito inicial — lo aprobado'), budget.inicial, 0, s(budget.raw.inicial), 'var(--ink60)')}
     ${bar(T('+ Modifications during the year', '+ Modificaciones durante el año'), budget.mods, s(budget.raw.inicial), s(budget.raw.modificaciones), 'var(--hair)')}
     ${bar(T('= Definitive credit — the ceiling', '= Crédito definitivo — el techo'), budget.definitivo, 0, s(budget.raw.actual), 'var(--ink)')}
     ${bar(T('Recognised obligations — actually spent', 'Obligaciones reconocidas — lo realmente gastado'), budget.obligaciones, 0, s(budget.raw.ejecutado), 'var(--accent)', true)}
    </div>`,
    answer: T(
      'an automatic check flags the word “spent” whenever it sits beside a figure that is not spending.',
      'una comprobación automática señala la palabra «gastado» siempre que acompaña a una cifra que no es gasto.',
    ),
    src: `${fn(1)}Ayuntamiento de Riba-roja de Túria, estado de ejecución del presupuesto de gastos, ${T('listing of', 'listado a')} ${budget.asOf}.`,
  })
}

// 06 · GOV — concessions never enter the books
cards.push({
  n: 6,
  track: TRACK.gov,
  h1: T(
    'Some public services never appear in the <em>council’s books.</em>',
    'Algunos servicios públicos nunca aparecen en <em>las cuentas municipales.</em>',
  ),
  dek: T(
    'When a concessionaire bills residents directly, the municipal accounts show nothing. The blank cell is not missing data — it is a different fact.',
    'Cuando una concesionaria cobra directamente al vecino, las cuentas municipales no muestran nada. La celda vacía no es un dato que falta: es otro hecho.',
  ),
  viz: `<svg viewBox="0 0 936 470" width="936" height="470" style="margin-top:24px;font-family:Outfit">
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0,0L10,5L0,10z" fill="#0B0F19"/></marker>
  <marker id="r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0,0L10,5L0,10z" fill="#B0291F"/></marker></defs>
  <rect x="330" y="20" width="276" height="120" fill="#fff" stroke="#DCD7C8"/>
  <text x="468" y="72" text-anchor="middle" font-size="28" font-weight="600">${T('Town hall', 'Ayuntamiento')}</text>
  <text x="468" y="108" text-anchor="middle" font-size="20" font-family="DM Mono" fill="rgba(11,15,25,.62)">${T('awards the concession', 'adjudica la concesión')}</text>
  <rect x="20" y="320" width="276" height="120" fill="#fff" stroke="#DCD7C8"/>
  <text x="158" y="388" text-anchor="middle" font-size="28" font-weight="600">${T('Resident', 'Vecino')}</text>
  <rect x="640" y="320" width="276" height="120" fill="#fff" stroke="#DCD7C8"/>
  <text x="778" y="372" text-anchor="middle" font-size="28" font-weight="600">${T('Concessionaire', 'Concesionaria')}</text>
  <text x="778" y="408" text-anchor="middle" font-size="20" font-family="DM Mono" fill="rgba(11,15,25,.62)">${T('runs the service', 'presta el servicio')}</text>
  <path d="M530 140 L700 318" stroke="#0B0F19" stroke-width="2.5" fill="none" marker-end="url(#a)"/>
  <path d="M298 380 L636 380" stroke="#B0291F" stroke-width="5" fill="none" marker-end="url(#r)"/>
  <text x="467" y="362" text-anchor="middle" font-size="24" font-weight="600" fill="#B0291F">${T('pays the bill directly', 'paga directamente')}</text>
  <path d="M400 140 L230 318" stroke="#0B0F19" stroke-width="2" stroke-dasharray="8 8" fill="none"/>
  <rect x="170" y="200" width="240" height="44" fill="#FAF8F2"/>
  <text x="290" y="229" text-anchor="middle" font-size="21" font-family="DM Mono" fill="rgba(11,15,25,.62)">${T('€0 in the accounts', '0 € en las cuentas')}</text>
 </svg>`,
  answer: T(
    'names the company, the award and the amount — instead of a dash that reads like ignorance.',
    'nombra a la empresa, la adjudicación y el importe — en vez de un guion que parece ignorancia.',
  ),
  src: `${fn(1)}${T('Service-cost fichas at civicpulse.es/eficiencia, built on MinHac’s coste efectivo returns (Orden HAP/2075/2014).', 'Fichas de coste de servicios en civicpulse.es/eficiencia, sobre el coste efectivo del MinHac (Orden HAP/2075/2014).')}`,
})

// 07 · METHOD — the map shows 1.8%
{
  const S = 560
  const side = Math.round(S * Math.sqrt(map.share))
  cards.push({
    n: 7,
    track: TRACK.method,
    h1: T(
      `Our contracts map shows ${pctf(map.pct)} of the money. <em>It says so.</em>`,
      `Nuestro mapa de contratos muestra el ${pctf(map.pct)} del dinero. <em>Y lo dice.</em>`,
    ),
    viz: `<div style="display:grid;grid-template-columns:${S}px 1fr;gap:48px;align-items:end;margin-top:20px">
     <div style="position:relative;width:${S}px;height:${S}px;background:var(--ink20)">
      <div style="position:absolute;left:0;bottom:0;width:${side}px;height:${side}px;background:var(--accent)"></div>
      <div class="mono" style="position:absolute;left:${side + 14}px;bottom:8px;font-size:18px;color:var(--accent);font-weight:500">← ${T('on the map', 'en el mapa')}</div>
      <div class="mono" style="position:absolute;right:18px;top:16px;font-size:18px;color:var(--ink60)">${T('all contracts · area = €', 'todos los contratos · área = €')}</div>
     </div>
     <div style="font-size:26px;line-height:1.4;color:var(--ink80)">
      <div class="mono" style="font-size:64px;font-weight:500;color:var(--ink);line-height:1">${eur(map.located)}${fn(1, 'sm')}</div>
      <div style="margin:6px 0 24px">${T('of', 'de')} <b class="mono" style="color:var(--ink)">${eur(map.total)}</b> ${T('contracted', 'contratados')}, ${map.from}–${map.to}</div>
      ${T(
        `A pin needs a contract whose own title names a place: <b style="color:var(--ink)">${map.nLocated} of ${map.nTotal}</b>. Most public money is town-wide services with nowhere to put a pin.`,
        `Un pin necesita un contrato cuyo propio título nombre un lugar: <b style="color:var(--ink)">${map.nLocated} de ${map.nTotal}</b>. Casi todo el dinero público son servicios para todo el municipio, sin dónde poner un pin.`,
      )}
     </div></div>`,
    answer: T(
      'prints on the map itself how much it cannot show. An honest miss beats a wrong pin.',
      'imprime en el propio mapa cuánto no puede mostrar. Un fallo honesto vale más que un pin equivocado.',
    ),
    src: `${fn(1)}${T(`PLACSP public-procurement contracts, ${map.from}–${map.to}, matched to OpenStreetMap places.`, `Contratos de la Plataforma de Contratación del Sector Público, ${map.from}–${map.to}, cruzados con lugares de OpenStreetMap.`)}`,
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
    h1: T('A missing year is <em>not</em> a zero.', 'Un año que falta <em>no</em> es un cero.'),
    dek: T(
      `Every year the ministry publishes what each town declared its services cost. For ${missing}, Riba-roja’s return isn’t there. That gap is a fact about the council — not a blank in our chart.`,
      `Cada año el ministerio publica lo que cada municipio declara que le cuestan sus servicios. La rendición de Riba-roja de ${missing} no está. Ese hueco es un hecho sobre el ayuntamiento, no un vacío en nuestro gráfico.`,
    ),
    viz: `<div style="display:grid;grid-template-columns:repeat(${years.length},1fr);gap:10px;margin-top:30px">${cells}</div>
     <div style="display:flex;gap:40px;margin-top:26px;font-size:22px;color:var(--ink80)">
      <span><span style="display:inline-block;width:18px;height:18px;background:var(--civic);margin-right:10px;vertical-align:-2px"></span>${T('return filed', 'rendición presentada')}${fn(1, 'sm')}</span>
      <span><span style="display:inline-block;width:18px;height:18px;border:3px solid var(--accent);margin-right:10px;vertical-align:-3px"></span>${T('no return filed', 'sin rendición')}</span>
     </div>`,
    answer: T(
      'draws “zero”, “not declared” and “never filed” as three different things — because they are.',
      'dibuja «cero», «no declarado» y «nunca presentado» como tres cosas distintas — porque lo son.',
    ),
    src: `${fn(1)}Ministerio de Hacienda, coste efectivo de los servicios (Orden HAP/2075/2014), ${T('returns', 'rendiciones')} ${years[0]}–${years.at(-1)}.`,
  })
}

// 09 · IDEA — we don't score
{
  const specs = dea.especificaciones
  const box = (s) => {
    const ok = s.estado === 'publicada'
    const gl = s.gradosLibertad
    return `<div style="background:var(--paper);border:1px solid ${ok ? 'var(--hair)' : 'var(--accent)'};padding:24px 26px;${ok ? '' : 'background-image:repeating-linear-gradient(135deg,transparent 0 12px,rgba(176,41,31,.06) 12px 14px)'}">
     <div class="mono" style="font-size:17px;letter-spacing:.1em;color:${ok ? 'var(--civic)' : 'var(--accent)'};font-weight:500">${ok ? T('PUBLISHED', 'PUBLICADA') : T('FAILED · PUBLISHED AS FAILED', 'FALLIDA · PUBLICADA COMO FALLIDA')}</div>
     <div style="font-size:26px;font-weight:600;margin:10px 0 8px;line-height:1.2">${s.titulo}</div>
     <div class="mono" style="font-size:18px;color:var(--ink60)">${T(`${gl.n} comparable towns · needs ${gl.minimo}`, `${gl.n} comparables · mínimo ${gl.minimo}`)}</div></div>`
  }
  cards.push({
    n: 9,
    track: TRACK.idea,
    h1: T(
      'We built an efficiency model. We publish the method — <em>not a ranking.</em>',
      'Construimos un modelo de eficiencia. Publicamos el método — <em>no un ranking.</em>',
    ),
    dek: T(
      'Equally defensible choices of which services to compare move the score across half the scale. A league table would describe our choices, not the town.',
      'Elecciones igual de defendibles sobre qué servicios comparar mueven la puntuación por media escala. Una clasificación describiría nuestras decisiones, no el municipio.',
    ),
    viz: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:26px">${specs.map(box).join('')}</div>`,
    answer: T(
      'ships the method, failed specifications included. No other town is named, and the model never produces a finding.',
      'publica el método, especificaciones fallidas incluidas. No nombra a ningún otro municipio y el modelo nunca genera un hallazgo.',
    ),
    src: `${fn(1)}${T(
      `DEA experiment at civicpulse.es/laboratorio/frontera — ${dea.stats.especificaciones} specifications, ${dea.stats.publicadas} published, ${dea.stats.insuficientes} failed; MinHac returns for ${dea.stats.entrega}.`,
      `Experimento DEA en civicpulse.es/laboratorio/frontera — ${dea.stats.especificaciones} especificaciones, ${dea.stats.publicadas} publicadas, ${dea.stats.insuficientes} fallidas; rendiciones del MinHac de ${dea.stats.entrega}.`,
    )}`,
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
    h1: T(
      'Machines may retract. Only a human <em>may publish.</em>',
      'La máquina puede retirar. Solo una persona <em>publica.</em>',
    ),
    viz: `<div style="display:grid;grid-template-columns:1fr 200px;gap:26px;align-items:stretch;margin-top:10px">
     <div>
      ${step('01', T('Machine suggestion', 'Sugerencia de la máquina'), 'requiresHumanApproval: true', 'var(--ink60)')}${arrow}
      ${step('02', T('Citation check', 'Comprobación de citas'), T('source exists · quote verbatim · URL alive', 'la fuente existe · cita literal · URL viva'), 'var(--civic)')}${arrow}
      ${step('03', T('Human curator signs', 'Firma un curador humano'), T('bloc-level unless a person is verified', 'por grupo político salvo persona verificada'), 'var(--civic)')}${arrow}
      ${step('04', T('Published — with right of reply', 'Publicado — con derecho de réplica'), T('every correction is a public git commit', 'cada corrección es un commit público'), 'var(--ink)')}
     </div>
     <div style="position:relative;border-left:4px solid var(--accent);padding-left:20px;display:flex;align-items:center">
      <div style="font-size:24px;line-height:1.35;color:var(--accent);font-weight:600">${T('↑ An automated verdict can only go <u>down</u>: retract, never promote.', '↑ Un veredicto automático solo puede <u>bajar</u>: retirar, nunca ascender.')}</div>
     </div></div>`,
    answer: T(
      'keeps machine output in a separate file, labelled “pending review”, that can never overwrite a published status.',
      'guarda lo que produce la máquina en un archivo aparte, marcado «pendiente de revisión», que nunca puede sobrescribir un estado publicado.',
    ),
    src: `${fn(1)}${T('Editorial contract published at civicpulse.es/metodologia and /aviso-legal. Schema validators enforce each gate.', 'Contrato editorial publicado en civicpulse.es/metodologia y /aviso-legal. Validadores de esquema imponen cada paso.')}`,
  })
}

// 11 · BUILD — green is not right
cards.push({
  n: 11,
  track: TRACK.build,
  h1: T(
    'Our tests were green. They were <em>measuring nothing.</em>',
    'Nuestros tests estaban en verde. <em>No medían nada.</em>',
  ),
  viz: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">
    <div style="background:var(--paper);border:1px solid var(--hair);padding:30px">
     <div class="mono" style="font-size:18px;color:var(--ink60)">${T('accessibility · colour contrast', 'accesibilidad · contraste de color')}</div>
     <div class="mono" style="font-size:58px;color:var(--ok, #15803D);font-weight:500;margin:14px 0">✓ 0</div>
     <div style="font-size:24px">${T('violations found', 'infracciones encontradas')}</div>
     <div class="mono" style="font-size:22px;color:var(--accent);margin-top:22px;border-top:1px solid var(--ink20);padding-top:14px;font-weight:500">${T('elements checked: 0', 'elementos comprobados: 0')}</div>
    </div>
    <div style="background:var(--paper);border:1px solid var(--hair);padding:30px">
     <div class="mono" style="font-size:18px;color:var(--ink60)">${T('mobile · 375px layout', 'móvil · diseño a 375px')}</div>
     <div class="mono" style="font-size:58px;color:#15803D;font-weight:500;margin:14px 0">✓ ${T('pass', 'pasa')}</div>
     <div style="font-size:24px">${T('nothing overflows', 'nada se desborda')}</div>
     <div class="mono" style="font-size:22px;color:var(--accent);margin-top:22px;border-top:1px solid var(--ink20);padding-top:14px;font-weight:500">${T('because it was clipped', 'porque estaba recortado')}</div>
    </div></div>`,
  answer: T(
    'every gate must now prove it evaluated something — and no page ships until a human has looked at it in a browser.',
    'cada comprobación debe demostrar ahora que evaluó algo — y ninguna página sale sin que una persona la haya mirado en un navegador.',
  ),
  src: `${fn(1)}${T('From the project’s engineering notes. Open source, AGPL-3.0', 'De las notas de ingeniería del proyecto. Código abierto, AGPL-3.0')} — github.com/datarhan/civicpulse`,
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
    h1: T(
      `May 2027: ${int(DESERTS.of)} town halls face the voters. <em>One</em> is fully mapped.`,
      `Mayo de 2027: ${int(DESERTS.of)} ayuntamientos ante las urnas. <em>Uno</em> ya está radiografiado.`,
    ),
    viz: `<svg viewBox="0 0 936 ${H}" width="936" height="${H}" style="margin-top:28px;overflow:visible">${dots}
      <circle cx="${hx}" cy="${hy}" r="16" fill="#B0291F"/><circle cx="${hx}" cy="${hy}" r="30" fill="none" stroke="#B0291F" stroke-width="2"/>
      <rect x="${hx + 40}" y="${hy - 22}" width="250" height="44" fill="#FAF8F2"/>
      <text x="${hx + 52}" y="${hy + 8}" font-family="DM Mono" font-size="22" font-weight="500" fill="#B0291F">← Riba-roja de Túria</text>
     </svg>`,
    answer: T(
      'Riba-roja is the depth; Spain is the breadth. Open source, no ads, no investors, no money from any government it watches.',
      'Riba-roja es la profundidad; España, la amplitud. Código abierto, sin anuncios, sin inversores, sin dinero de ningún gobierno al que vigila.',
    ),
    src: `${fn(1)}${T(`One dot per Spanish municipality (${int(DESERTS.of)}). Open source, AGPL-3.0. Join, fork, or bring it to your town.`, `Un punto por municipio español (${int(DESERTS.of)}). Código abierto, AGPL-3.0. Súmate, haz un fork o llévalo a tu municipio.`)}`,
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
