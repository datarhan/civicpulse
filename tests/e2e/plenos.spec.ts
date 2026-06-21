import { test, expect } from '@playwright/test'
import { agendaHasDepartments } from './_agenda'

const HAS_DEPTS = agendaHasDepartments()

test.describe('Plenos (/plenos)', () => {
  test('renders pleno list + agenda + claim ledger sections', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/plenos', { waitUntil: 'domcontentloaded' })

    // Always-present sections (driven by plenos.json + pleno-claims, which load
    // independently of the agenda scraper). Anchored in src/pages/Plenos.jsx.
    await expect(page.getByText('Plenos recientes').first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText('Declaraciones hechas en el pleno · contraste con los datos').first(),
    ).toBeVisible()

    // The department analysis (TopDepartmentsCard) only renders when the agenda
    // snapshot has departments; the page honestly hides it otherwise.
    if (HAS_DEPTS) {
      await expect(
        page.getByText('Departamentos con más presencia en el pleno').first(),
      ).toBeVisible()
      await expect(page.locator('a[href^="/departamentos/"]').first()).toBeVisible()
    }

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('claim ledger is editorially gated + signal-first', async ({ page }) => {
    // Capture every per-pleno chunk the SPA fetches (not the manifest).
    const chunkBodies: Array<{ items?: unknown[] }> = []
    page.on('response', async (res) => {
      const url = res.url()
      if (/\/data\/pleno-claims\/[^/]+\.json$/.test(url) && !url.endsWith('index.json')) {
        try {
          chunkBodies.push(await res.json())
        } catch {
          /* non-JSON / aborted — ignore */
        }
      }
    })

    await page.goto('/plenos', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    // The deployed chunks must never contain a hidden item — an opinativa
    // accusation, or any acusacion_publica left sin-datos. This is the
    // build-time gate's core guarantee and holds on any static server
    // (vite preview does not apply .vercelignore, so we assert the chunks
    // themselves, which are gated at build time, not the monolith's absence).
    const shipped = chunkBodies.flatMap((c) => (c.items ?? []) as Array<Record<string, any>>)
    expect(shipped.length).toBeGreaterThan(0)
    const hidden = shipped.filter(
      (it) =>
        it.claim?.type === 'acusacion_publica' &&
        ((it.claim?.accusationSubtype ?? 'opinativa') === 'opinativa' ||
          it.verification?.verdict === 'sin-datos'),
    )
    expect(hidden).toEqual([])

    // Every shipped item carries the visibility stamp from the build-time gate.
    expect(shipped.every((it) => typeof it.visibility === 'string')).toBe(true)

    // The signal-first controls render: a search box + the most-newsworthy
    // "Contradicho" verdict chip (data has contradicho claims at this snapshot).
    await expect(page.getByPlaceholder(/Buscar en las declaraciones/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Contradicho/ }).first()).toBeVisible()
  })

  test('"Ver" expander reveals agenda items inline', async ({ page }) => {
    // The agenda expander needs per-pleno agenda items; skip when the agenda
    // snapshot is empty (upstream scraper not populated — not a frontend bug).
    test.skip(!HAS_DEPTS, 'plenos-agendas.json has no departments in this snapshot')
    await page.goto('/plenos', { waitUntil: 'domcontentloaded' })
    // Button label is the literal "Ver" / "Ocultar" toggle (src/pages/Plenos.jsx:109).
    const expander = page.getByRole('button', { name: /^Ver$/ }).first()
    await expect(expander).toBeVisible({ timeout: 8000 })
    await expander.click()
    // Once expanded, agenda rows render section pills (every item carries a
    // section). Robust to the sparse department inference of the regmeet feed.
    await expect(page.getByText(/Resolutiva|Informativa|Ruegos y preguntas/).first()).toBeVisible({
      timeout: 5000,
    })
  })
})
