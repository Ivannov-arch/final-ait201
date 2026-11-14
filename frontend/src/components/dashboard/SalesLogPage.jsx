import initialSalesData from '../../data/unifiedSalesLog.json'
import { useState, useMemo, useRef, useEffect } from 'react'
import gsap from 'gsap'
import DashboardHeader from './DashboardHeader'

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
      duration: 1.1,
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

// Seed data: shown on first load until /api/transactions responds
const INITIAL_SALES = initialSalesData

function parseNum(str) {
  if (!str) return 0
  const m = String(str).match(/[\d.]+/)
  return m ? parseFloat(m[0]) : 0
}

function parseUnit(str) {
  if (!str) return 'kg'
  const m = String(str).match(/[a-zA-Z]+/)
  return m ? m[0] : 'kg'
}

function getNextTxnId(salesList) {
  const maxNum = (salesList || []).reduce((max, s) => {
    const m = String(s.id || '').match(/TXN-(\d+)/)
    return m ? Math.max(max, parseInt(m[1], 10)) : max
  }, 1024)
  return `TXN-${maxNum + 1}`
}

export default function SalesLogPage({
  batches = [],
  onUpdateBatches,
  onSaleRecorded,
  onToggleSidebar
}) {
  const [sales, setSales] = useState(INITIAL_SALES)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUnitFilter, setSelectedUnitFilter] = useState('all')
  const [showPOSModal, setShowPOSModal] = useState(false)
  const [editingSale, setEditingSale] = useState(null)
  const [toastMessage, setToastMessage] = useState(null)

  // Load transactions from /api/transactions (transactions.json) on mount
  useEffect(() => {
    fetch('/api/transactions')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) setSales(data)
      })
      .catch(() => {})
  }, [])

  const kpiContainerRef = useRef(null)
  const tableContainerRef = useRef(null)
  const posModalRef = useRef(null)
  const editModalRef = useRef(null)
  const toastRef = useRef(null)

  // Staggered entrance for KPI cards
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.fg-kpi-card',
        { y: 16, opacity: 0, scale: 0.98 },
        { y: 0, opacity: 1, scale: 1, duration: 0.55, stagger: 0.08, ease: 'power3.out' }
      )
    }, kpiContainerRef)

    return () => ctx.revert()
  }, [])

  // POS Modal animation
  useEffect(() => {
    if (!showPOSModal) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.fg-inv-modal',
        { scale: 0.95, y: 14, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.3, ease: 'power3.out' }
      )
    }, posModalRef)

    return () => ctx.revert()
  }, [showPOSModal])

  // Edit Modal animation
  useEffect(() => {
    if (!editingSale) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.fg-inv-modal',
        { scale: 0.95, y: 14, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.3, ease: 'power3.out' }
      )
    }, editModalRef)

    return () => ctx.revert()
  }, [editingSale])

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

  // POS Form state
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [saleQty, setSaleQty] = useState(1)
  const [discount, setDiscount] = useState(0)
  const [payMethod, setPayMethod] = useState('Cash')
  const [note, setNote] = useState('')

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 4500)
  }

  // Active batches: only those with stock > 0 (connected to inventory_master)
  const activeBatches = batches.filter(b => {
    const qty = b.stockQty !== undefined ? Number(b.stockQty) : parseNum(b.qty)
    return qty > 0
  })

  // Find currently selected batch (from active stock only)
  const selectedBatch = activeBatches.find(b => b.id === selectedBatchId)
    || activeBatches[0]
    || null
  const unitPrice = selectedBatch ? parseNum(selectedBatch.sellPrice || selectedBatch.costPrice) : 0
  const unit = selectedBatch ? parseUnit(selectedBatch.qty) : 'kg'
  // maxQty uses live stockQty counter so it reflects actual remaining stock
  const maxQty = selectedBatch
    ? (selectedBatch.stockQty !== undefined ? Number(selectedBatch.stockQty) : parseNum(selectedBatch.qty))
    : 10
  const subtotal = unitPrice * saleQty
  const discountAmt = (subtotal * (discount / 100))
  const total = Math.max(0, subtotal - discountAmt)

  const handleUpdateStatus = (txnId, newStatus) => {
    setSales(prev => prev.map(s => {
      if (s.id !== txnId) return s
      return { ...s, status: newStatus }
    }))
    // Persist status change to backend
    fetch(`/api/transactions/${encodeURIComponent(txnId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    }).catch(() => {})

    const statusLabels = {
      paid: 'Paid (Lunas)',
      pending: 'Pending (Menunggu)',
      refunded: 'Refunded',
      void: 'Void'
    }
    showToast(`✓ Status for ${txnId} changed to "${statusLabels[newStatus] || newStatus}"`)
  }

  const handleSaveEditSale = (e) => {
    e.preventDefault()
    if (!editingSale) return

    const qty = Number(editingSale.qty) || 1
    const unitPrice = Number(editingSale.unitPrice) || 0
    const discount = Number(editingSale.discount) || 0
    const subtotal = qty * unitPrice
    const discountAmt = subtotal * (discount / 100)
    const total = Math.max(0, subtotal - discountAmt)

    const updated = {
      ...editingSale,
      qty,
      unitPrice,
      discount,
      subtotal,
      discountAmt,
      total
    }

    setSales(prev => prev.map(s => s.id === updated.id ? updated : s))
    // Persist edit to backend
    fetch(`/api/transactions/${encodeURIComponent(updated.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    }).catch(() => {})

    setEditingSale(null)
    showToast(`✓ Transaction ${updated.id} successfully updated!`)
  }

  const handleDeleteSale = (txnId) => {
    setSales(prev => prev.filter(s => s.id !== txnId))
    // Persist deletion to backend
    fetch(`/api/transactions/${encodeURIComponent(txnId)}`, {
      method: 'DELETE'
    }).catch(() => {})

    setEditingSale(null)
    showToast(`🗑 Transaction ${txnId} deleted`)
  }

  const handleOpenPOS = () => {
    // Default to first batch that still has stock in inventory_master
    const firstActive = batches.find(b => {
      const qty = b.stockQty !== undefined ? Number(b.stockQty) : parseNum(b.qty)
      return qty > 0
    })
    if (firstActive) {
      setSelectedBatchId(firstActive.id)
    }
    setSaleQty(1)
    setDiscount(0)
    setPayMethod('Cash')
    setNote('')
    setShowPOSModal(true)
  }

  const handleRecordSale = (e) => {
    e.preventDefault()
    if (!selectedBatch) return
    if (saleQty <= 0) {
      showToast('⚠️ Purchase quantity must be greater than 0')
      return
    }
    if (saleQty > maxQty) {
      showToast(`⚠️ Quantity exceeds available stock (${maxQty} ${unit} remaining)`)
      return
    }

    const now = new Date()
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const dateStr = now.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
    const txnId = getNextTxnId(sales)

    const newSale = {
      id: txnId,
      time: timeStr,
      date: dateStr,
      batchId: selectedBatch.id,
      product: selectedBatch.product,
      category: selectedBatch.category,
      image: selectedBatch.image || 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=160&auto=format&fit=crop&q=80',
      unitPrice,
      unit,
      qty: saleQty,
      discount,
      discountAmt,
      subtotal,
      total,
      payMethod,
      cashier: 'John Doe',
      status: 'paid'
    }

    // Add to sales list immediately
    setSales(prev => [newSale, ...prev])

    // Persist transaction to server immediately
    fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSale)
    }).catch(() => {})

    // Auto-update batch inventory quantity in React state
    if (onUpdateBatches) {
      onUpdateBatches(prev => {
        const next = prev.map(b => {
          if (b.id !== selectedBatch.id) return b
          const currentQty = b.stockQty !== undefined ? Number(b.stockQty) : parseNum(b.qty)
          const newQty = Math.max(0, currentQty - saleQty)
          return {
            ...b,
            stockQty: newQty,
            qty: `${newQty} ${unit}`
          }
        })
        return next
      })
    }

    // Pass up to Dashboard for live profit & activity stream update
    if (onSaleRecorded) {
      onSaleRecorded(newSale)
    }

    setShowPOSModal(false)
    showToast(`✓ Transaction ${txnId} saved! Stock for ${selectedBatch.product} reduced by ${saleQty} ${unit}`)
  }

  // Group volume by unit (e.g. { kg: { totalQty: 9, items: [...] }, pack: { totalQty: 8, items: [...] } })
  const unitBreakdown = useMemo(() => {
    const map = {}
    sales.filter(s => s.status === 'paid').forEach(s => {
      const u = (s.unit || 'kg').toLowerCase()
      if (!map[u]) {
        map[u] = { unit: u, totalQty: 0, items: [] }
      }
      map[u].totalQty += (Number(s.qty) || 0)
      if (!map[u].items.includes(s.product)) {
        map[u].items.push(s.product)
      }
    })
    return map
  }, [sales])

  const unitList = Object.keys(unitBreakdown)

  // Filter sales by unit and search term
  const filteredSales = useMemo(() => {
    let list = sales
    if (selectedUnitFilter !== 'all') {
      list = list.filter(s => (s.unit || 'kg').toLowerCase() === selectedUnitFilter.toLowerCase())
    }
    if (!searchTerm.trim()) return list
    const q = searchTerm.toLowerCase()
    return list.filter(s =>
      s.id.toLowerCase().includes(q) ||
      s.product.toLowerCase().includes(q) ||
      s.batchId.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.payMethod.toLowerCase().includes(q)
    )
  }, [sales, searchTerm, selectedUnitFilter])

  const totalRevenue = sales.filter(s => s.status === 'paid').reduce((sum, s) => sum + s.total, 0)
  const totalUnitsSold = sales.filter(s => s.status === 'paid').reduce((sum, s) => sum + (Number(s.qty) || 0), 0)
  const paidCount = sales.filter(s => s.status === 'paid').length
  const averageSaleValue = paidCount > 0 ? totalRevenue / paidCount : 0

  // Staggered entrance for table rows and mobile card items
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const container = tableContainerRef.current
    if (!container) return

    const ctx = gsap.context(() => {
      const tableRows = container.querySelectorAll('.fg-table tbody tr')
      if (tableRows.length) {
        gsap.fromTo(
          Array.from(tableRows),
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.32, stagger: 0.035, ease: 'power2.out' }
        )
      }
      const mobileCards = container.querySelectorAll('.fg-sales-mobile-card')
      if (mobileCards.length) {
        gsap.fromTo(
          Array.from(mobileCards),
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.32, stagger: 0.04, ease: 'power2.out' }
        )
      }
    }, container)

    return () => ctx.revert()
  }, [filteredSales.length, selectedUnitFilter])

  return (
    <div className="fg-inv-root">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fg-fefo-toast" role="alert" ref={toastRef}>
          <div className="fg-fefo-toast__icon">✓</div>
          <span className="fg-fefo-toast__msg">{toastMessage}</span>
          <button
            type="button"
            className="fg-fefo-toast__close"
            onClick={() => setToastMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Unified Action Header */}
      <DashboardHeader
        title="Sales Log"
        badgePulse={true}
        subtitle="Real-time cashier sales recording. Inventory stock and profit dashboard sync automatically."
        onToggleSidebar={onToggleSidebar}
        actions={
          <button
            type="button"
            className="fg-inv-btn-primary"
            onClick={handleOpenPOS}
            style={{ minHeight: '38px', padding: '0.45rem 1.15rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <span>+ Record Sale</span>
          </button>
        }
      />

      <div className="fg-kpi-grid" ref={kpiContainerRef}>
        <div className="fg-kpi-card">
          <div className="fg-kpi-card__header">
            <span className="fg-kpi-card__label">Total Revenue</span>
            <span className="fg-kpi-card__delta-tag fg-kpi-card__delta-tag--success">Paid</span>
          </div>
          <div className="fg-kpi-card__main">
            <span className="fg-kpi-card__value" style={{ color: '#147b43' }}>
              <AnimatedNumber value={totalRevenue} prefix="RM " decimals={2} />
            </span>
            <span className="fg-kpi-card__subtext">Cumulative sales from settled receipts</span>
          </div>
        </div>

        <div className="fg-kpi-card">
          <div className="fg-kpi-card__header">
            <span className="fg-kpi-card__label">Units Sold</span>
            <div className="fg-sales-unit-switcher">
              <button
                type="button"
                onClick={() => setSelectedUnitFilter('all')}
                className={selectedUnitFilter === 'all' ? 'is-active' : ''}
                title="Show all units"
              >
                All
              </button>
              {unitList.map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setSelectedUnitFilter(u)}
                  className={selectedUnitFilter === u ? 'is-active' : ''}
                  title={`Filter by ${u}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="fg-kpi-card__main">
            {selectedUnitFilter === 'all' ? (
              <>
                <span className="fg-kpi-card__value" style={{ color: '#1d4ed8' }}>
                  <AnimatedNumber value={totalUnitsSold} decimals={0} />{' '}
                  <small style={{ fontSize: '0.82rem', fontWeight: 600, color: '#688975' }}>
                    items
                  </small>
                </span>
                <div className="fg-sales-unit-summary">
                  {unitList.map(u => (
                    <span
                      key={u}
                      onClick={() => setSelectedUnitFilter(u)}
                      className="fg-sales-unit-pill"
                      title={`Click for ${u} breakdown`}
                    >
                      {unitBreakdown[u].totalQty} {u} →
                    </span>
                  ))}
                </div>
                <span className="fg-kpi-card__subtext" style={{ marginTop: '0.35rem' }}>
                  Unit detail for the current sales log
                </span>
              </>
            ) : (
              <>
                <span className="fg-kpi-card__value" style={{ color: '#1d4ed8' }}>
                  <AnimatedNumber value={unitBreakdown[selectedUnitFilter]?.totalQty || 0} decimals={0} />{' '}
                  <small style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1d4ed8' }}>
                    {selectedUnitFilter}
                  </small>
                </span>
                <div className="fg-sales-unit-summary fg-sales-unit-summary--selected">
                  <span className="fg-sales-unit-tag">
                    ✓ {unitBreakdown[selectedUnitFilter]?.items.length || 0} Products ({selectedUnitFilter})
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedUnitFilter('all')}
                    className="fg-sales-unit-reset"
                  >
                    Reset
                  </button>
                </div>
                <span className="fg-kpi-card__subtext" style={{ marginTop: '0.35rem' }}>
                  Products: {unitBreakdown[selectedUnitFilter]?.items.join(', ')}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="fg-kpi-card">
          <div className="fg-kpi-card__header">
            <span className="fg-kpi-card__label">Total Transactions</span>
            <span className="fg-kpi-card__delta-tag fg-kpi-card__delta-tag--neutral">{paidCount} Paid</span>
          </div>
          <div className="fg-kpi-card__main">
            <span className="fg-kpi-card__value">
              <AnimatedNumber value={sales.length} decimals={0} />{' '}
              <small style={{ fontSize: '0.85rem', fontWeight: 600, color: '#688975' }}>receipts</small>
            </span>
            <span className="fg-kpi-card__subtext">All recorded sales and clearance entries</span>
          </div>
        </div>
      </div>

      {/* Table Card (Identical Structure to Inventory & Recent Activities) */}
      <div className="fg-card fg-inv-section-card" ref={tableContainerRef}>
        <div className="fg-inv-card-head">
          <div className="fg-inv-card-title-group">
            <div className="fg-inv-icon-cube">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <h2 className="fg-inv-card-title">POS Clearance & Sales History</h2>
          </div>

          <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {selectedUnitFilter !== 'all' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#1d4ed8',
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '999px'
                }}
              >
                Unit: <strong>{selectedUnitFilter}</strong>
                <button
                  type="button"
                  onClick={() => setSelectedUnitFilter('all')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#1d4ed8',
                    cursor: 'pointer',
                    fontWeight: 800,
                    padding: '0 2px',
                    lineHeight: 1
                  }}
                  title="Clear unit filter"
                >
                  ✕
                </button>
              </span>
            )}
            <div className="fg-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search transaction or product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search transactions"
              />
              {searchTerm && (
                <button
                  type="button"
                  className="fg-search-clear"
                  onClick={() => setSearchTerm('')}
                >
                  ✕
                </button>
              )}
            </div>
            <span className="fg-inv-count-pill" style={{ marginLeft: 'auto' }}>{filteredSales.length} Transactions</span>
          </div>
        </div>

        {/* Desktop Multi-column Table View */}
        <div className="fg-table-container fg-desktop-table-view">
          <table className="fg-table">
            <thead>
              <tr>
                <th>TXN ID</th>
                <th>Time</th>
                <th>Product</th>
                <th>Batch LOT</th>
                <th>Qty Sold</th>
                <th>Selling Price</th>
                <th>Discount</th>
                <th>Total Paid</th>
                <th>Payment</th>
                <th>Status</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((s, idx) => (
                <tr key={`${s.id}-${idx}`}>
                  <td>
                    <span className="fg-batch-code">
                      {s.id}
                    </span>
                  </td>
                  <td className="fg-table-time">
                    <div>{s.time}</div>
                    <div className="fg-table-date-sub">{s.date}</div>
                  </td>
                  <td>
                    <div className="fg-table-product">
                      <div>
                        <div className="fg-product-name">{s.product}</div>
                        <div className="fg-product-cat">{s.category}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="fg-inv-batch-id">{s.batchId}</span>
                  </td>
                  <td className="fg-table-qty">
                    <strong>{s.qty}</strong> {s.unit}
                  </td>
                  <td>
                    <span className="fg-inv-price fg-inv-sell-price">RM {s.unitPrice.toFixed(2)}</span>
                  </td>
                  <td>
                    {s.discount > 0 ? (
                      <span className="fg-sales-discount">
                        {s.discount}% (-RM {s.discountAmt.toFixed(2)})
                      </span>
                    ) : (
                      <span style={{ color: '#a6c5b2' }}>—</span>
                    )}
                  </td>
                  <td>
                    <strong className="fg-sales-total">
                      RM {s.total.toFixed(2)}
                    </strong>
                  </td>
                  <td>
                    <span className="fg-sales-pay-method">
                      {s.payMethod}
                    </span>
                  </td>
                  <td>
                    <div className="fg-status-select-wrap">
                      <select
                        className={`fg-status-select fg-status-select--${s.status || 'paid'}`}
                        value={s.status || 'paid'}
                        onChange={(e) => handleUpdateStatus(s.id, e.target.value)}
                        aria-label={`Ubah status ${s.id}`}
                        title="Click to change transaction status"
                      >
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                        <option value="refunded">Refunded</option>
                        <option value="void">Void</option>
                      </select>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="fg-inv-btn-outline"
                      onClick={() => setEditingSale({ ...s })}
                      style={{
                        padding: '0.28rem 0.65rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        borderRadius: '8px'
                      }}
                      title="Edit this transaction"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                      <span>Edit</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View Card Feed */}
        <div className="fg-mobile-activity-list fg-sales-mobile-list" aria-label="Sales Log Mobile View">
          {filteredSales.map((s, idx) => (
            <div key={`m-${s.id}-${idx}`} className="fg-mobile-activity-card">
              <div className="fg-mobile-card__top">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div>
                    <div className="fg-inv-product-name" style={{ fontSize: '0.96rem' }}>{s.product}</div>
                    <div className="fg-inv-category">
                      {s.category} • <span className="fg-inv-batch-id">{s.batchId}</span>
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span className="fg-batch-code" style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem' }}>
                    {s.id}
                  </span>
                  <div style={{ fontSize: '0.72rem', color: '#8aaa96', marginTop: 2 }}>{s.time}</div>
                </div>
              </div>

              <div className="fg-inv-mob-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem 0.6rem' }}>
                <div>
                  <span className="fg-inv-mob-label">Qty</span>
                  <span className="fg-table-qty"><strong>{s.qty}</strong> {s.unit}</span>
                </div>
                <div>
                  <span className="fg-inv-mob-label">Price</span>
                  <span className="fg-inv-price fg-inv-sell-price">RM {s.unitPrice.toFixed(2)}</span>
                </div>
                <div>
                  <span className="fg-inv-mob-label">Total</span>
                  <strong style={{ color: '#1b9b55', fontSize: '0.95rem' }}>RM {s.total.toFixed(2)}</strong>
                </div>
              </div>

              <div className="fg-mobile-card__footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid #edf4f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#496354', fontWeight: 600 }}>{s.payMethod}</span>
                  <div className="fg-status-select-wrap">
                    <select
                      className={`fg-status-select fg-status-select--${s.status || 'paid'}`}
                      value={s.status || 'paid'}
                      onChange={(e) => handleUpdateStatus(s.id, e.target.value)}
                      aria-label={`Ubah status ${s.id}`}
                    >
                      <option value="paid">Paid</option>
                      <option value="pending">Pending</option>
                      <option value="refunded">Refunded</option>
                      <option value="void">Void</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  className="fg-inv-btn-outline"
                  onClick={() => setEditingSale({ ...s })}
                  style={{
                    padding: '0.28rem 0.65rem',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    borderRadius: '8px'
                  }}
                  title="Edit transaction"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                  <span>Edit</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* POS Modal: Catat Penjualan */}
      {showPOSModal && (
        <div className="fg-inv-modal-backdrop" ref={posModalRef} onClick={() => setShowPOSModal(false)}>
          <div className="fg-inv-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="fg-inv-modal-header">
              <h3>Record Sale (Cashier)</h3>
              <button
                type="button"
                className="fg-inv-modal-close"
                onClick={() => setShowPOSModal(false)}
              >
                ✕
              </button>
            </div>

            <p className="fg-inv-modal-desc">
              Select the product batch purchased. Batch stock is automatically deducted and the profit dashboard updates instantly.
            </p>

            <form onSubmit={handleRecordSale} className="fg-inv-modal-form">
              <div className="fg-inv-form-field">
                <label>Select Product Batch (Active Stock)</label>
                <select
                  value={selectedBatchId}
                  onChange={(e) => {
                    setSelectedBatchId(e.target.value)
                    setSaleQty(1)
                  }}
                  required
                >
                  {activeBatches.length === 0 && (
                    <option value="">— Tidak ada stok aktif —</option>
                  )}
                  {activeBatches.map(b => {
                    const stock = b.stockQty !== undefined ? Number(b.stockQty) : parseNum(b.qty)
                    return (
                      <option key={b.id} value={b.id}>
                        {b.id} — {b.product} ({stock} {parseUnit(b.qty)} tersisa · Jual: {b.sellPrice || b.costPrice})
                      </option>
                    )
                  })}
                </select>
              </div>

              {selectedBatch && (
                <div
                  style={{
                    background: '#f4f8f5',
                    border: '1px solid #daeee4',
                    borderRadius: '10px',
                    padding: '0.85rem 1rem',
                    marginBottom: '0.6rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85rem' }}>
                    <span style={{ color: '#6b8f78' }}>Product:</span>
                    <strong>{selectedBatch.product} ({selectedBatch.category})</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85rem' }}>
                    <span style={{ color: '#6b8f78' }}>Selling Price / Unit:</span>
                    <strong style={{ color: '#1b9b55' }}>RM {unitPrice.toFixed(2)} / {unit}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: '#6b8f78' }}>Available Stock:</span>
                    <strong>{selectedBatch.qty}</strong>
                  </div>
                </div>
              )}

              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Quantity ({unit})</label>
                  <input
                    type="number"
                    min="1"
                    max={maxQty > 0 ? maxQty : 999}
                    value={saleQty}
                    onChange={(e) => setSaleQty(Math.max(1, Number(e.target.value)))}
                    required
                  />
                </div>
                <div className="fg-inv-form-field">
                  <label>Promo Discount (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={discount}
                    onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                  />
                </div>
              </div>

              <div className="fg-inv-form-field">
                <label>Payment Method</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  <option value="Cash">Cash</option>
                  <option value="QR / e-Wallet">QR / DuitNow / TNG</option>
                  <option value="Card">Debit / Credit Card</option>
                </select>
              </div>

              {/* Total Summary */}
              <div
                style={{
                  background: '#eef8f2',
                  border: '1px solid #c7e6d4',
                  borderRadius: '10px',
                  padding: '0.85rem 1rem',
                  marginTop: '0.4rem',
                  marginBottom: '0.6rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#4d6957', marginBottom: 3 }}>
                  <span>Subtotal:</span>
                  <span>RM {subtotal.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#e07b3a', marginBottom: 3 }}>
                    <span>Discount ({discount}%):</span>
                    <span>- RM {discountAmt.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: 800, color: '#1b9b55', borderTop: '1px solid #c7e6d4', paddingTop: 6, marginTop: 4 }}>
                  <span>Total Payable:</span>
                  <span>RM {total.toFixed(2)}</span>
                </div>
              </div>

              <div className="fg-inv-modal-actions">
                <button
                  type="button"
                  className="fg-inv-btn-outline"
                  onClick={() => setShowPOSModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="fg-inv-btn-primary"
                >
                  ✓ Confirm Sale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal: Edit Cashier Transaction Details */}
      {editingSale && (
        <div className="fg-inv-modal-backdrop" ref={editModalRef} onClick={() => setEditingSale(null)}>
          <div className="fg-inv-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div className="fg-inv-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Edit Transaction {editingSale.id}</h3>
                <p style={{ fontSize: '0.8rem', color: '#6b8f78', margin: '3px 0 0' }}>
                  Correct product details, price, discount, or payment method if the cashier made an input error.
                </p>
              </div>
              <button
                type="button"
                className="fg-inv-modal-close"
                onClick={() => setEditingSale(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditSale} className="fg-inv-modal-form">
              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>TXN ID</label>
                  <input
                    type="text"
                    value={editingSale.id}
                    disabled
                    style={{ background: '#f4f8f5', color: '#496354', fontWeight: 700 }}
                  />
                </div>
                <div className="fg-inv-form-field">
                  <label>Batch LOT</label>
                  <input
                    type="text"
                    value={editingSale.batchId}
                    onChange={(e) => setEditingSale({ ...editingSale, batchId: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Nama Produk</label>
                  <input
                    type="text"
                    value={editingSale.product}
                    onChange={(e) => setEditingSale({ ...editingSale, product: e.target.value })}
                    required
                  />
                </div>
                <div className="fg-inv-form-field">
                  <label>Kategori</label>
                  <select
                    value={editingSale.category}
                    onChange={(e) => setEditingSale({ ...editingSale, category: e.target.value })}
                  >
                    <option value="Vegetables">Vegetables</option>
                    <option value="Dairy">Dairy</option>
                    <option value="Bakery">Bakery</option>
                    <option value="Meat & Poultry">Meat & Poultry</option>
                    <option value="Fruit">Fruit</option>
                  </select>
                </div>
              </div>

              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Qty Terjual</label>
                  <input
                    type="number"
                    min="1"
                    value={editingSale.qty}
                    onChange={(e) => setEditingSale({ ...editingSale, qty: Math.max(1, Number(e.target.value)) })}
                    required
                  />
                </div>
                <div className="fg-inv-form-field">
                  <label>Satuan (Unit)</label>
                  <input
                    type="text"
                    value={editingSale.unit}
                    onChange={(e) => setEditingSale({ ...editingSale, unit: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Selling Price / Unit (RM)</label>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={editingSale.unitPrice}
                    onChange={(e) => setEditingSale({ ...editingSale, unitPrice: Math.max(0, Number(e.target.value)) })}
                    required
                  />
                </div>
                <div className="fg-inv-form-field">
                  <label>Diskon (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editingSale.discount}
                    onChange={(e) => setEditingSale({ ...editingSale, discount: Math.min(100, Math.max(0, Number(e.target.value))) })}
                  />
                </div>
              </div>

              <div className="fg-inv-form-row">
                <div className="fg-inv-form-field">
                  <label>Metode Pembayaran</label>
                  <select
                    value={editingSale.payMethod}
                    onChange={(e) => setEditingSale({ ...editingSale, payMethod: e.target.value })}
                  >
                    <option value="Cash">Cash (Tunai)</option>
                    <option value="QR / e-Wallet">QR / DuitNow / TNG</option>
                    <option value="Card">Debit / Credit Card</option>
                  </select>
                </div>
                <div className="fg-inv-form-field">
                  <label>Status Pembayaran</label>
                  <select
                    value={editingSale.status}
                    onChange={(e) => setEditingSale({ ...editingSale, status: e.target.value })}
                  >
                    <option value="paid">Paid (Lunas)</option>
                    <option value="pending">Pending (Menunggu)</option>
                    <option value="refunded">Refunded (Retur)</option>
                    <option value="void">Void (Cancelled)</option>
                  </select>
                </div>
              </div>

              {/* Live Preview Perhitungan Ulang */}
              {(() => {
                const sub = (Number(editingSale.qty) || 0) * (Number(editingSale.unitPrice) || 0)
                const dAmt = sub * ((Number(editingSale.discount) || 0) / 100)
                const tot = Math.max(0, sub - dAmt)
                return (
                  <div
                    style={{
                      background: '#f4f8f5',
                      border: '1px solid #daeee4',
                      borderRadius: '10px',
                      padding: '0.8rem 1rem',
                      marginTop: '0.4rem',
                      marginBottom: '0.6rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', color: '#4d6957', marginBottom: 2 }}>
                      <span>Subtotal:</span>
                      <span>RM {sub.toFixed(2)}</span>
                    </div>
                    {editingSale.discount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', color: '#e07b3a', marginBottom: 2 }}>
                        <span>Potongan Diskon ({editingSale.discount}%):</span>
                        <span>- RM {dAmt.toFixed(2)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.02rem', fontWeight: 800, color: '#1b9b55', borderTop: '1px solid #daeee4', paddingTop: 6, marginTop: 4 }}>
                      <span>Total Bayar Baru:</span>
                      <span>RM {tot.toFixed(2)}</span>
                    </div>
                  </div>
                )
              })()}

              <div className="fg-inv-modal-actions" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.9rem' }}>
                <button
                  type="button"
                  className="fg-inv-btn-outline"
                  onClick={() => handleDeleteSale(editingSale.id)}
                  style={{ color: '#d94040', borderColor: '#f8c8c4' }}
                >
                  🗑 Delete Transaction
                </button>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="fg-inv-btn-outline"
                    onClick={() => setEditingSale(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="fg-inv-btn-primary"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
