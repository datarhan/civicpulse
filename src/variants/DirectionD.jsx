import StylizedMap from '../components/LiveCity/StylizedMap'
import LiveTicker from '../components/LiveTicker'
import { RIBA_ROJA_CENTER, PALETTE, SANS, useClock } from './direction-d/tokens'
import { Header } from './direction-d/Topbar'
import { LeftRail } from './direction-d/LeftRail'
import { EventTicker, MapAttribution } from './direction-d/MapOverlays'
import { EditorialColumn } from './direction-d/EditorialColumn'
import { KpiStrip } from './direction-d/KpiStrip'

export default function DirectionD() {
  const now = useClock(60000)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: PALETTE.bg,
        color: PALETTE.ink,
        fontFamily: SANS,
      }}
    >
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
      `}</style>

      <Header now={now} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }} className="d-root">
        <LeftRail />

        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <StylizedMap center={RIBA_ROJA_CENTER} />
          <LiveTicker />
          <EventTicker />
          <MapAttribution />
        </div>

        <EditorialColumn now={now} />
      </div>

      <KpiStrip />
    </div>
  )
}
