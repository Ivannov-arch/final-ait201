import { useState, useEffect, useCallback } from 'react'
import DashboardSidebar from './DashboardSidebar'
import DashboardHeader from './DashboardHeader'
import KpiStrip from './KpiStrip'
import ProfitDailyChart from './FoodRescuedTrendChart'
import ReasonForRecoveryChart from './ReasonForRecoveryChart'
import RecentActivitiesTable from './RecentActivitiesTable'
import { INITIAL_ACTIVITIES } from './activitiesData'
import { INITIAL_BATCHES } from './inventoryData'
import SalesLogPage from './SalesLogPage'
import DemandForecastingPage from './DemandForecastingPage'
import InventoryFefoRiskPage from './InventoryFefoRiskPage'
import DispatchPage from './DispatchPage'
import { supabase, supabaseRowToBatch } from '../../services/supabase'
import './dashboard.css'

export default function DashboardPage({ onNavigateHome }) {
  const [activeNav, setActiveNav] = useState('operations')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [inventoryFilter, setInventoryFilter] = useState('')

  const handleNavigateInventory = (batchCode = '') => {
    setInventoryFilter(typeof batchCode === 'string' ? batchCode : '')
    setActiveNav('inventory-risk')
  }

  // ── Inventory state: 100% sourced directly from inventory_master.json ────────
  const [batches, setBatches] = useState(INITIAL_BATCHES)
  const [batchesLoading, setBatchesLoading] = useState(true)
  const [activities, setActivities] = useState(INITIAL_ACTIVITIES)
  const [profit, setProfit] = useState(0)

  // Load latest inventory from Supabase Cloud (with seamless local fallback)
  useEffect(() => {
    async function loadBatches() {
      try {
        if (supabase) {
          const { data, error } = await supabase
            .from('batches')
            .select('*')
            .gt('quantity', 0)
            .order('days_to_expiry', { ascending: true })

          if (!error && Array.isArray(data) && data.length > 0) {
            console.log(
              `%c[FreshGuard Supabase] ⚡ Connected to Supabase Cloud (${data.length} batches live)`,
              'color: #16a34a; font-weight: bold;'
            )
            setBatches(data.map(supabaseRowToBatch))
            return
          }
        }
      } catch (err) {
        console.warn('[FreshGuard Supabase] Live connection skipped, falling back to local database:', err.message)
      }

      // Fallback: Local Vite API JSON
      fetch('/api/batches')
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) setBatches(data)
        })
        .catch(() => {})
    }

    loadBatches().finally(() => setBatchesLoading(false))
  }, [])

  // Helper: parse "RM 6.50/kg" → 6.50
  function parsePricePerUnit(priceStr) {
    if (!priceStr) return 0
    const match = priceStr.match(/[\d.]+/)
    return match ? parseFloat(match[0]) : 0
  }

  // Helper: parse "12 kg" / "24 pack" → 12
  function parseQtyNum(qtyStr) {
    if (!qtyStr) return 0
    const match = qtyStr.match(/[\d.]+/)
    return match ? parseFloat(match[0]) : 0
  }

  // Derived financial KPIs from live batches
  const totalAssets = batches.reduce((sum, b) => {
    return sum + parsePricePerUnit(b.sellPrice) * (b.stockQty !== undefined ? Number(b.stockQty) : parseQtyNum(b.qty))
  }, 0)
  const modal = batches.reduce((sum, b) => {
    return sum + parsePricePerUnit(b.costPrice) * (b.stockQty !== undefined ? Number(b.stockQty) : parseQtyNum(b.qty))
  }, 0)

  // Scroll to top on nav change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.title = activeNav === 'inventory-risk'
      ? 'FreshGuard — Stock Inventory (FEFO)'
      : activeNav === 'dispatch'
      ? 'FreshGuard — Waste-Risk & Smart Dispatch'
      : activeNav === 'demand-forecasting'
      ? 'FreshGuard — Demand Forecasting'
      : activeNav === 'sales-log'
      ? 'FreshGuard — Sales Log'
      : 'FreshGuard — Operations Dashboard'
    return () => {
      document.title = 'FreshGuard — Stop Spoilage Before It Starts'
    }
  }, [activeNav])

  const isMainView = activeNav === 'operations' || activeNav === 'dashboard'

  // Handler: apply action decision (markdown / donate) from Inventory
  // ── Calls Person 4 Rule Engine via /api/recommend to get real discount % ──
  const handleApplyActionDecision = async (batch, actionType) => {
    const qtyNum = batch.stockQty !== undefined ? Number(batch.stockQty) : (parseInt(batch.qty, 10) || 12)
    const pricePerUnit = (() => {
      if (batch.unitPrice !== undefined) return Number(batch.unitPrice)
      const src = batch.sellPrice || batch.costPrice || batch.price || ''
      const m = src.match(/[\d.]+/)
      return m ? parseFloat(m[0]) : 0
    })()

    // Compute total surplus volume across all batches (for Anti-Moral-Hazard 30% cap)
    const totalSurplusVolume = batches.reduce((s, b) => s + (b.stockQty !== undefined ? Number(b.stockQty) : 0), 0)
    const alreadyDonated = batches.reduce((s, b) => s + (b.appliedAction === 'donate' ? (b.stockQty !== undefined ? Number(b.stockQty) : 0) : 0), 0)

    // ── Ask Person 4 Rule Engine for the real recommendation ─────────────────
    let ruleDecision = null
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days_to_expiry:           batch.dteNum || 5,
          quantity:                 qtyNum,
          unit_price_myr:           pricePerUnit,
          demand_forecast_3d:       qtyNum * 0.6,   // conservative: 60% of stock as expected demand
          total_surplus_volume:     totalSurplusVolume,
          cumulative_donated_volume: alreadyDonated
        })
      })
      ruleDecision = await res.json()
    } catch (_) {
      // Rule engine unavailable — fall back to static 30% discount
    }

    let actionLabel = ''
    let statusLabel = 'Completed'
    let statusType = 'completed'
    let earnedValue = 0

    if (actionType === 'markdown') {
      // Use Person 4 Rule Engine discount if available, else fallback to 30%
      const discountFraction = ruleDecision?.discount_fraction ?? 0.30
      const discountPct = Math.round(discountFraction * 100)
      const discountedPrice = (pricePerUnit * (1 - discountFraction)).toFixed(2)
      const batchValue = pricePerUnit * qtyNum
      earnedValue = parseFloat(discountedPrice) * qtyNum

      actionLabel = `Sales · ${discountPct}% Dynamic Markdown`

      setBatches(prev => prev.map(b => b.id === batch.id ? {
        ...b,
        sellPrice: `RM ${discountedPrice}/${b.uom || 'unit'}`,
        unitPrice: parseFloat(discountedPrice),
        appliedAction: 'markdown',
        ruleEngineReason: ruleDecision?.reason || null,
        discountPercent: discountPct
      } : b))
      fetch(`/api/batches/${encodeURIComponent(batch.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_price_myr: discountedPrice })
      }).catch(() => {})

    } else if (actionType === 'donate') {
      // Check Anti-Moral-Hazard from Rule Engine: if moralHazardFlag, we redirect to markdown
      if (ruleDecision?.moral_hazard_flag) {
        // Donation quota exceeded — Rule Engine redirects to aggressive markdown
        const discountFraction = ruleDecision?.discount_fraction ?? 0.50
        const discountedPrice = (pricePerUnit * (1 - discountFraction)).toFixed(2)
        earnedValue = parseFloat(discountedPrice) * qtyNum
        actionLabel = `Sales · ${Math.round(discountFraction * 100)}% Aggressive Markdown (Anti-Moral-Hazard)`
        statusLabel = 'Redirected'

        setBatches(prev => prev.map(b => b.id === batch.id ? {
          ...b,
          sellPrice: `RM ${discountedPrice}/${b.uom || 'unit'}`,
          unitPrice: parseFloat(discountedPrice),
          appliedAction: 'markdown',
          ruleEngineReason: ruleDecision?.reason || null,
          discountPercent: Math.round(discountFraction * 100)
        } : b))
        fetch(`/api/batches/${encodeURIComponent(batch.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unit_price_myr: discountedPrice })
        }).catch(() => {})
      } else {
        actionLabel = 'Food Bank · NGO Dispatch (closed_ngo channel)'
        statusLabel = 'Dispatched'
        earnedValue = 0

        setBatches(prev => prev.filter(b => b.id !== batch.id))
        fetch(`/api/batches/${encodeURIComponent(batch.id)}`, {
          method: 'DELETE'
        }).catch(() => {})
      }

    } else {
      return
    }

    setProfit(prev => prev + earnedValue)

    const riskTierMap = { high: 'High', med: 'Moderate', low: 'Low' }
    const riskTierLabel = riskTierMap[batch.riskType] || 'Low'
    const now = new Date()
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const newActivity = {
      time: timeStr,
      batch: batch.id,
      product: batch.product,
      category: batch.category,
      image: batch.image || 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=80&auto=format&fit=crop&q=80',
      action: actionLabel,
      quantity: batch.qty,
      status: statusLabel,
      statusType,
      riskTier: riskTierLabel
    }

    setActivities(prev => {
      const remaining = prev.filter(a => a.batch !== batch.id)
      return [newActivity, ...remaining]
    })
  }

  // Handler: delete batch → DELETE directly from inventory_master.json
  const handleDeleteBatch = useCallback((deletedBatch) => {
    setActivities(prev => prev.filter(a => a.batch !== deletedBatch.id))
    // Remove from local state immediately
    setBatches(prev => prev.filter(b => b.id !== deletedBatch.id))
    // Persist deletion directly to inventory_master.json
    fetch(`/api/batches/${encodeURIComponent(deletedBatch.id)}`, {
      method: 'DELETE'
    }).catch(() => {})
  }, [])

  // Handler: add batch → POST to /api/batches → saves directly to inventory_master.json
  const handleAddBatch = useCallback((newBatch) => {
    // Optimistic UI: add to local state immediately
    setBatches(prev => {
      const exists = prev.some(b => b.id === newBatch.id)
      return exists ? prev : [newBatch, ...prev]
    })
    // Write directly to inventory_master.json via Vite API
    fetch('/api/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBatch)
    })
      .then(r => r.json())
      .then(result => {
        if (result?.batch) {
          setBatches(prev => prev.map(b => b.id === result.batch.id ? result.batch : b))
        }
      })
      .catch(() => {})
  }, [])

  // Handler: sale recorded → PATCH quantity directly in inventory_master.json
  // If qty reaches 0 → server auto-removes it from inventory_master.json
  const handleSaleRecorded = useCallback((sale) => {
    setProfit(prev => prev + (Number(sale.total) || 0))

    const riskTierMap = { high: 'High', med: 'Moderate', low: 'Low' }
    const batch = batches.find(b => b.id === sale.batchId)
    const riskTierLabel = batch ? (riskTierMap[batch.riskType] || 'Low') : 'Low'

    const newActivity = {
      time: sale.time,
      batch: sale.batchId,
      product: sale.product,
      category: sale.category,
      image: sale.image || 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=80&auto=format&fit=crop&q=80',
      action: `Sales · Cashier POS (${sale.payMethod})`,
      quantity: `${sale.qty} ${sale.unit}`,
      status: 'Sold',
      statusType: 'completed',
      riskTier: riskTierLabel
    }
    setActivities(prev => {
      const remaining = prev.filter(a => a.batch !== sale.batchId)
      return [newActivity, ...remaining]
    })

    // Persist transaction directly to transactions.json
    fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sale)
    }).catch(() => {})

    // PATCH quantity directly in inventory_master.json + Supabase Cloud
    if (sale.batchId) {
      const currentQty = batch
        ? (batch.stockQty !== undefined ? Number(batch.stockQty) : parseQtyNum(batch.qty))
        : (Number(sale.qty) || 10)
      const newQty = Math.max(0, currentQty - Number(sale.qty || 0))

      // Optimistic update in local state
      if (batch) {
        if (newQty <= 0) {
          // Stock depleted — remove from local state
          setBatches(prev => prev.filter(b => b.id !== sale.batchId))
        } else {
          setBatches(prev => prev.map(b => b.id !== sale.batchId ? b : {
            ...b,
            stockQty: newQty,
            qty: `${newQty} ${sale.unit || b.uom || 'units'}`
          }))
        }
      }

      // Persist directly to inventory_master.json + Supabase Cloud (auto-deleted if qty <= 0)
      fetch(`/api/batches/${encodeURIComponent(sale.batchId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQty })
      }).catch(() => {})
    }
  }, [batches])

  return (
    <div className="fg-dashboard-root">
      {/* Sidebar navigation */}
      <DashboardSidebar
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        onNavigateHome={onNavigateHome}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content body */}
      <main className="fg-main">
        {/* Render DashboardHeader ONLY when on Dashboard/Operations view to avoid duplicate headers! */}
        {isMainView && (
          <DashboardHeader
            title="Operations Dashboard"
            subtitle="Real-time inventory valuation, cashier profit, and food bank redistribution."
            onToggleSidebar={() => setSidebarOpen(prev => !prev)}
          />
        )}

        {isMainView ? (
          <>
            {/* Top 4 KPI metric cards - synced with batch financials */}
            <KpiStrip
              totalAssets={totalAssets}
              modal={modal}
              profit={profit}
              activeBatchesCount={batches.length}
              onNavigateInventory={() => handleNavigateInventory('')}
            />

            {/* Middle row: Trend bar chart + Reason for recovery donut chart */}
            <div className="fg-charts-row">
              <ProfitDailyChart liveProfit={profit} />
              <ReasonForRecoveryChart batches={batches} />
            </div>

            {/* Bottom section: Full-width recent activities stream synced with Inventory actions */}
            <div className="fg-bottom-row">
              <RecentActivitiesTable
                activities={activities}
                onNavigateInventory={handleNavigateInventory}
              />
            </div>
          </>
        ) : activeNav === 'inventory-risk' ? (
          <InventoryFefoRiskPage
            batches={batches}
            onUpdateBatches={setBatches}
            onApplyAction={handleApplyActionDecision}
            onDeleteBatch={handleDeleteBatch}
            onAddBatch={handleAddBatch}
            onToggleSidebar={() => setSidebarOpen(prev => !prev)}
            initialSearch={inventoryFilter}
          />
        ) : activeNav === 'sales-log' ? (
          <SalesLogPage
            batches={batches}
            onUpdateBatches={setBatches}
            onSaleRecorded={handleSaleRecorded}
            onToggleSidebar={() => setSidebarOpen(prev => !prev)}
          />
        ) : activeNav === 'demand-forecasting' ? (
          <DemandForecastingPage
            batches={batches}
            onToggleSidebar={() => setSidebarOpen(prev => !prev)}
          />
        ) : activeNav === 'dispatch' ? (
          <DispatchPage
            batches={batches}
            onUpdateBatches={setBatches}
            onApplyAction={handleApplyActionDecision}
            onToggleSidebar={() => setSidebarOpen(prev => !prev)}
          />
        ) : (
          <div className="fg-card fg-module-view">
            <div className="fg-module-view__badge">Module Active</div>
            <h2 className="fg-card__title" style={{ fontSize: 'clamp(1.4rem,2vw,1.75rem)', marginBottom: '0.6rem', textWrap: 'balance' }}>
              {activeNav.charAt(0).toUpperCase() + activeNav.slice(1).replace(/-/g, ' ')}
            </h2>
            <p className="fg-module-view__desc">
              Real-time telemetry and POS clearance synchronization are operating in the background. Automated alerts are routed to store department floor supervisors.
            </p>

            <div className="fg-module-view__meta">
              <div className="fg-module-view__metric">
                <span className="fg-module-view__val">100%</span>
                <span className="fg-module-view__lbl">Feed Uptime</span>
              </div>
              <div className="fg-module-view__metric">
                <span className="fg-module-view__val">&lt; 1.2s</span>
                <span className="fg-module-view__lbl">Sync Latency</span>
              </div>
              <div className="fg-module-view__metric">
                <span className="fg-module-view__val">0</span>
                <span className="fg-module-view__lbl">Critical Drift</span>
              </div>
            </div>

            <button
              type="button"
              className="fg-module-view__btn"
              onClick={() => setActiveNav('operations')}
            >
              Return to Operations Dashboard
            </button>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fg-mobile-bottom-nav" aria-label="Mobile Navigation">
        <button
          type="button"
          className={`fg-mobile-nav-btn ${isMainView ? 'is-active' : ''}`}
          onClick={() => setActiveNav('operations')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Overview</span>
        </button>

        <button
          type="button"
          className={`fg-mobile-nav-btn ${activeNav === 'inventory-risk' ? 'is-active' : ''}`}
          onClick={() => setActiveNav('inventory-risk')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
          </svg>
          <span>Inventory</span>
        </button>

        <button
          type="button"
          className={`fg-mobile-nav-btn ${activeNav === 'sales-log' ? 'is-active' : ''}`}
          onClick={() => setActiveNav('sales-log')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          <span>Sales</span>
        </button>

        <button
          type="button"
          className={`fg-mobile-nav-btn ${activeNav === 'demand-forecasting' ? 'is-active' : ''}`}
          onClick={() => setActiveNav('demand-forecasting')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <span>Forecast</span>
        </button>

        <button
          type="button"
          className="fg-mobile-nav-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open More Menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
          <span>More</span>
        </button>
      </nav>
    </div>
  )
}
