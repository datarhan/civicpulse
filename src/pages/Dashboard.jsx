import VitalsBar from '../components/VitalsBar'
import MorningPulse from '../components/MorningPulse'
import CityMap from '../components/CityMap'
import RivalryMeter from '../components/RivalryMeter'
import './Dashboard.css'

function Dashboard() {
  return (
    <div className="dashboard container" id="dashboard-page">
      <div className="dashboard__hero">
        <div className="dashboard__hero-text">
          <h2 className="dashboard__hero-title animate-fade-in">
            Monitor Cívico <span className="dashboard__hero-accent">en Tiempo Real</span>
          </h2>
          <p className="dashboard__hero-description animate-fade-in animate-fade-in-delay-1">
            Estado de salud del municipio de Riba-roja de Túria. Datos actualizados cada 5 minutos.
          </p>
        </div>
        <div className="dashboard__hero-stats animate-fade-in animate-fade-in-delay-2">
          <div className="dashboard__stat-mini">
            <span className="dashboard__stat-mini-value">8</span>
            <span className="dashboard__stat-mini-label">Incidencias activas</span>
          </div>
          <div className="dashboard__stat-mini">
            <span className="dashboard__stat-mini-value">6</span>
            <span className="dashboard__stat-mini-label">Responsables</span>
          </div>
          <div className="dashboard__stat-mini">
            <span className="dashboard__stat-mini-value">88%</span>
            <span className="dashboard__stat-mini-label">Eficiencia</span>
          </div>
        </div>
      </div>
      <VitalsBar />
      <MorningPulse />
      <CityMap />
      <RivalryMeter />
    </div>
  )
}

export default Dashboard
