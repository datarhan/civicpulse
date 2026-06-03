/**
 * Journalist tools — deterministic Spanish-regex extraction of bio entities
 * (DOB, birthplace, degrees, career spans, judicial refs) from fetched text.
 * Verbatim from the monolith.
 */

export interface BioEntityExtraction {
  dateOfBirth?: string
  birthplace?: string
  degrees: Array<{ degree: string; institution?: string; startYear?: number; endYear?: number }>
  careerSpans: Array<{ role: string; org?: string; startYear?: number; endYear?: number }>
  judicialRefs: Array<{ caseRef: string; verbatim: string }>
}

const SPANISH_MONTHS: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
}

// Spanish-date helpers — also reused by ./gazette (BOE/DOGV date columns).
export function parseSpanishDate(s: string): string {
  const m = s.toLowerCase().match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/)
  if (!m) return ''
  const mo = SPANISH_MONTHS[m[2]]
  if (!mo) return ''
  return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`
}

export function toIsoFromEsSlash(s: string): string {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return ''
  return `${m[3]}-${m[2]}-${m[1]}`
}

export function extractBioEntities(bodyText: string, subjectName: string): BioEntityExtraction {
  const out: BioEntityExtraction = { degrees: [], careerSpans: [], judicialRefs: [] }
  const text = bodyText.replace(/\s+/g, ' ').trim()

  // ─── DOB ────────────────────────────────────────────────────────────────
  // Prose: "nació el 14 de marzo de 1968"
  const dobMatch = text.match(/naci(?:ó|do|da)\s+(?:el\s+)?(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i)
  if (dobMatch) {
    const iso = parseSpanishDate(dobMatch[1])
    if (iso) out.dateOfBirth = iso
  }
  // CV: "9 ABRIL 1966" or "9 abril 1966" (no "de") — accept a bare
  // day-month-year with optional "de".
  if (!out.dateOfBirth) {
    const bare = text.match(
      /\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})\b/i,
    )
    if (bare) {
      const mo = SPANISH_MONTHS[bare[2].toLowerCase()]
      if (mo) out.dateOfBirth = `${bare[3]}-${mo}-${bare[1].padStart(2, '0')}`
    }
  }

  // ─── Birthplace ─────────────────────────────────────────────────────────
  // Prose: "nacido en X" / "natural de X"
  const placeMatch =
    text.match(/naci(?:ó|do|da)\s+en\s+([A-ZÁÉÍÓÚÑ][\w\s,.\-áéíóúñ]{2,60}?)(?:,| el| en |[.;])/) ||
    text.match(/natural\s+de\s+([A-ZÁÉÍÓÚÑ][\w\s,.\-áéíóúñ]{2,60}?)(?:,|[.;])/i)
  if (placeMatch) out.birthplace = placeMatch[1].trim()
  // CV: place appears on a line just after the DOB. After a bare DOB
  // match we look for the next ALL-CAPS proper-noun-ish run (often
  // "RIBA-ROJA DE TÚRIA", "VALENCIA", "MADRID").
  if (!out.birthplace && out.dateOfBirth) {
    const after = text.slice(text.search(/\b\d{1,2}\s+(?:de\s+)?[A-Z]/i))
    const placeCv = after.match(
      /(?:\d{4})\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\-]+(?:\s+(?:DE|DEL|LA|EL|LOS|LAS)\s+)?(?:[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\-]+\s*)*)/,
    )
    if (placeCv) out.birthplace = placeCv[1].replace(/\s+/g, ' ').trim()
  }

  // ─── Degrees / education ────────────────────────────────────────────────
  // Prose: "Licenciado en X por la Universidad de Y" / "Doctor en X"
  const degreeRx =
    /(Licenciad[oa]|Diplomad[oa]|Graduad[oa]|Doctor|Doctora|Máster|Máster en|Ingenier[oa]|Arquitect[oa])\s+(?:en\s+)?([A-ZÁÉÍÓÚÑ][\w\s,.\-áéíóúñ]{2,80}?)(?:\s+por\s+(la\s+[A-ZÁÉÍÓÚÑ][\w\s,.\-áéíóúñ]{2,80}?))?(?:[.,;]|\bdesde\b|\bentre\b)/g
  let dm: RegExpExecArray | null
  while ((dm = degreeRx.exec(text))) {
    const entry: { degree: string; institution?: string; startYear?: number; endYear?: number } = {
      degree: `${dm[1]} en ${dm[2].trim()}`.replace(/\s+/g, ' '),
    }
    if (dm[3]) entry.institution = dm[3].replace(/^la\s+/i, '').trim()
    out.degrees.push(entry)
    if (out.degrees.length >= 6) break
  }
  // CV: bullet-formatted education entries — pick up bare institution
  // names + matriculation keywords. Catches the PSOE-flyer pattern:
  // "COLEGIO PÚBLICO MIGUEL CERVANTES• Matriculación en magisterio EGB"
  const eduInstRx =
    /(COLEGIO\s+PÚBLICO[\w\s-]+|UNIVERSIDAD\s+(?:DE|POLITÉCNICA|AUTÓNOMA|COMPLUTENSE|CARLOS\s+III)[\w\s-]*|UNIVERSITAT[\w\s-]+|IES\s+[\w\s-]+|ESCUELA\s+(?:TÉCNICA|SUPERIOR|UNIVERSITARIA)[\w\s-]*)/g
  let edm: RegExpExecArray | null
  while ((edm = eduInstRx.exec(text)) && out.degrees.length < 8) {
    const inst = edm[1].replace(/\s+/g, ' ').trim()
    // Pull a short program description that often follows the bullet "•"
    const tail = text.slice(edm.index + edm[0].length, edm.index + edm[0].length + 120)
    const programMatch = tail.match(
      /[•·]\s*([A-ZÁÉÍÓÚÑa-záéíóúñ][\w\s,.\-áéíóúñ]{3,60}?)(?:[.•·]|$|\s{2,})/,
    )
    out.degrees.push({
      degree: programMatch ? programMatch[1].trim() : 'Estudios cursados',
      institution: inst,
    })
  }
  // CV: standalone qualification keywords (MAGISTERIO, EGB, BACHILLER, …)
  const qualRx =
    /\b(MAGISTERIO|BACHILLERATO|BACHILLER|EGB|FP\s+(?:I+|SUPERIOR)|ACCESO\s+A\s+UNIVERSIDAD\s+MAYORES\s+DE\s+\d{2}\s+AÑOS|DOCTORADO|LICENCIATURA|MÁSTER|GRADO\s+EN\s+\w+)\b/g
  let qm: RegExpExecArray | null
  while ((qm = qualRx.exec(text)) && out.degrees.length < 12) {
    out.degrees.push({ degree: qm[1].replace(/\s+/g, ' ').trim() })
  }

  // ─── Career spans ───────────────────────────────────────────────────────
  // Prose: "1991-2003 economista en X" or "entre 1991 y 2003"
  const careerRx =
    /(\d{4})\s*[-–—]\s*(\d{4}|presente|actualidad)\s*[:,]?\s+([\w\sÁÉÍÓÚÑáéíóúñ.,\-]{3,80}?)(?:\s+en\s+([\w\sÁÉÍÓÚÑáéíóúñ.,\-]{2,80}?))?(?:[.;]|$)/g
  let cm: RegExpExecArray | null
  while ((cm = careerRx.exec(text))) {
    const startYear = Number(cm[1])
    const endRaw = cm[2]
    const endYear = /^\d{4}$/.test(endRaw) ? Number(endRaw) : undefined
    out.careerSpans.push({
      role: cm[3].trim(),
      ...(cm[4] ? { org: cm[4].trim() } : {}),
      startYear,
      ...(endYear !== undefined ? { endYear } : {}),
    })
    if (out.careerSpans.length >= 10) break
  }
  // CV-bullet career: "ASESOR • 2011 - 2015• DIPUTACIÓ DE VALÈNCIA"
  const careerCvRx =
    /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,40}?)\s*[•·]\s*(\d{4})\s*[-–—]\s*(\d{4}|ACTUAL|ACTUALIDAD|PRESENTE)\s*[•·]\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s.,\-]{2,80})/g
  let ccm: RegExpExecArray | null
  while ((ccm = careerCvRx.exec(text)) && out.careerSpans.length < 18) {
    const startYear = Number(ccm[2])
    const endRaw = ccm[3].toUpperCase()
    const endYear = /^\d{4}$/.test(endRaw) ? Number(endRaw) : undefined
    out.careerSpans.push({
      role: ccm[1].replace(/\s+/g, ' ').trim(),
      org: ccm[4].replace(/\s+/g, ' ').replace(/[•·]+/g, '').trim(),
      startYear,
      ...(endYear !== undefined ? { endYear } : {}),
    })
  }

  // ─── Judicial refs ──────────────────────────────────────────────────────
  // PA NNNN/YYYY (or DP/RC/PO) anywhere in text containing the subject's first name nearby
  const judicialRx = /\b(PA|DP|RC|PO)\s*\d+\s*\/\s*\d{2,4}\b/gi
  const subjectFirstName = subjectName.split(/\s+/)[0]
  let jm: RegExpExecArray | null
  while ((jm = judicialRx.exec(text))) {
    const idx = jm.index ?? 0
    const window = text.slice(Math.max(0, idx - 120), Math.min(text.length, idx + 180))
    if (!new RegExp(subjectFirstName, 'i').test(window)) continue
    out.judicialRefs.push({ caseRef: jm[0], verbatim: window.replace(/\s+/g, ' ').trim() })
    if (out.judicialRefs.length >= 4) break
  }

  return out
}

