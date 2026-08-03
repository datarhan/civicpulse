import StylizedMap from '../components/LiveCity/StylizedMap'
import LiveTicker from '../components/LiveTicker'
import { RIBA_ROJA_CENTER, PALETTE, SANS, useClock } from './direction-d/tokens'
import { Header } from './direction-d/Topbar'
import { LeftRail } from './direction-d/LeftRail'
import { EventTicker } from './direction-d/MapOverlays'
import { EditorialColumn } from './direction-d/EditorialColumn'
import { KpiStrip } from './direction-d/KpiStrip'
import { useT } from '../i18n'

/** Below this width the side-by-side shell stops working and the panes stack. */
export const STACK_BREAKPOINT = 1024

export default function DirectionD() {
  const now = useClock(60000)
  const t = useT()

  return (
    <div
      className="d-shell"
      style={{
        background: PALETTE.bg,
        color: PALETTE.ink,
        fontFamily: SANS,
      }}
    >
      {/*
        Layout lives here rather than in inline styles because it has to change
        at a breakpoint, and inline styles can't hold a media query — they also
        outrank any class, so the responsive properties have to be absent from
        the JSX for the rules below to apply at all.

        Colours are interpolated from PALETTE so there is exactly one source of
        truth; a hard-coded copy in index.css would drift the first time a token
        moved. (tests/e2e/landing-responsive.spec.ts pins the behaviour.)

        WHY the breakpoint exists: on desktop this is a fixed, full-viewport app
        shell — map and editorial column side by side, each scrolling
        internally. That model has no small-screen story. The column was a hard
        `width: 420 / flex-shrink: 0` at every size, so the map was squeezed to
        292px at 768, 124px at 600, and 0px at 430 — where 46px of the column
        was also clipped, and 101px at 375, with no horizontal scroll to reach
        it. The mobile e2e passed throughout because it asserts "no horizontal
        scroll", which is precisely what the clipping produced.
      */}
      <style>{`
        @keyframes ribaPulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
        .d-root .leaflet-container { background: #0B0F19; }
        .d-root .leaflet-control-zoom { display: none; }
        .d-root .leaflet-tooltip {
          background: rgba(14,20,34,.9);
          color: white;
          border: 1px solid rgba(96,165,250,.25);
          box-shadow: 0 4px 10px rgba(0,0,0,.4);
        }
        .d-root .leaflet-tooltip-top::before { border-top-color: rgba(14,20,34,.9); }

        /*
          height:100vh in NORMAL FLOW, not position:fixed. Visually identical —
          it is the only thing on the page, so a fixed inset:0 box and a
          full-height flow box occupy the same rectangle — but the fixed version
          left <body> at height 0, and axe's color-contrast rule refuses to
          resolve a background stack through that. The result: the landing
          reported "no contrast violations" while evaluating ZERO nodes, for
          every route audit this project has run. Comparable pages get hundreds
          of checks. a11y.spec.ts now fails if that count collapses again.
        */
        .d-shell { height: 100vh; display: flex; flex-direction: column; }
        .d-topbar { height: 54px; }
        .d-brand { min-width: 0; }
        .cp-livestrip { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .d-root { flex: 1; display: flex; min-height: 0; }
        .d-rail {
          width: 56px; flex-shrink: 0;
          display: flex; flex-direction: column; align-items: center;
          padding: 12px 0; gap: 4px;
          background: ${PALETTE.paper};
          border-right: 1px solid ${PALETTE.hair};
        }
        .d-rail-sep { width: 22px; height: 1px; margin: 6px 0; }
        .d-kpi { height: 76px; }
        .d-kpi-cell { flex: 1; min-width: 0; }
        .d-main { flex: 1; display: flex; min-width: 0; min-height: 0; }
        /* Clips the absolutely-positioned overlays (ticker marquee, event
           strip) to the pane. Without it the marquee — two chip lists
           back to back, deliberately wider than the screen — escapes and drags
           the document sideways once the shell is no longer a clipping box. */
        .d-mappane { flex: 1; position: relative; min-width: 0; overflow: hidden; }
        .d-editorial {
          width: 420px; flex-shrink: 0; overflow-y: auto;
          padding: 24px 26px;
          border-left: 1px solid ${PALETTE.hair};
        }

        @media (max-width: ${STACK_BREAKPOINT - 1}px) {
          /* The page scrolls as one document instead of two panes scrolling
             inside a viewport too small to hold them.

             The shell sets NO overflow, here or in the base rule, and that is
             load-bearing: any value other than visible makes it a scroll
             container, and axe's color-contrast rule then evaluates ZERO nodes
             inside it — the blind spot this work exists to close. Clipping only
             the x-axis is not an escape hatch either; per CSS Overflow §3 a
             visible axis paired with a clipped one computes to auto. Overflow
             is contained at its own sources instead: the map pane clips the
             ticker, the live strip and the KPI strip scroll themselves. */
          .d-shell { height: auto; min-height: 100vh; }
          .d-topbar {
            height: auto; min-height: 54px;
            flex-wrap: wrap; padding: 8px 14px; row-gap: 8px; column-gap: 12px;
          }
          .d-brand { flex-wrap: wrap; }
          .cp-livestrip { max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .d-root { flex-direction: column; min-height: 0; }
          .d-rail {
            width: 100%; flex-direction: row; justify-content: flex-start;
            overflow-x: auto; padding: 8px 12px; gap: 8px;
            border-right: none; border-bottom: 1px solid ${PALETTE.hair};
            -webkit-overflow-scrolling: touch;
          }
          .d-rail-sep { width: 1px; height: 22px; margin: 0 6px; }
          .d-main { flex-direction: column; }
          /* Enough map to be a map, not so much that it buries the column. */
          .d-mappane { flex: none; height: 52vh; min-height: 300px; }
          .d-editorial {
            width: auto; overflow-y: visible;
            padding: 20px 18px;
            border-left: none; border-top: 1px solid ${PALETTE.hair};
          }
          .d-kpi { height: auto; overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .d-kpi-cell { flex: 0 0 auto; min-width: 150px; }
        }

        @media (max-width: 560px) {
          .d-mappane { height: 44vh; min-height: 260px; }
          .d-region { display: none; }
        }
      `}</style>

      <Header now={now} />

      <div className="d-root">
        <LeftRail />

        {/*
          The landing route bypasses InnerShell, which is where the app's only
          <main> lived — so the homepage had no main landmark at all, and the
          skip link had nothing to target. Content outside any landmark was
          also what tripped axe's `region` rule (5 nodes).
        */}
        <main id="contenido" tabIndex={-1} className="d-main" aria-label={t('a11y.mainLabel')}>
          <div className="d-mappane">
            <StylizedMap center={RIBA_ROJA_CENTER} />
            <LiveTicker />
            <EventTicker />
          </div>

          <EditorialColumn now={now} />
        </main>
      </div>

      <KpiStrip />
    </div>
  )
}
