export default function Footer() {
  return (
    <footer className="footer" aria-label="Site footer">
      <div className="footer__top">
        <div>
          <div className="footer__logo">FreshGuard</div>
          <p className="footer__desc">
            Inventory intelligence for grocery and F&amp;B retailers. Stop spoilage before it costs you.
          </p>
        </div>
        <div className="footer__col">
          <h3>Product</h3>
          <ul>
            <li><a href="#features">Features</a></li>
            <li><a href="#how">How it Works</a></li>
            <li><a href="#">Changelog</a></li>
          </ul>
        </div>
        <div className="footer__col">
          <h3>Company</h3>
          <ul>
            <li><a href="#">About</a></li>
            <li><a href="#">Blog</a></li>
            <li><a href="#">Careers</a></li>
            <li><a href="#">Press</a></li>
          </ul>
        </div>
        <div className="footer__col">
          <h3>Support</h3>
          <ul>
            <li><a href="#">Documentation</a></li>
            <li><a href="#">Contact</a></li>
            <li><a href="#">Privacy Policy</a></li>
            <li><a href="#">Terms</a></li>
          </ul>
        </div>
      </div>
      <div className="footer__bottom">
        <span>© 2026 FreshGuard. All rights reserved.</span>
      </div>
    </footer>
  )
}
