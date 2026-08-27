import { test, expect } from '@playwright/test'
import { appErrors, collectErrors, collectPageErrors } from './_console'
import { readFileSync } from 'node:fs'

test.describe('Hallazgos (/hallazgos)', () => {
  test('renders dashboard with at least one promoted finding', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })

    // Eyebrow + title. §00, principio 2: lo que redacta una máquina se anuncia
    // en la cabecera ANTES del titular, así que la comprobación es sobre eso y
    // no sobre una cadena concreta — el eyebrow decía «Verificación editorial»,
    // que promete revisión humana sobre una página en la que 40 de 41 fichas
    // las firma auto-curation-v1.
    await expect(page.getByText(/Redacci.n autom.tica · \d+ de \d+/i).first()).toBeVisible()
    await expect(page.getByText(/Hallazgos sobre declaraciones en pleno/i).first()).toBeVisible()

    // At least one finding present (promoted in the curate step of this session)
    // — cards display a title; we assert the summary hint renders.
    await expect(page.getByText(/Cómo se escribe un hallazgo/i).first()).toBeVisible({
      timeout: 8000,
    })

    // Filter chips — severity row always present when findings > 0
    await expect(page.getByRole('button', { name: /Informativo/i }).first()).toBeVisible()

    // Permalink anchors should work — the first finding card has a href
    // pointing to the current pathname + "#f-…"
    const firstPermalink = page.locator('a[href^="/hallazgos#f-"]').first()
    await expect(firstPermalink).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('severity filter toggles the visible set', async ({ page }) => {
    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })
    // Click the "Crítico" chip. Either it narrows to 0 (current state has no
    // criticals) — then the "Ninguno coincide con los filtros" state shows.
    const criticalChip = page.getByRole('button', { name: /^Crítico/i }).first()
    await criticalChip.click()
    // Either a "ningún" state or specifically-filtered results.
    await expect(page.getByText(/Ninguno coincide|Crítico/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('rail icon on landing links to /hallazgos', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const link = page.locator('a[href="/hallazgos"]').first()
    await expect(link).toBeVisible({ timeout: 10_000 })
    await link.click()
    await expect(page).toHaveURL(/\/hallazgos$/)
  })

  /**
   * ClaimReview is emitted per ADJUDICATED finding, not per finding.
   *
   * This test used to assert `ldScripts.length > 0`, and it was green for the
   * wrong reason: every card emitted a block whose `reviewRating` came from
   * `severity`, so a councillor's own words shipped to Google's fact-check
   * index carrying CivicPulse's 5/5 «Verificado» because the finding happened
   * to be filed `informational`. The count is now derived from the published
   * snapshot rather than hard-coded, so this measures the gate in the rendered
   * DOM either way: zero today, N the day N refutations are curated.
   */
  test('publishes ClaimReview JSON-LD only for findings that carry a refutation', async ({
    page,
    request,
  }) => {
    const snapshot = await request.get('/data/pleno-findings.json')
    expect(snapshot.ok(), 'pleno-findings.json must be served').toBeTruthy()
    const items: { contradiction?: unknown[] }[] = (await snapshot.json()).items
    expect(items.length, 'no published findings — this test would measure nothing').toBeGreaterThan(
      10,
    )
    const expected = items.filter((f) => (f.contradiction ?? []).length > 0).length

    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Redacci.n autom.tica · \d+ de \d+/i).first()).toBeVisible({
      timeout: 8000,
    })
    // The cards mount after the snapshot lands; wait for one so an empty
    // `ldScripts` cannot be the pre-render state instead of the gate.
    await expect(page.locator('a[href^="/hallazgos#f-"]').first()).toBeVisible({ timeout: 15_000 })

    const ldScripts = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(ldScripts.length).toBe(expected)
    for (const raw of ldScripts) {
      const payload = JSON.parse(raw)
      expect(payload['@context']).toBe('https://schema.org')
      expect(payload['@type']).toBe('ClaimReview')
      expect(payload.author?.name).toBe('CivicPulse')
      // The only rating this site can source: `contradiction[]` is the only
      // adjudication either schema records, and it points one way.
      expect(payload.reviewRating?.ratingValue).toBe(1)
      expect(typeof payload.claimReviewed).toBe('string')
      // Pleno findings always point at the council session, never an outlet.
      expect(payload.itemReviewed?.appearance?.[0]?.url).toContain('/plenos')
    }
  })

  /**
   * A permalink that resolves to no element is worse than no permalink: the
   * href is well-formed, the page loads, and the reader is silently dropped at
   * the top with 52 findings between them and the one they were sent to read.
   *
   * Two independent things have to hold, and both were broken:
   *   · <Card> has to forward `id` (it destructured a fixed prop list),
   *   · something has to scroll AFTER the snapshot lands — the cards mount well
   *     after the browser's native hash scroll has already run and given up.
   *
   * So this asserts the settled position, not the markup. Fixing only the
   * passthrough leaves it red.
   */
  test('a cold-loaded #f-… permalink lands on its finding, not the page top', async ({
    page,
    request,
  }) => {
    // A real published id, read from the snapshot rather than hard-coded — a
    // curated file changes, and a stale literal would make this test measure
    // a missing element instead of a missing anchor.
    const snapshot = await request.get('/data/pleno-findings.json')
    expect(snapshot.ok(), 'pleno-findings.json must be served').toBeTruthy()
    const ids: string[] = (await snapshot.json()).items.map((f: { id: string }) => f.id)
    expect(ids.length, 'no published findings — this test would measure nothing').toBeGreaterThan(3)

    // Deliberately not the first card: the first one is at the top anyway, so
    // it would pass with no scrolling at all.
    const target = ids[ids.length - 1]

    await page.goto(`/hallazgos#${target}`, { waitUntil: 'domcontentloaded' })

    const el = page.locator(`[id="${target}"]`)
    await expect(el, 'the finding card must carry its id in the DOM').toBeAttached({
      timeout: 15_000,
    })

    // The settled scroll position, after fonts and one painted frame.
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    await page.waitForFunction(
      (id) => {
        const node = document.getElementById(id)
        if (!node) return false
        const top = node.getBoundingClientRect().top
        return top >= -4 && top < window.innerHeight
      },
      target,
      { timeout: 10_000 },
    )

    // And prove the page actually moved — a viewport tall enough to show every
    // finding would satisfy the check above without any scrolling.
    const scrolled = await page.evaluate(() => window.scrollY)
    expect(scrolled, 'the page never scrolled — the fragment resolved nowhere').toBeGreaterThan(100)
  })
})

