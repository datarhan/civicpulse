import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Cargos (/cargos)', () => {
  test('renders the corporación grid with mayor + party breakdown', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })

    // Mayor anchor — officials.json role=alcalde slug is stable.
    await expect(page.getByText('Robert Raga Gadea').first()).toBeVisible({ timeout: 8000 })

    // At least one party label appears (PSOE / PP / VOX / Compromís).
    await expect(page.getByText(/PSOE|PP|VOX|Compromís/).first()).toBeVisible()

    // Concejal cards link to /cargos/<slug>.
    const detailLink = page.locator('a[href^="/cargos/"]').first()
    await expect(detailLink).toBeVisible({ timeout: 8000 })

    expect(appErrors(errors)).toEqual([])
  })

  test('the alcalde card links Biografía to the published journalist report', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    // The alcalde has a published agent report, so his Biografía link must be
    // the INTERNAL report route (the old external transparency-listing URL
    // was useless as a biography). Other councillors keep the cvUrl fallback.
    const bioLink = page.locator('a[href^="/laboratorio/agentes/"]', { hasText: 'Biografía' })
    await expect(bioLink.first()).toBeVisible({ timeout: 8000 })
    await bioLink.first().click()
    await expect(page).toHaveURL(/\/laboratorio\/agentes\/a-robert-raga-bio/)
    await expect(page.getByText('Robert Raga Gadea').first()).toBeVisible({ timeout: 8000 })
  })

  test('a councillor with no delegated área says so, rather than rendering blank', async ({
    page,
  }) => {
    // 10 of 21 hold no portfolio, so no encaje row can exist for them. Without
    // this explicit state /cargos silently becomes "the governing party has
    // credentials, everyone else is blank" — an artifact of who governs, not of
    // who is qualified. The empty case has to be PROVEN reachable: a suite that
    // only asserts the populated path would stay green while the blank returned.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    const card = page
      .locator('div')
      .filter({ hasText: /^PP/ })
      .filter({ hasText: 'Laura Guzman Bruno' })
      .first()
    await expect(card).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Sin delegación de área').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(/no hay área con la que comparar/i).first()).toBeVisible()
  })

  test('the encaje block states its backing once per card, never as a repeated badge', async ({
    page,
  }) => {
    // Against the REAL snapshot, not a stub: the rule under test is about how
    // many times a thing renders, and a one-row stub cannot fail it.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Encaje declarado').first()).toBeVisible({ timeout: 8000 })

    const body = await page.locator('body').innerText()
    const count = (re: RegExp) => (body.match(re) ?? []).length
    const cards = count(/ENCAJE DECLARADO/g)
    const sentences = count(/Lo que aquí se cita procede del CV/g)

    // It renders at all (an assertion that measures nothing is the failure mode
    // this repo keeps hitting), and never more than once per card.
    expect(cards).toBeGreaterThan(0)
    expect(sentences).toBeGreaterThan(0)
    expect(sentences).toBeLessThanOrEqual(cards)
    // And NOT as a mark beside every chip. While all the assessments agree —
    // they all do today — the per-item mark must not appear anywhere at all.
    // Matched as a bare word rather than a whole line: the mark is a flex item
    // and how innerText breaks lines around it is a layout detail, so anchoring
    // to one would make this assertion depend on styling to fail. The one-line
    // sentence above never contains the word.
    expect(body).not.toMatch(/\bautodeclarada\b/)
  })

  test('every encaje card states what it was compared against, harshest included', async ({
    page,
  }) => {
    // Against the REAL snapshot, and about the cards a reader judges hardest.
    // Three published officials — jose-luis-ramos-march, maria-esther-gomez-laredo
    // and alfredo-pla-gimenez — read «sin relación declarada» on both axes and
    // cite nothing at all, so no backing sentence applied and the card rendered
    // two bare negative labels with no provenance whatsoever. Two of them carry a
    // signed warning frame above as well. A card stating nothing about its source
    // reads as a finding no component asserts.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Encaje declarado').first()).toBeVisible({ timeout: 8000 })
    const body = await page.locator('body').innerText()

    // innerText reflects CSS text-transform, so the eyebrow arrives uppercased.
    const blocks = body
      .split('ENCAJE DECLARADO')
      .slice(1)
      .map((s) => {
        const end = s.indexOf('qué exige la ley')
        return end === -1 ? s : s.slice(0, end)
      })
    // The assertion has to bite on something: a gate that measures zero cards is
    // the green-but-vacuous shape DATA_INTEGRITY warns about.
    expect(blocks.length).toBeGreaterThan(0)
    // The uncited case is REACHABLE in the published data, not only in a stub.
    expect(blocks.filter((b) => /Lo que se compara es el CV/.test(b)).length).toBeGreaterThan(0)
    // And no card goes without: every provenance sentence names the CV. If a
    // card with divergent backing ever appears — none exists today — this goes
    // red, and someone decides what the per-item marks say about provenance.
    for (const b of blocks) expect(b).toMatch(/\bCV\b/)
  })

  test('the populated encaje block names the credential and renders no score', async ({ page }) => {
    // Stubbed on purpose: the published rows move with every promotion, so
    // pinning "no percentage anywhere" to them would drift into measuring
    // whatever happens to be there — including, at the limit, an empty block,
    // the green-but-vacuous shape DATA_INTEGRITY warns about. The stub fixes a
    // known POPULATED shape so the assertion always has something to bite on.
    await page.route('**/data/area-fit.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: '2026-08-03T00:00:00.000Z',
          mandate: '2023-2027',
          rows: [
            {
              officialSlug: 'teresa-pozuelo-martin',
              portfolio: 'Urbanismo',
              departmentSlug: 'urbanismo',
              reportId: 'r-teresa-pozuelo-bio-2026-07-30',
              formacion: {
                value: 'relacionada',
                evidence: [
                  {
                    label: 'Arquitecto Técnico — UPV',
                    short: 'Arquitecto Técnico',
                    sourceIds: ['src-060'],
                  },
                ],
              },
              experiencia: { value: 'sin-relacion-declarada', evidence: [] },
              curatedBy: 'e2e',
              curatedAt: '2026-08-03',
            },
          ],
        }),
      }),
    )
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })

    // The block is really there, and «Formación» names the TITLE — not the área,
    // which the card already prints above, and not the university, which is not
    // what «Formación» claims and belongs on the área view with its citation.
    await expect(page.getByText('Encaje declarado').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Arquitecto Técnico').first()).toBeVisible()
    await expect(page.getByText('sin relación declarada').first()).toBeVisible()

    const body = await page.locator('body').innerText()
    // Anchored on the governing grid's own heading. It is NOT uppercased —
    // `.cp-sec-head` sets no text-transform — and an indexOf that misses would
    // return -1 and slice the last character, leaving every assertion below
    // measuring nothing. So the anchor is proven to exist first.
    const i = body.indexOf('Quién dirige qué')
    expect(i, 'la rejilla de gobierno tiene que estar en la página').toBeGreaterThan(0)
    const section = body.slice(i)
    // innerText reflects CSS text-transform, so the eyebrow arrives uppercased.
    expect(section).toMatch(/encaje declarado/i)
    expect(section).not.toContain('UPV')
    // One área, related, so the relation reaches all of them: nothing to qualify.
    expect(section).not.toMatch(/solo en/i)
    // No grade, in any of the shapes it could take.
    expect(section).not.toMatch(/encaje[^\n]{0,40}\d+\s*%/i)
    expect(section).not.toMatch(/\d+\s*\/\s*\d+\s*áreas/i)
    expect(section).not.toMatch(/\d+\s+de\s+\d+\s+áreas/i)
  })

  test('a former member renders in their own section, reachable, with no present-tense block', async ({
    page,
  }) => {
    // The council's own page lagged a resignation by fifteen months, so the
    // roster is scraped ⊕ corrected. The empty case has to be PROVEN reachable,
    // the same argument the «sin delegación de área» spec makes: a suite that
    // only asserts the sitting grid would stay green while the former member
    // quietly came back as a sitting one. Against the REAL snapshot.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Ya no forman parte de la corporación').first()).toBeVisible({
      timeout: 8000,
    })
    const body = await page.locator('body').innerText()
    const i = body.indexOf('YA NO FORMAN PARTE DE LA CORPORACIÓN')
    expect(i).toBeGreaterThan(0)
    const former = body.slice(i)
    // The departure line is there, and none of the sitting-only blocks is.
    expect(former).toMatch(/hasta el \d{1,2} de [a-záéíóúñ]+ de \d{4}/i)
    // Every present-tense marker the sitting cards carry, named as it renders
    // TODAY. The list has to be re-read whenever a block is restyled: this
    // assertion is an absence, and an absence stays green for free once the
    // string it names stops existing anywhere. «€/año» was such a string until
    // the retribución line was rewritten, and it went on passing while
    // measuring nothing.
    expect(former).not.toMatch(
      /ENCAJE DECLARADO|QUEJAS ASIGNADAS|DEPARTAMENTOS|ÁREAS DELEGADAS|fijada en el acuerdo|asistencias por sesión/,
    )
    // And those markers are REACHABLE — they exist above, on the sitting cards.
    // Otherwise the check above is satisfied by a page that renders none of them.
    const sitting = body.slice(0, i)
    expect(sitting).toMatch(/ÁREAS DELEGADAS/)
    expect(sitting).toMatch(/fijada en el acuerdo|asistencias por sesión/)
    // The composition bar still counts 21 seats: a former member is not one.
    expect(body).toMatch(/Total 21 escaños/)
    // The stamp says how many corrections it carries, derived from the data.
    expect(body).toMatch(/\d+ corrección\(es\) documentada\(s\)/)
    // And the person's own record resolves, leading with the departure.
    const link = page.locator('a[href="/cargos/soraya-trejo-delgado"]').first()
    await expect(link).toBeVisible({ timeout: 8000 })
    await link.click()
    await expect(page).toHaveURL(/\/cargos\/soraya-trejo-delgado$/)
    await expect(page.getByText(/Ya no forma parte de la corporación/).first()).toBeVisible({
      timeout: 8000,
    })
  })

  test('a member added by correction shows honest empties, never a substitute address', async ({
    page,
  }) => {
    await page.goto('/cargos/pedro-tortajada-raga', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Pedro Tortajada Raga').first()).toBeVisible({ timeout: 8000 })
    const body = await page.locator('body').innerText()
    expect(body).toMatch(/Toma de posesión ante el Pleno el \d{1,2} de julio de 2025/)
    expect(body).toMatch(/sin correo publicado/)
    expect(body).toMatch(/sin retrato en la fuente/)
    // The shared mailbox must never stand in for a person the source gave none.
    expect(body).not.toContain('alcaldia@ribarroja.es')
  })

  test('the fourteen without dedicación are paid, and shown as a distribution', async ({
    page,
  }) => {
    // The finding that reorders this page: RetribucionBadge returned null for
    // anyone outside the acuerdo, so fourteen of twenty-one cards carried no
    // figure — while ISPA gave every one of them between 4.582,49 € and
    // 16.858,04 €. The page had the data and the layout hid it.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('sin dedicación', { exact: false }).first()).toBeVisible({
      timeout: 8000,
    })
    const body = await page.locator('body').innerText()
    // The distribution renders with both ends named, so the reader can see the
    // spread rather than a single averaged figure.
    expect(body).toMatch(/\d+ concejales, de menor a mayor/)
    expect(body).toMatch(/Asistencias por sesión/)
    // And it says why it is a distribution rather than a column of names.
    expect(body).toMatch(/filas de concejal del ISPA son anónimas/)
  })

  test('no opposition card carries a euro figure, because ISPA rows have no name', async ({
    page,
  }) => {
    // The rule the distribution exists to keep. An amount from an anonymous
    // ISPA row placed under a named face is a claim the source cannot support,
    // and it would be the `Otro` sentinel again: naming by elimination.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Quién fiscaliza').first()).toBeVisible({ timeout: 8000 })
    const body = await page.locator('body').innerText()
    const i = body.indexOf('Quién fiscaliza')
    expect(i, 'la rejilla de oposición tiene que estar en la página').toBeGreaterThan(0)
    // Up to the plantilla band, which is a different subject with its own figures.
    const j = body.indexOf('Plantilla municipal')
    const oposicion = body.slice(i, j > i ? j : undefined)
    // It really contains the cards (an empty slice would pass the next line).
    expect(oposicion).toMatch(/asistencias por sesión/i)
    expect(oposicion).not.toMatch(/\d[\d.]*,\d{2}\s*€/)
  })

  test('the two figures for the alcalde are reconciled, not left to contradict', async ({
    page,
  }) => {
    // 48.234,08 € (fixed by the acuerdo) and 48.647,50 € (received, per ISPA)
    // sat 300px apart with nothing saying they measure different things, so the
    // only available reading was that one of them was wrong.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Por qué el alcalde tiene dos cifras').first()).toBeVisible({
      timeout: 8000,
    })
    const body = await page.locator('body').innerText()
    const i = body.indexOf('Por qué el alcalde tiene dos cifras')
    const nota = body.slice(i, i + 700)
    // Both figures are inside the SAME block as the sentence reconciling them.
    expect(nota).toMatch(/48\.234,08/)
    expect(nota).toMatch(/48\.647,50/)
    expect(nota).toMatch(/asignación/)
    expect(nota).toMatch(/nómina/)
  })

  test('the missing 2023 is drawn as the full width of the hole it leaves', async ({ page }) => {
    // Measured, not asserted about text. The band that marks the missing 2020
    // entrega on /eficiencia shipped covering exactly half the hole it marks —
    // 90px floating inside a 181px gap, blank on both sides — with the whole
    // unit suite, the axe pass and the mobile spec green, because every one of
    // them asserts about data and text. A getBoundingClientRect on both edges
    // is the only thing that sees it.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    const banda = page.locator('[data-hueco="2023-2023"]')
    await expect(banda).toBeVisible({ timeout: 8000 })
    const antes = page.locator('[data-barra="2022"]')
    const despues = page.locator('[data-barra="2024"]')
    await expect(antes).toBeVisible()
    await expect(despues).toBeVisible()

    const [b, a, d] = await Promise.all([
      banda.boundingBox(),
      antes.boundingBox(),
      despues.boundingBox(),
    ])
    expect(b && a && d).toBeTruthy()
    const hueco = { izq: a!.x + a!.width, der: d!.x }
    // The hole is real (the bars are not touching).
    expect(hueco.der - hueco.izq).toBeGreaterThan(20)
    // And the band fills it edge to edge, within a pixel of rounding.
    expect(Math.abs(b!.x - hueco.izq)).toBeLessThanOrEqual(1.5)
    expect(Math.abs(b!.x + b!.width - hueco.der)).toBeLessThanOrEqual(1.5)

    // The year is named under the gap, so the hole is legible without hovering.
    await expect(page.locator('[data-rotulo="hueco-2023"]')).toContainText('2023')
    await expect(page.locator('[data-rotulo="hueco-2023"]')).toContainText('sin dato')
  })

  test('a shared mailbox says it is shared, rather than posing as a direct line', async ({
    page,
  }) => {
    // Three of twenty-one have their own address. Eleven share the alcaldía's
    // counter and six the PP group's Gmail, which is not even a municipal
    // domain. Under a face, a shared counter reads as that person's direct line.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('alcaldia@ribarroja.es').first()).toBeVisible({ timeout: 8000 })
    const body = await page.locator('body').innerText()
    expect(body).toMatch(/buzón compartido por \d+ cargos/)
  })

  test('the biographical index is linked once, not promised on every card', async ({ page }) => {
    // Twenty of the twenty-one cvUrl values in the snapshot are the same
    // transparency listing. A per-card «Biografía →» promised that person's
    // biography and delivered an index, twenty times over.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Quién dirige qué').first()).toBeVisible({ timeout: 8000 })
    const listado =
      'https://www.ribarroja.es/es/portal_de_transparencia/informacion_sobre_la_corporacion_municipal/datos_biograficos_del_alcalde_sa_y_concejales/contenidos/864708/0835919'
    await expect(page.locator(`a[href="${listado}"]`)).toHaveCount(1)
    // The INTERNAL per-person report is a different link and stays per card.
    // Awaited, not counted on the spot: the bio routes arrive from a separate
    // fetch, so a bare count races it and passes only on the retry.
    await expect(page.locator('a[href^="/laboratorio/agentes/"]').first()).toBeVisible({
      timeout: 8000,
    })
  })

  test('clicking a councillor link navigates into the detail view', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    const link = page.locator('a[href^="/cargos/"]').first()
    await expect(link).toBeVisible({ timeout: 8000 })
    const href = await link.getAttribute('href')
    expect(href).toMatch(/^\/cargos\/[a-z0-9-]+$/)
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${href!.replace(/\//g, '\\/')}$`))
    await expect(page.getByText(/nivel de grupo parlamentario|Atribución/i).first()).toBeVisible({
      timeout: 8000,
    })
  })
})
