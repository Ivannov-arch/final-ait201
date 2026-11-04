import { useState, useMemo, useRef, useEffect } from 'react'
import gsap from 'gsap'
import { INITIAL_ACTIVITIES } from './activitiesData'

const CATEGORY_TABS = [
  { id: 'all', label: 'Semua Channel' },
  { id: 'sales', label: 'Sales (Penjualan)' },
  { id: 'foodbank', label: 'Food Bank (Donasi)' },
  { id: 'high-risk', label: 'At Risk' }
]

export default function RecentActivitiesTable({ activities = INITIAL_ACTIVITIES, onNavigateInventory }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  const normRisk = (tier = '') => {
    const t = tier.toLowerCase()
    if (t === 'high') return 'high'
    if (t === 'moderate' || t === 'mod') return 'moderate'
    if (t === 'expiring') return 'high'
    return 'low'
  }

  const filteredActivities = useMemo(() => {
    return activities.filter((row) => {
      const act = (row.action || '').toLowerCase()
      const stat = (row.status || '').toLowerCase()

      if (selectedCategory === 'sales') {
        const isSale = act.includes('sale') || act.includes('markdown') || stat === 'sold' || stat === 'completed'
        if (!isSale) return false
      }
      if (selectedCategory === 'foodbank') {
        const isFoodBank = act.includes('food bank') || stat === 'dispatched'
        if (!isFoodBank) return false
      }
      if (selectedCategory === 'high-risk') {
        if (row.riskTier !== 'High' && row.riskTier !== 'Expiring') return false
      }

      if (!searchTerm.trim()) return true
      const term = searchTerm.toLowerCase()
      return (
        row.product.toLowerCase().includes(term) ||
        row.batch.toLowerCase().includes(term) ||
        row.category.toLowerCase().includes(term) ||
        row.action.toLowerCase().includes(term)
      )
    })
  }, [activities, searchTerm, selectedCategory])

  const handleExportCSV = () => {
    const headers = ['Time', 'Batch', 'Product', 'Category', 'Action', 'Quantity', 'Risk Tier', 'Status']
    const rows = filteredActivities.map(a => [
      a.time,
      a.batch,
      `"${a.product}"`,
      a.category,
      `"${a.action}"`,
      a.quantity,
      a.riskTier,
      a.status
    ])

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `freshguard-clearance-log-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const tableRef = useRef(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.fg-table tbody tr',
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: 0.35,
          stagger: 0.04,
          ease: 'power2.out'
        }
      )
    }, tableRef)

    return () => ctx.revert()
  }, [filteredActivities.length, selectedCategory])

  const handleResetFilters = () => {
    setSearchTerm('')
    setSelectedCategory('all')
  }

  return (
    <div className="fg-card" ref={tableRef}>
      <div className="fg-card__header">
        <div>
          <h2 className="fg-card__title">Recent Activities</h2>
          <p className="fg-card__subtitle">Aktivitas transaksi penjualan kasir dan donasi food bank terbaru</p>
        </div>
        <div className="fg-table__header-actions">
          <button
            type="button"
            className="fg-export-btn"
            onClick={handleExportCSV}
            title="Export filtered records to CSV"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export CSV</span>
          </button>
          <span className="fg-card__badge">Live Stream</span>
        </div>
      </div>

      <div className="fg-activity-toolbar">
        <div className="fg-activity-tabs" role="tablist" aria-label="Activity Categories">
          {CATEGORY_TABS.map((tab) => {
            const count = tab.id === 'all'
              ? activities.length
              : tab.id === 'sales'
              ? activities.filter(a => (a.action || '').toLowerCase().includes('sale') || (a.action || '').toLowerCase().includes('markdown') || (a.status || '').toLowerCase() === 'sold' || (a.status || '').toLowerCase() === 'completed').length
              : tab.id === 'foodbank'
              ? activities.filter(a => (a.action || '').toLowerCase().includes('food bank') || (a.status || '').toLowerCase() === 'dispatched').length
              : activities.filter(a => a.riskTier === 'High' || a.riskTier === 'Expiring').length

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selectedCategory === tab.id}
                aria-controls="activity-table-panel"
                className={`fg-activity-tab ${selectedCategory === tab.id ? 'is-active' : ''}`}
                onClick={() => setSelectedCategory(tab.id)}
              >
                {tab.label}
                <span className="fg-activity-tab-count">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="fg-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Cari batch, produk, kategori..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search activities"
          />
          {(searchTerm || selectedCategory !== 'all') && (
            <button
              type="button"
              className="fg-search-clear"
              onClick={handleResetFilters}
              title="Reset all filters"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {filteredActivities.length === 0 ? (
        <div className="fg-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3 className="fg-empty-state__title">Tidak ada aktivitas yang sesuai</h3>
          <p className="fg-empty-state__desc">
            Coba ubah filter atau kata kunci pencarian Anda.
          </p>
          {(searchTerm || selectedCategory !== 'all') && (
            <button type="button" className="fg-btn-outline" onClick={handleResetFilters}>
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="fg-table-container fg-desktop-table-view">
            <table className="fg-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Batch</th>
                  <th>Product</th>
                  <th>Channel Action</th>
                  <th>Quantity</th>
                  <th>Risk Tier</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivities.map((row, idx) => (
                  <tr
                    key={`${row.batch}-${row.time}-${idx}`}
                    className="fg-table-clickable-row"
                    onClick={() => onNavigateInventory && onNavigateInventory(row.batch)}
                    title={`Buka ${row.batch} di Inventory FEFO`}
                  >
                    <td className="fg-table-time">{row.time}</td>
                    <td>
                      <span className="fg-batch-code fg-batch-code--interactive">{row.batch} ↗</span>
                    </td>
                    <td>
                      <div className="fg-table-product">
                        <img
                          src={row.image}
                          alt={row.product}
                          className="fg-product-thumb"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                        <div>
                          <div className="fg-product-name">{row.product}</div>
                          <div className="fg-product-cat">{row.category}</div>
                        </div>
                      </div>
                    </td>
                    <td className="fg-table-action">{row.action}</td>
                    <td className="fg-table-qty">{row.quantity}</td>
                    <td>
                      <span className={`fg-risk-badge fg-risk-badge--${normRisk(row.riskTier)}`}>
                        {row.riskTier}
                      </span>
                    </td>
                    <td>
                      <span className={`fg-status-pill fg-status-pill--${row.statusType}`}>
                        <span className="fg-status-pill__dot"></span>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="fg-mobile-activity-list" aria-label="Recent Activities Mobile Feed">
            {filteredActivities.map((row, idx) => (
              <div
                key={`m-${row.batch}-${row.time}-${idx}`}
                className="fg-mobile-activity-card fg-mobile-activity-card--clickable"
                onClick={() => onNavigateInventory && onNavigateInventory(row.batch)}
                title={`Buka ${row.batch} di Inventory FEFO`}
              >
                <div className="fg-mobile-card__top">
                  <div className="fg-mobile-card__product-info">
                    <img
                      src={row.image}
                      alt={row.product}
                      className="fg-product-thumb fg-product-thumb--mobile"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                    <div>
                      <div className="fg-product-name fg-product-name--mobile">{row.product}</div>
                      <div className="fg-product-cat">{row.category} • <span className="fg-batch-code fg-batch-code--compact">{row.batch}</span></div>
                    </div>
                  </div>
                  <span className="fg-table-time">{row.time}</span>
                </div>

                <div className="fg-mobile-card__details">
                  <div className="fg-mobile-card__metric">
                    <span className="fg-mobile-card__lbl">Action</span>
                    <span className="fg-mobile-card__val fg-table-action">{row.action}</span>
                  </div>
                  <div className="fg-mobile-card__metric">
                    <span className="fg-mobile-card__lbl">Quantity</span>
                    <span className="fg-mobile-card__val fg-table-qty">{row.quantity}</span>
                  </div>
                </div>

                <div className="fg-mobile-card__footer">
                  <span className={`fg-risk-badge fg-risk-badge--${normRisk(row.riskTier)}`}>
                    Risk: {row.riskTier}
                  </span>
                  <span className={`fg-status-pill fg-status-pill--${row.statusType}`}>
                    <span className="fg-status-pill__dot"></span>
                    {row.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