test.describe('Cargo detail (/cargos/:slug)', () => {
  test('renders a councillor detail page from /cargos', async ({ page }) => {
    const errors = collectPageErrors(page)

    // The mayor's slug is stable — officials.json always has role=alcalde
    await page.goto('/cargos/robert-raga-gadea', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(/Todos los departamentos|Cargos/i).first()).toBeVisible()
    await expect(page.getByText('Robert Raga Gadea').first()).toBeVisible({
      timeout: 8000,
    })

    // Stats strip
    await expect(page.getByText(/Concejalías/i).first()).toBeVisible()
    await expect(page.getByText(/Promesas · grupo/i).first()).toBeVisible()

    // Portfolio chips render; alcalde has Alcaldía + Innovación at least
    await expect(page.getByText(/Alcald.a/).first()).toBeVisible()

    // Methodology disclaimer at the bottom
    await expect(page.getByText(/Atribución|nivel de grupo parlamentario/i).first()).toBeVisible({
      timeout: 5000,
    })

    expect(appErrors(errors)).toEqual([])
  })

  test('unknown slug shows not-found state (no crash)', async ({ page }) => {
    await page.goto('/cargos/no-existe-este-concejal', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/no encontrado|Cargos/i).first()).toBeVisible({
      timeout: 8000,
    })
  })
})

/**
 * Las citas reclasificadas por curador (pleno-claim-reclassifications.json) no
 * pueden cargar la marca «acusación no contrastada»: la reclasificación sólo
 * se aleja de la acusación, así que su puerta nunca es `hidden`. Derivado del
 * sidecar — cada entrada futura queda vigilada sin tocar este spec. El caso
 * que lo estrenó: una defensa de la constitucionalidad de la ley estatal de
 * vivienda publicada en /hallazgos como acusación sin contrastar.
 */
