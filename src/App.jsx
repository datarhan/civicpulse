import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Sidebar, NAV } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { CmdK } from './components/CmdK'
import { TweaksPanel, TweaksButton } from './components/TweaksPanel'
import Quejas from './pages/Quejas'
import Cargos from './pages/Cargos'
import Presupuesto from './pages/Presupuesto'
import Plenos from './pages/Plenos'
import Datos from './pages/Datos'
import Promesas from './pages/Promesas'
import Metodologia from './pages/Metodologia'
import AvisoLegal from './pages/AvisoLegal'
import DirectionD from './variants/DirectionD'

const DEFAULT_TWEAKS = { dark: false, density: 'comfortable' }

function loadTweaks() {
  try {
    const raw = localStorage.getItem('cp:tweaks')
    if (raw) return { ...DEFAULT_TWEAKS, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return DEFAULT_TWEAKS
}

function InnerShell({ onOpenCmdK }) {
  const location = useLocation()
  const active = NAV.find((n) => location.pathname.startsWith(n.to))
  const crumb = active?.label || 'CivicPulse'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar crumb={crumb} onOpenCmdK={onOpenCmdK} />
        <div style={{ flex: 1 }}>
          <Routes>
            <Route path="/cargos" element={<Cargos />} />
            <Route path="/presupuesto" element={<Presupuesto />} />
            <Route path="/plenos" element={<Plenos />} />
            <Route path="/datos" element={<Datos />} />
            <Route path="/promesas" element={<Promesas />} />
            <Route path="/quejas" element={<Quejas />} />
            <Route path="/metodologia" element={<Metodologia />} />
            <Route path="/aviso-legal" element={<AvisoLegal />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  const [tweaks, setTweaks] = useState(loadTweaks)
  const [cmdK, setCmdK] = useState(false)
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const location = useLocation()

  const onLanding = location.pathname === '/'

  useEffect(() => {
    const darkActive = tweaks.dark && !onLanding
    document.documentElement.classList.toggle('dark', darkActive)
    return () => document.documentElement.classList.remove('dark')
  }, [tweaks.dark, onLanding])

  useEffect(() => {
    const size = !onLanding
      ? tweaks.density === 'compact'
        ? '13.5px'
        : tweaks.density === 'spacious'
        ? '15px'
        : '14px'
      : '14px'
    document.documentElement.style.fontSize = size
  }, [tweaks.density, onLanding])

  useEffect(() => {
    try {
      localStorage.setItem('cp:tweaks', JSON.stringify(tweaks))
    } catch {
      // ignore
    }
  }, [tweaks])

  const updateTweaks = (patch) => setTweaks((prev) => ({ ...prev, ...patch }))

  if (onLanding) return <DirectionD />

  return (
    <>
      <InnerShell onOpenCmdK={() => setCmdK(true)} />
      {!tweaksOpen && <TweaksButton onOpen={() => setTweaksOpen(true)} />}
      <TweaksPanel
        open={tweaksOpen}
        onClose={() => setTweaksOpen(false)}
        state={tweaks}
        onChange={updateTweaks}
      />
      <CmdK open={cmdK} onOpen={() => setCmdK(true)} onClose={() => setCmdK(false)} />
    </>
  )
}
