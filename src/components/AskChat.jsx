import { useState, useRef, useEffect } from 'react'
import { chatResponses } from '../data/mockData'
import './AskChat.css'

const MOCK_RESPONSES = [
  {
    q: '¿Por qué ya no recogen la basura los martes?',
    a: chatResponses.default.answer,
    source: chatResponses.default.source
  },
  {
    q: '¿Cuándo se arreglará la farola de la Avinguda?',
    a: 'La incidencia fue registrada el 16/03/2026 y asignada a la Concejala de Servicios Públicos, María Sánchez. Según el protocolo municipal (Ordenanza de Mantenimiento, Art. 12.3), las farolas fundidas tienen un plazo de reparación de **5 días hábiles**. Se espera la resolución para el 23/03/2026.',
    source: 'Registro de Incidencias Municipal · ribarroja.es/incidencias'
  },
  {
    q: '¿Qué se aprobó en el último pleno?',
    a: 'En el Pleno del 18/03/2026 se aprobaron 5 puntos: ampliación del Polígono Industrial (€2,1M), actualización de la ordenanza de ruido, plan de movilidad con 3 km de carril bici, convenio para nuevo centro de salud en Sector 14, y solicitudes de iluminación en Barrio de la Ermita.',
    source: 'Acta Pleno 18/03/2026 · ayuntamiento.ribarroja.es'
  }
]

function AskChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isTyping])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSend = () => {
    if (!input.trim()) return

    const userMsg = input.trim()
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setInput('')
    setIsTyping(true)

    // Find a matching response or use the default
    const match = MOCK_RESPONSES.find(r =>
      userMsg.toLowerCase().includes('basura') || userMsg.toLowerCase().includes('martes')
        ? r.q.includes('basura')
        : userMsg.toLowerCase().includes('farola') || userMsg.toLowerCase().includes('luz')
          ? r.q.includes('farola')
          : userMsg.toLowerCase().includes('pleno') || userMsg.toLowerCase().includes('aprobó')
            ? r.q.includes('pleno')
            : false
    ) || MOCK_RESPONSES[0]

    setTimeout(() => {
      setIsTyping(false)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: match.a, source: match.source }
      ])
    }, 1500)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSuggestion = (q) => {
    setInput(q)
    setTimeout(() => handleSend(), 100)
  }

  return (
    <>
      {/* Floating button */}
      <button
        className={`chat-fab ${isOpen ? 'chat-fab--open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        id="btn-chat-fab"
        aria-label="Preguntar a Riba-roja"
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="chat-panel glass-card" id="chat-panel">
          <div className="chat-panel__header">
            <div className="chat-panel__title-group">
              <h3 className="chat-panel__title">Pregunta a Riba-roja</h3>
              <span className="chat-panel__subtitle">IA · Base de datos municipal</span>
            </div>
            <span className="chat-panel__ai-badge">🤖 IA</span>
          </div>

          <div className="chat-panel__messages">
            {messages.length === 0 && (
              <div className="chat-panel__welcome">
                <span className="chat-panel__welcome-icon">🏛️</span>
                <p>Pregunta cualquier cosa sobre el municipio de Riba-roja. La IA buscará en documentos oficiales.</p>
                <div className="chat-panel__suggestions">
                  {MOCK_RESPONSES.map((r, i) => (
                    <button
                      key={i}
                      className="chat-panel__suggestion"
                      onClick={() => {
                        setInput(r.q)
                      }}
                    >
                      {r.q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-msg--${msg.role}`}>
                <div className="chat-msg__bubble">
                  <p>{msg.text}</p>
                  {msg.source && (
                    <span className="chat-msg__source">📎 {msg.source}</span>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="chat-msg chat-msg--assistant">
                <div className="chat-msg__bubble chat-msg__typing">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="chat-panel__input-area">
            <input
              ref={inputRef}
              type="text"
              className="chat-panel__input"
              placeholder="Escribe tu pregunta..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              id="chat-input"
            />
            <button
              className="chat-panel__send"
              onClick={handleSend}
              disabled={!input.trim()}
              id="btn-chat-send"
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default AskChat
