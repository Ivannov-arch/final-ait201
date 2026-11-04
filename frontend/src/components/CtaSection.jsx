export default function CtaSection({ onGetEarlyAccess }) {
  return (
    <div className="cta-section" id="cta">
      <div className="cta-banner reveal">
        <div>
          <h2 className="cta-banner__h2">See what your shop is losing.</h2>
          <p className="cta-banner__p">
            Get early access and a free 30-day spoilage audit for your store. No integration required to start.
          </p>
        </div>
        <div className="cta-banner__actions">
          <a
            className="btn btn--white btn--lg"
            href="#dashboard"
            onClick={onGetEarlyAccess}
          >
            Start Now
          </a>
          <a className="btn btn--ghost-white btn--lg" href="#how">See how it works</a>
        </div>
      </div>
    </div>
  )
}
