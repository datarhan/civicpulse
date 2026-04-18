import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import Scorecards from './pages/Scorecards'
import AskChat from './components/AskChat'

function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/scorecards" element={<Scorecards />} />
        </Routes>
      </main>
      <AskChat />
    </>
  )
}

export default App
