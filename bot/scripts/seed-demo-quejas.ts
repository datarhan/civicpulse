#!/usr/bin/env tsx
/**
 * Seed SYNTHETIC, illustrative demo quejas into the bot SQLite DB so the public
 * /quejas feed isn't bare for the launch demo.
 *
 * These are NOT real citizen reports. They are plausible, neighborhood-level
 * INFRASTRUCTURE examples (potholes, streetlights, bins, accessibility) — never
 * accusations against named people — driven through the REAL pipeline:
 * createQueja → routeUsingLocalOfficials (authentic concejalía/concejal
 * attribution) → setState (lifecycle) → addApoyo (community support). So the
 * feed, heatmap, LPACAP clock and per-concejal SLA all populate exactly as they
 * would from genuine captures.
 *
 * Every seed is tagged with a sentinel telegram_user_id in [SEED_UID_LO,
 * SEED_UID_HI], so `--wipe` removes every seed (cascading to apoyos + events)
 * without touching a single real capture. The next real bot export overwrites
 * the snapshot regardless.
 *
 *   cd bot && npx tsx scripts/seed-demo-quejas.ts          # (re)seed — idempotent
 *   cd bot && npx tsx scripts/seed-demo-quejas.ts --wipe   # remove all seeds
 *   cd bot && npm run export                               # → ../public/data/quejas.json
 */
import { openDb } from '../src/db/client.ts'
import { createQueja, setState, addApoyo, type QuejaState } from '../src/db/queries.ts'
import { routeUsingLocalOfficials } from '../src/services/router.ts'
import type { QuejaCategory } from '../../src/scraper/queja-router.ts'

// Sentinel telegram_user_id range that marks a row as a demo seed. Real
// captures use genuine (positive, much smaller) Telegram ids; nothing real
// lands in this band, so deleting it is always safe.
const SEED_UID_LO = 900_000_000
const SEED_UID_HI = 919_999_999
const SEED_AUTHOR_BASE = 900_000_001 // one synthetic author per seed
const SEED_APOYO_BASE = 910_000_000 // synthetic supporters (distinct PK per apoyo)

interface Seed {
  category: QuejaCategory
  title: string
  detail: string
  neighborhood: string
  state: QuejaState
  apoyos: number
  /** Days ago the queja was captured (backdates created_at). */
  daysAgo: number
  /** Days ago it was registered at sede — set for post-registro states. */
  regDaysAgo?: number
}

// 9 mundane, non-defamatory municipal-service reports across 9 categories, 9
// real OSM neighborhoods, and 6 lifecycle states. Apoyos span 3–17 so some
// cross the community-verified threshold (10).
const SEEDS: Seed[] = [
  {
    category: 'via_publica',
    title: 'Bache profundo en la calzada',
    detail:
      'Bache de gran tamaño que lleva semanas sin reparar; ya ha provocado algún susto a vehículos y bicicletas que circulan por la zona.',
    neighborhood: "l'Oliveral",
    state: 'resuelta',
    apoyos: 14,
    daysAgo: 30,
    regDaysAgo: 26,
  },
  {
    category: 'alumbrado',
    title: 'Farola apagada desde hace semanas',
    detail:
      'Un tramo de la calle queda a oscuras por una farola fundida; genera sensación de inseguridad al anochecer, sobre todo para quien vuelve a pie.',
    neighborhood: 'Santa Rosa',
    state: 'en_tramite',
    apoyos: 12,
    daysAgo: 22,
    regDaysAgo: 18,
  },
  {
    category: 'residuos',
    title: 'Contenedor de reciclaje desbordado',
    detail:
      'El contenedor de envases lleva días desbordado y acumula bolsas alrededor. Haría falta una recogida más frecuente en este punto.',
    neighborhood: 'el Molinet',
    state: 'registrada',
    apoyos: 8,
    daysAgo: 13,
    regDaysAgo: 9,
  },
  {
    category: 'zonas_verdes',
    title: 'Juegos infantiles rotos en el parque',
    detail:
      'Varios columpios del parque están rotos y precintados desde hace tiempo. El área infantil necesita mantenimiento para poder usarse con seguridad.',
    neighborhood: 'Vallesa de Mandor',
    state: 'apoyada_verificada',
    apoyos: 17,
    daysAgo: 10,
  },
  {
    category: 'agua_saneamiento',
    title: 'Fuga de agua en la vía pública',
    detail:
      'Salida continua de agua junto al bordillo que encharca la acera de forma permanente; parece una avería en la red de abastecimiento.',
    neighborhood: 'Urbanització Els Pous',
    state: 'en_tramite',
    apoyos: 6,
    daysAgo: 8,
    regDaysAgo: 5,
  },
  {
    category: 'trafico',
    title: 'Paso de peatones sin pintar junto al colegio',
    detail:
      'La señalización horizontal del paso de cebra está casi borrada en una zona con mucho tránsito escolar a la entrada y salida de clase.',
    neighborhood: 'Urbanització Mas de Traver',
    state: 'capturada',
    apoyos: 4,
    daysAgo: 5,
  },
  {
    category: 'limpieza',
    title: 'Solar con maleza y riesgo en verano',
    detail:
      'Solar con vegetación seca y acumulación de residuos. Preocupa el riesgo de incendio en época estival por la proximidad a viviendas.',
    neighborhood: 'Monte Alcedo',
    state: 'silencio_negativo',
    apoyos: 11,
    daysAgo: 38,
    regDaysAgo: 34,
  },
  {
    category: 'mobiliario_urbano',
    title: 'Bancos deteriorados en la plaza',
    detail:
      'Bancos con listones rotos y pintadas en la plaza del barrio; el mobiliario necesita reposición para poder sentarse con normalidad.',
    neighborhood: 'Carasoles',
    state: 'capturada',
    apoyos: 3,
    daysAgo: 4,
  },
  {
    category: 'accesibilidad',
    title: 'Acera intransitable para sillas de ruedas',
    detail:
      'El estrechamiento y el mal estado del pavimento impiden el paso de sillas de ruedas y carritos, obligando a bajar a la calzada.',
    neighborhood: 'Urbanització La Reva',
    state: 'apoyada_verificada',
    apoyos: 13,
    daysAgo: 17,
    regDaysAgo: 12,
  },
]

