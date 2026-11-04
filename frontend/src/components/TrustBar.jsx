const items = [
  'FEFO inventory ranking',
  'ML spoilage scoring (0–1)',
  '3–7 day demand forecasting',
  'Full sustainability audit trail',
  'Built for retailers worldwide',
  'Value recovery tracking',
]

export default function TrustBar() {
  const doubled = [...items, ...items]
  return (
    <div className="trust-bar" aria-hidden="true">
      <div className="trust-bar__track">
        {doubled.map((item, i) => (
          <span key={i}>• {item}</span>
        ))}
      </div>
    </div>
  )
}
