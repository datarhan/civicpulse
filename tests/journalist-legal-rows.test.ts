import { describe, it, expect } from 'vitest'
import {
  mergeLegalRows,
  synthesizeLegalRecordRows,
} from '../src/scraper/journalist-agent/legal-rows'

const INFORME_BODY = {
  citationId: 'src-013',
  title: 'JUNTA SUPERIOR DE CONTRACTACIÓ ADMINISTRATIVA — Informe 02-2021, de 18 de junio de 2021',
  excerpt:
    'Informe 02/2021, de 18 de junio de 2021. Contratación irregular: revisión de oficio de obras que deben ser objeto de licitación. ROBERTO PASCUAL RAGA GADEA, Alcalde del Ayuntamiento de Riba-roja de Turia, actuando en nombre y representación del mismo. La Sentencia del Tribunal Superior de Justicia de la Comunidad Valenciana de 25 de marzo de 2019 declara la obligación de indemnizar.',
}

const BOP_BODY = {
  citationId: 'src-014',
  title: 'Anuncio — Boletín Oficial de la Provincia de València',
  excerpt:
    'Edicto del Juzgado de lo Social número dos de Valencia sobre expediente número 2019/8305 contra el Ayuntamiento; se hace saber la sentencia número 139/19 del Juzgado de lo Social número dos, notificada a Roberto-Pascual Raga Gadea.',
}

const CLEAN_BODY = {
  citationId: 'src-020',
  title: 'Nota de prensa municipal',
  excerpt: 'El Ayuntamiento presentó el cartel de las fiestas patronales de agosto.',
}

describe('synthesizeLegalRecordRows', () => {
  it('extracts one row per official document with docket, issuing body and verbatim window', () => {
    const rows = synthesizeLegalRecordRows([INFORME_BODY, BOP_BODY, CLEAN_BODY])
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const informe = rows.find((r) => /02\/2021/.test(r.caseRef))
    expect(informe).toBeDefined()
    expect(informe!.court).toContain('Junta Superior')
    expect(informe!.verbatimRef.length).toBeGreaterThanOrEqual(20)
    expect(informe!.sourceIds).toEqual(['src-013'])
    const bop = rows.find((r) => /139\/19/.test(r.caseRef))
    expect(bop).toBeDefined()
    expect(bop!.court).toContain('Juzgado de lo Social')
    expect(bop!.sourceIds).toEqual(['src-014'])
  })

  it('never invents rows from non-judicial bodies', () => {
    expect(synthesizeLegalRecordRows([CLEAN_BODY])).toEqual([])
  })

  it('dedupes the same docket across bodies, keeping the first source', () => {
    const dup = { ...BOP_BODY, citationId: 'src-099' }
    const rows = synthesizeLegalRecordRows([BOP_BODY, dup])
    expect(rows.filter((r) => /139\/19/.test(r.caseRef))).toHaveLength(1)
  })

  it('skips references whose issuing body cannot be derived (honest miss)', () => {
    const vague = {
      citationId: 'src-050',
      title: 'Documento',
      excerpt: 'Se menciona el expediente 77/2020 sin más contexto identificable en este texto.',
    }
    expect(synthesizeLegalRecordRows([vague])).toEqual([])
  })
})

describe('mergeLegalRows — deterministic floor + LLM enrichment union', () => {
  const seed = {
    caseRef: 'sentencia 139/19',
    court: 'Juzgado de lo Social',
    verbatimRef: 'se hace saber la sentencia número 139/19 del Juzgado de lo Social número dos',
    sourceIds: ['src-016'],
  }
  const seedInforme = {
    caseRef: 'informe 02/2021',
    court: 'Junta Superior de Contractació Administrativa (GVA)',
    verbatimRef:
      'Informe 02/2021, de 18 de junio de 2021. Contratación irregular: revisión de oficio',
    sourceIds: ['src-013'],
  }

  it('guarantees every seed survives when the LLM emits nothing', () => {
    const { rows, appendedSeeds } = mergeLegalRows([seed, seedInforme], [])
    expect(rows).toHaveLength(2)
    expect(appendedSeeds).toBe(2)
  })

  it('LLM enrichment wins field-wise on the same docket (case-insensitive key)', () => {
    const enriched = {
      caseRef: 'Sentencia 139/19',
      court: 'Juzgado de lo Social nº 2 de Valencia',
      date: '2019-05-20',
      outcome: 'condena al Ayuntamiento',
      verbatimRef: 'sentencia número 139/19 del Juzgado de lo Social número dos de Valencia',
      sourceIds: ['src-016'],
    }
    const { rows, appendedSeeds } = mergeLegalRows([seed, seedInforme], [enriched])
    expect(rows).toHaveLength(2)
    const r = rows.find((x) => /139\/19/.test(x.caseRef))!
    expect(r.court).toContain('nº 2')
    expect(r.outcome).toBe('condena al Ayuntamiento')
    expect(appendedSeeds).toBe(1) // only the informe seed was appended
  })

  it('keeps LLM-added rows the deterministic pass missed', () => {
    const extra = {
      caseRef: 'expediente 2019/8305',
      court: 'Juzgado de lo Social',
      verbatimRef: 'expediente número 2019/8305 contra el Ayuntamiento de Riba-roja de Túria',
      sourceIds: ['src-016'],
    }
    const { rows } = mergeLegalRows([seed], [extra])
    expect(rows).toHaveLength(2)
  })
})
