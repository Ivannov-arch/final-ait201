import { useState, useRef, useEffect, useMemo } from 'react'
import DashboardHeader from './DashboardHeader'
import defaultForecastData from '../../data/generatedProductForecasts.json'
import AnimatedNumber from './AnimatedNumber'
import './demandForecasting.css'

// ── Category-Aware Velocity Heuristics ──────────────────────────────────────────
function getCategoryDecayRates(category, turnoverRatio) {
  const cat = String(category || '').toLowerCase()
  const tr = parseFloat(turnoverRatio) || 1.2
  const velocity = Math.min(1.8, Math.max(0.6, tr / 1.5))

  if (cat.includes('produce') || cat.includes('fruit') || cat.includes('vegetable') || cat.includes('bakery') || cat.includes('bread')) {
    return [0.22 * velocity, 0.18 * velocity, 0.14 * velocity]
  } else if (cat.includes('dairy') || cat.includes('meat') || cat.includes('poultry') || cat.includes('seafood') || cat.includes('egg')) {
    return [0.18 * velocity, 0.15 * velocity, 0.11 * velocity]
  } else if (cat.includes('beverage') || cat.includes('juice')) {
    return [0.11 * velocity, 0.09 * velocity, 0.07 * velocity]
  } else {
    return [0.07 * velocity, 0.05 * velocity, 0.04 * velocity]
  }
}

// ── Merge ML Forecast with Live Batch Inventory ────────────────────────────────
function mergeMlWithBatches(mlProducts, batches) {
  const merged = { ...mlProducts }
  for (const b of batches) {
    if (!b.product) continue
    const stock = b.stockQty !== undefined ? Number(b.stockQty) : 0
    const dte = b.dteNum !== undefined ? Number(b.dteNum) : 4
    const price = b.unitPrice !== undefined ? Number(b.unitPrice) : 6.0

    if (merged[b.product]) {
      let cur = stock
      const patchedPoints = (merged[b.product].points || []).map(p => {
        cur = Math.max(0, cur - (p.demand || 1))
        return { ...p, stockRemaining: cur, status: cur === 0 ? 'Stockout' : cur < 15 ? 'Low' : 'Adequate' }
      })
      merged[b.product] = {
        ...merged[b.product],
        batchId: b.id,
        currentStock: stock,
        daysToExpiry: dte,
        unitPrice: price,
        points: patchedPoints
      }
    } else {
      const [r1Rate, r2Rate, r3Rate] = getCategoryDecayRates(b.category, b.turnoverRatio)
      const d1 = Math.max(1, Math.round(stock * r1Rate))
      const d2 = Math.max(1, Math.round(stock * r2Rate))
      const d3 = Math.max(1, Math.round(stock * r3Rate))
      const r1 = Math.max(0, stock - d1), r2 = Math.max(0, r1 - d2), r3 = Math.max(0, r2 - d3)
      merged[b.product] = {
        product: b.product,
        category: b.category || 'Produce',
        batchId: b.id,
        unit: b.uom || 'units',
        unitPrice: price,
        currentStock: stock,
        daysToExpiry: dte,
        totalDemand: d1 + d2 + d3,
        points: [
          { label: 'Tomorrow', date: 'Day 1', demand: d1, stockRemaining: r1, status: r1 === 0 ? 'Stockout' : 'Adequate' },
          { label: 'Day 2',    date: 'Day 2', demand: d2, stockRemaining: r2, status: r2 === 0 ? 'Stockout' : 'Adequate' },
          { label: 'Day 3',    date: 'Day 3', demand: d3, stockRemaining: r3, status: r3 === 0 ? 'Stockout' : 'Adequate' }
        ]
      }
    }
  }
  return merged
}

