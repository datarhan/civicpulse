/**
 * Journalist subsystem — the per-section payload validator (`validateSection`).
 * Split out of ./validators because it is the largest single validator: one
 * exhaustive switch over every ReportSection kind. Verbatim from the monolith.
 */
import {
  ALLOWED_RELATIONSHIP_NODE_KINDS,
  ALLOWED_SECTION_KINDS,
  type PressHeadline,
  type RelationshipEdge,
  type RelationshipNode,
  type RelationshipNodeKind,
  type ReportSection,
  type SparklinePoint,
  type TimelineEvent,
} from './types'
import { ISO_DATE, JournalistValidationError, must, SLUG_RE, URL_RE } from './core'

export function validateSection(
  s: unknown,
  idx: number,
  si: number,
  sourceIds: Set<string>,
): ReportSection {
  must(typeof s === 'object' && s !== null, `items[${idx}].sections[${si}] must be object`)
  const o = s as Record<string, unknown>
  must(
    typeof o.kind === 'string' && (ALLOWED_SECTION_KINDS as readonly string[]).includes(o.kind),
    `items[${idx}].sections[${si}].kind must be one of ${ALLOWED_SECTION_KINDS.join(',')}`,
  )
  must(
    typeof o.payload === 'object' && o.payload !== null,
    `items[${idx}].sections[${si}].payload required`,
  )
  const p = o.payload as Record<string, unknown>
  const here = `items[${idx}].sections[${si}](${o.kind})`

  const checkRefs = (refs: unknown, field: string) => {
    must(Array.isArray(refs), `${here}.${field} must be array`)
    for (const r of refs as unknown[]) {
      must(
        typeof r === 'string' && sourceIds.has(r),
        `${here}.${field} contains unknown sourceId ${String(r)}`,
      )
    }
  }

  switch (o.kind) {
    case 'portrait': {
      must(
        typeof p.officialSlug === 'string' && SLUG_RE.test(p.officialSlug),
        `${here}.payload.officialSlug must be kebab-case slug`,
      )
      must(
        typeof p.photoPath === 'string' && p.photoPath.startsWith('/'),
        `${here}.payload.photoPath must start with /`,
      )
      must(
        typeof p.partyTone === 'string' && p.partyTone.length > 0,
        `${here}.payload.partyTone required`,
      )
      must(
        Array.isArray(p.portfolios) &&
          (p.portfolios as unknown[]).every((x) => typeof x === 'string'),
        `${here}.payload.portfolios must be string[]`,
      )
      if (p.cvUrl !== undefined)
        must(
          typeof p.cvUrl === 'string' && URL_RE.test(p.cvUrl),
          `${here}.payload.cvUrl must be URL`,
        )
      return {
        kind: 'portrait',
        payload: {
          officialSlug: p.officialSlug as string,
          photoPath: p.photoPath as string,
          partyTone: p.partyTone as string,
          portfolios: p.portfolios as string[],
          ...(p.cvUrl ? { cvUrl: p.cvUrl as string } : {}),
        },
      }
    }
    case 'narrative': {
      must(
        typeof p.heading === 'string' && p.heading.trim().length >= 3,
        `${here}.payload.heading must be ≥3 chars`,
      )
      must(
        typeof p.bodyMarkdown === 'string' &&
          p.bodyMarkdown.trim().length >= 40 &&
          p.bodyMarkdown.length <= 8000,
        `${here}.payload.bodyMarkdown must be 40-8000 chars`,
      )
      checkRefs(p.sourceIds, 'payload.sourceIds')
      must(
        (p.sourceIds as unknown[]).length >= 1,
        `${here}.payload.sourceIds must reference ≥1 citation (no unsupported prose)`,
      )
      return {
        kind: 'narrative',
        payload: {
          heading: (p.heading as string).trim(),
          bodyMarkdown: (p.bodyMarkdown as string).trim(),
          sourceIds: p.sourceIds as string[],
        },
      }
    }
    case 'timeline': {
      must(
        Array.isArray(p.events) && (p.events as unknown[]).length >= 1,
        `${here}.payload.events must have ≥1 event`,
      )
      const events: TimelineEvent[] = (p.events as unknown[]).map((e, ei) => {
        must(typeof e === 'object' && e !== null, `${here}.payload.events[${ei}] must be object`)
        const ev = e as Record<string, unknown>
        must(
          typeof ev.date === 'string' && ISO_DATE.test(ev.date),
          `${here}.payload.events[${ei}].date must be ISO date`,
        )
        must(
          typeof ev.label === 'string' && ev.label.length >= 3,
          `${here}.payload.events[${ei}].label required`,
        )
        checkRefs(ev.sourceIds, `payload.events[${ei}].sourceIds`)
        return {
          date: ev.date as string,
          label: ev.label as string,
          sourceIds: ev.sourceIds as string[],
        }
      })
      return { kind: 'timeline', payload: { events } }
    }
    case 'relationships': {
      must(
        Array.isArray(p.nodes) && (p.nodes as unknown[]).length >= 1,
        `${here}.payload.nodes required`,
      )
      must(Array.isArray(p.edges), `${here}.payload.edges must be array`)
      const nodes: RelationshipNode[] = (p.nodes as unknown[]).map((n, ni) => {
        must(typeof n === 'object' && n !== null, `${here}.payload.nodes[${ni}] must be object`)
        const nd = n as Record<string, unknown>
        must(
          typeof nd.id === 'string' && nd.id.length > 0,
          `${here}.payload.nodes[${ni}].id required`,
        )
        must(
          typeof nd.label === 'string' && nd.label.length > 0,
          `${here}.payload.nodes[${ni}].label required`,
        )
        must(
          typeof nd.tone === 'string' && nd.tone.length > 0,
          `${here}.payload.nodes[${ni}].tone required`,
        )
        must(
          typeof nd.kind === 'string' &&
            (ALLOWED_RELATIONSHIP_NODE_KINDS as readonly string[]).includes(nd.kind),
          `${here}.payload.nodes[${ni}].kind must be one of ${ALLOWED_RELATIONSHIP_NODE_KINDS.join(',')}`,
        )
        return {
          id: nd.id as string,
          label: nd.label as string,
          tone: nd.tone as string,
          kind: nd.kind as RelationshipNodeKind,
        }
      })
      const nodeIds = new Set(nodes.map((n) => n.id))
      const edges: RelationshipEdge[] = (p.edges as unknown[]).map((e, ei) => {
        must(typeof e === 'object' && e !== null, `${here}.payload.edges[${ei}] must be object`)
        const ed = e as Record<string, unknown>
        must(
          typeof ed.from === 'string' && nodeIds.has(ed.from),
          `${here}.payload.edges[${ei}].from unknown node`,
        )
        must(
          typeof ed.to === 'string' && nodeIds.has(ed.to),
          `${here}.payload.edges[${ei}].to unknown node`,
        )
        must(
          typeof ed.relation === 'string' && ed.relation.length > 0,
          `${here}.payload.edges[${ei}].relation required`,
        )
        checkRefs(ed.sourceIds, `payload.edges[${ei}].sourceIds`)
        must(
          (ed.sourceIds as unknown[]).length >= 1,
          `${here}.payload.edges[${ei}].sourceIds must reference ≥1 citation`,
        )
        return {
          from: ed.from as string,
          to: ed.to as string,
          relation: ed.relation as string,
          sourceIds: ed.sourceIds as string[],
        }
      })
      return { kind: 'relationships', payload: { nodes, edges } }
    }
    case 'press-sparkline': {
      must(Array.isArray(p.points), `${here}.payload.points must be array`)
      const points: SparklinePoint[] = (p.points as unknown[]).map((pt, pi) => {
        must(typeof pt === 'object' && pt !== null, `${here}.payload.points[${pi}] must be object`)
        const pp = pt as Record<string, unknown>
        must(
          typeof pp.date === 'string' && ISO_DATE.test(pp.date),
          `${here}.payload.points[${pi}].date must be ISO date`,
        )
        must(
          typeof pp.count === 'number' && pp.count >= 0,
          `${here}.payload.points[${pi}].count must be ≥0`,
        )
        return { date: pp.date as string, count: pp.count as number }
      })
      must(Array.isArray(p.headlines), `${here}.payload.headlines must be array`)
      const headlines: PressHeadline[] = (p.headlines as unknown[]).map((h, hi) => {
        must(typeof h === 'object' && h !== null, `${here}.payload.headlines[${hi}] must be object`)
        const hd = h as Record<string, unknown>
        must(
          typeof hd.title === 'string' && hd.title.length > 0,
          `${here}.payload.headlines[${hi}].title required`,
        )
        must(
          typeof hd.url === 'string' && URL_RE.test(hd.url),
          `${here}.payload.headlines[${hi}].url must be URL`,
        )
        must(
          typeof hd.date === 'string' && ISO_DATE.test(hd.date),
          `${here}.payload.headlines[${hi}].date must be ISO date`,
        )
        return { title: hd.title as string, url: hd.url as string, date: hd.date as string }
      })
      return { kind: 'press-sparkline', payload: { points, headlines } }
    }
    case 'promise-board': {
      must(Array.isArray(p.promiseIds), `${here}.payload.promiseIds must be array`)
      const ids: string[] = (p.promiseIds as unknown[]).map((x, xi) => {
        must(typeof x === 'string' && x.length > 0, `${here}.payload.promiseIds[${xi}] required`)
        return x as string
      })
      return { kind: 'promise-board', payload: { promiseIds: ids } }
    }
    case 'quote-card': {
      must(
        typeof p.verbatim === 'string' && p.verbatim.trim().length >= 20,
        `${here}.payload.verbatim must be ≥20 chars`,
      )
      must(
        typeof p.attributedTo === 'string' && p.attributedTo.length > 0,
        `${here}.payload.attributedTo required`,
      )
      must(
        typeof p.sourceId === 'string' && sourceIds.has(p.sourceId),
        `${here}.payload.sourceId unknown citation`,
      )
      if (p.date !== undefined) {
        must(
          typeof p.date === 'string' && ISO_DATE.test(p.date),
          `${here}.payload.date must be ISO date`,
        )
      }
      return {
        kind: 'quote-card',
        payload: {
          verbatim: (p.verbatim as string).trim(),
          attributedTo: p.attributedTo as string,
          ...(p.date ? { date: p.date as string } : {}),
          sourceId: p.sourceId as string,
        },
      }
    }
    // ─── Phase B: soul.md / digital-person dossier sections ──────────────
    case 'identity': {
      const family = Array.isArray(p.family) ? (p.family as unknown[]) : []
      const familyOut: Array<{ relation: string; name?: string; sourceIds: string[] }> = []
      for (let fi = 0; fi < family.length; fi++) {
        const f = family[fi]
        must(typeof f === 'object' && f !== null, `${here}.payload.family[${fi}] must be object`)
        const fo = f as Record<string, unknown>
        must(
          typeof fo.relation === 'string' && fo.relation.length > 0,
          `${here}.payload.family[${fi}].relation required`,
        )
        const refs = (fo.sourceIds as unknown[]) ?? []
        for (const r of refs)
          must(
            typeof r === 'string' && sourceIds.has(r),
            `${here}.payload.family[${fi}].sourceIds contains unknown ${String(r)}`,
          )
        // Libel rule: naming a family member requires every cited
        // source to be `trust:'high'`. Validator can't see source.trust
        // directly (it only has the ID set), so we mark the row and
        // let validateBaseReport finish the cross-check.
        familyOut.push({
          relation: fo.relation as string,
          ...(typeof fo.name === 'string' && fo.name.length > 0 ? { name: fo.name as string } : {}),
          sourceIds: refs as string[],
        })
      }
      const topRefs = Array.isArray(p.sourceIds) ? (p.sourceIds as unknown[]) : []
      for (const r of topRefs)
        must(
          typeof r === 'string' && sourceIds.has(r),
          `${here}.payload.sourceIds contains unknown ${String(r)}`,
        )
      if (p.dateOfBirth !== undefined)
        must(
          typeof p.dateOfBirth === 'string' && ISO_DATE.test(p.dateOfBirth),
          `${here}.payload.dateOfBirth must be ISO date`,
        )
      if (p.birthplace !== undefined)
        must(typeof p.birthplace === 'string', `${here}.payload.birthplace must be string`)
      if (p.residence !== undefined)
        must(typeof p.residence === 'string', `${here}.payload.residence must be string`)
      if (p.nationality !== undefined)
        must(typeof p.nationality === 'string', `${here}.payload.nationality must be string`)
      return {
        kind: 'identity',
        payload: {
          ...(p.dateOfBirth ? { dateOfBirth: p.dateOfBirth as string } : {}),
          ...(p.birthplace ? { birthplace: p.birthplace as string } : {}),
          ...(p.residence ? { residence: p.residence as string } : {}),
          ...(p.nationality ? { nationality: p.nationality as string } : {}),
          ...(familyOut.length > 0 ? { family: familyOut } : {}),
          sourceIds: topRefs as string[],
        },
      }
    }
    case 'education': {
      must(Array.isArray(p.items), `${here}.payload.items must be array`)
      const items = (p.items as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.items[${ii}] must be object`)
        const o = it as Record<string, unknown>
        must(
          typeof o.degree === 'string' && o.degree.trim().length >= 2,
          `${here}.payload.items[${ii}].degree required`,
        )
        if (o.institution !== undefined)
          must(
            typeof o.institution === 'string',
            `${here}.payload.items[${ii}].institution must be string`,
          )
        if (o.startYear !== undefined)
          must(
            typeof o.startYear === 'number' && o.startYear >= 1900 && o.startYear <= 2100,
            `${here}.payload.items[${ii}].startYear must be year`,
          )
        if (o.endYear !== undefined)
          must(
            typeof o.endYear === 'number' && o.endYear >= 1900 && o.endYear <= 2100,
            `${here}.payload.items[${ii}].endYear must be year`,
          )
        const refs = Array.isArray(o.sourceIds) ? (o.sourceIds as unknown[]) : []
        for (const r of refs)
          must(
            typeof r === 'string' && sourceIds.has(r),
            `${here}.payload.items[${ii}].sourceIds contains unknown ${String(r)}`,
          )
        return {
          degree: (o.degree as string).trim(),
          ...(o.institution ? { institution: (o.institution as string).trim() } : {}),
          ...(o.startYear !== undefined ? { startYear: o.startYear as number } : {}),
          ...(o.endYear !== undefined ? { endYear: o.endYear as number } : {}),
          sourceIds: refs as string[],
        }
      })
      return { kind: 'education', payload: { items } }
    }
    case 'career-political':
    case 'career-professional': {
      must(Array.isArray(p.items), `${here}.payload.items must be array`)
      const isPolitical = o.kind === 'career-political'
      const items = (p.items as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.items[${ii}] must be object`)
        const r2 = it as Record<string, unknown>
        must(
          typeof r2.role === 'string' && r2.role.trim().length >= 2,
          `${here}.payload.items[${ii}].role required`,
        )
        must(
          typeof r2.org === 'string' && r2.org.trim().length >= 2,
          `${here}.payload.items[${ii}].org required`,
        )
        if (isPolitical) {
          must(
            typeof r2.startYear === 'number' && r2.startYear >= 1900 && r2.startYear <= 2100,
            `${here}.payload.items[${ii}].startYear required for career-political`,
          )
        } else if (r2.startYear !== undefined) {
          must(
            typeof r2.startYear === 'number' && r2.startYear >= 1900 && r2.startYear <= 2100,
            `${here}.payload.items[${ii}].startYear must be year`,
          )
        }
        if (r2.endYear !== undefined && r2.endYear !== null) {
          must(
            typeof r2.endYear === 'number' && r2.endYear >= 1900 && r2.endYear <= 2100,
            `${here}.payload.items[${ii}].endYear must be year or null`,
          )
        }
        const refs = Array.isArray(r2.sourceIds) ? (r2.sourceIds as unknown[]) : []
        for (const rid of refs)
          must(
            typeof rid === 'string' && sourceIds.has(rid),
            `${here}.payload.items[${ii}].sourceIds contains unknown ${String(rid)}`,
          )
        return {
          role: (r2.role as string).trim(),
          org: (r2.org as string).trim(),
          ...(r2.startYear !== undefined ? { startYear: r2.startYear as number } : {}),
          ...(r2.endYear !== undefined ? { endYear: r2.endYear as number | null } : {}),
          sourceIds: refs as string[],
        }
      })
      return isPolitical
        ? // narrow types for the discriminated union (startYear required)
          {
            kind: 'career-political',
            payload: {
              items: items as Array<{
                role: string
                org: string
                startYear: number
                endYear?: number | null
                sourceIds: string[]
              }>,
            },
          }
        : { kind: 'career-professional', payload: { items } }
    }
    case 'legal-record': {
      must(Array.isArray(p.items), `${here}.payload.items must be array`)
      const items = (p.items as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.items[${ii}] must be object`)
        const r3 = it as Record<string, unknown>
        must(
          typeof r3.caseRef === 'string' && r3.caseRef.trim().length >= 3,
          `${here}.payload.items[${ii}].caseRef required`,
        )
        must(
          typeof r3.court === 'string' && r3.court.trim().length >= 3,
          `${here}.payload.items[${ii}].court required`,
        )
        must(
          typeof r3.verbatimRef === 'string' && r3.verbatimRef.trim().length >= 20,
          `${here}.payload.items[${ii}].verbatimRef must be verbatim ≥20 chars`,
        )
        if (r3.date !== undefined)
          must(
            typeof r3.date === 'string' && ISO_DATE.test(r3.date),
            `${here}.payload.items[${ii}].date must be ISO date`,
          )
        if (r3.outcome !== undefined)
          must(
            typeof r3.outcome === 'string',
            `${here}.payload.items[${ii}].outcome must be string`,
          )
        const refs = Array.isArray(r3.sourceIds) ? (r3.sourceIds as unknown[]) : []
        must(refs.length >= 1, `${here}.payload.items[${ii}].sourceIds must reference ≥1 citation`)
        for (const rid of refs)
          must(
            typeof rid === 'string' && sourceIds.has(rid),
            `${here}.payload.items[${ii}].sourceIds contains unknown ${String(rid)}`,
          )
        return {
          caseRef: (r3.caseRef as string).trim(),
          court: (r3.court as string).trim(),
          ...(r3.date ? { date: r3.date as string } : {}),
          ...(r3.outcome ? { outcome: (r3.outcome as string).trim() } : {}),
          verbatimRef: (r3.verbatimRef as string).trim(),
          sourceIds: refs as string[],
        }
      })
      return { kind: 'legal-record', payload: { items } }
    }
    case 'financial': {
      must(Array.isArray(p.items), `${here}.payload.items must be array`)
      const items = (p.items as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.items[${ii}] must be object`)
        const r4 = it as Record<string, unknown>
        must(
          typeof r4.year === 'number' && r4.year >= 1900 && r4.year <= 2100,
          `${here}.payload.items[${ii}].year required`,
        )
        must(
          typeof r4.metric === 'string' &&
            ['salary', 'declared-assets', 'business'].includes(r4.metric),
          `${here}.payload.items[${ii}].metric must be salary|declared-assets|business`,
        )
        must(
          typeof r4.description === 'string' && r4.description.trim().length > 0,
          `${here}.payload.items[${ii}].description required`,
        )
        if (r4.amountEuros !== undefined)
          must(
            typeof r4.amountEuros === 'number' && r4.amountEuros >= 0,
            `${here}.payload.items[${ii}].amountEuros must be ≥0`,
          )
        const refs = Array.isArray(r4.sourceIds) ? (r4.sourceIds as unknown[]) : []
        must(refs.length >= 1, `${here}.payload.items[${ii}].sourceIds must reference ≥1 citation`)
        for (const rid of refs)
          must(
            typeof rid === 'string' && sourceIds.has(rid),
            `${here}.payload.items[${ii}].sourceIds contains unknown ${String(rid)}`,
          )
        return {
          year: r4.year as number,
          metric: r4.metric as 'salary' | 'declared-assets' | 'business',
          ...(r4.amountEuros !== undefined ? { amountEuros: r4.amountEuros as number } : {}),
          description: (r4.description as string).trim(),
          sourceIds: refs as string[],
        }
      })
      return { kind: 'financial', payload: { items } }
    }
    case 'online-presence': {
      must(Array.isArray(p.accounts), `${here}.payload.accounts must be array`)
      const accounts = (p.accounts as unknown[]).map((it, ii) => {
        must(
          typeof it === 'object' && it !== null,
          `${here}.payload.accounts[${ii}] must be object`,
        )
        const r5 = it as Record<string, unknown>
        must(
          typeof r5.platform === 'string' && r5.platform.trim().length > 0,
          `${here}.payload.accounts[${ii}].platform required`,
        )
        must(
          typeof r5.handle === 'string' && r5.handle.trim().length > 0,
          `${here}.payload.accounts[${ii}].handle required`,
        )
        must(
          typeof r5.url === 'string' && URL_RE.test(r5.url),
          `${here}.payload.accounts[${ii}].url must be URL`,
        )
        if (r5.verifiedAt !== undefined)
          must(
            typeof r5.verifiedAt === 'string' && ISO_DATE.test(r5.verifiedAt),
            `${here}.payload.accounts[${ii}].verifiedAt must be ISO date`,
          )
        const refs = Array.isArray(r5.sourceIds) ? (r5.sourceIds as unknown[]) : []
        for (const rid of refs)
          must(
            typeof rid === 'string' && sourceIds.has(rid),
            `${here}.payload.accounts[${ii}].sourceIds contains unknown ${String(rid)}`,
          )
        return {
          platform: (r5.platform as string).trim(),
          handle: (r5.handle as string).trim(),
          url: r5.url as string,
          ...(r5.verifiedAt ? { verifiedAt: r5.verifiedAt as string } : {}),
          sourceIds: refs as string[],
        }
      })
      return { kind: 'online-presence', payload: { accounts } }
    }
    case 'awards': {
      must(Array.isArray(p.items), `${here}.payload.items must be array`)
      const items = (p.items as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.items[${ii}] must be object`)
        const r6 = it as Record<string, unknown>
        must(
          typeof r6.name === 'string' && r6.name.trim().length >= 2,
          `${here}.payload.items[${ii}].name required`,
        )
        must(
          typeof r6.awardedBy === 'string' && r6.awardedBy.trim().length >= 2,
          `${here}.payload.items[${ii}].awardedBy required`,
        )
        if (r6.year !== undefined)
          must(
            typeof r6.year === 'number' && r6.year >= 1900 && r6.year <= 2100,
            `${here}.payload.items[${ii}].year must be year`,
          )
        const refs = Array.isArray(r6.sourceIds) ? (r6.sourceIds as unknown[]) : []
        for (const rid of refs)
          must(
            typeof rid === 'string' && sourceIds.has(rid),
            `${here}.payload.items[${ii}].sourceIds contains unknown ${String(rid)}`,
          )
        return {
          name: (r6.name as string).trim(),
          awardedBy: (r6.awardedBy as string).trim(),
          ...(r6.year !== undefined ? { year: r6.year as number } : {}),
          sourceIds: refs as string[],
        }
      })
      return { kind: 'awards', payload: { items } }
    }
    case 'publications': {
      must(Array.isArray(p.items), `${here}.payload.items must be array`)
      const items = (p.items as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.items[${ii}] must be object`)
        const r7 = it as Record<string, unknown>
        must(
          typeof r7.title === 'string' && r7.title.trim().length >= 3,
          `${here}.payload.items[${ii}].title required`,
        )
        must(
          typeof r7.venue === 'string' && r7.venue.trim().length >= 2,
          `${here}.payload.items[${ii}].venue required`,
        )
        if (r7.year !== undefined)
          must(
            typeof r7.year === 'number' && r7.year >= 1900 && r7.year <= 2100,
            `${here}.payload.items[${ii}].year must be year`,
          )
        if (r7.url !== undefined)
          must(
            typeof r7.url === 'string' && URL_RE.test(r7.url),
            `${here}.payload.items[${ii}].url must be URL`,
          )
        const refs = Array.isArray(r7.sourceIds) ? (r7.sourceIds as unknown[]) : []
        for (const rid of refs)
          must(
            typeof rid === 'string' && sourceIds.has(rid),
            `${here}.payload.items[${ii}].sourceIds contains unknown ${String(rid)}`,
          )
        return {
          title: (r7.title as string).trim(),
          venue: (r7.venue as string).trim(),
          ...(r7.year !== undefined ? { year: r7.year as number } : {}),
          ...(r7.url ? { url: r7.url as string } : {}),
          sourceIds: refs as string[],
        }
      })
      return { kind: 'publications', payload: { items } }
    }
    case 'gaps-detected': {
      must(Array.isArray(p.missing), `${here}.payload.missing must be array`)
      const missing = (p.missing as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.missing[${ii}] must be object`)
        const r8 = it as Record<string, unknown>
        must(
          typeof r8.field === 'string' && r8.field.length > 0,
          `${here}.payload.missing[${ii}].field required`,
        )
        must(
          typeof r8.reason === 'string' && r8.reason.length > 0,
          `${here}.payload.missing[${ii}].reason required`,
        )
        return { field: r8.field as string, reason: r8.reason as string }
      })
      return { kind: 'gaps-detected', payload: { missing } }
    }
  }
  // unreachable — switch above is exhaustive
  throw new JournalistValidationError(`${here}.kind not handled (unreachable)`)
}
