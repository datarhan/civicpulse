/**
 * The landing page's editorial column ("El Mirador") — composition root.
 *
 * Decomposed June 2026 from a single 1,045-line file into cohesive block
 * modules under ./blocks/ (same barrel discipline as components/journalist/
 * and pages/curator/). Every block was verbatim-sliced; the only deliberate
 * change was PromesasBlockD's inline party→hex ternary collapsing into the
 * canonical partyColor() (identical values).
 *
 *   blocks/Masthead.jsx         EditorialMasthead · QuejaCTA
 *   blocks/LeadStory.jsx        Kicker · LeadStory
 *   blocks/AlcaldeBox.jsx       AlcaldeBox (6 hooks · libel-aware copy)
 *   blocks/GovernmentBlocks.jsx CoalitionRing · PromesasBlockD · DepartamentosBlockD
 *   blocks/FeedBlocks.jsx       PressBlockD · LiveContracts · ParticipaBlockD
 */
import { PALETTE, SANS } from './tokens'
import { EditorialMasthead, QuejaCTA } from './blocks/Masthead'
import { LeadStory } from './blocks/LeadStory'
import { ReportajeBlockD } from './blocks/ReportajeBlockD'
import { AlcaldeBox } from './blocks/AlcaldeBox'
import { CoalitionRing, PromesasBlockD, DepartamentosBlockD } from './blocks/GovernmentBlocks'
import {
  PressBlockD,
  LiveContracts,
  ParticipaBlockD,
  EventsBlockD,
  EmpleoBlockD,
} from './blocks/FeedBlocks'

function EditorialColumn({ now }) {
  return (
    <aside
      style={{
        width: 420,
        flexShrink: 0,
        background: PALETTE.bg,
        borderLeft: '1px solid ' + PALETTE.hair,
        overflowY: 'auto',
        padding: '24px 26px',
        fontFamily: SANS,
        color: PALETTE.ink,
      }}
    >
      <EditorialMasthead now={now} />
      <QuejaCTA />
      <LeadStory />
      <ReportajeBlockD />
      <AlcaldeBox />
      <CoalitionRing />
      <PromesasBlockD />
      <DepartamentosBlockD />
      <PressBlockD />
      <LiveContracts />
      <EmpleoBlockD />
      <EventsBlockD />
      <ParticipaBlockD />
    </aside>
  )
}
export { EditorialColumn }