// ── Compute Simple, Authoritative Action ────────────────────────────────────────
function computeDecision(stock, demand, dte, unit) {
  const s = Math.max(0, Number(stock) || 0)
  const d = Math.max(0, Number(demand) || 0)
  const days = Math.max(0, Number(dte) || 0)
  const balance = s - d

  // 1. Stockout
  if (s === 0 || balance < 0) {
    const deficit = s === 0 ? d : Math.abs(balance)
    return {
      title: 'Restock Required',
      action: `Order +${deficit} ${unit}`,
      reason: `Customer demand exceeds on-hand stock. Order ${deficit} ${unit} to prevent empty shelves.`,
      mascot: '/image/decision/donate.png',
      badgeClass: 'is-critical',
      bannerBg: '#fef2f2',
      bannerBorder: '#fecaca',
      textColor: '#dc2626'
    }
  }

  // 2. Surplus Expiring <= 1 Day -> Donate
  if (balance > 0 && days <= 1) {
    return {
      title: 'Donate Surplus',
      action: `Send ${balance} ${unit} to Food Bank`,
      reason: `Remaining ${balance} ${unit} expires within 24 hours. Dispatch to food bank partner to prevent waste.`,
      mascot: '/image/decision/donate.png',
      badgeClass: 'is-critical',
      bannerBg: '#fef2f2',
      bannerBorder: '#fecaca',
      textColor: '#dc2626'
    }
  }

  // 3. Surplus Expiring <= 3 Days -> Markdown
  if (balance > 0 && days <= 3) {
    return {
      title: 'Apply 30% Markdown',
      action: `Discount ${balance} ${unit} at POS`,
      reason: `${balance} ${unit} surplus will reach expiry in ${days} days. 30% discount accelerates sell-through.`,
      mascot: '/image/decision/dynamic.png',
      badgeClass: 'is-warning',
      bannerBg: '#fffbeb',
      bannerBorder: '#fde68a',
      textColor: '#d97706'
    }
  }

  // 4. Healthy / Normal
  return {
    title: 'Healthy Coverage',
    action: 'Maintain Regular Sale (FEFO)',
    reason: `Inventory is well balanced with ${days} days shelf-life remaining. Rotate oldest stock forward.`,
    mascot: '/image/decision/normal_sale.png',
    badgeClass: 'is-safe',
    bannerBg: '#f0fdf4',
    bannerBorder: '#bbf7d0',
    textColor: '#16a34a'
  }
}

