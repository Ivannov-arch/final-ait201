import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import gsap from 'gsap'
import DashboardHeader from './DashboardHeader'
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

// Retail Category Color Mapping for Wayfinding
const getCategoryColorClass = (cat) => {
  const c = (cat || '').toLowerCase()
  if (c.includes('dairy') || c.includes('milk') || c.includes('cheese') || c.includes('yogurt')) return 'dairy'
  if (c.includes('produce') || c.includes('fruit') || c.includes('veg') || c.includes('salad') || c.includes('fresh')) return 'produce'
  if (c.includes('bake') || c.includes('bread') || c.includes('pastry') || c.includes('grain')) return 'bakery'
  if (c.includes('meat') || c.includes('poultry') || c.includes('chicken') || c.includes('beef') || c.includes('seafood') || c.includes('fish')) return 'meat'
  return 'default'
}


// GSAP Kinetic Counter Component (Respects prefers-reduced-motion)
function GsapCounter({ value, prefix = '', suffix = '', decimals = 0 }) {
  const nodeRef = useRef(null)
  const prevValRef = useRef(0)
  const mountedRef = useRef(false)

  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (nodeRef.current) {
        nodeRef.current.textContent = `${prefix}${Number(value || 0).toLocaleString('en-MY', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        })}${suffix}`
      }
      return
    }

    const targetVal = Number(value || 0)
    const startVal = mountedRef.current ? prevValRef.current : 0
    mountedRef.current = true
    prevValRef.current = targetVal

    const obj = { val: startVal }
    const tween = gsap.fromTo(
      obj,
      { val: startVal },
      {
        val: targetVal,
        duration: 1.1,
        ease: 'power3.out',
        onUpdate: () => {
          if (nodeRef.current) {
            nodeRef.current.textContent = `${prefix}${Math.round(obj.val).toLocaleString('en-MY')}${suffix}`
          }
        }
      }
    )

    return () => tween.kill()
  }, [value, prefix, suffix, decimals])

  return (
    <span ref={nodeRef}>
      {prefix}{Number(value || 0).toLocaleString('en-MY')}{suffix}
    </span>
  )
}

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

  // Bulk selection & safety override state
  const [selectedBatchIds, setSelectedBatchIds] = useState(new Set())
  const [safetyConfirmBatches, setSafetyConfirmBatches] = useState(null)

  // GSAP Kinetic Animation Refs
  const metricsRef = useRef(null)
  const queueListRef = useRef(null)
  const floatingBarRef = useRef(null)
  const prevSelectedCountRef = useRef(0)

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

  // Filtered queue — handles tabs and search without causing unmount blinks
  const filteredQueue = useMemo(() => {
    return enrichedBatches.filter(b => {
      const isHandled = b.isDispatched || pendingBatchIds.has(b.id)

      // Tab filter
      if (filterTab === 'critical') {
        if (b.wasteScore < 80 || isHandled) return false
        return true
      }
      if (filterTab === 'elevated') {
        if (b.wasteScore < 50 || b.wasteScore >= 80 || isHandled) return false
        return true
      }
      if (filterTab === 'dispatched') {
        if (!isHandled) return false
        return true
      }

      // 'all' tab displays every monitored lot continuously

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
  const countDispatched = dispatchedBatchIds.size + pendingBatchIds.size

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

  // Bulk selection derived state
  const selectedBatches = useMemo(() => {
    return enrichedBatches.filter(
      b => selectedBatchIds.has(b.id) && !b.isDispatched && !pendingBatchIds.has(b.id)
    )
  }, [enrichedBatches, selectedBatchIds, pendingBatchIds])

  const selectedTotalWeight = useMemo(() => {
    return selectedBatches.reduce((acc, curr) => acc + (curr.weightKg || 0), 0)
  }, [selectedBatches])

  const visibleEligibleIds = useMemo(() => {
    return paginatedQueue
      .filter(b => !b.isDispatched && !pendingBatchIds.has(b.id))
      .map(b => b.id)
  }, [paginatedQueue, pendingBatchIds])

  const isAllVisibleSelected = visibleEligibleIds.length > 0 && visibleEligibleIds.every(id => selectedBatchIds.has(id))

  const toggleSelectBatch = useCallback((batchId) => {
    setSelectedBatchIds(prev => {
      const next = new Set(prev)
      if (next.has(batchId)) {
        next.delete(batchId)
      } else {
        next.add(batchId)
      }
      return next
    })
  }, [])

  const selectAllVisible = useCallback(() => {
    setSelectedBatchIds(prev => {
      const next = new Set(prev)
      const allSelected = visibleEligibleIds.length > 0 && visibleEligibleIds.every(id => next.has(id))
      if (allSelected) {
        visibleEligibleIds.forEach(id => next.delete(id))
      } else {
        visibleEligibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }, [visibleEligibleIds])

  const selectAllCritical = useCallback(() => {
    const criticalBatches = enrichedBatches.filter(
      b => b.wasteScore >= 80 && !b.isDispatched && !pendingBatchIds.has(b.id)
    )
    setSelectedBatchIds(new Set(criticalBatches.map(b => b.id)))
  }, [enrichedBatches, pendingBatchIds])

  const clearSelection = useCallback(() => {
    setSelectedBatchIds(new Set())
  }, [])

  // Execute bulk dispatch across pre-matched food banks
  const executeBulkDispatch = useCallback((batchesToDispatch) => {
    batchesToDispatch.forEach(b => {
      handleDispatchBatch(b)
    })
    setSelectedBatchIds(new Set())
    setSafetyConfirmBatches(null)
  }, [handleDispatchBatch])

  // Trigger bulk dispatch with safety check for low-risk stock
  const handleBulkDispatchTrigger = useCallback(() => {
    if (selectedBatches.length === 0) return
    const lowRiskBatches = selectedBatches.filter(b => b.wasteScore < 50)
    if (lowRiskBatches.length > 0) {
      setSafetyConfirmBatches(selectedBatches)
    } else {
      executeBulkDispatch(selectedBatches)
    }
  }, [selectedBatches, executeBulkDispatch])

  // Undo all active pending dispatches
  const handleUndoAllPending = useCallback(() => {
    Object.keys(pendingDispatch).forEach(batchId => {
      handleUndoDispatch(batchId)
    })
  }, [pendingDispatch, handleUndoDispatch])

  // Escape key: close active modals
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (safetyConfirmBatches) {
          setSafetyConfirmBatches(null)
        } else if (selectedBatchForRoute) {
          setSelectedBatchForRoute(null)
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selectedBatchForRoute, safetyConfirmBatches])

  // Cleanup all pending timers on unmount
  useEffect(() => {
    const refs = countdownRefs.current
    return () => {
      Object.values(refs).forEach(id => clearInterval(id))
      // Also clear commit timeouts stored in pendingDispatch
    }
  }, [])

  // GSAP: Kinetic reveal for top metric cards
  useEffect(() => {
    if (!metricsRef.current) return
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const cards = metricsRef.current.querySelectorAll('.fg-dispatch-metric-card')
    gsap.fromTo(
      cards,
      { opacity: 0, y: -16, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.1, ease: 'power3.out' }
    )
  }, [])

  // GSAP: Staggered kinetic entrance for inventory queue cards & animated risk fills
  useEffect(() => {
    if (!queueListRef.current) return
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const cards = queueListRef.current.querySelectorAll('.fg-dispatch-card')
    if (cards.length === 0) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        cards,
        {
          opacity: 0,
          y: 22,
          scale: 0.98
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.45,
          stagger: 0.05,
          ease: 'power3.out',
          clearProps: 'transform,opacity'
        }
      )

      const fills = queueListRef.current.querySelectorAll('.fg-dispatch-card__fill')
      fills.forEach(fill => {
        const targetWidth = fill.getAttribute('data-target-width')
        if (targetWidth) {
          gsap.fromTo(
            fill,
            { width: '0%' },
            {
              width: targetWidth,
              duration: 0.85,
              delay: 0.1,
              ease: 'power2.out'
            }
          )
        }
      })
    }, queueListRef)

    return () => ctx.revert()
  }, [filterTab, currentPage, searchQuery])

  // GSAP: Elastic entrance & micro-bounce for floating bulk action bar
  useEffect(() => {
    if (!floatingBarRef.current || selectedBatches.length === 0) return
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const isFirstMount = prevSelectedCountRef.current === 0 && selectedBatches.length > 0
    if (isFirstMount) {
      gsap.fromTo(
        floatingBarRef.current,
        { y: 60, opacity: 0, scale: 0.9 },
        { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.5)' }
      )
    } else {
      const badge = floatingBarRef.current.querySelector('.fg-dispatch-floating-bar__badge')
      if (badge) {
        gsap.fromTo(
          badge,
          { scale: 1.3 },
          { scale: 1, duration: 0.28, ease: 'back.out(2)' }
        )
      }
    }
    prevSelectedCountRef.current = selectedBatches.length
  }, [selectedBatches.length])

  return (
    <div className="fg-dispatch-root">
      {/* --------------------------------------------------------------------
          Unified Header Section
          -------------------------------------------------------------------- */}
      <DashboardHeader
        title="Waste-Risk Intelligence & Smart Dispatch"
        subtitle="Supervised waste-risk scoring model (trained on 8,000 retail records) paired with automated OSRM route matching to verified Lembah Klang food banks."
        onToggleSidebar={onToggleSidebar}
        actions={
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
        }
      />

      {/* --------------------------------------------------------------------
          Undo Dispatch Toast Stack (fixed bottom-right, one per pending dispatch or consolidated bulk)
          -------------------------------------------------------------------- */}
      <div className="fg-undo-toast-stack" aria-live="polite" aria-label="Dispatch undo notifications">
        {Object.values(pendingDispatch).length > 2 ? (
          <div className="fg-undo-toast" role="alert">
            <div className="fg-undo-toast__content">
              <div className="fg-undo-toast__icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polygon points="3 11 22 2 13 21 11 13 3 11" />
                </svg>
              </div>
              <div className="fg-undo-toast__text">
                <span className="fg-undo-toast__label">
                  Bulk Dispatching {Object.values(pendingDispatch).length} Lots
                </span>
                <span className="fg-undo-toast__sub">
                  Auto-routing to Lembah Klang food banks in {Math.max(...Object.values(undoCountdowns), 0)}s
                </span>
              </div>
              <button
                type="button"
                className="fg-undo-toast__undo-btn"
                onClick={handleUndoAllPending}
                aria-label="Undo all bulk dispatches"
              >
                Undo All
              </button>
            </div>
            <div className="fg-undo-toast__track" aria-hidden="true">
              <div
                className="fg-undo-toast__progress"
                style={{
                  width: `${(Math.max(...Object.values(undoCountdowns), 0) / 10) * 100}%`,
                  transition: 'width 1s linear'
                }}
              />
            </div>
          </div>
        ) : (
          Object.values(pendingDispatch).map(({ batch }) => {
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
          })
        )}
      </div>

      {/* --------------------------------------------------------------------
          Top Bento Telemetry Metrics Strip
          -------------------------------------------------------------------- */}
      <section className="fg-dispatch-metrics" ref={metricsRef} aria-label="Dispatch Telemetry Metrics">
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
            <GsapCounter value={criticalCount} suffix=" Lots" /> <span style={{ fontSize: '1rem', fontWeight: 600 }}>(<GsapCounter value={criticalWeight} suffix=" kg" />)</span>
          </div>
          <div className="fg-dispatch-metric-card__sub">
            <span className="fg-dispatch-metric-card__trend">Waste Risk ≥ 80%</span>
            <span>· Requires closed-loop donation</span>
          </div>
        </div>


        <div className="fg-dispatch-metric-card fg-dispatch-metric-card--capacity">
          <div className="fg-dispatch-metric-card__header">
            <span className="fg-dispatch-metric-card__label">Fleet & Receiver Capacity</span>
            <div className="fg-dispatch-metric-card__icon fg-dispatch-metric-card__icon--sky">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            </div>
          </div>
          <div className="fg-dispatch-metric-card__value">
            <GsapCounter value={1670} suffix=" kg" />
          </div>
          <div className="fg-dispatch-metric-card__sub">
            <span className="fg-dispatch-metric-card__trend fg-dispatch-metric-card__trend--sky">4 Partner Hubs</span>
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
                  className={`fg-dispatch-tab fg-dispatch-tab--all ${filterTab === 'all' ? 'is-active' : ''}`}
                  onClick={() => handleTabChange('all')}
                >
                  All Lots <span className="fg-dispatch-tab__count">({countAll})</span>
                </button>
                <button
                  type="button"
                  className={`fg-dispatch-tab fg-dispatch-tab--critical ${filterTab === 'critical' ? 'is-active' : ''}`}
                  onClick={() => handleTabChange('critical')}
                >
                  Critical <span className="fg-dispatch-tab__count">({countCritical})</span>
                </button>
                <button
                  type="button"
                  className={`fg-dispatch-tab fg-dispatch-tab--elevated ${filterTab === 'elevated' ? 'is-active' : ''}`}
                  onClick={() => handleTabChange('elevated')}
                >
                  Elevated <span className="fg-dispatch-tab__count">({countElevated})</span>
                </button>
                <button
                  type="button"
                  className={`fg-dispatch-tab fg-dispatch-tab--dispatched ${filterTab === 'dispatched' ? 'is-active' : ''}`}
                  onClick={() => handleTabChange('dispatched')}
                >
                  Dispatched <span className="fg-dispatch-tab__count">({countDispatched})</span>
                </button>
              </div>

              {/* Integrated Search Bar in Top Row */}
              <div className="fg-dispatch-search">
                <svg className="fg-dispatch-search__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Filter lot, SKU, product..."
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

            {/* Bulk Selection Quick-Actions Bar (Active tabs only) */}
            {filterTab !== 'dispatched' && (
              <div className="fg-dispatch-bulk-bar-top">
                <div className="fg-dispatch-bulk-shortcuts">
                  <button
                    type="button"
                    className="fg-dispatch-btn-text"
                    onClick={selectAllVisible}
                  >
                    <input
                      type="checkbox"
                      readOnly
                      checked={isAllVisibleSelected}
                      className="fg-dispatch-checkbox"
                      aria-label="Toggle all visible lots on current page"
                    />
                    <span>{isAllVisibleSelected ? 'Deselect Page' : 'Select Page'}</span>
                  </button>

                  {countCritical > 0 && (
                    <button
                      type="button"
                      className="fg-dispatch-btn-text fg-dispatch-btn-text--critical"
                      onClick={selectAllCritical}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                      </svg>
                      <span>Select All Critical ({countCritical})</span>
                    </button>
                  )}
                </div>

                {selectedBatches.length > 0 && (
                  <div className="fg-dispatch-bulk-selected-summary">
                    <span>
                      <strong>{selectedBatches.length}</strong> selected ({selectedTotalWeight} kg)
                    </span>
                    <button
                      type="button"
                      className="fg-dispatch-btn-text fg-dispatch-btn-text--muted"
                      onClick={clearSelection}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Items Container */}
          <div className="fg-dispatch-list" ref={queueListRef}>
            {paginatedQueue.length === 0 ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#496354', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>No monitored inventory lots match your filter criteria.</p>
                {(searchQuery || filterTab !== 'all') && (
                  <button
                    type="button"
                    className="fg-dispatch-btn fg-dispatch-btn--outline fg-dispatch-btn--sm"
                    onClick={() => {
                      setSearchQuery('')
                      setFilterTab('all')
                      setCurrentPage(1)
                    }}
                  >
                    Reset Filters &amp; Clear Search
                  </button>
                )}
              </div>
            ) : (
              paginatedQueue.map(batch => {
                const isCritical = batch.wasteScore >= 80
                const isElevated = batch.wasteScore >= 50 && batch.wasteScore < 80
                const scoreClass = isCritical ? 'high' : isElevated ? 'med' : 'low'
                const isSelected = selectedBatchIds.has(batch.id)
                const isPending = pendingBatchIds.has(batch.id)
                const isHandled = batch.isDispatched || isPending

                return (
                  <article
                    key={batch.id}
                    className={`fg-dispatch-card ${isCritical && !isHandled ? 'fg-dispatch-card--critical' : ''} ${isSelected ? 'is-selected' : ''}`}
                  >
                    {/* Column 1: Inventory & Batch Profile */}
                    <div className="fg-dispatch-card__col-product">
                      <div className="fg-dispatch-card__product-wrap">
                        {!isHandled && (
                          <label
                            className="fg-dispatch-card__select-label"
                            onClick={e => e.stopPropagation()}
                            title={batch.wasteScore < 50 ? "Protected stock (<50% risk). Can still be manually selected for bulk dispatch." : "Select for bulk dispatch"}
                          >
                            <input
                              type="checkbox"
                              className="fg-dispatch-checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectBatch(batch.id)}
                              aria-label={`Select batch ${batch.id} (${batch.product}) for bulk dispatch`}
                            />
                          </label>
                        )}
                        <div className="fg-dispatch-card__meta">
                          <div className="fg-dispatch-card__title-line">
                            <h3 className="fg-dispatch-card__title">{batch.product}</h3>
                            <span className="fg-dispatch-card__id">{batch.id}</span>
                            <span className={`fg-dispatch-card__category fg-dispatch-card__category--${getCategoryColorClass(batch.category)}`}>{batch.category}</span>
                          </div>
                          <span className="fg-dispatch-card__sub">
                            Stock: <strong>{batch.qty}</strong> · Expiry (DTE): <strong>{batch.dte || `${batch.dteNum} days`}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Machine Learning Risk & Spoilage Telemetry */}
                    <div className="fg-dispatch-card__col-risk">
                      <div className="fg-dispatch-card__risk-head">
                        <span className={`fg-dispatch-risk-pill fg-dispatch-risk-pill--${scoreClass}`}>
                          {batch.wasteScore}% Waste Risk
                        </span>
                        {isHandled ? (
                          <span className="fg-dispatch-badge--done">✓ Dispatched</span>
                        ) : isCritical ? (
                          <span className="fg-dispatch-badge--urgent">⚠️ Action Needed</span>
                        ) : null}
                      </div>
                      <div className="fg-dispatch-card__track">
                        <div
                          className={`fg-dispatch-card__fill fg-dispatch-card__fill--${scoreClass}`}
                          style={{ width: `${batch.wasteScore}%` }}
                          data-target-width={`${batch.wasteScore}%`}
                        />
                      </div>
                      <div className="fg-dispatch-card__telemetry">
                        <span
                          className={`fg-dispatch-telemetry-chip ${isCritical ? 'fg-dispatch-telemetry-chip--critical' : isElevated ? 'fg-dispatch-telemetry-chip--warning' : ''}`}
                          title="Predictive time window before organic degradation reaches landfill threshold"
                        >
                          Loss: <strong>{batch.timeToWaste}</strong>
                        </span>
                        <span
                          className={`fg-dispatch-telemetry-chip ${batch.demandGap?.includes('-') ? (isCritical ? 'fg-dispatch-telemetry-chip--critical' : 'fg-dispatch-telemetry-chip--warning') : ''}`}
                          title="Forecast vs sales deficit. Negative values indicate surplus inventory likely to exceed shelf life"
                        >
                          Gap: <strong>{batch.demandGap}</strong>
                        </span>
                        <span
                          className={`fg-dispatch-telemetry-chip ${batch.tempDrift?.includes('+') ? (isCritical ? 'fg-dispatch-telemetry-chip--critical' : 'fg-dispatch-telemetry-chip--warning') : ''}`}
                          title="Cold-chain temperature deviation from the 4°C safe baseline"
                        >
                          Temp: <strong>{batch.tempDrift}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Column 3: Logistics Destination & Dispatch Action */}
                    <div className="fg-dispatch-card__col-logistics">
                      {isHandled ? (
                        <div className="fg-dispatch-card__status-success">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          <span>Routed to <strong>{batch.assignedReceiver.name}</strong></span>
                          {isPending ? (
                            <button
                              type="button"
                              className="fg-dispatch-btn fg-dispatch-btn--revert fg-dispatch-btn--xs"
                              onClick={() => handleUndoDispatch(batch.id)}
                              aria-label={`Undo dispatch of batch ${batch.id}`}
                            >
                              Undo ({undoCountdowns[batch.id] ?? 10}s)
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="fg-dispatch-btn fg-dispatch-btn--revert fg-dispatch-btn--xs"
                              onClick={() => handleRevertDispatch(batch.id)}
                              aria-label={`Unassign dispatch of batch ${batch.id}`}
                            >
                              Revert
                            </button>
                          )}
                        </div>
                      ) : batch.wasteScore >= 50 ? (
                        <div className="fg-dispatch-card__dispatch-block">
                          <div className="fg-dispatch-card__partner-mini">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            <span className="fg-dispatch-card__partner-name">
                              <strong>{batch.assignedReceiver.name}</strong>
                            </span>
                            <span className="fg-dispatch-card__partner-eta">
                              {batch.distanceKm} km · {batch.etaMinutes}m OSRM
                            </span>
                          </div>
                          <div className="fg-dispatch-card__actions">
                            <button
                              type="button"
                              className="fg-dispatch-btn fg-dispatch-btn--outline fg-dispatch-btn--xs"
                              onClick={() => setSelectedBatchForRoute(batch)}
                            >
                              Route
                            </button>
                            <button
                              type="button"
                              className="fg-dispatch-btn fg-dispatch-btn--primary fg-dispatch-btn--xs"
                              onClick={() => handleDispatchBatch(batch)}
                            >
                              Dispatch
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="fg-dispatch-card__status-safe">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          <span>Stock Protected · Retained for Store Sale</span>
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

      {/* --------------------------------------------------------------------
          Sticky Floating Action Bar for Multi-Lot Bulk Dispatch
          -------------------------------------------------------------------- */}
      {selectedBatches.length > 0 && (
        <aside className="fg-dispatch-floating-bar" aria-label="Bulk dispatch action bar">
          <div className="fg-dispatch-floating-bar__info">
            <div className="fg-dispatch-floating-bar__badge">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{selectedBatches.length} Lots Selected</span>
            </div>
            <span className="fg-dispatch-floating-bar__divider">·</span>
            <span className="fg-dispatch-floating-bar__weight">
              {selectedTotalWeight} kg total
            </span>
            {selectedBatches.some(b => b.wasteScore < 50) && (
              <span className="fg-dispatch-floating-bar__warning" title="Some selected lots are fresh stock (<50% risk)">
                ⚠️ Protected Stock Included
              </span>
            )}
          </div>

          <div className="fg-dispatch-floating-bar__actions">
            <button
              type="button"
              className="fg-dispatch-btn fg-dispatch-btn--outline fg-dispatch-btn--sm"
              style={{ color: '#ffffff', borderColor: 'oklch(100% 0 0 / 0.25)', backgroundColor: 'transparent' }}
              onClick={clearSelection}
            >
              Clear
            </button>
            <button
              type="button"
              className="fg-dispatch-btn fg-dispatch-btn--primary fg-dispatch-btn--sm"
              onClick={handleBulkDispatchTrigger}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
              <span>Dispatch {selectedBatches.length} Selected</span>
            </button>
          </div>
        </aside>
      )}

      {/* --------------------------------------------------------------------
          Modal: Safety Warning Confirmation for Low-Risk (<50%) Selection
          -------------------------------------------------------------------- */}
      {safetyConfirmBatches && (
        <div
          className="fg-dispatch-modal-backdrop"
          onClick={() => setSafetyConfirmBatches(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="fg-dispatch-modal" onClick={e => e.stopPropagation()}>
            <div className="fg-dispatch-modal__header">
              <h3 className="fg-dispatch-modal__title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d66224' }}>
                <span>⚠️ Safety Check: Low-Risk Inventory Selected</span>
              </h3>
              <button
                type="button"
                className="fg-dispatch-modal__close"
                onClick={() => setSafetyConfirmBatches(null)}
                aria-label="Close Modal"
              >
                ✕
              </button>
            </div>

            <div className="fg-dispatch-modal__body">
              <div
                className="fg-dispatch-modal__notice"
                style={{
                  backgroundColor: 'oklch(65% 0.16 55 / 0.1)',
                  borderColor: 'oklch(65% 0.16 55 / 0.3)',
                  color: '#9a4310'
                }}
              >
                <strong>Policy Alert:</strong> You have selected{' '}
                <strong>{safetyConfirmBatches.filter(b => b.wasteScore < 50).length} lot(s)</strong> with low waste probability (&lt; 50% risk, shelf life &gt; 4 days). These lots are protected for retail shelf sale to prevent premature loss of store margin.
              </div>

              <div>
                <h4 className="fg-dispatch-modal__section-title">Protected Lots in Selection:</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                  {safetyConfirmBatches.filter(b => b.wasteScore < 50).map(b => (
                    <div
                      key={b.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.45rem 0.75rem',
                        backgroundColor: '#fafcfb',
                        border: '1px solid oklch(15% 0.02 148 / 0.08)',
                        borderRadius: '8px',
                        fontSize: '0.82rem'
                      }}
                    >
                      <div>
                        <strong>{b.product}</strong> <span style={{ color: '#496354' }}>({b.id})</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#147b43' }}>
                        {b.wasteScore}% Risk · DTE {b.dte || `${b.dteNum}d`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p style={{ margin: 0, fontSize: '0.84rem', color: '#496354', lineHeight: 1.5 }}>
                Total batch for dispatch: <strong>{safetyConfirmBatches.length} lots</strong> ({safetyConfirmBatches.reduce((a, c) => a + (c.weightKg || 0), 0)} kg).
                How would you like to proceed?
              </p>
            </div>

            <div className="fg-dispatch-modal__footer" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <button
                type="button"
                className="fg-dispatch-btn fg-dispatch-btn--outline"
                onClick={() => setSafetyConfirmBatches(null)}
              >
                Cancel
              </button>

              {safetyConfirmBatches.some(b => b.wasteScore >= 50) && (
                <button
                  type="button"
                  className="fg-dispatch-btn fg-dispatch-btn--outline"
                  style={{ color: '#147b43', borderColor: '#1b9b55' }}
                  onClick={() => {
                    const highOnly = safetyConfirmBatches.filter(b => b.wasteScore >= 50)
                    executeBulkDispatch(highOnly)
                  }}
                >
                  Exclude Protected &amp; Dispatch {safetyConfirmBatches.filter(b => b.wasteScore >= 50).length} Lots
                </button>
              )}

              <button
                type="button"
                className="fg-dispatch-btn fg-dispatch-btn--primary"
                onClick={() => executeBulkDispatch(safetyConfirmBatches)}
              >
                Override &amp; Dispatch All {safetyConfirmBatches.length} Lots
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