function wipe(db: ReturnType<typeof openDb>): number {
  // FK ON DELETE CASCADE removes the matching apoyos + events.
  const r = db
    .prepare('DELETE FROM quejas WHERE telegram_user_id BETWEEN ? AND ?')
    .run(SEED_UID_LO, SEED_UID_HI)
  return r.changes
}

function backdate(db: ReturnType<typeof openDb>, id: string, daysAgo: number): void {
  db.prepare(
    `UPDATE quejas SET created_at = datetime('now', ?), updated_at = datetime('now', ?) WHERE id = ?`,
  ).run(`-${daysAgo} days`, `-${daysAgo} days`, id)
}

function setRegisteredAt(db: ReturnType<typeof openDb>, id: string, daysAgo: number): void {
  db.prepare(`UPDATE quejas SET registered_at = datetime('now', ?) WHERE id = ?`).run(
    `-${daysAgo} days`,
    id,
  )
}

function main(): void {
  const db = openDb()
  const wipeOnly = process.argv.includes('--wipe')

  const removed = wipe(db)
  if (wipeOnly) {
    console.log(`[seed-quejas] wiped ${removed} demo seed(s). Run \`npm run export\` to refresh.`)
    return
  }
  if (removed > 0) console.log(`[seed-quejas] cleared ${removed} prior seed(s) before reseeding.`)

  let apoyoUid = SEED_APOYO_BASE
  SEEDS.forEach((s, i) => {
    const routing = routeUsingLocalOfficials({
      title: s.title,
      detail: s.detail,
      category: s.category,
    })
    const queja = createQueja(db, {
      telegram_user_id: SEED_AUTHOR_BASE + i,
      telegram_username: null,
      category: s.category,
      title: s.title,
      detail: s.detail,
      neighborhood: s.neighborhood,
      // Authentic routing — mirrors bot/src/commands/queja.ts.
      concejalia_area: routing.concejalia.area,
      concejal_slug: routing.concejalia.responsible?.slug ?? null,
    })

    // Community support (distinct synthetic supporter per apoyo).
    for (let a = 0; a < s.apoyos; a++) addApoyo(db, queja.id, ++apoyoUid)

    // Advance the lifecycle. Post-registro states carry a registro stub so the
    // LPACAP clock + per-concejal SLA have a registered_at to reckon from.
    const postRegistro: QuejaState[] = [
      'registrada',
      'en_tramite',
      'resuelta',
      'silencio_negativo',
      'escalada_sindic',
    ]
    if (postRegistro.includes(s.state)) {
      setState(db, queja.id, s.state, {
        entry_number: `2026/${String(1000 + i)}`,
        csv: `SEED-${queja.id}`,
      })
      if (s.regDaysAgo != null) setRegisteredAt(db, queja.id, s.regDaysAgo)
    } else if (s.state !== 'capturada') {
      setState(db, queja.id, s.state)
    }

    // Backdate capture so the feed reads as organic ("hace N d").
    backdate(db, queja.id, s.daysAgo)

    const slug = routing.concejalia.responsible?.slug ?? '—'
    console.log(
      `[seed-quejas] ${queja.id} · ${s.category} · ${s.state} · ${s.apoyos} apoyos · ${s.neighborhood} → ${routing.concejalia.area} (${slug})`,
    )
  })

  console.log(
    `[seed-quejas] inserted ${SEEDS.length} demo seed(s). Run \`npm run export\` to write ../public/data/quejas.json.`,
  )
}

main()
