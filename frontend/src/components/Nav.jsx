import { useState } from 'react'

export default function Nav({ onGetEarlyAccess }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const toggleMenu = () => setMenuOpen(o => !o)
  const closeMenu = () => setMenuOpen(false)

  const handleEarlyAccess = (e) => {
    closeMenu()
    if (onGetEarlyAccess) {
      onGetEarlyAccess(e)
    }
  }

  return (
    <>
      <nav className="nav" aria-label="Main navigation">
        <a className="nav__logo" href="/">FreshGuard</a>
        <ul className="nav__links" role="list">
          <li><a href="#features">Features</a></li>
          <li><a href="#how">How it works</a></li>
          <li>
            <div className="nav__actions">
              <a className="nav__login" href="#dashboard" onClick={handleEarlyAccess}>Sign in</a>
              <a className="btn btn--primary" href="#dashboard" onClick={handleEarlyAccess}>Get early access</a>
            </div>
          </li>
        </ul>
        <button
          className="nav__hamburger"
          aria-label="Open menu"
          aria-expanded={String(menuOpen)}
          onClick={toggleMenu}
        >
          <span></span><span></span><span></span>
        </button>
      </nav>

      {/* Mobile menu overlay */}
      <div className={`nav__overlay${menuOpen ? ' is-visible' : ''}`} onClick={closeMenu}></div>
      <div className={`nav__mobile-menu${menuOpen ? ' is-open' : ''}`}>
        <button className="nav__mobile-close" onClick={closeMenu} aria-label="Close menu">✕</button>
        <div className="nav__mobile-links">
          <a href="#features" onClick={closeMenu}>Features</a>
          <a href="#how" onClick={closeMenu}>How it works</a>
        </div>
        <div className="nav__mobile-actions">
          <a className="nav__login" href="#dashboard" onClick={handleEarlyAccess}>Sign in</a>
          <a className="btn btn--primary" href="#dashboard" onClick={handleEarlyAccess}>Get early access</a>
        </div>
      </div>
    </>
  )
}
