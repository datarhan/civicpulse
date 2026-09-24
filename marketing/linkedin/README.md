# LinkedIn kit

- `POSTS.md` / `POSTS.es.md` — the 12-post series in English and Spanish:
  copy, schedule, house rules.
- `images/post-NN.png` (English) and `images/es/post-NN.png` (Spanish) — one 1080×1350 card per post (rendered at 2×).
  `post-00.png` is the style sheet.
- `brand.css` — the card system. `render.mjs` — the cards themselves.
- `fonts/` — Fraunces, Outfit and DM Mono (SIL OFL 1.1), vendored so a render
  never falls back to system fonts.

## The graphic system

The site's own identity, carried over from the landing
(`src/variants/direction-d/tokens.jsx`):

| Token    | Hex       | Use                                                  |
| -------- | --------- | ---------------------------------------------------- |
| Paper    | `#FAF8F2` | background — the warm broadsheet page                |
| Ink      | `#0B0F19` | headlines, rules, the main data mark                 |
| Petróleo | `#0E5B62` | brand, eyebrows, footnote markers, the answer strip  |
| Accent   | `#B0291F` | the ONE thing to look at on a card. Never decoration |

Type: **Fraunces 700** for headlines (one phrase in italic accent), **Outfit**
for body, **DM Mono** for every figure, source and label.

Anatomy of every card, top to bottom: masthead with the broadsheet double rule
and series number · track eyebrow (Idea / Civic problem / How local government
works / Method / Build) · headline · optional dek · the visual · the
**CivicPulse → answer strip** (how the project responds to the problem the card
names) · footer with the numbered source and `civicpulse.es`.

The signature is the petróleo footnote marker: every figure on a card carries
one, and it points at the source in the footer — the site's «a citation for
every figure» made visible. Two more rules from the site apply here: absence is
drawn (hatched, outlined) rather than hidden, and no card ever names a person.

## Re-rendering

Figures are read from `public/data/` at render time, so after the nightly moves
a number, re-render both languages and update the matching sentence in `POSTS.md` and
`POSTS.es.md`. Both series come from one script — every card holds its copy as
`T(english, spanish)` — so the two languages can never disagree on a figure:

```bash
npm i --no-save playwright-core   # or point PLAYWRIGHT_CORE at an existing install
node marketing/linkedin/render.mjs      # all cards
node marketing/linkedin/render.mjs 5    # just Nº 05
node marketing/linkedin/render.mjs --lang es     # the Spanish series → images/es/
node marketing/linkedin/render.mjs --lang es 5
```

The script warns if a card's content spills into its footer.
