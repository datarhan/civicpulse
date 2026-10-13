import { describe, it, expect } from 'vitest'
import { esDocumentoDeSesionRegmeet } from '../src/scraper/regmeet-documentos'

// URL real, medida el 2026-10-13: el acta firmada del pleno de 09-02-2026.
const ACTA =
  'https://regmeet.com/files/uploads/aytoribarroja/09-02-2026.Pleno2026-02-10_20-43-39/documentos/2026-07-30_13-45-56_0.pdf'

describe('esDocumentoDeSesionRegmeet', () => {
  it('reconoce un PDF de la pestaña «Documentos»', () => {
    expect(esDocumentoDeSesionRegmeet(ACTA)).toBe(true)
  })
  it('no confunde la página de sesión con un documento', () => {
    expect(
      esDocumentoDeSesionRegmeet(
        'https://regmeet.com/aytoribarroja/participaciones/c5b270a763686e776039618cc709f3a6?idioma=castellano',
      ),
    ).toBe(false)
  })
  it('exige el host exacto, la entidad y la carpeta documentos', () => {
    expect(esDocumentoDeSesionRegmeet(ACTA.replace('regmeet.com', 'regmeet.com.evil.es'))).toBe(
      false,
    )
    expect(esDocumentoDeSesionRegmeet(ACTA.replace('/aytoribarroja/', '/otroayto/'))).toBe(false)
    expect(esDocumentoDeSesionRegmeet(ACTA.replace('/documentos/', '/videos/'))).toBe(false)
    expect(esDocumentoDeSesionRegmeet(ACTA.replace('.pdf', '.mp4'))).toBe(false)
    expect(esDocumentoDeSesionRegmeet('no es una url')).toBe(false)
  })
})
