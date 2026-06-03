// Journalist agent — editorial-longform UI primitives.
//
// Layout (responsive, CSS-grid; mobile fallback collapses to one column):
//
//   HERO BAND (full-width)
//   ─────────────────────────────────────────────────────────────
//   STICKY TOC (200px) │ MAIN CONTENT (1fr) │ STICKY FACTS (260px)
//   ─────────────────────────────────────────────────────────────
//   SOURCE LEDGER (full-width)
//
// All section components receive a section payload + a `sourceMap`
// (Map<sourceId, { src, num }>) so they can resolve citation pills
// without re-walking the sources array. The page-level <AgenteReporte/>
// hosts the layout grid and decides which sections feed into the main
// column vs. the sidebar.

// Decomposed in the journalist-agent refactor. This barrel re-exports the UI
// primitives from ./Citations, ./HeroBand, ./Navigation, ./Sections, and
// ./SourceLedger, and hosts the section dispatcher. Every existing import from
// '../components/journalist' keeps resolving unchanged.
import {
  AwardsList,
  CareerLadder,
  CareerTimeline,
  EducationList,
  FinancialPanel,
  GapsDetected,
  IdentityCard,
  LegalRecord,
  NarrativeBlock,
  OnlinePresenceRow,
  PortraitHeader,
  PressSparklineBlock,
  PromiseMiniBoard,
  PublicationsList,
  QuoteCard,
  RelationshipGraph,
} from './Sections'

export * from './Citations'
export * from './HeroBand'
export * from './Navigation'
export * from './Sections'
export * from './SourceLedger'

// ─── Section dispatcher ──────────────────────────────────────────────────

export function ReportSectionRenderer({ section, sourceMap }) {
  switch (section.kind) {
    case 'portrait':
      return <PortraitHeader />
    case 'identity':
      return <IdentityCard payload={section.payload} sourceMap={sourceMap} />
    case 'education':
      return <EducationList payload={section.payload} sourceMap={sourceMap} />
    case 'career-political':
      return (
        <CareerLadder
          payload={section.payload}
          sourceMap={sourceMap}
          label="Trayectoria política"
          openLabel="presente"
        />
      )
    case 'career-professional':
      return (
        <CareerLadder
          payload={section.payload}
          sourceMap={sourceMap}
          label="Trayectoria profesional"
          openLabel=""
        />
      )
    case 'legal-record':
      return <LegalRecord payload={section.payload} sourceMap={sourceMap} />
    case 'financial':
      return <FinancialPanel payload={section.payload} sourceMap={sourceMap} />
    case 'online-presence':
      return <OnlinePresenceRow payload={section.payload} sourceMap={sourceMap} />
    case 'awards':
      return <AwardsList payload={section.payload} sourceMap={sourceMap} />
    case 'publications':
      return <PublicationsList payload={section.payload} sourceMap={sourceMap} />
    case 'gaps-detected':
      return <GapsDetected payload={section.payload} />
    case 'narrative':
      return <NarrativeBlock payload={section.payload} sourceMap={sourceMap} />
    case 'timeline':
      return <CareerTimeline payload={section.payload} sourceMap={sourceMap} />
    case 'relationships':
      return <RelationshipGraph payload={section.payload} sourceMap={sourceMap} />
    case 'press-sparkline':
      return <PressSparklineBlock payload={section.payload} />
    case 'promise-board':
      return <PromiseMiniBoard payload={section.payload} />
    case 'quote-card':
      return <QuoteCard payload={section.payload} sourceMap={sourceMap} />
    default:
      return null
  }
}
