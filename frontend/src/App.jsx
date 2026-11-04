import { useState, useEffect } from 'react'
import Preloader from './components/Preloader'
import Nav from './components/Nav'
import Hero from './components/Hero'
import Logos from './components/Logos'
import Features from './components/Features'
import TrustBar from './components/TrustBar'
import HowItWorks from './components/HowItWorks'
import CtaSection from './components/CtaSection'
import Footer from './components/Footer'
import DashboardPage from './components/dashboard/DashboardPage'

const ENABLE_PRELOADER = false

function checkIsDashboard() {
  if (typeof window === 'undefined') return false
  return (
    window.location.hash === '#dashboard' ||
    window.location.pathname === '/dashboard' ||
    window.location.search.includes('view=dashboard')
  )
}

export default function App() {
  const [view, setView] = useState(() => (checkIsDashboard() ? 'dashboard' : 'landing'))

  // Listen to hash changes (back/forward browser buttons or direct links)
  useEffect(() => {
    const handleHashChange = () => {
      if (checkIsDashboard()) {
        setView('dashboard')
      } else if (window.location.hash === '' || window.location.hash === '#') {
        setView('landing')
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('popstate', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('popstate', handleHashChange)
    }
  }, [])

  // Toggle body class so CSS can lock scroll only on dashboard view
  useEffect(() => {
    if (view === 'dashboard') {
      document.body.classList.add('is-dashboard')
      document.documentElement.classList.add('is-dashboard')
    } else {
      document.body.classList.remove('is-dashboard')
      document.documentElement.classList.remove('is-dashboard')
    }
  }, [view])

  // Intersection observer for landing page reveal animations
  useEffect(() => {
    if (view !== 'landing') return

    const reveals = document.querySelectorAll('.reveal')
    const io = new IntersectionObserver(
      entries =>
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.1 }
    )
    reveals.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [view])

  const navigateToDashboard = (e) => {
    if (e && e.preventDefault) e.preventDefault()
    window.location.hash = 'dashboard'
    setView('dashboard')
  }

  const navigateToLanding = (e) => {
    if (e && e.preventDefault) e.preventDefault()
    window.location.hash = ''
    setView('landing')
  }

  if (view === 'dashboard') {
    return <DashboardPage onNavigateHome={navigateToLanding} />
  }

  return (
    <>
      {ENABLE_PRELOADER && <Preloader />}
      <Nav onGetEarlyAccess={navigateToDashboard} />
      <main>
        <Hero onGetEarlyAccess={navigateToDashboard} />
        <Logos />
        <Features />
        <TrustBar />
        <HowItWorks />
        <CtaSection onGetEarlyAccess={navigateToDashboard} />
      </main>
      <Footer />
    </>
  )
}
