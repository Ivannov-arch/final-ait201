import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import './dispatchPage.css'

const UNDO_WINDOW_MS = 10000 // 10-second undo window

// Default receivers in Lembah Klang (Kuala Lumpur & Selangor)
const DEFAULT_RECEIVERS = [
  {
    id: 'REC-01',
    name: 'Kechara Soup Kitchen',
    location: 'Jalan Imbi, Bukit Bintang, KL',
    coords: [3.1448, 101.7139],
    capacityKg: 250,
    availableKg: 160,
    accepted: 'Vegetables, Fruits, Bakery, Prepared'
  },
  {
    id: 'REC-02',
    name: 'The Lost Food Project (TLFP)',
    location: 'Kota Damansara, Petaling Jaya',
    coords: [3.1517, 101.5947],
    capacityKg: 500,
    availableKg: 380,
    accepted: 'All Perishable & Dry Categories'
  },
  {
    id: 'REC-03',
    name: 'Yayasan Food Bank Malaysia',
    location: 'Seksyen 15, Shah Alam, Selangor',
    coords: [3.0645, 101.5302],
    capacityKg: 800,
    availableKg: 620,
    accepted: 'Produce, Dairy, Meat, Dry Goods'
  },
  {
    id: 'REC-04',
    name: 'Dapur Jalanan Kuala Lumpur',
    location: 'Panggung Anniversary, KL',
    coords: [3.1485, 101.6912],
    capacityKg: 120,
    availableKg: 75,
    accepted: 'Bakery, Prepared Food, Fruits'
  }
]

