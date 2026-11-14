import { useState, useRef, useEffect, useMemo } from 'react'
import gsap from 'gsap'

export default function ProfitDailyChart({ liveProfit = 0 }) {
  const [activeBar, setActiveBar] = useState(null)
  const chartRef = useRef(null)
  const totalRef = useRef(null)

  // Dynamic 7-day rolling window ending on current calendar date (BUG-CHART-01 fix)
  const data = useMemo(() => {
    const days = []
    const now = new Date()
    const baseDaily = [380, 490, 420, 610, 580, 750]
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
      const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })

      let val = 0
      if (i === 0) {
        val = 820 + Math.round(Number(liveProfit) || 0)
      } else {
        val = baseDaily[6 - i] || 450
      }
      days.push({
        day: dayName,
        date: dateLabel,
        value: val,
        formatted: `RM ${val.toLocaleString('en-MY')}`,
        rate: i === 0 ? '+32%' : `+${(val % 20) + 5}%`
      })
    }
    return days
  }, [liveProfit])

  const maxVal = Math.max(1200, ...data.map(d => d.value * 1.2))
  const total = data.reduce((s, d) => s + d.value, 0)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (totalRef.current) totalRef.current.textContent = `RM ${total.toLocaleString('en-MY')} total`
      return
    }

    const ctx = gsap.context(() => {
      // 1. Animate total counter
      const counterObj = { val: 0 }
      gsap.to(counterObj, {
        val: total,
        duration: 1.2,
        ease: 'power3.out',
        onUpdate: () => {
          if (totalRef.current) {
            totalRef.current.textContent = `RM ${Math.round(counterObj.val).toLocaleString('en-MY')} total`
          }
        }
      })

      // 2. Animate bar pillars springing upwards
      gsap.fromTo(
        '.fg-bar-pillar',
        { scaleY: 0, transformOrigin: 'bottom center' },
        {
          scaleY: 1,
          duration: 0.85,
          stagger: 0.07,
          ease: 'back.out(1.4)'
        }
      )

      // 3. Staggered label reveal
      gsap.fromTo(
        '.fg-bar-label-group',
        { opacity: 0, y: 6 },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          stagger: 0.05,
          ease: 'power2.out',
          delay: 0.2
        }
      )
    }, chartRef)

    return () => ctx.revert()
  }, [total])

  const handleBarTap = (idx) => {
    setActiveBar(prev => (prev === idx ? null : idx))
  }

  return (
    <div className="fg-card" ref={chartRef}>
      <div className="fg-card__header">
        <div>
          <h2 className="fg-card__title">Daily Net Profit</h2>
          <p className="fg-card__subtitle">Cumulative daily net profit from store cashier sales</p>
        </div>
        <div className="fg-card__header-right">
          <span className="fg-card__stat-highlight" ref={totalRef}>
            RM {total.toLocaleString('en-MY')} total
          </span>
          <span className="fg-card__badge">Last 7 Days</span>
        </div>
      </div>

      <div className="fg-bar-chart-container">
        {/* Y Axis Labels */}
        <div className="fg-chart-y-axis">
          <span>1.2k</span>
          <span>800</span>
          <span>400</span>
          <span>0</span>
        </div>

        {/* Horizontal Guidelines */}
        <div className="fg-chart-gridlines">
          <div className="fg-chart-gridline"></div>
          <div className="fg-chart-gridline"></div>
          <div className="fg-chart-gridline"></div>
          <div className="fg-chart-gridline"></div>
        </div>

        {/* Bars */}
        <div className="fg-chart-body">
          {data.map((item, idx) => {
            const heightPercent = Math.round((item.value / maxVal) * 100)
            const isHovered = activeBar === idx

            return (
              <div
                key={item.date}
                className="fg-bar-col"
                role="button"
                tabIndex={0}
                aria-label={`${item.day}, ${item.date}: ${item.formatted}`}
                onMouseEnter={() => setActiveBar(idx)}
                onMouseLeave={() => setActiveBar(null)}
                onClick={() => handleBarTap(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleBarTap(idx)
                  }
                }}
              >
                <div
                  className="fg-chart-tooltip"
                  style={{
                    opacity: isHovered ? 1 : 0,
                    visibility: isHovered ? 'visible' : 'hidden',
                    transform: isHovered ? 'translateX(-50%) translateY(-10px)' : 'translateX(-50%) translateY(0)',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                >
                  <div className="fg-chart-tooltip__day">{item.day}, {item.date}</div>
                  <div className="fg-chart-tooltip__val">{item.formatted}</div>
                  <div className="fg-chart-tooltip__rate">{item.rate} profit</div>
                </div>

                <div
                  className={`fg-bar-pillar ${isHovered ? 'is-hovered' : ''}`}
                  style={{ height: `${heightPercent}%` }}
                >
                  <div className="fg-bar-pillar__glow"></div>
                </div>

                <div className="fg-bar-label-group">
                  <span className="fg-bar-day">{item.day}</span>
                  <span className="fg-bar-date">{item.date.split(' ')[1]}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
