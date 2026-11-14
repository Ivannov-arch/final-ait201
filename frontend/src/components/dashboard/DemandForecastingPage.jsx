import { useState, useRef, useEffect, useMemo } from 'react'
import gsap from 'gsap'
import DashboardHeader from './DashboardHeader'
import defaultForecastData from '../../data/generatedProductForecasts.json'

// ── Category-Aware Velocity Heuristics (BUG-FC-04 fix) ──────────────────────────
function getCategoryDecayRates(category, turnoverRatio) {
  const cat = String(category || '').toLowerCase()
  const tr = parseFloat(turnoverRatio) || 1.2
  const velocity = Math.min(1.8, Math.max(0.6, tr / 1.5))

  if (cat.includes('produce') || cat.includes('fruit') || cat.includes('vegetable') || cat.includes('bakery') || cat.includes('bread')) {
    // Highly perishable: ~45-55% over 3 days
    return [0.22 * velocity, 0.18 * velocity, 0.14 * velocity]
  } else if (cat.includes('dairy') || cat.includes('meat') || cat.includes('poultry') || cat.includes('seafood') || cat.includes('egg')) {
    // Moderately perishable: ~35-45% over 3 days
    return [0.18 * velocity, 0.15 * velocity, 0.11 * velocity]
  } else if (cat.includes('beverage') || cat.includes('juice')) {
    // Semi-perishable drinks: ~22-28% over 3 days
    return [0.11 * velocity, 0.09 * velocity, 0.07 * velocity]
  } else {
    // Shelf-stable pantry / dry goods / oils / grains: ~12-18% over 3 days
    return [0.07 * velocity, 0.05 * velocity, 0.04 * velocity]
  }
}

// ── Merge ML forecast products with live batch stock (source of truth) ──────────
// ML forecast provides demand from three_day_forecast.json via /api/forecast/products.
// Live batches override currentStock, daysToExpiry, and unitPrice.
function mergeMlWithBatches(mlProducts, batches) {
  const merged = { ...mlProducts }
  for (const b of batches) {
    if (!b.product) continue
    const stock = b.stockQty !== undefined ? Number(b.stockQty) : 0
    const dte   = b.dteNum   !== undefined ? Number(b.dteNum)   : 4
    const price = b.unitPrice !== undefined ? Number(b.unitPrice) : 6.0
    if (merged[b.product]) {
      // Product exists in ML — patch live stock & expiry, keep ML demand points
      let cur = stock
      const patchedPoints = (merged[b.product].points || []).map(p => {
        cur = Math.max(0, cur - (p.demand || 1))
        return { ...p, stockRemaining: cur, status: cur === 0 ? 'Stockout' : cur < 15 ? 'Low' : 'Adequate' }
      })
      merged[b.product] = { ...merged[b.product], batchId: b.id, currentStock: stock, daysToExpiry: dte, unitPrice: price, points: patchedPoints }
    } else {
      // Product not in ML — category-aware heuristic decay (BUG-FC-04 fix)
      const [r1Rate, r2Rate, r3Rate] = getCategoryDecayRates(b.category, b.turnoverRatio)
      const d1 = Math.max(1, Math.round(stock * r1Rate))
      const d2 = Math.max(1, Math.round(stock * r2Rate))
      const d3 = Math.max(1, Math.round(stock * r3Rate))
      const r1 = Math.max(0, stock - d1), r2 = Math.max(0, r1 - d2), r3 = Math.max(0, r2 - d3)
      merged[b.product] = {
        product: b.product, category: b.category || 'Produce',
        batchId: b.id, unit: b.uom || 'units', unitPrice: price,
        currentStock: stock, daysToExpiry: dte, totalDemand: d1 + d2 + d3,
        mlFamily: null, mlWeight: null, // heuristic fallback flag
        isHeuristic: true,
        points: [
          { label: 'Tomorrow', date: 'Day +1', demand: d1, stockRemaining: r1, status: r1 === 0 ? 'Stockout' : 'Adequate' },
          { label: 'Day After', date: 'Day +2', demand: d2, stockRemaining: r2, status: r2 === 0 ? 'Stockout' : 'Adequate' },
          { label: 'Day 3',     date: 'Day +3', demand: d3, stockRemaining: r3, status: r3 === 0 ? 'Stockout' : 'Adequate' }
        ]
      }
    }
  }
  return merged
}

