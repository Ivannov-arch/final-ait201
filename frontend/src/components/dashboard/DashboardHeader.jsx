import { useState, useEffect, useRef } from 'react'

export default function DashboardHeader({
  title = 'Operations Dashboard',
  subtitle = 'Real-time inventory valuation, cashier profit, and food bank redistribution.',
  badge = null,
  badgePulse = false,
  onToggleSidebar,
  actions = null
}) {
  const [showNotificationToast, setShowNotificationToast] = useState(false)
  const notifyRef = useRef(null)

  // Close menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (notifyRef.current && !notifyRef.current.contains(e.target)) {
        setShowNotificationToast(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('touchstart', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('touchstart', handleOutsideClick)
    }
  }, [])

  return (
    <header className="fg-header">
      <div className="fg-header__titles">
        <div className="fg-header__title-row">
          {onToggleSidebar && (
            <button
              type="button"
              className="fg-header__mobile-menu-btn"
              onClick={onToggleSidebar}
              aria-label="Toggle Navigation Menu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
          <div className="fg-header__title-with-badge">
            <h1 className="fg-header__h1">{title}</h1>
            {badge && (
              <span className="fg-header__live-pill">
                {badgePulse && <span className="fg-header__pulse-dot"></span>}
                {badge}
              </span>
            )}
          </div>
        </div>
        {subtitle && (
          <p className="fg-header__subtitle">
            {subtitle}
          </p>
        )}
      </div>

      <div className="fg-header__controls">
        {/* Custom page-specific actions slot */}
        {actions && (
          <div className="fg-header__actions-slot">
            {actions}
          </div>
        )}



        {/* Global Notification Bell */}
        <div className="fg-header__notify-wrapper" ref={notifyRef}>
          <button
            type="button"
            className="fg-header__icon-btn"
            aria-label="View Operational Alerts"
            title="Operational Alerts"
            onClick={() => setShowNotificationToast(prev => !prev)}
          >
            <span className="fg-header__badge-dot"></span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </button>

          {showNotificationToast && (
            <div className="fg-header__toast-popover">
              <div className="fg-header__toast-head">
                <span className="fg-header__toast-title">Live Store Alerts</span>
                <button
                  type="button"
                  className="fg-header__toast-close"
                  onClick={() => setShowNotificationToast(false)}
                  aria-label="Close alerts"
                >
                  ✕
                </button>
              </div>
              <ul className="fg-header__toast-list">
                <li className="fg-header__toast-item is-priority">
                  <span className="fg-header__toast-bullet"></span>
                  <div>
                    <strong>Batch LOT-4821 (Lettuce)</strong> 30% markdown completed. 120 kg salvaged.
                    <span className="fg-header__toast-time">12 mins ago</span>
                  </div>
                </li>
                <li className="fg-header__toast-item">
                  <span className="fg-header__toast-bullet"></span>
                  <div>
                    <strong>Dairy intake shelf life</strong>: 80 kg fresh milk dispatched for charity food bank.
                    <span className="fg-header__toast-time">48 mins ago</span>
                  </div>
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Global User Profile Chip */}
        <div className="fg-header__user-chip" title="John Doe — Operations Lead">
          <div className="fg-inv-avatar-initials" style={{ width: 34, height: 34, fontSize: '0.82rem', borderRadius: '50%', background: '#1b9b55', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>JD</div>
          <div className="fg-header__user-details">
            <span className="fg-header__user-name">John Doe</span>
            <span className="fg-header__user-role">Operations Lead</span>
          </div>
        </div>
      </div>
    </header>
  )
}