test.describe('Citas reclasificadas (/hallazgos)', () => {
  test('ninguna cita reclasificada carga la marca de acusación', async ({ page }) => {
    const { readFileSync } = await import('node:fs')
    const reclas = JSON.parse(
      readFileSync('public/data/pleno-claim-reclassifications.json', 'utf8'),
    ) as { entries: Record<string, { type: string }> }
    const findings = JSON.parse(readFileSync('public/data/pleno-findings.json', 'utf8')) as {
      items: Array<{ id: string; quotes?: Array<{ text: string; sourceClaimId?: string }> }>
    }
    const prov = JSON.parse(readFileSync('public/data/finding-quote-provenance.json', 'utf8')) as {
      quotes: Record<string, Array<{ gate?: string } | null>>
    }

    const ids = new Set(Object.keys(reclas.entries))
    // Mide algo: el sidecar existe porque hay al menos un caso real.
    expect(ids.size).toBeGreaterThan(0)

    const citadas: Array<{ findingId: string; index: number; text: string }> = []
    for (const f of findings.items) {
      ;(f.quotes ?? []).forEach((q, i) => {
        if (q.sourceClaimId && ids.has(q.sourceClaimId)) {
          citadas.push({ findingId: f.id, index: i, text: q.text })
        }
      })
    }
    // Una entrada del sidecar puede no estar citada por ningún hallazgo; si
    // NINGUNA lo está, este spec no comprueba nada y tiene que decirlo.
    expect(citadas.length, 'ninguna cita reclasificada aparece en hallazgos').toBeGreaterThan(0)

    await page.goto('/hallazgos', { waitUntil: 'networkidle' })
    for (const c of citadas) {
      const gate = prov.quotes[c.findingId]?.[c.index]?.gate
      expect(gate, `${c.findingId}[${c.index}] reclasificada con puerta hidden`).not.toBe('hidden')

      // Una reclasificada que algún día quede FUNDADA sale `shown`, y `shown`
      // no lleva marca por diseño (CONTRAST_MARK.shown = null): el paseo por
      // ancestros daría [] o las marcas de una vecina — rojo espurio, no verde
      // hueco. Para ella, la puerta ≠ hidden ya es todo el contrato.
      if (gate === 'shown') continue

      const el = page.getByText(c.text.slice(0, 48), { exact: false }).first()
      await expect(el).toBeVisible()
      // El contenedor inmediato de la cita lleva su propia fila de marcas: el
      // ancestro MÁS CERCANO que contenga alguna marca de contraste es el de
      // esta cita, no el de la ficha (que mezcla las de sus vecinas).
      const marks = await el.evaluate((node) => {
        let n = node
        for (let i = 0; i < 8 && n?.parentElement; i++) {
          n = n.parentElement
          const txt = n.textContent ?? ''
          const found = ['acusación no contrastada', 'sin contraste en los datos'].filter((m) =>
            txt.includes(m),
          )
          if (found.length > 0) return found
        }
        return []
      })
      expect(
        marks,
        `${c.findingId}[${c.index}] sin marca de contraste junto a la cita`,
      ).not.toEqual([])
      expect(marks).not.toContain('acusación no contrastada')
      if (gate === 'toggle') expect(marks).toContain('sin contraste en los datos')
    }
  })
})

/**
 * Una sola política en las dos superficies.
 *
 * `claim-public-gate.ts` se llama «la única fuente de verdad sobre lo que la
 * salida del verificador puede enseñar al público». `/declaraciones` y
 * `/plenos` la obedecen; `/hallazgos` la consultaba para MARCAR y publicaba el
 * literal igual. Cuarenta literales de acusación vivían así: retenidos en un
 * sitio y publicados en otro, en fichas firmadas por `auto-curation-v1`.
 *
 * Esto comprueba lo único que importa: que el texto retenido NO ESTÉ en la
 * página servida. Una marca de estilo o una clase CSS no bastarían — lo que se
 * publica es el texto.
 */
test.describe('Citas retenidas (/hallazgos)', () => {
  const PROV = JSON.parse(readFileSync('public/data/finding-quote-provenance.json', 'utf8')) as {
    quotes: Record<string, Array<{ gate?: string }>>
  }
  const FINDINGS = JSON.parse(readFileSync('public/data/pleno-findings.json', 'utf8')) as {
    items: Array<{ id: string; quotes?: Array<{ text?: string }> }>
  }

  /** Literales que la puerta retiene, según la procedencia derivada. */
  const RETENIDOS = FINDINGS.items.flatMap((f) =>
    (f.quotes ?? [])
      .map((q, i) => ({ id: f.id, i, text: q.text ?? '', gate: PROV.quotes[f.id]?.[i]?.gate }))
      .filter((r) => r.gate === 'hidden' && r.text.length > 40),
  )

  test('el literal retenido no aparece en la página', async ({ page }) => {
    // Que la comprobación evalúe algo: sin filas retenidas esto pasaría vacío.
    expect(RETENIDOS.length).toBeGreaterThan(0)

    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Literal retenido/i).first()).toBeVisible({ timeout: 8000 })

    const texto = await page.locator('body').innerText()
    for (const r of RETENIDOS.slice(0, 25)) {
      expect(texto, `${r.id}#${r.i} sigue publicando su literal`).not.toContain(r.text.slice(0, 60))
    }
  })

  test('el hueco dice qué falta y por qué, sin llamar falsa a la acusación', async ({ page }) => {
    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })
    const hueco = page.getByText(/Literal retenido/i).first()
    await expect(hueco).toBeVisible({ timeout: 8000 })
    const texto = await page.locator('body').innerText()
    expect(texto).toMatch(/no ha podido contrastar|ningún registro municipal/i)
    expect(texto).toMatch(/no decimos que sea falsa|no consta/i)
  })

  test('la ficha sobrevive a la retención: sigue habiendo resumen y atribución', async ({
    page,
  }) => {
    // Lo que se retiene es la CITA, no el hallazgo. Si esto se rompe, el
    // arreglo se habría llevado por delante la ficha entera.
    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Literal retenido/i).first()).toBeVisible({ timeout: 8000 })
    const conRetencion = FINDINGS.items.find((f) => RETENIDOS.some((r) => r.id === f.id))
    expect(conRetencion).toBeDefined()
    await expect(page.getByText(/Lo que se dijo/i).first()).toBeVisible()
  })
})
