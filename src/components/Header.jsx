import { NavLink } from 'react-router-dom'
import './Header.css'

function Header() {
  return (
    <header className="header" id="main-header">
      <div className="header__inner container">
        <div className="header__brand">
          <div className="header__logo">
            <span className="header__logo-icon">🏛️</span>
            <div className="header__logo-pulse"></div>
          </div>
          <div className="header__title-group">
            <h1 className="header__title">CivicPulse</h1>
            <span className="header__subtitle">Riba-roja de Túria</span>
          </div>
        </div>
        <nav className="header__nav" id="main-nav">
          <NavLink to="/" className={({ isActive }) => `header__link ${isActive ? 'header__link--active' : ''}`} end>
            <span className="header__link-icon">📊</span>
            Monitor
          </NavLink>
          <NavLink to="/scorecards" className={({ isActive }) => `header__link ${isActive ? 'header__link--active' : ''}`}>
            <span className="header__link-icon">👤</span>
            Responsables
          </NavLink>
        </nav>
        <div className="header__actions">
          <div className="header__lang-toggle" id="lang-toggle">
            <button className="header__lang-btn header__lang-btn--active">ES</button>
            <button className="header__lang-btn">VA</button>
          </div>
          <div className="header__live-badge">
            <span className="status-dot status-dot--green"></span>
            EN VIVO
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