// Compact animated number for crisp metric transitions
function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 0 }) {
  const nodeRef = useRef(null)
  const prevValRef = useRef(0)

  useEffect(() => {
    const num = Number(value || 0)
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (nodeRef.current) {
        nodeRef.current.textContent = `${prefix}${num.toLocaleString('en-MY', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        })}${suffix}`
      }
      return
    }

    const obj = { val: prevValRef.current }
    const tween = gsap.to(obj, {
      val: num,
      duration: 0.75,
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
    prevValRef.current = num
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

// Compute concise, bulletproof replenishment & FEFO decisions
function computeDecision(stock, totalDemand, dte, unit) {
  const s = Math.max(0, Number(stock) || 0)
  const d = Math.max(0, Number(totalDemand) || 0)
  const days = Math.max(0, Number(dte) || 0)
  const balance = s - d

  // 1. OUT OF STOCK
  if (s === 0) {
    return {
      title: 'Critical Stockout',
      action: 'Urgent Restock Required',
      reason: `Floor stock is 0 ${unit}. Immediate PO needed for ${d} ${unit} projected demand.`,
      btnText: `Create PO (+${d || 10} ${unit})`,
      actionType: 'reorder',
      badgeColor: '#dc2626',
      badgeBg: '#fef2f2',
      badgeBorder: '#fecaca',
      deficit: d || 10,
      surplus: 0
    }
  }

  // 2. STOCK DEFICIT
  if (balance < 0) {
    const deficit = Math.abs(balance)
    return {
      title: 'Depletion Warning',
      action: `Restock +${deficit} ${unit}`,
      reason: `Stock runs out before Day 3. Order ${deficit} ${unit} to prevent empty shelves.`,
      btnText: `Order +${deficit} ${unit}`,
      actionType: 'reorder',
      badgeColor: '#d97706',
      badgeBg: '#fffbeb',
      badgeBorder: '#fde68a',
      deficit,
      surplus: 0
    }
  }

  // 3. SURPLUS EXPIRING IN 24H -> DONATE
  if (balance > 0 && days <= 1) {
    return {
      title: 'Critical Expiry',
      action: 'Donate to Food Bank',
      reason: `Surplus of ${balance} ${unit} expires within 24h. Dispatch to NGO soup kitchen.`,
      btnText: `Schedule Dispatch (${balance} ${unit})`,
      actionType: 'donate',
      badgeColor: '#c82d32',
      badgeBg: '#fef2f2',
      badgeBorder: '#fecaca',
      deficit: 0,
      surplus: balance
    }
  }

  // 4. SURPLUS EXPIRING IN 3 DAYS -> MARKDOWN
  if (balance > 0 && days <= 3) {
    return {
      title: 'Near Expiry',
      action: 'Apply 30% Markdown',
      reason: `Surplus of ${balance} ${unit} expiring in ${days}d. 30% discount clears stock in POS.`,
      btnText: `Activate 30% Markdown`,
      actionType: 'markdown',
      badgeColor: '#d97706',
      badgeBg: '#fffbeb',
      badgeBorder: '#fde68a',
      deficit: 0,
      surplus: balance
    }
  }

  // 5. OPTIMAL COVERAGE
  return {
    title: 'Optimal Stock',
    action: 'Maintain Regular Sale (FEFO)',
    reason: `Healthy inventory coverage with ${days}d shelf-life. Maintain standard floor display.`,
    btnText: `Confirm FEFO Display`,
    actionType: 'regular',
    badgeColor: '#16a34a',
    badgeBg: '#f0fdf4',
    badgeBorder: '#bbf7d0',
    deficit: 0,
    surplus: balance
  }
}

export default function DemandForecastingPage({ onToggleSidebar, batches = [] }) {
  const [mlProducts, setMlProducts]     = useState({})   // from /api/forecast/products
  const [mlLoading,  setMlLoading]      = useState(true)
  const [mlError,    setMlError]        = useState(null)
  const [searchTerm, setSearchTerm]     = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedDayIdx, setSelectedDayIdx]   = useState(0)
  const [toastMessage, setToastMessage]       = useState(null)

  const searchContainerRef = useRef(null)
  const toastRef           = useRef(null)

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3200)
  }

  // ── Fetch ML forecast from /api/forecast/products on mount ────────────────────
  useEffect(() => {
    setMlLoading(true)
    fetch('/api/forecast/products?store_nbr=1&limit=100')
      .then(r => r.json())
      .then(data => {
        const products = data.products || {}
        const count = Object.keys(products).length
        if (count > 0) {
          console.log(
            `%c[FreshGuard Forecast] ✅ ML model active (LightGBM — Person 2)`,
            'color: #16a34a; font-weight: bold;'
          )
          console.log(`  Source : data/processed/three_day_forecast.json (from demand_forecast_final_day_*.pkl)`)
          console.log(`  Products loaded : ${count}`)
          console.log(`  Store : store_nbr=1`)
          console.table(
            Object.fromEntries(
              Object.entries(products).slice(0, 10).map(([name, d]) => [
                name,
                { mlFamily: d.mlFamily, weight: d.mlWeight, totalDemand: d.totalDemand, currentStock: d.currentStock }
              ])
            )
          )
        }
        setMlProducts(products)
        setMlError(null)
      })
      .catch(() => {
        console.warn('[FreshGuard Forecast] ⚠ ML forecast unavailable — using heuristic fallback (stock × 0.35/0.30/0.25)')
        setMlError('ML forecast unavailable — using heuristic fallback.')
        setMlProducts({})
      })
      .finally(() => setMlLoading(false))
  }, [])

  // Toast animation
  useEffect(() => {
    if (!toastMessage || !toastRef.current) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const tween = gsap.fromTo(
      toastRef.current,
      { y: 20, opacity: 0, scale: 0.96 },
      { y: 0, opacity: 1, scale: 1, duration: 0.28, ease: 'power3.out' }
    )
    return () => tween.kill()
  }, [toastMessage])

  // Close suggestions dropdown on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // ── Merge ML forecast with live batch data ───────────────────────────────────
  // mergedDb always has fresh stock from inventory_master.json (via batches prop)
  // Demand numbers come from ML model; heuristic fallback for unknown products
  const mergedDb = useMemo(() => {
    const base = Object.keys(mlProducts).length > 0 ? mlProducts : defaultForecastData
    return mergeMlWithBatches(base, batches)
  }, [mlProducts, batches])

  const allProducts = useMemo(() => Object.keys(mergedDb), [mergedDb])
  const [selectedProduct, setSelectedProduct] = useState(allProducts[0] || 'Bell Pepper')

  // Reset selectedProduct if current product was deleted from batches (BUG-FC-03 fix)
  useEffect(() => {
    if (allProducts.length > 0 && !allProducts.includes(selectedProduct)) {
      setSelectedProduct(allProducts[0])
    }
  }, [allProducts, selectedProduct])

  // Search matches
  const searchMatches = useMemo(() => {
    if (!searchTerm) return allProducts.slice(0, 8)
    const term = searchTerm.toLowerCase()
    return allProducts.filter(p => p.toLowerCase().includes(term) || (mergedDb[p]?.category && mergedDb[p].category.toLowerCase().includes(term))).slice(0, 8)
  }, [allProducts, mergedDb, searchTerm])

  // Current product data & decision
  const productData = mergedDb[selectedProduct] || mergedDb[allProducts[0]] || defaultForecastData['Bell Pepper']
  const isMlSource = Boolean(productData.mlFamily && !mlError)
  const sourceLabel = isMlSource
    ? `LightGBM ML (${productData.mlFamily})`
    : 'Category Velocity Heuristic'
  const points = productData.points || []
  const stockNum = Number(productData.currentStock) || 0
  const demandNum = Number(productData.totalDemand) || points.reduce((sum, p) => sum + (p.demand || 0), 0) || 3
  const dteNum = Number(productData.daysToExpiry) || 3
  const unit = productData.unit || 'units'
  const netBalance = stockNum - demandNum

  const decision = computeDecision(stockNum, demandNum, dteNum, unit)

  // Chart scaling
  const maxScale = Math.max(stockNum, demandNum, 4) * 1.2
  const chartW = 540
  const chartH = 110
  const padL = 36
  const padR = 24
  const padT = 12
  const padB = 88
  const plotW = chartW - padL - padR
  const plotH = padB - padT

  const getY = (v) => padB - (Math.max(0, v) / maxScale) * plotH
  const getX = (i) => padL + (i / Math.max(1, points.length - 1)) * plotW

  const stockCoords = points.map((p, i) => ({ x: getX(i), y: getY(p.stockRemaining), val: p.stockRemaining }))
  const demandCoords = points.map((p, i) => ({ x: getX(i), y: getY(p.demand), val: p.demand }))

  const stockPath = `M ${stockCoords.map(c => `${c.x},${c.y}`).join(' L ')}`
  const demandPath = `M ${demandCoords.map(c => `${c.x},${c.y}`).join(' L ')}`
  const stockArea = `${stockPath} L ${getX(points.length - 1)},${padB} L ${getX(0)},${padB} Z`

  return (
    <div className="fg-inv-root" style={{ maxWidth: '1240px', margin: '0 auto', paddingBottom: '2.5rem' }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fg-fefo-toast" role="alert" ref={toastRef}>
          <div className="fg-fefo-toast__icon">✓</div>
          <span className="fg-fefo-toast__msg">{toastMessage}</span>
          <button type="button" className="fg-fefo-toast__close" onClick={() => setToastMessage(null)}>✕</button>
        </div>
      )}

      {/* Header */}
      <DashboardHeader
        title="Demand Forecasting"
        subtitle="3-Day predictive sell-through modeling and FEFO replenishment directives"
        onToggleSidebar={onToggleSidebar}
      />

      {/* ─── 1. COMMAND STRIP: Clean, uncarded product selector ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          margin: '0.5rem 0 1.25rem'
        }}
      >
        {/* Search Input with Autocomplete */}
        <div ref={searchContainerRef} style={{ position: 'relative', flex: '1 1 300px', maxWidth: '420px' }}>
          <div className="fg-search" style={{ width: '100%', background: '#ffffff', borderRadius: '12px', border: '1px solid #d4e2d8' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search product (e.g. Bell Pepper, Bread)..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              aria-label="Search product to forecast"
              style={{ fontSize: '0.86rem' }}
            />
            {searchTerm && (
              <button
                type="button"
                className="fg-search-clear"
                onClick={() => {
                  setSearchTerm('')
                  setShowSuggestions(false)
                }}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {showSuggestions && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                background: '#ffffff',
                borderRadius: '12px',
                boxShadow: '0 8px 24px rgba(12,31,21,0.12)',
                border: '1px solid #d8ebd0',
                maxHeight: '260px',
                overflowY: 'auto',
                zIndex: 1000,
                padding: '4px'
              }}
            >
              {searchMatches.map(p => {
                const item = mergedDb[p]
                const isZero = (item?.currentStock || 0) === 0
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setSelectedProduct(p)
                      setSearchTerm('')
                      setShowSuggestions(false)
                      setSelectedDayIdx(0)
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 12px',
                      border: 'none',
                      background: p === selectedProduct ? '#eaf7ee' : 'transparent',
                      color: p === selectedProduct ? '#166534' : '#1e293b',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.82rem'
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 700 }}>{p}</span>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: '6px' }}>
                        {item?.category}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: isZero ? '#dc2626' : '#166534'
                      }}
                    >
                      {isZero ? '0 units (Out of stock)' : `${item?.currentStock} ${item?.unit || ''}`}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick select chips for rapid comparison */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {allProducts.slice(0, 5).map(prod => {
            const isSelected = prod === selectedProduct
            const stock = mergedDb[prod]?.currentStock || 0
            return (
              <button
                key={prod}
                type="button"
                onClick={() => {
                  setSelectedProduct(prod)
                  setSelectedDayIdx(0)
                }}
                style={{
                  padding: '0.28rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '0.76rem',
                  fontWeight: isSelected ? 800 : 600,
                  background: isSelected ? '#1b9b55' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#334155',
                  border: isSelected ? '1px solid #16a34a' : '1px solid #d2e4d8',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {prod} ({stock})
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── 2. CONSOLIDATED DECISION HERO: Product + Verdict + Metrics + Action ─── */}
      <div
        className="fg-card"
        style={{
          background: '#ffffff',
          borderRadius: '18px',
          padding: '1.25rem 1.6rem',
          marginBottom: '1.4rem',
          border: '1px solid #e1ede5',
          boxShadow: '0 2px 14px rgba(12, 31, 21, 0.04)'
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
          
          {/* Left: Product Identity & Directive */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '6px' }}>
              <span
                style={{
                  padding: '0.22rem 0.65rem',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  background: decision.badgeBg,
                  color: decision.badgeColor,
                  border: `1px solid ${decision.badgeBorder}`
                }}
              >
                {decision.title}
              </span>
              <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                {productData.category} {productData.batchId ? `• ${productData.batchId}` : ''} • DTE {dteNum}d • Source: {sourceLabel}
              </span>
            </div>

            <h2 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#0c1f15', margin: '0 0 4px', letterSpacing: '-0.025em' }}>
              {selectedProduct}
            </h2>

            <p style={{ margin: 0, fontSize: '0.86rem', color: '#334155', lineHeight: 1.45, fontWeight: 500 }}>
              {decision.reason}
            </p>
            <div style={{ marginTop: '5px', fontSize: '0.74rem', color: '#64748b' }}>
              Forecast Source: {isMlSource ? `LightGBM ML Model (Family: ${productData.mlFamily})` : 'Category Velocity Heuristics'}
            </div>
          </div>

          {/* Center: 3 Clean Inline Figures (No nested cards!) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              padding: '0.75rem 1.25rem',
              borderRadius: '14px',
              background: '#f9fcf9',
              border: '1px solid #e7f2eb'
            }}
          >
            {/* Stock */}
            <div style={{ textAlign: 'center' }}>
              <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Current Stock
              </span>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: stockNum === 0 ? '#dc2626' : '#0c1f15' }}>
                <AnimatedNumber value={stockNum} decimals={0} /> <small style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>{unit}</small>
              </div>
            </div>

            <div style={{ width: 1, height: '36px', background: '#dce8e0' }} />

            {/* Demand */}
            <div style={{ textAlign: 'center' }}>
              <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                3-Day Demand
              </span>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#2563eb' }}>
                <AnimatedNumber value={demandNum} decimals={0} /> <small style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>{unit}</small>
              </div>
            </div>

            <div style={{ width: 1, height: '36px', background: '#dce8e0' }} />

            {/* Net Balance */}
            <div style={{ textAlign: 'center' }}>
              <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Projected Balance
              </span>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: netBalance < 0 ? '#dc2626' : '#16a34a' }}>
                {netBalance < 0 ? '-' : '+'}<AnimatedNumber value={Math.abs(netBalance)} decimals={0} /> <small style={{ fontSize: '0.74rem', fontWeight: 600 }}>{unit}</small>
              </div>
            </div>
          </div>

          {/* Right: Recommended Action Status Badge (BUG-FC-02: dead code button removed) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              Recommended Action
            </span>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: `${decision.badgeColor}18`,
                border: `1.5px solid ${decision.badgeColor}`,
                color: decision.badgeColor,
                padding: '0.55rem 1.15rem',
                fontSize: '0.85rem',
                fontWeight: 800,
                borderRadius: '12px'
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: decision.badgeColor }} />
              <span>{decision.btnText}</span>
            </div>
          </div>

        </div>
      </div>

      {/* ─── 3. THE 3-DAY DEPLETION HORIZON: Visual Waterfall & Mini Curve ─── */}
      <div
        className="fg-card"
        style={{
          background: '#ffffff',
          borderRadius: '18px',
          padding: '1.35rem',
          border: '1px solid #e1ede5',
          boxShadow: '0 2px 14px rgba(12, 31, 21, 0.04)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.15rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0c1f15' }}>
              3-Day Depletion & Sell-Through Timeline
            </h3>
            <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
              Daily opening stock vs. customer demand. Click any day for focus.
            </span>
          </div>

          {/* Clean Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.74rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700, color: '#2563eb' }}>
              <span style={{ width: 12, height: 2, background: '#2563eb' }} />
              <span>Projected Sales</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700, color: '#16a34a' }}>
              <span style={{ width: 12, height: 2, background: '#16a34a' }} />
              <span>Closing Stock</span>
            </div>
          </div>
        </div>

        {/* 3 Columns for 3 Days (Flat, crisp, no card-nesting) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          {points.map((pt, idx) => {
            const isSelected = selectedDayIdx === idx
            const isZero = pt.stockRemaining === 0
            const prevStock = idx === 0 ? stockNum : points[idx - 1].stockRemaining
            const depPct = Math.min(100, (pt.demand / Math.max(1, prevStock)) * 100)

            return (
              <div
                key={pt.label}
                onClick={() => setSelectedDayIdx(idx)}
                style={{
                  padding: '1rem',
                  borderRadius: '14px',
                  background: isSelected ? '#f5fbf7' : '#fafcfb',
                  border: isSelected ? '2px solid #1b9b55' : '1px solid #e6f0e9',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Day Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0c1f15' }}>
                      {pt.label}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: '#64748b', marginLeft: '6px' }}>
                      ({pt.date})
                    </span>
                  </div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      background: isZero ? '#fee2e2' : '#edf8f1',
                      color: isZero ? '#dc2626' : '#166534'
                    }}
                  >
                    {isZero ? 'Stockout' : 'In Stock'}
                  </span>
                </div>

                {/* Stock Progression Values */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '8px' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>Opening</span>
                    <strong style={{ color: '#0c1f15' }}>{prevStock} {unit}</strong>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: '#2563eb', display: 'block' }}>Sales</span>
                    <strong style={{ color: '#2563eb' }}>-{pt.demand} {unit}</strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>Closing</span>
                    <strong style={{ color: isZero ? '#dc2626' : '#147b43' }}>{pt.stockRemaining} {unit}</strong>
                  </div>
                </div>

                {/* Depletion Ratio Bar */}
                <div style={{ width: '100%', height: '6px', background: '#e2ece5', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(8, depPct))}%`,
                      height: '100%',
                      background: isZero ? '#dc2626' : '#2563eb',
                      borderRadius: '999px'
                    }}
                  />
                </div>

                {isZero && (
                  <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#dc2626', fontWeight: 700 }}>
                    ⚠️ Depleted on {pt.label}: Deficit of -{pt.demand} {unit}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Compact Scaled SVG Trendline */}
        <div style={{ borderTop: '1px solid #edf4ef', paddingTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Closing Stock Horizon Curve (Max {Math.round(maxScale)} {unit})
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              Focus: <strong>{points[selectedDayIdx]?.label || 'Day 1'}</strong>
            </span>
          </div>

          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '110px' }}>
              <defs>
                <linearGradient id="distillAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1b9b55" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#1b9b55" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Gridlines */}
              {[Math.round(maxScale), Math.round(maxScale * 0.5), 0].map(v => {
                const y = getY(v)
                return (
                  <g key={v}>
                    <text x={padL - 6} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="8.5" fontWeight="700">
                      {v}
                    </text>
                    <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke={v === 0 ? '#cbd5e1' : '#f1f5f9'} strokeWidth="1" />
                  </g>
                )
              })}

              {/* Active day guide */}
              {(() => {
                const fx = getX(selectedDayIdx)
                return (
                  <line x1={fx} y1={padT} x2={fx} y2={padB} stroke="#1b9b55" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.6" />
                )
              })()}

              {/* Area */}
              <path d={stockArea} fill="url(#distillAreaGrad)" />

              {/* Demand line */}
              <path d={demandPath} fill="none" stroke="#2563eb" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" />

              {/* Stock line */}
              <path d={stockPath} fill="none" stroke="#1b9b55" strokeWidth="2.5" strokeLinecap="round" />

              {/* Demand dots */}
              {demandCoords.map((pt, i) => (
                <circle key={`dd-${i}`} cx={pt.x} cy={pt.y} r={selectedDayIdx === i ? 4.5 : 3} fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
              ))}

              {/* Stock dots */}
              {stockCoords.map((pt, i) => (
                <circle
                  key={`sd-${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={selectedDayIdx === i ? 5.5 : 4}
                  fill={pt.val === 0 ? '#dc2626' : '#1b9b55'}
                  stroke="#ffffff"
                  strokeWidth="1.8"
                />
              ))}

              {/* X Labels */}
              {points.map((p, i) => (
                <text
                  key={`xl-${i}`}
                  x={getX(i)}
                  y={padB + 14}
                  textAnchor="middle"
                  fill={selectedDayIdx === i ? '#147b43' : '#64748b'}
                  fontSize="9.5"
                  fontWeight={selectedDayIdx === i ? 800 : 600}
                >
                  {p.label}
                </text>
              ))}
            </svg>
          </div>
        </div>

      </div>
    </div>
  )
}
