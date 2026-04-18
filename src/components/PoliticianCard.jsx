import { useState } from 'react'
import './PoliticianCard.css'

const STATUS_LABELS = {
  open: 'Abierta',
  in_progress: 'En progreso',
  fixed: 'Resuelta'
}

const STATUS_COLORS = {
  open: '#ef5350',
  in_progress: '#ffa726',
  fixed: '#00e676'
}

function PoliticianCard({ incident, politician, onClose }) {
  const [nudged, setNudged] = useState(false)

  if (!politician) return null

  const handleNudge = () => {
    setNudged(true)
    setTimeout(() => setNudged(false), 2000)
  }

  const initials = politician.name.split(' ').map(n => n[0]).join('')

  return (
    <div className="pol-card-overlay" onClick={onClose}>
      <div className="pol-card glass-card" onClick={e => e.stopPropagation()}>
        <button className="pol-card__close" onClick={onClose} aria-label="Cerrar">✕</button>

        {/* Issue Header */}
        <div className="pol-card__issue">
          <span className="pol-card__issue-status" style={{
            color: STATUS_COLORS[incident.status],
            borderColor: `${STATUS_COLORS[incident.status]}40`,
            background: `${STATUS_COLORS[incident.status]}15`
          }}>
            {STATUS_LABELS[incident.status]}
          </span>
          <h3 className="pol-card__issue-title">{incident.label}</h3>
          <span className="pol-card__issue-location">📍 {incident.location}</span>
        </div>

        <div className="pol-card__divider"></div>

        {/* Politician Profile */}
        <div className="pol-card__profile">
          <div className="pol-card__avatar" style={{ borderColor: politician.partyColor }}>
            <span className="pol-card__initials">{initials}</span>
          </div>
          <div className="pol-card__info">
            <h4 className="pol-card__name">{politician.name}</h4>
            <span className="pol-card__role">{politician.role}</span>
            <span className="pol-card__party" style={{ color: politician.partyColor }}>
              {politician.party}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="pol-card__stats">
          <div className="pol-card__stat">
            <span className="pol-card__stat-value" style={{
              color: politician.fixRate >= 80 ? 'var(--accent-green)' : politician.fixRate >= 60 ? 'var(--accent-amber)' : 'var(--accent-red)'
            }}>
              {politician.fixRate}%
            </span>
            <span className="pol-card__stat-label">Tasa de resolución</span>
          </div>
          <div className="pol-card__stat">
            <span className="pol-card__stat-value">{politician.avgResponseHours}h</span>
            <span className="pol-card__stat-label">Tiempo medio de respuesta</span>
          </div>
          <div className="pol-card__stat">
            <span className="pol-card__stat-value">{politician.resolved}/{politician.totalIssues}</span>
            <span className="pol-card__stat-label">Resueltas</span>
          </div>
        </div>

        {/* Fix rate bar */}
        <div className="pol-card__bar-wrap">
          <div className="pol-card__bar-track">
            <div
              className="pol-card__bar-fill"
              style={{
                width: `${politician.fixRate}%`,
                background: `linear-gradient(90deg, ${politician.partyColor}, ${politician.partyColor}aa)`
              }}
            ></div>
          </div>
          <span className="pol-card__bar-label">
            Este responsable resuelve el {politician.fixRate}% de las incidencias en 48 horas.
          </span>
        </div>

        {/* Action */}
        <button
          className={`btn btn-primary pol-card__nudge ${nudged ? 'pol-card__nudge--sent' : ''}`}
          onClick={handleNudge}
          id="btn-nudge"
        >
          {nudged ? '✅ ¡Recordatorio enviado!' : '📢 Enviar recordatorio'}
        </button>
      </div>
    </div>
  )
}

export default PoliticianCard
