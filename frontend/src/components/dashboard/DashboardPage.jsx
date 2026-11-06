import { useState, useEffect } from 'react'
import DashboardSidebar from './DashboardSidebar'
import DashboardHeader from './DashboardHeader'
import KpiStrip from './KpiStrip'
import ProfitDailyChart from './FoodRescuedTrendChart'
import ReasonForRecoveryChart from './ReasonForRecoveryChart'
import RecentActivitiesTable from './RecentActivitiesTable'
import { INITIAL_ACTIVITIES } from './activitiesData'
import SalesLogPage from './SalesLogPage'
import DemandForecastingPage from './DemandForecastingPage'
import InventoryFefoRiskPage from './InventoryFefoRiskPage'
import DispatchPage from './DispatchPage'
import { INITIAL_BATCHES } from './inventoryData'
import './dashboard.css'

export default function DashboardPage({ onNavigateHome }) {
  const [activeNav, setActiveNav] = useState('operations')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [inventoryFilter, setInventoryFilter] = useState('')

  const handleNavigateInventory = (batchCode = '') => {
    setInventoryFilter(typeof batchCode === 'string' ? batchCode : '')
    setActiveNav('inventory-risk')
  }

  // Synchronized state across Dashboard and Inventory ("serentak")
  const [batches, setBatches] = useState(INITIAL_BATCHES)
  const [activities, setActivities] = useState(INITIAL_ACTIVITIES)
  const [profit, setProfit] = useState(0)

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
    return sum + parsePricePerUnit(b.sellPrice) * parseQtyNum(b.qty)
  }, 0)
  // Modal = procurement cost (cost price × qty)
  const modal = batches.reduce((sum, b) => {
    return sum + parsePricePerUnit(b.costPrice) * parseQtyNum(b.qty)
  }, 0)

  // Scroll to top upon landing on dashboard
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

  // Handler when user applies an Action Decision in Inventory:
  // Synchronously updates Inventory batch, adds to Recent Activities log, and updates Dashboard KPIs!
  const handleApplyActionDecision = (batch, actionType) => {
    const qtyNum = parseInt(batch.qty, 10) || 12
    const pricePerUnit = (() => {
      const src = batch.sellPrice || batch.costPrice || batch.price || ''
      const m = src.match(/[\d.]+/)
      return m ? parseFloat(m[0]) : 0
    })()
    const batchValue = pricePerUnit * qtyNum

    let actionLabel = ''
    let statusLabel = 'Completed'
    let statusType = 'completed'
    let earnedValue = 0

    if (actionType === 'markdown') {
      actionLabel = 'Sales · 30% Dynamic Markdown'
      earnedValue = batchValue * 0.70   // 70% of value recovered (30% discount)
    } else if (actionType === 'donate') {
      actionLabel = 'Food Bank · NGO Dispatch'
      statusLabel = 'Dispatched'
      earnedValue = 0                    // donation: no revenue
    } else {
      // Normal sale retained in store: stock is held, not a clearance sale or foodbank dispatch
      return
    }

    setProfit(prev => prev + earnedValue)

    // Use riskType enum ('high'|'med'|'low') for safe, stable riskTier label
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
      statusType: statusType,
      riskTier: riskTierLabel
    }

    // Deduplicate: replace any existing entry for this batch so it never appears twice
    setActivities(prev => {
      const remaining = prev.filter(a => a.batch !== batch.id)
      return [newActivity, ...remaining]
    })
  }

  // Handler when user deletes a batch
  const handleDeleteBatch = (deletedBatch) => {
    // Clean up activity entry for deleted batch so it doesn't linger
    setActivities(prev => prev.filter(a => a.batch !== deletedBatch.id))
  }

  // Handler when user adds a batch
  const handleAddBatch = (newBatch) => {
    setBatches(prev => {
      const exists = prev.some(b => b.id === newBatch.id)
      if (exists) return prev
      return [newBatch, ...prev]
    })
  }

  // Handler when a Sale is recorded from SalesLogPage
  const handleSaleRecorded = (sale) => {
    setProfit(prev => prev + sale.total)

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
  }

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
              <ProfitDailyChart />
              <ReasonForRecoveryChart />
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

      {/* Mobile Bottom Navigation Bar (Handheld Grocery Floor Ops Adaptation) */}
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
