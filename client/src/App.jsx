import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import ReportsTable from './pages/ReportsTable'
import MapView from './pages/MapView'
import ManagerCards from './pages/ManagerCards'
import ManagerDetail from './pages/ManagerDetail'
import WeeklyExport from './pages/WeeklyExport'
import Contractors from './pages/Contractors'
import DarkModeToggle from './components/DarkModeToggle'

export default function App() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const isDarkMode = localStorage.getItem('darkMode') === 'true'
    setIsDark(isDarkMode)
    document.documentElement.classList.toggle('dark', isDarkMode)
  }, [])

  const toggleDark = () => {
    const newDark = !isDark
    setIsDark(newDark)
    localStorage.setItem('darkMode', newDark)
    document.documentElement.classList.toggle('dark', newDark)
  }

  return (
    <Router>
      <div className="min-h-screen bg-white dark:bg-slate-950 transition-colors">
        {/* Navigation Bar */}
        <nav className="bg-blue-600 dark:bg-blue-900 text-white shadow-md">
          <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex gap-8">
              <Link to="/" className="font-bold text-lg hover:text-blue-100">
                📊 نظام التعديات
              </Link>
              <div className="flex items-center gap-4">
                <Link to="/" className="hover:text-blue-100 transition">لوحة رئيسية</Link>
                <Link to="/reports" className="hover:text-blue-100 transition">البلاغات</Link>
                <Link to="/contractors" className="hover:text-blue-100 transition">المقاولون</Link>
                <Link to="/map" className="hover:text-blue-100 transition">الخريطة</Link>
                <Link to="/managers" className="hover:text-blue-100 transition">المدراء</Link>
                <Link to="/export" className="hover:text-blue-100 transition">التصدير</Link>
              </div>
            </div>
            <DarkModeToggle isDark={isDark} toggle={toggleDark} />
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/reports" element={<ReportsTable />} />
            <Route path="/contractors" element={<Contractors />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/managers" element={<ManagerCards />} />
            <Route path="/managers/:managerId" element={<ManagerDetail />} />
            <Route path="/export" element={<WeeklyExport />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-gray-100 dark:bg-slate-900 text-center py-4 text-sm text-gray-600 dark:text-gray-400 mt-12">
          <p>نظام إدارة وتدقيق بلاغات التعديات • شركة المياه الوطنية • {new Date().getFullYear()}</p>
        </footer>
      </div>
    </Router>
  )
}
