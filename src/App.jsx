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
import Promesas from './pages/Promesas'
import Metodologia from './pages/Metodologia'
import AvisoLegal from './pages/AvisoLegal'
import Ciudad from './pages/Ciudad'
import Hud from './variants/Hud'
import Briefing from './variants/Briefing'
import DirectionD from './variants/DirectionD'
import Chooser from './variants/Chooser'
import { VariantSwitcher } from './variants/VariantSwitcher'
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

function VariantA({ tweaks, updateTweaks, onOpenCmdK }) {
  const location = useLocation()
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
        <Topbar cityId={tweaks.city} crumb={crumb} onOpenCmdK={onOpenCmdK} />
        <div style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Overview cityId={tweaks.city} />} />
            <Route path="/ciudad" element={<Ciudad />} />
            <Route path="/quejas" element={<Quejas />} />
            <Route path="/cargos" element={<Cargos />} />
            <Route path="/presupuesto" element={<Presupuesto />} />
            <Route path="/plenos" element={<Plenos />} />
            <Route path="/datos" element={<Datos />} />
            <Route path="/promesas" element={<Promesas />} />
            <Route path="/metodologia" element={<Metodologia />} />
            <Route path="/aviso-legal" element={<AvisoLegal />} />
            <Route path="*" element={<Overview cityId={tweaks.city} />} />
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

  const onVariantB = location.pathname.startsWith('/hud')
  const onVariantC = location.pathname.startsWith('/briefing')
  const onVariantD = location.pathname === '/d' || location.pathname.startsWith('/d/')
  const onChooser = location.pathname === '/variants'
  const onVariantA = !onVariantB && !onVariantC && !onVariantD && !onChooser

  useEffect(() => {
    const darkActive = tweaks.dark && onVariantA
    document.documentElement.classList.toggle('dark', darkActive)
    return () => document.documentElement.classList.remove('dark')
  }, [tweaks.dark, onVariantA])

  useEffect(() => {
    const size = onVariantA
      ? tweaks.density === 'compact' ? '13.5px' : tweaks.density === 'spacious' ? '15px' : '14px'
      : '14px'
    document.documentElement.style.fontSize = size
  }, [tweaks.density, onVariantA])

  useEffect(() => {
    try {
      localStorage.setItem('cp:tweaks', JSON.stringify(tweaks))
    } catch {
      // ignore
    }
  }, [tweaks])

  const updateTweaks = (patch) => setTweaks((prev) => ({ ...prev, ...patch }))

  // Switcher theming: B is dark HUD; everything else uses the light chip.
  const switcherTheme = onVariantB ? 'dark' : 'light'

  if (onChooser) {
    return (
      <>
        <Chooser />
        <VariantSwitcher theme={switcherTheme} />
      </>
    )
  }

  if (onVariantB) {
    return (
      <>
        <Hud />
        <VariantSwitcher theme="dark" position="top-right-b" />
      </>
    )
  }

  if (onVariantC) {
    return (
      <>
        <Briefing />
        <VariantSwitcher theme="light" />
      </>
    )
  }

  if (onVariantD) {
    return (
      <>
        <DirectionD />
        <VariantSwitcher theme="dark" position="bottom-right-d" />
      </>
    )
  }

  return (
    <>
      <VariantA tweaks={tweaks} updateTweaks={updateTweaks} onOpenCmdK={() => setCmdK(true)} />
      <VariantSwitcher theme="light" />
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
