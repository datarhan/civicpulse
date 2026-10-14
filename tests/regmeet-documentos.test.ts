import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  esDocumentoDeSesionRegmeet,
  parseRegmeetDocumentos,
  clasificarDocumento,
} from '../src/scraper/regmeet-documentos'

// Fixtures reales, descargados el 2026-10-13:
//   página de sesión del 03-07-2026 —
//     curl -s -L --max-redirs 3 -c .cache/regmeet.jar -b .cache/regmeet.jar \
//       -A "CivicPulse/1.0 (civic monitor)" \
//       "https://regmeet.com/aytoribarroja/participaciones/aba18772fc70c8cbf79a79f413ef102b"
//   acta del 09-02-2026 — el PDF de su pestaña «Documentos»
//     (…/09-02-2026.Pleno2026-02-10_20-43-39/documentos/2026-07-30_13-45-56_0.pdf), y
//     pdftotext .cache/acta-2026-02-09.pdf tests/fixtures/regmeet_acta_2026-02-09.txt
//   El PDF no se versiona (su Author es «indenova»); sí su texto.
const HTML = readFileSync('tests/fixtures/regmeet_sesion_documentos_2026-07-03.html', 'utf8')
const ACTA_0902 = readFileSync('tests/fixtures/regmeet_acta_2026-02-09.txt', 'utf8')

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

describe('parseRegmeetDocumentos (página real del 03-07-2026)', () => {
  it('saca el único documento, absoluto, con su fecha de subida', () => {
    const docs = parseRegmeetDocumentos(HTML)
    expect(docs).toHaveLength(1)
    expect(docs[0].url).toBe(
      'https://regmeet.com/files/uploads/aytoribarroja/03-07-2026.Pleno2026-07-03_23-40-36/documentos/2026-07-30_13-49-55_0.pdf',
    )
    expect(docs[0].subidoEl).toBe('2026-07-30')
    expect(docs[0].etiqueta).toMatch(/09_P EXTR/)
  })
  it('ignora el enlace de jqueryfiledownload y no duplica', () => {
    const docs = parseRegmeetDocumentos(HTML + HTML)
    expect(docs).toHaveLength(1)
    expect(docs.every((d) => d.url.startsWith('https://regmeet.com/'))).toBe(true)
  })
  it('una página sin documentos da lista vacía', () => {
    expect(parseRegmeetDocumentos('<html><body>sin nada</body></html>')).toEqual([])
  })
})

describe('clasificarDocumento', () => {
  it('reconoce el acta por su texto y comprueba la fecha', () => {
    expect(clasificarDocumento(ACTA_0902, '2026-02-09')).toEqual({
      tipo: 'acta',
      fechaCoincide: true,
    })
    expect(clasificarDocumento(ACTA_0902, '2026-03-09')).toEqual({
      tipo: 'acta',
      fechaCoincide: false,
    })
  })
  it('un PDF que no empieza por «ACTA SESIÓN» es otro', () => {
    expect(
      clasificarDocumento('ORDEN DEL DÍA\nSesión de 9 de febrero de 2026', '2026-02-09').tipo,
    ).toBe('otro')
  })
  it('no se fía del carácter del título (el del 03-07 dice ORDINARIA y era extraordinaria)', () => {
    const t =
      'ACTA SESIÓN ORDINARIA CELEBRADA POR EL\nAYUNTAMIENTO PLENO\nEL DÍA 3 de julio de 2026\nCARÁCTER DE LA SESION: EXTRAORDINARIA'
    expect(clasificarDocumento(t, '2026-07-03')).toEqual({ tipo: 'acta', fechaCoincide: true })
  })
})
