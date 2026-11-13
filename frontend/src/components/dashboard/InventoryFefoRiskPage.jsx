import { useState, useMemo, useEffect, useRef } from 'react'
import DashboardHeader from './DashboardHeader'
import gsap from 'gsap'
import { INITIAL_BATCHES, computeDteAndRisk, parseDateToDays } from './inventoryData'

// Convert "Oct 30, 2026" → "2026-10-30" (for <input type="date"> value)
function toInputDate(humanStr) {
  if (!humanStr) return ''
  const d = new Date(humanStr)
  if (isNaN(d)) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Convert "2026-10-30" → "Oct 30, 2026" (for storing / display)
function fromInputDate(isoStr) {
  if (!isoStr) return ''
  const [y, m, d] = isoStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Risk level mascot mapping: High Risk (worried/alert), Medium Risk (curious/thinking), Normal/Low Risk (happy/smiling)
const RISK_MASCOT_MAP = {
  high: {
    src: '/image/decision/donate.png',
    alt: 'High Risk Mascot',
    label: 'High Risk'
  },
  med: {
    src: '/image/decision/dynamic.png',
    alt: 'Med Risk Mascot',
    label: 'Med Risk'
  },
  low: {
    src: '/image/decision/normal_sale.png',
    alt: 'Normal Risk Mascot',
    label: 'Normal Risk'
  }
}

export default function InventoryFefoRiskPage({
  batches: externalBatches,
  onUpdateBatches,
  onApplyAction: externalOnApplyAction,
  onDeleteBatch: externalOnDeleteBatch,
  onAddBatch: externalOnAddBatch,
  onToggleSidebar,
  initialSearch = ''
}) {
  const [internalBatches, setInternalBatches] = useState(INITIAL_BATCHES)
  const batches = externalBatches || internalBatches
  const setBatches = onUpdateBatches || setInternalBatches

  const [searchTerm, setSearchTerm] = useState(initialSearch)

  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchTerm(initialSearch)
    }
  }, [initialSearch])
  const [selectedBatchForAction, setSelectedBatchForAction] = useState(null)
  const [ruleEngineResult, setRuleEngineResult] = useState(null)
  const [ruleEngineLoading, setRuleEngineLoading] = useState(false)
  const [activeMenuBatchId, setActiveMenuBatchId] = useState(null)
  const [editBatch, setEditBatch] = useState(null)
  const [batchToDelete, setBatchToDelete] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [isPriorityStripCollapsed, setIsPriorityStripCollapsed] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)
  const [undoAction, setUndoAction] = useState(null)

  // Controlled form state for Add Batch
  const [newBatchForm, setNewBatchForm] = useState(() => {
    const today = fromInputDate(new Date().toISOString().slice(0, 10))
    // Default expiry: 7 days from today
    const exp = new Date(); exp.setDate(exp.getDate() + 7)
    const expStr = fromInputDate(exp.toISOString().slice(0, 10))
    return {
      product: '',
      category: 'Fruits & Vegetables',
      unitPrice: '',
      stockQty: '',
      reorderLevel: '',
      turnoverRatio: '',
      dateIn: today,
      expiryDate: expStr
    }
  })

  const tableContainerRef = useRef(null)
  const actionModalRef = useRef(null)
  const addModalRef = useRef(null)
  const editModalRef = useRef(null)
  const toastRef = useRef(null)

  // Filter & sort states
  const [selectedRiskFilter, setSelectedRiskFilter] = useState('all')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState('fefo')

  const categories = useMemo(() => {
    const set = new Set(batches.map(b => b.category).filter(Boolean))
    return ['all', ...Array.from(set)]
  }, [batches])

  const riskCounts = useMemo(() => {
    return {
      total: batches.length,
      high: batches.filter(b => b.riskType === 'high').length,
      med: batches.filter(b => b.riskType === 'med').length,
      low: batches.filter(b => b.riskType === 'low').length,
    }
  }, [batches])

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
    selectedRiskFilter !== 'all' ||
    selectedCategoryFilter !== 'all' ||
    sortBy !== 'fefo'
  )

  const handleResetFilters = () => {
    setSearchTerm('')
    setSelectedRiskFilter('all')
    setSelectedCategoryFilter('all')
    setSortBy('fefo')
  }

  // Filter & sort batches (declared before useEffect that depends on it)
  const filteredBatches = useMemo(() => {
    let list = batches.filter(b => {
      // 0. Hide fully depleted batches (stock = 0, sold out)
      const _qty = b.stockQty !== undefined
        ? Number(b.stockQty)
        : parseFloat(String(b.qty || '').replace(/[^\d.]/g, '')) || 0
      if (_qty <= 0) return false

      // 1. Search filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const matchesQuery = (
          (b.id || '').toLowerCase().includes(q) ||
          (b.product || '').toLowerCase().includes(q) ||
          (b.category || '').toLowerCase().includes(q)
        )
        if (!matchesQuery) return false
      }
      // 2. Risk filter
      if (selectedRiskFilter !== 'all') {
        if (b.riskType !== selectedRiskFilter) return false
      }
      // 3. Category filter
      if (selectedCategoryFilter !== 'all') {
        if ((b.category || '').toLowerCase() !== selectedCategoryFilter.toLowerCase()) return false
      }
      return true
    })

    // 4. Sort
    return [...list].sort((a, b) => {
      if (sortBy === 'fefo') {
        return (a.dteNum ?? 999) - (b.dteNum ?? 999)
      }
      if (sortBy === 'dte-desc') {
        return (b.dteNum ?? 0) - (a.dteNum ?? 0)
      }
      if (sortBy === 'qty-desc') {
        const parseQ = (s) => parseFloat((s || '').replace(/[^\d.]/g, '')) || 0
        return parseQ(b.qty) - parseQ(a.qty)
      }
      return 0
    })
  }, [batches, searchTerm, selectedRiskFilter, selectedCategoryFilter, sortBy])

  // Staggered animation for table rows on load/filter
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const container = tableContainerRef.current
    if (!container) return

    const ctx = gsap.context(() => {
      const tableRows = container.querySelectorAll('.fg-inv-table tbody tr')
      if (tableRows.length) {
        gsap.fromTo(
          Array.from(tableRows),
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.32, stagger: 0.035, ease: 'power2.out', clearProps: 'transform' }
        )
      }
      const mobileCards = container.querySelectorAll('.fg-inv-mobile-card')
      if (mobileCards.length) {
        gsap.fromTo(
          Array.from(mobileCards),
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.32, stagger: 0.04, ease: 'power2.out', clearProps: 'transform' }
        )
      }
    }, container)

    return () => ctx.revert()
  }, [batches, searchTerm, selectedRiskFilter, selectedCategoryFilter, sortBy])

  // GSAP animation for Action Decision modal + 3 action cards + risk mascot
  useEffect(() => {
    if (!selectedBatchForAction) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.fg-inv-modal--action-decision',
        { scale: 0.94, y: 16, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.32, ease: 'power3.out' }
      )
      gsap.fromTo(
        '.fg-inv-action-card',
        { scale: 0.9, y: 24, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.45, stagger: 0.08, ease: 'back.out(1.2)', delay: 0.05 }
      )
      gsap.fromTo(
        '.fg-inv-decision-mascot-img',
        { scale: 0.75, opacity: 0, rotate: -6 },
        { scale: 1, opacity: 1, rotate: 0, duration: 0.45, ease: 'back.out(1.4)', delay: 0.08 }
      )
    }, actionModalRef)

    // ── Fetch Person 4 Rule Engine recommendation ────────────────────────────
    const b = selectedBatchForAction
    const qty = b.stockQty !== undefined ? Number(b.stockQty) : (parseFloat(String(b.qty || '').replace(/[^\d.]/g, '')) || 10)
    const price = b.unitPrice !== undefined ? Number(b.unitPrice) : (parseFloat(String(b.sellPrice || b.costPrice || '').replace(/[^\d.]/g, '')) || 5)

    setRuleEngineResult(null)
    setRuleEngineLoading(true)
    fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        days_to_expiry: b.dteNum || 5,
        quantity: qty,
        unit_price_myr: price,
        demand_forecast_3d: qty * 0.6,
        total_surplus_volume: 0,
        cumulative_donated_volume: 0
      })
    })
      .then(r => r.json())
      .then(data => { setRuleEngineResult(data); setRuleEngineLoading(false) })
      .catch(() => setRuleEngineLoading(false))

    return () => ctx.revert()
  }, [selectedBatchForAction])

  // GSAP animation for Add Batch modal
  useEffect(() => {
    if (!showAddModal) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.fg-inv-modal',
        { scale: 0.95, y: 14, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.3, ease: 'power3.out' }
      )
    }, addModalRef)

    return () => ctx.revert()
  }, [showAddModal])

  // GSAP animation for Edit Batch modal
  useEffect(() => {
    if (!editBatch) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.fg-inv-modal',
        { scale: 0.95, y: 14, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.3, ease: 'power3.out' }
      )
    }, editModalRef)

    return () => ctx.revert()
  }, [editBatch])

  // GSAP animation for Toast Notification
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

  // Close three-dot menu when clicking anywhere outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveMenuBatchId(null)
    }
    window.addEventListener('click', handleOutsideClick)
    return () => {
      window.removeEventListener('click', handleOutsideClick)
    }
  }, [])

  const getRecommendationText = (batch) => {
    if (batch.appliedAction === 'markdown') return 'Dynamic Markdown'
    if (batch.appliedAction === 'donate') return 'Food Bank Dispatch'
    if (batch.appliedAction === 'normal') return 'Normal Sale'
    if (batch.recommended) return batch.recommended
    if (batch.riskType === 'high') return 'Dynamic Markdown'
    if (batch.riskType === 'med') return 'Dynamic Markdown'
    return 'Normal Sale'
  }

  const getRecoveryContext = (batch) => {
    if (batch.appliedAction === 'markdown') return 'Sales recovery route active'
    if (batch.appliedAction === 'donate') return 'Donation route active'
    if (batch.appliedAction === 'normal') return 'Store retention selected'
    if (batch.riskType === 'high') return 'Prioritize markdown or donation before expiry'
    if (batch.riskType === 'med') return 'Review markdown before expiry'
    return 'Standard retail cycle'
  }

  // Strictly filter for urgent critical clearance items (DTE <= 2 days, max 3 items)
  const priorityBatches = useMemo(() => {
    return filteredBatches
      .filter(batch => {
        const dteVal = batch.dteNum !== undefined ? batch.dteNum : parseDateToDays(batch.expiryDate)
        return (batch.riskType === 'high' || dteVal <= 2) && dteVal <= 2
      })
      .slice(0, 3)
  }, [filteredBatches])

  const showToast = (msg, undoPayload = null) => {
    setToastMessage(msg)
    if (undoPayload) {
      setUndoAction(undoPayload)
    } else {
      setUndoAction(null)
    }
    setTimeout(() => {
      setToastMessage(null)
      setUndoAction(null)
    }, 4800)
  }

  // Handle Action decision apply from the Pop-up
  const handleApplyAction = (actionType) => {
    if (!selectedBatchForAction) return
    const batch = selectedBatchForAction
    let text = ''

    // Pass the ORIGINAL batch (before any state change) to parent callback first
    // so parent can use batch.riskType reliably
    if (externalOnApplyAction) {
      externalOnApplyAction(batch, actionType)
    }

    if (actionType === 'normal') {
      text = `Batch ${batch.id} (${batch.product}) retained for Normal Sale`
    } else if (actionType === 'markdown') {
      text = `30% Dynamic Markdown applied to Batch ${batch.id}. POS sync active.`
    } else if (actionType === 'donate') {
      text = `Donation shipment arranged for Batch ${batch.id} to Food Bank.`
    }

    const previousAction = batch.appliedAction || null

    // Persist appliedAction on the batch item
    setBatches(prev => prev.map(b => (b.id === batch.id ? { ...b, appliedAction: actionType } : b)))

    setSelectedBatchForAction(null)
    showToast(text, { batchId: batch.id, previousAction, productName: batch.product })
  }

  // Undo the last applied action
  const handleUndoAction = () => {
    if (!undoAction) return
    const { batchId, previousAction } = undoAction
    setBatches(prev => prev.map(b => (b.id === batchId ? { ...b, appliedAction: previousAction } : b)))
    setToastMessage(`✓ Reverted action for Batch ${batchId}`)
    setUndoAction(null)
  }

  // Delete batch handler
  const handleDeleteBatch = (idToDelete) => {
    const deleted = batches.find(b => b.id === idToDelete)
    if (externalOnDeleteBatch && deleted) {
      // DashboardPage handles: DELETE /api/batches/:id + setBatches update
      externalOnDeleteBatch(deleted)
    } else {
      // Standalone mode (no external handler)
      setBatches(prev => prev.filter(b => b.id !== idToDelete))
    }
    showToast(`Batch ${idToDelete} deleted successfully from inventory`)
  }

  // Live recalculate DTE and Risk when user edits Expiry Date (DTE cannot be edited manually!)
  const handleEditExpiryChange = (newExpiry) => {
    const { dte, dteNum, risk, riskType } = computeDteAndRisk(newExpiry)
    setEditBatch(prev => ({
      ...prev,
      expiryDate: newExpiry,
      dte,
      dteNum,
      risk,
      riskType
    }))
  }

  // Save edited batch
  const handleSaveEdit = (e) => {
    e.preventDefault()
    if (!editBatch) return

    const stockQty = parseFloat(editBatch.stockQty) || parseFloat(String(editBatch.qty || '').replace(/[^0-9.]/g, '')) || 10
    const reorderLevel = parseFloat(editBatch.reorderLevel) || 10
    const unitPrice = parseFloat(editBatch.unitPrice) || parseFloat(String(editBatch.sellPrice || editBatch.costPrice || '').replace(/[^0-9.]/g, '')) || 5.00
    const turnoverRatio = parseFloat(editBatch.turnoverRatio) || 1.5
    const { dte, dteNum, risk, riskType } = computeDteAndRisk(editBatch.expiryDate)

    const updatedBatch = {
      ...editBatch,
      product: editBatch.product.trim(),
      category: editBatch.category,
      unitPrice,
      stockQty,
      reorderLevel,
      turnoverRatio,
      qty: `${stockQty} units`,
      costPrice: `RM ${unitPrice.toFixed(2)}/unit`,
      sellPrice: `RM ${unitPrice.toFixed(2)}/unit`,
      dte,
      dteNum,
      risk,
      riskType,
      recommended: riskType === 'high' ? 'Donate to Food Bank' : riskType === 'med' ? 'Dynamic Markdown' : 'Normal Sale'
    }

    setBatches(prev => prev.map(b => (b.id === editBatch.id ? updatedBatch : b)))
    setEditBatch(null)
    showToast(`Changes saved successfully for Batch ${editBatch.id}`)
    // Persist edit to inventory_master.json + csv via local Vite API
    fetch('/api/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedBatch)
    }).catch(() => {})
  }

  // Submit Add Batch Form
  const handleAddBatchSubmit = (e) => {
    e.preventDefault()
    if (!newBatchForm.product.trim()) {
      showToast('Please enter the product name first')
      return
    }

    const { dte, dteNum, risk, riskType } = computeDteAndRisk(newBatchForm.expiryDate)
    // Sequential LOT number: find max existing lot number, increment by 1
    const maxLotNum = batches.reduce((max, b) => {
      const m = String(b.id || '').match(/LOT-(\d+)/)
      return m ? Math.max(max, parseInt(m[1])) : max
    }, 1284)
    const newId = `LOT-${maxLotNum + 1}`
    const stockQty = parseFloat(newBatchForm.stockQty) || 10
    const reorderLevel = parseFloat(newBatchForm.reorderLevel) || 10
    const unitPrice = parseFloat(newBatchForm.unitPrice) || 5.00
    const turnoverRatio = parseFloat(newBatchForm.turnoverRatio) || 1.0
    const qtyDisplay = `${stockQty} units`
    const priceDisplay = `RM ${unitPrice.toFixed(2)}/unit`

    const createdBatch = {
      id: newId,
      product: newBatchForm.product.trim(),
      category: newBatchForm.category,
      unitPrice,
      stockQty,
      reorderLevel,
      turnoverRatio,
      costPrice: priceDisplay,
      sellPrice: priceDisplay,
      qty: qtyDisplay,
      dateIn: newBatchForm.dateIn || 'Oct 30, 2026',
      expiryDate: newBatchForm.expiryDate || 'Nov 06, 2026',
      dte,
      dteNum,
      risk,
      riskType,
      recommended: riskType === 'high' ? 'Donate to Food Bank' : riskType === 'med' ? 'Dynamic Markdown' : 'Normal Sale'
    }

    if (externalOnAddBatch) {
      externalOnAddBatch(createdBatch)
    } else {
      setBatches(prev => [createdBatch, ...prev])
      fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createdBatch)
      }).catch(() => {})
    }

    setShowAddModal(false)
    setNewBatchForm({
      product: '',
      category: 'Fruits & Vegetables',
      unitPrice: '',
      stockQty: '',
      reorderLevel: '',
      turnoverRatio: '',
      dateIn: 'Oct 30, 2026',
      expiryDate: 'Nov 06, 2026'
    })

    showToast(`Batch ${newId} (${createdBatch.product}) added successfully to FEFO rotation`)
  }

  // Render a standardized action button to reduce visual noise while preserving function.
  const renderActionButton = (b, isMobile = false) => {
    const mobileClass = isMobile ? 'fg-inv-decision-trigger-btn--mobile' : ''
    const stateClass = b.appliedAction === 'markdown'
      ? 'fg-inv-decision-trigger-btn--markdown'
      : b.appliedAction === 'donate'
        ? 'fg-inv-decision-trigger-btn--donate'
        : b.appliedAction === 'normal'
          ? 'fg-inv-decision-trigger-btn--normal'
          : `fg-inv-decision-trigger-btn--${b.riskType}`

    const label = b.appliedAction === 'markdown'
      ? 'Markdown active'
      : b.appliedAction === 'donate'
        ? 'Donation ready'
        : b.appliedAction === 'normal'
          ? 'Normal sale'
          : b.riskType === 'high'
            ? 'Review action'
            : b.riskType === 'med'
              ? 'Review action'
              : 'Normal sale'

    return (
      <button
        type="button"
        className={`fg-inv-decision-trigger-btn ${mobileClass} ${stateClass}`}
        onClick={() => setSelectedBatchForAction(b)}
        title={`Review action for batch ${b.id}`}
      >
        <span className="fg-inv-trigger-dot"></span>
        <span>{label}</span>
        <span className="fg-inv-btn-arrow">→</span>
      </button>
    )
  }

  return (
    <div className="fg-inv-root">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fg-fefo-toast" role="alert" ref={toastRef}>
          <div className="fg-fefo-toast__icon">✓</div>
          <span className="fg-fefo-toast__msg">{toastMessage}</span>
          {undoAction && (
            <button
              type="button"
              className="fg-fefo-toast__undo"
              onClick={handleUndoAction}
              style={{
                marginLeft: '10px',
                padding: '2px 9px',
                background: '#ffffff',
                border: '1px solid #147b43',
                color: '#147b43',
                borderRadius: '5px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Undo
            </button>
          )}
          <button
            type="button"
            className="fg-fefo-toast__close"
            onClick={() => {
              setToastMessage(null)
              setUndoAction(null)
            }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Unified Action Header */}
      <DashboardHeader
        title="Inventory"
        badgePulse={false}
        subtitle="FEFO (First Expiry, First Out) rotation priority and stock spoilage risk mitigation."
        onToggleSidebar={onToggleSidebar}
        actions={
          <>
            <button
              type="button"
              className="fg-inv-btn-outline"
              onClick={() => setShowUploadModal(true)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Upload CSV</span>
            </button>

            <button
              type="button"
              className="fg-inv-btn-primary"
              onClick={() => setShowAddModal(true)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add Batch</span>
            </button>
          </>
        }
      />

      <div className="fg-inv-toolbar" role="tablist" aria-label="Filter risk status">
        <div className="fg-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search batch or product..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search Batch ID or product name"
          />
          {searchTerm && (
            <button
              type="button"
              className="fg-search-clear"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="fg-inv-risk-switcher" aria-label="Risk filter options">
          <button
            type="button"
            role="tab"
            aria-selected={selectedRiskFilter === 'all'}
            className={`fg-inv-chip ${selectedRiskFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setSelectedRiskFilter('all')}
          >
            <span>All</span>
            <strong>{riskCounts.total}</strong>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedRiskFilter === 'high'}
            className={`fg-inv-chip fg-inv-chip--critical ${selectedRiskFilter === 'high' ? 'is-active' : ''}`}
            onClick={() => setSelectedRiskFilter(prev => prev === 'high' ? 'all' : 'high')}
          >
            <span>Critical</span>
            <strong>{riskCounts.high}</strong>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedRiskFilter === 'med'}
            className={`fg-inv-chip fg-inv-chip--warning ${selectedRiskFilter === 'med' ? 'is-active' : ''}`}
            onClick={() => setSelectedRiskFilter(prev => prev === 'med' ? 'all' : 'med')}
          >
            <span>Warning</span>
            <strong>{riskCounts.med}</strong>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedRiskFilter === 'low'}
            className={`fg-inv-chip fg-inv-chip--safe ${selectedRiskFilter === 'low' ? 'is-active' : ''}`}
            onClick={() => setSelectedRiskFilter(prev => prev === 'low' ? 'all' : 'low')}
          >
            <span>Safe</span>
            <strong>{riskCounts.low}</strong>
          </button>
        </div>

        <button
          type="button"
          className={`fg-inv-toggle ${showAdvancedFilters ? 'is-open' : ''}`}
          onClick={() => setShowAdvancedFilters(prev => !prev)}
        >
          {showAdvancedFilters ? 'Hide filters' : 'Advanced filters'}
        </button>
      </div>

      {showAdvancedFilters && (
        <div className="fg-inv-advanced-panel">
          <div className="fg-inv-select-wrapper">
            <label>Category</label>
            <select
              className="fg-inv-select"
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              aria-label="Filter category"
            >
              <option value="all">All categories</option>
              {categories.filter(c => c !== 'all').map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="fg-inv-select-wrapper">
            <label>Sort</label>
            <select
              className="fg-inv-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort batches"
            >
              <option value="fefo">FEFO order</option>
              <option value="dte-desc">Longest DTE</option>
              <option value="qty-desc">Highest quantity</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button type="button" className="fg-inv-reset-btn" onClick={handleResetFilters} title="Reset all filters">
              Reset filters
            </button>
          )}

          <span className="fg-inv-count-pill">{filteredBatches.length} of {batches.length}</span>
        </div>
      )}

      {priorityBatches.length > 0 && (
        <section className="fg-inv-priority-section" style={{ marginBottom: '1.25rem' }} aria-label="Urgent clearance queue">
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              marginBottom: isPriorityStripCollapsed ? '0' : '0.65rem',
              padding: '0.45rem 0.75rem',
              background: '#fff',
              border: '1px solid #fee2e2',
              borderRadius: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                width: '18px', 
                height: '18px', 
                borderRadius: '50%', 
                background: '#fee2e2', 
                color: '#dc2626', 
                fontSize: '0.72rem', 
                fontWeight: 800 
              }}>!</span>
              <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0c1f15' }}>
                Urgent Clearance Queue
              </span>
              <span style={{ 
                fontSize: '0.72rem', 
                color: '#991b1b', 
                background: '#fee2e2', 
                padding: '1px 7px', 
                borderRadius: '999px', 
                fontWeight: 700 
              }}>
                {priorityBatches.length} critical (DTE ≤ 2d)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsPriorityStripCollapsed(prev => !prev)}
              style={{
                background: 'none',
                border: 'none',
                color: '#496354',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 6px',
                borderRadius: '6px'
              }}
              aria-expanded={!isPriorityStripCollapsed}
              title={isPriorityStripCollapsed ? 'Show priority cards' : 'Collapse priority cards'}
            >
              <span>{isPriorityStripCollapsed ? 'Show cards' : 'Hide cards'}</span>
              <svg 
                width="14" 
                height="14" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                style={{ 
                  transform: isPriorityStripCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', 
                  transition: 'transform 0.2s ease' 
                }}
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>

          {!isPriorityStripCollapsed && (
            <div className="fg-inv-priority-strip" aria-label="Priority recovery cards">
              {priorityBatches.map(batch => (
                <article key={batch.id} className={`fg-inv-priority-card fg-inv-priority-card--${batch.riskType}`}>
                  <div className="fg-inv-priority-head">
                    <span className={`fg-inv-risk-badge fg-inv-risk-badge--${batch.riskType}`}>{batch.risk}</span>
                    <span className="fg-inv-priority-dte">{batch.dte}</span>
                  </div>
                  <h3>{batch.product}</h3>
                  <div className="fg-inv-priority-meta">
                    <span>{batch.id}</span>
                    <span>{batch.category}</span>
                  </div>
                  <p className="fg-inv-priority-label">Recommended action</p>
                  <p className="fg-inv-priority-action">{getRecommendationText(batch)}</p>
                  <p className="fg-inv-priority-context">{getRecoveryContext(batch)}</p>
                  <button type="button" className="fg-inv-priority-button" onClick={() => setSelectedBatchForAction(batch)}>
                    Review action
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Stock Inventory Table Card */}
      <div className="fg-card fg-inv-section-card" ref={tableContainerRef}>
        <div className="fg-inv-card-head">
          <div className="fg-inv-card-head-text">
            <h2>Inventory list</h2>
            <span>{filteredBatches.length} items</span>
          </div>
        </div>

        {/* Desktop Multi-column Table */}
        <div className="fg-table-container fg-desktop-table-view">
          <table className="fg-table fg-inv-table">
            <thead>
              <tr>
                <th style={{ minWidth: '220px' }}>Product</th>
                <th style={{ minWidth: '150px' }}>Stock &amp; Value</th>
                <th style={{ minWidth: '160px' }}>Urgency &amp; ML Risk</th>
                <th style={{ minWidth: '170px' }}>Recommended Action</th>
                <th style={{ width: '44px', textAlign: 'center' }}>More</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '3.5rem 1rem', textAlign: 'center' }}>
                    <div className="fg-inv-empty-state">
                      <div className="fg-inv-empty-icon">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          <line x1="8" y1="11" x2="14" y2="11" />
                        </svg>
                      </div>
                      <div className="fg-inv-empty-title">No matching batches found</div>
                      <p className="fg-inv-empty-desc">
                        No inventory items match your search query or selected filters.
                      </p>
                      <button
                        type="button"
                        className="fg-inv-btn-outline"
                        style={{ margin: '0 auto', display: 'inline-flex' }}
                        onClick={handleResetFilters}
                      >
                        Reset All Filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBatches.map(b => {
                  const isHighRisk = b.riskType === 'high'
                  const isMenuOpen = activeMenuBatchId === b.id

                  return (
                    <tr
                      key={b.id}
                      className={`fg-inv-row ${isHighRisk ? 'fg-inv-row--high-risk' : ''} ${isMenuOpen ? 'is-menu-open' : ''}`}
                      style={isMenuOpen ? { position: 'relative', zIndex: 100 } : undefined}
                    >
                      {/* 1. Product & Category */}
                      {/* 1. Product Identity */}
                      <td>
                        <div className="fg-inv-product-identity">
                          <div className="fg-inv-product-copy">
                            <div className="fg-product-name">{b.product}</div>
                            <div className="fg-product-meta" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span>{b.id}</span>
                              <span style={{ 
                                background: '#eef8f2', 
                                color: '#18794e', 
                                padding: '1px 6px', 
                                borderRadius: '4px', 
                                fontSize: '0.72rem', 
                                fontWeight: 600 
                              }}>{b.category}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Stock & Footprint (Consolidated Volume + Unit Value) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 700, color: '#0c1f15', fontSize: '0.92rem' }}>
                            {b.stockQty !== undefined ? `${b.stockQty} units` : (b.qty || '10 units')}
                          </span>
                          <span style={{ fontSize: '0.74rem', color: '#627d6e' }}>
                            {b.unitPrice !== undefined ? `RM ${Number(b.unitPrice).toFixed(2)}` : (b.sellPrice || 'RM 6.00')} • min {b.reorderLevel !== undefined ? b.reorderLevel : 10}
                          </span>
                        </div>
                      </td>

                      {/* 3. Urgency & ML Risk (Stacked Badge + DTE Countdown) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          <span className={`fg-inv-risk-badge fg-inv-risk-badge--${b.riskType}`}>
                            {b.risk}
                          </span>
                          <div className="fg-inv-dte-stack" style={{ marginTop: '1px' }}>
                            <span className={`fg-inv-dte-main ${isHighRisk ? 'is-red' : ''}`} style={{ fontSize: '0.8rem' }}>
                              {b.dte}
                            </span>
                            <span className="fg-inv-dte-sub" style={{ fontSize: '0.72rem' }}>
                              {b.expiryDate}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 4. Recommended Action (Integrated Smart Decision CTA) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '0.72rem', color: '#496354', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                            {getRecommendationText(b)}
                          </span>
                          {renderActionButton(b, false)}
                        </div>
                      </td>

                      <td onClick={(e) => e.stopPropagation()} style={{ position: 'relative', zIndex: isMenuOpen ? 120 : undefined }}>
                        <div className="fg-inv-dots-menu-wrap" style={isMenuOpen ? { position: 'relative', zIndex: 130 } : undefined}>
                          <button
                            type="button"
                            className={`fg-inv-dots-btn ${isMenuOpen ? 'is-active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setActiveMenuBatchId(prev => prev === b.id ? null : b.id)
                            }}
                            aria-label={`Options for batch ${b.id}`}
                            title="Batch options"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="1.5" />
                              <circle cx="12" cy="5" r="1.5" />
                              <circle cx="12" cy="19" r="1.5" />
                            </svg>
                          </button>

                          {isMenuOpen && (
                            <div className="fg-inv-dots-dropdown">
                              <button
                                type="button"
                                className="fg-inv-dropdown-item"
                                onClick={() => {
                                  setActiveMenuBatchId(null)
                                  setEditBatch(b)
                                }}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                </svg>
                                <span>Edit Batch</span>
                              </button>

                              <button
                                type="button"
                                className="fg-inv-dropdown-item fg-inv-dropdown-item--delete"
                                onClick={() => {
                                  setActiveMenuBatchId(null)
                                  setBatchToDelete(b)
                                }}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                                <span>Delete Batch</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                }))}
            </tbody>
          </table>
        </div>

        {/* Mobile View Card Feed */}
        <div className="fg-mobile-activity-list fg-inv-mobile-list" aria-label="Inventory Batches Mobile View">
          {filteredBatches.length === 0 ? (
            <div className="fg-inv-empty-state" style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
              <div className="fg-inv-empty-title">No matching batches found</div>
              <p className="fg-inv-empty-desc">Try adjusting your search query or risk filters.</p>
              <button
                type="button"
                className="fg-inv-btn-outline"
                style={{ margin: '0.6rem auto', display: 'inline-flex' }}
                onClick={handleResetFilters}
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            filteredBatches.map(b => {
              const isHighRisk = b.riskType === 'high'
              const isMenuOpen = activeMenuBatchId === b.id

              return (
                <div
                  key={`mob-${b.id}`}
                  className={`fg-mobile-activity-card fg-inv-mobile-card fg-inv-mob-card ${isHighRisk ? 'fg-inv-mob-card--high' : ''} ${isMenuOpen ? 'is-menu-open' : ''}`}
                  style={isMenuOpen ? { position: 'relative', zIndex: 100 } : undefined}
                >
                <div className="fg-mobile-card__top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div>
                      <div className="fg-inv-product-name" style={{ fontSize: '0.96rem' }}>{b.product}</div>
                      <div className="fg-inv-category">
                        {b.category} • <span className={`fg-inv-batch-id ${isHighRisk ? 'is-red' : ''}`}>{b.id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="fg-inv-mob-top-actions">
                    <span className={`fg-inv-risk-badge fg-inv-risk-badge--${b.riskType}`}>
                      {b.risk}
                    </span>

                    {/* Three-dots menu for mobile card */}
                    <div
                      className="fg-inv-dots-menu-wrap"
                      onClick={(e) => e.stopPropagation()}
                      style={isMenuOpen ? { position: 'relative', zIndex: 130 } : undefined}
                    >
                      <button
                        type="button"
                        className={`fg-inv-dots-btn ${isMenuOpen ? 'is-active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveMenuBatchId(prev => prev === b.id ? null : b.id)
                        }}
                        aria-label="Options"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="5" r="1.5" />
                          <circle cx="12" cy="19" r="1.5" />
                        </svg>
                      </button>

                      {isMenuOpen && (
                        <div className="fg-inv-dots-dropdown">
                          <button
                            type="button"
                            className="fg-inv-dropdown-item"
                            onClick={() => {
                              setActiveMenuBatchId(null)
                              setEditBatch(b)
                            }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            </svg>
                            <span>Edit Batch</span>
                          </button>
                          <button
                            type="button"
                            className="fg-inv-dropdown-item fg-inv-dropdown-item--delete"
                            onClick={() => {
                              setActiveMenuBatchId(null)
                              setBatchToDelete(b)
                            }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            <span>Delete Batch</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="fg-inv-mob-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem 0.85rem' }}>
                  <div>
                    <span className="fg-inv-mob-label">Stock &amp; Min Reorder</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className={`fg-inv-qty ${isHighRisk ? 'is-red' : ''}`}>
                        {b.stockQty !== undefined ? `${b.stockQty} units` : (b.qty || '10 units')}
                      </span>
                      <span style={{ color: '#94a3b8' }}>/</span>
                      <span style={{ fontSize: '0.78rem', color: '#627d6e' }}>
                        min {b.reorderLevel !== undefined ? b.reorderLevel : 10}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="fg-inv-mob-label">Unit Price &amp; Turnover</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="fg-inv-price fg-inv-sell-price">
                        {b.unitPrice !== undefined ? `RM ${Number(b.unitPrice).toFixed(2)}` : (b.sellPrice || 'RM 6.00')}
                      </span>
                      <span style={{ color: '#94a3b8' }}>•</span>
                      <span style={{ fontSize: '0.8rem', color: '#335043', fontWeight: 600 }}>
                        {b.turnoverRatio !== undefined ? `${b.turnoverRatio}x` : '1.5x'}
                      </span>
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span className="fg-inv-mob-label">DTE &amp; Expiry Date</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`fg-inv-dte ${isHighRisk ? 'is-red' : ''}`}>{b.dte}</span>
                      <span style={{ color: '#94a3b8' }}>•</span>
                      <span className={`fg-inv-date ${isHighRisk ? 'is-red' : ''}`}>{b.expiryDate}</span>
                    </div>
                  </div>
                </div>

                {renderActionButton(b, true)}
              </div>
            )
          }))}
        </div>
      </div>

      {/* POP-UP MODAL: Action Decision */}
      {selectedBatchForAction && (
        <div
          className="fg-inv-modal-backdrop"
          ref={actionModalRef}
          onClick={() => setSelectedBatchForAction(null)}
        >
          <div
            className="fg-inv-modal fg-inv-modal--action-decision"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="action-decision-title"
          >
            {/* Header with Icon, Title, Recommended Pill and Close button */}
            <div className="fg-inv-modal-header">
              <div className="fg-inv-card-title-group">
                <div className="fg-inv-icon-scales">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                    <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                    <path d="M7 21h10" />
                    <path d="M12 3v18" />
                    <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
                  </svg>
                </div>
                <div>
                  <h2 id="action-decision-title" className="fg-inv-card-title">Determine Stock Action</h2>
                  <span className="fg-inv-modal-subtitle">FEFO rotation priority & spoilage risk mitigation</span>
                </div>
              </div>

              <div className="fg-inv-modal-head-right">
                <button
                  type="button"
                  className="fg-inv-modal-close"
                  onClick={() => setSelectedBatchForAction(null)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* ── Batch Summary Banner: clean 2-row layout ── */}
            <div className={`fg-inv-decision-banner fg-inv-decision-banner--${selectedBatchForAction.riskType}`}>
              <div className="fg-inv-decision-main">
                <div className="fg-inv-decision-info">
                  {/* Row 1: ID + name + risk badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className={`fg-inv-decision-badge fg-inv-decision-badge--${selectedBatchForAction.riskType}`}>
                      <span className="fg-inv-decision-dot" />
                      {selectedBatchForAction.risk}
                    </span>
                    <h3 className="fg-inv-decision-title" style={{ margin: 0 }}>
                      {selectedBatchForAction.id} — {selectedBatchForAction.product}
                    </h3>
                  </div>
                  {/* Row 2: 4 key data points, tightly spaced */}
                  <div className="fg-inv-banner-stats">
                    <span className="fg-inv-banner-stat">
                      <span className="fg-inv-banner-stat-label">Price</span>
                      <span className="fg-inv-banner-stat-value">
                        RM {selectedBatchForAction.unitPrice !== undefined
                          ? Number(selectedBatchForAction.unitPrice).toFixed(2)
                          : (parseFloat(String(selectedBatchForAction.sellPrice || '').replace(/[^0-9.]/g, '')) || '—')}
                      </span>
                    </span>
                    <span className="fg-inv-banner-divider" />
                    <span className="fg-inv-banner-stat">
                      <span className="fg-inv-banner-stat-label">Stock</span>
                      <span className="fg-inv-banner-stat-value">
                        {selectedBatchForAction.stockQty !== undefined ? selectedBatchForAction.stockQty : '—'} units
                      </span>
                    </span>
                    <span className="fg-inv-banner-divider" />
                    <span className="fg-inv-banner-stat">
                      <span className="fg-inv-banner-stat-label">Expiry</span>
                      <span className="fg-inv-banner-stat-value">{selectedBatchForAction.expiryDate}</span>
                    </span>
                    <span className="fg-inv-banner-divider" />
                    <span className="fg-inv-banner-stat">
                      <span className="fg-inv-banner-stat-label">DTE</span>
                      <span className="fg-inv-banner-stat-value" style={{
                        color: selectedBatchForAction.dteNum <= 2 ? '#c82d32'
                             : selectedBatchForAction.dteNum <= 5 ? '#d97706'
                             : '#1b9b55',
                        fontWeight: 800
                      }}>
                        {selectedBatchForAction.dte}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Mascot */}
              {(() => {
                const mascot = RISK_MASCOT_MAP[selectedBatchForAction.riskType] || RISK_MASCOT_MAP.low
                return (
                  <div
                    className={`fg-inv-decision-mascot-box fg-inv-decision-mascot-box--${selectedBatchForAction.riskType}`}
                    title={`Mascot: ${selectedBatchForAction.risk}`}
                  >
                    <img src={mascot.src} alt={mascot.alt} className="fg-inv-decision-mascot-img" />
                  </div>
                )
              })()}
            </div>

            {/* ── Action Grid: asymmetric layout — Markdown is featured, others are compact ── */}
            <div className="fg-inv-action-grid-v2">

              {/* ── FEATURED: Dynamic Markdown (full-width top, most likely action) ── */}
              <div className="fg-inv-action-card-featured fg-inv-action-card--markdown">
                <div className="fg-inv-featured-left">
                  <div className="fg-inv-featured-eyebrow">
                    <div className="fg-inv-action-icon-sm fg-inv-action-icon--amber">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
                      </svg>
                    </div>
                    <span className="fg-inv-featured-label">Dynamic Markdown</span>
                    {!ruleEngineLoading && ruleEngineResult && ruleEngineResult.discount_percent > 0 && (
                      <span className="fg-inv-featured-discount-pill">
                        {ruleEngineResult.discount_percent}% off
                      </span>
                    )}
                    {ruleEngineLoading && (
                      <span style={{ fontSize: '0.72rem', color: '#92400e', opacity: 0.7 }}>calculating...</span>
                    )}
                  </div>

                  {!ruleEngineLoading && ruleEngineResult ? (
                    <div className="fg-inv-featured-engine">
                      <span className="fg-inv-featured-price">
                        RM {ruleEngineResult.discounted_price_myr}
                        <span className="fg-inv-featured-price-label">/ unit after discount</span>
                      </span>
                      <span className="fg-inv-featured-value">
                        Est. recovery: RM {ruleEngineResult.expected_value_myr}
                      </span>
                      <span className="fg-inv-featured-reason">{ruleEngineResult.reason}</span>
                      {ruleEngineResult.moral_hazard_flag && (
                        <span className="fg-inv-moral-hazard-tag">⚠ Donation cap reached — redirected to 50% markdown</span>
                      )}
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.83rem', color: '#78350f', margin: '4px 0 0' }}>
                      Accelerate sell-through with a time-based discount.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  className="fg-inv-action-btn fg-inv-action-btn--amber fg-inv-featured-cta"
                  onClick={() => handleApplyAction('markdown')}
                >
                  Apply Markdown →
                </button>
              </div>

              {/* ── Bottom row: Normal Sale + Donate (compact, secondary weight) ── */}
              <div className="fg-inv-action-row-secondary">

                {/* Normal Sale */}
                <div className="fg-inv-action-card-compact fg-inv-action-card--normal">
                  <div className="fg-inv-compact-top">
                    <div className="fg-inv-action-icon-sm fg-inv-action-icon--green">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
                      </svg>
                    </div>
                    <span className="fg-inv-compact-title">Normal Sale</span>
                    {!ruleEngineLoading && ruleEngineResult?.recommended_route === 'Normal Sale' && (
                      <span className="fg-inv-compact-rec-tag fg-inv-compact-rec-tag--green">Recommended</span>
                    )}
                  </div>
                  <p className="fg-inv-compact-desc">Full price, standard retail channel.</p>
                  <button
                    type="button"
                    className="fg-inv-action-btn-compact fg-inv-action-btn--green"
                    onClick={() => handleApplyAction('normal')}
                  >
                    Apply →
                  </button>
                </div>

                {/* Donate */}
                <div className="fg-inv-action-card-compact fg-inv-action-card--donate">
                  <div className="fg-inv-compact-top">
                    <div className="fg-inv-action-icon-sm fg-inv-action-icon--red">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                      </svg>
                    </div>
                    <span className="fg-inv-compact-title">Donate</span>
                    {!ruleEngineLoading && ruleEngineResult?.recommended_route === 'Donation' && !ruleEngineResult.moral_hazard_flag && (
                      <span className="fg-inv-compact-rec-tag fg-inv-compact-rec-tag--red">Recommended</span>
                    )}
                    {!ruleEngineLoading && ruleEngineResult?.moral_hazard_flag && (
                      <span className="fg-inv-compact-rec-tag fg-inv-compact-rec-tag--warn">Cap full</span>
                    )}
                  </div>
                  <p className="fg-inv-compact-desc">
                    {ruleEngineResult?.moral_hazard_flag
                      ? '30% donation quota reached. Redirects to markdown.'
                      : 'Closed NGO channel — zero retail exposure.'}
                  </p>
                  <button
                    type="button"
                    className="fg-inv-action-btn-compact fg-inv-action-btn--red"
                    onClick={() => handleApplyAction('donate')}
                  >
                    Arrange →
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL: Edit Batch */}
      {editBatch && (
        <div className="fg-inv-modal-backdrop" ref={editModalRef} onClick={() => setEditBatch(null)}>
          <div className="fg-inv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fg-inv-modal-header">
              <h3>Edit Batch {editBatch.id}</h3>
              <button
                type="button"
                className="fg-inv-modal-close"
                onClick={() => setEditBatch(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="fg-inv-modal-desc">
              Perbarui data atribut batch untuk kalkulasi ulang FEFO rotation &amp; ML spoilage risk.
            </p>
            <form onSubmit={handleSaveEdit} className="fg-inv-modal-form">
              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Batch ID</label>
                  <input
                    type="text"
                    value={editBatch.id}
                    disabled
                    style={{ background: '#f4f8f5', color: '#496354' }}
                  />
                </div>
                <div className="fg-inv-form-field">
                  <label>Category</label>
                  <select
                    value={editBatch.category}
                    onChange={(e) => setEditBatch({ ...editBatch, category: e.target.value })}
                  >
                    <option value="Bakery">Bakery</option>
                    <option value="Beverages">Beverages</option>
                    <option value="Dairy">Dairy</option>
                    <option value="Fruits & Vegetables">Fruits &amp; Vegetables</option>
                    <option value="Grains & Pulses">Grains &amp; Pulses</option>
                    <option value="Oils & Fats">Oils &amp; Fats</option>
                    <option value="Seafood">Seafood</option>
                  </select>
                </div>
              </div>

              <div className="fg-inv-form-field">
                <label>Product Name</label>
                <input
                  type="text"
                  value={editBatch.product}
                  onChange={(e) => setEditBatch({ ...editBatch, product: e.target.value })}
                  required
                />
              </div>

              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Unit Price (RM)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 8.50"
                    value={editBatch.unitPrice !== undefined ? editBatch.unitPrice : (parseFloat(String(editBatch.sellPrice || editBatch.costPrice || '').replace(/[^0-9.]/g, '')) || '')}
                    onChange={(e) => setEditBatch({ ...editBatch, unitPrice: e.target.value })}
                    required
                  />
                </div>
                <div className="fg-inv-form-field">
                  <label>Stock Quantity (units)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 50"
                    value={editBatch.stockQty !== undefined ? editBatch.stockQty : (parseFloat(String(editBatch.qty || '').replace(/[^0-9.]/g, '')) || '')}
                    onChange={(e) => setEditBatch({ ...editBatch, stockQty: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Reorder Level (units)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 20"
                    value={editBatch.reorderLevel !== undefined ? editBatch.reorderLevel : ''}
                    onChange={(e) => setEditBatch({ ...editBatch, reorderLevel: e.target.value })}
                    required
                  />
                </div>
                <div className="fg-inv-form-field">
                  <label>Turnover Ratio</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="e.g. 2.5"
                    value={editBatch.turnoverRatio !== undefined ? editBatch.turnoverRatio : ''}
                    onChange={(e) => setEditBatch({ ...editBatch, turnoverRatio: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Date In</label>
                  <input
                    type="date"
                    value={toInputDate(editBatch.dateIn)}
                    onChange={(e) => setEditBatch({ ...editBatch, dateIn: fromInputDate(e.target.value) })}
                    required
                  />
                </div>
                <div className="fg-inv-form-field">
                  <label>Expiry Date</label>
                  <input
                    type="date"
                    value={toInputDate(editBatch.expiryDate)}
                    onChange={(e) => handleEditExpiryChange(fromInputDate(e.target.value))}
                    required
                  />
                </div>
              </div>

              {/* Automatic FEFO & DTE Live Preview */}
              <div className="fg-inv-form-field">
                <label>Days to Expiry (DTE) &amp; Risk Preview</label>
                <div className="fg-inv-dte-readonly-box">
                  <span>
                    DTE: <strong>{computeDteAndRisk(editBatch.expiryDate).dte}</strong>
                  </span>
                  <span
                    className={`fg-inv-risk-badge fg-inv-risk-badge--${computeDteAndRisk(editBatch.expiryDate).riskType}`}
                    style={{ marginLeft: 8 }}
                  >
                    {computeDteAndRisk(editBatch.expiryDate).risk}
                  </span>
                </div>
              </div>

              <div className="fg-inv-modal-actions" style={{ marginTop: '0.85rem' }}>
                <button
                  type="button"
                  className="fg-inv-btn-outline"
                  onClick={() => setEditBatch(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="fg-inv-btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* POP-UP MODAL: Add Batch */}
      {showAddModal && (
        <div className="fg-inv-modal-backdrop" ref={addModalRef} onClick={() => setShowAddModal(false)}>
          <div className="fg-inv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fg-inv-modal-header">
              <h3>Add New Inventory Batch</h3>
              <button
                type="button"
                className="fg-inv-modal-close"
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
              <p className="fg-inv-modal-desc">
               Daftarkan batch masuk — semua input digunakan oleh model ML untuk prediksi risiko spoilage.
             </p>
             <form onSubmit={handleAddBatchSubmit} className="fg-inv-modal-form">
               <div className="fg-inv-form-row">
                 <div className="fg-inv-form-field">
                   <label>Batch ID</label>
                   <input
                     type="text"
                     value={`LOT-${1000 + batches.length}`}
                     disabled
                     style={{ background: '#f4f8f5', color: '#496354' }}
                   />
                 </div>
                 <div className="fg-inv-form-field">
                   <label>Category</label>
                   <select
                     value={newBatchForm.category}
                     onChange={(e) => setNewBatchForm({ ...newBatchForm, category: e.target.value })}
                   >
                     <option value="Bakery">Bakery</option>
                     <option value="Beverages">Beverages</option>
                     <option value="Dairy">Dairy</option>
                     <option value="Fruits & Vegetables">Fruits &amp; Vegetables</option>
                     <option value="Grains & Pulses">Grains &amp; Pulses</option>
                     <option value="Oils & Fats">Oils &amp; Fats</option>
                     <option value="Seafood">Seafood</option>
                   </select>
                 </div>
               </div>

               <div className="fg-inv-form-field">
                 <label>Product Name</label>
                 <input
                   type="text"
                   placeholder="e.g. Basmati Rice 5kg"
                   value={newBatchForm.product}
                   onChange={(e) => setNewBatchForm({ ...newBatchForm, product: e.target.value })}
                   required
                 />
               </div>

               <div className="fg-inv-form-row">
                 <div className="fg-inv-form-field">
                   <label>Unit Price (RM)</label>
                   <input
                     type="number"
                     min="0"
                     step="0.01"
                     placeholder="e.g. 8.50"
                     value={newBatchForm.unitPrice}
                     onChange={(e) => setNewBatchForm({ ...newBatchForm, unitPrice: e.target.value })}
                     required
                   />
                 </div>
                 <div className="fg-inv-form-field">
                   <label>Stock Quantity (units)</label>
                   <input
                     type="number"
                     min="1"
                     step="1"
                     placeholder="e.g. 50"
                     value={newBatchForm.stockQty}
                     onChange={(e) => setNewBatchForm({ ...newBatchForm, stockQty: e.target.value })}
                     required
                   />
                 </div>
               </div>

               <div className="fg-inv-form-row">
                 <div className="fg-inv-form-field">
                   <label>Reorder Level (units)</label>
                   <input
                     type="number"
                     min="0"
                     step="1"
                     placeholder="e.g. 20"
                     value={newBatchForm.reorderLevel}
                     onChange={(e) => setNewBatchForm({ ...newBatchForm, reorderLevel: e.target.value })}
                     required
                   />
                 </div>
                 <div className="fg-inv-form-field">
                   <label>Turnover Ratio</label>
                   <input
                     type="number"
                     min="0"
                     step="0.1"
                     placeholder="e.g. 2.5"
                     value={newBatchForm.turnoverRatio}
                     onChange={(e) => setNewBatchForm({ ...newBatchForm, turnoverRatio: e.target.value })}
                     required
                   />
                 </div>
               </div>

               <div className="fg-inv-form-row">
                 <div className="fg-inv-form-field">
                   <label>Date In</label>
                   <input
                     type="date"
                     value={toInputDate(newBatchForm.dateIn)}
                     onChange={(e) => setNewBatchForm({ ...newBatchForm, dateIn: fromInputDate(e.target.value) })}
                     required
                   />
                 </div>
                 <div className="fg-inv-form-field">
                   <label>Expiry Date</label>
                   <input
                     type="date"
                     value={toInputDate(newBatchForm.expiryDate)}
                     onChange={(e) => setNewBatchForm({ ...newBatchForm, expiryDate: fromInputDate(e.target.value) })}
                     required
                   />
                 </div>
               </div>

               {/* Automatic FEFO & DTE Live Preview */}
               <div className="fg-inv-form-field">
                 <label>Days to Expiry (DTE) &amp; Risk Preview</label>
                 <div className="fg-inv-dte-readonly-box">
                   <span>
                     DTE: <strong>{computeDteAndRisk(newBatchForm.expiryDate).dte}</strong>
                   </span>
                   <span
                     className={`fg-inv-risk-badge fg-inv-risk-badge--${computeDteAndRisk(newBatchForm.expiryDate).riskType}`}
                     style={{ marginLeft: 8 }}
                   >
                     {computeDteAndRisk(newBatchForm.expiryDate).risk}
                   </span>
                 </div>
               </div>

               <div className="fg-inv-modal-actions" style={{ marginTop: '0.85rem' }}>
                 <button
                   type="button"
                   className="fg-inv-btn-outline"
                   onClick={() => setShowAddModal(false)}
                 >
                   Cancel
                 </button>
                 <button type="submit" className="fg-inv-btn-primary">
                   Save &amp; Prioritize
                 </button>
               </div>
             </form>
          </div>
        </div>
      )}

      {/* POP-UP MODAL: Delete Batch Confirmation */}
      {batchToDelete && (
        <div className="fg-inv-modal-backdrop" onClick={() => setBatchToDelete(null)}>
          <div
            className="fg-inv-modal fg-inv-modal--delete-confirm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
          >
            <div className="fg-inv-delete-dialog">
              <div className="fg-inv-delete-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <h3 id="delete-confirm-title" className="fg-inv-delete-title">
                Delete Batch {batchToDelete.id}?
              </h3>
              <p className="fg-inv-delete-desc">
                You are about to permanently remove <strong>{batchToDelete.product}</strong> ({batchToDelete.qty}) from FEFO rotation. This action cannot be undone.
              </p>
              <div className="fg-inv-delete-actions">
                <button
                  type="button"
                  className="fg-inv-btn-outline"
                  onClick={() => setBatchToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="fg-inv-btn-danger"
                  onClick={() => {
                    const id = batchToDelete.id
                    setBatchToDelete(null)
                    handleDeleteBatch(id)
                  }}
                >
                  Delete Batch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL: Upload CSV */}
      {showUploadModal && (
        <div className="fg-inv-modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div className="fg-inv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fg-inv-modal-header">
              <h3>Upload Batch CSV / ERP Manifest</h3>
              <button
                type="button"
                className="fg-inv-modal-close"
                onClick={() => setShowUploadModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="fg-inv-upload-zone">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1b9b55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p>Drag & drop batch manifest file here, or click to browse</p>
              <span>Supports .csv, .xlsx formatted for grocery lot intake</span>
            </div>
            <div className="fg-inv-modal-actions">
              <button
                type="button"
                className="fg-inv-btn-outline"
                onClick={() => setShowUploadModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="fg-inv-btn-primary"
                onClick={() => {
                  setShowUploadModal(false)
                  showToast('✓ 18 batches imported successfully from CSV manifest')
                }}
              >
                Import Manifest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
