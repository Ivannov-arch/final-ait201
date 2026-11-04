import { useEffect, useRef } from 'react'

const cards = [
  {
    cls: 'bento__card--fefo',
    num: '01',
    badge: 'FEFO',
    title: 'Expiry-first inventory',
    body: 'Shelved by days to expiry, not arrival date. Oldest batches stay front-facing so nothing is forgotten at the back.',
    delay: 0,
    id: 'feat-fefo-title',
  },
  {
    cls: 'bento__card--predict',
    num: '02',
    badge: 'ML Risk Model',
    title: 'Spoilage risk prediction',
    body: 'Every batch scored 0 to 1 against velocity, weather, and shelf life to trigger markdowns days before spoilage.',
    delay: 0.08,
    id: 'feat-predict-title',
  },
  {
    cls: 'bento__card--forecast',
    num: '03',
    badge: '7-Day Projection',
    title: 'Demand forecasting',
    body: 'Sales projections matched against current stock so buyers can halt replenishment before surplus builds.',
    delay: 0.12,
    id: 'feat-forecast-title',
  },
  {
    cls: 'bento__card--dashboard',
    num: '04',
    badge: 'Telemetry',
    title: 'Operations dashboard',
    body: 'Track clearance speed, food salvaged, and value recovered with an automated audit trail for ESG reporting.',
    delay: 0.16,
    id: 'feat-dash-title',
  },
]

export default function Features() {
  const cardsRef = useRef(null)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !cardsRef.current) return

    const cardEls = cardsRef.current.querySelectorAll('.bento__card')
    const handlers = []

    cardEls.forEach(card => {
      let rafId = null
      function onMove(e) {
        if (rafId) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
          const rect = card.getBoundingClientRect()
          const x = e.clientX - rect.left
          const y = e.clientY - rect.top
          const cx = rect.width / 2
          const cy = rect.height / 2
          const rx = ((y - cy) / cy) * -4
          const ry = ((x - cx) / cx) * 4
          card.style.setProperty('--rx', rx.toFixed(2) + 'deg')
          card.style.setProperty('--ry', ry.toFixed(2) + 'deg')
          card.style.setProperty('--mx', Math.round(x) + 'px')
          card.style.setProperty('--my', Math.round(y) + 'px')
          card.style.setProperty('--ty', '-3px')
        })
      }
      function onLeave() {
        if (rafId) cancelAnimationFrame(rafId)
        card.style.setProperty('--rx', '0deg')
        card.style.setProperty('--ry', '0deg')
        card.style.setProperty('--ty', '0px')
      }
      card.addEventListener('mousemove', onMove, { passive: true })
      card.addEventListener('mouseleave', onLeave)
      handlers.push({ card, onMove, onLeave })
    })

    return () => {
      handlers.forEach(({ card, onMove, onLeave }) => {
        card.removeEventListener('mousemove', onMove)
        card.removeEventListener('mouseleave', onLeave)
      })
    }
  }, [])

  return (
    <section className="features" id="features" aria-labelledby="feat-h2">
      <div className="features__split">
        <div className="features__left reveal">
          <div className="features__intro">
            <h2 className="features__h2" id="feat-h2">
              Four systems. One<br />problem solved.
            </h2>
            <p className="features__sub">
              Automated inventory intelligence from dock to checkout. Stop food waste before it leaves the shelf.
            </p>
          </div>
          <div className="features__visual" aria-label="FreshGuard AI Assistant">
            <div className="features__visual-inner">
              <img
                src="/image/main/char2.png"
                alt="FreshGuard AI Assistant"
                className="features__visual-img"
                loading="lazy"
              />
            </div>
          </div>
        </div>

        <div ref={cardsRef} className="features__cards bento" role="list">
          {cards.map(card => (
            <article
              key={card.id}
              className={`bento__card ${card.cls} reveal`}
              role="listitem"
              aria-labelledby={card.id}
              style={card.delay ? { transitionDelay: `${card.delay}s` } : {}}
            >
              <div className="bento__card-head">
                <div className="bento__card-num">{card.num}</div>
                <span className="bento__card-badge">{card.badge}</span>
              </div>
              <h3 className="bento__card-title" id={card.id}>{card.title}</h3>
              <p className="bento__card-body">{card.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
