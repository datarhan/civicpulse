import { vitals } from '../data/mockData'
import './VitalsBar.css'

function VitalsBar() {
  return (
    <section className="vitals animate-fade-in" id="vitals-bar">
      <div className="vitals__card glass-card">
        <div className="vitals__icon-wrap" style={{ '--vital-color': vitals.airQuality.color }}>
          <span className="vitals__icon">🌬️</span>
          <div className="vitals__ring"></div>
        </div>
        <div className="vitals__info">
          <span className="vitals__label">Calidad del Aire</span>
          <div className="vitals__value-row">
            <span className="vitals__value" style={{ color: vitals.airQuality.color }}>
              {vitals.airQuality.aqi}
            </span>
            <span className="vitals__unit">AQI</span>
            <span className="badge" style={{
              background: `${vitals.airQuality.color}18`,
              color: vitals.airQuality.color,
              border: `1px solid ${vitals.airQuality.color}40`
            }}>
              <span className="status-dot status-dot--green"></span>
              {vitals.airQuality.label}
            </span>
          </div>
          <span className="vitals__source">{vitals.airQuality.source}</span>
        </div>
      </div>

      <div className="vitals__card glass-card animate-fade-in animate-fade-in-delay-1">
        <div className="vitals__icon-wrap" style={{ '--vital-color': vitals.safety.color }}>
          <span className="vitals__icon">🛡️</span>
          <div className="vitals__ring"></div>
        </div>
        <div className="vitals__info">
          <span className="vitals__label">Estado de Seguridad</span>
          <div className="vitals__value-row">
            <span className="vitals__value" style={{ color: vitals.safety.color }}>
              {vitals.safety.label}
            </span>
            <span className="badge" style={{
              background: `${vitals.safety.color}18`,
              color: vitals.safety.color,
              border: `1px solid ${vitals.safety.color}40`
            }}>
              <span className="status-dot status-dot--green"></span>
              {vitals.safety.incidents24h} incidencias 24h
            </span>
          </div>
        </div>
      </div>

      <div className="vitals__card glass-card animate-fade-in animate-fade-in-delay-2">
        <div className="vitals__icon-wrap" style={{ '--vital-color': vitals.metro.color }}>
          <span className="vitals__icon">🚇</span>
          <div className="vitals__ring"></div>
        </div>
        <div className="vitals__info">
          <span className="vitals__label">{vitals.metro.line}</span>
          <div className="vitals__value-row">
            <span className="vitals__value" style={{ color: vitals.metro.color }}>
              {vitals.metro.delay} {vitals.metro.unit}
            </span>
            <span className="vitals__unit">retraso</span>
            <span className="badge" style={{
              background: `${vitals.metro.color}18`,
              color: vitals.metro.color,
              border: `1px solid ${vitals.metro.color}40`
            }}>
              <span className="status-dot status-dot--amber"></span>
              Leve demora
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default VitalsBar
