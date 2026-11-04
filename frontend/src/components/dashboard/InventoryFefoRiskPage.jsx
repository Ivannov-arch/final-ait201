import { useState, useMemo, useEffect, useRef } from 'react'
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
  const [activeMenuBatchId, setActiveMenuBatchId] = useState(null)
  const [editBatch, setEditBatch] = useState(null)
  const [batchToDelete, setBatchToDelete] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)

  // Controlled form state for Add Batch
  const [newBatchForm, setNewBatchForm] = useState(() => {
    const today = fromInputDate(new Date().toISOString().slice(0, 10))
    // Default expiry: 7 days from today
    const exp = new Date(); exp.setDate(exp.getDate() + 7)
    const expStr = fromInputDate(exp.toISOString().slice(0, 10))
    return {
      product: '',
      category: 'Vegetables',
      costPrice: 'RM 6.50/kg',
      sellPrice: 'RM 8.00/kg',
      qty: '15 kg',
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
          { opacity: 1, y: 0, duration: 0.32, stagger: 0.035, ease: 'power2.out' }
        )
      }
      const mobileCards = container.querySelectorAll('.fg-inv-mobile-card')
      if (mobileCards.length) {
        gsap.fromTo(
          Array.from(mobileCards),
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.32, stagger: 0.04, ease: 'power2.out' }
        )
      }
    }, container)

    return () => ctx.revert()
  }, [batches, searchTerm, selectedRiskFilter, selectedCategoryFilter, sortBy])

  // GSAP animation for Action Decision modal + 3 mascot cards
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
    }, actionModalRef)

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

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3800)
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
      text = `Batch ${batch.id} (${batch.product}) dipertahankan untuk Normal Sale`
    } else if (actionType === 'markdown') {
      text = `30% Dynamic Markdown diterapkan pada Batch ${batch.id}. Sinkronisasi POS aktif.`
    } else if (actionType === 'donate') {
      text = `Pengiriman donasi disiapkan untuk Batch ${batch.id} ke Food Bank.`
    }

    // Persist appliedAction on the batch item
    setBatches(prev => prev.map(b => (b.id === batch.id ? { ...b, appliedAction: actionType } : b)))

    setSelectedBatchForAction(null)
    showToast(text)
  }

  // Delete batch handler
  const handleDeleteBatch = (idToDelete) => {
    const deleted = batches.find(b => b.id === idToDelete)
    setBatches(prev => prev.filter(b => b.id !== idToDelete))
    if (externalOnDeleteBatch && deleted) {
      externalOnDeleteBatch(deleted)
    }
    showToast(`Batch ${idToDelete} berhasil dihapus dari inventori`)
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
    setBatches(prev => prev.map(b => (b.id === editBatch.id ? editBatch : b)))
    setEditBatch(null)
    showToast(`Perubahan berhasil disimpan untuk Batch ${editBatch.id}`)
  }

  // Submit Add Batch Form
  const handleAddBatchSubmit = (e) => {
    e.preventDefault()
    if (!newBatchForm.product.trim()) {
      showToast('Silakan isi nama produk terlebih dahulu')
      return
    }

    const { dte, dteNum, risk, riskType } = computeDteAndRisk(newBatchForm.expiryDate)
    const newId = `B-10${52 + batches.length}`

    const createdBatch = {
      id: newId,
      product: newBatchForm.product.trim(),
      category: newBatchForm.category,
      costPrice: newBatchForm.costPrice || 'RM 6.00/kg',
      sellPrice: newBatchForm.sellPrice || 'RM 7.50/kg',
      qty: newBatchForm.qty || '10 kg',
      dateIn: newBatchForm.dateIn || 'Oct 30, 2026',
      expiryDate: newBatchForm.expiryDate || 'Nov 06, 2026',
      dte,
      dteNum,
      risk,
      riskType,
      image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=160&auto=format&fit=crop&q=80',
      recommended: riskType === 'high' ? 'Donate to Food Bank' : riskType === 'med' ? 'Dynamic Markdown' : 'Normal Sale'
    }

    if (externalOnAddBatch) {
      externalOnAddBatch(createdBatch)
    } else {
      setBatches(prev => [createdBatch, ...prev])
    }

    setShowAddModal(false)
    setNewBatchForm({
      product: '',
      category: 'Vegetables',
      costPrice: 'RM 6.50/kg',
      sellPrice: 'RM 8.00/kg',
      qty: '15 kg',
      dateIn: 'Oct 30, 2026',
      expiryDate: 'Nov 06, 2026'
    })
    showToast(`Batch ${newId} (${createdBatch.product}) berhasil ditambahkan ke rotasi FEFO`)
  }

  // Render Action Decision trigger button with appliedAction stamp (No emojis)
  const renderActionButton = (b, isMobile = false) => {
    const mobileClass = isMobile ? 'fg-inv-decision-trigger-btn--mobile' : ''
    if (b.appliedAction === 'markdown') {
      return (
        <button
          type="button"
          className={`fg-inv-decision-trigger-btn ${mobileClass} fg-inv-decision-trigger-btn--applied-markdown`}
          onClick={() => setSelectedBatchForAction(b)}
          title={`30% Markdown Aktif untuk ${b.id} — Klik untuk ubah tindakan`}
        >
          <span className="fg-inv-trigger-check">✓</span>
          <span>Markdown Aktif</span>
          <span className="fg-inv-btn-arrow">Ubah</span>
        </button>
      )
    }
    if (b.appliedAction === 'donate') {
      return (
        <button
          type="button"
          className={`fg-inv-decision-trigger-btn ${mobileClass} fg-inv-decision-trigger-btn--applied-donate`}
          onClick={() => setSelectedBatchForAction(b)}
          title={`Donasi Food Bank Siap untuk ${b.id} — Klik untuk ubah tindakan`}
        >
          <span className="fg-inv-trigger-check">✓</span>
          <span>Donasi Siap</span>
          <span className="fg-inv-btn-arrow">Ubah</span>
        </button>
      )
    }
    if (b.appliedAction === 'normal') {
      return (
        <button
          type="button"
          className={`fg-inv-decision-trigger-btn ${mobileClass} fg-inv-decision-trigger-btn--applied-normal`}
          onClick={() => setSelectedBatchForAction(b)}
          title={`Normal Sale dipertahankan untuk ${b.id} — Klik untuk ubah tindakan`}
        >
          <span className="fg-inv-trigger-check">✓</span>
          <span>Normal Sale</span>
          <span className="fg-inv-btn-arrow">Ubah</span>
        </button>
      )
    }
    return (
      <button
        type="button"
        className={`fg-inv-decision-trigger-btn ${mobileClass} fg-inv-decision-trigger-btn--${b.riskType}`}
        onClick={() => setSelectedBatchForAction(b)}
        title={`Tentukan aksi mitigasi untuk batch ${b.id}`}
      >
        <span className="fg-inv-trigger-dot"></span>
        <span>{b.riskType === 'high' ? 'Aksi Kritis' : b.riskType === 'med' ? 'Review Aksi' : 'Normal Sale'}</span>
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
          <button
            type="button"
            className="fg-fefo-toast__close"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Unified Action Header (Distilled) */}
      <div className="fg-inv-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <h1 className="fg-inv-title">Inventory</h1>
              <span className="fg-inv-header-count">{batches.length} Batch Terdaftar</span>
            </div>
            <p className="fg-inv-subtitle">
              Prioritas rotasi FEFO (First Expiry, First Out) dan mitigasi risiko pembusukan stok.
            </p>
          </div>
        </div>

        <div className="fg-inv-header-actions">
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
            <span>Tambah Batch</span>
          </button>
        </div>
      </div>

      {/* Distilled Health Filter Strip (Compact, Zero Emojis) */}
      <div className="fg-inv-distilled-pills" role="tablist" aria-label="Filter status risiko">
        <button
          type="button"
          role="tab"
          aria-selected={selectedRiskFilter === 'all'}
          className={`fg-inv-pill-tab ${selectedRiskFilter === 'all' ? 'is-active' : ''}`}
          onClick={() => setSelectedRiskFilter('all')}
        >
          <span className="fg-inv-pill-tab__name">Semua Batch</span>
          <span className="fg-inv-pill-tab__count">{riskCounts.total}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedRiskFilter === 'high'}
          className={`fg-inv-pill-tab fg-inv-pill-tab--high ${selectedRiskFilter === 'high' ? 'is-active' : ''}`}
          onClick={() => setSelectedRiskFilter(prev => prev === 'high' ? 'all' : 'high')}
        >
          <span className="fg-inv-pill-dot fg-inv-pill-dot--high"></span>
          <span className="fg-inv-pill-tab__name">Kritis (DTE &le; 2 Hari)</span>
          <span className="fg-inv-pill-tab__count">{riskCounts.high}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedRiskFilter === 'med'}
          className={`fg-inv-pill-tab fg-inv-pill-tab--med ${selectedRiskFilter === 'med' ? 'is-active' : ''}`}
          onClick={() => setSelectedRiskFilter(prev => prev === 'med' ? 'all' : 'med')}
        >
          <span className="fg-inv-pill-dot fg-inv-pill-dot--med"></span>
          <span className="fg-inv-pill-tab__name">Waspada (3 - 5 Hari)</span>
          <span className="fg-inv-pill-tab__count">{riskCounts.med}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedRiskFilter === 'low'}
          className={`fg-inv-pill-tab fg-inv-pill-tab--low ${selectedRiskFilter === 'low' ? 'is-active' : ''}`}
          onClick={() => setSelectedRiskFilter(prev => prev === 'low' ? 'all' : 'low')}
        >
          <span className="fg-inv-pill-dot fg-inv-pill-dot--low"></span>
          <span className="fg-inv-pill-tab__name">Aman (&gt; 5 Hari)</span>
          <span className="fg-inv-pill-tab__count">{riskCounts.low}</span>
        </button>
      </div>

      {/* Stock Inventory Table Card */}
      <div className="fg-card fg-inv-section-card" ref={tableContainerRef}>
        <div className="fg-inv-card-head">
          {/* Distilled Filter & Search Bar */}
          <div className="fg-inv-filter-toolbar">
            {/* Search Input */}
            <div className="fg-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Cari Batch ID, produk, atau kategori..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Cari Batch ID atau nama produk"
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

            {/* Category Dropdown */}
            <div className="fg-inv-select-wrapper">
              <select
                className="fg-inv-select"
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                aria-label="Filter kategori"
              >
                <option value="all">Semua Kategori</option>
                {categories.filter(c => c !== 'all').map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Risk Dropdown (No Emojis) */}
            <div className="fg-inv-select-wrapper">
              <select
                className="fg-inv-select"
                value={selectedRiskFilter}
                onChange={(e) => setSelectedRiskFilter(e.target.value)}
                aria-label="Filter tingkat risiko"
              >
                <option value="all">Semua Risiko</option>
                <option value="high">High Risk (DTE &le; 2 hari)</option>
                <option value="med">Med Risk (DTE 3 - 5 hari)</option>
                <option value="low">Low Risk (DTE &gt; 5 hari)</option>
              </select>
            </div>

            {/* Sort Selector */}
            <div className="fg-inv-select-wrapper">
              <select
                className="fg-inv-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Urutkan batch"
              >
                <option value="fefo">Urutan: FEFO Terdekat</option>
                <option value="dte-desc">Urutan: DTE Terjauh</option>
                <option value="qty-desc">Urutan: Qty Terbanyak</option>
              </select>
            </div>

            {/* Reset Filters button */}
            {hasActiveFilters && (
              <button
                type="button"
                className="fg-inv-reset-btn"
                onClick={handleResetFilters}
                title="Reset semua filter"
              >
                Reset Filter
              </button>
            )}

            <span className="fg-inv-count-pill" style={{ marginLeft: 'auto' }}>
              {filteredBatches.length} dari {batches.length} Batch
            </span>
          </div>
        </div>

        {/* Desktop Multi-column Table */}
        <div className="fg-table-container fg-desktop-table-view">
          <table className="fg-table fg-inv-table">
            <thead>
              <tr>
                <th>Batch ID</th>
                <th>Produk</th>
                <th>Harga (Modal / Jual)</th>
                <th>Qty</th>
                <th>Jadwal (Masuk → Expired)</th>
                <th>Sisa Hari (DTE)</th>
                <th>Status Risiko</th>
                <th>Action Decision</th>
                <th style={{ width: '44px', textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '3.5rem 1rem', textAlign: 'center' }}>
                    <div className="fg-inv-empty-state">
                      <div className="fg-inv-empty-icon">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          <line x1="8" y1="11" x2="14" y2="11" />
                        </svg>
                      </div>
                      <div className="fg-inv-empty-title">Tidak ada batch yang cocok</div>
                      <p className="fg-inv-empty-desc">
                        Tidak ada inventori yang sesuai dengan kata kunci pencarian atau filter yang dipilih.
                      </p>
                      <button
                        type="button"
                        className="fg-inv-btn-outline"
                        style={{ margin: '0 auto', display: 'inline-flex' }}
                        onClick={handleResetFilters}
                      >
                        Reset Semua Filter
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
                      className={`fg-inv-row ${isHighRisk ? 'fg-inv-row--high-risk' : ''}`}
                    >
                    <td>
                      <span className={`fg-inv-batch-id ${isHighRisk ? 'is-red' : ''}`}>
                        {b.id}
                      </span>
                    </td>
                    <td>
                      <div className="fg-table-product">
                        <img
                          src={b.image}
                          alt={b.product}
                          className="fg-product-thumb"
                          loading="lazy"
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                        <div>
                          <div className="fg-product-name">{b.product}</div>
                          <div className="fg-product-cat">{b.category}</div>
                        </div>
                      </div>
                    </td>

                    {/* Stacked Column 1: Harga (Modal / Jual) */}
                    <td>
                      <div className="fg-inv-stacked-cell">
                        <span className="fg-inv-price fg-inv-cost-price" title="Harga Modal">
                          {b.costPrice || 'RM 6.00/kg'}
                        </span>
                        <span className="fg-inv-price-slash">/</span>
                        <span className="fg-inv-price fg-inv-sell-price" title="Harga Jual">
                          {b.sellPrice || 'RM 7.50/kg'}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className={`fg-inv-qty ${isHighRisk ? 'is-red' : ''}`}>{b.qty}</span>
                    </td>

                    {/* Stacked Column 2: Jadwal (Masuk → Expired) */}
                    <td>
                      <div className="fg-inv-stacked-cell fg-inv-stacked-cell--date">
                        <span className="fg-inv-date fg-inv-date--in" title="Tanggal Masuk">{b.dateIn}</span>
                        <span className="fg-inv-date-flow">→</span>
                        <span className={`fg-inv-date fg-inv-date--exp ${isHighRisk ? 'is-red' : ''}`} title="Tanggal Expired">{b.expiryDate}</span>
                      </div>
                    </td>

                    <td>
                      <span className={`fg-inv-dte ${isHighRisk ? 'is-red' : ''}`}>
                        {b.dte}
                      </span>
                    </td>
                    <td>
                      <span className={`fg-inv-risk-badge fg-inv-risk-badge--${b.riskType}`}>
                        {b.risk}
                      </span>
                    </td>

                    {/* Action Decision Pop-up Trigger with appliedAction stamp */}
                    <td>
                      {renderActionButton(b, false)}
                    </td>

                    {/* Three-Dots Menu (Edit & Delete Batch) */}
                    <td onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
                      <div className="fg-inv-dots-menu-wrap">
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
              <div className="fg-inv-empty-title">Tidak ada batch yang cocok</div>
              <p className="fg-inv-empty-desc">Coba sesuaikan kata kunci pencarian atau filter risiko.</p>
              <button
                type="button"
                className="fg-inv-btn-outline"
                style={{ margin: '0.6rem auto', display: 'inline-flex' }}
                onClick={handleResetFilters}
              >
                Reset Semua Filter
              </button>
            </div>
          ) : (
            filteredBatches.map(b => {
              const isHighRisk = b.riskType === 'high'
              const isMenuOpen = activeMenuBatchId === b.id

              return (
                <div
                  key={`mob-${b.id}`}
                  className={`fg-mobile-activity-card fg-inv-mobile-card fg-inv-mob-card ${isHighRisk ? 'fg-inv-mob-card--high' : ''}`}
                >
                <div className="fg-mobile-card__top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <img
                      src={b.image}
                      alt={b.product}
                      className="fg-product-thumb fg-product-thumb--mobile"
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
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
                    <div className="fg-inv-dots-menu-wrap" onClick={(e) => e.stopPropagation()}>
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
                    <span className="fg-inv-mob-label">Harga (Modal / Jual)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="fg-inv-price fg-inv-cost-price">{b.costPrice || 'RM 6.00'}</span>
                      <span style={{ color: '#94a3b8' }}>/</span>
                      <span className="fg-inv-price fg-inv-sell-price">{b.sellPrice || 'RM 7.50'}</span>
                    </div>
                  </div>
                  <div>
                    <span className="fg-inv-mob-label">Qty & Sisa DTE</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`fg-inv-qty ${isHighRisk ? 'is-red' : ''}`}>{b.qty}</span>
                      <span style={{ color: '#94a3b8' }}>•</span>
                      <span className={`fg-inv-dte ${isHighRisk ? 'is-red' : ''}`}>{b.dte}</span>
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span className="fg-inv-mob-label">Jadwal (Masuk → Expired)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="fg-inv-date">{b.dateIn}</span>
                      <span style={{ color: '#94a3b8' }}>→</span>
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
                  <h2 id="action-decision-title" className="fg-inv-card-title">Tentukan Tindakan Stok</h2>
                  <span className="fg-inv-modal-subtitle">Prioritas rotasi FEFO & mitigasi risiko pembusukan</span>
                </div>
              </div>

              <div className="fg-inv-modal-head-right">
                <button
                  type="button"
                  className="fg-inv-modal-close"
                  onClick={() => setSelectedBatchForAction(null)}
                  aria-label="Tutup Pop-up"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Selected Batch Summary Banner */}
            <div className="fg-inv-decision-banner">
              <img
                src={selectedBatchForAction.image}
                alt={selectedBatchForAction.product}
                className="fg-inv-decision-img"
                loading="lazy"
              />
              <div className="fg-inv-decision-info">
                <h3 className="fg-inv-decision-title">
                  Batch {selectedBatchForAction.id} — {selectedBatchForAction.product}
                </h3>
                <div className="fg-inv-decision-meta">
                  <span className={`fg-inv-decision-badge fg-inv-decision-badge--${selectedBatchForAction.riskType}`}>
                    <span className="fg-inv-decision-dot"></span>
                    {selectedBatchForAction.risk}
                  </span>
                  <span className="fg-inv-meta-sep">•</span>
                  <span className="fg-inv-meta-item">Modal: {selectedBatchForAction.costPrice || selectedBatchForAction.price || 'RM 6.50/kg'}</span>
                  <span className="fg-inv-meta-sep">•</span>
                  <span className="fg-inv-meta-item">Jual: {selectedBatchForAction.sellPrice || 'RM 8.00/kg'}</span>
                  <span className="fg-inv-meta-sep">•</span>
                  <span className="fg-inv-meta-item">Stok: {selectedBatchForAction.qty}</span>
                  <span className="fg-inv-meta-sep">•</span>
                  <span className="fg-inv-meta-item">Kedaluwarsa: {selectedBatchForAction.expiryDate}</span>
                  <span className="fg-inv-meta-sep">•</span>
                  <span className="fg-inv-meta-item" style={{ fontWeight: 700, color: selectedBatchForAction.dteNum <= 2 ? '#dc2626' : '#2c4737' }}>
                    DTE: {selectedBatchForAction.dte}
                  </span>
                </div>
              </div>
            </div>

            {/* 3 Action Options Grid */}
            <div className="fg-inv-action-grid">
              {/* Card 1: Normal Sale */}
              <div className="fg-inv-action-card fg-inv-action-card--normal">
                <div className="fg-inv-action-mascot">
                  <img src="/image/decision/normal_sale.png" alt="Normal Sale mascot" className="fg-inv-action-mascot-img" />
                </div>
                <h4 className="fg-inv-action-title">Normal Sale</h4>
                <p className="fg-inv-action-desc">
                  Stock still healthy. Sell at regular price.
                </p>
                <button
                  type="button"
                  className="fg-inv-action-btn fg-inv-action-btn--green"
                  onClick={() => handleApplyAction('normal')}
                >
                  <span>Apply Action</span>
                  <span className="fg-inv-btn-arrow">→</span>
                </button>
              </div>

              {/* Card 2: Dynamic Markdown */}
              <div className="fg-inv-action-card fg-inv-action-card--markdown">
                <div className="fg-inv-action-mascot">
                  <img src="/image/decision/dynamic.png" alt="Dynamic Markdown mascot" className="fg-inv-action-mascot-img" />
                </div>
                <h4 className="fg-inv-action-title">Dynamic Markdown</h4>
                <p className="fg-inv-action-desc">
                  Offer discount to accelerate sales.
                </p>
                <button
                  type="button"
                  className="fg-inv-action-btn fg-inv-action-btn--amber"
                  onClick={() => handleApplyAction('markdown')}
                >
                  <span>Apply Action</span>
                  <span className="fg-inv-btn-arrow">→</span>
                </button>
              </div>

              {/* Card 3: Donate to Food Bank */}
              <div className="fg-inv-action-card fg-inv-action-card--donate">
                <div className="fg-inv-action-mascot">
                  <img src="/image/decision/donate.png" alt="Donate mascot" className="fg-inv-action-mascot-img" />
                </div>
                <h4 className="fg-inv-action-title">Donate to Food Bank</h4>
                <p className="fg-inv-action-desc">
                  Help reduce food waste by donating.
                </p>
                <button
                  type="button"
                  className="fg-inv-action-btn fg-inv-action-btn--red"
                  onClick={() => handleApplyAction('donate')}
                >
                  <span>Arrange Donation</span>
                  <span className="fg-inv-btn-arrow">→</span>
                </button>
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
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="fg-inv-modal-form">
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
                  <label>Category</label>
                  <select
                    value={editBatch.category}
                    onChange={(e) => setEditBatch({ ...editBatch, category: e.target.value })}
                  >
                    <option value="Vegetables">Vegetables</option>
                    <option value="Dairy">Dairy</option>
                    <option value="Bakery">Bakery</option>
                    <option value="Meat & Poultry">Meat & Poultry</option>
                    <option value="Fruit">Fruit</option>
                  </select>
                </div>
                <div className="fg-inv-form-field">
                  <label>Harga Modal (Cost Price)</label>
                  <input
                    type="text"
                    value={editBatch.costPrice || ''}
                    placeholder="e.g. RM 6.50/kg"
                    onChange={(e) => setEditBatch({ ...editBatch, costPrice: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Harga Jual (Sell Price)</label>
                  <input
                    type="text"
                    value={editBatch.sellPrice || ''}
                    placeholder="e.g. RM 8.00/kg"
                    onChange={(e) => setEditBatch({ ...editBatch, sellPrice: e.target.value })}
                    required
                  />
                </div>
                <div className="fg-inv-form-field">
                  <label>Quantity</label>
                  <input
                    type="text"
                    value={editBatch.qty}
                    onChange={(e) => setEditBatch({ ...editBatch, qty: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="fg-inv-form-field">
                <label>Expiry Date (Tanggal Expired)</label>
                <input
                  type="date"
                  value={toInputDate(editBatch.expiryDate)}
                  onChange={(e) => handleEditExpiryChange(fromInputDate(e.target.value))}
                  required
                />
              </div>

              {/* DTE (Days to Expiry) - AUTOMATIC SYSTEM VALUE, READ ONLY */}
              <div className="fg-inv-form-field">
                <label>Days to Expiry (DTE) & Risk</label>
                <div className="fg-inv-dte-readonly-box">
                  <span className={`fg-inv-dte ${editBatch.dteNum <= 2 ? 'is-red' : ''}`}>
                    {editBatch.dte}
                  </span>
                  <span className={`fg-inv-risk-badge fg-inv-risk-badge--${editBatch.riskType}`} style={{ marginLeft: 8 }}>
                    {editBatch.risk}
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
              <h3>Tambah Batch Inventori Baru</h3>
              <button
                type="button"
                className="fg-inv-modal-close"
                onClick={() => setShowAddModal(false)}
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
            <p className="fg-inv-modal-desc">
              Daftarkan batch inventori masuk dengan harga modal, harga jual, dan tanggal kedaluwarsa untuk rotasi FEFO otomatis.
            </p>
            <form onSubmit={handleAddBatchSubmit} className="fg-inv-modal-form">
              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Batch ID</label>
                  <input
                    type="text"
                    value={`B-10${52 + batches.length}`}
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
                    <option value="Vegetables">Vegetables</option>
                    <option value="Dairy">Dairy</option>
                    <option value="Bakery">Bakery</option>
                    <option value="Meat & Poultry">Meat & Poultry</option>
                    <option value="Fruit">Fruit</option>
                  </select>
                </div>
              </div>

              <div className="fg-inv-form-field">
                <label>Product Name</label>
                <input
                  type="text"
                  placeholder="e.g. Roma Vine Tomatoes"
                  value={newBatchForm.product}
                  onChange={(e) => setNewBatchForm({ ...newBatchForm, product: e.target.value })}
                  required
                />
              </div>

              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Harga Modal (Cost Price)</label>
                  <input
                    type="text"
                    placeholder="e.g. RM 8.50/kg"
                    value={newBatchForm.costPrice}
                    onChange={(e) => setNewBatchForm({ ...newBatchForm, costPrice: e.target.value })}
                    required
                  />
                </div>
                <div className="fg-inv-form-field">
                  <label>Harga Jual (Sell Price)</label>
                  <input
                    type="text"
                    placeholder="e.g. RM 10.00/kg"
                    value={newBatchForm.sellPrice}
                    onChange={(e) => setNewBatchForm({ ...newBatchForm, sellPrice: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Quantity</label>
                  <input
                    type="text"
                    placeholder="e.g. 18 kg or 30 pack"
                    value={newBatchForm.qty}
                    onChange={(e) => setNewBatchForm({ ...newBatchForm, qty: e.target.value })}
                    required
                  />
                </div>
                <div className="fg-inv-form-field">
                  <label>Date In (Tanggal Masuk)</label>
                  <input
                    type="date"
                    value={toInputDate(newBatchForm.dateIn)}
                    onChange={(e) => setNewBatchForm({ ...newBatchForm, dateIn: fromInputDate(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Expiry Date (Tanggal Expired)</label>
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
                <label>Days to Expiry (DTE) & Risk</label>
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
                  Save & Prioritize
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
                Hapus Batch {batchToDelete.id}?
              </h3>
              <p className="fg-inv-delete-desc">
                Anda akan menghapus <strong>{batchToDelete.product}</strong> ({batchToDelete.qty}) dari daftar rotasi FEFO. Tindakan ini tidak dapat dibatalkan.
              </p>
              <div className="fg-inv-delete-actions">
                <button
                  type="button"
                  className="fg-inv-btn-outline"
                  onClick={() => setBatchToDelete(null)}
                >
                  Batal
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
                  Ya, Hapus Batch
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
