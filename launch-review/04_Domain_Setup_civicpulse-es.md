# Connecting `civicpulse.es` to Vercel

Since `.es` usually can't be bought through Vercel's own registrar, the flow is:
**register at an external registrar → add the domain in Vercel → paste Vercel's DNS records at the registrar.** Vercel then issues the SSL certificate automatically.

> **Source of truth:** the exact record *values* are shown in your Vercel dashboard after you add the domain. The values below are Vercel's long-standing defaults — if the dashboard shows something different, use the dashboard's values.

---

## Step 1 — Buy the domain
Register `civicpulse.es` at any registrar that sells `.es` (Porkbun, Namecheap, or Spanish ones like DonDominio / Dinahosting). You'll manage its DNS there.

## Step 2 — Add the domain in Vercel
1. Vercel → your **CivicPulse** project → **Settings → Domains**.
2. Enter `civicpulse.es` → **Add**.
3. Add `www.civicpulse.es` too → **Add**. Pick which is primary; the recommended setup is **apex primary, www → redirect to apex** (or vice-versa — either is fine, just be consistent).
4. Vercel will show a "Invalid Configuration / add these records" panel with the exact records to create. Keep this tab open.

## Step 3 — Add the DNS records at your registrar
In the registrar's DNS panel for `civicpulse.es`, create:

| Type | Name / Host | Value | Notes |
|---|---|---|---|
| `A` | `@` (apex / root) | `76.76.21.21` | Vercel's anycast IP for apex domains |
| `CNAME` | `www` | `cname.vercel-dns.com` | For the `www` subdomain |

- `@` means the root (`civicpulse.es`). Some panels want it blank or literally `civicpulse.es`.
- Leave TTL at the default (e.g. 3600), or set 300–600 for faster first propagation.
- **Don't** create both an A and a CNAME on the same `@` name — apex uses the A record.

## Step 4 — Verify & wait
- Back in Vercel, the domain flips to **Valid Configuration** once DNS propagates (usually minutes, up to a few hours for `.es`).
- Vercel auto-provisions the **HTTPS certificate** — no action needed.
- Confirm `https://civicpulse.es` and `https://www.civicpulse.es` both load the site and one redirects to the other.

## Step 5 — Point the site's canonical URL at the new domain
After the domain is live, replace `https://civicpulse-virid.vercel.app` with `https://civicpulse.es` in these **source** files (a repo-wide grep found them; ignore anything under `dist/` and `.claude/`, which regenerate):

- `index.html` — `og:url`, `og:image`, `twitter:image` meta tags (social share cards).
- `src/components/ClaimReviewJsonLd.jsx` — the base-URL constant used for the ClaimReview structured-data permalinks (SEO / Google fact-check indexing). **Most important for SEO.**
- `src/pages/AvisoLegal.jsx` — the legal text names the hosting domain ("Se aloja en Vercel bajo el dominio …").
- `src/pages/Quejas.jsx` and `src/pages/Cambios.jsx` — WhatsApp/share link builders.
- `public/data/promises.json` — a couple of evidence links point at `…vercel.app/data/*.json` (low priority; cosmetic).

Then, in Vercel: set `civicpulse.es` as the **Production Domain** (Settings → Domains) so the old `.vercel.app` URL 308-redirects to it. Update the README link/badge too.

> A single find-and-replace across the source files above does the job. Do this **after** the domain resolves, so nothing points at a domain that isn't live yet.

---

## Alternative: delegate nameservers to Vercel (optional)
Instead of individual records, you can set the domain's **nameservers** (at the registrar) to Vercel's (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`) and let Vercel manage all DNS. Simpler long-term, but it moves *all* DNS control to Vercel — only do this if you don't need custom MX/other records at the registrar. For a single web project, the A + CNAME approach in Step 3 is enough.

## Quick troubleshooting
- **"Invalid Configuration" persists:** the A/CNAME value is wrong or there's a leftover conflicting record (old A, AAAA, or a parking CNAME). Remove conflicts.
- **Root won't work but www does:** the apex `A` record is missing or the registrar doesn't allow apex A — use their "ALIAS/ANAME" record type pointing to `cname.vercel-dns.com` instead.
- **SSL stuck:** give it up to ~24h; if still stuck, remove and re-add the domain in Vercel.
