/**
 * ¿Ve el lector que una acusación no está contrastada, dentro de la cita, y
 * **sólo** donde toca?
 *
 * 75 de los 177 literales de /hallazgos sostienen acusaciones públicas que la
 * puerta editorial retiene en /plenos, y otros 86 son afirmaciones que el
 * verificador no pudo contrastar. Un aviso tan generoso que lo lleve todo no
 * distingue nada, así que cada afirmación de marca va emparejada con su control
 * positivo: la MISMA ficha tiene que llevar una cita marcada y otra limpia.
 *
 * Y 86 de las 177 llevan además la marca de transcripción, así que hay que
 * comprobar que las dos caben juntas en el mismo `<blockquote>` sin taparse.
 *
 * Se renderiza el componente de verdad —`FindingCard` y `FindingDetailCard`,
 * los que usan /hallazgos y /plenos/:id— con `fetch` sustituido por el disco.
 * Un test que sólo montara el chip pasaría aunque nadie lo hubiera enchufado.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  FindingCard,
  QuoteProvenanceMark,
  QuoteProvenanceNote,
  quoteMarks,
} from '../../src/components/PlenoFindings'
import { FindingDetailCard } from '../../src/pages/Hallazgos'
import Metodologia from '../../src/pages/Metodologia'
import { invalidateSnapshots, peekSnapshot } from '../../src/lib/snapshot-store'
import { CLAIM_VISIBILITIES } from '../../src/scraper/claim-public-gate'
import { MARKED_CONTRAST_IDS } from '../../src/scraper/quote-contrast'

const ROOT = join(__dirname, '..', '..')
const FINDINGS = JSON.parse(readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'))
const PROVENANCE = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
)

/**
 * La redacción se LEE del componente, no se recita aquí. Recitarla es cómo seis
 * suites de este repo se quedaron verdes midiendo nada
 * (docs/DATA_INTEGRITY.md regla 1); leerla deja que la prueba siga midiendo
 * «¿sale el chip?» cuando alguien reescriba la frase.
 */
const chipFor = (gate) => quoteMarks({ gate })[0]?.chip
const CONTRAST_CHIP = Object.fromEntries(MARKED_CONTRAST_IDS.map((id) => [id, chipFor(id)]))
const TRANSCRIPT_CHIP = {
  'solo-en-sustituida': quoteMarks({ status: 'solo-en-sustituida' })[0]?.chip,
  'sin-determinar': quoteMarks({ status: 'sin-determinar' })[0]?.chip,
}

const realFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = async (url) => {
    const path = String(url)
    if (path.endsWith('/data/finding-quote-provenance.json')) {
      return new Response(JSON.stringify(PROVENANCE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }
  invalidateSnapshots()
})

afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

const rowsOf = (f, n) => (PROVENANCE.quotes[f.id] ?? []).slice(0, n)
const isDoubleMarked = (r) => r.status !== 'en-vigente' && r.gate !== 'shown'
const isClean = (r) => r.status === 'en-vigente' && r.gate === 'shown'

/** La ficha de manual: una cita con las DOS marcas y otra sin ninguna. */
const mixed = FINDINGS.items.find((f) => {
  const rows = rowsOf(f, 3)
  return rows.some(isDoubleMarked) && rows.some(isClean)
})

/** Una ficha que mezcla los dos veredictos de la puerta en sus tres primeras. */
const bothGates = FINDINGS.items.find((f) => {
  const gates = new Set(rowsOf(f, 3).map((r) => r.gate))
  return gates.has('hidden') && gates.has('toggle')
})

/** Una ficha con al menos una acusación retenida. */
const withHidden = FINDINGS.items.find((f) => rowsOf(f, 3).some((r) => r.gate === 'hidden'))

const blockquotes = (container) => [...container.querySelectorAll('blockquote')]

async function renderCard(finding) {
  const utils = render(<FindingCard f={finding} />)
  await waitFor(() => {
    expect(utils.container.textContent).toContain(finding.quotes[0].text.slice(0, 40))
  })
  await waitFor(() => {
    expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
  })
  return utils
}

describe('los datos reales traen los dos lados del control', () => {
  it('hay una ficha con una cita doblemente marcada y otra limpia', () => {
    // Sin esto, «sale la marca» y «no sale la marca» podrían estar midiendo
    // fichas vacías.
    expect(mixed).toBeTruthy()
    expect(bothGates).toBeTruthy()
    expect(withHidden).toBeTruthy()
  })

  it('la redacción existe para los dos veredictos que marcan, y difiere', () => {
    for (const id of MARKED_CONTRAST_IDS) expect(CONTRAST_CHIP[id].length).toBeGreaterThan(10)
    expect(new Set(Object.values(CONTRAST_CHIP)).size).toBe(MARKED_CONTRAST_IDS.length)
  })
})

describe('«retenida» y «sin contraste» se distinguen en pantalla', () => {
  it('cada veredicto de la puerta pinta un chip distinto, y `shown` ninguno', () => {
    const seen = new Set()
    for (const gate of CLAIM_VISIBILITIES) {
      const { container } = render(<QuoteProvenanceMark entry={{ gate }} />)
      const text = container.textContent
      if (gate === 'shown') {
        expect(text).toBe('')
        continue
      }
      expect(text.length).toBeGreaterThan(10)
      expect(seen.has(text)).toBe(false)
      seen.add(text)
    }
    expect(seen.size).toBe(MARKED_CONTRAST_IDS.length)
  })

  it('el chip de una acusación retenida dice que es una acusación', () => {
    // La diferencia entre los dos hechos tiene que estar en las PALABRAS, no
    // sólo en el color: un lector daltónico y un lector de pantalla ven lo
    // mismo, y es la palabra.
    expect(CONTRAST_CHIP.hidden).toMatch(/acusaci/i)
    expect(CONTRAST_CHIP.toggle).not.toMatch(/acusaci/i)
  })

  /**
   * Cambió la política, no la prueba: desde el 2026-08-27 las dos superficies
   * obedecen la misma puerta, así que una cita `hidden` ya no se pinta como
   * cita-con-chip — no se pinta su literal en absoluto. Lo que hay que
   * comprobar es que el TEXTO no está y que el hueco lo explica.
   */
  it('el literal retenido no se pinta, y el hueco dice por qué', async () => {
    const { container } = await renderCard(withHidden)
    const rows = rowsOf(withHidden, 3)
    const i = rows.findIndex((r) => r.gate === 'hidden')
    const texto = container.textContent
    expect(texto).toContain('Literal retenido')
    expect(texto).toMatch(/ningún registro municipal/i)
    // Y el literal concreto de esa cita, fuera.
    const literal = (withHidden.quotes?.[i]?.text ?? '').slice(0, 40)
    expect(literal.length, 'la prueba no tiene literal que buscar').toBeGreaterThan(10)
    expect(texto).not.toContain(literal)
  })

  it('una ficha con los dos veredictos enseña los dos, cada uno en su cita', async () => {
    const { container } = await renderCard(bothGates)
    const rows = rowsOf(bothGates, 3)
    const quotes = blockquotes(container)
    // Sólo las `toggle` siguen siendo citas con chip; las `hidden` ya no pintan
    // literal, así que no hay blockquote suyo que mirar.
    const visibles = rows.filter((r) => r.gate !== 'hidden')
    expect(visibles.length, 'la prueba no evalúa nada').toBeGreaterThan(0)
    visibles.forEach((r, i) => {
      if (r.gate === 'shown') return
      expect(quotes[i].textContent).toContain(CONTRAST_CHIP[r.gate])
      // Y no el del otro: un chip que saliera en todas no distinguiría nada.
      expect(quotes[i].textContent).not.toContain(CONTRAST_CHIP.hidden)
    })
    // La retenida, en cambio, sale como hueco.
    if (rows.some((r) => r.gate === 'hidden')) {
      expect(container.textContent).toContain('Literal retenido')
    }
  })
})

describe('una cita con las DOS marcas las lleva las dos', () => {
  it('el mismo blockquote trae la de transcripción y la de contraste', async () => {
    const { container } = await renderCard(mixed)
    const rows = rowsOf(mixed, 3)
    const i = rows.findIndex(isDoubleMarked)
    const bq = blockquotes(container)[i]
    expect(bq.textContent).toContain(TRANSCRIPT_CHIP[rows[i].status])
    expect(bq.textContent).toContain(CONTRAST_CHIP[rows[i].gate])
  })

  it('y las pinta como dos etiquetas, no como una frase pegada', async () => {
    const { container } = await renderCard(mixed)
    const rows = rowsOf(mixed, 3)
    const i = rows.findIndex(isDoubleMarked)
    // Dos `Pill` de verdad dentro de la cita: legible al envolverse a 375 px,
    // que es lo que un solo bloque de texto de 60 caracteres no es.
    const pills = [...blockquotes(container)[i].querySelectorAll('span.mono')].filter((el) =>
      [...Object.values(CONTRAST_CHIP), ...Object.values(TRANSCRIPT_CHIP)].includes(el.textContent),
    )
    expect(pills).toHaveLength(2)
    const row = pills[0].closest('span[style*="flex-wrap"]')
    expect(row).toBeTruthy()
    expect(pills[1].closest('span[style*="flex-wrap"]')).toBe(row)
  })

  it('la cita sigue publicada entera: marcarla dos veces no es retirarla', async () => {
    const { container } = await renderCard(mixed)
    const rows = rowsOf(mixed, 3)
    const i = rows.findIndex(isDoubleMarked)
    expect(blockquotes(container)[i].textContent).toContain(mixed.quotes[i].text.slice(0, 40))
  })
})

describe('el control positivo: la cita contrastada sale limpia', () => {
  it('su blockquote no lleva ningún chip, en la misma ficha que sí los tiene', async () => {
    const { container } = await renderCard(mixed)
    const rows = rowsOf(mixed, 3)
    const i = rows.findIndex(isClean)
    const bq = blockquotes(container)[i]
    for (const chip of [...Object.values(CONTRAST_CHIP), ...Object.values(TRANSCRIPT_CHIP)]) {
      expect(bq.textContent).not.toContain(chip)
    }
    // Y que la ficha SÍ marca en otro sitio: si no, esto pasaría con la marca
    // desenchufada del todo.
    expect(container.textContent).toContain(CONTRAST_CHIP[rows.find(isDoubleMarked).gate])
  })

  it('y publica su texto, así que el silencio no es una cita vacía', async () => {
    const { container } = await renderCard(mixed)
    const i = rowsOf(mixed, 3).findIndex(isClean)
    expect(blockquotes(container)[i].textContent).toContain(mixed.quotes[i].text.slice(0, 40))
  })
})

describe('la nota dice qué concluir, y no lo dice dos veces', () => {
  it('explica el contraste fuera de la cita y enlaza a la metodología', async () => {
    const { container } = await renderCard(withHidden)
    expect(container.textContent).toMatch(/no las convierte en falsas/)
    expect(container.querySelector('a[href="/metodologia#citas-contraste"]')).toBeTruthy()
    // Fuera del literal: dentro se leería como parte de lo que dijo el grupo.
    for (const bq of blockquotes(container)) {
      expect(bq.textContent).not.toMatch(/no las convierte en falsas/)
    }
  })

  it('con los dos veredictos presentes, la parte común se dice UNA vez', () => {
    const { container } = render(
      <QuoteProvenanceNote
        entries={[{ gate: 'hidden' }, { gate: 'toggle' }, { gate: 'hidden' }, { gate: 'shown' }]}
      />,
    )
    const text = container.textContent
    expect(
      text.match(/no apareció ningún dato que las confirme ni que las desmienta/g),
    ).toHaveLength(1)
    // Y aun así distingue los dos: cada rótulo aparece, una vez.
    expect(text.match(new RegExp(CONTRAST_CHIP.hidden, 'g'))).toHaveLength(1)
    expect(text.match(new RegExp(CONTRAST_CHIP.toggle, 'g'))).toHaveLength(1)
  })

  it('los dos ejes se explican por separado cuando coinciden', () => {
    const { container } = render(
      <QuoteProvenanceNote entries={[{ status: 'solo-en-sustituida', gate: 'hidden' }]} />,
    )
    expect(container.querySelector('a[href="/metodologia#citas-transcripcion"]')).toBeTruthy()
    expect(container.querySelector('a[href="/metodologia#citas-contraste"]')).toBeTruthy()
    expect(container.textContent).toContain(TRANSCRIPT_CHIP['solo-en-sustituida'])
    expect(container.textContent).toContain(CONTRAST_CHIP.hidden)
  })

  it('calla del todo cuando no hay nada que marcar', () => {
    const { container } = render(
      <QuoteProvenanceNote entries={[{ status: 'en-vigente', gate: 'shown' }]} />,
    )
    expect(container.textContent).toBe('')
  })
})

describe('/metodologia lee las cifras del snapshot, no las trae escritas', () => {
  it('publica el reparto de la puerta y coincide con el fichero derivado', async () => {
    const { container } = render(<Metodologia />)
    await waitFor(() => {
      expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
    })
    const section = container.querySelector('#citas-contraste')
    expect(section).toBeTruthy()
    const c = PROVENANCE.contraste.stats
    const text = section.textContent
    // Los tres números y las dos cifras de fichas, tal cual salen del fichero.
    for (const n of [
      c.citasConClaim,
      c.porContraste.shown,
      c.porContraste.toggle,
      c.porContraste.hidden,
      c.hallazgosSinCitaMostrable,
      c.hallazgosSoloConCitasOcultas,
    ]) {
      expect(text).toContain(String(n))
    }
    // Y que no está escrito: un valor imposible en el fichero no puede salir.
    expect(new Set([c.porContraste.hidden, c.porContraste.toggle]).size).toBe(2)
  })

  it('dice que la puerta gobierna /plenos y que el hallazgo es su excepción', async () => {
    const { container } = render(<Metodologia />)
    await waitFor(() => {
      expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
    })
    const text = container.querySelector('#citas-contraste').textContent
    expect(text).toMatch(/registro de declaraciones del pleno/)
    expect(text).toMatch(/excepción que esa puerta concede/)
    expect(text).toMatch(/la excepción la tomó una máquina/)
    // Y los dos rótulos que el lector verá al lado de una cita.
    for (const chip of Object.values(CONTRAST_CHIP)) expect(text).toContain(chip)
  })
})

describe('/hallazgos renderiza la misma marca que /plenos/:id', () => {
  async function renderDetail(finding) {
    const utils = render(<FindingDetailCard f={finding} permalink={`#${finding.id}`} />)
    await waitFor(() => {
      expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
    })
    utils.rerender(<FindingDetailCard f={finding} permalink={`#${finding.id}`} />)
    return utils
  }

  // Misma corrección que en la tarjeta: la ficha larga tampoco pinta el literal
  // de una acusación retenida. La política es una sola en las dos superficies.
  it('la ficha larga tampoco pinta el literal retenido', async () => {
    const { container } = await renderDetail(withHidden)
    const i = rowsOf(withHidden, 3).findIndex((r) => r.gate === 'hidden')
    const texto = container.textContent
    expect(texto).toContain('Literal retenido')
    const literal = (withHidden.quotes?.[i]?.text ?? '').slice(0, 40)
    expect(literal.length, 'la prueba no tiene literal que buscar').toBeGreaterThan(10)
    expect(texto).not.toContain(literal)
  })

  it('y deja limpia la contrastada, en la misma ficha', async () => {
    const { container } = await renderDetail(mixed)
    const i = rowsOf(mixed, 3).findIndex(isClean)
    for (const chip of Object.values(CONTRAST_CHIP)) {
      expect(blockquotes(container)[i].textContent).not.toContain(chip)
    }
  })
})
