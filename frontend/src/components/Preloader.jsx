import { useState, useEffect, useRef } from 'react'

const TOTAL_FRAMES = 30
const FPS = 10
const MS_PER_FRAME = 1000 / FPS

const phases = [
  { at: 15, text: 'Dispatching inventory route...' },
  { at: 45, text: 'Prioritizing FEFO stock batches...' },
  { at: 75, text: 'Syncing store telemetry...' },
  { at: 100, text: 'Arrived at hub.' },
]

export default function Preloader() {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Dispatching inventory route...')
  const [frame, setFrame] = useState(1)
  const [isHidden, setIsHidden] = useState(false)
  const [isMounted, setIsMounted] = useState(true)

  const isDismissedRef = useRef(false)
  const rafRef = useRef(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    // Check reduced motion
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const triggerHeroStagger = () => window.dispatchEvent(new Event('fg:preloader-done'))

    if (reduced) {
      setIsHidden(true)
      setIsMounted(false)
      triggerHeroStagger()
      return
    }

    // Check if user visited in this session (can be bypassed for testing by clearing or ?preview)
    const isSessionVisited = sessionStorage.getItem('fg_visited')
    if (isSessionVisited) {
      setIsHidden(true)
      setIsMounted(false)
      triggerHeroStagger()
      return
    }

    document.body.style.overflow = 'hidden'

    // 1. Sprite animation loop
    let currentFrame = 0
    let lastTime = performance.now()

    const animateSprite = (now) => {
      if (now - lastTime >= MS_PER_FRAME) {
        currentFrame = (currentFrame + 1) % TOTAL_FRAMES
        setFrame(currentFrame + 1)
        lastTime = now
      }
      if (!isDismissedRef.current) {
        rafRef.current = requestAnimationFrame(animateSprite)
      }
    }
    rafRef.current = requestAnimationFrame(animateSprite)

    // 2. Dismiss handler
    const dismiss = () => {
      if (isDismissedRef.current) return
      isDismissedRef.current = true

      clearInterval(intervalRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)

      setIsHidden(true)
      triggerHeroStagger()
      sessionStorage.setItem('fg_visited', '1')

      setTimeout(() => {
        document.body.style.overflow = ''
        setIsMounted(false)
      }, 1100)
    }

    // 3. Progress loop
    let currentProgress = 0
    intervalRef.current = setInterval(() => {
      if (isDismissedRef.current) return

      const delta = currentProgress < 85 ? (Math.random() < 0.65 ? 1 : 2) : 1
      currentProgress = Math.min(100, currentProgress + delta)
      setProgress(currentProgress)

      for (const p of phases) {
        if (currentProgress >= p.at) {
          setStatus(p.text)
        }
      }

      if (currentProgress >= 100) {
        clearInterval(intervalRef.current)
        setTimeout(() => {
          dismiss()
        }, 500)
      }
    }, 28)

    // Dismiss on click or Escape/Space key
    const onKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === ' ') {
        dismiss()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      clearInterval(intervalRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [])

  if (!isMounted) return null

  const paddedFrame = String(frame).padStart(2, '0')

  return (
    <div
      id="preloader"
      className={`preloader${isHidden ? ' is-hidden' : ''}`}
      aria-hidden={isHidden}
      onClick={() => {
        if (!isDismissedRef.current) {
          isDismissedRef.current = true
          setIsHidden(true)
          window.dispatchEvent(new Event('fg:preloader-done'))
          sessionStorage.setItem('fg_visited', '1')
          setTimeout(() => {
            document.body.style.overflow = ''
            setIsMounted(false)
          }, 600)
        }
      }}
    >
      <div className="preloader__ambient"></div>
      <div className="preloader__content">
        <div className="preloader__sprite-wrap" aria-hidden="true">
          <img
            id="preloader-sprite"
            className="preloader__sprite"
            src={`/sprite/sprite_${paddedFrame}.png`}
            alt=""
          />
        </div>
        <div className="preloader__status" id="preloader-status">
          {status}
        </div>
        <div className="preloader__bar">
          <div
            className="preloader__bar-fill"
            id="preloader-bar"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div className="preloader__counter">
          <span id="preloader-count">{progress}</span>%
        </div>
      </div>
    </div>
  )
}
