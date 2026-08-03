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
 *   blocks/AlcaldeBox.jsx       AlcaldeBox (6 hooks · libel-aware copy)
 *   blocks/ReportajeBlockD.jsx  ReportajeBlockD
 *   blocks/GovernmentBlocks.jsx CoalitionRing · PromesasBlockD · DepartamentosBlockD
 *   blocks/FeedBlocks.jsx       PressBlockD · LiveContracts · ParticipaBlockD
 *
 * VERTICAL RHYTHM lives here, in the container's flex `gap` — NOT in the
 * blocks. Each block used to carry its own bottom margin and they had drifted
 * (18 / 16 / 22 / none), and the two that ended in a hairline instead sat flush
 * against the next block, one of them producing a double rule against
 * AlcaldeBox's own top border. A gap can't drift: a block that renders nothing
 * returns null, contributes no flex item, and leaves no hole. So blocks own
 * their INTERNAL spacing and the column owns the space between them.
 */
import { PALETTE, SANS } from './tokens'
import { EditorialMasthead, QuejaCTA } from './blocks/Masthead'
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

/** The one number that sets the column's vertical rhythm. */
export const BLOCK_GAP = 18

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
        display: 'flex',
        flexDirection: 'column',
        gap: BLOCK_GAP,
      }}
    >
      <EditorialMasthead now={now} />
      <QuejaCTA />
      <AlcaldeBox />
      <ReportajeBlockD />
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
