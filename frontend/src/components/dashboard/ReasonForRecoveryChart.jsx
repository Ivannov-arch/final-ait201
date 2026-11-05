import { useState, useRef, useEffect } from 'react'
import gsap from 'gsap'

export default function ReasonForRecoveryChart() {
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const containerRef = useRef(null)
  const centerValRef = useRef(null)

  const items = [
    {
      label: 'Sales',
      percent: 65,
      color: '#1b9b55',
      weight: '806 kg',
      description: 'Dynamic Markdown & Cashier Sales'
    },
    {
      label: 'Food Bank',
      percent: 35,
      color: '#3b82f6',
      weight: '434 kg',
      description: 'Food Bank NGO Redistribution'
    }
  ]

  const radius = 70
  const circumference = 2 * Math.PI * radius // ~439.82
  const strokeWidth = 22

  // Calculate cumulative offsets
  let cumulativePercent = 0
  const segments = items.map((item, idx) => {
    const strokeDasharray = `${(item.percent / 100) * circumference} ${circumference}`
    const strokeDashoffset = -((cumulativePercent / 100) * circumference)
    cumulativePercent += item.percent

    return {
      ...item,
      idx,
      strokeDasharray,
      strokeDashoffset
    }
  })

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = gsap.context(() => {
      // 1. Center number count up (keeps static total benchmark)
      const counter = { val: 0 }
      gsap.to(counter, {
        val: 1240,
        duration: 1.15,
        ease: 'power3.out',
        onUpdate: () => {
          if (centerValRef.current) {
            centerValRef.current.textContent = Math.round(counter.val).toLocaleString('en-MY')
          }
        }
      })

      // 2. Rotate svg slightly on entry
      gsap.fromTo(
        '.fg-donut-svg',
        { rotate: -25, opacity: 0, scale: 0.95 },
        {
          rotate: 0,
          opacity: 1,
          scale: 1,
          duration: 0.85,
          ease: 'power3.out'
        }
      )

      // 3. Stagger legend items
      gsap.fromTo(
        '.fg-donut-legend-item',
        { opacity: 0, x: 10 },
        {
          opacity: 1,
          x: 0,
          duration: 0.5,
          stagger: 0.08,
          ease: 'power2.out',
          delay: 0.15
        }
      )
    }, containerRef)

    return () => ctx.revert()
  }, [])

  const toggleSelect = (idx) => {
    setHoveredIdx(prev => (prev === idx ? null : idx))
  }

  return (
    <div className="fg-card" ref={containerRef}>
      <div className="fg-card__header">
        <div>
          <h2 className="fg-card__title">Channel Action Breakdown</h2>
          <p className="fg-card__subtitle">Product salvage distribution: Sales vs. Food Bank</p>
        </div>
        <span className="fg-card__badge" style={{ background: '#eaf7ee', color: '#1b9b55' }}>
          2 Active Channels
        </span>
      </div>

      <div className="fg-donut-layout">
        {/* Donut Chart Visual */}
        <div
          className="fg-donut-wrapper"
          onClick={() => setHoveredIdx(null)}
          title={hoveredIdx !== null ? 'Click outside to reset' : undefined}
        >
          <svg className="fg-donut-svg" viewBox="0 0 200 200" aria-label="Channel Action Donut Chart" style={{ transformOrigin: 'center center' }}>
            {/* Background track */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="#edf5f0"
              strokeWidth={strokeWidth}
              style={{ pointerEvents: 'none' }}
            />

            {/* Slices: Highlight hovered segment with ring thickness + stroke offset, no layout shift */}
            {segments.map(seg => {
              const isHovered = hoveredIdx === seg.idx
              const isOtherHovered = hoveredIdx !== null && !isHovered
              return (
                <circle
                  key={seg.label}
                  cx="100"
                  cy="100"
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={isHovered ? strokeWidth + 6 : strokeWidth}
                  strokeDasharray={seg.strokeDasharray}
                  strokeDashoffset={isHovered ? seg.strokeDashoffset - 4 : seg.strokeDashoffset}
                  strokeLinecap="butt"
                  style={{
                    transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
                    cursor: 'pointer',
                    pointerEvents: 'stroke',
                    opacity: isOtherHovered ? 0.45 : 1,
                    filter: isHovered ? `drop-shadow(0 0 10px ${seg.color}77)` : 'none'
                  }}
                  onMouseEnter={() => setHoveredIdx(seg.idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSelect(seg.idx)
                  }}
                />
              )
            })}
          </svg>

          {/* Center text: perfectly proportioned, zero truncation */}
          <div
            className="fg-donut-center-text fg-donut-center-text--fixed"
            onClick={(e) => {
              e.stopPropagation()
              setHoveredIdx(null)
            }}
          >
            <div className="fg-donut-center-value-wrap">
              <span className="fg-donut-center-num" ref={centerValRef}>
                1,240
              </span>
              <span className="fg-donut-center-unit">kg</span>
            </div>
            <span className="fg-donut-center-label">
              {hoveredIdx !== null ? `${items[hoveredIdx].label} · ${items[hoveredIdx].percent}%` : 'Total Salvaged'}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="fg-donut-legend">
          {items.map((item, idx) => {
            const isHovered = hoveredIdx === idx
            return (
              <div
                key={item.label}
                role="button"
                tabIndex={0}
                className={`fg-donut-legend-item ${isHovered ? 'is-active' : ''}`}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => toggleSelect(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleSelect(idx)
                  }
                }}
              >
                <div className="fg-donut-legend-left">
                  <span
                    className="fg-donut-legend-dot"
                    style={{ backgroundColor: item.color }}
                  ></span>
                  <div>
                    <div className="fg-donut-legend-name" style={{ fontWeight: 700 }}>
                      {item.label}
                    </div>
                    <div className="fg-donut-legend-sub">{item.description}</div>
                  </div>
                </div>
                <div className="fg-donut-legend-right">
                  <span className="fg-donut-legend-pct" style={{ fontWeight: 800, color: item.color }}>
                    {item.percent}%
                  </span>
                  <span className="fg-donut-legend-wt">{item.weight}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
