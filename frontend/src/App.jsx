import { useState, useEffect, useRef } from 'react'
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

const ENABLE_PRELOADER = true

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
  const [isTransitioningToDashboard, setIsTransitioningToDashboard] = useState(false)
  const transitionTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const handleHashChange = () => {
      if (checkIsDashboard()) {
        setView('dashboard')
        setIsTransitioningToDashboard(false)
      } else if (window.location.hash === '' || window.location.hash === '#') {
        setView('landing')
        setIsTransitioningToDashboard(false)
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('popstate', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('popstate', handleHashChange)
    }
  }, [])

  useEffect(() => {
    if (view === 'dashboard') {
      document.body.classList.add('is-dashboard')
      document.documentElement.classList.add('is-dashboard')
    } else {
      document.body.classList.remove('is-dashboard')
      document.documentElement.classList.remove('is-dashboard')
    }
  }, [view])

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

  const beginTransitionToDashboard = (e) => {
    if (e && e.preventDefault) e.preventDefault()

    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current)
    }

    if (ENABLE_PRELOADER) {
      // Show preloader first — it fires 'fg:preloader-done' when finished
      setIsTransitioningToDashboard(true)

      const onDone = () => {
        window.removeEventListener('fg:preloader-done', onDone)
        // Smoothly mount Dashboard underneath the dissolving preloader
        setView('dashboard')
        window.location.hash = 'dashboard'
      }
      window.addEventListener('fg:preloader-done', onDone)
    } else {
      setView('dashboard')
      window.location.hash = 'dashboard'
    }
  }

  const navigateToLanding = (e) => {
    if (e && e.preventDefault) e.preventDefault()
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current)
    }
    setIsTransitioningToDashboard(false)
    setView('landing')
    window.location.hash = ''
  }

  return (
    <>
      {view === 'dashboard' ? (
        <DashboardPage onNavigateHome={navigateToLanding} />
      ) : (
        <>
          <Nav onGetEarlyAccess={beginTransitionToDashboard} />
          <main>
            <Hero onGetEarlyAccess={beginTransitionToDashboard} />
            <Logos />
            <Features />
            <TrustBar />
            <HowItWorks />
            <CtaSection onGetEarlyAccess={beginTransitionToDashboard} />
          </main>
          <Footer />
        </>
      )}

      {/* Global Preloader — Stays on top of whichever view is active until exit dissolve completes */}
      {ENABLE_PRELOADER && isTransitioningToDashboard && (
        <Preloader
          label="Preparing FreshGuard dashboard..."
          onComplete={() => {
            setIsTransitioningToDashboard(false)
          }}
        />
      )}
    </>
  )
}
