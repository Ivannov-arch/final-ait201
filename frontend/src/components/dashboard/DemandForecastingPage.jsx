import { useState, useRef, useEffect } from 'react'
import gsap from 'gsap'

function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 0 }) {
  const nodeRef = useRef(null)
  const prevValRef = useRef(0)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (nodeRef.current) {
        nodeRef.current.textContent = `${prefix}${Number(value || 0).toLocaleString('en-MY', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        })}${suffix}`
      }
      return
    }

    const obj = { val: prevValRef.current }
    const tween = gsap.to(obj, {
      val: Number(value || 0),
      duration: 1.05,
      ease: 'power3.out',
      onUpdate: () => {
        if (nodeRef.current) {
          nodeRef.current.textContent = `${prefix}${obj.val.toLocaleString('en-MY', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
          })}${suffix}`
        }
      }
    })
    prevValRef.current = Number(value || 0)

    return () => tween.kill()
  }, [value, prefix, suffix, decimals])

  return (
    <span ref={nodeRef}>
      {prefix}
      {Number(value || 0).toLocaleString('en-MY', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      })}
      {suffix}
    </span>
  )
}

const FORECAST_DATABASE = {
  'Organic Spinach': {
    category: 'Vegetables',
    unit: 'kg',
    currentStock: 95, // Current on-hand stock
    maxScale: 150,
    points: [
      { label: 'Tomorrow', date: 'Nov 04', demand: 42, stockRemaining: 53, status: 'Sufficient Stock' },
      { label: 'Day After Tomorrow', date: 'Nov 05', demand: 38, stockRemaining: 15, status: 'Stock Running Low' },
      { label: 'Day 3', date: 'Nov 06', demand: 35, stockRemaining: 0, stockDeficit: 20, status: 'Out of Stock — Reorder Needed' }
    ],
    totalDemand: 115,
    reorderNeeded: true,
    reorderQty: 20
  },
  'Fresh Milk': {
    category: 'Dairy',
    unit: 'pack',
    currentStock: 110,
    maxScale: 150,
    points: [
      { label: 'Tomorrow', date: 'Nov 04', demand: 32, stockRemaining: 78, status: 'Stock Safe' },
      { label: 'Day After Tomorrow', date: 'Nov 05', demand: 30, stockRemaining: 48, status: 'Stock Safe' },
      { label: 'Day 3', date: 'Nov 06', demand: 28, stockRemaining: 20, status: 'Sufficient Stock' }
    ],
    totalDemand: 90,
    reorderNeeded: false,
    reorderQty: 0
  },
  'Cherry Tomato': {
    category: 'Vegetables',
    unit: 'kg',
    currentStock: 60,
    maxScale: 150,
    points: [
      { label: 'Tomorrow', date: 'Nov 04', demand: 35, stockRemaining: 25, status: 'Stock Running Low' },
      { label: 'Day After Tomorrow', date: 'Nov 05', demand: 32, stockRemaining: 0, stockDeficit: 7, status: 'Depleted Day After Tomorrow' },
      { label: 'Day 3', date: 'Nov 06', demand: 28, stockRemaining: 0, stockDeficit: 35, status: 'Stock Deficit' }
    ],
    totalDemand: 95,
    reorderNeeded: true,
    reorderQty: 35
  },
  'Brown Eggs': {
    category: 'Dairy',
    unit: 'pack',
    currentStock: 120,
    maxScale: 150,
    points: [
      { label: 'Tomorrow', date: 'Nov 04', demand: 28, stockRemaining: 92, status: 'Stock Safe' },
      { label: 'Day After Tomorrow', date: 'Nov 05', demand: 26, stockRemaining: 66, status: 'Stock Safe' },
      { label: 'Day 3', date: 'Nov 06', demand: 25, stockRemaining: 41, status: 'Stock Safe' }
    ],
    totalDemand: 79,
    reorderNeeded: false,
    reorderQty: 0
  },
  'Green Lettuce': {
    category: 'Vegetables',
    unit: 'kg',
    currentStock: 75,
    maxScale: 150,
    points: [
      { label: 'Tomorrow', date: 'Nov 04', demand: 36, stockRemaining: 39, status: 'Sufficient Stock' },
      { label: 'Day After Tomorrow', date: 'Nov 05', demand: 30, stockRemaining: 9, status: 'Almost Depleted' },
      { label: 'Day 3', date: 'Nov 06', demand: 26, stockRemaining: 0, stockDeficit: 17, status: 'Out of Stock — Reorder Needed' }
    ],
    totalDemand: 92,
    reorderNeeded: true,
    reorderQty: 17
  }
}