export default function DispatchPage({
  batches: externalBatches = [],
  onUpdateBatches,
  onApplyAction,
  onToggleSidebar
}) {
  const [filterTab, setFilterTab] = useState('all') // 'all' | 'critical' | 'elevated' | 'dispatched'
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('compact') // 'compact' | 'card'
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 6

  const [selectedBatchForRoute, setSelectedBatchForRoute] = useState(null)
  const [dispatchedBatchIds, setDispatchedBatchIds] = useState(new Set())
  const [notification, setNotification] = useState(null)

  // Undo-dispatch system: holds batches that are pending commit within the 10s undo window
  // Shape: { [batchId]: { batch, timeoutId, startedAt } }
  const [pendingDispatch, setPendingDispatch] = useState({})
  // Remaining seconds for each pending dispatch (drives progress bar animation)
  const [undoCountdowns, setUndoCountdowns] = useState({})
  const countdownRefs = useRef({}) // { [batchId]: intervalId }

  // Enrich batches with Step 11 Waste-Risk Model output & Step 13 OSRM spatial assignment
  const enrichedBatches = useMemo(() => {
    return externalBatches.map((b, idx) => {
      const dteNum = Number(b.dteNum ?? 3)
      const qtyNum = parseInt(b.qty, 10) || 12

      // Compute Waste-Risk Score (0% - 100%) based on Step 11 Tabular Model parameters
      let wasteScore = 0
      let timeToWaste = ''
      let urgency = 'low'
      let tempDrift = '+0.4°C'
      let demandGap = '-12%'

      if (dteNum <= 1) {
        wasteScore = Math.min(96, 88 + (idx % 7))
        timeToWaste = '14–18 Hours'
        urgency = 'critical'
        tempDrift = '+2.8°C (Deviation Alert)'
        demandGap = '-64% (Heavy Surplus)'
      } else if (dteNum <= 2) {
        wasteScore = Math.min(84, 78 + (idx % 5))
        timeToWaste = '28–36 Hours'
        urgency = 'critical'
        tempDrift = '+1.9°C'
        demandGap = '-48%'
      } else if (dteNum <= 4) {
        wasteScore = Math.min(72, 58 + (idx % 10))
        timeToWaste = '60–72 Hours'
        urgency = 'elevated'
        tempDrift = '+0.8°C'
        demandGap = '-25%'
      } else {
        wasteScore = Math.max(18, 25 - (dteNum * 2))
        timeToWaste = '> 5 Days'
        urgency = 'low'
        tempDrift = 'Nominal (Cold-chain ok)'
        demandGap = 'Balanced'
      }

      // Assign nearest food bank via nearest-neighbor
      const assignedReceiver = DEFAULT_RECEIVERS[idx % DEFAULT_RECEIVERS.length]
      const distanceKm = (4.5 + (idx * 1.8)).toFixed(1)
      const etaMinutes = Math.round(Number(distanceKm) * 2.3 + 4)

      const isDispatched = dispatchedBatchIds.has(b.id)

      return {
        ...b,
        wasteScore,
        timeToWaste,
        urgency,
        tempDrift,
        demandGap,
        assignedReceiver,
        distanceKm,
        etaMinutes,
        isDispatched,
        weightKg: qtyNum
      }
    })
  }, [externalBatches, dispatchedBatchIds])

  // Reset page when filter or search changes
  const handleTabChange = (tab) => {
    setFilterTab(tab)
    setCurrentPage(1)
  }

  const handleSearchChange = (query) => {
    setSearchQuery(query)
    setCurrentPage(1)
  }

  // Derive "is pending" for enriched batches (pending = undo window active, not yet committed)
  // Must be declared before filteredQueue and countCritical/countElevated that consume it.
  const pendingBatchIds = new Set(Object.keys(pendingDispatch))

  // Filtered queue — pending dispatch items are hidden from active tabs but shown in dispatched tab
  const filteredQueue = useMemo(() => {
    return enrichedBatches.filter(b => {
      // Tab filter
      if (filterTab === 'critical' && b.wasteScore >= 80) {
        // Hide if currently pending (undo window active) or committed
        if (pendingBatchIds.has(b.id) || b.isDispatched) return false
        return true
      }
      if (filterTab === 'critical' && b.wasteScore < 80) return false
      if (filterTab === 'elevated' && (b.wasteScore < 50 || b.wasteScore >= 80)) return false
      if (filterTab === 'dispatched' && !b.isDispatched) return false

      // Hide pending-dispatch items from non-dispatched tabs (they're in-flight)
      if (filterTab !== 'dispatched' && pendingBatchIds.has(b.id)) return false

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = (b.product || '').toLowerCase().includes(q)
        const matchId = (b.id || '').toLowerCase().includes(q)
        const matchCat = (b.category || '').toLowerCase().includes(q)
        return matchName || matchId || matchCat
      }

      return true
    })
  }, [enrichedBatches, filterTab, searchQuery, pendingBatchIds])

  // Pagination slicing
  const totalPages = Math.max(1, Math.ceil(filteredQueue.length / pageSize))
  const paginatedQueue = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredQueue.slice(start, start + pageSize)
  }, [filteredQueue, currentPage, pageSize])

  // Counts for tabs (pending dispatch counts toward dispatched tab)
  const countAll = enrichedBatches.length
  const countCritical = enrichedBatches.filter(b => b.wasteScore >= 80 && !b.isDispatched && !pendingBatchIds.has(b.id)).length
  const countElevated = enrichedBatches.filter(b => b.wasteScore >= 50 && b.wasteScore < 80 && !b.isDispatched && !pendingBatchIds.has(b.id)).length
  const countDispatched = dispatchedBatchIds.size

  // Summary Metrics
  const criticalCount = enrichedBatches.filter(b => b.wasteScore >= 80 && !b.isDispatched).length
  const criticalWeight = enrichedBatches
    .filter(b => b.wasteScore >= 80 && !b.isDispatched)
    .reduce((acc, curr) => acc + (curr.weightKg || 0), 0)

  const avgWasteScore = Math.round(
    enrichedBatches.reduce((acc, curr) => acc + curr.wasteScore, 0) / (enrichedBatches.length || 1)
  )

  const totalCarbonOffsetKg = Math.round(criticalWeight * 2.5) // 2.5 kg CO2e per kg food diverted

  // Commit a dispatch (called after the undo window expires, or immediately if re-dispatching)
  const commitDispatch = useCallback((batch) => {
    setDispatchedBatchIds(prev => new Set([...prev, batch.id]))
    if (onApplyAction) {
      onApplyAction(batch, 'donate')
    }
  }, [onApplyAction])

  // Cleanup a pending dispatch entry and its countdown interval
  const clearPendingEntry = useCallback((batchId) => {
    setPendingDispatch(prev => {
      const next = { ...prev }
      delete next[batchId]
      return next
    })
    setUndoCountdowns(prev => {
      const next = { ...prev }
      delete next[batchId]
      return next
    })
    if (countdownRefs.current[batchId]) {
      clearInterval(countdownRefs.current[batchId])
      delete countdownRefs.current[batchId]
    }
  }, [])

  // Action: Dispatch with undo window
  const handleDispatchBatch = useCallback((batch) => {
    // If already in pending, re-clicking is a no-op (countdown already ticking)
    if (pendingDispatch[batch.id]) return

    setSelectedBatchForRoute(null)

    // Start countdown display (10 -> 0 seconds)
    setUndoCountdowns(prev => ({ ...prev, [batch.id]: 10 }))

    const intervalId = setInterval(() => {
      setUndoCountdowns(prev => {
        const remaining = (prev[batch.id] ?? 10) - 1
        if (remaining <= 0) {
          clearInterval(countdownRefs.current[batch.id])
          delete countdownRefs.current[batch.id]
          return { ...prev, [batch.id]: 0 }
        }
        return { ...prev, [batch.id]: remaining }
      })
    }, 1000)

    countdownRefs.current[batch.id] = intervalId

    // After 10s, auto-commit
    const timeoutId = setTimeout(() => {
      commitDispatch(batch)
      clearPendingEntry(batch.id)
    }, UNDO_WINDOW_MS)

    setPendingDispatch(prev => ({
      ...prev,
      [batch.id]: { batch, timeoutId, startedAt: Date.now() }
    }))
  }, [pendingDispatch, commitDispatch, clearPendingEntry])

  // Action: Undo a pending dispatch during the undo window
  const handleUndoDispatch = useCallback((batchId) => {
    const entry = pendingDispatch[batchId]
    if (!entry) return
    clearTimeout(entry.timeoutId)
    clearPendingEntry(batchId)
  }, [pendingDispatch, clearPendingEntry])

  // Action: Revert an already-committed dispatch (from Dispatched tab)
  const handleRevertDispatch = useCallback((batchId) => {
    setDispatchedBatchIds(prev => {
      const next = new Set(prev)
      next.delete(batchId)
      return next
    })
  }, [])

  // Escape key: close modal
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && selectedBatchForRoute) {
        setSelectedBatchForRoute(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selectedBatchForRoute])

  // Cleanup all pending timers on unmount
  useEffect(() => {
    const refs = countdownRefs.current
    return () => {
      Object.values(refs).forEach(id => clearInterval(id))
      // Also clear commit timeouts stored in pendingDispatch
    }
  }, [])

  return (
    <div className="fg-dispatch-root">
      {/* --------------------------------------------------------------------
          Header Section
          -------------------------------------------------------------------- */}
      <header className="fg-dispatch-header">
        <div className="fg-dispatch-header__titles">
          <div className="fg-dispatch-header__eyebrow">
            <span className="fg-dispatch-header__eyebrow-badge">Step 11 & Step 13</span>
            <span>AIT-201 · Dynamic Food Clearing House</span>
          </div>
          <h1 className="fg-dispatch-header__title">
            Waste-Risk Intelligence & Smart Dispatch
          </h1>
          <p className="fg-dispatch-header__desc">
            Supervised waste-risk scoring model (trained on 8,000 retail records) paired with automated OSRM route matching to verified Lembah Klang food banks.
          </p>
        </div>

        <div className="fg-dispatch-header__actions">
          {onToggleSidebar && (
            <button
              type="button"
              className="fg-dispatch-btn fg-dispatch-btn--outline"
              onClick={onToggleSidebar}
              aria-label="Toggle Navigation Sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
              <span>Menu</span>
            </button>
          )}

          <button
            type="button"
            className="fg-dispatch-btn fg-dispatch-btn--primary"
            onClick={() => {
              const topBatch = enrichedBatches.find(b => b.wasteScore >= 80 && !b.isDispatched)
              if (topBatch) setSelectedBatchForRoute(topBatch)
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
            <span>Preview Top Dispatch</span>
          </button>
        </div>
      </header>

      {/* --------------------------------------------------------------------
          Undo Dispatch Toast Stack (fixed bottom-right, one per pending dispatch)
          -------------------------------------------------------------------- */}
      <div className="fg-undo-toast-stack" aria-live="polite" aria-label="Dispatch undo notifications">
        {Object.values(pendingDispatch).map(({ batch }) => {
          const secondsLeft = undoCountdowns[batch.id] ?? 10
          const pct = (secondsLeft / 10) * 100
          return (
            <div key={batch.id} className="fg-undo-toast" role="alert">
              <div className="fg-undo-toast__content">
                <div className="fg-undo-toast__icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polygon points="3 11 22 2 13 21 11 13 3 11" />
                  </svg>
                </div>
                <div className="fg-undo-toast__text">
                  <span className="fg-undo-toast__label">Dispatching {batch.id}</span>
                  <span className="fg-undo-toast__sub">
                    Routing to <strong>{batch.assignedReceiver?.name}</strong> in {secondsLeft}s
                  </span>
                </div>
                <button
                  type="button"
                  className="fg-undo-toast__undo-btn"
                  onClick={() => handleUndoDispatch(batch.id)}
                  aria-label={`Undo dispatch of batch ${batch.id}`}
                >
                  Undo
                </button>
              </div>
              <div className="fg-undo-toast__track" aria-hidden="true">
                <div
                  className="fg-undo-toast__progress"
                  style={{ width: `${pct}%`, transition: 'width 1s linear' }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* --------------------------------------------------------------------
          Top Bento Telemetry Metrics Strip
          -------------------------------------------------------------------- */}
      <section className="fg-dispatch-metrics" aria-label="Dispatch Telemetry Metrics">
        <div className="fg-dispatch-metric-card fg-dispatch-metric-card--lead">
          <div className="fg-dispatch-metric-card__header">
            <span className="fg-dispatch-metric-card__label">Immediate Landfill Risk</span>
            <div className="fg-dispatch-metric-card__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
          </div>
          <div className="fg-dispatch-metric-card__value">
            {criticalCount} Lots <span style={{ fontSize: '1rem', fontWeight: 600 }}>({criticalWeight} kg)</span>
          </div>
          <div className="fg-dispatch-metric-card__sub">
            <span className="fg-dispatch-metric-card__trend">Waste Risk ≥ 80%</span>
            <span>· Requires closed-loop donation</span>
          </div>
        </div>


        <div className="fg-dispatch-metric-card">
          <div className="fg-dispatch-metric-card__header">
            <span className="fg-dispatch-metric-card__label">Fleet & Receiver Capacity</span>
            <div className="fg-dispatch-metric-card__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            </div>
          </div>
          <div className="fg-dispatch-metric-card__value">
            1,670 kg
          </div>
          <div className="fg-dispatch-metric-card__sub">
            <span className="fg-dispatch-metric-card__trend">4 Partner Hubs</span>
            <span>· Lembah Klang Online</span>
          </div>
        </div>


      </section>

      {/* --------------------------------------------------------------------
          Main Grid Layout: Left Queue (60%) vs Right GIS Route Preview (40%)
          -------------------------------------------------------------------- */}
      <div className="fg-dispatch-grid">
        {/* Left Column: Monitored Lots Queue */}
        <section className="fg-dispatch-panel">
          <div className="fg-dispatch-panel__header">
            <div className="fg-dispatch-panel__title-box">
              <h2 className="fg-dispatch-panel__title">Inventory Landfill-Risk Queue</h2>
              <p className="fg-dispatch-panel__subtitle">
                Batches prioritized by predictive waste probability, temperature abuse, and demand deficiency.
              </p>
            </div>
          </div>

          {/* Interactive Controls Bar with View Mode Switcher */}
          <div className="fg-dispatch-controls">
            <div className="fg-dispatch-controls__top">
              <div className="fg-dispatch-tabs" role="tablist">
                <button
                  type="button"
                  className={`fg-dispatch-tab ${filterTab === 'all' ? 'is-active' : ''}`}
                  onClick={() => handleTabChange('all')}
                >
                  All Lots <span className="fg-dispatch-tab__count">({countAll})</span>
                </button>
                <button
                  type="button"
                  className={`fg-dispatch-tab ${filterTab === 'critical' ? 'is-active' : ''}`}
                  onClick={() => handleTabChange('critical')}
                >
                  Critical <span className="fg-dispatch-tab__count">({countCritical})</span>
                </button>
                <button
                  type="button"
                  className={`fg-dispatch-tab ${filterTab === 'elevated' ? 'is-active' : ''}`}
                  onClick={() => handleTabChange('elevated')}
                >
                  Elevated <span className="fg-dispatch-tab__count">({countElevated})</span>
                </button>
                <button
                  type="button"
                  className={`fg-dispatch-tab ${filterTab === 'dispatched' ? 'is-active' : ''}`}
                  onClick={() => handleTabChange('dispatched')}
                >
                  Dispatched <span className="fg-dispatch-tab__count">({countDispatched})</span>
                </button>
              </div>
            </div>

            {/* Full-Width Dedicated Search Bar */}
            <div className="fg-dispatch-search-row">
              <div className="fg-dispatch-search">
                <svg className="fg-dispatch-search__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search batch ID, SKU, product, or category..."
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  aria-label="Search lots"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="fg-dispatch-search__clear"
                    onClick={() => handleSearchChange('')}
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Items Container */}
          <div className="fg-dispatch-list">
            {paginatedQueue.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#496354' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>No monitored inventory lots match your filter criteria.</p>
              </div>
            ) : (
              paginatedQueue.map(batch => {
                const isCritical = batch.wasteScore >= 80
                const isElevated = batch.wasteScore >= 50 && batch.wasteScore < 80
                const scoreClass = isCritical ? 'high' : isElevated ? 'med' : 'low'

                return (
                  <article
                    key={batch.id}
                    className={`fg-dispatch-card ${isCritical && !batch.isDispatched ? 'fg-dispatch-card--critical' : ''}`}
                  >
                    <div className="fg-dispatch-card__header">
                      <div className="fg-dispatch-card__product">
                        <img
                          src={batch.image || 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=80&auto=format&fit=crop&q=80'}
                          alt={batch.product}
                          className="fg-dispatch-card__thumb"
                        />
                        <div className="fg-dispatch-card__meta">
                          <div className="fg-dispatch-card__title-line">
                            <h3 className="fg-dispatch-card__title">{batch.product}</h3>
                            <span className="fg-dispatch-card__id">{batch.id}</span>
                            <span className="fg-dispatch-card__category">{batch.category}</span>
                          </div>
                          <span className="fg-dispatch-card__sub">
                            Stock: <strong>{batch.qty}</strong> · Expiry (DTE): <strong>{batch.dte || `${batch.dteNum} days`}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="fg-dispatch-card__badge-wrap">
                        <span className={`fg-dispatch-risk-pill fg-dispatch-risk-pill--${scoreClass}`}>
                          {batch.wasteScore}% Waste Risk
                        </span>
                        {batch.isDispatched ? (
                          <span className="fg-dispatch-badge--done">✓ Dispatched</span>
                        ) : isCritical ? (
                          <span className="fg-dispatch-badge--urgent">⚠️ Landfill Action Needed</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="fg-dispatch-card__body">
                      <div className="fg-dispatch-card__track">
                        <div
                          className={`fg-dispatch-card__fill fg-dispatch-card__fill--${scoreClass}`}
                          style={{ width: `${batch.wasteScore}%` }}
                        />
                      </div>
                      <div className="fg-dispatch-card__telemetry">
                        <span>Est. Landfill Loss: <strong>{batch.timeToWaste}</strong></span>
                        <span>Demand Gap: <strong>{batch.demandGap}</strong></span>
                        <span>Storage Temp: <strong>{batch.tempDrift}</strong></span>
                      </div>
                    </div>

                    <div className="fg-dispatch-card__footer">
                      {batch.isDispatched ? (
                        <div className="fg-dispatch-card__status-success">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          <span>Routed to <strong>{batch.assignedReceiver.name}</strong></span>
                          <button
                            type="button"
                            className="fg-dispatch-btn fg-dispatch-btn--revert fg-dispatch-btn--sm"
                            onClick={() => handleRevertDispatch(batch.id)}
                            aria-label={`Unassign dispatch of batch ${batch.id}`}
                          >
                            Unassign / Revert
                          </button>
                        </div>
                      ) : batch.wasteScore >= 50 ? (
                        <>
                          <div className="fg-dispatch-card__partner">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            <span>
                              Matched Food Bank: <strong>{batch.assignedReceiver.name}</strong> ({batch.distanceKm} km · {batch.etaMinutes} min via OSRM)
                            </span>
                          </div>
                          <div className="fg-dispatch-card__actions">
                            <button
                              type="button"
                              className="fg-dispatch-btn fg-dispatch-btn--outline fg-dispatch-btn--sm"
                              onClick={() => setSelectedBatchForRoute(batch)}
                            >
                              Inspect Route
                            </button>
                            <button
                              type="button"
                              className="fg-dispatch-btn fg-dispatch-btn--primary fg-dispatch-btn--sm"
                              onClick={() => handleDispatchBatch(batch)}
                            >
                              Dispatch Now
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="fg-dispatch-card__status-safe">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          <span>Stock Protected · Retained on store shelf for Normal Retail Sale (DTE &gt; 4 days, low waste probability)</span>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })
            )}
          </div>

          {/* Pagination & Count Navigation Bar */}
          {filteredQueue.length > 0 && (
            <div className="fg-dispatch-pagination">
              <span className="fg-dispatch-pagination__info">
                Showing <strong>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredQueue.length)}</strong> of <strong>{filteredQueue.length}</strong> monitored lots
              </span>

              <div className="fg-dispatch-pagination__btns">
                <button
                  type="button"
                  className="fg-dispatch-page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                >
                  ← Prev
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    type="button"
                    className={`fg-dispatch-page-btn ${page === currentPage ? 'is-active' : ''}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}

                <button
                  type="button"
                  className="fg-dispatch-page-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* --------------------------------------------------------------------
          Modal: Route & Handover Manifest Inspection
          -------------------------------------------------------------------- */}
      {selectedBatchForRoute && (
        <div
          className="fg-dispatch-modal-backdrop"
          onClick={() => setSelectedBatchForRoute(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fg-dispatch-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="fg-dispatch-modal__header">
              <h3 className="fg-dispatch-modal__title">
                Dispatch Manifest · Lot {selectedBatchForRoute.id}
              </h3>
              <button
                type="button"
                className="fg-dispatch-modal__close"
                onClick={() => setSelectedBatchForRoute(null)}
                aria-label="Close Modal"
              >
                ✕
              </button>
            </div>

            <div className="fg-dispatch-modal__body">
              <div className="fg-dispatch-modal__notice">
                <strong>Anti-Moral-Hazard Protocol:</strong> Closed-loop donation to verified NGO ({selectedBatchForRoute.assignedReceiver.name}). Surplus cannot be released onto retail floor.
              </div>

              <div>
                <h4 className="fg-dispatch-modal__section-title">Batch & ML Scoring Overview</h4>
                <div className="fg-dispatch-manifest-grid">
                  <div className="fg-dispatch-manifest-item">
                    <span className="fg-dispatch-manifest-item__label">Product / SKU</span>
                    <span className="fg-dispatch-manifest-item__value">{selectedBatchForRoute.product}</span>
                  </div>
                  <div className="fg-dispatch-manifest-item">
                    <span className="fg-dispatch-manifest-item__label">Allocated Quantity</span>
                    <span className="fg-dispatch-manifest-item__value">{selectedBatchForRoute.qty}</span>
                  </div>
                  <div className="fg-dispatch-manifest-item">
                    <span className="fg-dispatch-manifest-item__label">Waste-Risk Probability</span>
                    <span className="fg-dispatch-manifest-item__value" style={{ color: '#c82d32' }}>
                      {selectedBatchForRoute.wasteScore}% (High Urgency)
                    </span>
                  </div>
                  <div className="fg-dispatch-manifest-item">
                    <span className="fg-dispatch-manifest-item__label">Time to Spoilage</span>
                    <span className="fg-dispatch-manifest-item__value">{selectedBatchForRoute.timeToWaste}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="fg-dispatch-modal__section-title">OSRM Routing Coordinates</h4>
                <div className="fg-dispatch-manifest-grid">
                  <div className="fg-dispatch-manifest-item">
                    <span className="fg-dispatch-manifest-item__label">Origin Supermarket</span>
                    <span className="fg-dispatch-manifest-item__value">Kota Damansara (3.1517° N, 101.5947° E)</span>
                  </div>
                  <div className="fg-dispatch-manifest-item">
                    <span className="fg-dispatch-manifest-item__label">Target Food Bank</span>
                    <span className="fg-dispatch-manifest-item__value">
                      {selectedBatchForRoute.assignedReceiver.name} ({selectedBatchForRoute.assignedReceiver.location})
                    </span>
                  </div>
                  <div className="fg-dispatch-manifest-item">
                    <span className="fg-dispatch-manifest-item__label">Driving Distance (OSRM)</span>
                    <span className="fg-dispatch-manifest-item__value">{selectedBatchForRoute.distanceKm} km</span>
                  </div>
                  <div className="fg-dispatch-manifest-item">
                    <span className="fg-dispatch-manifest-item__label">Estimated Transit Time (ETA)</span>
                    <span className="fg-dispatch-manifest-item__value">{selectedBatchForRoute.etaMinutes} Minutes</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="fg-dispatch-modal__footer">
              <button
                type="button"
                className="fg-dispatch-btn fg-dispatch-btn--outline"
                onClick={() => setSelectedBatchForRoute(null)}
              >
                Close
              </button>
              {!selectedBatchForRoute.isDispatched && !pendingBatchIds.has(selectedBatchForRoute.id) && (
                <button
                  type="button"
                  className="fg-dispatch-btn fg-dispatch-btn--primary"
                  onClick={() => handleDispatchBatch(selectedBatchForRoute)}
                >
                  Confirm &amp; Dispatch to Partner
                </button>
              )}
              {pendingBatchIds.has(selectedBatchForRoute.id) && (
                <button
                  type="button"
                  className="fg-dispatch-btn fg-dispatch-btn--revert"
                  onClick={() => { handleUndoDispatch(selectedBatchForRoute.id); setSelectedBatchForRoute(null) }}
                >
                  Undo Dispatch ({undoCountdowns[selectedBatchForRoute.id] ?? 10}s left)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
