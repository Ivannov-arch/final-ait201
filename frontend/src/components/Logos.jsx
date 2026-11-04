export default function Logos() {
  const partners = ['SawitLover', 'Prawowo', 'PascaWowo']
  return (
    <div className="logos" aria-label="Used by grocery and F&B retailers">
      <span className="logos__label">
        <span className="logos__label-dot" aria-hidden="true"></span>
        Trusted by
      </span>
      <div className="logos__items">
        {partners.map(name => (
          <span key={name} className="logo-pill">
            <span className="logo-pill__dot"></span>{name}
          </span>
        ))}
      </div>
    </div>
  )
}