export default function DemandForecastingPage({ onToggleSidebar }) {
  const productKeys = Object.keys(FORECAST_DATABASE)

  const [selectedProduct, setSelectedProduct] = useState(productKeys[0])
  const [hasPredicted, setHasPredicted] = useState(true) // Show forecast immediately on load
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDayIdx, setSelectedDayIdx] = useState(0) // Default focus on Besok (Day 1)
  const [toastMessage, setToastMessage] = useState(null)

  const kpiRef = useRef(null)
  const svgRef = useRef(null)
  const toastRef = useRef(null)

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Toast animation
  useEffect(() => {
    if (!toastMessage || !toastRef.current) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const tween = gsap.fromTo(
      toastRef.current,
      { y: 24, opacity: 0, scale: 0.96 },
      { y: 0, opacity: 1, scale: 1, duration: 0.32, ease: 'power3.out' }
    )

    return () => tween.kill()
  }, [toastMessage])

  // KPI cards entrance stagger
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.fg-kpi-card',
        { y: 16, opacity: 0, scale: 0.98 },
        { y: 0, opacity: 1, scale: 1, duration: 0.55, stagger: 0.08, ease: 'power3.out' }
      )
    }, kpiRef)

    return () => ctx.revert()
  }, [selectedProduct, hasPredicted])

  // SVG Drawing & Dots Pop Animation
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!svgRef.current) return

    const ctx = gsap.context(() => {
      const stockLine = svgRef.current.querySelector('.fg-forecast-stock-line')
      const demandLine = svgRef.current.querySelector('.fg-forecast-demand-line')

      if (stockLine && stockLine.getTotalLength) {
        const len = Math.ceil(stockLine.getTotalLength()) || 800
        gsap.fromTo(
          stockLine,
          { strokeDasharray: len, strokeDashoffset: len },
          { strokeDashoffset: 0, duration: 1.05, ease: 'power2.out' }
        )
      }

      if (demandLine && demandLine.getTotalLength) {
        const len = Math.ceil(demandLine.getTotalLength()) || 800
        gsap.fromTo(
          demandLine,
          { strokeDashoffset: len },
          { strokeDashoffset: 0, duration: 1.05, ease: 'power2.out', delay: 0.08 }
        )
      }

      // Area fill fade in
      gsap.fromTo(
        '.fg-forecast-area',
        { opacity: 0 },
        { opacity: 1, duration: 0.8, delay: 0.35, ease: 'power2.out' }
      )

      // Data dots pop in with bounce
      gsap.fromTo(
        '.fg-forecast-dot-group',
        { scale: 0, transformOrigin: 'center center' },
        { scale: 1, duration: 0.45, stagger: 0.06, ease: 'back.out(1.5)', delay: 0.4 }
      )
    }, svgRef)

    return () => ctx.revert()
  }, [selectedProduct, hasPredicted])

  const handlePredict = () => {
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      setHasPredicted(true)
      setSelectedDayIdx(0)
      showToast(`✓ Stock forecast projection for "${selectedProduct}" updated!`)
    }, 300)
  }

  const data = FORECAST_DATABASE[selectedProduct] || FORECAST_DATABASE['Organic Spinach']
  const focusedPoint = data.points[selectedDayIdx] || data.points[0]

  // Find the first day stock hits zero
  const firstStockoutIdx = data.points.findIndex(p => p.stockRemaining === 0)
  const stockoutDayLabel = firstStockoutIdx >= 0 ? data.points[firstStockoutIdx].label : null

  // Chart Geometry Coordinates
  const chartW = 680
  const chartH = 210
  const padLeft = 52
  const padRight = 36
  const padTop = 20
  const padBottom = 170
  const plotW = chartW - padLeft - padRight
  const plotH = padBottom - padTop
  const maxVal = data.maxScale || 150

  const getY = (val) => padBottom - (val / maxVal) * plotH
  const getX = (index) => padLeft + (index / (data.points.length - 1)) * plotW

  // Points & SVG Paths
  const stockCoords = data.points.map((p, i) => ({ x: getX(i), y: getY(p.stockRemaining), val: p.stockRemaining }))
  const demandCoords = data.points.map((p, i) => ({ x: getX(i), y: getY(p.demand), val: p.demand }))

  const stockPath = `M ${stockCoords.map(c => `${c.x},${c.y}`).join(' L ')}`
  const demandPath = `M ${demandCoords.map(c => `${c.x},${c.y}`).join(' L ')}`

  const stockAreaPath = `${stockPath} L ${getX(data.points.length - 1)},${padBottom} L ${getX(0)},${padBottom} Z`

  return (
    <div className="fg-inv-root">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fg-fefo-toast" role="alert" ref={toastRef}>
          <div className="fg-fefo-toast__icon">✓</div>
          <span className="fg-fefo-toast__msg">{toastMessage}</span>
          <button type="button" className="fg-fefo-toast__close" onClick={() => setToastMessage(null)}>✕</button>
        </div>
      )}

      {/* Top Utility Bar */}
      <div className="fg-inv-topbar">
        {onToggleSidebar && (
          <button
            type="button"
            className="fg-header__mobile-menu-btn fg-inv-mobile-menu-btn"
            onClick={onToggleSidebar}
            aria-label="Toggle Navigation Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        <div className="fg-inv-topbar-right" style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            className="fg-inv-notify-btn"
            aria-label="Notifications"
            onClick={() => showToast('🔔 AI Demand Model active · Connected to store telemetry')}
          >
            <span className="fg-inv-notify-dot"></span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>

          <div className="fg-inv-user-chip" title="John Doe — Operations Lead">
            <div className="fg-inv-avatar-initials">JD</div>
            <span className="fg-inv-user-name">John Doe</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>

      {/* Integrated Header: Title on Left, Product Selector & Action on Right */}
      <div className="fg-inv-header" style={{ marginBottom: '1.4rem' }}>
        <div>
          <h1 className="fg-inv-title">Demand Forecasting & Replenishment</h1>
          <p className="fg-inv-subtitle">
            Projected stock demand over the next 3 days based on sell-through patterns. Click any point for day details.
          </p>
        </div>

        <div className="fg-inv-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <select
              value={selectedProduct}
              onChange={(e) => {
                setSelectedProduct(e.target.value)
                setSelectedDayIdx(0)
              }}
              aria-label="Select product"
              style={{
                width: '100%',
                padding: '0.45rem 1.8rem 0.45rem 0.95rem',
                borderRadius: '999px',
                border: '1px solid #d5e5db',
                fontSize: '0.82rem',
                fontFamily: 'inherit',
                color: '#195038',
                background: '#ffffff',
                outline: 'none',
                fontWeight: 700,
                cursor: 'pointer',
                minHeight: '38px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
              }}
            >
              {productKeys.map(prod => (
                <option key={prod} value={prod}>
                  {prod} — stock {FORECAST_DATABASE[prod]?.currentStock} {FORECAST_DATABASE[prod]?.unit}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="fg-inv-btn-primary"
            onClick={handlePredict}
            disabled={isLoading}
            style={{
              minHeight: '38px',
              padding: '0.4rem 1.15rem',
              fontSize: '0.82rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              borderRadius: '999px'
            }}
          >
            {isLoading ? (
              <span>Calculating...</span>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <span>Recalculate</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {hasPredicted && (
        <>
          {/* Key Decision Strip: Current Stock vs Total 3-Day Demand */}
          <div className="fg-kpi-grid" ref={kpiRef} style={{ marginBottom: '1.4rem' }}>
            {/* Current Stock Available Now */}
            <div className="fg-kpi-card">
              <div className="fg-kpi-card__header">
                <span className="fg-kpi-card__label">Current Stock</span>
                <span className="fg-kpi-card__delta-tag fg-kpi-card__delta-tag--neutral">Available</span>
              </div>
              <div className="fg-kpi-card__main">
                <span className="fg-kpi-card__value">
                  <AnimatedNumber value={data.currentStock} decimals={0} /> <small style={{ fontSize: '0.85rem', fontWeight: 600, color: '#688975' }}>{data.unit}</small>
                </span>
                <span className="fg-kpi-card__subtext">Units on floor and ready for sale</span>
              </div>
            </div>

            {/* Total 3-Day Demand */}
            <div className="fg-kpi-card">
              <div className="fg-kpi-card__header">
                <span className="fg-kpi-card__label">Total 3-Day Demand</span>
                <span className="fg-kpi-card__delta-tag fg-kpi-card__delta-tag--info">Forecast Sales</span>
              </div>
              <div className="fg-kpi-card__main">
                <span className="fg-kpi-card__value" style={{ color: '#1d4ed8' }}>
                  <AnimatedNumber value={data.totalDemand} decimals={0} /> <small style={{ fontSize: '0.85rem', fontWeight: 600, color: '#688975' }}>{data.unit}</small>
                </span>
                <span className="fg-kpi-card__subtext">Estimated cumulative customer demand over 3 days</span>
              </div>
            </div>

            {/* Stock Decision: Reorder Needed or Safe */}
            <div className="fg-kpi-card">
              <div className="fg-kpi-card__header">
                <span className="fg-kpi-card__label">Replenishment Decision</span>
                <span className={`fg-kpi-card__delta-tag ${data.reorderNeeded ? 'fg-kpi-card__delta-tag--danger' : 'fg-kpi-card__delta-tag--success'}`}>
                  {data.reorderNeeded ? 'Reorder Needed' : 'Stock Safe'}
                </span>
              </div>
              <div className="fg-kpi-card__main">
                <span className="fg-kpi-card__value" style={{ color: data.reorderNeeded ? '#dc2626' : '#147b43', fontSize: 'clamp(1.2rem, 1.6vw, 1.55rem)' }}>
                  {data.reorderNeeded ? (
                    <>
                      +<AnimatedNumber value={data.reorderQty} decimals={0} /> {data.unit}
                    </>
                  ) : (
                    'Adequate'
                  )}
                </span>
                <span className="fg-kpi-card__subtext">
                  {data.reorderNeeded
                    ? `Depleted on ${stockoutDayLabel || 'Day 3'}. Order ${data.reorderQty} ${data.unit} before tomorrow.`
                    : 'Sufficient inventory for 3 days. No replenishment required.'}
                </span>
              </div>
            </div>
          </div>


          {/* Interactive Chart Card */}
          <div
            className="fg-card"
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '1.2rem 1.4rem 1rem',
              boxShadow: '0 4px 20px rgba(12, 31, 21, 0.05)',
              border: '1px solid #e5efe8'
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: '0.9rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '7px',
                    background: '#eaf7ee',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1b9b55',
                    flexShrink: 0
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                    <polyline points="16 7 22 7 22 13" />
                  </svg>
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: '0.98rem',
                      fontWeight: 800,
                      color: '#0f172a',
                      margin: 0,
                      letterSpacing: '-0.01em'
                    }}
                  >
                    Stock Level vs. 3-Day Projected Demand
                  </h2>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Click any point or day badge for breakdown
                  </span>
                </div>
              </div>

              {/* Dual Legends */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: '#1b9b55' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#1b9b55', display: 'inline-block' }} />
                  <span>Remaining Stock</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: '#2563eb' }}>
                  <span style={{ width: 16, height: 0, borderTop: '2.5px dashed #2563eb', display: 'inline-block' }} />
                  <span>Projected Sales</span>
                </div>
              </div>
            </div>

            {/* SVG Line Chart — compact */}
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${chartW} ${chartH}`}
                style={{ width: '100%', height: 'auto', display: 'block', minWidth: '380px' }}
              >
                <defs>
                  <linearGradient id="stockAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1b9b55" stopOpacity="0.17" />
                    <stop offset="100%" stopColor="#1b9b55" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Gridlines */}
                {[150, 100, 50, 0].map(val => {
                  const y = getY(val)
                  return (
                    <g key={val}>
                      <text
                        x={padLeft - 10}
                        y={y + 4}
                        textAnchor="end"
                        fill="#94a3b8"
                        fontSize="10"
                        fontWeight="600"
                        fontFamily="inherit"
                      >
                        {val}
                      </text>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={chartW - padRight}
                        y2={y}
                        stroke={val === 0 ? '#cbd5e1' : '#f1f5f9'}
                        strokeWidth={val === 0 ? '1.5' : '1'}
                      />
                    </g>
                  )
                })}

                {/* Vertical hairline + column highlight on selected day */}
                {(() => {
                  const focusX = getX(selectedDayIdx)
                  return (
                    <g>
                      <rect
                        x={focusX - 36}
                        y={padTop}
                        width="72"
                        height={plotH}
                        fill="#1b9b55"
                        opacity="0.03"
                        rx="6"
                      />
                      <line
                        x1={focusX}
                        y1={padTop}
                        x2={focusX}
                        y2={padBottom}
                        stroke="#1b9b55"
                        strokeWidth="1.4"
                        strokeDasharray="4 4"
                        opacity="0.45"
                      />
                    </g>
                  )
                })()}

                {/* Area fill */}
                <path className="fg-forecast-area" d={stockAreaPath} fill="url(#stockAreaGrad)" />

                {/* Demand dashed line */}
                <path
                  className="fg-forecast-demand-line"
                  d={demandPath}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.2"
                  strokeDasharray="7 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Stock solid line */}
                <path
                  className="fg-forecast-stock-line"
                  d={stockPath}
                  fill="none"
                  stroke="#1b9b55"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Blue demand dots — no floating label */}
                {demandCoords.map((pt, i) => {
                  const isFocus = selectedDayIdx === i
                  return (
                    <g
                      key={`demand-dot-${i}`}
                      className="fg-forecast-dot-group"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedDayIdx(i)}
                    >
                      {isFocus && <circle cx={pt.x} cy={pt.y} r="9" fill="#2563eb" opacity="0.14" />}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isFocus ? 5.5 : 4}
                        fill="#2563eb"
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                    </g>
                  )
                })}

                {/* Green stock dots — no floating label */}
                {stockCoords.map((pt, i) => {
                  const isFocus = selectedDayIdx === i
                  const isZero = pt.val === 0
                  return (
                    <g
                      key={`stock-dot-${i}`}
                      className="fg-forecast-dot-group"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedDayIdx(i)}
                    >
                      {isFocus && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="11"
                          fill={isZero ? '#dc2626' : '#1b9b55'}
                          opacity="0.14"
                        />
                      )}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isFocus ? 7 : 5}
                        fill={isZero ? '#dc2626' : '#1b9b55'}
                        stroke="#ffffff"
                        strokeWidth="2.2"
                      />
                    </g>
                  )
                })}

                {/* X-Axis Labels */}
                {data.points.map((p, i) => {
                  const x = getX(i)
                  const isFocus = selectedDayIdx === i
                  return (
                    <g
                      key={`xlabel-${p.label}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedDayIdx(i)}
                    >
                      <rect
                        x={x - 44}
                        y={padBottom + 5}
                        width="88"
                        height="24"
                        rx="5"
                        fill={isFocus ? '#eaf7ee' : 'transparent'}
                      />
                      <text
                        x={x}
                        y={padBottom + 21}
                        textAnchor="middle"
                        fill={isFocus ? '#147b43' : '#475569'}
                        fontSize="11"
                        fontWeight={isFocus ? 800 : 600}
                        fontFamily="inherit"
                      >
                        {p.label}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>

            {/* Detail Info Card — below chart, replaces all floating dot labels */}
            {(() => {
              const p = focusedPoint
              const isZero = p.stockRemaining === 0
              const isLow = p.stockRemaining > 0 && p.stockRemaining < 20
              const statusColor = isZero ? '#dc2626' : isLow ? '#d97706' : '#1b9b55'
              const statusBg = isZero ? '#fef2f2' : isLow ? '#fffbeb' : '#f0fdf4'
              const statusBorder = isZero ? '#fecaca' : isLow ? '#fde68a' : '#bbf7d0'
              return (
                <div
                  style={{
                    marginTop: '0.9rem',
                    padding: '0.85rem 1rem',
                    borderRadius: '12px',
                    background: statusBg,
                    border: `1px solid ${statusBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.2rem',
                    flexWrap: 'wrap'
                  }}
                >
                  {/* Day badge */}
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 72 }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Day</span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{p.label}</span>
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{p.date}</span>
                  </div>

                  <div style={{ width: 1, height: 42, background: statusBorder, flexShrink: 0 }} />

                  {/* Stock Left */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Stock Left</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: statusColor }}>
                      {p.stockRemaining} <span style={{ fontSize: '0.74rem', fontWeight: 600 }}>{data.unit}</span>
                    </span>
                  </div>

                  <div style={{ width: 1, height: 42, background: statusBorder, flexShrink: 0 }} />

                  {/* Est. Sales */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Est. Sales</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#2563eb' }}>
                      {p.demand} <span style={{ fontSize: '0.74rem', fontWeight: 600 }}>{data.unit}</span>
                    </span>
                  </div>

                  <div style={{ width: 1, height: 42, background: statusBorder, flexShrink: 0 }} />

                  {/* Status */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Status</span>
                    <span
                      style={{
                        marginTop: '0.25rem',
                        display: 'inline-block',
                        padding: '0.2rem 0.65rem',
                        borderRadius: '999px',
                        background: statusColor + '18',
                        color: statusColor,
                        fontSize: '0.76rem',
                        fontWeight: 800,
                        border: `1px solid ${statusColor}30`
                      }}
                    >
                      {p.status}
                    </span>
                  </div>

                  {/* Stockout deficit if any */}
                  {p.stockDeficit > 0 && (
                    <>
                      <div style={{ width: 1, height: 42, background: statusBorder, flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Deficit</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#dc2626' }}>
                          -{p.stockDeficit} <span style={{ fontSize: '0.74rem', fontWeight: 600 }}>{data.unit}</span>
                        </span>
                      </div>
                    </>
                  )}

                  {/* Day nav pills */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.35rem' }}>
                    {data.points.map((dp, i) => (
                      <button
                        key={dp.label}
                        type="button"
                        onClick={() => setSelectedDayIdx(i)}
                        style={{
                          padding: '0.28rem 0.65rem',
                          borderRadius: '999px',
                          border: `1.5px solid ${selectedDayIdx === i ? statusColor : '#e2e8f0'}`,
                          background: selectedDayIdx === i ? statusColor : '#ffffff',
                          color: selectedDayIdx === i ? '#ffffff' : '#475569',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {dp.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </>
      )}
    </div>
  )
}
