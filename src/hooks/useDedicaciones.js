import { useJsonFetch } from './useJsonFetch'

// 404-fallback (module-level constant → stable ref). Exported so the state
// helper below and its test recognise it by identity rather than by a copied
// shape: an empty snapshot is "no sabemos", never "sin dedicación".
export const EMPTY_DEDIC = {
  generatedAt: null,
  mandate: null,
  source: null,
  brackets: [],
  sinDedicacionCount: null,
  byOfficial: [],
}

/**
 * Curated + cited per-councillor dedicaciones (public/data/dedicaciones.json):
 * the salary each cargo with dedicación exclusiva draws, from the pleno
 * acuerdo that fixes it per PUESTO. Which councillor holds each puesto is a
 * curator's attribution, not something the acuerdo states — the note in the
 * file has to say what it rests on. Legally material — see
 * src/scraper/dedicaciones.ts for the validation contract.
 */
export function useDedicaciones() {
  return useJsonFetch('/data/dedicaciones.json', EMPTY_DEDIC)
}

/**
 * The per-official dedicación figure for a slug, or null. Null means «no row
 * for this slug» — which reads as «sin dedicación» ONLY once
 * `dedicacionesLeidas(data)` is true. Use `estadoRetribucion` to render.
 */
export function dedicacionForSlug(data, slug) {
  return (data?.byOfficial || []).find((o) => o.slug === slug) || null
}

/**
 * Whether `data` is a snapshot that was actually read: not the 404 fallback,
 * not a loading `null`, and carrying a source and at least one row. Only a
 * read snapshot can say that a slug ABSENT from it has no dedicación.
 */
export function dedicacionesLeidas(data) {
  return Boolean(
    data &&
    data !== EMPTY_DEDIC &&
    data.source &&
    Array.isArray(data.byOfficial) &&
    data.byOfficial.length > 0,
  )
}

/**
 * What the page may say about one councillor's pay, given the hook result.
 *
 *   - `cargando`        — the snapshot has not arrived yet;
 *   - `no-disponible`   — fetch error, 404 fallback or an empty snapshot: we
 *                         do not know, so the page must not say «sin dedicación»;
 *   - `fijada`          — a row for this slug (returned as `d`);
 *   - `sin-dedicacion`  — the snapshot was read and has no row for this slug.
 *
 * The bug this replaces: the /cargos badge took «no row» as «sin dedicación»,
 * so while the file loaded — or when it failed — every salaried councillor
 * was shown as paid by session only.
 *
 * @param {{loading?: boolean, error?: unknown, data?: any}} res
 * @param {string} slug
 * @returns {{estado: 'cargando'|'no-disponible'|'sin-dedicacion'} | {estado: 'fijada', d: any}}
 */
export function estadoRetribucion(res, slug) {
  const { loading, error, data } = res || {}
  if (error) return { estado: 'no-disponible' }
  if (!data) return loading === false ? { estado: 'no-disponible' } : { estado: 'cargando' }
  if (!dedicacionesLeidas(data)) return { estado: 'no-disponible' }
  const d = dedicacionForSlug(data, slug)
  return d ? { estado: 'fijada', d } : { estado: 'sin-dedicacion' }
}

/**
 * The acuerdo's salary bands — what the pleno FIXED, by cargo.
 *
 * A different series from ISPA's, and the distinction is the whole point: the
 * acuerdo sets an annual figure per cargo, the payroll pays what it pays. The
 * alcalde's two numbers (the figure the acuerdo fixed and the one ISPA reports
 * as received in 2024) sat three hundred pixels apart on this page with
 * nothing saying they measure different things, so a reader could only read
 * them as a contradiction.
 *
 * Roles come through as `role` is written in dedicaciones.json. They are MEANT
 * to be the acuerdo's own wording for each puesto — they name the cargo, not
 * the person, and a shortened one drops áreas the acuerdo names.
 * tests/dedicaciones.test.ts checks each against the 2023 acuerdo's text.
 *
 * @returns {{tramos: Array<{amountEuros: number, count: number, roles: string[]}>, sum: number, count: number}|null}
 */
export function fijadoTramos(data) {
  const rows = data?.byOfficial || []
  if (rows.length === 0) return null
  const porImporte = new Map()
  for (const r of rows) {
    const key = r.amountEuros
    if (!porImporte.has(key)) porImporte.set(key, { amountEuros: key, count: 0, roles: [] })
    const t = porImporte.get(key)
    t.count += 1
    if (r.role) t.roles.push(r.role)
  }
  const tramos = [...porImporte.values()].sort((a, b) => b.amountEuros - a.amountEuros)
  return {
    tramos,
    sum: rows.reduce((a, r) => a + (r.amountEuros || 0), 0),
    count: rows.length,
  }
}
