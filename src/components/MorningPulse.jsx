import { useState, useEffect, useRef } from 'react'
import { morningPulse } from '../data/mockData'
import './MorningPulse.css'

function MorningPulse() {
  const [expanded, setExpanded] = useState(false)
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(true)
  const textRef = useRef(null)

  useEffect(() => {
    const text = morningPulse.summary
    let i = 0
    const timer = setInterval(() => {
      if (i <= text.length) {
        setDisplayedText(text.slice(0, i))
        i++
      } else {
        clearInterval(timer)
        setIsTyping(false)
      }
    }, 15)
    return () => clearInterval(timer)
  }, [])

  return (
    <section className="morning-pulse glass-card animate-fade-in animate-fade-in-delay-2" id="morning-pulse">
      <div className="morning-pulse__header">
        <div className="morning-pulse__badge">
          <span className="morning-pulse__badge-icon">🤖</span>
          <span>IA · Resumen Diario</span>
        </div>
        <span className="morning-pulse__date">{morningPulse.date}</span>
      </div>

      <h3 className="morning-pulse__headline">
        <span className="morning-pulse__headline-accent">📋</span>
        {morningPulse.headline}
      </h3>

      <div className="morning-pulse__body" ref={textRef}>
        <p className="morning-pulse__text">
          {displayedText}
          {isTyping && <span className="morning-pulse__cursor">|</span>}
        </p>
      </div>

      <div className="morning-pulse__actions">
        <button
          className="btn btn-ghost morning-pulse__expand"
          onClick={() => setExpanded(!expanded)}
          id="btn-expand-pulse"
        >
          {expanded ? '🔼 Ocultar resumen' : '📖 Leer resumen de 30 seg'}
        </button>
        <span className="morning-pulse__source">{morningPulse.source}</span>
      </div>

      {expanded && (
        <div className="morning-pulse__full animate-fade-in">
          <pre className="morning-pulse__full-text">{morningPulse.fullText}</pre>
        </div>
      )}
    </section>
  )
}

export default MorningPulse
