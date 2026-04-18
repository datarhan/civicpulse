import { useEffect, useState } from 'react'
import { rivalry } from '../data/mockData'
import './RivalryMeter.css'

function RivalryMeter() {
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 400)
    return () => clearTimeout(timer)
  }, [])

  return (
    <section className="rivalry animate-fade-in animate-fade-in-delay-4" id="rivalry-meter">
      <div className="rivalry__header">
        <h2 className="rivalry__title"><span>🏆</span> Clasificación Municipal</h2>
        <span className="rivalry__subtitle">Eficiencia en resolución de incidencias</span>
      </div>

      <div className="rivalry__table glass-card">
        {rivalry.map((town, index) => {
          const isHome = town.name === 'Riba-roja de Túria'
          return (
            <div
              key={town.name}
              className={`rivalry__row ${isHome ? 'rivalry__row--home' : ''}`}
            >
              <div className="rivalry__position">
                <span className={`rivalry__medal ${index === 0 ? 'rivalry__medal--gold' : index === 1 ? 'rivalry__medal--silver' : ''}`}>
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                </span>
              </div>
              <div className="rivalry__town-info">
                <span className="rivalry__town-name">{town.name}</span>
                {town.trend && (
                  <span className="rivalry__trend">📈 {town.trend}</span>
                )}
              </div>
              <div className="rivalry__bar-section">
                <div className="rivalry__bar-track">
                  <div
                    className="rivalry__bar-fill"
                    style={{
                      width: animated ? `${town.efficiency}%` : '0%',
                      background: isHome
                        ? 'linear-gradient(90deg, var(--accent-cyan), #4df0ff)'
                        : index === 0
                          ? 'linear-gradient(90deg, #ffa726, #ffcc02)'
                          : 'linear-gradient(90deg, rgba(144, 164, 174, 0.3), rgba(144, 164, 174, 0.5))',
                      transitionDelay: `${index * 200}ms`
                    }}
                  ></div>
                </div>
                <span className={`rivalry__percentage ${isHome ? 'rivalry__percentage--home' : ''}`}>
                  {town.efficiency}%
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="rivalry__cta glass-card">
        <span className="rivalry__cta-icon">💡</span>
        <p className="rivalry__cta-text">
          ¡Arregla <strong>3 farolas más</strong> para superar a L'Eliana y llegar al primer puesto!
        </p>
      </div>
    </section>
  )
}

export default RivalryMeter
