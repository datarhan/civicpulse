import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Sidebar, NAV } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { CmdK } from './components/CmdK'
import { TweaksPanel, TweaksButton } from './components/TweaksPanel'
import { SkipLink } from './components/SkipLink'
import { useHashScroll } from './hooks/useHashScroll'
import { useT } from './i18n'
import { PERIODISTAS_ENABLED, EFICIENCIA_ENABLED } from './flags'

// Route-level code-split. DirectionD is the landing page and carries
// Leaflet + CartoDB tile deps — lazy-loading drops initial JS to
// the shell + sidebar + topbar until the user actually navigates.
const DirectionD = lazy(() => import('./variants/DirectionD'))
const Quejas = lazy(() => import('./pages/Quejas'))
const QuejasDashboard = lazy(() => import('./pages/QuejasDashboard'))
const QuejaDetail = lazy(() => import('./pages/QuejaDetail'))
const Cargos = lazy(() => import('./pages/Cargos'))
const CargoDetalle = lazy(() => import('./pages/CargoDetalle'))
const Presupuesto = lazy(() => import('./pages/Presupuesto'))
const Eficiencia = EFICIENCIA_ENABLED ? lazy(() => import('./pages/Eficiencia')) : null
const Plenos = lazy(() => import('./pages/Plenos'))
const PlenoDetalle = lazy(() => import('./pages/PlenoDetalle'))
const Datos = lazy(() => import('./pages/Datos'))
const Empleo = lazy(() => import('./pages/Empleo'))
const EmpleoPublico = lazy(() => import('./pages/EmpleoPublico'))
const EmpleoDetalle = lazy(() => import('./pages/EmpleoDetalle'))
const Promesas = lazy(() => import('./pages/Promesas'))
const Departamentos = lazy(() => import('./pages/Departamentos'))
const DepartamentoDetalle = lazy(() => import('./pages/DepartamentoDetalle'))
const Hallazgos = lazy(() => import('./pages/Hallazgos'))
const Declaraciones = lazy(() => import('./pages/Declaraciones'))
const Laboratorio = lazy(() => import('./pages/Laboratorio'))
const Frontera = lazy(() => import('./pages/Frontera'))
const Metodologia = lazy(() => import('./pages/Metodologia'))
const LabHealth = lazy(() => import('./pages/LabHealth'))
const AvisoLegal = lazy(() => import('./pages/AvisoLegal'))
const Cambios = lazy(() => import('./pages/Cambios'))
const Nosotros = lazy(() => import('./pages/Nosotros'))
const About = lazy(() => import('./pages/About'))
const Reportajes = lazy(() => import('./pages/Reportajes'))
const ReconstruccionDana = lazy(() => import('./pages/reportajes/ReconstruccionDana'))
const InteligenciaTuristica = lazy(() => import('./pages/reportajes/InteligenciaTuristica'))
const BuildingCivicPulse = lazy(() => import('./pages/blog/BuildingCivicPulse'))
// /curator is dev-only — see vite-curator-plugin.js. The lazy import
// is gated below by `import.meta.env.MODE !== 'production'`. Production
// builds never reference Curator.jsx so the chunk is tree-shaken out.
const isDev = import.meta.env.MODE !== 'production'
const Curator = isDev ? lazy(() => import('./pages/Curator')) : null

// "Periodistas IA" flag lives in src/flags.js (leaf module) so pages and
// hooks can read it without importing the router. When disabled, the routes
// are absent so the chunks are tree-shaken out and any direct URL falls
// through to the catch-all redirect.
export { PERIODISTAS_ENABLED } from './flags'
const Agentes = PERIODISTAS_ENABLED ? lazy(() => import('./pages/Agentes')) : null
const AgenteReporte = PERIODISTAS_ENABLED ? lazy(() => import('./pages/AgenteReporte')) : null

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