export default function DemandForecastingPage({ onToggleSidebar, batches = [] }) {
  const [mlProducts, setMlProducts] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef(null)

  // Load ML predictions
  useEffect(() => {
    fetch('/api/forecast/products?store_nbr=1&limit=100')
      .then(r => r.json())
      .then(d => setMlProducts(d.products || {}))
      .catch(() => setMlProducts({}))
  }, [])

  // Close search dropdown on click outside
  useEffect(() => {
    const handleOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // Merge products
  const mergedDb = useMemo(() => {
    const base = Object.keys(mlProducts).length > 0 ? mlProducts : defaultForecastData
    return mergeMlWithBatches(base, batches)
  }, [mlProducts, batches])

  const productKeys = useMemo(() => Object.keys(mergedDb), [mergedDb])
  const [selectedProduct, setSelectedProduct] = useState(productKeys[0] || 'Bell Pepper')

  // Auto-reset if product removed
  useEffect(() => {
    if (productKeys.length > 0 && !productKeys.includes(selectedProduct)) {
      setSelectedProduct(productKeys[0])
    }
  }, [productKeys, selectedProduct])

  // Filtered search matches
  const searchMatches = useMemo(() => {
    if (!searchTerm.trim()) return productKeys.slice(0, 8)
    const q = searchTerm.toLowerCase()
    return productKeys.filter(k => k.toLowerCase().includes(q) || (mergedDb[k]?.category || '').toLowerCase().includes(q)).slice(0, 8)
  }, [productKeys, mergedDb, searchTerm])

  // Current item data
  const current = mergedDb[selectedProduct] || defaultForecastData['Bell Pepper'] || {}
  const stock = Number(current.currentStock) || 0
  const points = current.points || []
  const demand = Number(current.totalDemand) || points.reduce((sum, p) => sum + (p.demand || 0), 0)
  const dte = Number(current.daysToExpiry) || 4
  const unit = current.unit || 'units'
  const balance = stock - demand

  const decision = computeDecision(stock, demand, dte, unit)

  // ── 3-Day Visual Trajectory Graph Coordinates ──
  const timelinePoints = [
    { label: 'Today', sub: 'Start', stockVal: stock, demandVal: null },
    { label: points[0]?.label || 'Tomorrow', sub: points[0]?.date || 'Day 1', stockVal: points[0]?.stockRemaining ?? stock, demandVal: points[0]?.demand ?? 0 },
    { label: points[1]?.label || 'Day 2', sub: points[1]?.date || 'Day 2', stockVal: points[1]?.stockRemaining ?? 0, demandVal: points[1]?.demand ?? 0 },
    { label: points[2]?.label || 'Day 3', sub: points[2]?.date || 'Day 3', stockVal: points[2]?.stockRemaining ?? 0, demandVal: points[2]?.demand ?? 0 }
  ]

  const maxGraphVal = Math.max(stock, ...timelinePoints.map(p => Math.max(p.stockVal, p.demandVal || 0)), 10) * 1.25
  const chartW = 680
  const chartH = 175
  const padL = 45
  const padR = 40
  const padT = 26
  const padB = 135
  const plotW = chartW - padL - padR
  const plotH = padB - padT

  const getX = (idx) => padL + (idx / (timelinePoints.length - 1)) * plotW
  const getY = (v) => padB - (Math.max(0, v) / maxGraphVal) * plotH

  const stockCoords = timelinePoints.map((p, i) => ({ x: getX(i), y: getY(p.stockVal), val: p.stockVal, ...p }))
  const demandCoords = timelinePoints.slice(1).map((p, i) => ({ x: getX(i + 1), y: getY(p.demandVal), val: p.demandVal }))

  const stockPath = `M ${stockCoords.map(c => `${c.x},${c.y}`).join(' L ')}`
  const stockArea = `${stockPath} L ${getX(timelinePoints.length - 1)},${padB} L ${getX(0)},${padB} Z`
  const demandPath = `M ${demandCoords.map(c => `${c.x},${c.y}`).join(' L ')}`

  return (
    <div className="fg-fc-distill-root">
      {/* Header */}
      <DashboardHeader
        title="Demand Forecasting"
        subtitle="3-day sales forecast and replenishment advice"
        onToggleSidebar={onToggleSidebar}
      />

      {/* ─── 1. SIMPLE PRODUCT SELECTOR ─── */}
      <div className="fg-fc-distill-bar">
        {/* Search input with clean dropdown */}
        <div className="fg-fc-select-wrap" ref={searchRef}>
          <div className="fg-fc-select-input-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#64748b' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search or pick product..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setShowDropdown(true)
              }}
              onFocus={() => setShowDropdown(true)}
              className="fg-fc-select-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="fg-search-clear"
                onClick={() => {
                  setSearchTerm('')
                  setShowDropdown(false)
                }}
              >
                ✕
              </button>
            )}
          </div>

          {showDropdown && (
            <div className="fg-fc-dropdown">
              {searchMatches.map(p => {
                const item = mergedDb[p]
                const isSelected = p === selectedProduct
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setSelectedProduct(p)
                      setSearchTerm('')
                      setShowDropdown(false)
                    }}
                    className={`fg-fc-dropdown-item ${isSelected ? 'is-selected' : ''}`}
                  >
                    <div>
                      <span style={{ fontWeight: 800, color: '#0c1f15' }}>{p}</span>
                      <span style={{ fontSize: '0.74rem', color: '#64748b', marginLeft: '6px' }}>({item?.category})</span>
                    </div>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: (item?.currentStock || 0) === 0 ? '#dc2626' : '#147b43' }}>
                      {item?.currentStock || 0} {item?.unit || ''}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick chip shortcuts */}
        <div className="fg-fc-quick-picker">
          {productKeys.slice(0, 5).map(prod => {
            const isSelected = prod === selectedProduct
            return (
              <button
                key={prod}
                type="button"
                onClick={() => setSelectedProduct(prod)}
                className={`fg-fc-quick-chip ${isSelected ? 'is-active' : ''}`}
              >
                {prod}
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── 2. CORE FORECAST & VERDICT CARD ─── */}
      <section className="fg-fc-card-main">
        {/* Product Identity */}
        <div className="fg-fc-card-header">
          <div className="fg-fc-card-identity">
            <h2 className="fg-fc-product-name">{selectedProduct}</h2>
            <span className="fg-fc-product-cat">{current.category || 'Fresh Goods'}</span>
            {current.batchId && <span className="fg-fc-product-lot">{current.batchId}</span>}
          </div>

          <span className={`fg-fc-dte-badge ${decision.badgeClass}`}>
            ⏰ {dte} Days to Expiry
          </span>
        </div>

        {/* 3 Core Numbers */}
        <div className="fg-fc-numbers-row">
          {/* Current Stock */}
          <div className="fg-fc-number-tile">
            <span className="fg-fc-tile-label">Current Stock</span>
            <div className="fg-fc-tile-value" style={{ color: stock === 0 ? '#dc2626' : '#0c1f15' }}>
              <AnimatedNumber value={stock} decimals={0} />
              <span className="fg-fc-tile-unit">{unit}</span>
            </div>
            <span className="fg-fc-tile-hint">On floor right now</span>
          </div>

          {/* 3-Day Sales Forecast */}
          <div className="fg-fc-number-tile">
            <span className="fg-fc-tile-label">Expected 3-Day Sales</span>
            <div className="fg-fc-tile-value" style={{ color: '#2563eb' }}>
              <AnimatedNumber value={demand} decimals={0} />
              <span className="fg-fc-tile-unit">{unit}</span>
            </div>
            <span className="fg-fc-tile-hint">Customer demand</span>
          </div>

          {/* Ending Balance */}
          <div className="fg-fc-number-tile">
            <span className="fg-fc-tile-label">Projected Ending Stock</span>
            <div className="fg-fc-tile-value" style={{ color: balance < 0 ? '#dc2626' : '#147b43' }}>
              {balance < 0 ? '-' : '+'}<AnimatedNumber value={Math.abs(balance)} decimals={0} />
              <span className="fg-fc-tile-unit">{unit}</span>
            </div>
            <span className="fg-fc-tile-hint">{balance < 0 ? 'Deficit (Stockout)' : 'Safe Surplus'}</span>
          </div>
        </div>

        {/* Clear Action Recommendation */}
        <div
          className="fg-fc-action-banner"
          style={{
            background: decision.bannerBg,
            borderColor: decision.bannerBorder,
            color: decision.textColor
          }}
        >
          <img
            src={decision.mascot}
            alt={decision.title}
            className="fg-fc-banner-mascot"
          />
          <div className="fg-fc-banner-body">
            <h4 className="fg-fc-banner-title">
              <span>{decision.title}:</span>
              <strong>{decision.action}</strong>
            </h4>
            <p className="fg-fc-banner-desc">{decision.reason}</p>
          </div>
        </div>
      </section>

      {/* ─── 3. SIMPLE 3-DAY TIMELINE ─── */}
      <section className="fg-fc-card-timeline">
        <div className="fg-fc-timeline-title-row">
          <h3 className="fg-fc-timeline-heading">Daily Sell-Through Progression</h3>
          <p className="fg-fc-timeline-sub">Opening stock vs. predicted customer purchases day by day</p>
        </div>

        <div className="fg-fc-days-linear">
          {points.map((pt, idx) => {
            const isZero = pt.stockRemaining === 0
            const isLow = !isZero && pt.stockRemaining < 15
            const prevStock = idx === 0 ? stock : points[idx - 1].stockRemaining
            const depPct = Math.min(100, Math.round((pt.demand / Math.max(1, prevStock)) * 100))

            return (
              <div key={pt.label} className="fg-fc-day-step">
                <div className="fg-fc-step-head">
                  <span className="fg-fc-step-day">{pt.label} ({pt.date})</span>
                  <span className={`fg-fc-step-status ${isZero ? 'is-out' : isLow ? 'is-low' : 'is-ok'}`}>
                    {isZero ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                  </span>
                </div>

                <div className="fg-fc-step-stats">
                  <span className="fg-fc-stat-sales">Sales: -{pt.demand} {unit}</span>
                  <span className="fg-fc-stat-stock" style={{ color: isZero ? '#dc2626' : '#147b43' }}>
                    Closing: {pt.stockRemaining} {unit}
                  </span>
                </div>

                {/* Visual bar */}
                <div className="fg-fc-step-bar-bg">
                  <div
                    className="fg-fc-step-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.max(10, depPct))}%`,
                      background: isZero ? '#dc2626' : '#2563eb'
                    }}
                  />
                </div>

                <div className="fg-fc-step-footer">
                  {depPct}% of daily inventory sold
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 3-Day Visual Depletion & Demand Graph ── */}
        <div className="fg-fc-graph-section">
          <div className="fg-fc-graph-header">
            <span className="fg-fc-graph-title">
              Stock Depletion & Demand Trajectory
            </span>
            <div className="fg-fc-graph-legend">
              <div>
                <span className="fg-fc-legend-dot-stock" />
                <span style={{ color: '#1b9b55' }}>Stock Level ({unit})</span>
              </div>
              <div>
                <span className="fg-fc-legend-dot-demand" />
                <span style={{ color: '#2563eb' }}>Daily Purchases ({unit})</span>
              </div>
            </div>
          </div>

          <div className="fg-fc-svg-wrap">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '175px' }}>
              <defs>
                <linearGradient id="distillStockAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1b9b55" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#1b9b55" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Gridlines */}
              {[Math.round(maxGraphVal), Math.round(maxGraphVal * 0.5), 0].map(v => {
                const y = getY(v)
                return (
                  <g key={v}>
                    <text x={padL - 10} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="9" fontWeight="700">
                      {v}
                    </text>
                    <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke={v === 0 ? '#cbd5e1' : '#f1f5f9'} strokeWidth="1" />
                  </g>
                )
              })}

              {/* Stock area gradient fill */}
              <path d={stockArea} fill="url(#distillStockAreaGrad)" />

              {/* Demand dashed line */}
              <path d={demandPath} fill="none" stroke="#2563eb" strokeWidth="2.4" strokeDasharray="5 3" strokeLinecap="round" />

              {/* Stock solid curve */}
              <path d={stockPath} fill="none" stroke="#1b9b55" strokeWidth="3" strokeLinecap="round" />

              {/* Demand points with value tags */}
              {demandCoords.map((pt, i) => (
                <g key={`demand-pt-${i}`}>
                  <circle cx={pt.x} cy={pt.y} r={4} fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
                  <text x={pt.x} y={pt.y - 8} textAnchor="middle" fill="#2563eb" fontSize="9.5" fontWeight="800">
                    -{pt.val}
                  </text>
                </g>
              ))}

              {/* Stock points with value tags */}
              {stockCoords.map((pt, i) => (
                <g key={`stock-pt-${i}`}>
                  <circle cx={pt.x} cy={pt.y} r={5} fill={pt.val === 0 ? '#dc2626' : '#1b9b55'} stroke="#ffffff" strokeWidth="2" />
                  <text x={pt.x} y={pt.y - 9} textAnchor="middle" fill={pt.val === 0 ? '#dc2626' : '#147b43'} fontSize="10" fontWeight="900">
                    {pt.val} {unit}
                  </text>
                </g>
              ))}

              {/* X-axis labels */}
              {stockCoords.map((pt, i) => (
                <text key={`x-lbl-${i}`} x={pt.x} y={padB + 18} textAnchor="middle" fill="#496354" fontSize="10" fontWeight="800">
                  {pt.label}
                </text>
              ))}
            </svg>
          </div>
        </div>
      </section>
    </div>
  )
}
