import { useEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Sidebar, NAV } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { CmdK } from './components/CmdK'
import { TweaksPanel, TweaksButton } from './components/TweaksPanel'
import Overview from './pages/Overview'
import Quejas from './pages/Quejas'
import Cargos from './pages/Cargos'
import Presupuesto from './pages/Presupuesto'
import Plenos from './pages/Plenos'
import Datos from './pages/Datos'
import { DEFAULT_TWEAKS } from './data/mockData'

function loadTweaks() {
  try {
    const raw = localStorage.getItem('cp:tweaks')
    if (raw) return { ...DEFAULT_TWEAKS, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return DEFAULT_TWEAKS
}

export default function App() {
  const [tweaks, setTweaks] = useState(loadTweaks)
  const [cmdK, setCmdK] = useState(false)
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tweaks.dark)
  }, [tweaks.dark])

  useEffect(() => {
    const size =
      tweaks.density === 'compact' ? '13.5px' : tweaks.density === 'spacious' ? '15px' : '14px'
    document.documentElement.style.fontSize = size
  }, [tweaks.density])

  useEffect(() => {
    try {
      localStorage.setItem('cp:tweaks', JSON.stringify(tweaks))
    } catch {
      // ignore
    }
  }, [tweaks])

  const updateTweaks = (patch) => setTweaks((prev) => ({ ...prev, ...patch }))

  const active = NAV.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)))
  const crumb = active?.label || 'Overview'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        cityId={tweaks.city}
        persona={tweaks.persona}
        onPersona={(v) => updateTweaks({ persona: v })}
      />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar cityId={tweaks.city} crumb={crumb} onOpenCmdK={() => setCmdK(true)} />
        <div style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Overview cityId={tweaks.city} />} />
            <Route path="/quejas" element={<Quejas />} />
            <Route path="/cargos" element={<Cargos />} />
            <Route path="/presupuesto" element={<Presupuesto />} />
            <Route path="/plenos" element={<Plenos />} />
            <Route path="/datos" element={<Datos />} />
            <Route path="*" element={<Overview cityId={tweaks.city} />} />
          </Routes>
        </div>
      </main>

      {!tweaksOpen && <TweaksButton onOpen={() => setTweaksOpen(true)} />}
      <TweaksPanel
        open={tweaksOpen}
        onClose={() => setTweaksOpen(false)}
        state={tweaks}
        onChange={updateTweaks}
      />
      <CmdK open={cmdK} onOpen={() => setCmdK(true)} onClose={() => setCmdK(false)} />
    </div>
  )
}
