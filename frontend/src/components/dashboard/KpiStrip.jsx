import { useRef, useEffect } from 'react'
import gsap from 'gsap'

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

export default function KpiStrip({
  totalAssets = 0,
  profit = 0,
  activeBatchesCount = 5,
  onNavigateInventory
}) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.fg-kpi-card',
        { y: 16, opacity: 0, scale: 0.98 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.55,
          stagger: 0.08,
          ease: 'power3.out'
        }
      )
    }, containerRef)

    return () => ctx.revert()
  }, [])

  const isPositiveProfit = profit > 0
  const isNegativeProfit = profit < 0
  const profitDelta = isPositiveProfit
    ? `+RM ${profit.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : isNegativeProfit
    ? `-RM ${Math.abs(profit).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'RM 0.00'

  return (
    <div className="fg-kpi-grid" ref={containerRef}>
      {/* 1. Total Assets */}
      <div className="fg-kpi-card">
        <div className="fg-kpi-card__header">
          <span className="fg-kpi-card__label">Total Nilai Aset</span>
          <span className="fg-kpi-card__delta-tag fg-kpi-card__delta-tag--neutral">Active Stock</span>
        </div>
        <div className="fg-kpi-card__main">
          <span className="fg-kpi-card__value">
            <AnimatedNumber value={totalAssets} prefix="RM " decimals={2} />
          </span>
          <span className="fg-kpi-card__subtext">Nilai total inventori produk aktif saat ini</span>
        </div>
      </div>

      {/* 2. Profit */}
      <div className="fg-kpi-card">
        <div className="fg-kpi-card__header">
          <span className="fg-kpi-card__label">Profit Terealisasi</span>
          <span className={`fg-kpi-card__delta-tag fg-kpi-card__delta-tag--${isPositiveProfit ? 'success' : isNegativeProfit ? 'danger' : 'neutral'}`}>
            {profitDelta}
          </span>
        </div>
        <div className="fg-kpi-card__main">
          <span className="fg-kpi-card__value" style={{ color: isPositiveProfit ? '#147b43' : isNegativeProfit ? '#c53030' : undefined }}>
            <AnimatedNumber value={profit} prefix="RM " decimals={2} />
          </span>
          <span className="fg-kpi-card__subtext">Keuntungan bersih dari kasir & clearance POS</span>
        </div>
      </div>

      {/* 3. Active Batches */}
      <div
        className="fg-kpi-card is-clickable"
        onClick={onNavigateInventory}
        style={{ cursor: 'pointer' }}
        title="Buka Stock Inventory"
      >
        <div className="fg-kpi-card__header">
          <span className="fg-kpi-card__label">Batch Aktif (FEFO)</span>
          <span className="fg-kpi-card__delta-tag fg-kpi-card__delta-tag--info">100% Monitored</span>
        </div>
        <div className="fg-kpi-card__main">
          <span className="fg-kpi-card__value">
            <AnimatedNumber value={activeBatchesCount} suffix=" Lots" decimals={0} />
          </span>
          <span className="fg-kpi-card__subtext">Kelola stok di Stock Inventory →</span>
        </div>
      </div>
    </div>
  )
}
