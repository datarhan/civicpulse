import { politicians } from '../data/mockData'
import './Scorecards.css'

function Scorecards() {
  return (
    <div className="scorecards container" id="scorecards-page">
      <div className="scorecards__header animate-fade-in">
        <h2 className="scorecards__title">
          <span>👤</span> Fichas de Responsables
        </h2>
        <p className="scorecards__subtitle">
          Rendimiento de los concejales del Ayuntamiento de Riba-roja de Túria
        </p>
      </div>

      <div className="scorecards__grid">
        {politicians.map((pol, idx) => {
          const initials = pol.name.split(' ').map(n => n[0]).join('')
          const rateColor = pol.fixRate >= 80
            ? 'var(--accent-green)'
            : pol.fixRate >= 60
              ? 'var(--accent-amber)'
              : 'var(--accent-red)'

          return (
            <div
              key={pol.id}
              className={`scorecard glass-card animate-fade-in`}
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              {/* Header with party strip */}
              <div className="scorecard__party-strip" style={{ background: pol.partyColor }}></div>

              <div className="scorecard__top">
                <div className="scorecard__avatar" style={{ borderColor: pol.partyColor }}>
                  <span className="scorecard__initials">{initials}</span>
                </div>
                <div className="scorecard__identity">
                  <h3 className="scorecard__name">{pol.name}</h3>
                  <span className="scorecard__role">{pol.role}</span>
                  <span className="scorecard__party-badge" style={{
                    color: pol.partyColor,
                    background: `${pol.partyColor}15`,
                    border: `1px solid ${pol.partyColor}40`
                  }}>
                    {pol.party}
                  </span>
                </div>
              </div>

              {/* Fix Rate Gauge */}
              <div className="scorecard__gauge">
                <div className="scorecard__gauge-circle">
                  <svg viewBox="0 0 100 100" className="scorecard__gauge-svg">
                    <circle
                      cx="50" cy="50" r="42"
                      fill="none" stroke="rgba(255,255,255,0.04)"
                      strokeWidth="6"
                    />
                    <circle
                      cx="50" cy="50" r="42"
                      fill="none"
                      stroke={rateColor}
                      strokeWidth="6"
                      strokeDasharray={`${pol.fixRate * 2.64} 264`}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                      style={{ transition: 'stroke-dasharray 1.5s var(--ease-out)' }}
                    />
                  </svg>
                  <div className="scorecard__gauge-value">
                    <span style={{ color: rateColor }}>{pol.fixRate}%</span>
                    <span className="scorecard__gauge-label">Resueltas</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="scorecard__stats">
                <div className="scorecard__stat-item">
                  <span className="scorecard__stat-icon">⏱️</span>
                  <div>
                    <span className="scorecard__stat-val">{pol.avgResponseHours}h</span>
                    <span className="scorecard__stat-lbl">Tiempo medio</span>
                  </div>
                </div>
                <div className="scorecard__stat-item">
                  <span className="scorecard__stat-icon">📋</span>
                  <div>
                    <span className="scorecard__stat-val">{pol.totalIssues}</span>
                    <span className="scorecard__stat-lbl">Total asignadas</span>
                  </div>
                </div>
                <div className="scorecard__stat-item">
                  <span className="scorecard__stat-icon">✅</span>
                  <div>
                    <span className="scorecard__stat-val">{pol.resolved}</span>
                    <span className="scorecard__stat-lbl">Resueltas</span>
                  </div>
                </div>
              </div>

              <button className="btn btn-ghost scorecard__action" id={`btn-view-${pol.id}`}>
                Ver perfil completo →
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Scorecards