function Loading() {
  const t = useT()
  return (
    <div style={{ padding: '40px 24px', color: 'var(--ink50)', fontSize: 13 }}>
      {t('common.loading')}
    </div>
  )
}

function InnerShell({ onOpenCmdK }) {
  const location = useLocation()
  const t = useT()
  const active = NAV.find((n) => location.pathname.startsWith(n.to))
  const crumb = active ? t(active.labelKey) : 'CivicPulse'
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Every fragment we publish lives on an inner route: the per-finding
  // permalinks on /hallazgos and the section anchors on /metodologia. The
  // landing has none, and it renders outside this shell.
  useHashScroll()

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sidebarOpen])

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <div
          className="cp-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar crumb={crumb} onOpenCmdK={onOpenCmdK} onOpenSidebar={() => setSidebarOpen(true)} />
        {/* The skip target sits BELOW the topbar, not on <main> — <main> wraps
            the topbar here, so landing on it would skip the sidebar only to
            drop the reader back at the breadcrumb and search. */}
        <div id="contenido" tabIndex={-1} style={{ flex: 1, minWidth: 0 }}>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/cargos" element={<Cargos />} />
              <Route path="/cargos/:slug" element={<CargoDetalle />} />
              <Route path="/presupuesto" element={<Presupuesto />} />
              {Eficiencia && <Route path="/eficiencia" element={<Eficiencia />} />}
              <Route path="/plenos" element={<Plenos />} />
              <Route path="/plenos/:id" element={<PlenoDetalle />} />
              <Route path="/datos" element={<Datos />} />
              <Route path="/empleo" element={<Empleo />} />
              <Route path="/empleo-publico" element={<EmpleoPublico />} />
              <Route path="/empleo/:id" element={<EmpleoDetalle />} />
              <Route path="/promesas" element={<Promesas />} />
              <Route path="/departamentos" element={<Departamentos />} />
              <Route path="/departamentos/:slug" element={<DepartamentoDetalle />} />
              <Route path="/hallazgos" element={<Hallazgos />} />
              <Route path="/declaraciones" element={<Declaraciones />} />
              <Route path="/quejas" element={<Quejas />} />
              <Route path="/quejas/dashboard" element={<QuejasDashboard />} />
              <Route path="/quejas/:id" element={<QuejaDetail />} />
              <Route path="/laboratorio" element={<Laboratorio />} />
              <Route path="/laboratorio/frontera" element={<Frontera />} />
              {Agentes && <Route path="/laboratorio/agentes" element={<Agentes />} />}
              {AgenteReporte && (
                <Route path="/laboratorio/agentes/:assignmentId" element={<AgenteReporte />} />
              )}
              <Route path="/lab-health" element={<LabHealth />} />
              <Route path="/cambios" element={<Cambios />} />
              {Curator && <Route path="/curator" element={<Curator />} />}
              <Route path="/nosotros" element={<Nosotros />} />
              <Route path="/about" element={<About />} />
              {/* Long-form data reportajes — indexed at /reportajes (in NAV); each pieza keeps
                  its figures frozen in its own JSON snapshot. */}
              <Route path="/reportajes" element={<Reportajes />} />
              <Route path="/reportajes/reconstruccion-dana" element={<ReconstruccionDana />} />
              <Route
                path="/reportajes/inteligencia-turistica"
                element={<InteligenciaTuristica />}
              />
              {/* English engineering blog post — unlisted (not in NAV), canonical home for HN/civic-tech. */}
              <Route path="/blog/building-civicpulse-with-ai" element={<BuildingCivicPulse />} />
              <Route path="/metodologia" element={<Metodologia />} />
              <Route path="/aviso-legal" element={<AvisoLegal />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
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

  if (onLanding) {
    return (
      <>
        <SkipLink />
        <Suspense fallback={<Loading />}>
          <DirectionD />
        </Suspense>
      </>
    )
  }

  return (
    <>
      <SkipLink />
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
