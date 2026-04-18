import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ic } from './Icons'
import { Pill } from './Primitives'
import { NAV } from './Sidebar'
import { DEPTS, PROMISES } from '../data/mockData'

export function CmdK({ open, onClose, onOpen }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const all = [
    ...NAV.map((n) => ({ kind: 'Página', label: n.label, to: n.to, icon: n.icon })),
    ...DEPTS.map((d) => ({ kind: 'Departamento', label: d.name, sub: d.lead, to: '/cargos', icon: Ic.people })),
    { kind: 'Acción', label: 'Reportar nueva queja', icon: Ic.plus },
    { kind: 'Acción', label: 'Exportar datos abiertos', icon: Ic.chart },
    ...PROMISES.slice(0, 3).map((p) => ({ kind: 'Promesa', label: p.text, sub: p.owner, to: '/cargos', icon: Ic.check })),
  ]
  const filtered = q ? all.filter((x) => (x.label + ' ' + (x.sub || '')).toLowerCase().includes(q.toLowerCase())) : all

  useEffect(() => {
    if (open) setQ('')
  }, [open])

  useEffect(() => {
    const onK = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        open ? onClose() : onOpen()
      }
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onK)
    return () => window.removeEventListener('keydown', onK)
  }, [open, onClose, onOpen])

  if (!open) return null

  const go = (to) => {
    if (to) navigate(to)
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,15,25,.40)',
        backdropFilter: 'blur(4px)',
        zIndex: 50,
        display: 'grid',
        placeItems: 'start center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--paper)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,.25)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border2)',
          }}
        >
          <Ic.search width={16} height={16} style={{ color: 'var(--ink50)' }} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Saltar a…"
            style={{
              flex: 1,
              border: 0,
              outline: 0,
              background: 'transparent',
              color: 'var(--ink)',
              fontSize: 15,
              fontFamily: 'inherit',
            }}
          />
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink40)' }}>
            esc
          </span>
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: '6px 6px 10px' }}>
          {filtered.slice(0, 12).map((x, i) => (
            <button
              key={i}
              onClick={() => go(x.to)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '9px 10px',
                borderRadius: 7,
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--soft)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <x.icon width={16} height={16} style={{ color: 'var(--ink50)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {x.label}
                </div>
                {x.sub && <div style={{ fontSize: 11.5, color: 'var(--ink50)' }}>{x.sub}</div>}
              </div>
              <Pill tone="ghost" size="xs">
                {x.kind}
              </Pill>
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink50)', fontSize: 13 }}>
              Sin resultados para "{q}"
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
